-- Admin escalation for health check 5 (the ghost client), 2026-08-31.
-- APPLIED LIVE via Supabase MCP on 2026-08-31. This file is version control only.
--
-- Check 5 `no_unpaid_balances` could only ever report a COUNT: "N finished
-- job(s) with a balance unpaid for >3 days". No job code, no client, no amount,
-- no age -- nothing the owner could act on. run_reminders() step 8 now nudges
-- the client at 24h / 3d / 7d and then deliberately STOPS, so past 7 days
-- nothing happens on its own ever again: the contractor stays unpaid and the
-- only person who can break the deadlock has stopped responding to automation.
-- This is the human-escalation half.
--
-- MONEY: touches none of the four payout guards. It writes notification rows and
-- nothing else -- no charge, no transfer, no status change, no funded_amount.
-- confirm_job_completion(), auto_confirm_stale_jobs(), release-payment's 409 and
-- reconcile-payouts' fully_funded filter are all unchanged. It cannot make an
-- under-funded job payable; it tells a human to go and ask.

create or replace function public.escalate_unpaid_balances(p_days integer default 10)
returns text
language plpgsql
security definer
set search_path to 'public', 'extensions', 'pg_temp'
as $fn$
declare
  r       record;
  v_rows  int   := 0;
  v_ids   text[] := '{}';
  v_body  text  := '';
  v_key   text;
  v_gate  jsonb;
  v_admin uuid;
begin
  -- The predicate deliberately MIRRORS run_reminders() step 8, so the two halves
  -- of the ghost-client problem can never disagree about what "a balance is
  -- owed" means. Milestone and prepay jobs are excluded because their money
  -- moves per stage / per pool and neither has a whole-job balance to pay; a job
  -- with a pending price change is excluded because the figure is mid-negotiation.
  --
  -- p_days = 10 is three days AFTER step 8's final nudge. Escalating any earlier
  -- would just duplicate an email the client has already had; the point of this
  -- alert is "the automation is exhausted, a person is needed".
  for r in
    select j.id,
           round(j.total_charged - coalesce(j.funded_amount, 0), 2) as owed,
           coalesce(cr.service_needed, 'job') as service,
           coalesce(nullif(btrim(coalesce(p.first_name,'') || ' ' || coalesce(p.last_name,'')), ''),
                    '(no name on file)') as client_name,
           coalesce(nullif(btrim(p.email), ''), '(no email on file)') as client_email,
           coalesce(nullif(btrim(p.phone), ''), '(no phone on file)') as client_phone,
           coalesce(nullif(btrim(co.company_name), ''), 'their contractor') as pro,
           floor(extract(epoch from (now() - j.contractor_completed_at)) / 86400)::int as days
    from public.jobs j
    left join public.client_requests cr on cr.id = j.request_id
    left join public.profiles p         on p.id  = j.client_id
    left join public.contractors co     on co.id = j.contractor_id
    where j.payment_status = 'held'
      and not coalesce(j.fully_funded, false)
      and j.disputed_at is null
      and coalesce(j.is_milestone, false) = false
      and j.prepayment_id is null
      and j.price_change_pending is null
      and j.contractor_completed_at is not null
      and j.total_charged is not null
      and j.total_charged - coalesce(j.funded_amount, 0) > 0.005
      and j.contractor_completed_at < now() - make_interval(days => p_days)
    order by j.contractor_completed_at
  loop
    v_rows := v_rows + 1;
    v_ids  := v_ids || r.id::text;
    -- jobCode() in src/lib/jobCode.ts is FFX- + the first 5 hex of the uuid,
    -- uppercased. Matching it here is what lets the owner find the job on the
    -- admin Jobs tab from the email.
    v_body := v_body
      || 'FFX-' || upper(left(replace(r.id::text, '-', ''), 5)) || '  -  ' || r.service || E'\n'
      || '  $' || to_char(r.owed, 'FM999999990.00') || ' still owed, '
              || r.days || ' days since the work was finished.' || E'\n'
      || '  Client: ' || r.client_name || '  -  ' || r.client_email || '  -  ' || r.client_phone || E'\n'
      || '  Still waiting to be paid: ' || r.pro || E'\n\n';
  end loop;

  if v_rows = 0 then
    return 'none';
  end if;

  -- Throttled on the SET of job ids, not on a fixed key -- the same idiom as
  -- the profile nudge's `profile_nudge:<sorted gap keys>`. A NEW stuck job
  -- changes the key and gets through immediately; an unchanged list re-alerts at
  -- most once every 3 days instead of every single day forever, which is the
  -- ~96-emails-a-day failure alert_throttle_log was built for.
  -- alert_should_send() fails OPEN, so a throttle bug sends the email.
  v_key  := 'health5|unpaid_balance|'
            || md5(array_to_string(array(select unnest(v_ids) order by 1), ','));
  v_gate := public.alert_should_send(v_key, 4320);
  if not coalesce((v_gate->>'send')::boolean, true) then
    return 'throttled:' || v_rows;
  end if;

  for v_admin in select id from public.profiles where role = 'admin' loop
    -- Type MUST be 'health_alert'. The send-notification-email trigger's WHEN
    -- clause is `new.type = 'health_alert' OR NOT outbound_paused()`, so any
    -- other type would be silently un-emailed while the site is paused --
    -- exactly when the owner's only warning system needs to keep working.
    perform public._notify(
      v_admin,
      'health_alert',
      v_rows || ' finished job(s) the client never paid the balance on',
      'The work on these jobs is done and photographed and the deposit is held, but the client '
      || 'never came back to pay the rest. The automatic reminders to them have already run out '
      || '(24 hours, 3 days, 7 days), so nothing more will happen on its own - and the contractor '
      || 'is still waiting to be paid.' || E'\n\n'
      || 'Two ways out: call the client and walk them through paying the balance from their '
      || 'dashboard, or refund the deposit in Stripe and cancel the job.' || E'\n\n'
      || v_body
      || 'You will not get this again for 3 days unless the list changes.',
      null);
  end loop;

  return 'escalated:' || v_rows;
