-- A referral code invites ONE friend, then retires into a badge.
--
-- Applied LIVE via Supabase MCP on 2026-08-23. Committed here for version
-- control only — installers do not run migrations.
--
-- Until now nothing capped how many friends one person could refer. Being
-- REDEEMED was already one-time (profiles.referred_by is set once,
-- referrals.referred_id is UNIQUE, and the dashboard entry box hides itself),
-- but a single code could be handed to any number of people.
--
-- The hard part is that "one friend" has two bad failure modes, and they pull
-- against each other:
--
--   Block on any pending row  -> a stranger who applies your code and never
--                                books kills your code FOREVER. A trap.
--   Block only on a rewarded row -> several people hold a live waiver at once,
--                                so two people are each promised a discount and
--                                one of them silently doesn't get it.
--
-- Resolution, in three parts:
--
--   1. A pending referral blocks the code only while it is UNDER 30 DAYS OLD.
--      After that the code frees up on its own.
--   2. The old row is NOT expired or deleted. It stays 'pending', so the friend
--      who applied the code keeps the discount they were promised even if they
--      take months to book. Freeing the code must not quietly revoke a promise
--      we already made to a real customer.
--   3. Because (2) means two live waivers can briefly coexist, the REWARD is
--      capped separately from the waiver. consume_referral_waiver still waives
--      the fee for whoever books -- but if the referrer has already been
--      rewarded once, the row is closed as 'honored' instead of 'rewarded'.
--      The friend gets their money; the referrer gets exactly one badge.
--
-- So: at most one 'rewarded' row per referrer, ever, enforced by a partial
-- unique index as well as by the guard, because the guard runs inside
-- stripe-webhook after real money has landed and must never be the only thing
-- standing between us and a constraint error there.
--
-- referrals.status has no CHECK constraint, so 'honored' needs no DDL.
-- The table is empty (0 rows), so there is nothing to migrate.
--
-- MONEY: this touches NONE of the four payout guards. It cannot make a payout
-- happen or fail; it only decides whether client_fee is 0 on somebody's first
-- job, and it makes waivers rarer, never more common. platform_health_check
-- check 2 already tolerates a 0 fee, so tightening eligibility cannot turn it
-- red. Eligibility is still read at checkout and consumed in stripe-webhook,
-- and the two now agree in every case: consume returns true (fee waived as
-- charged) even when the reward itself is capped.

-- Structural invariant. The guard in consume_referral_waiver is what keeps
-- this index from ever actually firing.
create unique index if not exists referrals_one_reward_per_referrer
  on public.referrals (referrer_id) where status = 'rewarded';

-- Speeds up the two new EXISTS checks in apply_referral_code.
create index if not exists referrals_referrer_status_idx
  on public.referrals (referrer_id, status);


create or replace function public.apply_referral_code(p_code text)
 returns json
 language plpgsql
 security definer
 set search_path to 'public', 'extensions', 'pg_temp'
as $function$
DECLARE v_referrer uuid; v_already uuid;
BEGIN
  IF p_code IS NULL OR length(trim(p_code)) = 0 THEN RETURN json_build_object('ok',false,'reason','empty'); END IF;
  SELECT id INTO v_referrer FROM profiles WHERE referral_code = upper(trim(p_code));
  IF v_referrer IS NULL THEN RETURN json_build_object('ok',false,'reason','invalid'); END IF;
  IF v_referrer = auth.uid() THEN RETURN json_build_object('ok',false,'reason','self'); END IF;
  SELECT referred_by INTO v_already FROM profiles WHERE id = auth.uid();
  IF v_already IS NOT NULL THEN RETURN json_build_object('ok',false,'reason','already_referred'); END IF;

  -- One friend per referrer. Once a friend has actually paid, the code is done.
  IF EXISTS (SELECT 1 FROM referrals
              WHERE referrer_id = v_referrer AND status IN ('rewarded','honored')) THEN
    RETURN json_build_object('ok',false,'reason','code_retired');
  END IF;

  -- Someone already holds this invite. The 30-day window is what stops a
  -- stranger who never books from retiring the code permanently.
  IF EXISTS (SELECT 1 FROM referrals
              WHERE referrer_id = v_referrer AND status = 'pending'
                AND created_at > now() - interval '30 days') THEN
    RETURN json_build_object('ok',false,'reason','code_in_use');
  END IF;

  UPDATE profiles SET referred_by = v_referrer WHERE id = auth.uid();
  INSERT INTO referrals(referrer_id, referred_id, status)
    VALUES (v_referrer, auth.uid(), 'pending')
    ON CONFLICT (referred_id) DO NOTHING;
  RETURN json_build_object('ok',true);
END; $function$;


create or replace function public.consume_referral_waiver(p_client uuid, p_job_id uuid)
 returns boolean
 language plpgsql
 security definer
 set search_path to 'public', 'extensions', 'pg_temp'
as $function$
DECLARE v_ref record; v_prior int; v_already_rewarded boolean;
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

  UPDATE referrals
     SET status               = CASE WHEN v_already_rewarded THEN 'honored' ELSE 'rewarded' END,
         reward_applied_job_id = p_job_id,
         rewarded_at           = now()
   WHERE id = v_ref.id;
  RETURN true;
END; $function$;


create or replace function public.get_my_referral()
 returns json
 language sql
 security definer
 set search_path to 'public', 'extensions', 'pg_temp'
as $function$
  WITH r AS (
    SELECT
      count(*) FILTER (WHERE status = 'rewarded')                       AS rewarded,
      count(*)                                                          AS invited,
      max(rewarded_at) FILTER (WHERE status = 'rewarded')               AS rewarded_at,
      bool_or(status = 'pending'
              AND created_at > now() - interval '30 days')              AS holding
    FROM referrals WHERE referrer_id = auth.uid()
  )
  SELECT json_build_object(
    'code',           (SELECT referral_code FROM profiles WHERE id = auth.uid()),
    'invited',        (SELECT invited  FROM r),
    'rewarded',       (SELECT rewarded FROM r),
    'i_was_referred', (SELECT referred_by IS NOT NULL FROM profiles WHERE id = auth.uid()),
    -- The badge. Earned when the friend's first job is PAID, which is the
    -- pending -> rewarded flip stripe-webhook already performs, so it is not
    -- gameable by signing a friend up and never booking.
    'badge',          (SELECT rewarded > 0 FROM r),
    'rewarded_at',    (SELECT rewarded_at FROM r),
    -- 'retired' = badge earned, code is spent. 'in_use' = a friend is holding
    -- the invite and it frees up 30 days after they took it. 'active' = share it.
    'code_status',    (SELECT CASE WHEN rewarded > 0 THEN 'retired'
                                   WHEN holding      THEN 'in_use'
                                   ELSE 'active' END FROM r)
  );
$function$;

-- CREATE OR REPLACE preserves the ACL, but assert rather than assume.
-- Revoking from anon alone is a no-op: the default grant is to PUBLIC.
revoke all on function public.consume_referral_waiver(uuid, uuid) from public, anon, authenticated;
grant execute on function public.consume_referral_waiver(uuid, uuid) to postgres, service_role;
grant execute on function public.apply_referral_code(text) to authenticated;
grant execute on function public.get_my_referral() to authenticated;
