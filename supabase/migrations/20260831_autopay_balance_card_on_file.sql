-- Card-on-file auto-collection of the 60% balance (phase 2 of the 40/60 split).
--
-- ALREADY APPLIED LIVE via Supabase MCP. Migration files are version control
-- only -- the installer does NOT apply DB or edge changes.
--
-- WHY: the "ghost client" -- deposit held, work finished and photographed, the
-- client never comes back to pay the 60%. Every payout guard then correctly
-- refuses to release, so the contractor waits indefinitely. run_reminders()
-- step 8 nudges (24h/3d/7d) and escalate_unpaid_balances() hands it to the
-- owner at 10 days; both are remedies for a problem this prevents.
--
-- MONEY: touches NONE of the four payout guards. confirm_job_completion()
-- still raises with the balance owed, auto_confirm_stale_jobs() still skips
-- under-funded jobs, release-payment still 409s on !fully_funded, and
-- reconcile-payouts still filters fully_funded. This adds a second WAY for the
-- balance to arrive and NO new receiving branch: the off-session charge is
-- tagged metadata.kind='balance', so the EXISTING stripe-webhook balance branch
-- does the funded_amount increment with its existing extra_charge_intent_ids
-- idempotency guard. Money collected is HELD, never released.

alter table public.jobs
  add column if not exists stripe_customer_id       text,
  add column if not exists stripe_payment_method_id text,
  -- Default true: the client opted in at checkout by paying a deposit on a job
  -- whose agreement states the balance is due on completion. The switch exists
  -- so they can say no, not so they have to say yes twice.
  add column if not exists autopay_balance          boolean not null default true,
  add column if not exists autopay_attempts         integer not null default 0,
  add column if not exists autopay_last_attempt_at  timestamptz,
  add column if not exists autopay_last_error       text;

-- Which jobs may be charged off-session. Every clause is a refusal, and the
-- default answer is no. Milestone and prepay jobs are excluded because their
-- money moves per stage / per pool and neither has a whole-job balance;
-- price_change_pending is excluded because charging a figure that is mid
-- negotiation is worse than charging nothing. Mirrors run_reminders() step 8.
create or replace function public.jobs_due_for_autopay(p_limit integer default 25)
returns table(job_id uuid, balance numeric)
language sql stable security definer
set search_path to 'public', 'extensions', 'pg_temp'
as $function$
  select j.id,
         round(j.total_charged - coalesce(j.funded_amount, 0), 2)
  from public.jobs j
  where j.payment_status = 'held'
    and not coalesce(j.fully_funded, false)
    and j.status in ('pending_confirmation', 'completed')
    and j.disputed_at is null
    and coalesce(j.is_milestone, false) = false
    and j.prepayment_id is null
    and j.price_change_pending is null
    and j.contractor_completed_at is not null
    and j.total_charged is not null
    and j.total_charged - coalesce(j.funded_amount, 0) > 0.005
    and j.autopay_balance = true
    and j.stripe_customer_id is not null
    and j.stripe_payment_method_id is not null
    and j.autopay_attempts < 3
    -- 2h grace so a pro who marks complete by mistake can undo it before a
    -- card is touched; 24h between attempts so three tries span three days.
    and j.contractor_completed_at < now() - interval '2 hours'
    and (j.autopay_last_attempt_at is null
         or j.autopay_last_attempt_at < now() - interval '24 hours')
  order by j.contractor_completed_at
  limit greatest(1, least(coalesce(p_limit, 25), 100))
$function$;

-- CLAIM BEFORE CHARGE. The edge function stamps the attempt BEFORE it calls
-- Stripe, so a crash mid-charge burns the attempt rather than re-charging on
-- the next sweep. Stripe caches ERRORS as well as successes for 24h under an
-- idempotency key, so the key is per-attempt: autopay_<job>_<attempt>.
create or replace function public.record_autopay_attempt(p_job_id uuid, p_error text default null)
returns void
language sql security definer
set search_path to 'public', 'extensions', 'pg_temp'
as $function$
  update public.jobs
     set autopay_attempts        = autopay_attempts + 1,
         autopay_last_attempt_at = now(),
         autopay_last_error      = p_error
   where id = p_job_id;
$function$;

-- DB -> edge. The anon bearer proves nothing, so this mints a single-use
-- 10-minute internal token; redeeming it is what proves the caller is Postgres.
create or replace function public.kick_collect_balances()
returns void
language plpgsql security definer
set search_path to 'public', 'extensions', 'pg_temp'
as $function$
declare
  v_url   text := coalesce(current_setting('app.supabase_url', true),
                           'https://kvypmjxbbaaknvddwwai.supabase.co')
                  || '/functions/v1/collect-balance-auto';
  v_token text;
begin
  begin
    v_token := public.issue_internal_token('edge-internal');
    perform net.http_post(
      url     := v_url,
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'x-ff-internal', coalesce(v_token, '')
      ),
      body    := jsonb_build_object('source', 'cron')
    );
  exception when others then
    raise warning 'collect-balance-auto enqueue failed: %', sqlerrm;
  end;
end;
$function$;

-- The client's own consent switch, and the ONLY caller-facing function here.
--
-- The owner check is written `auth.uid() is null or v_client <> auth.uid()`
-- deliberately. `v_client <> auth.uid()` alone is NULL when auth.uid() is NULL,
-- and a NULL if-condition does NOT fire -- so an unauthenticated caller fell
-- straight through the guard. Caught by a rolled-back probe, not by a failure.
-- The grants below meant nothing could actually reach it, but a guard that
-- depends on an ACL to be correct is one refactor away from being wrong.
create or replace function public.set_job_autopay(p_job_id uuid, p_on boolean)
returns boolean
language plpgsql security definer
set search_path to 'public', 'extensions', 'pg_temp'
as $function$
declare v_client uuid;
begin
  select client_id into v_client from public.jobs where id = p_job_id;
  if v_client is null then raise exception 'Job not found'; end if;
  if auth.uid() is null or v_client <> auth.uid() then
    raise exception 'Not authorized';
  end if;

  update public.jobs
     set autopay_balance = coalesce(p_on, false),
         -- Turning it back on clears a stale failure so the sweep retries.
         autopay_last_error = case when p_on then null else autopay_last_error end,
         autopay_attempts   = case when p_on then 0 else autopay_attempts end
   where id = p_job_id;
  return coalesce(p_on, false);
end
$function$;

-- The default function grant is to PUBLIC, so revoking from anon alone is a
-- no-op. The three sweep functions are internal only.
revoke all on function public.jobs_due_for_autopay(integer)          from public, anon, authenticated;
revoke all on function public.record_autopay_attempt(uuid, text)     from public, anon, authenticated;
revoke all on function public.kick_collect_balances()                from public, anon, authenticated;
revoke all on function public.set_job_autopay(uuid, boolean)         from public, anon;
grant execute on function public.jobs_due_for_autopay(integer)       to postgres, service_role;
grant execute on function public.record_autopay_attempt(uuid, text)  to postgres, service_role;
grant execute on function public.kick_collect_balances()             to postgres, service_role;
grant execute on function public.set_job_autopay(uuid, boolean)      to authenticated;

-- Hourly on :52 -- the other hourly sweeps sit on :07, :22, :37.
-- DELIBERATELY NOT in set_platform_mode()'s quiet list: a balance that is owed
-- is owed whether or not we are open, same call as the payout sweeps.
select cron.schedule('collect-balances', '52 * * * *', $cron$select public.kick_collect_balances();$cron$);
