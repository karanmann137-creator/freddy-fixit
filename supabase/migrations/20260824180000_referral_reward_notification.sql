-- Close the referral reward loop with a notification + email.
--
-- Applied LIVE via Supabase MCP on 2026-08-24. Committed here for version
-- control only — installers do not run migrations.
--
-- consume_referral_waiver already decides, atomically, whether this friend's
-- payment is the referrer's ONE reward ('rewarded') or a second friend who
-- still gets the discount but earns the referrer nothing new ('honored').
-- Until now that decision was silent — the referrer's dashboard card would
-- eventually show the badge on its own next load, but nothing ever told them
-- it happened.
--
-- Notify only on the actual reward, never on 'honored': the referrer earns
-- their one badge once, and a notification about a second friend that grants
-- nothing new would over-promise. Fired via the existing _notify() primitive
-- (a bare insert into public.notifications) — the "send-notification-email"
-- Database Webhook already fans that out to bell + email for every insert
-- unless the type is in EMAIL_HANDLED_ELSEWHERE. 'referral_rewarded' has
-- exactly one emitter (this one), so it stays OUTSIDE that set and gets the
-- generic webhook email for free, no bespoke emailer needed. The webhook's
-- own trigger WHEN clause already honours outbound_paused(), so no extra
-- pause-gating belongs here either.
--
-- The notify call is wrapped in its own exception block: this function runs
-- inside stripe-webhook's payment-recording path, and a bell/email failure
-- must never roll back a referral status update after real money has landed
-- — the same "a notification must never block a real transaction" rule
-- CLAUDE.md documents for enqueue_admin_alert and the welcome emails.
--
-- MONEY: touches none of the four payout guards, and does not change what
-- consume_referral_waiver returns or when it waives a fee. It only adds a
-- best-effort side effect after the existing UPDATE.

create or replace function public.consume_referral_waiver(p_client uuid, p_job_id uuid)
 returns boolean
 language plpgsql
 security definer
 set search_path to 'public', 'extensions', 'pg_temp'
as $function$
DECLARE v_ref record; v_prior int; v_already_rewarded boolean; v_new_status text;
BEGIN
  SELECT * INTO v_ref FROM referrals WHERE referred_id = p_client AND status = 'pending';
  IF v_ref.id IS NULL THEN RETURN false; END IF;
  -- must be the client's first-ever paid job
  SELECT count(*) INTO v_prior FROM jobs
    WHERE client_id = p_client AND id <> p_job_id
      AND payment_status IN ('held','released');
  IF v_prior > 0 THEN RETURN false; END IF;

  -- The fee is waived either way -- this client was promised it and the money
  -- has already been charged on that basis, so refusing here would take a
  -- discount off someone who has paid. What is capped is the REWARD: a
  -- referrer earns the badge once, and a second friend closes as 'honored'.
  SELECT EXISTS (SELECT 1 FROM referrals
                  WHERE referrer_id = v_ref.referrer_id AND status = 'rewarded'
                    AND id <> v_ref.id)
    INTO v_already_rewarded;

  v_new_status := CASE WHEN v_already_rewarded THEN 'honored' ELSE 'rewarded' END;

  UPDATE referrals
     SET status                = v_new_status,
         reward_applied_job_id = p_job_id,
         rewarded_at           = now()
   WHERE id = v_ref.id;

  -- Tell the referrer they earned their one badge. Never for 'honored'.
  IF v_new_status = 'rewarded' THEN
    BEGIN
      PERFORM public._notify(
        v_ref.referrer_id, 'referral_rewarded',
        'Your referral paid off!',
        'A friend you referred just completed their first job. Your 3% referral badge is earned -- thanks for spreading the word.',
        NULL
      );
    EXCEPTION WHEN OTHERS THEN NULL; -- a notification must never block a real payment webhook
    END;
  END IF;

  RETURN true;
END; $function$;

-- CREATE OR REPLACE preserves the ACL, but assert rather than assume.
revoke all on function public.consume_referral_waiver(uuid, uuid) from public, anon, authenticated;
grant execute on function public.consume_referral_waiver(uuid, uuid) to postgres, service_role;