end
$fn$;

revoke all on function public.escalate_unpaid_balances(integer) from public, anon, authenticated;
grant execute on function public.escalate_unpaid_balances(integer) to postgres, service_role;

-- run_platform_health_check(): body unchanged apart from the escalation call.
-- Its search_path was 'public' alone -- missing both `extensions` and `pg_temp`,
-- which is the shape of the pgcrypto bug that killed every signup for a month.
create or replace function public.run_platform_health_check()
returns text
language plpgsql
security definer
set search_path to 'public', 'extensions', 'pg_temp'
as $fn$
declare
  v_fail  int;
  v_body  text;
  v_admin uuid;
  v_esc   text := 'skipped';
begin
  select count(*) filter (where not ok),
         string_agg(check_name || ': ' || detail, E'\n') filter (where not ok)
    into v_fail, v_body
  from platform_health_check();

  -- The generic alert runs FIRST, because it dedupes on "any health_alert row in
  -- the last 20 hours" and the escalation writes health_alert rows too. Running
  -- it second would let the escalation mute the very check that summoned it.
  if coalesce(v_fail, 0) > 0 then
    for v_admin in select id from profiles where role = 'admin' loop
      if not exists (
        select 1 from notifications
        where user_id = v_admin and type = 'health_alert'
          and created_at > now() - interval '20 hours'
      ) then
        perform _notify(
          v_admin, 'health_alert',
          'Platform health: ' || v_fail || ' check(s) failing',
          v_body, null);
      end if;
    end loop;
  end if;

  -- Deliberately OUTSIDE the `v_fail = 0` early return. A job old enough to
  -- escalate is necessarily old enough to have already reddened check 5, so this
  -- is belt-and-braces today -- but if either predicate is ever edited, the
  -- escalation must not go quiet because of an assumption made here.
  --
  -- Its own exception block: a fault in the escalation must never take down the
  -- health alert it sits beside. (The catch-all covers exactly one thing.)
  begin
    v_esc := public.escalate_unpaid_balances();
  exception when others then
    v_esc := 'error:' || sqlerrm;
    raise warning 'escalate_unpaid_balances failed: %', sqlerrm;
  end;

  if coalesce(v_fail, 0) = 0 then
    return 'ok; balance_escalation=' || v_esc;
  end if;
  return 'alerted:' || v_fail || '; balance_escalation=' || v_esc;
end
$fn$;

revoke all on function public.run_platform_health_check() from public, anon, authenticated;
grant execute on function public.run_platform_health_check() to postgres, service_role;
