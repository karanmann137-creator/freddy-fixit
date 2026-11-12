-- GENERATED from the live database on 2026-11-12. Do not edit by hand and do not apply.
-- This is a read-only reference so the repo can show what production runs.
-- The public anon key is replaced with <ANON_KEY>.
-- Regenerate after any DB change (see docs/infra-and-ops.md).

-- 240 functions in schema public

-- _accept_bid_internal(p_bid_id uuid)   grants: {postgres=X/postgres,service_role=X/postgres}
CREATE OR REPLACE FUNCTION public._accept_bid_internal(p_bid_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
DECLARE
  v_req uuid; v_contractor uuid; v_amount numeric; v_client uuid;
  v_status text; v_job uuid; v_service text; v_loc text; v_cname text;
  v_client_name text; r record;
BEGIN
  SELECT request_id, contractor_id, amount
    INTO v_req, v_contractor, v_amount FROM bids WHERE id = p_bid_id;
  IF v_req IS NULL THEN RAISE EXCEPTION 'Bid not found'; END IF;

  SELECT user_id, status, service_needed, location
    INTO v_client, v_status, v_service, v_loc FROM client_requests WHERE id = v_req;
  IF v_status <> 'pending' THEN RAISE EXCEPTION 'This request is already matched'; END IF;

  INSERT INTO jobs(request_id, contractor_id, client_id, status, amount)
    VALUES (v_req, v_contractor, v_client, 'assigned', v_amount) RETURNING id INTO v_job;
  UPDATE client_requests SET status = 'matched', assigned_contractor_id = v_contractor WHERE id = v_req;
  UPDATE bids SET status = CASE WHEN id = p_bid_id THEN 'accepted' ELSE 'declined' END WHERE request_id = v_req;

  SELECT TRIM(COALESCE(first_name,'')||' '||COALESCE(last_name,'')) INTO v_cname FROM profiles WHERE id = v_contractor;
  SELECT TRIM(COALESCE(first_name,'')||' '||COALESCE(last_name,'')) INTO v_client_name FROM profiles WHERE id = v_client;

  PERFORM public._notify(v_client, 'job_assigned', 'Contractor selected',
    COALESCE(NULLIF(v_cname,''),'A contractor')||' was selected for your '||COALESCE(v_service,'job')||'. They''ll propose a time next.', v_job);
  PERFORM public._notify(v_contractor, 'bid_accepted', 'Your bid was accepted!',
    'You won the job: '||COALESCE(v_service,'a job')||COALESCE(' at '||v_loc,'')||'. Propose a time and price to get started.', v_job);
  FOR r IN SELECT contractor_id FROM bids WHERE request_id = v_req AND id <> p_bid_id LOOP
    PERFORM public._notify(r.contractor_id, 'bid_declined', 'Job filled',
      'Another contractor was selected for '||COALESCE(v_service,'a job')||'.', NULL);
  END LOOP;

  PERFORM net.http_post(
    url     := 'https://kvypmjxbbaaknvddwwai.supabase.co/functions/v1/notify-accepted',
    headers := jsonb_build_object('Content-Type','application/json','x-ff-internal',coalesce(public.issue_internal_token('edge-internal'),'')),
    body    := jsonb_build_object(
      'event',          'bid_won',
      'contractor_id',  v_contractor,
      'service',        v_service,
      'location',       v_loc,
      'client_name',    COALESCE(NULLIF(v_client_name,''), 'The client'),
      'amount',         v_amount
    )
  );

  RETURN v_job;
END; $function$;

-- _notify(p_user uuid, p_type text, p_title text, p_body text, p_job uuid)   grants: {postgres=X/postgres,service_role=X/postgres}
CREATE OR REPLACE FUNCTION public._notify(p_user uuid, p_type text, p_title text, p_body text, p_job uuid)
 RETURNS void
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  insert into public.notifications(user_id, type, title, body, job_id)
  values (p_user, p_type, p_title, p_body, p_job);
$function$;

-- _repost_request_internal(p_request_id uuid)   grants: {postgres=X/postgres,service_role=X/postgres}
CREATE OR REPLACE FUNCTION public._repost_request_internal(p_request_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
declare
  v_status text;
  v_last   timestamptz;
  v_reach  int := 0;
  v_fired  boolean := false;
begin
  select status, coalesce(refire_last_at, created_at)
    into v_status, v_last
    from public.client_requests where id = p_request_id;
  if not found then
    return jsonb_build_object('reposted', false, 'refired', false, 'reach', 0);
  end if;
  if v_status is distinct from 'pending' then
    return jsonb_build_object('reposted', false, 'refired', false, 'reach', 0);
  end if;

  if v_last < now() - interval '20 hours' then
    begin
      v_reach := public.refire_request(p_request_id);
      v_fired := true;
    exception when others then
      -- A failed fan-out must not cost the client the repost itself.
      raise warning 'repost: refire_request failed for %: %', p_request_id, sqlerrm;
    end;
  end if;

  -- created_at is deliberately NOT touched: the raw post date survives every
  -- repost. refire_count goes back to 0 so the automatic two-re-fire budget is
  -- restored (refire_request just incremented it, hence the order).
  update public.client_requests
     set reposted_at  = now(),
         repost_count = repost_count + 1,
         refire_count = 0
   where id = p_request_id;

  return jsonb_build_object('reposted', true, 'refired', v_fired, 'reach', coalesce(v_reach, 0));
end $function$;

-- accept_bid(p_bid_id uuid)   grants: {postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres}
CREATE OR REPLACE FUNCTION public.accept_bid(p_bid_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
DECLARE
  v_req uuid; v_client uuid;
BEGIN
  SELECT request_id INTO v_req FROM bids WHERE id = p_bid_id;
  IF v_req IS NULL THEN RAISE EXCEPTION 'Bid not found'; END IF;
  SELECT user_id INTO v_client FROM client_requests WHERE id = v_req;

  IF auth.uid() IS NULL OR NOT (public.is_admin() OR v_client = auth.uid()) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  RETURN public._accept_bid_internal(p_bid_id);
END; $function$;

-- accept_bid_by_token(p_token uuid, p_bid_id uuid)   grants: {postgres=X/postgres,anon=X/postgres,authenticated=X/postgres,service_role=X/postgres}
CREATE OR REPLACE FUNCTION public.accept_bid_by_token(p_token uuid, p_bid_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
declare
  v_req uuid; v_bid_req uuid;
begin
  if p_token is null or p_bid_id is null then
    raise exception 'Invalid link';
  end if;

  select id into v_req from client_requests where pick_token = p_token;
  if v_req is null then raise exception 'Invalid link'; end if;

  -- The token authorizes THIS request only. A bid from another request must
  -- never be acceptable through it.
  select request_id into v_bid_req from bids where id = p_bid_id;
  if v_bid_req is null or v_bid_req <> v_req then
    raise exception 'That bid is not on this request';
  end if;

  return public._accept_bid_internal(p_bid_id);
end; $function$;

-- admin_action_allowed(p_user_id uuid)   grants: {postgres=X/postgres,service_role=X/postgres}
CREATE OR REPLACE FUNCTION public.admin_action_allowed(p_user_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
declare
  v_role text;
  v_mfa  record;
begin
  if p_user_id is null then
    return jsonb_build_object('ok', false, 'reason', 'Not signed in.');
  end if;

  select p.role into v_role from public.profiles p where p.id = p_user_id;
  if coalesce(v_role, '') <> 'admin' then
    return jsonb_build_object('ok', false, 'reason', 'Not authorized.');
  end if;

  select m.enabled, m.last_verified_at into v_mfa
    from public.user_mfa m where m.user_id = p_user_id;

  -- Same shape as mfa_ok(): nobody who never opted in is ever locked out.
  if v_mfa is null or not v_mfa.enabled
     or (v_mfa.last_verified_at is not null
         and v_mfa.last_verified_at > now() - interval '12 hours') then
    return jsonb_build_object('ok', true);
  end if;

  return jsonb_build_object(
    'ok', false,
    'reason', 'Verify your sign-in code first, then try again.');
end $function$;

-- admin_agent_overview()   grants: {postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres}
CREATE OR REPLACE FUNCTION public.admin_agent_overview()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
declare v jsonb;
begin
  if not public.is_admin() then return '{}'::jsonb; end if;

  select jsonb_build_object(
    'generated_at',  public.ff_local_ts(now()),
    'pending_total', (select count(*) from public.agent_actions where status = 'pending'),
    'expiring_soon', (select count(*) from public.agent_actions
                       where status = 'pending' and expires_at <= now() + interval '48 hours'),
    'agents', coalesce((
      select jsonb_agg(row_to_json(t) order by t.sort_key, t.label) from (
        select reg.agent,
               reg.label,
               reg.purpose,
               reg.enabled,
               reg.autonomy,
               reg.expected_every::text            as expected_every,
               -- Declared cost budget. `model` is the CEILING the agent may call,
               -- not the only model it may use.
               reg.model,
               reg.max_model_calls_per_run,
               reg.max_proposals_per_run,
               reg.max_pending,
               lr.started_at                       as last_run_at,
               public.ff_local_ts(lr.started_at)   as last_run_local,
               lr.status                           as last_run_status,
               lr.summary                          as last_run_summary,
               lr.error                            as last_run_error,
               coalesce(lr.model_calls, 0)         as last_run_model_calls,
               (lr.details ->> 'capped')           as last_run_capped,
               (select count(*) from public.agent_actions a
                 where a.agent = reg.agent and a.status = 'pending')      as pending,
               (select count(*) from public.agent_runs r2
                 where r2.agent = reg.agent
                   and r2.started_at > now() - interval '7 days')         as runs_7d,
               (select count(*) from public.agent_runs r3
                 where r3.agent = reg.agent and r3.status = 'error'
                   and r3.started_at > now() - interval '7 days')         as errors_7d,
               -- Budget breaches are MEASURED, not declared, and self-clearing:
               -- this can only be non-zero because a run actually overspent in
               -- the last 7 days. A permanently-red number is one the owner
               -- learns to scroll past.
               (select count(*) from public.agent_runs r4
                 where r4.agent = reg.agent
                   and r4.started_at > now() - interval '7 days'
                   and coalesce(r4.model_calls,0) > reg.max_model_calls_per_run) as budget_breach_7d,
               (select coalesce(sum(coalesce(r5.model_calls,0)), 0) from public.agent_runs r5
                 where r5.agent = reg.agent
                   and r5.started_at > now() - interval '7 days')         as model_calls_7d,
               -- Stale is measured against the agent's OWN declared cadence, with a 50%
               -- grace margin. A disabled agent, or one with no declared cadence, is
               -- never stale — that is what stops this going permanently red.
               case
                 when not reg.enabled            then false
                 when reg.expected_every is null then false
                 when lr.started_at is null      then true
                 when lr.started_at < now() - (reg.expected_every * 1.5) then true
                 else false
               end as stale,
               case when not reg.enabled        then 3
                    when lr.status = 'error'    then 0
                    when lr.started_at is null  then 1
                    else 2 end as sort_key
          from public.agent_registry reg
          left join lateral (
            select r.started_at, r.status, r.summary, r.error, r.model_calls, r.details
              from public.agent_runs r
             where r.agent = reg.agent
             order by r.started_at desc
             limit 1
          ) lr on true
      ) t
    ), '[]'::jsonb)
  ) into v;
  return v;
end;
$function$;

-- admin_anon_reachable_guards()   grants: {postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres}
CREATE OR REPLACE FUNCTION public.admin_anon_reachable_guards()
 RETURNS TABLE(fn text, args text, anon_execute boolean, public_grant boolean, guard_line text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
begin
  perform public.admin_guard();
  return query
  select p.proname::text,
         pg_catalog.pg_get_function_identity_arguments(p.oid),
         has_function_privilege('anon', p.oid, 'EXECUTE'),
         (p.proacl is null or (p.proacl)[1]::text like '=X/%'),
         -- The first line that compares against auth.uid(), for triage.
         (regexp_match(p.prosrc, '[^\n]*auth\.uid\(\)[^\n]*'))[1]
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.prosecdef                                   -- DEFINER removes RLS as the backstop
    and has_function_privilege('anon', p.oid, 'EXECUTE')
    and p.prosrc ~ 'auth\.uid\(\)'
    and p.prosrc !~ 'auth\.uid\(\)\s+is\s+(not\s+)?null'   -- no null test anywhere
    and p.prosrc ~ '(<>|!=|=)\s*auth\.uid\(\)|auth\.uid\(\)\s*(<>|!=|=)'
  order by p.proname;
end $function$;

-- admin_audit_tail(p_limit integer)   grants: {postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres}
CREATE OR REPLACE FUNCTION public.admin_audit_tail(p_limit integer DEFAULT 200)
 RETURNS TABLE(id bigint, at_local text, actor_email text, action text, target_table text, target_id text, detail jsonb, via text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
begin
  if not public.is_admin() then
    raise exception 'Not authorized';
  end if;
  return query
  select l.id,
         public.ff_local_ts(l.created_at),
         l.actor_email,
         l.action,
         l.target_table,
         l.target_id,
         l.detail,
         l.via
  from public.admin_audit_log l
  order by l.created_at desc, l.id desc
  limit greatest(1, least(coalesce(p_limit, 200), 1000));
end $function$;

-- admin_clear_mfa(p_user_id uuid)   grants: {postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres}
CREATE OR REPLACE FUNCTION public.admin_clear_mfa(p_user_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
begin
  perform public.admin_guard();

  if p_user_id is null then
    raise exception 'No account given.';
  end if;

  -- The bypass. Not negotiable: a session that can strip its own second factor
  -- does not have one.
  if p_user_id = auth.uid() then
    raise exception 'You cannot switch off your own two-step sign-in from here. Use one of your recovery codes, or turn it off in Settings after verifying.';
  end if;

  delete from public.user_mfa       where user_id = p_user_id;
  delete from public.mfa_challenges where user_id = p_user_id;

  perform public.log_admin_action(
    'admin_clear_mfa', 'user_mfa', p_user_id::text,
    jsonb_build_object('note', 'two-step sign-in cleared for this user'));

  return jsonb_build_object('ok', true);
end $function$;

-- admin_delete_job(p_job_id uuid, p_force boolean)   grants: {postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres}
CREATE OR REPLACE FUNCTION public.admin_delete_job(p_job_id uuid, p_force boolean DEFAULT false)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
declare
  v_block   text;
  v_request uuid;
  v_reset   int;
begin
  perform public.admin_guard();
  perform public.log_admin_action('admin_delete_job', 'jobs', p_job_id::text, jsonb_build_object('force', p_force));

  if not p_force then
    v_block := public.job_money_block(p_job_id);
    if v_block is not null then
      raise exception 'This job holds money and was not deleted. %  (Refund the charge in Stripe first, then re-run with p_force => true.)', v_block;
    end if;
  end if;

  -- Capture the parent request BEFORE the delete, or it is unrecoverable.
  select request_id into v_request from public.jobs where id = p_job_id;

  delete from public.jobs where id = p_job_id;

  -- Hand the request back to the client, exactly as withdraw_job and
  -- decline_price_reopen do. Without this the request is STRANDED: it sits in
  -- 'matched' with an assignee and no job row, so ClientDashboard loads no bids
  -- (it reads bids only for status='pending'), shows no job panel, and raises no
  -- error -- and run_reminders step 4 skips it because assigned_contractor_id is
  -- not null, so no nudge goes out either. Five live requests reached that state
  -- before this was added (2026-11-05).
  if v_request is not null then
    update public.client_requests
       set status = 'pending', assigned_contractor_id = null
     where id = v_request
       and status not in ('completed', 'cancelled');
    get diagnostics v_reset = row_count;

    -- Resurface the estimates so the client can re-pick. An accepted bid left
    -- accepted on a re-opened request is invisible to the dashboard's
    -- status='pending' read -- the client would see fewer estimates than they
    -- originally got, with nothing explaining where one went.
    --
    -- The `not waitlisted` test is load-bearing, NOT cosmetic: bids carries a
    -- BEFORE UPDATE trigger (block_bids_on_waitlisted) that RAISES when the
    -- parent request is waitlisted, which would abort the admin's delete over a
    -- secondary tidy-up. The delete is the admin's intent; the resurface is not
    -- allowed to veto it. Tested explicitly rather than swallowed in a catch-all.
    --
    -- preferred_contractor_id is deliberately NOT cleared (withdraw_job doesn't
    -- either): it is a visibility reservation read by notify_preferred_contractor
    -- and list_open_jobs, not an auto-assign, and an admin cleanup should not
    -- silently discard a client's stated preference.
    if v_reset > 0 and not exists (
      select 1 from public.client_requests r where r.id = v_request and r.waitlisted
    ) then
      update public.bids set status = 'pending'
       where request_id = v_request and status = 'accepted';
    end if;
  end if;
end;
$function$;

-- admin_delete_request(p_request_id uuid)   grants: {postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres}
CREATE OR REPLACE FUNCTION public.admin_delete_request(p_request_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
begin
  perform public.admin_guard();
  perform public.log_admin_action('admin_delete_request', 'client_requests', p_request_id::text);
  delete from messages where job_id in (select id from jobs where request_id = p_request_id);
  delete from jobs where request_id = p_request_id;          -- cascades reviews; nulls notifications.job_id
  delete from client_requests where id = p_request_id;
end;
$function$;

-- admin_dispatch_log(p_request_id uuid, p_limit integer)   grants: {postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres}
CREATE OR REPLACE FUNCTION public.admin_dispatch_log(p_request_id uuid DEFAULT NULL::uuid, p_limit integer DEFAULT 200)
 RETURNS TABLE(request_id uuid, service text, contractor_id uuid, company text, ok boolean, status_code integer, error text, reserved boolean, sent_at text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
begin
  perform public.admin_guard();
  return query
  select d.request_id,
         cr.service_needed,
         d.contractor_id,
         c.company_name,
         d.ok,
         d.status_code,
         d.error,
         d.reserved,
         public.ff_local_ts(d.created_at)
  from public.dispatch_log d
  left join public.client_requests cr on cr.id = d.request_id
  left join public.contractors     c  on c.id  = d.contractor_id
  where p_request_id is null or d.request_id = p_request_id
  order by d.created_at desc
  limit greatest(coalesce(p_limit, 200), 1);
end $function$;

-- admin_get_contractor_detail(p_id uuid)   grants: {postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres}
CREATE OR REPLACE FUNCTION public.admin_get_contractor_detail(p_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_is_admin boolean; v_result jsonb;
begin
  select (role = 'admin') into v_is_admin from public.profiles where id = auth.uid();
  if not coalesce(v_is_admin, false) then raise exception 'Not authorized'; end if;
  select row_to_json(t)::jsonb into v_result
  from (
    select
      c.id, c.status, c.created_at,
      p.first_name, p.last_name, p.email, p.phone,
      c.company_name, c.work_type, c.specialties, c.service_area,
      c.years_of_experience, c.availability,
      c.licensed, c.license_number,
      c.has_liability_insurance, c.insurance_provider, c.insurance_expiry,
      c.has_wcb, c.operates_alone, c.work_references,
      c.hourly_rate, c.min_callout,
      c.rating, c.rating_count, c.total_jobs, c.total_earned,
      c.stripe_payouts_enabled, c.google_reviews_url,
      c.review_status, c.review_result,
      c.doc_urls, c.photo_url
    from public.contractors c
    left join public.profiles p on p.id = c.id
    where c.id = p_id
  ) t;
  return v_result;
end;
$function$;

-- admin_guard()   grants: {postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres}
CREATE OR REPLACE FUNCTION public.admin_guard()
 RETURNS void
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
begin
  if not exists (select 1 from public.profiles p
                  where p.id = auth.uid() and p.role = 'admin') then
    raise exception 'Not authorized';
  end if;
  if not public.mfa_ok() then
    -- Plain English on purpose: this surfaces in the admin dashboard, and
    -- "permission denied" would send the owner hunting for a role problem that
    -- does not exist.
    raise exception 'Verify your sign-in code first, then try again.';
  end if;
end;
$function$;

-- admin_health()   grants: {postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres}
CREATE OR REPLACE FUNCTION public.admin_health()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_is_admin boolean;
  v_result jsonb;
begin
  select exists(select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin') into v_is_admin;
  if not v_is_admin then raise exception 'Not authorized'; end if;

  with
  -- Pending requests with no bids, unassigned, older than 24h.
  no_bid as (
    select r.id, r.service_needed, r.location, r.created_at
      from client_requests r
     where r.status = 'pending'
       and r.assigned_contractor_id is null
       and r.created_at < now() - interval '24 hours'
       and not exists (select 1 from bids b where b.request_id = r.id)
     order by r.created_at asc
  ),
  -- Jobs the contractor marked complete but the client hasn't confirmed, > 2 days.
  awaiting_confirm as (
    select j.id, j.amount, j.contractor_completed_at
      from jobs j
     where j.contractor_completed_at is not null
       and j.client_confirmed_at is null
       and coalesce(j.status,'') not in ('cancelled','disputed')
       and j.contractor_completed_at < now() - interval '2 days'
     order by j.contractor_completed_at asc
  ),
  -- Times proposed by the contractor but not yet approved by the client, > 2 days.
  awaiting_approval as (
    select j.id, j.amount, j.schedule_proposed_at
      from jobs j
     where j.schedule_proposed_at is not null
       and j.client_approved_at is null
       and j.contractor_completed_at is null
       and coalesce(j.status,'') not in ('cancelled','disputed','completed')
       and j.schedule_proposed_at < now() - interval '2 days'
     order by j.schedule_proposed_at asc
  ),
  -- Open disputes older than 3 days.
  stale_disputes as (
    select d.id, d.reason, d.created_at, d.job_id
      from disputes d
     where d.status = 'open'
       and d.created_at < now() - interval '3 days'
     order by d.created_at asc
  )
  select jsonb_build_object(
    'generated_at', now(),
    'no_bid_count', (select count(*) from no_bid),
    'no_bid', (select coalesce(jsonb_agg(to_jsonb(n)), '[]'::jsonb) from (select * from no_bid limit 25) n),
    'awaiting_confirm_count', (select count(*) from awaiting_confirm),
    'awaiting_confirm', (select coalesce(jsonb_agg(to_jsonb(a)), '[]'::jsonb) from (select * from awaiting_confirm limit 25) a),
    'awaiting_approval_count', (select count(*) from awaiting_approval),
    'awaiting_approval', (select coalesce(jsonb_agg(to_jsonb(a)), '[]'::jsonb) from (select * from awaiting_approval limit 25) a),
    'stale_disputes_count', (select count(*) from stale_disputes),
    'stale_disputes', (select coalesce(jsonb_agg(to_jsonb(s)), '[]'::jsonb) from (select * from stale_disputes limit 25) s),
    'new_leads_count', (select count(*) from quote_leads where status = 'new'),
    'pending_contractors_count', (select count(*) from contractors where status = 'pending')
  ) into v_result;

  return v_result;
end; $function$;

-- admin_import_outreach(p_rows jsonb)   grants: {=X/postgres,postgres=X/postgres,anon=X/postgres,authenticated=X/postgres,service_role=X/postgres}
CREATE OR REPLACE FUNCTION public.admin_import_outreach(p_rows jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
declare v_before int; v_after int;
begin
  perform public.admin_guard();
  perform public.log_admin_action('admin_import_outreach', 'contractor_outreach', null, jsonb_build_object('rows', jsonb_array_length(coalesce(p_rows, '[]'::jsonb))));

  select count(*) into v_before from public.contractor_outreach;

  insert into public.contractor_outreach (company_name, contact_name, email, trade, source, city, status)
  select nullif(trim(x->>'company_name'), ''),
         nullif(trim(x->>'contact_name'), ''),
         lower(trim(x->>'email')),
         nullif(trim(x->>'trade'), ''),
         coalesce(nullif(trim(x->>'source'), ''), 'manual_import'),
         coalesce(nullif(trim(x->>'city'), ''), 'Calgary'),
         'new'
  from jsonb_array_elements(p_rows) as x
  where coalesce(trim(x->>'email'), '') <> ''
    and coalesce(trim(x->>'company_name'), '') <> ''
    and trim(x->>'email') ~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'
  on conflict (lower(email)) do nothing;

  select count(*) into v_after from public.contractor_outreach;

  return jsonb_build_object(
    'imported', v_after - v_before,
    'skipped_duplicate_or_invalid',
      jsonb_array_length(p_rows) - (v_after - v_before)
  );
end $function$;

-- admin_list_accounts()   grants: {postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres}
CREATE OR REPLACE FUNCTION public.admin_list_accounts()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_is_admin boolean; v_result jsonb;
begin
  select (role = 'admin') into v_is_admin from public.profiles where id = auth.uid();
  if not coalesce(v_is_admin, false) then raise exception 'Not authorized'; end if;
  select coalesce(jsonb_agg(row_to_json(t) order by t.created_at desc), '[]'::jsonb) into v_result
  from (
    select
      u.id, u.email, u.created_at, u.last_sign_in_at,
      (u.raw_user_meta_data->>'phone') as meta_phone,
      p.first_name, p.last_name, p.phone,
      coalesce(p.role, (u.raw_user_meta_data->>'role')) as role,
      p.referral_code,
      (p.id is null) as orphaned,
      c.company_name, c.specialties, c.service_area, c.status as contractor_status,
      c.licensed, c.license_number, c.has_liability_insurance, c.insurance_provider,
      c.insurance_expiry, c.has_wcb, c.operates_alone, c.work_references, c.work_type,
      c.years_of_experience, c.availability,
      c.rating, c.rating_count, c.total_jobs, c.total_earned,
      c.hourly_rate, c.min_callout, c.weekly_goal,
      c.stripe_payouts_enabled, c.google_reviews_url,
      c.review_status, c.review_result,
      c.doc_urls, c.photo_url,
      (
        select coalesce(jsonb_agg(jsonb_build_object('title', pi.title, 'path', pi.photo_path) order by pi.created_at desc), '[]'::jsonb)
        from public.portfolio_items pi where pi.contractor_id = u.id
      ) as portfolio,
      (select count(*) from public.client_requests r where r.user_id = u.id) as request_count,
      (select count(*) from public.jobs j where j.client_id = u.id or j.contractor_id = u.id) as job_count
    from auth.users u
    left join public.profiles p on p.id = u.id
    left join public.contractors c on c.id = u.id
  ) t;
  return v_result;
end;
$function$;

-- admin_list_agent_actions(p_limit integer, p_status text)   grants: {postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres}
CREATE OR REPLACE FUNCTION public.admin_list_agent_actions(p_limit integer DEFAULT 50, p_status text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare v jsonb;
begin
  if not public.is_admin() then return '[]'::jsonb; end if;

  select coalesce(jsonb_agg(row_to_json(t)), '[]'::jsonb) into v from (
    select a.id, a.agent, r.label as agent_label, a.kind, a.status, a.payload,
           a.dedupe_key, a.claim_token, a.created_at, a.expires_at,
           public.ff_local_ts(a.created_at) as created_local,
           public.ff_local_ts(a.expires_at) as expires_local,
           (a.expires_at <= now()) as is_expired,
           public.agent_kind_needs_harness(a.kind) as needs_harness,
           a.approved_at, public.ff_local_ts(a.approved_at) as approved_local,
           a.result,
           c.channel, c.external_user_id, c.display_name, c.intent, c.turn_count,
           (select coalesce(jsonb_agg(jsonb_build_object('d', m.direction, 'b', m.body)
                                      order by m.created_at), '[]'::jsonb)
              from public.social_messages m where m.conversation_id = c.id) as transcript
      from public.agent_actions a
      left join public.social_conversations c on c.id = a.conversation_id
      left join public.agent_registry r       on r.agent = a.agent
     where p_status is null or a.status = p_status
     order by (a.status = 'pending') desc, a.created_at desc
     limit greatest(1, least(coalesce(p_limit, 50), 200))
  ) t;
  return v;
end;
$function$;

-- admin_list_chat_flags(p_limit integer)   grants: {postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres}
CREATE OR REPLACE FUNCTION public.admin_list_chat_flags(p_limit integer DEFAULT 100)
 RETURNS TABLE(message_id uuid, job_id uuid, created_at timestamp with time zone, content text, flag_reasons text[], sender_id uuid, sender_name text, sender_role text, service text, client_name text, contractor_name text)
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  select
    m.id, m.job_id, m.created_at, m.content, m.flag_reasons, m.sender_id,
    nullif(trim(coalesce(sp.first_name,'') || ' ' || coalesce(sp.last_name,'')), ''),
    sp.role,
    r.service_needed,
    nullif(trim(coalesce(cp.first_name,'') || ' ' || coalesce(cp.last_name,'')), ''),
    nullif(trim(coalesce(kp.first_name,'') || ' ' || coalesce(kp.last_name,'')), '')
  from public.messages m
  left join public.profiles        sp on sp.id = m.sender_id
  left join public.jobs            j  on j.id  = m.job_id
  left join public.client_requests r  on r.id  = j.request_id
  left join public.profiles        cp on cp.id = j.client_id
  left join public.profiles        kp on kp.id = j.contractor_id
  where m.blocked and public.is_admin()
  order by m.created_at desc
  limit greatest(1, least(coalesce(p_limit, 100), 500));
$function$;

-- admin_list_messages(p_limit integer)   grants: {postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres}
CREATE OR REPLACE FUNCTION public.admin_list_messages(p_limit integer DEFAULT 100)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v jsonb;
begin
  if not public.is_admin() then
    raise exception 'Not authorized';
  end if;
  select coalesce(jsonb_agg(row_to_json(t)), '[]'::jsonb) into v
  from (
    select m.id, m.batch_id, m.recipient_id, m.recipient_email, m.recipient_name,
           m.subject, m.body, m.status, m.error, m.created_at
    from public.admin_messages m
    order by m.created_at desc
    limit greatest(1, least(p_limit, 500))
  ) t;
  return v;
end;
$function$;

-- admin_list_picks(p_limit integer)   grants: {postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres}
CREATE OR REPLACE FUNCTION public.admin_list_picks(p_limit integer DEFAULT 100)
 RETURNS TABLE(job_id uuid, request_id uuid, picked_at timestamp with time zone, service text, location text, job_status text, amount numeric, client_id uuid, client_name text, contractor_id uuid, contractor_name text, company_name text, winning_amount numeric, bid_count integer, how text)
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  select
    j.id,
    j.request_id,
    j.created_at,
    r.service_needed,
    r.location,
    j.status,
    j.amount,
    j.client_id,
    nullif(trim(coalesce(cp.first_name,'') || ' ' || coalesce(cp.last_name,'')), ''),
    j.contractor_id,
    nullif(trim(coalesce(kp.first_name,'') || ' ' || coalesce(kp.last_name,'')), ''),
    c.company_name,
    ab.amount,
    coalesce(bc.n, 0)::int,
    case
      when ab.id is not null then 'client_pick'
      when r.preferred_contractor_id = j.contractor_id then 'rehire'
      else 'admin_assign'
    end
  from public.jobs j
  join public.client_requests r on r.id = j.request_id
  left join public.profiles cp on cp.id = j.client_id
  left join public.profiles kp on kp.id = j.contractor_id
  left join public.contractors c on c.id = j.contractor_id
  left join lateral (
    select b.id, b.amount from public.bids b
    where b.request_id = j.request_id and b.status = 'accepted' limit 1
  ) ab on true
  left join lateral (
    select count(*) n from public.bids b where b.request_id = j.request_id
  ) bc on true
  where public.is_admin()
  order by j.created_at desc
  limit greatest(1, least(coalesce(p_limit, 100), 500));
$function$;

-- admin_list_social_actions(p_limit integer)   grants: {postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres}
CREATE OR REPLACE FUNCTION public.admin_list_social_actions(p_limit integer DEFAULT 50)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
begin
  return public.admin_list_agent_actions(p_limit, null);
end;
$function$;

-- admin_list_waitlisted(p_limit integer)   grants: {postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres}
CREATE OR REPLACE FUNCTION public.admin_list_waitlisted(p_limit integer DEFAULT 200)
 RETURNS TABLE(id uuid, created_at timestamp with time zone, service_needed text, location text, job_description text, client_name text, client_email text, days_waiting integer)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
begin
  if not public.is_admin() then
    raise exception 'not authorised';
  end if;

  return query
  select cr.id, cr.created_at, cr.service_needed, cr.location,
         cr.job_description,
         nullif(trim(coalesce(p.first_name,'') || ' ' || coalesce(p.last_name,'')), ''),
         coalesce(p.email, cr.email),
         extract(day from now() - cr.created_at)::int
  from public.client_requests cr
  left join public.profiles p on p.id = cr.user_id
  where cr.waitlisted and cr.status = 'pending'
  order by cr.created_at
  limit greatest(p_limit, 1);
end $function$;

-- admin_outreach_gaps()   grants: {=X/postgres,postgres=X/postgres,anon=X/postgres,authenticated=X/postgres,service_role=X/postgres}
CREATE OR REPLACE FUNCTION public.admin_outreach_gaps()
 RETURNS TABLE(service text, reach integer, is_gap boolean, open_requests integer, outreach_new integer, outreach_pending integer, outreach_sent integer)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
begin
  if not public.is_admin() then
    raise exception 'not authorised';
  end if;

  return query
  select m.service,
         public.trade_reach(m.service) as reach,
         public.trade_reach(m.service) < public.outreach_gap_threshold() as is_gap,
         (select count(*)::int from public.client_requests r
           where r.status = 'pending'
             and m.service = any (
               select btrim(l)
               from unnest(string_to_array(coalesce(r.service_needed,''), ',')) l
             )),
         (select count(*)::int from public.contractor_outreach o
           where o.trade = m.service and o.status = 'new' and not o.unsubscribed),
         (select count(*)::int from public.contractor_outreach o
           where o.trade = m.service and o.status = 'pending'),
         (select count(*)::int from public.contractor_outreach o
           where o.trade = m.service and o.status = 'sent')
  from public.service_specialty_map m
  order by reach asc, m.service;
end $function$;

-- admin_oversized_objects(p_bucket text, p_floor bigint, p_after text, p_limit integer)   grants: {postgres=X/postgres,service_role=X/postgres}
CREATE OR REPLACE FUNCTION public.admin_oversized_objects(p_bucket text, p_floor bigint DEFAULT 300000, p_after text DEFAULT ''::text, p_limit integer DEFAULT 6)
 RETURNS TABLE(name text, bytes bigint)
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
  select o.name, (o.metadata->>'size')::bigint
  from storage.objects o
  where o.bucket_id = p_bucket
    and p_bucket in ('portfolio-photos', 'contractor-photos')
    and (o.metadata->>'size')::bigint > p_floor
    and o.name > coalesce(p_after, '')
  order by o.name
  limit greatest(1, least(p_limit, 50));
$function$;

-- admin_queue_outreach(p_trade text, p_limit integer, p_request uuid)   grants: {=X/postgres,postgres=X/postgres,anon=X/postgres,authenticated=X/postgres,service_role=X/postgres}
CREATE OR REPLACE FUNCTION public.admin_queue_outreach(p_trade text, p_limit integer DEFAULT 25, p_request uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
declare v_n int;
begin
  perform public.admin_guard();
  perform public.log_admin_action('admin_queue_outreach', 'contractor_outreach', p_request::text, jsonb_build_object('trade', p_trade, 'limit', p_limit));

  with pick as (
    select id from public.contractor_outreach
     where status = 'new'
       and not unsubscribed
       and (p_trade is null or trade = p_trade)
     order by created_at
     limit greatest(coalesce(p_limit, 25), 0)
     for update skip locked
  )
  update public.contractor_outreach o
     set status = 'pending', queued_at = now(), queued_for = p_request
    from pick
   where o.id = pick.id;

  get diagnostics v_n = row_count;
  return jsonb_build_object('queued', v_n, 'trade', p_trade);
end $function$;

-- admin_rank_contractors(p_request_id uuid)   grants: {postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres}
CREATE OR REPLACE FUNCTION public.admin_rank_contractors(p_request_id uuid)
 RETURNS TABLE(id uuid, first_name text, last_name text, specialties text[], rating numeric, total_jobs integer, is_match boolean, in_zone boolean)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
declare
  v_service  text;
  v_loc      text;
  v_required text[];
begin
  if not public.is_admin() then raise exception 'Not authorized'; end if;

  select service_needed, location into v_service, v_loc
    from client_requests where id = p_request_id;

  v_required := public.service_specialties(v_service);

  return query
  with req as (
    select
      lower(coalesce(v_loc,'')) as loc,
      (regexp_match(lower(coalesce(v_loc,'')), '\m(nw|ne|sw|se)\M'))[1] as q,
      (lower(coalesce(v_loc,'')) ~ '(downtown|beltline)') as is_downtown,
      (regexp_match(lower(coalesce(v_loc,'')), '\m(airdrie|cochrane|chestermere|okotoks|strathmore)\M'))[1] as town
  )
  select
    p.id, p.first_name, p.last_name,
    c.specialties, c.rating, c.total_jobs,
    (v_required is null or c.specialties && v_required) as is_match,
    -- in_zone: contractor's service_area covers the request's quadrant/downtown/town
    exists (
      select 1 from unnest(coalesce(c.service_area, '{}'::text[])) sa, req
      where (req.q is not null and sa ilike '%'||req.q||'%')
         or (req.is_downtown and sa ~* '(downtown|beltline)')
         or (req.town is not null and sa ilike '%'||req.town||'%')
    ) as in_zone
  from contractors c
  join profiles p on p.id = c.id
  where c.status = 'active'
  order by
    (v_required is null or c.specialties && v_required) desc,
    exists (
      select 1 from unnest(coalesce(c.service_area, '{}'::text[])) sa, req
      where (req.q is not null and sa ilike '%'||req.q||'%')
         or (req.is_downtown and sa ~* '(downtown|beltline)')
         or (req.town is not null and sa ilike '%'||req.town||'%')
    ) desc,
    coalesce(c.rating, 0) desc,
    coalesce(c.total_jobs, 0) desc,
    p.first_name asc;
end;
$function$;

-- admin_refire_request(p_request_id uuid)   grants: {postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres}
CREATE OR REPLACE FUNCTION public.admin_refire_request(p_request_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
declare
  v_reach int;
  v_bids  int;
begin
  perform public.admin_guard();
  perform public.log_admin_action('admin_refire_request', 'client_requests', p_request_id::text);

  v_reach := public.refire_request(p_request_id);
  select count(distinct b.contractor_id) into v_bids
  from public.bids b where b.request_id = p_request_id;

  return jsonb_build_object(
    'reached', v_reach,
    'bids',    coalesce(v_bids, 0),
    'refire_count', (select refire_count from public.client_requests where id = p_request_id)
  );
end $function$;

-- admin_rescue_signup(p_user uuid, p_kind text)   grants: {postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres}
CREATE OR REPLACE FUNCTION public.admin_rescue_signup(p_user uuid, p_kind text DEFAULT 'stuck'::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
declare v_token text; v_key text;
begin
  perform public.admin_guard();
  perform public.log_admin_action('admin_rescue_signup', 'auth.users', p_user::text, jsonb_build_object('kind', p_kind));
  select substring(prosrc from 'eyJ[A-Za-z0-9_.-]{40,}')
    into v_key from pg_proc where proname = 'kick_reconcile_payouts' limit 1;
  v_token := public.issue_internal_token('edge-internal');
  perform net.http_post(
    url     := 'https://kvypmjxbbaaknvddwwai.supabase.co/functions/v1/auth-rescue',
    headers := jsonb_build_object(
                 'Content-Type', 'application/json',
                 'Authorization', 'Bearer ' || v_key,
                 'x-ff-internal', v_token),
    body    := jsonb_build_object('user_id', p_user, 'kind', coalesce(p_kind,'stuck'))
  );
  return jsonb_build_object('ok', true, 'queued_for', p_user);
end;
$function$;

-- admin_resignup_matches()   grants: {postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres}
CREATE OR REPLACE FUNCTION public.admin_resignup_matches()
 RETURNS TABLE(contractor_id uuid, fields text[], avg_score numeric, review_count integer, deleted_at timestamp with time zone)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
begin
  if not public.is_admin() then raise exception 'Not authorized'; end if;
  return query
  with norm as (
    select ct.id as cid,
      lower(btrim(coalesce(p.email,'')))                                              as e,
      regexp_replace(coalesce(p.phone,''), '[^0-9]', '', 'g')                          as ph,
      lower(regexp_replace(btrim(coalesce(p.first_name,'')||' '||coalesce(p.last_name,'')), '\s+', ' ', 'g')) as nm
    from contractors ct
    join profiles p on p.id = ct.id
  ),
  h as (
    select cid,
      case when e  <> '' then encode(extensions.digest(e,  'sha256'),'hex') end as eh,
      case when ph <> '' then encode(extensions.digest(ph, 'sha256'),'hex') end as phh,
      case when nm <> '' then encode(extensions.digest(nm, 'sha256'),'hex') end as nh
    from norm
  ),
  m as (
    select h.cid,
      f.avg_score, f.review_count, f.deleted_at,
      array_remove(array[
        case when h.eh  is not null and h.eh  = f.email_hash then 'email' end,
        case when h.phh is not null and h.phh = f.phone_hash then 'phone' end,
        case when h.nh  is not null and h.nh  = f.name_hash  then 'name'  end
      ], null) as fields,
      row_number() over (partition by h.cid order by f.deleted_at desc) as rn
    from h
    join deleted_account_flags f on f.was_poor = true
      and (
        (h.eh  is not null and h.eh  = f.email_hash) or
        (h.phh is not null and h.phh = f.phone_hash) or
        (h.nh  is not null and h.nh  = f.name_hash)
      )
  )
  select m.cid, m.fields, m.avg_score, m.review_count, m.deleted_at
  from m where m.rn = 1;
end; $function$;

-- admin_review_agent_action(p_action_id uuid, p_approve boolean, p_payload jsonb)   grants: {postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres}
CREATE OR REPLACE FUNCTION public.admin_review_agent_action(p_action_id uuid, p_approve boolean, p_payload jsonb DEFAULT NULL::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v     public.agent_actions;
  v_cur public.agent_actions;
  v_needs boolean;
begin
  perform public.admin_guard();
  -- The log call sits immediately after the guard, which buys "logged iff
  -- committed" for free: an RPC is one transaction, so every raise below rolls
  -- its own log row back.
  perform public.log_admin_action(
    'admin_review_agent_action', 'agent_actions', p_action_id::text,
    jsonb_build_object('approve', p_approve, 'edited', p_payload is not null));

  select * into v_cur from public.agent_actions where id = p_action_id;
  if not found then
    raise exception 'that suggestion no longer exists';
  end if;
  if v_cur.status <> 'pending' then
    raise exception 'that action is not pending any more';
  end if;

  -- REJECTING an expired proposal stays allowed: clearing the inbox must always
  -- work. Only approving is refused, which is what the UI already claimed.
  if p_approve and v_cur.expires_at <= now() then
    raise exception 'that suggestion expired on % — reject it and the agent will raise a fresh one on its next run',
      public.ff_local_ts(v_cur.expires_at);
  end if;

  v_needs := public.agent_kind_needs_harness(v_cur.kind);

  update public.agent_actions
     set status = case
                    when not p_approve then 'rejected'
                    when v_needs      then 'approved'
                    else 'sent'
                  end,
         payload     = coalesce(p_payload, payload),
         approved_by = auth.uid(),
         approved_at = now(),
         result = case
                    when p_approve and not v_needs
                    then coalesce(result, '{}'::jsonb)
                         || jsonb_build_object('handled_by', 'owner', 'handled_at', now())
                    else result
                  end
   where id = p_action_id and status = 'pending'
  returning * into v;

  if not found then
    raise exception 'that action is not pending any more';
  end if;

  return jsonb_build_object('id', v.id, 'agent', v.agent, 'status', v.status,
                            'claim_token', v.claim_token,
                            'needs_harness', v_needs);
end;
$function$;

-- admin_review_social_action(p_action_id uuid, p_approve boolean, p_payload jsonb)   grants: {postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres}
CREATE OR REPLACE FUNCTION public.admin_review_social_action(p_action_id uuid, p_approve boolean, p_payload jsonb DEFAULT NULL::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
begin
  return public.admin_review_agent_action(p_action_id, p_approve, p_payload);
end;
$function$;

-- admin_rotate_social_bot_key()   grants: {postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres}
CREATE OR REPLACE FUNCTION public.admin_rotate_social_bot_key()
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
declare v text;
begin
  perform public.admin_guard();
  perform public.log_admin_action('admin_rotate_social_bot_key', 'social_bot_config', 'bot_key');
  v := encode(extensions.gen_random_bytes(32), 'hex');
  insert into public.social_bot_config (key, value, updated_at)
  values ('bot_key', v, now())
  on conflict (key) do update set value = excluded.value, updated_at = now();
  return v;
end;
$function$;

-- admin_set_contractor_status(p_id uuid, p_status text)   grants: {postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres}
CREATE OR REPLACE FUNCTION public.admin_set_contractor_status(p_id uuid, p_status text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
begin
  perform public.admin_guard();
  perform public.log_admin_action('admin_set_contractor_status', 'contractors', p_id::text, jsonb_build_object('status', p_status));
  if p_status not in ('active', 'inactive', 'pending') then
    raise exception 'Invalid status: %', p_status;
  end if;
  update contractors set status = p_status where id = p_id;
end;
$function$;

-- agent_expire_stale_actions()   grants: {postgres=X/postgres,service_role=X/postgres}
CREATE OR REPLACE FUNCTION public.agent_expire_stale_actions()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare n int;
begin
  with x as (
    update public.agent_actions
       set status = 'expired',
           result = coalesce(result, '{}'::jsonb)
                    || jsonb_build_object('expired_at', now())
     where status = 'pending'
       and expires_at <= now()
    returning 1
  )
  select count(*) into n from x;
  return coalesce(n, 0);
end;
$function$;

-- agent_kind_needs_harness(p_kind text)   grants: {postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres}
CREATE OR REPLACE FUNCTION public.agent_kind_needs_harness(p_kind text)
 RETURNS boolean
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
  -- false = approving this means "the owner did it himself", so it completes.
  -- An unknown kind returns TRUE: better to show "approved, nothing picked it
  -- up" than to mark work done that nobody did.
  select coalesce(p_kind, '') not in (
    'stranded_request',
    'stale_estimates',
    'unreachable_trade',
    'no_bids_exhausted'
  );
$function$;

-- agent_lead_draft_context(p_action_id uuid)   grants: {postgres=X/postgres,service_role=X/postgres}
CREATE OR REPLACE FUNCTION public.agent_lead_draft_context(p_action_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare v record;
begin
  select a.id, a.kind, a.status, a.agent, a.payload
    into v
    from public.agent_actions a
   where a.id = p_action_id;

  if not found then
    return jsonb_build_object('ok', false, 'reason', 'that suggestion no longer exists');
  end if;
  if v.agent <> 'lead-response' then
    return jsonb_build_object('ok', false, 'reason', 'drafting is only wired for lead-response findings');
  end if;
  -- rejected/expired rows are off the owner's list; drafting one is work nobody
  -- asked for. 'sent' stays allowed so he can re-draft after marking handled.
  if v.status not in ('pending', 'approved', 'sent') then
    return jsonb_build_object('ok', false, 'reason', 'that lead is ' || v.status || ' -- nothing to draft');
  end if;
  if coalesce(v.payload->>'client', '') = '' then
    return jsonb_build_object('ok', false, 'reason', 'that lead has no client name on it');
  end if;

  return jsonb_build_object('ok', true, 'kind', v.kind, 'payload', v.payload);
end;
$function$;

-- agent_lead_draft_save(p_action_id uuid, p_draft jsonb)   grants: {postgres=X/postgres,service_role=X/postgres}
CREATE OR REPLACE FUNCTION public.agent_lead_draft_save(p_action_id uuid, p_draft jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare v_payload jsonb;
begin
  if p_draft is null or jsonb_typeof(p_draft) <> 'object' then
    return jsonb_build_object('ok', false, 'reason', 'no draft to save');
  end if;

  update public.agent_actions
     set payload = coalesce(payload, '{}'::jsonb)
                   || jsonb_build_object('draft', p_draft || jsonb_build_object('drafted_at', now()))
   where id = p_action_id
     and agent = 'lead-response'
     and status in ('pending', 'approved', 'sent')
  returning payload into v_payload;

  if v_payload is null then
    return jsonb_build_object('ok', false, 'reason', 'could not attach the draft to that lead');
  end if;
  return jsonb_build_object('ok', true, 'draft', v_payload->'draft');
end;
$function$;

-- agent_lead_response_run(p_trigger text)   grants: {postgres=X/postgres,service_role=X/postgres}
CREATE OR REPLACE FUNCTION public.agent_lead_response_run(p_trigger text DEFAULT 'schedule'::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
declare
  v_run    uuid;
  v_found  int := 0;
  v_made   int := 0;
  v_open   int := 0;
  v_capped text := null;
  v_res    jsonb;
  f        record;
  -- ONE place for the band. Both bounds are declared here so a future change
  -- cannot move one and leave the other, which is how the 30-day floor came to
  -- contradict the thing it was supposed to support.
  v_cold   interval := interval '21 days';  -- older than this: not a lead any more
  v_warm   interval := interval '3 days';   -- younger than this: the email is still working
begin
  -- OUTSIDE the exception block below on purpose: a plpgsql begin…exception
  -- block is a subtransaction, so a run row created inside it rolls back with
  -- the error and the failure becomes invisible — the absence class again.
  v_run := public.agent_run_start('lead-response', coalesce(p_trigger, 'schedule'));

  begin
    for f in
      with base as (
        select r.id, r.service_needed, r.status, r.assigned_contractor_id,
               r.created_at, r.refire_count, r.pick_token,
               (select count(*) from public.jobs j where j.request_id = r.id) as job_ct,
               (select count(*) from public.bids b
                 where b.request_id = r.id and b.status = 'pending') as pending_bids,
               (select max(b.created_at) from public.bids b
                 where b.request_id = r.id and b.status = 'pending') as newest_bid,
               (select min(coalesce(b.amount, b.price_low)) from public.bids b
                 where b.request_id = r.id and b.status = 'pending') as low_bid,
               (select max(coalesce(b.amount, b.price_high, b.price_low)) from public.bids b
                 where b.request_id = r.id and b.status = 'pending') as high_bid,
               public.trade_reach(r.service_needed) as reach,
               jsonb_build_object(
                 'request_id',  r.id,
                 'service',     r.service_needed,
                 'posted',      public.ff_local_ts(r.created_at),
                 'area',        r.location,
                 'client',      nullif(btrim(coalesce(r.first_name,'') || ' ' || coalesce(r.last_name,'')), ''),
                 'email',       r.email,
                 'phone',       r.phone,
                 'description', left(coalesce(r.job_description, ''), 240)
               ) as ctx
          from public.client_requests r
         where coalesce(r.waitlisted, false) = false
           and r.created_at > now() - interval '365 days'
      ),
      findings as (
        -- No age ceiling here, on purpose. See the header: this is a data
        -- defect that makes a client's whole request invisible, not a lead.
        select 1 as prio, 'stranded_request'::text as kind, b.id, b.created_at,
               b.ctx || jsonb_build_object(
                 'summary', format('%s request is stranded — this client sees nothing at all',
                                   coalesce(b.service_needed, 'A')),
                 'detail',  'The request says a contractor is assigned but there is no job row. The client dashboard shows no estimates, no job panel and no error, and no reminder fires either. Hand the request back (status pending, clear the assignee, return accepted bids to pending) or recreate the job.',
                 'action',  'Repair this request in the admin dashboard',
                 'link',    '/admin'
               ) as payload
          from base b
         where b.status not in ('completed', 'cancelled')
           and b.assigned_contractor_id is not null
           and b.job_ct = 0

        union all
        select 2, 'stale_estimates', b.id, b.created_at,
               b.ctx || jsonb_build_object(
                 'summary', format('%s — %s estimate%s waiting since %s and nobody has chased it',
                                   coalesce(b.service_needed, 'Request'),
                                   b.pending_bids,
                                   case when b.pending_bids = 1 then '' else 's' end,
                                   public.ff_local_ts(b.newest_bid)),
                 'detail',  format('The newest estimate is %s days old. The automatic email has already gone out and did not land it, and this lead goes cold at %s days — so it is worth a call now rather than later. Quoted %s. Phone or email the client and send them their pick link.',
                                   (extract(epoch from (now() - b.newest_bid)) / 86400)::int,
                                   (extract(epoch from v_cold) / 86400)::int,
                                   case when b.low_bid is null then 'an amount on file'
                                        when b.low_bid = b.high_bid then '$' || round(b.low_bid)::text
                                        else '$' || round(b.low_bid)::text || '-$' || round(b.high_bid)::text
                                   end),
                 'action',  'Contact this client with their pick link',
                 'link',    case when b.pick_token is not null
                                 then 'https://freddyfixit.ca/pick/' || b.pick_token::text
                                 else '/admin' end
               )
          from base b
         where b.status = 'pending'
           and b.assigned_contractor_id is null
           and b.pending_bids > 0
           and b.newest_bid < now() - v_warm
           and b.newest_bid > now() - v_cold

        union all
        select 3, 'unreachable_trade', b.id, b.created_at,
               b.ctx || jsonb_build_object(
                 'summary', format('%s reaches zero contractors — nobody can see this request',
                                   coalesce(b.service_needed, 'This service')),
                 'detail',  'trade_reach() returns 0 for this service, so no contractor was ever notified and none can bid. Widen service_specialty_map FIRST, then re-fire — the other order re-mails the same pros and burns the re-fire.',
                 'action',  'Widen the specialty map, then re-fire',
                 'link',    '/admin'
               )
          from base b
         where b.status = 'pending'
           and b.assigned_contractor_id is null
           and b.pending_bids = 0
           and b.reach = 0
           and b.created_at > now() - v_cold

        union all
        select 4, 'no_bids_exhausted', b.id, b.created_at,
               b.ctx || jsonb_build_object(
                 'summary', format('%s has no estimates after %s re-fires',
                                   coalesce(b.service_needed, 'Request'),
                                   coalesce(b.refire_count, 0)),
                 'detail',  format('%s contractors can see it and none have bid. Assign one by hand, or tell the client it is not covered yet.',
                                   b.reach),
                 'action',  'Assign a contractor by hand',
                 'link',    '/admin'
               )
          from base b
         where b.status = 'pending'
           and b.assigned_contractor_id is null
           and b.pending_bids = 0
           and b.reach > 0
           and coalesce(b.refire_count, 0) >= 2
           and b.created_at < now() - interval '7 days'
           and b.created_at > now() - v_cold
      )
      select kind, id, payload from findings order by prio, created_at
    loop
      v_found := v_found + 1;
      v_res := public.agent_propose_action(
                 'lead-response', f.kind, f.kind || ':' || f.id::text,
                 f.payload, null, v_run);

      if coalesce((v_res->>'capped')::boolean, false) then
        v_capped := v_res->>'reason';
        exit;                       -- a cap means stop proposing, not retry
      elsif coalesce((v_res->>'already_open')::boolean, false) then
        v_open := v_open + 1;
      else
        v_made := v_made + 1;
      end if;
    end loop;

    -- A run that finds nothing still logs a zero-proposal run. That row is the
    -- point: it proves the agent ran, which is the thing you cannot query the
    -- absence of.
    perform public.agent_run_finish(
      v_run,
      case when v_capped is not null then 'warn' else 'ok' end,
      case when v_found = 0
           then 'Nothing to chase - every request is either picked, recently quoted, still fresh, or past the 21-day point where a lead stops being worth a call.'
           else format('%s lead%s need attention: %s new, %s already waiting%s.',
                       v_found, case when v_found = 1 then '' else 's' end,
                       v_made, v_open,
                       case when v_capped is not null
                            then ' - stopped early at its ' || v_capped || ' limit'
                            else '' end)
      end,
      jsonb_build_object('model_calls', 0, 'found', v_found,
                         'new', v_made, 'already_open', v_open, 'capped', v_capped)
    );
  exception when others then
    -- Do NOT re-raise. A re-raise rolls back the agent_runs row that is the only
    -- evidence the agent ran and failed, and an agent that fails invisibly is
    -- worse than one that does not exist. errors_7d surfaces it in the overview.
    perform public.agent_run_finish(
      v_run, 'error', 'The lead sweep failed before it finished.',
      jsonb_build_object('model_calls', 0, 'found', v_found, 'new', v_made),
      left(coalesce(sqlerrm, 'unknown'), 500));
    return jsonb_build_object('run_id', v_run, 'status', 'error', 'error', sqlerrm);
  end;

  return jsonb_build_object('run_id', v_run,
                            'status', case when v_capped is not null then 'warn' else 'ok' end,
                            'found', v_found, 'new', v_made,
                            'already_open', v_open, 'capped', v_capped);
end;
$function$;

-- agent_propose_action(p_agent text, p_kind text, p_dedupe_key text, p_payload jsonb, p_conversation_id uuid, p_run_id uuid)   grants: {postgres=X/postgres,service_role=X/postgres}
CREATE OR REPLACE FUNCTION public.agent_propose_action(p_agent text, p_kind text, p_dedupe_key text DEFAULT NULL::text, p_payload jsonb DEFAULT '{}'::jsonb, p_conversation_id uuid DEFAULT NULL::uuid, p_run_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
declare
  v public.agent_actions;
  v_key text;
  v_reg public.agent_registry;
  v_pending int;
  v_run int;
begin
  if p_agent is null or p_kind is null then
    raise exception 'agent_propose_action needs an agent and a kind';
  end if;

  -- An agent that is not on the declared roster gets no proposal. The roster is
  -- how an agent that has NEVER run is still visible (you cannot query an
  -- absence), and an off-roster writer would be both uncapped and unlisted.
  select * into v_reg from public.agent_registry where agent = p_agent;
  if not found then
    raise exception 'agent "%" is not in agent_registry — add the roster row first', p_agent;
  end if;

  -- Preserve the social path's original dedupe semantics (conversation_id, kind) by
  -- folding it into the generalized key, so both indexes agree instead of competing.
  v_key := coalesce(
    p_dedupe_key,
    case when p_conversation_id is not null
         then p_conversation_id::text || ':' || p_kind
         else null end
  );

  if v_key is not null then
    select * into v from public.agent_actions
     where agent = p_agent and dedupe_key = v_key
       and status in ('pending','approved','sent')
     limit 1;

    if found then
      -- Only a still-pending proposal may be refreshed. Once approved or sent, the
      -- payload the owner signed off on is frozen.
      if v.status = 'pending' then
        update public.agent_actions
           set payload = coalesce(p_payload, payload)
         where id = v.id
        returning * into v;
      end if;
      return jsonb_build_object('id', v.id, 'claim_token', v.claim_token,
                                'status', v.status, 'already_open', true);
    end if;
  end if;

  -- CAPS. Checked AFTER the dedupe refresh above on purpose: refreshing an
  -- already-open proposal adds nothing to the owner's inbox, so a cap must not
  -- freeze a proposal the agent is trying to keep accurate.
  --
  -- The caps are the inbox's defence, not the token budget's. The owner's
  -- approval queue is his TRUSTED INBOX: a surface that can be flooded is a
  -- surface he learns to scroll past, which is the one failure the whole
  -- registry design exists to prevent.
  --
  -- A cap REFUSES, it does not raise. A raise would roll back the harness's
  -- whole transaction — including the agent_runs row that is the only evidence
  -- the cap fired. It returns the same keys as the success path so no caller
  -- has to learn a new shape, with status='capped' and capped=true added.
  select count(*) into v_pending from public.agent_actions
   where agent = p_agent and status = 'pending';
  if v_pending >= v_reg.max_pending then
    if p_run_id is not null then
      update public.agent_runs
         set details = coalesce(details,'{}'::jsonb) || jsonb_build_object('capped','max_pending')
       where id = p_run_id;
    end if;
    return jsonb_build_object('id', null, 'claim_token', null, 'status', 'capped',
                              'already_open', false, 'capped', true,
                              'reason', 'max_pending', 'cap', v_reg.max_pending);
  end if;

  -- The per-run cap can only be measured when the harness declared a run.
  -- social_propose_action passes no run_id, which is exactly why max_pending
  -- above is the cap that always bites.
  if p_run_id is not null then
    select count(*) into v_run from public.agent_actions where run_id = p_run_id;
    if v_run >= v_reg.max_proposals_per_run then
      update public.agent_runs
         set details = coalesce(details,'{}'::jsonb) || jsonb_build_object('capped','max_proposals_per_run')
       where id = p_run_id;
      return jsonb_build_object('id', null, 'claim_token', null, 'status', 'capped',
                                'already_open', false, 'capped', true,
                                'reason', 'max_proposals_per_run', 'cap', v_reg.max_proposals_per_run);
    end if;
  end if;

  begin
    insert into public.agent_actions (agent, kind, dedupe_key, payload, conversation_id, run_id)
    values (p_agent, p_kind, v_key, coalesce(p_payload,'{}'::jsonb), p_conversation_id, p_run_id)
    returning * into v;
  exception when unique_violation then
    -- Two agent instances raced. The index held; return the winner rather than erroring.
    select * into v from public.agent_actions
     where agent = p_agent and dedupe_key = v_key
       and status in ('pending','approved','sent')
     limit 1;
    if not found then raise; end if;
    return jsonb_build_object('id', v.id, 'claim_token', v.claim_token,
                              'status', v.status, 'already_open', true);
  end;

  return jsonb_build_object('id', v.id, 'claim_token', v.claim_token,
                            'status', v.status, 'already_open', false);
end;
$function$;

-- agent_run_finish(p_run_id uuid, p_status text, p_summary text, p_details jsonb, p_error text)   grants: {postgres=X/postgres,service_role=X/postgres}
CREATE OR REPLACE FUNCTION public.agent_run_finish(p_run_id uuid, p_status text, p_summary text DEFAULT NULL::text, p_details jsonb DEFAULT '{}'::jsonb, p_error text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
begin
  update public.agent_runs
     set status      = coalesce(p_status,'ok'),
         finished_at = now(),
         summary     = p_summary,
         -- Merge, never overwrite: agent_propose_action writes a `capped` key in
         -- here while the run is open, and the finish call must not erase it.
         details     = coalesce(details,'{}'::jsonb) || coalesce(p_details,'{}'::jsonb),
         error       = p_error,
         model_calls = greatest(
                         coalesce(model_calls, 0),
                         coalesce(nullif(p_details->>'model_calls','')::int, 0)
                       ),
         proposals_created = (
           select count(*) from public.agent_actions a where a.run_id = p_run_id
         )
   where id = p_run_id;
end;
$function$;

-- agent_run_start(p_agent text, p_trigger text)   grants: {postgres=X/postgres,service_role=X/postgres}
CREATE OR REPLACE FUNCTION public.agent_run_start(p_agent text, p_trigger text DEFAULT 'schedule'::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_id uuid;
  v_sw int;
begin
  if p_agent is null or btrim(p_agent) = '' then
    raise exception 'agent_run_start needs an agent name';
  end if;

  insert into public.agent_runs (agent, trigger)
  values (p_agent, coalesce(p_trigger, 'schedule'))
  returning id into v_id;

  begin
    select public.agent_expire_stale_actions() into v_sw;
    if coalesce(v_sw, 0) > 0 then
      update public.agent_runs
         set details = coalesce(details, '{}'::jsonb)
                       || jsonb_build_object('expired_swept', v_sw)
       where id = v_id;
    end if;
  exception when others then
    update public.agent_runs
       set details = coalesce(details, '{}'::jsonb)
                     || jsonb_build_object('expire_sweep_error', left(coalesce(sqlerrm,'unknown'), 200))
     where id = v_id;
  end;

  return v_id;
end;
$function$;

-- alert_should_send(p_key text, p_cooldown_mins integer)   grants: {postgres=X/postgres,service_role=X/postgres}
CREATE OR REPLACE FUNCTION public.alert_should_send(p_key text, p_cooldown_mins integer DEFAULT 360)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
declare
  v_send boolean;
  v_hits integer;
begin
  if p_key is null or btrim(p_key) = '' then
    return jsonb_build_object('send', true, 'hits', 1);
  end if;

  with prev as (
    select l.last_sent_at from public.alert_throttle_log l where l.key = p_key
  ), up as (
    insert into public.alert_throttle_log as t (key, last_sent_at, hits)
    values (p_key, now(), 1)
    on conflict (key) do update set
      last_sent_at = case
        when t.last_sent_at < now() - make_interval(mins => p_cooldown_mins) then now()
        else t.last_sent_at end,
      hits = t.hits + 1
    returning t.hits
  )
  select coalesce((select last_sent_at from prev) < now() - make_interval(mins => p_cooldown_mins), true),
         (select hits from up)
  into v_send, v_hits;

  return jsonb_build_object('send', coalesce(v_send, true), 'hits', coalesce(v_hits, 1));
exception when others then
  return jsonb_build_object('send', true, 'hits', 1);
end
$function$;

-- apply_referral_code(p_code text)   grants: {=X/postgres,postgres=X/postgres,anon=X/postgres,authenticated=X/postgres,service_role=X/postgres}
CREATE OR REPLACE FUNCTION public.apply_referral_code(p_code text)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
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

-- approve_job_schedule(p_job_id uuid, p_selected_items integer[])   grants: {=X/postgres,postgres=X/postgres,anon=X/postgres,authenticated=X/postgres,service_role=X/postgres}
CREATE OR REPLACE FUNCTION public.approve_job_schedule(p_job_id uuid, p_selected_items integer[] DEFAULT NULL::integer[])
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_contractor uuid; v_client uuid; v_proposed timestamptz; v_at timestamptz; v_req uuid;
  v_items jsonb; v_new_items jsonb; v_prev_addons numeric := 0; v_new_addons numeric := 0;
  i int; it jsonb; v_sel boolean;
begin
  select contractor_id, client_id, schedule_proposed_at, scheduled_at, request_id, quote_items
    into v_contractor, v_client, v_proposed, v_at, v_req, v_items
    from jobs where id = p_job_id;
  if v_client is null then raise exception 'Job not found'; end if;
  if auth.uid() is null or v_client <> auth.uid() then raise exception 'Not authorized'; end if;
  if v_proposed is null then raise exception 'No proposed time to approve'; end if;

  if v_items is not null and jsonb_typeof(v_items) = 'array' then
    v_new_items := '[]'::jsonb;
    i := 0;
    for it in select * from jsonb_array_elements(v_items) loop
      if (it->>'accepted')::boolean is true then
        v_prev_addons := v_prev_addons + coalesce((it->>'amount')::numeric, 0);
      end if;
      v_sel := p_selected_items is not null and i = any(p_selected_items);
      if v_sel then
        v_new_addons := v_new_addons + coalesce((it->>'amount')::numeric, 0);
      end if;
      v_new_items := v_new_items || jsonb_build_array(it || jsonb_build_object('accepted', v_sel));
      i := i + 1;
    end loop;
    update jobs
       set quote_items = v_new_items,
           amount = round(coalesce(amount,0) - v_prev_addons + v_new_addons, 2)
     where id = p_job_id;
  end if;

  update jobs set client_approved_at = now(), status = 'scheduled',
    price_hike_from = null, price_hike_reason = null, price_hike_at = null
  where id = p_job_id;
  update client_requests set status = 'matched' where id = v_req;

  perform public._notify(v_contractor, 'schedule_confirmed', 'Schedule approved',
    'The client approved '||coalesce(public.ff_local_ts(v_at),'the proposed time')||'. You''re booked.'||
    case when v_new_addons > 0 then ' They also added optional extras (+$'||v_new_addons::text||').' else '' end,
    p_job_id);
end; $function$;

-- approve_milestone(p_milestone uuid)   grants: {postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres}
CREATE OR REPLACE FUNCTION public.approve_milestone(p_milestone uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_m public.job_milestones%rowtype;
  v_job public.jobs%rowtype;
begin
  select * into v_m from public.job_milestones where id = p_milestone;
  if not found then
    raise exception 'Milestone not found';
  end if;
  select * into v_job from public.jobs where id = v_m.job_id;
  if auth.uid() is null or (not public.is_admin() and auth.uid() <> v_job.client_id) then
    raise exception 'Only the client can approve this stage';
  end if;
  if v_m.status <> 'completed' then
    raise exception 'This stage is not awaiting approval';
  end if;
  if v_m.client_approved_at is not null then
    return v_m.id; -- idempotent
  end if;

  update public.job_milestones
     set client_approved_at = now()
   where id = p_milestone;

  return v_m.id;
end;
$function$;

-- approve_milestone_schedule(p_job_id uuid)   grants: {postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres}
CREATE OR REPLACE FUNCTION public.approve_milestone_schedule(p_job_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_job public.jobs%rowtype;
begin
  select * into v_job from public.jobs where id = p_job_id;
  if not found then
    raise exception 'Job not found';
  end if;
  if auth.uid() is null or (not public.is_admin() and auth.uid() <> v_job.client_id) then
    raise exception 'Only the client can approve the milestone plan';
  end if;
  if coalesce(v_job.milestone_schedule_status,'') <> 'proposed' then
    raise exception 'No proposed milestone plan to approve';
  end if;

  update public.jobs
     set milestone_schedule_status = 'approved'
   where id = p_job_id;

  -- notify the contractor
  if v_job.contractor_id is not null then
    perform public._notify(
      v_job.contractor_id, 'milestone_schedule_approved',
      'Milestone plan approved',
      'The client approved your milestone plan. They can now fund the first stage.',
      p_job_id);
  end if;
end;
$function$;

-- approve_walkthrough(p_job_id uuid)   grants: {=X/postgres,postgres=X/postgres,anon=X/postgres,authenticated=X/postgres,service_role=X/postgres}
CREATE OR REPLACE FUNCTION public.approve_walkthrough(p_job_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare v_contractor uuid; v_client uuid; v_at timestamptz; v_proposed timestamptz;
begin
  select contractor_id, client_id, walkthrough_at, walkthrough_proposed_at
    into v_contractor, v_client, v_at, v_proposed
    from jobs where id = p_job_id;
  if v_client is null then raise exception 'Job not found'; end if;
  if auth.uid() is null or v_client <> auth.uid() then raise exception 'Not authorized'; end if;
  if v_proposed is null then raise exception 'No walkthrough to approve'; end if;

  update jobs set walkthrough_approved_at = now() where id = p_job_id;

  perform public.notify_user(v_contractor, 'walkthrough_approved', 'Walkthrough confirmed',
    'The client approved your walkthrough visit on '||coalesce(public.ff_local_ts(v_at),'the agreed time')||
    '. After the visit, send your estimate from the job page.',
    'https://freddyfixit.ca/contractor-dashboard', 'Open the job');
end; $function$;

-- assign_job(p_request_id uuid, p_contractor_id uuid)   grants: {postgres=X/postgres,anon=X/postgres,authenticated=X/postgres,service_role=X/postgres}
CREATE OR REPLACE FUNCTION public.assign_job(p_request_id uuid, p_contractor_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare v_client uuid; v_service text; v_job uuid; v_cname text; v_loc text;
begin
  perform public.admin_guard();
  perform public.log_admin_action('assign_job', 'client_requests', p_request_id::text, jsonb_build_object('contractor_id', p_contractor_id));
  select user_id, service_needed, location into v_client, v_service, v_loc
    from client_requests where id = p_request_id;
  if v_client is null then raise exception 'Request not found'; end if;

  insert into jobs(request_id, contractor_id, client_id, status)
    values (p_request_id, p_contractor_id, v_client, 'assigned')
    returning id into v_job;
  update client_requests
     set status = 'matched', assigned_contractor_id = p_contractor_id
   where id = p_request_id;

  select trim(coalesce(first_name,'')||' '||coalesce(last_name,'')) into v_cname
    from profiles where id = p_contractor_id;

  perform public._notify(v_client, 'job_assigned', 'Contractor matched',
    'We matched '||coalesce(nullif(v_cname,''),'a contractor')||' to your '||coalesce(v_service,'job')||'. They''ll propose a time and price next.', v_job);
  perform public._notify(p_contractor_id, 'job_assigned', 'New job assigned',
    'You''ve been assigned: '||coalesce(v_service,'a job')||coalesce(' at '||v_loc,'')||'. Propose a time and price to get started.', v_job);
  return v_job;
end; $function$;

-- assign_referral_code()   grants: {postgres=X/postgres,service_role=X/postgres}
CREATE OR REPLACE FUNCTION public.assign_referral_code()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  IF NEW.referral_code IS NULL THEN
    BEGIN
      NEW.referral_code := public.gen_referral_code();
    EXCEPTION WHEN OTHERS THEN
      NEW.referral_code := NULL; -- backfillable later; never abort the profile insert
    END;
  END IF;
  RETURN NEW;
END; $function$;

-- auth_rescue_logged(p_user uuid, p_kind text, p_ok boolean, p_detail text)   grants: {postgres=X/postgres,service_role=X/postgres}
CREATE OR REPLACE FUNCTION public.auth_rescue_logged(p_user uuid, p_kind text, p_ok boolean, p_detail text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
  insert into public.signup_rescue_log (user_id, kind, ok, detail)
  values (p_user, coalesce(p_kind,'stuck'), coalesce(p_ok,false), p_detail);
$function$;

-- auth_rescue_target(p_user uuid)   grants: {postgres=X/postgres,service_role=X/postgres}
CREATE OR REPLACE FUNCTION public.auth_rescue_target(p_user uuid)
 RETURNS TABLE(email text, first_name text, role text)
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
  select u.email::text,
         coalesce(p.first_name, '')::text,
         coalesce(p.role, u.raw_user_meta_data->>'role', 'client')::text
  from auth.users u
  left join public.profiles p on p.id = u.id
  where u.id = p_user
$function$;

-- auto_approve_stale_milestones(p_days integer)   grants: {postgres=X/postgres,service_role=X/postgres}
CREATE OR REPLACE FUNCTION public.auto_approve_stale_milestones(p_days integer DEFAULT 3)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
declare
  v_row public.job_milestones%rowtype;
  v_n int := 0;
  v_failed int := 0;
begin
  for v_row in
    select * from public.job_milestones
     where status = 'completed'
       and client_approved_at is null
       and disputed_at is null
       and completed_at < now() - make_interval(days => p_days)
  loop
    begin
      update public.job_milestones
         set client_approved_at = now()
       where id = v_row.id;
      v_n := v_n + 1;
    exception when others then
      v_failed := v_failed + 1;
      raise warning 'auto_approve_stale_milestones: stage % skipped: %', v_row.id, sqlerrm;
    end;
  end loop;
  if v_failed > 0 then
    raise warning 'auto_approve_stale_milestones: % approved, % skipped', v_n, v_failed;
  end if;
  return v_n;
end;
$function$;

-- auto_confirm_stale_jobs(p_days integer)   grants: {postgres=X/postgres,service_role=X/postgres}
CREATE OR REPLACE FUNCTION public.auto_confirm_stale_jobs(p_days integer DEFAULT 3)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
declare r record; n int := 0; v_failed int := 0;
begin
  for r in
    select id, contractor_id, client_id, request_id
      from jobs
     where status = 'pending_confirmation'
       and disputed_at is null
       and payment_status <> 'disputed'
       and price_change_pending is null
       -- Never auto-confirm a job whose balance is still outstanding: confirming
       -- is what authorises the 93% transfer.
       and (payment_status <> 'held' or coalesce(fully_funded, false))
       and contractor_completed_at < now() - make_interval(days => p_days)
  loop
    begin
      update jobs set status = 'completed', client_confirmed_at = now() where id = r.id;
      update client_requests set status = 'completed' where id = r.request_id;
      perform public._notify(r.contractor_id, 'job_confirmed', 'Job auto-confirmed',
        'The job was automatically confirmed complete after '||p_days||' days.', r.id);
      perform public._notify(r.client_id, 'job_confirmed', 'Job auto-confirmed',
        'We auto-confirmed your completed job after '||p_days||' days with no response.', r.id);
      n := n + 1;
    exception when others then
      -- One unhappy row must not stop the sweep. reconcile-payouts is the
      -- safety net for the money side either way.
      v_failed := v_failed + 1;
      raise warning 'auto_confirm_stale_jobs: job % skipped: %', r.id, sqlerrm;
    end;
  end loop;
  if v_failed > 0 then
    raise warning 'auto_confirm_stale_jobs: % confirmed, % skipped', n, v_failed;
  end if;
  return n;
end;
$function$;

-- auto_queue_outreach_for_request()   grants: {postgres=X/postgres,service_role=X/postgres}
CREATE OR REPLACE FUNCTION public.auto_queue_outreach_for_request()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
declare
  v_reach int;
  v_res   jsonb;
  v_n     int;
  a       record;
begin
  begin
    if new.status is distinct from 'pending' or coalesce(new.waitlisted, false) then
      return new;
    end if;

    v_reach := public.trade_reach(new.service_needed);
    if v_reach >= public.outreach_gap_threshold() then
      return new;
    end if;

    with pick as (
      select id from public.contractor_outreach
       where status = 'new'
         and not unsubscribed
         and trade = new.service_needed
       order by created_at
       limit 25
       for update skip locked
    )
    update public.contractor_outreach o
       set status = 'pending', queued_at = now(), queued_for = new.id
      from pick
     where o.id = pick.id;

    get diagnostics v_n = row_count;

    for a in select id from public.profiles where role = 'admin' loop
      perform public._notify(
        a.id,
        'outreach_gap',
        'Thin trade: ' || new.service_needed,
        case when v_n > 0
          then v_n || ' cold-outreach companies are queued and waiting for you to send. '
               || 'Only ' || v_reach || ' active pros match this job.'
          else 'Only ' || v_reach || ' active pros match this job and we hold no '
               || 'outreach contacts for this trade yet.'
        end,
        null
      );
    end loop;
  exception when others then
    raise warning 'auto_queue_outreach_for_request skipped for %: %', new.id, sqlerrm;
  end;

  return new;
end $function$;

-- bid_media_path_ok(p_name text)   grants: {postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres}
CREATE OR REPLACE FUNCTION public.bid_media_path_ok(p_name text)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
  -- CASE short-circuits, so the shape test runs BEFORE either ::uuid cast.
  -- A loose regex here is not cosmetic: a 36-character non-uuid would raise
  -- inside a WITH CHECK, which surfaces to the user as an unexplained failure.
  select case
    when p_name !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}/[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}/.+$'
      then false
    else
      -- The client who owns the request, and only into the folder of a pro who
      -- actually bid on it. Mirrors "the client opens the thread".
      exists (
        select 1
        from public.client_requests r
        join public.bids b
          on b.request_id = r.id
         and b.contractor_id = (split_part(p_name, '/', 2))::uuid
        where r.id = (split_part(p_name, '/', 1))::uuid
          and r.user_id = (select auth.uid())
      )
      or
      -- The pro, and only once the client has actually written first — the same
      -- test the message INSERT policy applies, so an upload can never get ahead
      -- of the rule it exists to serve.
      (
        (split_part(p_name, '/', 2))::uuid = (select auth.uid())
        and public.bid_thread_open(
              (split_part(p_name, '/', 1))::uuid,
              (select auth.uid()))
      )
  end
$function$;

-- bid_thread_open(p_request_id uuid, p_contractor_id uuid)   grants: {postgres=X/postgres,anon=X/postgres,authenticated=X/postgres,service_role=X/postgres}
CREATE OR REPLACE FUNCTION public.bid_thread_open(p_request_id uuid, p_contractor_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
  select exists (
    select 1
      from public.messages m
      join public.client_requests r on r.id = m.request_id
     where m.request_id = p_request_id
       and m.thread_contractor_id = p_contractor_id
       and m.sender_id = r.user_id
  );
$function$;

-- block_bids_on_waitlisted()   grants: {postgres=X/postgres,service_role=X/postgres}
CREATE OR REPLACE FUNCTION public.block_bids_on_waitlisted()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
begin
  if exists (select 1 from public.client_requests r
              where r.id = new.request_id and r.waitlisted) then
    raise exception 'This job is not open for bids right now.';
  end if;
  return new;
end;
$function$;

-- budget_grade(p_budget_mid numeric, p_benchmark numeric)   grants: {=X/postgres,postgres=X/postgres,anon=X/postgres,authenticated=X/postgres,service_role=X/postgres}
CREATE OR REPLACE FUNCTION public.budget_grade(p_budget_mid numeric, p_benchmark numeric)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
  select case
    when p_budget_mid is null or p_benchmark is null or p_benchmark <= 0 then null
    when p_budget_mid >= p_benchmark * 1.15 then 'A+'
    when p_budget_mid >= p_benchmark * 0.90 then 'A'
    else 'A-'
  end;
$function$;

-- build_contract_body(p_job_id uuid)   grants: {postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres}
CREATE OR REPLACE FUNCTION public.build_contract_body(p_job_id uuid)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
declare
  v_uid uuid := (select auth.uid());
  v_job record;
begin
  select client_id, contractor_id into v_job from public.jobs where id = p_job_id;
  if not found then
    raise exception 'job not found';
  end if;

  -- auth.uid() reads the JWT claim from the session, not the executing role, so
  -- this still identifies the real caller when reached through save_contract_draft.
  if v_uid is null
     or not (v_uid = v_job.contractor_id or v_uid = v_job.client_id or public.is_admin())
  then
    raise exception 'not authorized to view this agreement';
  end if;

  return public.build_contract_body_internal(p_job_id);
end
$function$;

-- build_contract_body_internal(p_job_id uuid)   grants: {postgres=X/postgres,service_role=X/postgres}
CREATE OR REPLACE FUNCTION public.build_contract_body_internal(p_job_id uuid)
 RETURNS text
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
declare
  j            record;
  v_comp       record;
  v_trade      text;
  v_article    text;
  v_client     text;
  v_company    text;
  v_contractor text;
  v_start      text;
  v_price      text;
  v_permits    text := '';
  v_changes    text := '';
  v_stages     text := '';
  v_fee        numeric;
  v_total      numeric;
  v_dep_rate   numeric;
  v_due_now    numeric;
  v_balance    numeric;
  v_totals     text;
  v_body       text;
begin
  select
    jb.id, jb.amount, jb.client_fee, jb.total_charged, jb.is_milestone,
    jb.scheduled_at, jb.prepayment_id, jb.deposit_rate,
    r.service_needed, r.job_description, r.location, r.recurring, r.recurring_frequency,
    cp.first_name  as c_first, cp.last_name  as c_last,
    pp.first_name  as p_first, pp.last_name  as p_last,
    ct.company_name as company
  into j
  from public.jobs jb
  left join public.client_requests r  on r.id  = jb.request_id
  left join public.profiles       cp on cp.id = jb.client_id
  left join public.profiles       pp on pp.id = jb.contractor_id
  left join public.contractors    ct on ct.id = jb.contractor_id
  where jb.id = p_job_id;

  if not found then return null; end if;

  v_client     := nullif(trim(coalesce(j.c_first,'')||' '||coalesce(j.c_last,'')), '');
  v_contractor := nullif(trim(coalesce(j.p_first,'')||' '||coalesce(j.p_last,'')), '');
  v_company    := coalesce(j.company, v_contractor, 'the contractor');
  v_start      := coalesce(
                    to_char(j.scheduled_at at time zone 'America/Edmonton', 'FMDay, FMMonth FMDD, YYYY "at" FMHH12:MI am'),
                    'a date to be arranged between the parties');

  -- price / payment section
  if j.is_milestone then
    select string_agg(
             '- Stage '||seq||': '||title||' — $'||to_char((amount + coalesce(client_fee,0)), 'FM999999990.00'),
             E'\n' order by seq)
      into v_stages
      from public.job_milestones where job_id = p_job_id;
    v_price := 'This is a staged (milestone) job. You approve and fund each stage in order; nothing is charged until you fund a stage, and each stage is held securely and released to the contractor only after you approve that stage''s work.'
               || case when v_stages is not null then E'\n\n'||v_stages else '' end;
  elsif j.prepayment_id is not null or coalesce(j.recurring,false) then
    v_price := 'This is a recurring job'
               || case when j.recurring_frequency is not null then ' ('||j.recurring_frequency||')' else '' end
               || '. Each visit is approved and paid separately, or drawn from a prepaid pool you choose to set up. Funds for a visit are held securely and released to the contractor after you confirm that visit is complete.';
  else
    -- Fall back to the platform rate while the job is still unpaid. A referral
    -- credit can only ever reduce the fee at checkout, so this is the ceiling.
    v_fee   := coalesce(j.client_fee, round(coalesce(j.amount,0) * public.platform_fee_rate(), 2));
    v_total := coalesce(j.total_charged, coalesce(j.amount,0) + v_fee);

    v_totals := 'Job price $'||to_char(coalesce(j.amount,0),'FM999999990.00')
                || ' + service fee $'||to_char(v_fee,'FM999999990.00')
                || ' = total $'||to_char(v_total,'FM999999990.00')||'.';

    v_dep_rate := coalesce(j.deposit_rate, 1);
    if v_dep_rate > 0 and v_dep_rate < 1 then
      -- The deposit is a share of the job price; the service fee is charged
      -- once, with the deposit. Rounding must never push it past the total.
      v_due_now := least(round(coalesce(j.amount,0) * v_dep_rate, 2) + v_fee, v_total);
      v_balance := greatest(v_total - v_due_now, 0);
      v_price := v_totals || E'\n\n'
                 || 'You pay this in two parts:' || E'\n'
                 || '- $'||to_char(v_due_now,'FM999999990.00')||' when you book — a '
                    ||to_char(round(v_dep_rate * 100), 'FM990')||'% deposit on the job price, plus the service fee.' || E'\n'
                 || '- $'||to_char(v_balance,'FM999999990.00')||' once the work is finished.' || E'\n\n'
                 || 'Both payments are held securely and are only released to the contractor after you confirm the work is complete. The contractor is not paid anything from the deposit before then.';
    else
      v_price := v_totals || ' Your payment is held securely and only released to the contractor after you confirm the work is complete.';
    end if;
  end if;

  -- What happens when the price moves after signing. Milestone jobs are excluded
  -- because public.propose_price_change() hard-refuses them: a stage job changes
  -- price by changing a stage, which the stage approval already covers above.
  -- Deliberately worded in CHARGING terms ("nothing is charged at the new price
  -- until you approve it") rather than "no change takes effect", because on an
  -- unpaid job propose_price_change applies the new amount immediately and
  -- re-opens the client's approval — the money is what waits, not the number.
  -- The decline route is the messages + hello@freddyfixit.ca, matching the
  -- cancellation clause below, and NOT a promise of a button: on a job that is
  -- already held, job_money_block() refuses decline_price_reopen, so a promised
  -- self-serve decline would be a clause we cannot honour.
  if not j.is_milestone then
    v_changes :=
      '## If the price changes' || E'\n' ||
      'The price above is based on the job as described and on what '||v_company||' could see when the estimate was given. It can change if the work turns out to be bigger than expected, or if materials cost more than estimated.' || E'\n\n' ||
      '- Any change must be put to you with what is changing and why. Nothing is charged at the new price until you approve it.' || E'\n' ||
      '- Anything you have already paid is not re-collected and is not recalculated. If this job is still only part-paid, the whole of an increase is added to the payment due at the end. If you have already paid in full, you are asked for the difference at the moment you approve the change, and nothing is taken until you do.' || E'\n' ||
      '- The service fee is recalculated on the final job price, at the same percentage shown above.' || E'\n' ||
      '- If the price goes down, you pay the lower amount, and the service fee comes down with it.' || E'\n' ||
      '- You do not have to accept an increase. Say so in the messages on this job, or contact hello@freddyfixit.ca. If an increase is not agreed, the job does not go ahead at the new price, and your cancellation rights below still apply.' || E'\n\n' ||
      'Ask for the reason in the messages on this job rather than in person, so the record of what was agreed stays with the job.' || E'\n\n';
  end if;

  -- Permits & certification. Data-driven from public.service_compulsory, which
  -- follows Alberta's Restricted Activities lists. Only appears on trades where
  -- the work is actually certificate-gated, so it can't become boilerplate the
  -- client skims past. Unknown label => no section, never a false claim.
  select sc.compulsory, sc.trade into v_comp
    from public.service_compulsory sc
   where lower(btrim(sc.service)) = lower(btrim(coalesce(j.service_needed, '')));

  if coalesce(v_comp.compulsory, false) then
    v_trade   := coalesce(v_comp.trade, 'certified tradesperson');
    v_article := case when v_trade ~* '^[aeiou]' then 'an ' else 'a ' end;
    v_permits :=
      '## Permits & certification' || E'\n' ||
      'Alberta restricts this kind of work to certified tradespeople. It must be carried out by '
        || v_article || v_trade
        || ' holding a journeyperson certificate, or by a registered apprentice working under one.' || E'\n\n' ||
      'Work like this often needs a City of Calgary permit and an inspection. Unless the scope of work above says otherwise, '
        || v_company
        || ' is responsible for determining whether a permit is required, taking it out before starting, and giving you the permit number and the final inspection result. Any permit fee is included in the price above.' || E'\n\n' ||
      'This matters after the job is done: work that needed a permit and never got one can be refused by your insurer and must be disclosed when you sell the property. If you are told no permit is needed, ask for that in writing in the messages on this job.' || E'\n\n';
  end if;

  v_body :=
    '# Service Agreement' || E'\n\n' ||
    '**Contractor:** ' || v_company || case when v_contractor is not null and v_contractor <> v_company then ' ('||v_contractor||')' else '' end || E'\n' ||
    '**Client:** ' || coalesce(v_client, 'the client') || E'\n' ||
    '**Service address:** ' || coalesce(j.location, 'the address on file') || E'\n' ||
    '**Service:** ' || coalesce(j.service_needed, 'the requested service') || E'\n' ||
    '**Start:** ' || v_start || E'\n\n' ||
    '## Scope of work' || E'\n' ||
    coalesce(nullif(trim(j.job_description),''), coalesce(j.service_needed,'As discussed between the parties.')) || E'\n\n' ||
    '## Price & payment' || E'\n' || v_price || E'\n\n' ||
    v_changes ||
    v_permits ||
    '## Your cancellation rights (Alberta)' || E'\n' ||
    'Because payment is collected before the work is finished, you may cancel this agreement without penalty within 10 days of receiving your written copy. If the work has not started within 30 days of the agreed date, you may cancel for up to one year. On a valid cancellation we refund any funds still held (not yet released to the contractor) within 15 days. To cancel, contact hello@freddyfixit.ca. These rights are in addition to, and do not waive, your rights under Alberta''s Consumer Protection Act.' || E'\n\n' ||
    'This agreement is governed by the Freddy Fix It User Agreement (freddyfixit.ca/user-agreement). Freddy FixIt Contractors Inc. operates the platform that connects the parties and facilitates payment; the work itself is contracted directly between the contractor and the client.';

  return v_body;
end $function$;

-- chat_agree_time(p_job_id uuid)   grants: {postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres}
CREATE OR REPLACE FUNCTION public.chat_agree_time(p_job_id uuid)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_uid  uuid := auth.uid();
  v_job  record;
  v_at   timestamptz;
  v_mode text;
  v_name text;
begin
  select * into v_job from public.jobs where id = p_job_id;
  if v_job.id is null then raise exception 'Job not found'; end if;
  if v_uid is null or v_uid not in (v_job.client_id, v_job.contractor_id) then
    raise exception 'Not your job';
  end if;
  if v_job.chat_time_at is null or v_job.chat_time_resolved_at is not null then
    raise exception 'There is no time waiting on your answer';
  end if;
  if v_job.chat_time_by = v_uid then
    raise exception 'You suggested this time — the other side needs to accept it';
  end if;

  v_at := v_job.chat_time_at;

  if v_job.status = 'scheduled' then
    -- Already booked and paid for: this is just a change of time, agreed by both.
    update public.jobs set
      scheduled_at              = v_at,
      client_confirmed_visit_at = now(),
      client_rescheduled_at     = null,
      reschedule_accepted_at    = null,
      visit_reminder_sent_at    = null,
      chat_time_resolved_at     = now()
    where id = p_job_id;
    v_mode := 'scheduled';

  elsif v_job.status = 'assigned' and v_job.schedule_proposed_at is not null
        and v_job.client_approved_at is null then
    -- An estimate is on the table awaiting the client. Move the time only —
    -- the client still has to approve and pay before it becomes a booking.
    update public.jobs set
      scheduled_at          = v_at,
      schedule_proposed_at  = now(),
      chat_time_resolved_at = now()
    where id = p_job_id;
    v_mode := 'proposal_updated';

  elsif v_job.status in ('assigned','in_progress') then
    -- No estimate yet: pencil the time in so it shows on the calendar.
    update public.jobs set
      scheduled_at          = v_at,
      chat_time_resolved_at = now()
    where id = p_job_id;
    v_mode := 'penciled';

  else
    update public.jobs set chat_time_resolved_at = now() where id = p_job_id;
    return 'ignored';
  end if;

  select nullif(trim(coalesce(first_name,'') || ' ' || coalesce(last_name,'')), '')
    into v_name from public.profiles where id = v_uid;

  perform public._notify(
    v_job.chat_time_by,
    'chat_time_agreed',
    'Your time was accepted',
    coalesce(v_name, 'The other party') || ' accepted ' ||
      to_char(v_at at time zone 'America/Edmonton', 'FMDay FMMon FMDD at FMHH12:MIam') ||
      case v_mode
        when 'proposal_updated' then '. The client still needs to approve the estimate before it is booked.'
        when 'penciled'         then '. It is pencilled in — send your estimate to lock it in.'
        else '. It is on the calendar.'
      end,
    p_job_id
  );

  return v_mode;
end;
$function$;

-- chat_decline_time(p_job_id uuid)   grants: {postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres}
CREATE OR REPLACE FUNCTION public.chat_decline_time(p_job_id uuid)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_uid uuid := auth.uid();
  v_job record;
begin
  select * into v_job from public.jobs where id = p_job_id;
  if v_job.id is null then raise exception 'Job not found'; end if;
  if v_uid is null or v_uid not in (v_job.client_id, v_job.contractor_id) then
    raise exception 'Not your job';
  end if;

  update public.jobs set chat_time_resolved_at = now()
  where id = p_job_id and chat_time_resolved_at is null;

  return 'declined';
end;
$function$;

-- chat_flag_reasons(p_text text)   grants: {=X/postgres,postgres=X/postgres,anon=X/postgres,authenticated=X/postgres,service_role=X/postgres}
CREATE OR REPLACE FUNCTION public.chat_flag_reasons(p_text text)
 RETURNS text[]
 LANGUAGE plpgsql
 IMMUTABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  t text := coalesce(p_text, '');
  r text[] := '{}';
begin
  if t ~ '(\+?1[\s.\-]*)?\(?\d{3}\)?[\s.\-]*\d{3}[\s.\-]*\d{4}' then
    r := r || 'phone'::text;
  end if;

  if t ~* '[[:alnum:]._%+\-]+@[[:alnum:]\-]+\.[[:alpha:]]{2,}' then
    r := r || 'email'::text;
  end if;

  if t ~* '\m(whats\s?app|telegram|snap\s?chat|wechat|viber|imessage)\M' then
    r := r || 'messaging_app'::text;
  end if;

  if t ~* '\m(instagram|kijiji|craigslist|marketplace)\M'
     or t ~* '(^|\s)@[[:alnum:]._]{3,}' then
    r := r || 'social'::text;
  end if;

  if t ~* '\m(e[\s\-]?transfer|interac|venmo|paypal|zelle|cash\s?app|wire\s+transfer)\M'
     or t ~* '\m(pay|paid|paying)\M[^.!?]{0,30}\m(cash|directly|in\s+person|under\s+the\s+table)\M'
     or t ~* '\m(cash\s+only|under\s+the\s+table)\M' then
    r := r || 'payment'::text;
  end if;

  if t ~* '\m(off|outside|around|skip|bypass|avoid)\M[^.!?]{0,25}\m(the\s+)?(app|platform|site|website|freddy|fee|fees|commission)\M'
     or t ~* '\m(deal|book|hire|work)\M[^.!?]{0,15}\mdirectly\M' then
    r := r || 'off_platform'::text;
  end if;

  return r;
end;
$function$;

-- chat_guard()   grants: {postgres=X/postgres,service_role=X/postgres}
CREATE OR REPLACE FUNCTION public.chat_guard()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_reasons text[];
begin
  v_reasons := public.chat_flag_reasons(new.content);
  if array_length(v_reasons, 1) > 0 then
    new.blocked      := true;
    new.flag_reasons := v_reasons;
  end if;
  return new;
end;
$function$;

-- chat_propose_time(p_job_id uuid, p_at timestamp with time zone, p_snippet text)   grants: {postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres}
CREATE OR REPLACE FUNCTION public.chat_propose_time(p_job_id uuid, p_at timestamp with time zone, p_snippet text DEFAULT NULL::text)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_uid   uuid := auth.uid();
  v_job   record;
  v_other uuid;
  v_name  text;
begin
  select * into v_job from public.jobs where id = p_job_id;
  if v_job.id is null then raise exception 'Job not found'; end if;
  if v_uid is null or v_uid not in (v_job.client_id, v_job.contractor_id) then
    raise exception 'Not your job';
  end if;
  if v_job.status in ('completed','cancelled','pending_confirmation') then
    return 'ignored';
  end if;
  if p_at is null or p_at <= now() then
    return 'ignored';
  end if;

  -- Same time already on the table from the same person: nothing to do.
  if v_job.chat_time_resolved_at is null
     and v_job.chat_time_by = v_uid
     and v_job.chat_time_at = p_at then
    return 'duplicate';
  end if;

  update public.jobs set
    chat_time_at          = p_at,
    chat_time_by          = v_uid,
    chat_time_proposed_at = now(),
    chat_time_msg         = left(coalesce(p_snippet, ''), 300),
    chat_time_resolved_at = null
  where id = p_job_id;

  v_other := case when v_uid = v_job.client_id then v_job.contractor_id else v_job.client_id end;
  select nullif(trim(coalesce(first_name,'') || ' ' || coalesce(last_name,'')), '')
    into v_name from public.profiles where id = v_uid;

  if v_other is not null then
    perform public._notify(
      v_other,
      'chat_time_proposed',
      'A time was suggested in your chat',
      coalesce(v_name, 'The other party') || ' suggested ' ||
        to_char(p_at at time zone 'America/Edmonton', 'FMDay FMMon FMDD at FMHH12:MIam') ||
        '. Accept it or suggest another time.',
      p_job_id
    );
  end if;

  return 'proposed';
end;
$function$;

-- chat_rate_check(p_ip text, p_limit integer, p_window_secs integer)   grants: {postgres=X/postgres,service_role=X/postgres}
CREATE OR REPLACE FUNCTION public.chat_rate_check(p_ip text, p_limit integer, p_window_secs integer)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  new_count int;
begin
  if p_ip is null or p_ip = '' then
    return true; -- can't identify caller; don't block
  end if;
  insert into public.chat_rate_limit as t (ip, window_start, count)
  values (p_ip, now(), 1)
  on conflict (ip) do update set
    window_start = case when t.window_start < now() - make_interval(secs => p_window_secs)
                        then now() else t.window_start end,
    count        = case when t.window_start < now() - make_interval(secs => p_window_secs)
                        then 1 else t.count + 1 end
  returning t.count into new_count;
  return new_count <= p_limit;
end; $function$;

-- check_signup_availability(p_email text, p_phone text)   grants: {=X/postgres,postgres=X/postgres,anon=X/postgres,authenticated=X/postgres,service_role=X/postgres}
CREATE OR REPLACE FUNCTION public.check_signup_availability(p_email text, p_phone text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
declare
  v_email  text := lower(trim(coalesce(p_email,'')));
  v_digits text := regexp_replace(coalesce(p_phone,''),'\D','','g');
  v_email_taken boolean := false;
  v_phone_taken boolean := false;
begin
  if not public.rl_hit('signup_availability', 10, 3600) then
    return jsonb_build_object('email_taken', false, 'phone_taken', false, 'rate_limited', true);
  end if;

  if v_email <> '' then
    select exists(select 1 from auth.users u where lower(u.email) = v_email)
        or exists(select 1 from public.profiles p where lower(coalesce(p.email,'')) = v_email)
      into v_email_taken;
  end if;
  if length(v_digits) >= 10 then
    select exists(
      select 1 from public.profiles p
      where regexp_replace(coalesce(p.phone,''),'\D','','g') <> ''
        and right(regexp_replace(coalesce(p.phone,''),'\D','','g'),10) = right(v_digits,10)
    ) into v_phone_taken;
  end if;
  return jsonb_build_object('email_taken', v_email_taken, 'phone_taken', v_phone_taken);
end;
$function$;

-- client_remove_request(p_request_id uuid)   grants: {postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres}
CREATE OR REPLACE FUNCTION public.client_remove_request(p_request_id uuid)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_owner    uuid;
  v_assigned uuid;
  v_has_job  boolean;
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;
  select user_id, assigned_contractor_id into v_owner, v_assigned
    from public.client_requests where id = p_request_id;
  if v_owner is null then raise exception 'Request not found'; end if;
  if v_owner is distinct from auth.uid() then
    raise exception 'You do not have permission to remove this request';
  end if;

  select exists(select 1 from public.jobs j where j.request_id = p_request_id)
    into v_has_job;

  if v_assigned is null and not v_has_job then
    delete from public.client_requests where id = p_request_id;
    return 'deleted';
  else
    update public.client_requests set status = 'cancelled' where id = p_request_id;
    update public.jobs set status = 'cancelled'
      where request_id = p_request_id and status in ('assigned','in_progress');
    return 'cancelled';
  end if;
end;
$function$;

-- client_reschedule_visit(p_job_id uuid, p_scheduled_at timestamp with time zone)   grants: {postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres}
CREATE OR REPLACE FUNCTION public.client_reschedule_visit(p_job_id uuid, p_scheduled_at timestamp with time zone)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
declare
  v_client     uuid;
  v_contractor uuid;
  v_status     text;
  v_at         timestamptz;
begin
  select client_id, contractor_id, status, scheduled_at
    into v_client, v_contractor, v_status, v_at
    from jobs where id = p_job_id;

  if v_client is null then raise exception 'Job not found'; end if;
  if v_client <> auth.uid() then raise exception 'Not authorized'; end if;
  if v_status not in ('scheduled','assigned') then
    raise exception 'This job can no longer be rescheduled here';
  end if;
  if p_scheduled_at <= now() then raise exception 'Pick a time in the future'; end if;

  if v_at is not null
     and v_at - now() < interval '24 hours'
     and public.contract_signed(p_job_id)
  then
    raise exception 'Your visit is less than 24 hours away, so the time can''t be changed here — your pro has set the day aside for you. Message them in the job chat and agree a new time together, and it will update automatically.';
  end if;

  update jobs
     set scheduled_at              = p_scheduled_at,
         client_rescheduled_at     = now(),
         client_confirmed_visit_at = null,
         reschedule_accepted_at    = null,
         schedule_proposed_at      = now(),
         client_approved_at        = null,
         status                    = 'assigned'
   where id = p_job_id;

  perform public.notify_user(v_contractor, 'reschedule_requested',
    'Client moved the visit',
    'The client changed the time to '||coalesce(public.ff_local_ts(p_scheduled_at),'a new time')||
    '. Open the job to accept it, or propose a different time if you''re not available.',
    'https://freddyfixit.ca/contractor-dashboard', 'Review new time');
end; $function$;

-- client_update_request(p_request_id uuid, p_service text, p_schedule text, p_location text, p_description text)   grants: {postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres}
CREATE OR REPLACE FUNCTION public.client_update_request(p_request_id uuid, p_service text, p_schedule text, p_location text, p_description text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_owner uuid;
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;
  select user_id into v_owner from public.client_requests where id = p_request_id;
  if v_owner is null then raise exception 'Request not found'; end if;
  if v_owner is distinct from auth.uid() then
    raise exception 'You do not have permission to edit this request';
  end if;

  update public.client_requests
     set service_needed     = coalesce(p_service, service_needed),
         preferred_schedule = coalesce(p_schedule, preferred_schedule),
         location           = coalesce(p_location, location),
         job_description    = coalesce(p_description, job_description)
   where id = p_request_id;
end;
$function$;

-- complete_milestone(p_milestone uuid, p_photo text)   grants: {postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres}
CREATE OR REPLACE FUNCTION public.complete_milestone(p_milestone uuid, p_photo text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_m public.job_milestones%rowtype;
  v_job public.jobs%rowtype;
  v_photo text;
begin
  select * into v_m from public.job_milestones where id = p_milestone;
  if not found then
    raise exception 'Milestone not found';
  end if;
  select * into v_job from public.jobs where id = v_m.job_id;
  if auth.uid() is null or (not public.is_admin() and auth.uid() <> v_job.contractor_id) then
    raise exception 'Only the assigned contractor can complete this stage';
  end if;
  if v_m.status <> 'funded' then
    raise exception 'This stage must be funded before it can be completed';
  end if;

  v_photo := coalesce(p_photo, v_m.completion_photo_path);

  if not public.is_admin() then
    if v_photo is null then
      raise exception 'Add a photo of the finished work for this stage — the client can''t release payment without it.';
    end if;
    if v_job.before_photo_path is null and v_job.created_at >= public.photo_rules_start() then
      raise exception 'Add your "before" photo for this job first — the one you take when you arrive.';
    end if;
  end if;

  update public.job_milestones
     set status = 'completed',
         completed_at = now(),
         completion_photo_path = v_photo
   where id = p_milestone;

  if v_job.client_id is not null then
    perform public._notify(
      v_job.client_id, 'milestone_completed',
      'Stage completed: ' || v_m.title,
      'Your contractor marked "' || v_m.title || '" complete. Review and release payment for this stage.',
      v_m.job_id);
  end if;
end;
$function$;

-- complete_walkthrough(p_job_id uuid)   grants: {=X/postgres,postgres=X/postgres,anon=X/postgres,authenticated=X/postgres,service_role=X/postgres}
CREATE OR REPLACE FUNCTION public.complete_walkthrough(p_job_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare v_contractor uuid; v_client uuid; v_approved timestamptz;
begin
  select contractor_id, client_id, walkthrough_approved_at
    into v_contractor, v_client, v_approved
    from jobs where id = p_job_id;
  if v_contractor is null then raise exception 'Job not found'; end if;
  if auth.uid() is null or v_contractor <> auth.uid() then raise exception 'Not authorized'; end if;
  if v_approved is null then raise exception 'The walkthrough has not been approved yet'; end if;

  update jobs set walkthrough_done_at = now() where id = p_job_id;

  perform public._notify(v_client, 'walkthrough_done', 'Walkthrough complete',
    'Your contractor finished the walkthrough. Their estimate is on the way - you''ll get a notification when it lands.', p_job_id);
end; $function$;

-- confirm_job_address(p_job_id uuid, p_address text)   grants: {postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres}
CREATE OR REPLACE FUNCTION public.confirm_job_address(p_job_id uuid, p_address text)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
declare
  v_client uuid;
  v_status text;
  v_pay text;
  v_addr text := btrim(coalesce(p_address, ''));
begin
  -- `auth.uid() is null` is tested FIRST, and the order is load-bearing.
  -- `v_client <> auth.uid()` evaluates to NULL when auth.uid() is NULL, and a
  -- NULL `if` condition DOES NOT FIRE -- so the obvious one-line owner check
  -- lets an unauthenticated caller fall straight through the guard. That exact
  -- shape was found latent in set_job_autopay, open_dispute,
  -- respond_to_dispute and confirm_job_completion. Do not collapse these.
  if auth.uid() is null then
    raise exception 'Not authorized';
  end if;

  select client_id, status, payment_status
    into v_client, v_status, v_pay
    from public.jobs where id = p_job_id;

  if v_client is null then raise exception 'Job not found'; end if;
  if v_client <> auth.uid() then raise exception 'Not authorized'; end if;

  -- Deliberately NOT write-once. A typo in a street address sends a pro to the
  -- wrong house, so it stays editable for the whole live life of the job; only
  -- a finished or cancelled job freezes it, where it is a historical record.
  if v_status = 'cancelled' then
    raise exception 'This job was cancelled, so its address can no longer be changed.';
  end if;
  if v_pay = 'released' then
    raise exception 'This job is finished and paid out, so its address can no longer be changed. Message your pro if something needs correcting.';
  end if;

  -- The bar is low on purpose. This gate sits directly in front of the deposit,
  -- so over-strict validation here is a client who cannot pay and a contractor
  -- who is never paid -- the ghost-client shape, reached from a new direction.
  -- It only has to reject an obviously-empty answer, and the message names the
  -- exact fix rather than saying "invalid".
  if length(v_addr) < 8 or v_addr !~ '\d' then
    raise exception 'Please enter the full street address, including the house or unit number.';
  end if;

  update public.jobs
     set service_address = v_addr,
         service_address_at = now()
   where id = p_job_id;

  return v_addr;
end;
$function$;

-- confirm_job_completion(p_job_id uuid)   grants: {postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres}
CREATE OR REPLACE FUNCTION public.confirm_job_completion(p_job_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
declare
  v_contractor uuid; v_client uuid; v_status text; v_req uuid; v_pay text;
  v_pending jsonb; v_funded numeric; v_total numeric; v_full boolean;
begin
  select contractor_id, client_id, status, request_id, payment_status, price_change_pending,
         funded_amount, total_charged, fully_funded
    into v_contractor, v_client, v_status, v_req, v_pay, v_pending,
         v_funded, v_total, v_full
    from jobs where id = p_job_id;
  if v_client is null then raise exception 'Job not found'; end if;
  if auth.uid() is null or v_client <> auth.uid() then raise exception 'Not authorized'; end if;
  if v_pay = 'disputed' then raise exception 'This job is under dispute and cannot be confirmed yet.'; end if;
  if v_pending is not null then raise exception 'Please approve or decline your pro''s proposed price change before confirming.'; end if;
  -- PAYOUT GUARD 1 -- unchanged.
  if v_pay = 'held' and not coalesce(v_full, false) then
    raise exception 'Please pay the remaining balance of $% before confirming the work is done.',
      to_char(greatest(coalesce(v_total,0) - coalesce(v_funded,0), 0), 'FM999999990.00');
  end if;
  if v_status <> 'pending_confirmation' then raise exception 'Job is not awaiting confirmation'; end if;

  update jobs set status = 'completed', client_confirmed_at = now() where id = p_job_id;
  update client_requests set status = 'completed' where id = v_req;

  perform public._notify(v_contractor, 'job_confirmed', 'Job confirmed complete',
    'The client confirmed the job is done. Nice work!', p_job_id);
  perform public.notify_email('job_confirmed_contractor', p_job_id);
end; $function$;

-- confirm_visit(p_job_id uuid)   grants: {=X/postgres,postgres=X/postgres,anon=X/postgres,authenticated=X/postgres,service_role=X/postgres}
CREATE OR REPLACE FUNCTION public.confirm_visit(p_job_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare v_client uuid; v_contractor uuid; v_at timestamptz; v_status text;
begin
  select client_id, contractor_id, scheduled_at, status
    into v_client, v_contractor, v_at, v_status
    from jobs where id = p_job_id;
  if v_client is null then raise exception 'Job not found'; end if;
  if auth.uid() is null or v_client <> auth.uid() then raise exception 'Not authorized'; end if;
  if v_status not in ('scheduled','assigned','in_progress') then
    raise exception 'This job is not awaiting a visit';
  end if;

  update jobs set client_confirmed_visit_at = now() where id = p_job_id;

  perform public._notify(v_contractor, 'visit_confirmed', 'Client confirmed the visit',
    'The client confirmed they''ll be ready for '||
    coalesce(public.ff_local_ts(v_at),'the agreed time')||'.', p_job_id);
end; $function$;

-- consume_internal_token(p_token text, p_purpose text)   grants: {postgres=X/postgres,service_role=X/postgres}
CREATE OR REPLACE FUNCTION public.consume_internal_token(p_token text, p_purpose text)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
declare v_ok boolean;
begin
  if p_token is null or p_token = '' then return false; end if;
  update public.internal_tokens
     set used_at = now()
   where token   = p_token
     and purpose = p_purpose
     and used_at is null
     and expires_at > now()
  returning true into v_ok;
  return coalesce(v_ok, false);
end $function$;

-- consume_prepaid_occurrence(p_job uuid)   grants: {=X/postgres,postgres=X/postgres,anon=X/postgres,authenticated=X/postgres,service_role=X/postgres}
CREATE OR REPLACE FUNCTION public.consume_prepaid_occurrence(p_job uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
declare
  v_job record;
  v_plan uuid;
  v_rp record;
  v_linked int;
  v_seq int;
  v_fee numeric;
  v_total numeric;
begin
  select j.id, j.client_id, j.request_id, j.payment_status, j.prepayment_id, j.amount,
         cr.recurring, cr.recurring_parent_id
    into v_job
  from jobs j join client_requests cr on cr.id = j.request_id
  where j.id = p_job;
  if not found then raise exception 'job not found'; end if;

  -- Caller must own the job (or be admin).
  if v_job.client_id <> (select auth.uid())
     and not exists (select 1 from profiles p where p.id=(select auth.uid()) and p.role='admin') then
    raise exception 'not authorized';
  end if;

  if v_job.prepayment_id is not null then return true; end if;              -- already funded from a pool
  if v_job.payment_status = 'held' or v_job.payment_status = 'released' then return false; end if;

  v_plan := coalesce(v_job.recurring_parent_id, v_job.request_id);

  select rp.* into v_rp
  from recurring_prepayments rp
  where rp.plan_request_id = v_plan
    and rp.status in ('held','partially_released')
  order by rp.created_at asc
  limit 1;
  if not found then return false; end if;

  -- How many occurrences are already committed (linked jobs not refunded)?
  select count(*) into v_linked from jobs j
  where j.prepayment_id = v_rp.id and coalesce(j.payment_status,'') <> 'refunded';
  if v_linked >= v_rp.occurrences_total then return false; end if;          -- pool exhausted

  v_seq := v_linked + 1;
  -- A referral waives the service fee on the FIRST occurrence only, and the pool
  -- was charged one fee short to match. Read the stamped flag rather than
  -- re-deciding eligibility here, or the jobs stop summing to what was collected.
  v_fee := case when coalesce(v_rp.fee_waived, false) and v_seq = 1
                then 0::numeric else v_rp.client_fee_per end;
  v_total := v_rp.amount_per_occurrence + v_fee;

  update jobs
    set prepayment_id = v_rp.id,
        prepayment_seq = v_seq,
        payment_status = 'held',
        total_charged = v_total,
        -- MONEY INVARIANT: 'held' alone is not enough to pay out. This visit's
        -- share of the pool is already collected, so it is fully funded the
        -- moment it is linked.
        funded_amount = v_total,
        client_fee = v_fee,
        platform_fee = v_rp.commission_per,
        contractor_payout = v_rp.payout_per,
        paid_at = now()
  where id = p_job;

  return true;
end;
$function$;

-- consume_referral_waiver(p_client uuid, p_job_id uuid)   grants: {postgres=X/postgres,service_role=X/postgres}
CREATE OR REPLACE FUNCTION public.consume_referral_waiver(p_client uuid, p_job_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
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

-- contract_ready(p_job_id uuid)   grants: {postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres}
CREATE OR REPLACE FUNCTION public.contract_ready(p_job_id uuid)
 RETURNS text
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
declare
  j record;
  v_payouts boolean;
begin
  select id, amount, scheduled_at, client_approved_at, is_milestone,
         milestone_schedule_status, status, contractor_id
    into j
    from jobs where id = p_job_id;

  if j.id is null then
    return 'This job could not be found.';
  end if;

  if coalesce(j.amount, 0) <= 0 then
    return 'Add your price to this job first — the agreement has to show what the client is agreeing to pay.';
  end if;

  if j.scheduled_at is null then
    return 'Book a visit time first — the agreement has to show when the work is happening.';
  end if;

  if j.client_approved_at is null then
    return 'Wait for the client to approve your time and price — then the agreement will match what they agreed to.';
  end if;

  if coalesce(j.is_milestone, false)
     and coalesce(j.milestone_schedule_status, '') <> 'approved' then
    return 'Wait for the client to approve your stage-by-stage payment plan before you send the agreement.';
  end if;

  select coalesce(stripe_payouts_enabled, false)
    into v_payouts
    from contractors where id = j.contractor_id;

  if not coalesce(v_payouts, false) then
    return 'Set up your payout account before sending this agreement — the client cannot pay for the job until your account is connected. Open your dashboard and click Set up payouts; it takes about five minutes.';
  end if;

  return null;
end;
$function$;

-- contract_required(p_job_id uuid)   grants: {postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres}
CREATE OR REPLACE FUNCTION public.contract_required(p_job_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
  -- A signed service agreement is now required before payment on EVERY job.
  -- Returns true whenever the job exists (false only for a missing/invalid id).
  select exists (select 1 from public.jobs where id = p_job_id);
$function$;

-- contract_signed(p_job_id uuid)   grants: {postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres}
CREATE OR REPLACE FUNCTION public.contract_signed(p_job_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
  select exists (
    select 1 from public.job_contracts c
    where c.job_id = p_job_id and c.status = 'signed'
  );
$function$;

-- contractor_accept_reschedule(p_job_id uuid)   grants: {=X/postgres,postgres=X/postgres,anon=X/postgres,authenticated=X/postgres,service_role=X/postgres}
CREATE OR REPLACE FUNCTION public.contractor_accept_reschedule(p_job_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare v_client uuid; v_contractor uuid; v_at timestamptz; v_resched timestamptz;
begin
  select client_id, contractor_id, scheduled_at, client_rescheduled_at
    into v_client, v_contractor, v_at, v_resched
    from jobs where id = p_job_id;
  if v_contractor is null then raise exception 'Job not found'; end if;
  if auth.uid() is null or v_contractor <> auth.uid() then raise exception 'Not authorized'; end if;
  if v_resched is null then raise exception 'No client reschedule to accept'; end if;

  update jobs
     set status = 'scheduled',
         client_approved_at = now(),
         reschedule_accepted_at = now()
   where id = p_job_id;

  perform public._notify(v_client, 'reschedule_accepted', 'New time confirmed',
    'Your contractor confirmed the visit for '||
    coalesce(public.ff_local_ts(v_at),'the new time')||'.', p_job_id);
end; $function$;

-- contractor_on_my_way(p_job_id uuid)   grants: {=X/postgres,postgres=X/postgres,anon=X/postgres,authenticated=X/postgres,service_role=X/postgres}
CREATE OR REPLACE FUNCTION public.contractor_on_my_way(p_job_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare v_contractor uuid; v_client uuid; v_status text; v_already timestamptz;
begin
  select contractor_id, client_id, status, on_my_way_at
    into v_contractor, v_client, v_status, v_already
    from jobs where id = p_job_id;
  if v_contractor is null then raise exception 'Job not found'; end if;
  if auth.uid() is null or v_contractor <> auth.uid() then raise exception 'Not authorized'; end if;
  if v_status not in ('scheduled','in_progress') then raise exception 'Job is not in a state where you can mark on-the-way'; end if;
  if v_already is not null then return; end if;

  update jobs set on_my_way_at = now() where id = p_job_id;

  perform public._notify(v_client, 'on_my_way', 'Your contractor is on the way',
    'Your contractor just marked that they''re on their way. They should arrive around your scheduled time.', p_job_id);
end; $function$;

-- contractor_price_grade(p_contractor uuid)   grants: {=X/postgres,postgres=X/postgres,anon=X/postgres,authenticated=X/postgres,service_role=X/postgres}
CREATE OR REPLACE FUNCTION public.contractor_price_grade(p_contractor uuid)
 RETURNS TABLE(grade text, ratio numeric, sample_count integer, grade_source text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  with priced as (
    select j.amount as amount, r.service_needed as service, 'jobs' as src
    from public.jobs j
    join public.client_requests r on r.id = j.request_id
    where j.contractor_id = p_contractor
      and j.status = 'completed'
      and j.amount is not null and j.amount > 0
    union all
    select b.amount, r.service_needed, 'bids'
    from public.bids b
    join public.client_requests r on r.id = b.request_id
    where b.contractor_id = p_contractor
      and b.amount is not null and b.amount > 0
      and not exists (
        select 1 from public.jobs j2
        where j2.contractor_id = p_contractor
          and j2.request_id = b.request_id
          and j2.status = 'completed'
      )
  ),
  best as (
    select * from priced
    where src = (select case when bool_or(src = 'jobs') then 'jobs' else 'bids' end from priced)
  ),
  ratios as (
    select best.amount / sb.benchmark as r
    from best
    cross join lateral public.service_benchmark(best.service) sb
    where sb.benchmark is not null and sb.benchmark > 0
  )
  select
    case
      when count(*) < 3 then null
      when avg(r) <= 0.90 then 'A+'
      when avg(r) <= 1.15 then 'A'
      else 'A-'
    end as grade,
    round(avg(r), 3) as ratio,
    count(*)::int as sample_count,
    (select case when bool_or(src = 'jobs') then 'jobs' else 'bids' end from priced) as grade_source
  from ratios;
$function$;

-- contractor_response_stats(p_ids uuid[])   grants: {=X/postgres,postgres=X/postgres,anon=X/postgres,authenticated=X/postgres,service_role=X/postgres}
CREATE OR REPLACE FUNCTION public.contractor_response_stats(p_ids uuid[] DEFAULT NULL::uuid[])
 RETURNS TABLE(contractor_id uuid, median_minutes integer, sample integer)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select b.contractor_id,
         percentile_cont(0.5) within group (
           order by extract(epoch from (b.created_at - cr.created_at)) / 60.0
         )::int as median_minutes,
         count(*)::int as sample
  from public.bids b
  join public.client_requests cr on cr.id = b.request_id
  where b.created_at > now() - interval '120 days'
    and b.created_at >= cr.created_at
    and (
      (p_ids is not null and b.contractor_id = any(p_ids))
      or (p_ids is null and b.contractor_id = auth.uid())
    )
  group by b.contractor_id
  having count(*) >= 2;
$function$;

-- contractor_update_job(p_job_id uuid, p_status text, p_scheduled_date date, p_notes text)   grants: {postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres}
CREATE OR REPLACE FUNCTION public.contractor_update_job(p_job_id uuid, p_status text, p_scheduled_date date, p_notes text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_contractor uuid;
  v_request    uuid;
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;
  select contractor_id, request_id into v_contractor, v_request
    from public.jobs where id = p_job_id;
  if v_contractor is null then raise exception 'Job not found'; end if;
  if v_contractor is distinct from auth.uid() then
    raise exception 'You are not assigned to this job';
  end if;
  if p_status is not null and p_status not in ('assigned','in_progress','completed') then
    raise exception 'Invalid status';
  end if;

  update public.jobs
     set status         = coalesce(p_status, status),
         scheduled_date = p_scheduled_date,
         notes          = p_notes
   where id = p_job_id;

  if p_status = 'assigned' then
    update public.client_requests set status = 'matched'
      where id = v_request and status <> 'cancelled';
  elsif p_status = 'in_progress' then
    update public.client_requests set status = 'in_progress'
      where id = v_request and status <> 'cancelled';
  elsif p_status = 'completed' then
    update public.client_requests set status = 'completed'
      where id = v_request and status <> 'cancelled';
  end if;
end;
$function$;

-- contractor_withdraw_job(p_job_id uuid)   grants: {postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres}
CREATE OR REPLACE FUNCTION public.contractor_withdraw_job(p_job_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_contractor uuid;
  v_request    uuid;
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;
  select contractor_id, request_id into v_contractor, v_request
    from public.jobs where id = p_job_id;
  if v_contractor is null then raise exception 'Job not found'; end if;
  if v_contractor is distinct from auth.uid() then
    raise exception 'You are not assigned to this job';
  end if;

  update public.jobs set status = 'cancelled' where id = p_job_id;
  update public.client_requests
     set status = 'pending', assigned_contractor_id = null
   where id = v_request;
end;
$function$;

-- decline_bid(p_bid_id uuid)   grants: {postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres}
CREATE OR REPLACE FUNCTION public.decline_bid(p_bid_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
declare
  v_req        uuid;
  v_contractor uuid;
  v_bid_status text;
  v_owner      uuid;
  v_status     text;
  v_service    text;
  v_left       int;
  v_repost     jsonb := jsonb_build_object('reposted', false, 'refired', false, 'reach', 0);
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;

  select b.request_id, b.contractor_id, b.status
    into v_req, v_contractor, v_bid_status
    from public.bids b where b.id = p_bid_id;

  select r.user_id, r.status, r.service_needed
    into v_owner, v_status, v_service
    from public.client_requests r where r.id = v_req;

  -- One message for "no such bid" and for "not yours", so the id space cannot
  -- be probed for which bids exist.
  if v_req is null or v_owner is null or v_owner is distinct from auth.uid() then
    raise exception 'Bid not found';
  end if;

  if v_status is distinct from 'pending' then
    raise exception 'You have already picked a pro for this job, so bids can no longer be declined.';
  end if;

  if v_bid_status = 'declined' then
    -- Idempotent: a double-tap is not an error.
    select count(*) into v_left from public.bids
     where request_id = v_req and status <> 'declined';
    return v_repost || jsonb_build_object('declined', true, 'bids_left', v_left);
  end if;

  update public.bids
     set status = 'declined', declined_by_client_at = now()
   where id = p_bid_id;

  perform public.notify_user(v_contractor, 'bid_declined', 'The client passed on your bid',
    'The client went a different direction on ' || coalesce(v_service, 'a job')
      || '. Your other bids are unaffected — there are more jobs on your board.',
    'https://freddyfixit.ca/contractor-dashboard', 'See open jobs');

  select count(*) into v_left from public.bids
   where request_id = v_req and status <> 'declined';

  if v_left = 0 then
    v_repost := public._repost_request_internal(v_req);
  end if;

  return v_repost || jsonb_build_object('declined', true, 'bids_left', v_left);
end $function$;

-- decline_price_change(p_job_id uuid)   grants: {=X/postgres,postgres=X/postgres,anon=X/postgres,authenticated=X/postgres,service_role=X/postgres}
CREATE OR REPLACE FUNCTION public.decline_price_change(p_job_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare v_contractor uuid; v_client uuid; v_pending jsonb;
begin
  select contractor_id, client_id, price_change_pending
    into v_contractor, v_client, v_pending
    from jobs where id = p_job_id;
  if v_client is null then raise exception 'Job not found'; end if;
  if auth.uid() is null or v_client <> auth.uid() then raise exception 'Not authorized'; end if;
  if v_pending is null then raise exception 'There is no pending price change'; end if;

  update jobs set price_change_pending = null, price_change_proposed_at = null where id = p_job_id;

  perform public._notify(v_contractor, 'price_change_declined', 'Price change declined',
    'The client declined your proposed price change. The original price stands.', p_job_id);
end; $function$;

-- decline_price_reopen(p_job_id uuid)   grants: {postgres=X/postgres,anon=X/postgres,authenticated=X/postgres,service_role=X/postgres}
CREATE OR REPLACE FUNCTION public.decline_price_reopen(p_job_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
declare
  v_client uuid; v_contractor uuid; v_req uuid; v_block text; v_reopened int;
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;

  select client_id, contractor_id, request_id
    into v_client, v_contractor, v_req
    from jobs where id = p_job_id;
  if v_client is null then raise exception 'Job not found'; end if;
  if auth.uid() is null or v_client <> auth.uid() then raise exception 'Not authorized'; end if;

  v_block := public.job_money_block(p_job_id);
  if v_block is not null then
    raise exception '%', v_block;
  end if;

  -- Void this job. Nothing is deleted: the chat, the agreement and the history
  -- all survive on the cancelled row.
  update jobs set status = 'cancelled',
    price_hike_from = null, price_hike_reason = null, price_hike_at = null,
    price_change_pending = null, price_change_proposed_at = null
  where id = p_job_id;

  -- Re-open the request to other pros. preferred_contractor_id is cleared too,
  -- or a rehire reservation would hand it straight back to the same pro.
  update client_requests
    set status = 'pending', assigned_contractor_id = null, preferred_contractor_id = null
  where id = v_req;

  -- Offending pro is out; resurface every other bid so the client can re-pick.
  update bids set status = 'declined' where request_id = v_req and contractor_id = v_contractor;
  update bids set status = 'pending'  where request_id = v_req and contractor_id <> v_contractor;
  get diagnostics v_reopened = row_count;

  perform public.notify_user(v_contractor, 'job_reopened', 'The client declined your price change',
    'The client did not accept the new price and has re-opened the job to other pros. It is no longer assigned to you.',
    'https://freddyfixit.ca/contractor-dashboard', 'View jobs');
end;
$function$;

-- decline_walkthrough(p_job_id uuid, p_reason text)   grants: {=X/postgres,postgres=X/postgres,anon=X/postgres,authenticated=X/postgres,service_role=X/postgres}
CREATE OR REPLACE FUNCTION public.decline_walkthrough(p_job_id uuid, p_reason text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare v_contractor uuid; v_client uuid;
begin
  select contractor_id, client_id into v_contractor, v_client from jobs where id = p_job_id;
  if v_client is null then raise exception 'Job not found'; end if;
  if auth.uid() is null or v_client <> auth.uid() then raise exception 'Not authorized'; end if;

  update jobs
     set walkthrough_proposed_at = null, walkthrough_at = null,
         walkthrough_approved_at = null, walkthrough_note = null
   where id = p_job_id;

  perform public._notify(v_contractor, 'walkthrough_declined', 'Walkthrough time declined',
    'The client declined your proposed walkthrough time'||
    coalesce(': "'||left(p_reason,300)||'"','')||'. Propose another time or send an estimate.', p_job_id);
end; $function$;

-- dispute_milestone(p_milestone uuid, p_reason text)   grants: {postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres}
CREATE OR REPLACE FUNCTION public.dispute_milestone(p_milestone uuid, p_reason text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_m public.job_milestones%rowtype;
  v_job public.jobs%rowtype;
begin
  select * into v_m from public.job_milestones where id = p_milestone;
  if not found then
    raise exception 'Milestone not found';
  end if;
  select * into v_job from public.jobs where id = v_m.job_id;
  if auth.uid() is null or (not public.is_admin() and auth.uid() <> v_job.client_id) then
    raise exception 'Only the client can dispute this stage';
  end if;
  if v_m.status not in ('funded','completed') then
    raise exception 'Only a funded or completed stage can be disputed';
  end if;

  update public.job_milestones
     set status = 'disputed',
         disputed_at = now(),
         dispute_reason = p_reason
   where id = p_milestone;

  if v_job.contractor_id is not null then
    perform public._notify(
      v_job.contractor_id, 'milestone_disputed',
      'Stage disputed: ' || v_m.title,
      'The client opened a dispute on "' || v_m.title || '". The rest of the schedule is paused until it is resolved.',
      v_m.job_id);
  end if;
end;
$function$;

-- enforce_platform_pause()   grants: {postgres=X/postgres,service_role=X/postgres}
CREATE OR REPLACE FUNCTION public.enforce_platform_pause()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
declare
  v_mode text;
begin
  -- auth.uid() is null for cron/service-role paths such as
  -- generate_recurring_occurrences(); those must keep working.
  if auth.uid() is null or public.is_admin() then
    return new;
  end if;

  v_mode := public.platform_mode();

  if v_mode = 'paused' then
    raise exception 'PLATFORM_PAUSED'
      using hint = 'New requests are paused while we rebuild. Join the waitlist and we''ll email you the moment we reopen.';
  end if;

  if v_mode = 'waitlist' then
    new.waitlisted := true;
    -- park the person too, so the reopen email has somebody to go to even if
    -- they never come back to the dashboard
    begin
      insert into public.waitlist (name, email, phone, service, description, source)
      values (
        nullif(trim(coalesce(new.first_name,'') || ' ' || coalesce(new.last_name,'')), ''),
        new.email, new.phone, new.service_needed, new.job_description, 'request_during_waitlist')
      on conflict do nothing;
    exception when others then
      raise warning 'waitlist capture skipped for request %: %', new.id, sqlerrm;
    end;
  end if;

  return new;
end;
$function$;

-- enforce_unique_signup_phone()   grants: {postgres=X/postgres,service_role=X/postgres}
CREATE OR REPLACE FUNCTION public.enforce_unique_signup_phone()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_digits text := regexp_replace(coalesce(new.raw_user_meta_data->>'phone',''),'\D','','g');
begin
  if length(v_digits) >= 10 then
    if exists(
      select 1 from public.profiles p
      where regexp_replace(coalesce(p.phone,''),'\D','','g') <> ''
        and right(regexp_replace(coalesce(p.phone,''),'\D','','g'),10) = right(v_digits,10)
    ) then
      raise exception 'PHONE_TAKEN: an account with this phone number already exists';
    end if;
  end if;
  return new;
end;
$function$;

-- enqueue_admin_alert(p_event text, p_id uuid)   grants: {postgres=X/postgres,service_role=X/postgres}
CREATE OR REPLACE FUNCTION public.enqueue_admin_alert(p_event text, p_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_url  text := coalesce(current_setting('app.supabase_url', true),
                          'https://kvypmjxbbaaknvddwwai.supabase.co')
                 || '/functions/v1/admin-alert';
  v_anon text := '<ANON_KEY>';
begin
  begin
    perform net.http_post(
      url     := v_url,
      headers := jsonb_build_object(
        'Content-Type',  'application/json',
        'Authorization', 'Bearer ' || v_anon
      ),
      body    := jsonb_build_object('event', p_event, 'id', p_id)
    );
  exception when others then
    raise warning 'admin-alert enqueue failed (%): %', p_event, sqlerrm;
  end;
end;
$function$;

-- enqueue_payment_receipt(p_event text, p_id uuid)   grants: {postgres=X/postgres,service_role=X/postgres}
CREATE OR REPLACE FUNCTION public.enqueue_payment_receipt(p_event text, p_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_url  text := coalesce(current_setting('app.supabase_url', true),
                          'https://kvypmjxbbaaknvddwwai.supabase.co')
                 || '/functions/v1/payment-receipt';
  v_anon text := '<ANON_KEY>';
begin
  begin
    perform net.http_post(
      url     := v_url,
      headers := jsonb_build_object(
        'Content-Type',  'application/json',
        'Authorization', 'Bearer ' || v_anon
      ),
      body    := jsonb_build_object('event', p_event, 'id', p_id)
    );
  exception when others then
    raise warning 'payment-receipt enqueue failed (%): %', p_event, sqlerrm;
  end;
end;
$function$;

-- ensure_profile(p_role text)   grants: {postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres}
CREATE OR REPLACE FUNCTION public.ensure_profile(p_role text DEFAULT NULL::text)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
declare
  v_uid uuid := auth.uid();
  v_email text;
  meta jsonb;
  v_role text;
  v_first text;
  v_last text;
  v_full text;
  v_local text;
begin
  if v_uid is null then
    raise exception 'Not signed in';
  end if;

  select role into v_role from public.profiles where id = v_uid;

  if v_role is null then
    select email, coalesce(raw_user_meta_data, '{}'::jsonb)
      into v_email, meta
      from auth.users where id = v_uid;

    v_role := coalesce(
      nullif(meta->>'role',''),
      nullif(meta->>'user_type',''),
      nullif(p_role,''),
      'client');
    if v_role not in ('client','contractor') then
      v_role := 'client';
    end if;

    v_full  := nullif(trim(coalesce(meta->>'full_name', meta->>'name', '')), '');
    v_first := coalesce(
      nullif(meta->>'first_name',''),
      nullif(meta->>'given_name',''),
      nullif(split_part(coalesce(v_full,''), ' ', 1), ''));
    v_last := coalesce(
      nullif(meta->>'last_name',''),
      nullif(meta->>'family_name',''),
      nullif(trim(regexp_replace(coalesce(v_full,''), '^\S+\s*', '')), ''));

    -- Fall back to the email local-part (e.g. "jane.doe42@..." -> Jane / Doe).
    if v_first is null then
      v_local := regexp_replace(split_part(coalesce(v_email,''), '@', 1), '[0-9]+$', '');
      v_local := trim(regexp_replace(v_local, '[._+-]+', ' ', 'g'));
      v_first := nullif(initcap(split_part(v_local, ' ', 1)), '');
      v_last  := coalesce(v_last, nullif(initcap(nullif(trim(regexp_replace(v_local, '^\S+\s*', '')), '')), ''));
    end if;

    insert into public.profiles (id, email, first_name, last_name, phone, role)
    values (v_uid, v_email, v_first, v_last, nullif(meta->>'phone',''), v_role)
    on conflict (id) do nothing;

    select role into v_role from public.profiles where id = v_uid;
  end if;

  if v_role = 'contractor' then
    insert into public.contractors (id) values (v_uid)
    on conflict (id) do nothing;
  end if;

  return v_role;
end;
$function$;

-- escalate_stale_unbid_requests(p_hours integer)   grants: {postgres=X/postgres,service_role=X/postgres}
CREATE OR REPLACE FUNCTION public.escalate_stale_unbid_requests(p_hours integer DEFAULT 24)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
declare
  req      record;
  adm      record;
  ctr      record;
  required text[];
  n_match  int;
  n_done   int := 0;
begin
  for req in
    select cr.*
    from client_requests cr
    where cr.status = 'pending'
      and cr.waitlisted is not true
      and cr.no_bid_escalated_at is null
      and cr.created_at < now() - make_interval(hours => p_hours)
      and not exists (select 1 from bids b where b.request_id = cr.id)
      and not exists (select 1 from jobs j where j.request_id = cr.id)
  loop
    required := public.service_specialties(req.service_needed);

    select count(*) into n_match
    from contractors c
    where c.status = 'active'
      and (required is null or c.specialties && required);

    for adm in select id from profiles where role = 'admin' loop
      perform public._notify(
        adm.id,
        'no_quotes_alert',
        '⚠️ Job still has no quotes',
        coalesce(req.service_needed,'A request')
          || coalesce(' in '||req.location,'')
          || ' has had no bids for '||p_hours||'h. '
          || case when n_match = 0
                  then 'No active contractor matches this trade — source one or quote it directly.'
                  else n_match||' matching contractor(s) were re-notified. Consider assigning or quoting it yourself.'
             end,
        null
      );
    end loop;

    if n_match > 0 then
      for ctr in
        select c.id from contractors c
        where c.status = 'active'
          and (required is null or c.specialties && required)
      loop
        perform public._notify(
          ctr.id,
          'job_still_open',
          'Job still open in your field',
          coalesce(req.service_needed,'A job')
            || coalesce(' in '||public.mask_location(req.location),'')
            || ' is still waiting for a quote — place a bid before it fills up.',
          null
        );
      end loop;
    end if;

    update client_requests set no_bid_escalated_at = now() where id = req.id;
    n_done := n_done + 1;
  end loop;

  return n_done;
end;
$function$;

-- escalate_unpaid_balances(p_days integer)   grants: {postgres=X/postgres,service_role=X/postgres}
CREATE OR REPLACE FUNCTION public.escalate_unpaid_balances(p_days integer DEFAULT 10)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
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
$function$;

-- ff_local_ts(p timestamp with time zone)   grants: {=X/postgres,postgres=X/postgres,anon=X/postgres,authenticated=X/postgres,service_role=X/postgres}
CREATE OR REPLACE FUNCTION public.ff_local_ts(p timestamp with time zone)
 RETURNS text
 LANGUAGE sql
 STABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$ select to_char(p at time zone 'America/Edmonton', 'FMDay FMMon FMDD at FMHH12:MIam') $function$;

-- freq_interval(p_freq text)   grants: {=X/postgres,postgres=X/postgres,anon=X/postgres,authenticated=X/postgres,service_role=X/postgres}
CREATE OR REPLACE FUNCTION public.freq_interval(p_freq text)
 RETURNS interval
 LANGUAGE plpgsql
 IMMUTABLE
 SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
declare
  f text := lower(coalesce(p_freq,''));
  m text[];
begin
  m := regexp_match(f, '^every_([0-9]+)_weeks?$');
  if m is not null then
    return (m[1]::int) * interval '7 days';
  end if;
  m := regexp_match(f, '^every_([0-9]+)_months?$');
  if m is not null then
    return (m[1]::int) * interval '1 month';
  end if;
  return case f
    when 'weekly' then interval '7 days'
    when 'biweekly' then interval '14 days'
    when 'monthly' then interval '1 month'
    when 'quarterly' then interval '3 months'
    when 'seasonal' then interval '3 months'
    when 'semiannual' then interval '6 months'
    when 'biannual' then interval '6 months'
    when 'annual' then interval '1 year'
    when 'yearly' then interval '1 year'
    else interval '1 month'
  end;
end;
$function$;

-- gen_referral_code()   grants: {=X/postgres,postgres=X/postgres,anon=X/postgres,authenticated=X/postgres,service_role=X/postgres}
CREATE OR REPLACE FUNCTION public.gen_referral_code()
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
DECLARE v_code text; v_exists boolean;
BEGIN
  LOOP
    -- 6-char code, avoids ambiguous chars 0/O/1/I
    v_code := upper(substr(translate(encode(extensions.gen_random_bytes(6),'base64'),'0O1Il/+=','23456789'),1,6));
    v_exists := null;
    SELECT true INTO v_exists FROM public.profiles WHERE referral_code = v_code;
    EXIT WHEN v_exists IS NULL;
  END LOOP;
  RETURN v_code;
END; $function$;

-- generate_recurring_occurrences()   grants: {postgres=X/postgres,service_role=X/postgres}
CREATE OR REPLACE FUNCTION public.generate_recurring_occurrences()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  r record;
  d date;
  v_last timestamptz;
  v_due timestamptz;
  v_pro uuid;
  v_new uuid;
  n int := 0;
  c_lead interval := interval '7 days';   -- how far ahead a fixed date is queued
begin
  for r in
    select cr.*
    from client_requests cr
    where cr.recurring = true
      and coalesce(cr.recurring_plan_status,'active') = 'active'
      and cr.recurring_parent_id is null                       -- only plan rows, never occurrences
      and (cr.recurring_end_date is null or cr.recurring_end_date >= current_date)
      and (cr.recurring_start_date is null or cr.recurring_start_date <= current_date)
  loop
    v_pro := coalesce(r.assigned_contractor_id, r.preferred_contractor_id);

    -- ── 1. Fixed specific dates (additive, one occurrence per date) ──
    if r.recurring_dates is not null then
      foreach d in array r.recurring_dates loop
        -- Only queue once its lead window has arrived, and never twice.
        if d >= current_date
           and current_date >= (d - c_lead)
           and not exists (
             select 1 from client_requests o
             where o.recurring_parent_id = r.id
               and o.recurring_source_date = d
           ) then
          insert into client_requests (
            user_id, first_name, last_name, email, phone,
            service_needed, preferred_schedule, location, job_description,
            status, client_type, business_name, business_type, locations,
            vehicle_details, recurring, recurring_parent_id, recurring_source_date,
            preferred_contractor_id
          ) values (
            r.user_id, r.first_name, r.last_name, r.email, r.phone,
            r.service_needed, 'On '||to_char(d,'FMMon FMDD, YYYY'), r.location, r.job_description,
            'pending', r.client_type, r.business_name, r.business_type, r.locations,
            r.vehicle_details, false, r.id, d, v_pro
          ) returning id into v_new;

          perform public.notify_user(
            r.user_id, 'recurring_generated',
            'Your scheduled '||coalesce(r.service_needed,'service')||' visit is coming up',
            'Your '||coalesce(r.service_needed,'service')||' visit for '||to_char(d,'FMMon FMDD')||
            ' is queued. Review the details and confirm your booking.',
            'https://freddyfixit.ca/client-dashboard', 'Review booking');

          if v_pro is not null then
            begin
              perform public._notify(v_pro, 'recurring_reserved',
                'Scheduled job reserved for you',
                'A client you''ve worked with has a '||coalesce(r.service_needed,'service')||
                ' visit on '||to_char(d,'FMMon FMDD')||'. It''s reserved for you for 48 hours.', v_new);
            exception when others then null;
            end;
          end if;

          n := n + 1;
        end if;
      end loop;
    end if;

    -- ── 2. Cadence occurrences (single outstanding at a time) ──
    if coalesce(r.recurring_frequency,'') <> '' then
      -- Skip if this plan already has an outstanding (not finished) cadence occurrence.
      if exists (
        select 1 from client_requests o
        where o.recurring_parent_id = r.id
          and o.recurring_source_date is null            -- cadence occurrences only
          and o.status not in ('completed','cancelled','canceled','closed')
      ) then
        continue;
      end if;

      select max(j.client_confirmed_at) into v_last
      from jobs j
      join client_requests cc on cc.id = j.request_id
      where (cc.id = r.id or cc.recurring_parent_id = r.id) and j.status = 'completed';

      v_last := coalesce(v_last,
                         (r.recurring_start_date)::timestamptz,
                         r.created_at);
      v_due := v_last + public.recurrence_interval(r.recurring_frequency);

      if now() < v_due then
        continue;
      end if;

      insert into client_requests (
        user_id, first_name, last_name, email, phone,
        service_needed, preferred_schedule, location, job_description,
        status, client_type, business_name, business_type, locations,
        vehicle_details, recurring, recurring_parent_id, preferred_contractor_id
      ) values (
        r.user_id, r.first_name, r.last_name, r.email, r.phone,
        r.service_needed, 'Recurring', r.location, r.job_description,
        'pending', r.client_type, r.business_name, r.business_type, r.locations,
        r.vehicle_details, false, r.id, v_pro
      ) returning id into v_new;

      update client_requests set recurring_next_due = (v_due + public.recurrence_interval(r.recurring_frequency))::date
      where id = r.id;

      perform public.notify_user(
        r.user_id, 'recurring_generated',
        'Your recurring '||coalesce(r.service_needed,'service')||' is due',
        'We''ve queued your next '||coalesce(r.service_needed,'service')||
        ' visit. Review the details and confirm your booking.',
        'https://freddyfixit.ca/client-dashboard', 'Review booking');

      if v_pro is not null then
        begin
          perform public._notify(v_pro, 'recurring_reserved',
            'Recurring job reserved for you',
            'A client you''ve worked with has a recurring '||coalesce(r.service_needed,'service')||
            ' visit due. It''s reserved for you for 48 hours.', v_new);
        exception when others then null;
        end;
      end if;

      n := n + 1;
    end if;
  end loop;
  return n;
end;
$function$;

-- get_bids_by_token(p_token uuid)   grants: {postgres=X/postgres,anon=X/postgres,authenticated=X/postgres,service_role=X/postgres}
CREATE OR REPLACE FUNCTION public.get_bids_by_token(p_token uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
declare
  v_req record;
  v_bids jsonb;
begin
  if p_token is null then return null; end if;

  select r.id, r.status, r.service_needed, r.job_description, r.created_at,
         r.assigned_contractor_id,
         trim(coalesce(p.first_name,'')) as client_first
    into v_req
    from client_requests r
    left join profiles p on p.id = r.user_id
   where r.pick_token = p_token;

  if v_req.id is null then
    return jsonb_build_object('found', false);
  end if;

  -- View stamp. In its own block so a failure here can never stop the client
  -- seeing their estimates. Skipped for service_role, because send-bid-email
  -- calls this same function every time it builds an estimate email and that
  -- is not the client looking.
  if coalesce(auth.role(), '') <> 'service_role' then
  begin
    update client_requests
       set pick_first_viewed_at = coalesce(pick_first_viewed_at, now()),
           pick_last_viewed_at  = now(),
           pick_views           = pick_views + 1
     where id = v_req.id;
  exception when others then
    raise warning 'pick view stamp failed: %', sqlerrm;
  end;
  end if;

  select coalesce(jsonb_agg(x order by x->>'sort_key'), '[]'::jsonb) into v_bids
  from (
    select jsonb_build_object(
             'bid_id',        b.id,
             'contractor_id', b.contractor_id,
             'name',          nullif(trim(coalesce(pr.first_name,'')), ''),
             'company',       nullif(trim(coalesce(c.company_name,'')), ''),
             'rating',        c.rating,
             'rating_count',  c.rating_count,
             'total_jobs',    c.total_jobs,
             'years',         c.years_of_experience,
             'photo_url',     c.photo_url,
             'specialties',   c.specialties,
             'amount',        b.amount,
             'price_low',     b.price_low,
             'price_high',    b.price_high,
             'walkthrough',   coalesce(b.walkthrough_requested, false),
             'message',       b.message,
             'created_at',    b.created_at,
             -- priced bids first (cheapest first), walkthrough offers after
             'sort_key',      case when coalesce(b.walkthrough_requested,false)
                                   then '1' else '0' end
                              || lpad(coalesce(b.amount, b.price_low, 0)::bigint::text, 12, '0')
           ) as x
      from bids b
      join profiles pr on pr.id = b.contractor_id
      left join contractors c on c.id = b.contractor_id
     where b.request_id = v_req.id
       and b.status <> 'declined'
  ) s;

  return jsonb_build_object(
    'found',            true,
    'status',           v_req.status,
    'already_matched',  v_req.status <> 'pending',
    'service',          v_req.service_needed,
    'description',      v_req.job_description,
    'client_first',     nullif(v_req.client_first, ''),
    'created_at',       v_req.created_at,
    'bids',             v_bids
  );
end; $function$;

-- get_client_rewind()   grants: {=X/postgres,postgres=X/postgres,anon=X/postgres,authenticated=X/postgres,service_role=X/postgres}
CREATE OR REPLACE FUNCTION public.get_client_rewind()
 RETURNS json
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT json_build_object(
    'jobs_completed', (select count(*) from jobs where client_id=auth.uid() and status='completed'),
    'total_spent',    coalesce((select sum(total_charged) from jobs where client_id=auth.uid() and payment_status in ('held','released')),0),
    'estimated_saved',coalesce((select sum(greatest(coalesce(sp.typical_high,0) - j.amount,0))
                        from jobs j join client_requests r on r.id=j.request_id
                        left join service_pricing sp on sp.service = split_part(r.service_needed,',',1)
                        where j.client_id=auth.uid() and j.amount is not null),0),
    'top_service',    (select r.service_needed from jobs j join client_requests r on r.id=j.request_id
                        where j.client_id=auth.uid() group by r.service_needed order by count(*) desc limit 1),
    'favorite_pro',   (select c.company_name from jobs j join contractors c on c.id=j.contractor_id
                        where j.client_id=auth.uid() group by c.company_name order by count(*) desc limit 1),
    'pros_hired',     (select count(distinct contractor_id) from jobs where client_id=auth.uid()),
    'first_name',     (select first_name from profiles where id=auth.uid()),
    'member_since',   (select extract(year from created_at)::int from profiles where id=auth.uid()),
    'referral_code',  (select referral_code from profiles where id=auth.uid())
  );
$function$;

-- get_contractor_directory()   grants: {=X/postgres,postgres=X/postgres,anon=X/postgres,authenticated=X/postgres,service_role=X/postgres}
CREATE OR REPLACE FUNCTION public.get_contractor_directory()
 RETURNS TABLE(id uuid, first_name text, last_name text, specialties text[], service_area text[], years_of_experience integer, availability jsonb, photo_url text, rating numeric, total_jobs integer, rating_price numeric, rating_experience numeric, rating_result numeric, rating_count integer, google_reviews_url text, company_name text, price_grade text, price_ratio numeric, price_sample_count integer, id_verified boolean, insurance_on_file boolean, wcb_on_file boolean)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
  select p.id, p.first_name, p.last_name,
         c.specialties, c.service_area, c.years_of_experience,
         c.availability, c.photo_url, c.rating, c.total_jobs,
         c.rating_price, c.rating_experience, c.rating_result,
         c.rating_count, c.google_reviews_url, c.company_name,
         g.grade, g.ratio, g.sample_count,
         coalesce(c.stripe_payouts_enabled, false),
         coalesce(nullif(c.doc_urls->>'insurance', ''), '') <> '',
         coalesce(nullif(c.doc_urls->>'wcb', ''), '') <> ''
  from public.contractors c
  join public.profiles p on p.id = c.id
  left join lateral public.contractor_price_grade(c.id) g on true
  where c.status = 'active';
$function$;

-- get_contractor_earnings_stats()   grants: {=X/postgres,postgres=X/postgres,anon=X/postgres,authenticated=X/postgres,service_role=X/postgres}
CREATE OR REPLACE FUNCTION public.get_contractor_earnings_stats()
 RETURNS json
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT json_build_object(
    'this_week',  coalesce((select sum(contractor_payout) from jobs where contractor_id=auth.uid() and payment_status='released' and released_at >= date_trunc('week', now())),0),
    'this_month', coalesce((select sum(contractor_payout) from jobs where contractor_id=auth.uid() and payment_status='released' and released_at >= date_trunc('month', now())),0),
    'last_month', coalesce((select sum(contractor_payout) from jobs where contractor_id=auth.uid() and payment_status='released' and released_at >= date_trunc('month', now()) - interval '1 month' and released_at < date_trunc('month', now())),0),
    'this_year',  coalesce((select sum(contractor_payout) from jobs where contractor_id=auth.uid() and payment_status='released' and released_at >= date_trunc('year', now())),0),
    'lifetime',   coalesce((select sum(contractor_payout) from jobs where contractor_id=auth.uid() and payment_status='released'),0),
    'jobs_this_week', coalesce((select count(*) from jobs where contractor_id=auth.uid() and payment_status='released' and released_at >= date_trunc('week', now())),0),
    'pending',    coalesce((select sum(contractor_payout) from jobs where contractor_id=auth.uid() and payment_status='held'),0),
    'weekly_goal',(select weekly_goal from contractors where id=auth.uid()),
    'trend', (
      select coalesce(jsonb_agg(jsonb_build_object('week', to_char(wk,'Mon DD'), 'amount', amt) order by wk), '[]'::jsonb)
      from (
        select gs.wk, coalesce((select sum(j.contractor_payout) from jobs j
                 where j.contractor_id=auth.uid() and j.payment_status='released'
                   and date_trunc('week', j.released_at) = gs.wk),0) as amt
        from generate_series(date_trunc('week', now()) - interval '7 weeks', date_trunc('week', now()), interval '1 week') gs(wk)
      ) t
    )
  );
$function$;

-- get_contractor_profile(p_id uuid)   grants: {=X/postgres,postgres=X/postgres,anon=X/postgres,authenticated=X/postgres,service_role=X/postgres}
CREATE OR REPLACE FUNCTION public.get_contractor_profile(p_id uuid)
 RETURNS TABLE(id uuid, first_name text, last_name text, specialties text[], service_area text[], years_of_experience integer, availability jsonb, photo_url text, rating numeric, total_jobs integer, rating_price numeric, rating_experience numeric, rating_result numeric, rating_count integer, google_reviews_url text, company_name text, id_verified boolean, insurance_on_file boolean, wcb_on_file boolean)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
  select p.id, p.first_name, p.last_name,
         c.specialties, c.service_area, c.years_of_experience,
         c.availability, c.photo_url, c.rating, c.total_jobs,
         c.rating_price, c.rating_experience, c.rating_result,
         c.rating_count, c.google_reviews_url, c.company_name,
         coalesce(c.stripe_payouts_enabled, false),
         coalesce(nullif(c.doc_urls->>'insurance', ''), '') <> '',
         coalesce(nullif(c.doc_urls->>'wcb', ''), '') <> ''
  from public.contractors c
  join public.profiles p on p.id = c.id
  where c.id = p_id
    and (c.status = 'active' or public.is_admin());
$function$;

-- get_contractor_reviews(p_id uuid)   grants: {=X/postgres,postgres=X/postgres,anon=X/postgres,authenticated=X/postgres,service_role=X/postgres}
CREATE OR REPLACE FUNCTION public.get_contractor_reviews(p_id uuid)
 RETURNS TABLE(id uuid, price_score integer, experience_score integer, result_score integer, comment text, created_at timestamp with time zone, reviewer_first_name text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select r.id, r.price_score, r.experience_score, r.result_score, r.comment,
         r.created_at,
         coalesce(nullif(trim(p.first_name), ''), 'Client') as reviewer_first_name
  from reviews r
  left join profiles p on p.id = r.client_id
  where r.contractor_id = p_id
  order by r.created_at desc;
$function$;

-- get_contractor_rewind()   grants: {=X/postgres,postgres=X/postgres,anon=X/postgres,authenticated=X/postgres,service_role=X/postgres}
CREATE OR REPLACE FUNCTION public.get_contractor_rewind()
 RETURNS json
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT json_build_object(
    'jobs_completed', (select count(*) from jobs where contractor_id=auth.uid() and status='completed'),
    'total_earned',   coalesce((select sum(contractor_payout) from jobs where contractor_id=auth.uid() and payment_status='released'),0),
    'top_service',    (select r.service_needed from jobs j join client_requests r on r.id=j.request_id
                        where j.contractor_id=auth.uid() group by r.service_needed order by count(*) desc limit 1),
    'repeat_clients', (select count(*) from (select client_id from jobs where contractor_id=auth.uid() group by client_id having count(*)>1) x),
    'unique_clients', (select count(distinct client_id) from jobs where contractor_id=auth.uid()),
    'avg_rating',     (select rating from contractors where id=auth.uid()),
    'rating_count',   (select rating_count from contractors where id=auth.uid()),
    'company_name',   (select company_name from contractors where id=auth.uid()),
    'first_name',     (select first_name from profiles where id=auth.uid()),
    'member_since',   (select extract(year from created_at)::int from profiles where id=auth.uid()),
    'referral_code',  (select referral_code from profiles where id=auth.uid())
  );
$function$;

-- get_homepage_reviews(p_limit integer)   grants: {=X/postgres,postgres=X/postgres,anon=X/postgres,authenticated=X/postgres,service_role=X/postgres}
CREATE OR REPLACE FUNCTION public.get_homepage_reviews(p_limit integer DEFAULT 6)
 RETURNS TABLE(id uuid, price_score integer, experience_score integer, result_score integer, comment text, created_at timestamp with time zone, reviewer_first_name text, contractor_name text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select r.id, r.price_score, r.experience_score, r.result_score, r.comment,
         r.created_at,
         coalesce(nullif(trim(p.first_name), ''), 'Calgary homeowner') as reviewer_first_name,
         coalesce(nullif(trim(c.company_name), ''),
                  nullif(trim(cp.first_name), ''),
                  'Freddy Fix It pro') as contractor_name
  from reviews r
  left join profiles p on p.id = r.client_id
  left join contractors c on c.id = r.contractor_id
  left join profiles cp on cp.id = r.contractor_id
  where r.comment is not null
    and length(trim(r.comment)) >= 8
  order by r.created_at desc
  limit greatest(1, least(p_limit, 12));
$function$;

-- get_job_contract(p_job_id uuid)   grants: {=X/postgres,postgres=X/postgres,anon=X/postgres,authenticated=X/postgres,service_role=X/postgres}
CREATE OR REPLACE FUNCTION public.get_job_contract(p_job_id uuid)
 RETURNS job_contracts
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_row public.job_contracts;
  v_uid uuid := (select auth.uid());
begin
  if not (
    public.is_admin()
    or exists (select 1 from public.jobs j
               where j.id = p_job_id
                 and (j.client_id = v_uid or j.contractor_id = v_uid))
  ) then
    raise exception 'not authorized';
  end if;
  select * into v_row from public.job_contracts where job_id = p_job_id;
  return v_row;  -- null row when no contract yet
end $function$;

-- get_job_fee(p_client uuid, p_job_id uuid)   grants: {=X/postgres,postgres=X/postgres,anon=X/postgres,authenticated=X/postgres,service_role=X/postgres}
CREATE OR REPLACE FUNCTION public.get_job_fee(p_client uuid, p_job_id uuid)
 RETURNS TABLE(base_amount numeric, fee_rate numeric, fee_amount numeric, total numeric, waived boolean)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_amount  numeric;
  v_owner   uuid;
  v_waived  boolean;
  v_rate    numeric;
begin
  select amount, client_id into v_amount, v_owner from jobs where id = p_job_id;
  v_amount := coalesce(v_amount, 0);
  -- only compute a waiver for the job's real owner; otherwise standard rate
  if v_owner is not null and v_owner = p_client then
    v_waived := coalesce(referral_waiver_eligible(p_client, p_job_id), false);
  else
    v_waived := false;
  end if;
  v_rate := case when v_waived then 0::numeric else platform_fee_rate() end;
  return query
    select round(v_amount, 2)::numeric,
           v_rate::numeric,
           round(v_amount * v_rate, 2)::numeric,
           round(v_amount * (1 + v_rate), 2)::numeric,
           v_waived;
end $function$;

-- get_job_milestones(p_job_id uuid)   grants: {=X/postgres,postgres=X/postgres,anon=X/postgres,authenticated=X/postgres,service_role=X/postgres}
CREATE OR REPLACE FUNCTION public.get_job_milestones(p_job_id uuid)
 RETURNS SETOF job_milestones
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select m.*
  from public.job_milestones m
  join public.jobs j on j.id = m.job_id
  where m.job_id = p_job_id
    and (
      public.is_admin()
      or auth.uid() = j.client_id
      or auth.uid() = j.contractor_id
    )
  order by m.seq;
$function$;

-- get_match_scores(p_request_id uuid)   grants: {postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres}
CREATE OR REPLACE FUNCTION public.get_match_scores(p_request_id uuid)
 RETURNS TABLE(contractor_id uuid, score numeric, rating numeric, rating_count integer, total_jobs integer, median_minutes integer, area_match boolean)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  with req as (
    select r.id, r.location
    from client_requests r
    where r.id = p_request_id
      and (r.user_id = auth.uid() or public.is_admin())
  ),
  loc as (
    select
      (regexp_match(req.location, '(?i)\m(NW|NE|SW|SE)\M'))[1] as q,
      (regexp_match(req.location, '(?i)(Airdrie|Cochrane|Chestermere|Okotoks|Strathmore)'))[1] as town,
      (req.location ~* '(downtown|beltline)') as is_downtown
    from req
  ),
  bidders as (
    select distinct b.contractor_id
    from bids b
    join req on req.id = b.request_id
    where b.status <> 'declined'
  ),
  resp as (
    select b.contractor_id,
           percentile_cont(0.5) within group (
             order by extract(epoch from (b.created_at - cr.created_at)) / 60.0
           )::int as median_minutes
    from bids b
    join client_requests cr on cr.id = b.request_id
    where b.created_at > now() - interval '120 days'
      and b.created_at >= cr.created_at
      and b.contractor_id in (select contractor_id from bidders)
    group by b.contractor_id
    having count(*) >= 2
  )
  select
    c.id as contractor_id,
    round(
      ((coalesce(c.rating, 8.0) * coalesce(c.rating_count, 0) + 8.0 * 3)
        / (coalesce(c.rating_count, 0) + 3)) / 10.0 * 40
      + least(coalesce(c.total_jobs, 0), 25) / 25.0 * 20
      + case
          when r.median_minutes is null then 10
          when r.median_minutes <= 30 then 20
          else greatest(0, 20 - (r.median_minutes - 30) / 1410.0 * 20)
        end
      + case when am.matched then 20 else 8 end
    , 1) as score,
    c.rating,
    c.rating_count,
    c.total_jobs,
    r.median_minutes,
    am.matched as area_match
  from bidders bd
  join contractors c on c.id = bd.contractor_id
  cross join loc
  left join resp r on r.contractor_id = c.id
  left join lateral (
    select exists (
      select 1 from unnest(coalesce(c.service_area, '{}'::text[])) sa
      where (loc.q is not null and sa ilike '%' || loc.q || '%')
         or (loc.is_downtown and sa ~* '(downtown|beltline)')
         or (loc.town is not null and sa ilike '%' || loc.town || '%')
    ) as matched
  ) am on true;
$function$;

-- get_my_referral()   grants: {=X/postgres,postgres=X/postgres,anon=X/postgres,authenticated=X/postgres,service_role=X/postgres}
CREATE OR REPLACE FUNCTION public.get_my_referral()
 RETURNS json
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
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

-- get_recurring_prepay_quote(p_request uuid, p_count integer)   grants: {=X/postgres,postgres=X/postgres,anon=X/postgres,authenticated=X/postgres,service_role=X/postgres}
CREATE OR REPLACE FUNCTION public.get_recurring_prepay_quote(p_request uuid, p_count integer)
 RETURNS TABLE(base_per numeric, fee_rate numeric, fee_per numeric, payout_per numeric, commission_per numeric, occurrences integer, total numeric, priced boolean)
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
  with plan as (
    select cr.id, cr.estimated_quote
    from client_requests cr
    where cr.id = p_request and cr.user_id = (select auth.uid()) and cr.recurring = true
  ),
  latest as (
    select j.amount
    from jobs j
    join client_requests cc on cc.id = j.request_id
    where (cc.id = p_request or cc.recurring_parent_id = p_request)
      and j.amount is not null and j.amount > 0
    order by j.created_at desc limit 1
  ),
  b as (
    select greatest(coalesce((select amount from latest), (select estimated_quote from plan), 0), 0) as base_per,
           public.platform_fee_rate() as fee_rate,
           public.platform_commission_rate() as comm_rate,
           greatest(least(coalesce(p_count,0), 12), 1) as occ
  )
  select
    round(base_per,2),
    fee_rate,
    round(base_per * fee_rate, 2),
    round(base_per * (1 - comm_rate), 2),
    round(base_per * comm_rate, 2),
    occ,
    round(occ * (base_per + round(base_per * fee_rate,2)), 2),
    (base_per > 0)
  from b;
$function$;

-- get_service_compulsory()   grants: {=X/postgres,postgres=X/postgres,anon=X/postgres,authenticated=X/postgres,service_role=X/postgres}
CREATE OR REPLACE FUNCTION public.get_service_compulsory()
 RETURNS TABLE(service text, compulsory boolean, trade text, note text)
 LANGUAGE sql
 STABLE
 SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
  select sc.service, sc.compulsory, sc.trade, sc.note
  from public.service_compulsory sc
  order by sc.service;
$function$;

-- get_service_price_stats()   grants: {=X/postgres,postgres=X/postgres,anon=X/postgres,authenticated=X/postgres,service_role=X/postgres}
CREATE OR REPLACE FUNCTION public.get_service_price_stats()
 RETURNS TABLE(service text, base_price numeric, typical_low numeric, typical_high numeric, unit text, completed_count integer, completed_avg numeric, benchmark numeric, benchmark_source text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select
    sp.service,
    sp.base_price,
    sp.typical_low,
    sp.typical_high,
    sp.unit,
    coalesce(rs.n, 0) as completed_count,
    round(rs.avg_amount, 2) as completed_avg,
    round(
      case
        when coalesce(rs.n, 0) >= 5 then rs.avg_amount
        else coalesce((sp.typical_low + sp.typical_high) / 2.0, sp.base_price)
      end, 2) as benchmark,
    case when coalesce(rs.n, 0) >= 5 then 'jobs' else 'pricebook' end as benchmark_source
  from public.service_pricing sp
  left join lateral (
    select count(*)::int as n, avg(j.amount) as avg_amount
    from public.jobs j
    join public.client_requests r on r.id = j.request_id
    where j.status = 'completed'
      and j.amount is not null
      and j.amount > 0
      and r.service_needed = sp.service
  ) rs on true
  order by sp.service;
$function$;

-- get_service_pricing()   grants: {=X/postgres,postgres=X/postgres,anon=X/postgres,authenticated=X/postgres,service_role=X/postgres}
CREATE OR REPLACE FUNCTION public.get_service_pricing()
 RETURNS SETOF service_pricing
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select * from public.service_pricing order by service;
$function$;

-- get_top_pros(p_limit integer)   grants: {=X/postgres,postgres=X/postgres,anon=X/postgres,authenticated=X/postgres,service_role=X/postgres}
CREATE OR REPLACE FUNCTION public.get_top_pros(p_limit integer DEFAULT 6)
 RETURNS TABLE(contractor_id uuid, company_name text, first_name text, rating numeric, total_jobs integer, specialties text[])
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select c.id as contractor_id,
         c.company_name,
         p.first_name,
         nullif(c.rating, 0) as rating,
         coalesce(c.total_jobs, 0) as total_jobs,
         c.specialties
  from contractors c
  join profiles p on p.id = c.id
  where c.status = 'active'
  order by c.rating desc nulls last, c.total_jobs desc, c.created_at asc
  limit greatest(1, least(coalesce(p_limit, 6), 12));
$function$;

-- handle_new_user()   grants: {postgres=X/postgres,service_role=X/postgres}
CREATE OR REPLACE FUNCTION public.handle_new_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
declare
  meta jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb);
  v_role text := coalesce(nullif(meta->>'role',''), 'client');
  v_dates date[];
  v_flexible boolean := coalesce((meta->>'budget_flexible')::boolean, false);
  v_jobs jsonb;
  v_try int;
begin
  insert into public.profiles (id, email, first_name, last_name, phone, role)
  values (
    new.id,
    new.email,
    nullif(meta->>'first_name',''),
    nullif(meta->>'last_name',''),
    nullif(meta->>'phone',''),
    v_role
  )
  on conflict (id) do nothing;

  if v_role = 'contractor' and (meta ? 'specialties') then
    insert into public.contractors (
      id, company_name, specialties, years_of_experience, service_area,
      availability, work_type, licensed, license_number, has_liability_insurance,
      insurance_provider, insurance_expiry, has_wcb, operates_alone, work_references, status
    )
    values (
      new.id,
      nullif(meta->>'company_name',''),
      coalesce((select array_agg(value) from jsonb_array_elements_text(meta->'specialties') as value), '{}')::text[],
      nullif(meta->>'years_of_experience','')::int,
      coalesce((select array_agg(value) from jsonb_array_elements_text(meta->'service_area') as value), '{}')::text[],
      coalesce(meta->'availability', '{}'::jsonb),
      nullif(meta->>'work_type',''),
      coalesce((meta->>'licensed')::boolean, false),
      nullif(meta->>'license_number',''),
      coalesce((meta->>'has_liability_insurance')::boolean, false),
      nullif(meta->>'insurance_provider',''),
      nullif(meta->>'insurance_expiry',''),
      coalesce((meta->>'has_wcb')::boolean, false),
      coalesce((meta->>'operates_alone')::boolean, false),
      nullif(meta->>'work_references',''),
      'pending'
    )
    on conflict (id) do nothing;
  end if;

  if v_role = 'client' and coalesce(meta->>'job_description','') <> '' then
    begin
      if jsonb_typeof(meta->'recurring_dates') = 'array' then
        select array_agg((value)::date) into v_dates
        from jsonb_array_elements_text(meta->'recurring_dates') as value
        where nullif(value,'') is not null;
      end if;
    exception when others then v_dates := null;
    end;

    -- The one row this function has always written.
    v_jobs := jsonb_build_array(jsonb_build_object(
      'service_needed',  meta->>'service_needed',
      'job_description', meta->>'job_description',
      'budget_min',      meta->>'budget_min'
    ));

    -- Guard (1): trust `split_jobs` only if every element is usable. Anything
    -- else keeps the single-row default -- a malformed suggestion must post the
    -- request, not refuse it.
    begin
      if jsonb_typeof(meta->'split_jobs') = 'array'
         and jsonb_array_length(meta->'split_jobs') between 2 and 4
         and not exists (
           select 1 from jsonb_array_elements(meta->'split_jobs') as e
           where coalesce(e->>'service_needed','') = ''
              or coalesce(e->>'job_description','') = ''
              or coalesce(e->>'budget_min','') !~ '^([0-9]+(\.[0-9]+)?)?$'
         )
      then
        v_jobs := meta->'split_jobs';
      end if;
    exception when others then
      null;  -- keep the default
    end;

    -- Guard (2): attempt the split, and on any failure fall back to the single
    -- combined row. Two passes, never more: pass 1 is whatever `v_jobs` holds,
    -- pass 2 is always the default. A plpgsql exception block is a
    -- subtransaction, so a pass that inserted some rows before raising is rolled
    -- back entirely -- which is what makes the retry safe from duplicates.
    for v_try in 1..2 loop
      begin
        insert into public.client_requests (
          user_id, first_name, last_name, email, phone, service_needed,
          preferred_schedule, location, job_description, status, client_type,
          business_name, business_type, locations, recurring, recurring_frequency,
          recurring_start_date, recurring_end_date, billing_preference,
          recurring_interval_km, recurring_prepay_pref, recurring_dates,
          budget_min, budget_max, budget_flexible
        )
        select
          new.id,
          nullif(meta->>'first_name',''),
          nullif(meta->>'last_name',''),
          new.email,
          nullif(meta->>'phone',''),
          nullif(j->>'service_needed',''),
          nullif(meta->>'preferred_schedule',''),
          nullif(meta->>'location',''),
          nullif(j->>'job_description',''),
          'pending',
          coalesce(nullif(meta->>'client_type',''),'individual'),
          nullif(meta->>'business_name',''),
          nullif(meta->>'business_type',''),
          nullif(meta->>'locations',''),
          coalesce((meta->>'recurring')::boolean, false),
          nullif(meta->>'recurring_frequency',''),
          nullif(meta->>'recurring_start_date','')::date,
          nullif(meta->>'recurring_end_date','')::date,
          nullif(meta->>'billing_preference',''),
          nullif(meta->>'recurring_interval_km','')::int,
          coalesce(nullif(meta->>'recurring_prepay_pref','')::int, 0),
          v_dates,
          case when v_flexible then null else nullif(j->>'budget_min','')::numeric end,
          case when v_flexible then null else nullif(meta->>'budget_max','')::numeric end,
          v_flexible
        from jsonb_array_elements(v_jobs) as j;
        exit;
      exception when others then
        v_jobs := jsonb_build_array(jsonb_build_object(
          'service_needed',  meta->>'service_needed',
          'job_description', meta->>'job_description',
          'budget_min',      meta->>'budget_min'
        ));
      end;
    end loop;
  end if;

  return new;
exception when others then
  return new;
end;
$function$;

-- is_admin()   grants: {=X/postgres,postgres=X/postgres,anon=X/postgres,authenticated=X/postgres,service_role=X/postgres}
CREATE OR REPLACE FUNCTION public.is_admin()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select exists (select 1 from public.profiles where id = auth.uid() and role = 'admin');
$function$;

-- issue_internal_token(p_purpose text)   grants: {postgres=X/postgres,service_role=X/postgres}
CREATE OR REPLACE FUNCTION public.issue_internal_token(p_purpose text)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
declare v_token text;
begin
  -- pgcrypto lives in `extensions`; schema-qualify or this 42883s silently.
  v_token := encode(extensions.gen_random_bytes(32), 'hex');
  insert into public.internal_tokens(token, purpose) values (v_token, p_purpose);
  -- opportunistic cleanup; keeps the table from growing without a cron job
  delete from public.internal_tokens where expires_at < now() - interval '1 day';
  return v_token;
exception when others then
  -- Never let token minting break the thing that needed the token.
  raise warning 'issue_internal_token failed: %', sqlerrm;
  return null;
end $function$;

-- job_money_block(p_job_id uuid)   grants: {postgres=X/postgres,anon=X/postgres,authenticated=X/postgres,service_role=X/postgres}
CREATE OR REPLACE FUNCTION public.job_money_block(p_job_id uuid)
 RETURNS text
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
declare
  v_pay      text;
  v_started  timestamptz;
begin
  select payment_status, checkout_started_at into v_pay, v_started
    from public.jobs where id = p_job_id;
  if not found then return null; end if;   -- nothing to protect

  -- Whole-job funds.
  if coalesce(v_pay, 'unpaid') in ('held', 'released', 'disputed') then
    return 'This job has already been paid for, so it cannot be removed here. The money is still held safely — email hello@freddyfixit.ca and we will sort out the refund.';
  end if;

  -- A checkout that is open right now. Stripe sessions are created with a 2h
  -- expiry, so a 3h window strictly contains the life of any session that
  -- could still be paid. Older stamps age out on their own rather than
  -- stranding the job.
  if coalesce(v_pay, 'unpaid') = 'processing'
     and v_started is not null
     and v_started > now() - interval '3 hours' then
    return 'A payment for this job is going through right now. Give it a few minutes and try again — removing it mid-payment would lose track of the charge.';
  end if;

  -- A milestone job holds real money per stage while jobs.payment_status is
  -- still 'unpaid'. 'refunded' is terminal and deliberately NOT listed.
  if exists (
    select 1 from public.job_milestones m
     where m.job_id = p_job_id
       and m.status in ('funded', 'completed', 'released', 'disputed')
  ) then
    return 'A stage of this job has already been paid for, so it cannot be removed here. Email hello@freddyfixit.ca and we will sort out the refund.';
  end if;

  -- A prepaid recurring visit is covered by a pool charge.
  if exists (
    select 1 from public.jobs j
      join public.recurring_prepayments rp on rp.id = j.prepayment_id
     where j.id = p_job_id
       and rp.status in ('held', 'partially_released')
  ) then
    return 'This visit is covered by a prepaid plan, so it cannot be removed here. Email hello@freddyfixit.ca.';
  end if;

  return null;
end;
$function$;

-- job_repost_block(p_job_id uuid)   grants: {postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres}
CREATE OR REPLACE FUNCTION public.job_repost_block(p_job_id uuid)
 RETURNS text
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
declare
  v_job     record;
  v_block   text;
  v_signed  boolean;
begin
  select id, status, created_at, scheduled_date, scheduled_at, client_approved_at
    into v_job
    from public.jobs where id = p_job_id;
  if not found then
    return 'This job no longer exists.';
  end if;

  -- 1. Money. Same gate the four deletion paths use.
  v_block := public.job_money_block(p_job_id);
  if v_block is not null then
    return v_block;
  end if;

  -- 2. State. Only a job that has been assigned and not started can go back on
  -- the board. Anything else is refused by name rather than by omission, so a
  -- status nobody anticipated fails CLOSED.
  if coalesce(v_job.status, '') <> 'assigned' then
    return 'This job is marked "' || coalesce(v_job.status, 'unknown')
           || '", so it cannot be reposted. Email hello@freddyfixit.ca if that looks wrong.';
  end if;

  -- 3. An agreed time IS the agreement. Reposting here would pull the rug on a
  -- pro who has already blocked out the day.
  if v_job.scheduled_date is not null
     or v_job.scheduled_at is not null
     or v_job.client_approved_at is not null then
    return 'You have already agreed on a time with this pro. Message them in the job chat, or cancel the visit first.';
  end if;

  -- 4. A signed agreement, either side, means the same thing.
  select (c.client_signed_at is not null or c.contractor_signed_at is not null)
    into v_signed
    from public.job_contracts c where c.job_id = p_job_id
   order by c.created_at desc limit 1;
  if coalesce(v_signed, false) then
    return 'The service agreement for this job has already been signed. Email hello@freddyfixit.ca and we will help.';
  end if;

  -- 5. Age, last, so the message is the useful one when nothing else blocks.
  if v_job.created_at > now() - interval '7 days' then
    return 'Give your pro a little longer. You can repost this job from '
           || public.ff_local_ts(v_job.created_at + interval '7 days') || '.';
  end if;

  return null;
end $function$;

-- jobs_due_for_autopay(p_limit integer)   grants: {postgres=X/postgres,service_role=X/postgres}
CREATE OR REPLACE FUNCTION public.jobs_due_for_autopay(p_limit integer DEFAULT 25)
 RETURNS TABLE(job_id uuid, balance numeric)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
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
    and j.contractor_completed_at < now() - interval '2 hours'
    and (j.autopay_last_attempt_at is null
         or j.autopay_last_attempt_at < now() - interval '24 hours')
  order by j.contractor_completed_at
  limit greatest(1, least(coalesce(p_limit, 25), 100))
$function$;

-- jobs_stats_trigger()   grants: {postgres=X/postgres,service_role=X/postgres}
CREATE OR REPLACE FUNCTION public.jobs_stats_trigger()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if (tg_op = 'DELETE') then
    if old.contractor_id is not null then perform recompute_contractor_stats(old.contractor_id); end if;
    return old;
  end if;
  if new.contractor_id is not null then perform recompute_contractor_stats(new.contractor_id); end if;
  if (tg_op = 'UPDATE' and old.contractor_id is distinct from new.contractor_id and old.contractor_id is not null) then
    perform recompute_contractor_stats(old.contractor_id);
  end if;
  return new;
end; $function$;

-- kick_collect_balances()   grants: {postgres=X/postgres,service_role=X/postgres}
CREATE OR REPLACE FUNCTION public.kick_collect_balances()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
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

-- kick_meta_lead_scout()   grants: {postgres=X/postgres,service_role=X/postgres}
CREATE OR REPLACE FUNCTION public.kick_meta_lead_scout()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
declare
  v_url   text := coalesce(current_setting('app.supabase_url', true),
                           'https://kvypmjxbbaaknvddwwai.supabase.co')
                  || '/functions/v1/meta-lead-scout';
  v_token text;
begin
  begin
    v_token := public.issue_internal_token('edge-internal');
    perform net.http_post(
      url     := v_url,
      headers := jsonb_build_object(
        'Content-Type',  'application/json',
        'x-ff-internal', coalesce(v_token, '')
      ),
      body    := jsonb_build_object('source', 'cron')
    );
  exception when others then
    raise warning 'meta-lead-scout enqueue failed: %', sqlerrm;
  end;
end;
$function$;

-- kick_newsletter(p_audience text)   grants: {postgres=X/postgres,service_role=X/postgres}
CREATE OR REPLACE FUNCTION public.kick_newsletter(p_audience text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_weeks bigint;
begin
  if public.outbound_paused() then return; end if;

  -- Biweekly gate (2026-09-24): cron still fires weekly (Tue for contractor,
  -- Thu for client), but this only actually sends every OTHER week. Anchored
  -- to a fixed Monday epoch (2000-01-03) via date_trunc('week', ...) so the
  -- contractor and client jobs, which fall in the same calendar week, always
  -- agree on which week is "on" -- neither can drift out of sync with the
  -- other. Odd weeks are a no-op, same as the outbound_paused() early return.
  v_weeks := (date_trunc('week', now())::date - '2000-01-03'::date) / 7;
  if v_weeks % 2 <> 0 then return; end if;

  perform net.http_post(
    url := 'https://kvypmjxbbaaknvddwwai.supabase.co/functions/v1/newsletter-send',
    headers := jsonb_build_object(
      'Content-Type','application/json',
      'Authorization','Bearer <ANON_KEY>','x-ff-internal',coalesce(public.issue_internal_token('edge-internal'),'')),
    body := jsonb_build_object('audience', p_audience),
    timeout_milliseconds := 120000
  );
exception when others then
  null; -- never let a mail hiccup break cron
end;
$function$;

-- kick_reconcile_payouts()   grants: {postgres=X/postgres,service_role=X/postgres}
CREATE OR REPLACE FUNCTION public.kick_reconcile_payouts()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_url  text := coalesce(current_setting('app.supabase_url', true),
                          'https://kvypmjxbbaaknvddwwai.supabase.co')
                 || '/functions/v1/reconcile-payouts';
  v_anon text := '<ANON_KEY>';
begin
  begin
    perform net.http_post(
      url     := v_url,
      headers := jsonb_build_object(
        'Content-Type',  'application/json',
        'Authorization', 'Bearer ' || v_anon
      ),
      body    := jsonb_build_object('source','cron')
    );
  exception when others then
    raise warning 'reconcile-payouts enqueue failed: %', sqlerrm;
  end;
end;
$function$;

-- kick_visit_reminders()   grants: {postgres=X/postgres,service_role=X/postgres}
CREATE OR REPLACE FUNCTION public.kick_visit_reminders()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions', 'net', 'pg_temp'
AS $function$
declare
  v_url  text := coalesce(current_setting('app.supabase_url', true),
                          'https://kvypmjxbbaaknvddwwai.supabase.co')
                 || '/functions/v1/visit-reminder';
  v_anon text := '<ANON_KEY>';
begin
  if public.outbound_paused() then return; end if;
  begin
    perform net.http_post(
      url     := v_url,
      headers := jsonb_build_object(
        'Content-Type',  'application/json',
        'Authorization', 'Bearer ' || v_anon
      ),
      body    := jsonb_build_object('source','cron')
    );
  exception when others then
    raise warning 'visit-reminder enqueue failed: %', sqlerrm;
  end;
end;
$function$;

-- list_my_pros()   grants: {=X/postgres,postgres=X/postgres,anon=X/postgres,authenticated=X/postgres,service_role=X/postgres}
CREATE OR REPLACE FUNCTION public.list_my_pros()
 RETURNS TABLE(contractor_id uuid, name text, company_name text, rating numeric, rating_count integer, jobs_together integer, last_service text, last_job_at timestamp with time zone, is_favorite boolean, photo_url text)
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  WITH worked AS (
    SELECT j.contractor_id,
           count(*)::int AS jobs_together,
           max(j.created_at) AS last_job_at,
           (array_agg(r.service_needed ORDER BY j.created_at DESC))[1] AS last_service
    FROM jobs j
    JOIN client_requests r ON r.id = j.request_id
    WHERE j.client_id = auth.uid()
    GROUP BY j.contractor_id
  )
  SELECT c.id,
         NULLIF(TRIM(COALESCE(p.first_name,'')||' '||COALESCE(p.last_name,'')),''),
         c.company_name, c.rating, c.rating_count,
         COALESCE(w.jobs_together,0), w.last_service, w.last_job_at,
         (f.contractor_id IS NOT NULL), c.photo_url
  FROM contractors c
  JOIN profiles p ON p.id = c.id
  LEFT JOIN worked w ON w.contractor_id = c.id
  LEFT JOIN favorites f ON f.contractor_id = c.id AND f.client_id = auth.uid()
  WHERE (w.contractor_id IS NOT NULL OR f.contractor_id IS NOT NULL)
  ORDER BY (f.contractor_id IS NOT NULL) DESC, w.last_job_at DESC NULLS LAST;
$function$;

-- list_my_recurring_plans()   grants: {=X/postgres,postgres=X/postgres,anon=X/postgres,authenticated=X/postgres,service_role=X/postgres}
CREATE OR REPLACE FUNCTION public.list_my_recurring_plans()
 RETURNS TABLE(request_id uuid, service_needed text, recurring_frequency text, recurring_interval_km integer, recurring_plan_status text, next_due date, prepay_pref integer, contractor_id uuid, contractor_company text, outstanding_occurrence uuid, prepay_id uuid, prepay_status text, prepay_total integer, prepay_released integer)
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  select
    cr.id,
    cr.service_needed,
    cr.recurring_frequency,
    cr.recurring_interval_km,
    coalesce(cr.recurring_plan_status,'active'),
    cr.recurring_next_due,
    cr.recurring_prepay_pref,
    coalesce(cr.assigned_contractor_id, cr.preferred_contractor_id),
    c.company_name,
    (select o.id from client_requests o
       where o.recurring_parent_id = cr.id
         and o.status not in ('completed','cancelled','canceled','closed')
       order by o.created_at desc limit 1),
    rp.id, rp.status, rp.occurrences_total, rp.occurrences_released
  from client_requests cr
  left join contractors c on c.id = coalesce(cr.assigned_contractor_id, cr.preferred_contractor_id)
  left join lateral (
    select id, status, occurrences_total, occurrences_released
    from recurring_prepayments rp2
    where rp2.plan_request_id = cr.id and rp2.status in ('held','partially_released','pending')
    order by rp2.created_at desc limit 1
  ) rp on true
  where cr.user_id = (select auth.uid())
    and cr.recurring = true
    and cr.recurring_parent_id is null
  order by cr.created_at desc;
$function$;

-- list_open_jobs()   grants: {postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres}
CREATE OR REPLACE FUNCTION public.list_open_jobs()
 RETURNS TABLE(id uuid, service_needed text, location text, preferred_schedule text, job_description text, photo_path text, estimated_quote numeric, quote_notes text, created_at timestamp with time zone, vehicle_details jsonb, bid_count integer, my_amount numeric, my_message text, my_walkthrough boolean, my_price_low numeric, my_price_high numeric, is_preferred boolean, is_recurring boolean, recurring_frequency text, budget_min numeric, budget_max numeric, budget_flexible boolean, benchmark numeric, benchmark_low numeric, benchmark_high numeric, benchmark_source text, budget_grade text)
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
  with me as (
    select coalesce(specialties, '{}'::text[]) as specialties,
           coalesce(service_area, '{}'::text[]) as service_area,
           status
    from contractors where id = auth.uid()
  )
  select r.id, r.service_needed,
    public.mask_location(r.location) as location,
    r.preferred_schedule,
    public.scrub_address_text(r.job_description) as job_description,
    r.photo_path, r.estimated_quote,
    r.quote_notes,
    coalesce(r.reposted_at, r.created_at) as created_at,
    r.vehicle_details,
    bc.bid_count,
    mb.amount as my_amount,
    mb.message as my_message,
    coalesce(mb.walkthrough_requested, false) as my_walkthrough,
    mb.price_low as my_price_low,
    mb.price_high as my_price_high,
    coalesce(r.preferred_contractor_id = auth.uid(), false) as is_preferred,
    coalesce(r.recurring, false) as is_recurring,
    r.recurring_frequency,
    case when r.budget_flexible then null else r.budget_min end as budget_min,
    case when r.budget_flexible then null else r.budget_max end as budget_max,
    coalesce(r.budget_flexible, false) as budget_flexible,
    sb.benchmark, sb.low_price as benchmark_low, sb.high_price as benchmark_high,
    sb.benchmark_source,
    case when coalesce(r.budget_flexible, false) then null
         else public.budget_grade(
                (coalesce(r.budget_min, r.budget_max) + coalesce(r.budget_max, r.budget_min)) / 2.0,
                sb.benchmark)
    end as budget_grade
  from client_requests r
  cross join me
  left join lateral public.service_benchmark(r.service_needed) sb on true
  left join lateral (
    select
      (regexp_match(r.location, '(?i)\m(NW|NE|SW|SE)\M'))[1] as q,
      (regexp_match(r.location, '(?i)(Airdrie|Cochrane|Chestermere|Okotoks|Strathmore)'))[1] as town,
      (r.location ~* '(downtown|beltline)') as is_downtown
  ) loc on true
  left join lateral (
    select count(distinct b.contractor_id)::int as bid_count
    from bids b where b.request_id = r.id and b.status <> 'declined'
  ) bc on true
  left join lateral (
    select b.amount, b.message, b.walkthrough_requested, b.price_low, b.price_high from bids b
    where b.request_id = r.id and b.contractor_id = auth.uid()
  ) mb on true
  left join lateral (select public.service_specialties(r.service_needed) as required) m on true
  where r.status = 'pending'
    and r.waitlisted is not true
    and me.status = 'active'
    and not exists (select 1 from hidden_jobs h where h.contractor_id = auth.uid() and h.request_id = r.id)
    and (
      -- Fresh (or freshly reposted). A repost restarts this clock without
      -- touching created_at, so the raw data is never rewritten.
      coalesce(r.reposted_at, r.created_at) > now() - interval '14 days'
      -- ... or somebody bid in the last week. `bids` has no updated_at, so
      -- created_at IS the recency signal.
      or exists (select 1 from bids b2
                  where b2.request_id = r.id
                    and b2.status <> 'declined'
                    and b2.created_at > now() - interval '7 days')
      -- ... or client and pro are still talking details.
      or exists (select 1 from messages mg
                  where mg.request_id = r.id
                    and mg.blocked is not true
                    and mg.created_at > now() - interval '7 days')
    )
    and (
      r.preferred_contractor_id = auth.uid()
      or (
        (r.preferred_contractor_id is null or r.created_at < now() - interval '48 hours')
        and (m.required is null or me.specialties && m.required)
      )
    )
  order by
    coalesce(r.preferred_contractor_id = auth.uid(), false) desc,
    exists (
      select 1 from unnest(me.service_area) sa
      where (loc.q is not null and sa ilike '%'||loc.q||'%')
         or (loc.is_downtown and sa ~* '(downtown|beltline)')
         or (loc.town is not null and sa ilike '%'||loc.town||'%')
    ) desc,
    bc.bid_count asc,
    coalesce(r.reposted_at, r.created_at) desc
  limit 50;
$function$;

-- log_admin_action(p_action text, p_target_table text, p_target_id text, p_detail jsonb, p_actor uuid, p_via text)   grants: {postgres=X/postgres,service_role=X/postgres}
CREATE OR REPLACE FUNCTION public.log_admin_action(p_action text, p_target_table text DEFAULT NULL::text, p_target_id text DEFAULT NULL::text, p_detail jsonb DEFAULT '{}'::jsonb, p_actor uuid DEFAULT NULL::uuid, p_via text DEFAULT 'rpc'::text)
 RETURNS bigint
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
declare
  v_actor uuid := coalesce(p_actor, auth.uid());
  v_email text;
  v_id    bigint;
begin
  select u.email into v_email from auth.users u where u.id = v_actor;
  insert into public.admin_audit_log
    (actor_id, actor_email, action, target_table, target_id, detail, via)
  values
    (v_actor, v_email, p_action, p_target_table, p_target_id,
     coalesce(p_detail, '{}'::jsonb), coalesce(p_via, 'rpc'))
  returning id into v_id;
  return v_id;
end $function$;

-- mark_bid_thread_read(p_request_id uuid, p_contractor_id uuid)   grants: {postgres=X/postgres,anon=X/postgres,authenticated=X/postgres,service_role=X/postgres}
CREATE OR REPLACE FUNCTION public.mark_bid_thread_read(p_request_id uuid, p_contractor_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
declare v_uid uuid := auth.uid();
begin
  if v_uid is null then return; end if;
  -- Only the two parties to this thread may hold a read position.
  if not (
    v_uid = p_contractor_id
    or v_uid = (select r.user_id from public.client_requests r where r.id = p_request_id)
  ) then
    return;
  end if;
  insert into public.bid_thread_reads (request_id, contractor_id, user_id, last_read_at)
  values (p_request_id, p_contractor_id, v_uid, now())
  on conflict (request_id, contractor_id, user_id) do update set last_read_at = now();
end; $function$;

-- mark_job_complete(p_job_id uuid, p_photo_path text)   grants: {postgres=X/postgres,anon=X/postgres,authenticated=X/postgres,service_role=X/postgres}
CREATE OR REPLACE FUNCTION public.mark_job_complete(p_job_id uuid, p_photo_path text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_contractor uuid; v_client uuid; v_status text; v_req uuid;
  v_before text; v_after text; v_created timestamptz;
begin
  select contractor_id, client_id, status, request_id, before_photo_path, completion_photo_path, created_at
    into v_contractor, v_client, v_status, v_req, v_before, v_after, v_created
    from public.jobs where id = p_job_id;

  if v_contractor is null then raise exception 'Job not found'; end if;
  if auth.uid() is null or v_contractor <> auth.uid() then raise exception 'Not authorized'; end if;
  if v_status not in ('scheduled','in_progress') then raise exception 'Job is not in a completable state'; end if;

  -- p_photo_path is still accepted so an after photo can be supplied inline,
  -- but the saved column counts too (save_job_photo may already have set it).
  v_after := coalesce(p_photo_path, v_after);

  if v_after is null then
    raise exception 'Add a photo of the finished work before you mark this job complete — the client can''t confirm and release your payment without it.';
  end if;

  if v_before is null and v_created >= public.photo_rules_start() then
    raise exception 'Add your "before" photo first — the one you take when you arrive, so the client can see the difference.';
  end if;

  update public.jobs
     set status = 'pending_confirmation',
         contractor_completed_at = now(),
         completion_photo_path = v_after,
         after_photo_at = coalesce(after_photo_at, now())
   where id = p_job_id;

  update public.client_requests set status = 'in_progress' where id = v_req;

  perform public._notify(v_client, 'completion_pending', 'Job marked complete',
    'Your contractor marked the job complete and uploaded a photo of the finished work. Please review and confirm in your dashboard.', p_job_id);
end;
$function$;

-- mark_job_read(p_job_id uuid)   grants: {postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres}
CREATE OR REPLACE FUNCTION public.mark_job_read(p_job_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare v_uid uuid := auth.uid();
begin
  if v_uid is null then return; end if;

  if not exists (
    select 1 from public.jobs j
     where j.id = p_job_id and v_uid in (j.client_id, j.contractor_id)
  ) then
    return;
  end if;

  insert into public.message_reads (job_id, user_id, last_read_at)
  values (p_job_id, v_uid, now())
  on conflict (job_id, user_id) do update set last_read_at = now();
end;
$function$;

-- mask_location(p_location text)   grants: {=X/postgres,postgres=X/postgres,anon=X/postgres,authenticated=X/postgres,service_role=X/postgres}
CREATE OR REPLACE FUNCTION public.mask_location(p_location text)
 RETURNS text
 LANGUAGE plpgsql
 IMMUTABLE
 SET search_path TO 'public'
AS $function$
declare
  raw text := coalesce(p_location, '');
  pc_raw text;
  pc text;
  zone text;
begin
  pc_raw := (regexp_match(raw, '([A-Za-z][0-9][A-Za-z]\s*[0-9][A-Za-z][0-9])'))[1];
  if pc_raw is not null then
    pc_raw := upper(regexp_replace(pc_raw, '\s', '', 'g'));       -- T2P0R5
    pc := substr(pc_raw,1,3) || ' ' || substr(pc_raw,4,3);        -- T2P 0R5
  end if;

  if raw ~* '(Airdrie|Cochrane|Chestermere|Okotoks|Strathmore)' then
    zone := initcap((regexp_match(raw, '(?i)(Airdrie|Cochrane|Chestermere|Okotoks|Strathmore)'))[1]);
  elsif raw ~* '\m(NW|NE|SW|SE)\M' then
    zone := upper((regexp_match(raw, '(?i)\m(NW|NE|SW|SE)\M'))[1]) || ' Calgary';
  elsif raw ~* '(downtown|beltline)' then
    zone := 'Downtown / Beltline';
  end if;

  return coalesce(nullif(concat_ws(' · ', pc, zone), ''), 'Calgary area');
end;
$function$;

-- mfa_disable()   grants: {postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres}
CREATE OR REPLACE FUNCTION public.mfa_disable()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
declare v_uid uuid := auth.uid();
begin
  if v_uid is null then return jsonb_build_object('ok', false, 'reason', 'not_signed_in'); end if;
  if not public.mfa_ok() then return jsonb_build_object('ok', false, 'reason', 'verify_first'); end if;
  delete from public.user_mfa where user_id = v_uid;
  return jsonb_build_object('ok', true);
end;
$function$;

-- mfa_hash(p_code text, p_user uuid)   grants: {postgres=X/postgres,service_role=X/postgres}
CREATE OR REPLACE FUNCTION public.mfa_hash(p_code text, p_user uuid)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
  select encode(extensions.digest(upper(trim(p_code)) || ':' || p_user::text, 'sha256'), 'hex');
$function$;

-- mfa_ok()   grants: {postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres}
CREATE OR REPLACE FUNCTION public.mfa_ok()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
  select coalesce(
    (select (not m.enabled)
         or (m.last_verified_at is not null
             and m.last_verified_at > now() - interval '12 hours')
       from public.user_mfa m
      where m.user_id = auth.uid()),
    true);
$function$;

-- mfa_request_code(p_purpose text)   grants: {postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres}
CREATE OR REPLACE FUNCTION public.mfa_request_code(p_purpose text DEFAULT 'login'::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
declare
  v_uid    uuid := auth.uid();
  v_code   text;
  v_recent int;
  v_email  text;
  v_name   text;
  v_tok    text;
  v_url    text := coalesce(current_setting('app.supabase_url', true),
                            'https://kvypmjxbbaaknvddwwai.supabase.co')
                   || '/functions/v1/mfa-code';
begin
  if v_uid is null then return jsonb_build_object('ok', false, 'reason', 'not_signed_in'); end if;
  if p_purpose not in ('enroll','login','disable') then
    return jsonb_build_object('ok', false, 'reason', 'bad_purpose');
  end if;

  -- Rate limit: 5 codes per hour per user. Cheap, and it is the only thing
  -- between a stolen session and using our Resend domain as a mail cannon.
  select count(*) into v_recent
    from public.mfa_challenges
   where user_id = v_uid and created_at > now() - interval '1 hour';
  if v_recent >= 5 then
    return jsonb_build_object('ok', false, 'reason', 'rate_limited');
  end if;

  select u.email into v_email from auth.users u where u.id = v_uid;
  if v_email is null then return jsonb_build_object('ok', false, 'reason', 'no_email'); end if;
  select p.first_name into v_name from public.profiles p where p.id = v_uid;

  -- 6 digits from a CSPRNG. gen_random_bytes lives in `extensions`, which is
  -- why this function pins search_path -- see the Aug 2026 signup incident.
  v_code := lpad((('x' || encode(extensions.gen_random_bytes(4), 'hex'))::bit(32)::bigint % 1000000)::text, 6, '0');

  -- Supersede any outstanding code for this purpose, so an old email cannot be
  -- used after a new one has been requested.
  update public.mfa_challenges
     set consumed_at = now()
   where user_id = v_uid and purpose = p_purpose and consumed_at is null;

  insert into public.mfa_challenges (user_id, code_hash, purpose, expires_at)
  values (v_uid, public.mfa_hash(v_code, v_uid), p_purpose, now() + interval '10 minutes');

  begin
    v_tok := public.issue_internal_token('edge-internal');
    perform net.http_post(
      url     := v_url,
      headers := jsonb_build_object('Content-Type','application/json','x-ff-internal', v_tok),
      body    := jsonb_build_object('email', v_email, 'name', coalesce(v_name,''),
                                    'code', v_code, 'purpose', p_purpose)
    );
  exception when others then
    -- The code is already stored, so a mail hiccup is recoverable by asking for
    -- another one. Never let it raise on an auth path.
    raise warning 'mfa-code enqueue failed: %', sqlerrm;
    return jsonb_build_object('ok', false, 'reason', 'send_failed');
  end;

  return jsonb_build_object('ok', true, 'expires_in', 600);
end;
$function$;

-- mfa_status()   grants: {postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres}
CREATE OR REPLACE FUNCTION public.mfa_status()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
declare m public.user_mfa;
begin
  if auth.uid() is null then return jsonb_build_object('ok', false, 'reason', 'not_signed_in'); end if;
  select * into m from public.user_mfa where user_id = auth.uid();
  if not found then
    return jsonb_build_object('enabled', false, 'enrolled', false,
                              'recovery_left', 0, 'verified_recently', true);
  end if;
  return jsonb_build_object(
    'enabled',           m.enabled,
    'enrolled',          m.enrolled_at is not null,
    'recovery_left',     coalesce(array_length(m.recovery_hashes, 1), 0),
    'recovery_used',     m.recovery_used,
    'last_verified_at',  m.last_verified_at,
    'verified_recently', public.mfa_ok());
end;
$function$;

-- mfa_use_recovery(p_code text)   grants: {postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres}
CREATE OR REPLACE FUNCTION public.mfa_use_recovery(p_code text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
declare
  v_uid  uuid := auth.uid();
  v_hash text;
  m      public.user_mfa;
begin
  if v_uid is null then return jsonb_build_object('ok', false, 'reason', 'not_signed_in'); end if;
  select * into m from public.user_mfa where user_id = v_uid for update;
  if not found or not m.enabled then return jsonb_build_object('ok', false, 'reason', 'not_enrolled'); end if;

  v_hash := public.mfa_hash(p_code, v_uid);
  if not (v_hash = any(m.recovery_hashes)) then
    return jsonb_build_object('ok', false, 'reason', 'wrong_code');
  end if;

  update public.user_mfa
     set recovery_hashes  = array_remove(recovery_hashes, v_hash),
         recovery_used    = recovery_used + 1,
         last_verified_at = now()
   where user_id = v_uid;

  return jsonb_build_object('ok', true,
    'recovery_left', coalesce(array_length(array_remove(m.recovery_hashes, v_hash), 1), 0));
end;
$function$;

-- mfa_verify(p_code text, p_purpose text)   grants: {postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres}
CREATE OR REPLACE FUNCTION public.mfa_verify(p_code text, p_purpose text DEFAULT 'login'::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
declare
  v_uid  uuid := auth.uid();
  v_ch   public.mfa_challenges;
  v_codes text[] := '{}';
  v_hashes text[] := '{}';
  v_c    text;
  i      int;
begin
  if v_uid is null then return jsonb_build_object('ok', false, 'reason', 'not_signed_in'); end if;
  if p_code is null or length(trim(p_code)) = 0 then
    return jsonb_build_object('ok', false, 'reason', 'empty');
  end if;

  select * into v_ch
    from public.mfa_challenges
   where user_id = v_uid and purpose = p_purpose and consumed_at is null
   order by created_at desc
   limit 1
   for update;

  if not found then return jsonb_build_object('ok', false, 'reason', 'no_code'); end if;
  if v_ch.expires_at < now() then return jsonb_build_object('ok', false, 'reason', 'expired'); end if;
  if v_ch.attempts >= 5 then return jsonb_build_object('ok', false, 'reason', 'too_many_attempts'); end if;

  update public.mfa_challenges set attempts = attempts + 1 where id = v_ch.id;

  if v_ch.code_hash <> public.mfa_hash(p_code, v_uid) then
    return jsonb_build_object('ok', false, 'reason', 'wrong_code',
                              'attempts_left', 4 - v_ch.attempts);
  end if;

  update public.mfa_challenges set consumed_at = now() where id = v_ch.id;

  if p_purpose = 'enroll' then
    for i in 1..10 loop
      v_c := upper(encode(extensions.gen_random_bytes(5), 'hex'));  -- 10 hex chars
      v_codes  := v_codes  || v_c;
      v_hashes := v_hashes || public.mfa_hash(v_c, v_uid);
    end loop;

    insert into public.user_mfa (user_id, enabled, enrolled_at, recovery_hashes,
                                 recovery_used, last_verified_at)
    values (v_uid, true, now(), v_hashes, 0, now())
    on conflict (user_id) do update
      set enabled = true, enrolled_at = now(),
          recovery_hashes = excluded.recovery_hashes,
          recovery_used = 0, last_verified_at = now();

    return jsonb_build_object('ok', true, 'recovery_codes', v_codes);
  end if;

  update public.user_mfa set last_verified_at = now() where user_id = v_uid;
  return jsonb_build_object('ok', true);
end;
$function$;

-- my_bid_threads()   grants: {postgres=X/postgres,anon=X/postgres,authenticated=X/postgres,service_role=X/postgres}
CREATE OR REPLACE FUNCTION public.my_bid_threads()
 RETURNS TABLE(request_id uuid, contractor_id uuid, service_needed text, location text, request_status text, other_id uuid, other_name text, other_company text, other_photo_url text, bid_amount numeric, last_message_at timestamp with time zone, last_snippet text, last_sender_id uuid, last_has_attachment boolean, unread integer)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
declare v_uid uuid := auth.uid();
begin
  if v_uid is null then return; end if;

  return query
  with threads as (
    -- Client side: one row per pro who has bid on one of my open requests, so a
    -- thread can be STARTED from the inbox, not just continued. A request that
    -- has left 'pending' still yields any thread that actually has messages —
    -- otherwise picking a pro wipes the client's conversations while the pros
    -- keep theirs.
    select r.id as req, b.contractor_id as pro, r.service_needed, r.location, r.status,
           b.contractor_id as other, b.amount
      from public.client_requests r
      join public.bids b on b.request_id = r.id
     where r.user_id = v_uid
       and (r.status = 'pending'
            or exists (select 1 from public.messages m2
                        where m2.request_id = r.id
                          and m2.thread_contractor_id = b.contractor_id))
    union
    -- Contractor side: only threads the client has already opened.
    select r.id, m.thread_contractor_id, r.service_needed, r.location, r.status,
           r.user_id, (select b2.amount from public.bids b2 where b2.request_id = r.id and b2.contractor_id = v_uid limit 1)
      from public.messages m
      join public.client_requests r on r.id = m.request_id
     where m.thread_contractor_id = v_uid
       and m.request_id is not null
  ),
  vis as (
    select m.request_id, m.thread_contractor_id, m.sender_id, m.content,
           m.created_at, m.attachment_path
      from public.messages m
     where m.request_id is not null
       and (m.blocked is not true or m.sender_id = v_uid)
  )
  select t.req, t.pro, t.service_needed, t.location, t.status,
         t.other,
         nullif(trim(coalesce(p.first_name,'')||' '||coalesce(p.last_name,'')), ''),
         c.company_name, c.photo_url, t.amount,
         lm.created_at,
         left(coalesce(nullif(lm.content,''), case when lm.attachment_path is not null then 'Sent a photo' else '' end), 140),
         lm.sender_id,
         lm.attachment_path is not null,
         coalesce(u.n, 0)::int
    from threads t
    left join public.profiles    p on p.id = t.other
    left join public.contractors c on c.id = t.other
    left join lateral (
      select v.content, v.created_at, v.sender_id, v.attachment_path
        from vis v
       where v.request_id = t.req and v.thread_contractor_id = t.pro
       order by v.created_at desc limit 1
    ) lm on true
    left join lateral (
      select count(*) as n
        from vis v
        left join public.bid_thread_reads br
          on br.request_id = t.req and br.contractor_id = t.pro and br.user_id = v_uid
       where v.request_id = t.req and v.thread_contractor_id = t.pro
         and v.sender_id <> v_uid
         and v.created_at > coalesce(br.last_read_at, '-infinity'::timestamptz)
    ) u on true
   order by lm.created_at desc nulls last;
end; $function$;

-- my_conversations()   grants: {postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres}
CREATE OR REPLACE FUNCTION public.my_conversations()
 RETURNS TABLE(job_id uuid, request_id uuid, service_needed text, location text, job_status text, scheduled_at timestamp with time zone, amount numeric, i_am text, other_id uuid, other_name text, other_company text, last_message_at timestamp with time zone, last_snippet text, last_sender_id uuid, last_has_attachment boolean, unread integer)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare v_uid uuid := auth.uid();
begin
  if v_uid is null then return; end if;

  return query
  with mine as (
    select j.id, j.request_id, j.status, j.scheduled_at, j.amount, j.created_at,
           case when j.client_id = v_uid then 'client' else 'contractor' end as i_am,
           case when j.client_id = v_uid then j.contractor_id else j.client_id end as other_id
      from public.jobs j
     where v_uid in (j.client_id, j.contractor_id)
  ),
  -- Mirrors the `messages participant read` RLS policy: a blocked message only
  -- ever comes back to the person who wrote it.
  vis as (
    select m.id, m.job_id, m.sender_id, m.content, m.created_at, m.attachment_path
      from public.messages m
      join mine x on x.id = m.job_id
     where m.blocked is not true or m.sender_id = v_uid
  )
  select
    x.id,
    x.request_id,
    r.service_needed,
    r.location,
    x.status,
    x.scheduled_at,
    x.amount,
    x.i_am,
    x.other_id,
    nullif(trim(coalesce(p.first_name,'') || ' ' || coalesce(p.last_name,'')), ''),
    c.company_name,
    lm.created_at,
    left(coalesce(nullif(lm.content,''), case when lm.attachment_path is not null then 'Sent a photo' else '' end), 140),
    lm.sender_id,
    lm.attachment_path is not null,
    coalesce(u.n, 0)::int
  from mine x
  left join public.client_requests r on r.id = x.request_id
  left join public.profiles        p on p.id = x.other_id
  left join public.contractors     c on c.id = x.other_id
  left join lateral (
    select v.content, v.created_at, v.sender_id, v.attachment_path
      from vis v where v.job_id = x.id
     order by v.created_at desc limit 1
  ) lm on true
  left join lateral (
    select count(*) as n
      from vis v
      left join public.message_reads mr
        on mr.job_id = x.id and mr.user_id = v_uid
     where v.job_id = x.id
       and v.sender_id <> v_uid
       and v.created_at > coalesce(mr.last_read_at, '-infinity'::timestamptz)
  ) u on true
  -- Keep every live job so a conversation can be STARTED from the inbox, plus
  -- any finished job that actually has history worth re-reading.
  where lm.created_at is not null
     or x.status not in ('completed','cancelled')
  order by lm.created_at desc nulls last, x.created_at desc;
end;
$function$;

-- newsletter_subscribe(p_email text, p_audience text, p_name text, p_source text)   grants: {=X/postgres,postgres=X/postgres,anon=X/postgres,authenticated=X/postgres,service_role=X/postgres}
CREATE OR REPLACE FUNCTION public.newsletter_subscribe(p_email text, p_audience text, p_name text DEFAULT NULL::text, p_source text DEFAULT 'footer_form'::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if p_email is null or p_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    raise exception 'INVALID_EMAIL';
  end if;
  if p_audience not in ('client','contractor') then
    raise exception 'INVALID_AUDIENCE';
  end if;
  insert into newsletter_subscribers (email, audience, first_name, source, consent)
  values (lower(trim(p_email)), p_audience, nullif(trim(coalesce(p_name,'')),''), p_source, 'express')
  on conflict (email, audience) do update
    set unsubscribed_at = null,
        consent = 'express',
        consent_at = now(),
        first_name = coalesce(excluded.first_name, newsletter_subscribers.first_name);
end $function$;

-- notify_contractors_new_request()   grants: {postgres=X/postgres,service_role=X/postgres}
CREATE OR REPLACE FUNCTION public.notify_contractors_new_request()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
declare
  r record;
  req_spec text[];
begin
  if new.status <> 'pending' then return new; end if;
  if new.waitlisted then return new; end if;
  if new.preferred_contractor_id is not null then return new; end if;

  req_spec := public.service_specialties(new.service_needed);

  for r in
    select c.id from public.contractors c
    where c.status = 'active'
      and (req_spec is null or c.specialties && req_spec)
  loop
    perform public._notify(
      r.id, 'job_in_field', 'New job in your field',
      coalesce(new.service_needed,'A new job')
        || ' in ' || public.mask_location(new.location)
        || ' — place a bid before it fills up.',
      null);
  end loop;
  return new;
end;
$function$;

-- notify_email(p_event text, p_job_id uuid)   grants: {postgres=X/postgres,service_role=X/postgres}
CREATE OR REPLACE FUNCTION public.notify_email(p_event text, p_job_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
declare
  v_url   text := coalesce(current_setting('app.supabase_url', true),
                           'https://kvypmjxbbaaknvddwwai.supabase.co')
                  || '/functions/v1/notify-email';
  v_token text;
begin
  begin
    v_token := public.issue_internal_token('edge-internal');
    perform net.http_post(
      url     := v_url,
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'x-ff-internal', v_token
      ),
      body    := jsonb_build_object('event', p_event, 'job_id', p_job_id)
    );
  exception when others then
    raise warning 'notify-email enqueue failed: %', sqlerrm;
  end;
end;
$function$;

-- notify_new_message()   grants: {postgres=X/postgres,service_role=X/postgres}
CREATE OR REPLACE FUNCTION public.notify_new_message()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
declare
  v_client     uuid;
  v_contractor uuid;
  v_recipient  uuid;
  v_did        boolean;
  v_service    text;
  v_url  text := 'https://kvypmjxbbaaknvddwwai.supabase.co/functions/v1/notify-message';
  v_anon text := '<ANON_KEY>';
begin
  -- The chat guard stopped this one. Nothing was delivered; say nothing.
  if NEW.blocked then return NEW; end if;

  -- ---- bid-stage thread (no job exists yet) ----
  if NEW.request_id is not null then
    select r.user_id, r.service_needed into v_client, v_service
      from public.client_requests r where r.id = NEW.request_id;
    if v_client is null then return NEW; end if;

    if NEW.sender_id = v_client then v_recipient := NEW.thread_contractor_id;
    elsif NEW.sender_id = NEW.thread_contractor_id then v_recipient := v_client;
    else return NEW;
    end if;
    if v_recipient is null then return NEW; end if;

    -- Throttle: one bell per recipient per 15 minutes, so a fast back-and-forth
    -- doesn't turn into a dozen emails.
    if exists (
      select 1 from public.notifications n
       where n.user_id = v_recipient
         and n.type = 'bid_message'
         and n.created_at > now() - interval '15 minutes'
    ) then
      return NEW;
    end if;

    if NEW.sender_id = v_client then
      perform public._notify(v_recipient, 'bid_message', 'A client messaged you about your bid',
        'A client has a question about the '||coalesce(v_service,'job')||' you bid on. Reply from your dashboard.', null);
    else
      perform public._notify(v_recipient, 'bid_message', 'A pro replied to your question',
        'One of the pros who bid on your '||coalesce(v_service,'request')||' has replied. Open your dashboard to read it.', null);
    end if;
    return NEW;
  end if;

  -- ---- job thread (unchanged) ----
  select client_id, contractor_id into v_client, v_contractor
    from public.jobs where id = NEW.job_id;
  if v_client is null and v_contractor is null then return NEW; end if;

  if NEW.sender_id = v_client then v_recipient := v_contractor;
  elsif NEW.sender_id = v_contractor then v_recipient := v_client;
  else v_recipient := null;
  end if;
  if v_recipient is null then return NEW; end if;

  -- Site paused: message is delivered and unread-counted as normal, we just
  -- don't email about it. Return before the log write so the throttle is intact.
  if public.outbound_paused() then return NEW; end if;

  insert into public.message_email_log(job_id, recipient_id, last_emailed_at)
  values (NEW.job_id, v_recipient, now())
  on conflict (job_id, recipient_id) do update
    set last_emailed_at = now()
    where public.message_email_log.last_emailed_at < now() - interval '15 minutes'
  returning true into v_did;

  if v_did is null then return NEW; end if;

  begin
    perform net.http_post(
      url     := v_url,
      headers := jsonb_build_object('Content-Type','application/json','Authorization','Bearer '||v_anon,'x-ff-internal',coalesce(public.issue_internal_token('edge-internal'),'')),
      body    := jsonb_build_object('message_id', NEW.id, 'recipient_id', v_recipient)
    );
  exception when others then
    raise warning 'notify-message enqueue failed: %', sqlerrm;
  end;
  return NEW;
end; $function$;

-- notify_preferred_contractor()   grants: {postgres=X/postgres,service_role=X/postgres}
CREATE OR REPLACE FUNCTION public.notify_preferred_contractor()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
begin
  if new.waitlisted then return new; end if;
  if new.preferred_contractor_id is not null then
    perform public._notify(new.preferred_contractor_id, 'rehire_request',
      'A past client wants you back!',
      coalesce(new.service_needed,'A job')
        || ' in ' || public.mask_location(new.location)
        || ' — a client you''ve worked with requested you directly. Send a quote to lock it in.',
      null);
  end if;
  return new;
end;
$function$;

-- notify_user(p_user uuid, p_type text, p_title text, p_body text, p_cta_url text, p_cta_label text)   grants: {postgres=X/postgres,service_role=X/postgres}
CREATE OR REPLACE FUNCTION public.notify_user(p_user uuid, p_type text, p_title text, p_body text, p_cta_url text DEFAULT 'https://freddyfixit.ca/client-dashboard'::text, p_cta_label text DEFAULT 'Book now'::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
BEGIN
  PERFORM public._notify(p_user, p_type, p_title, p_body, NULL);
END; $function$;

-- open_dispute(p_job_id uuid, p_reason text, p_description text, p_service_date date, p_agreed_scope text, p_requested_remedy text, p_amount_in_dispute numeric, p_declarant_name text, p_photo_paths text[])   grants: {postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres}
CREATE OR REPLACE FUNCTION public.open_dispute(p_job_id uuid, p_reason text, p_description text DEFAULT NULL::text, p_service_date date DEFAULT NULL::date, p_agreed_scope text DEFAULT NULL::text, p_requested_remedy text DEFAULT NULL::text, p_amount_in_dispute numeric DEFAULT NULL::numeric, p_declarant_name text DEFAULT NULL::text, p_photo_paths text[] DEFAULT '{}'::text[])
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
declare v_client uuid; v_contractor uuid; v_pay text; v_id uuid; v_deadline timestamptz; r record;
begin
  select client_id, contractor_id, payment_status
    into v_client, v_contractor, v_pay
    from jobs where id = p_job_id;
  if v_client is null then raise exception 'Job not found'; end if;
  if auth.uid() is null or v_client <> auth.uid() then raise exception 'Not authorized'; end if;
  if coalesce(p_reason,'') = '' then raise exception 'A reason is required'; end if;
  if coalesce(p_declarant_name,'') = '' then
    raise exception 'You must sign the declaration (type your full name) to submit a claim.';
  end if;
  if v_pay <> 'held' then
    raise exception 'This job is not eligible for an in-app claim (payment is no longer held). Please contact support.';
  end if;

  v_deadline := now() + interval '3 days';

  insert into disputes(
    job_id, client_id, contractor_id, reason, description, photo_paths,
    service_date, agreed_scope, requested_remedy, amount_in_dispute,
    declarant_name, declaration_signed, response_deadline
  ) values (
    p_job_id, v_client, v_contractor, p_reason, nullif(p_description,''), coalesce(p_photo_paths,'{}'),
    p_service_date, nullif(p_agreed_scope,''), nullif(p_requested_remedy,''), p_amount_in_dispute,
    p_declarant_name, true, v_deadline
  ) returning id into v_id;

  -- freeze: blocks release-payment (needs 'held') and auto-confirm (skips disputed).
  -- disputed_at is ALSO what removes the job from jobs_due_for_autopay, so filing
  -- a claim stops the card-on-file balance charge. Proven by rolled-back probe.
  update jobs set payment_status = 'disputed', disputed_at = now() where id = p_job_id;

  perform public._notify(v_contractor, 'dispute_opened', 'A claim was filed on your job',
    'The client filed a formal claim about a job. Your payout is paused while it''s reviewed. Please open your dashboard to read the claim and submit your response within 3 days.', p_job_id);
  perform public._notify(v_client, 'dispute_opened', 'We received your claim',
    'Your claim has been filed and your payment is paused while our team reviews. We''ll be in touch.', p_job_id);
  for r in select id from profiles where role = 'admin' loop
    perform public._notify(r.id, 'dispute_opened', 'New claim filed',
      'A client filed a claim on a job. Review it in the admin dashboard.', p_job_id);
  end loop;

  return v_id;
end; $function$;

-- outbound_paused()   grants: {=X/postgres,postgres=X/postgres,anon=X/postgres,authenticated=X/postgres,service_role=X/postgres}
CREATE OR REPLACE FUNCTION public.outbound_paused()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$ select public.platform_mode() in ('paused', 'waitlist') $function$;

-- outreach_gap_threshold()   grants: {postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres}
CREATE OR REPLACE FUNCTION public.outreach_gap_threshold()
 RETURNS integer
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$ select 6 $function$;

-- owner_daily_digest(p_send boolean)   grants: {postgres=X/postgres,service_role=X/postgres}
CREATE OR REPLACE FUNCTION public.owner_daily_digest(p_send boolean DEFAULT true)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
declare
  v_need  int;
  v_body  text;
  v_title text;
  v_admin uuid;
  v_monday boolean := extract(isodow from (now() at time zone 'America/Edmonton')) = 1;
begin
  with base as (
    select r.id, r.service_needed, r.status, r.assigned_contractor_id, r.created_at,
           nullif(btrim(coalesce(r.first_name, '')), '') as fname,
           (select count(*) from public.jobs j where j.request_id = r.id) as job_ct,
           (select count(*) from public.bids b
             where b.request_id = r.id and b.status = 'pending') as pending_bids,
           (select max(b.created_at) from public.bids b
             where b.request_id = r.id and b.status = 'pending') as newest_bid,
           public.trade_reach(r.service_needed) as reach,
           r.pick_first_viewed_at is not null as opened
      from public.client_requests r
     where coalesce(r.waitlisted, false) = false
       and r.status not in ('completed', 'cancelled')
  ), items as (
    select 1 as ord, count(*) as n,
           format('CUSTOMERS — %s broken: a pro is assigned but there is no job, so the client sees nothing (%s). Repair it in the admin dashboard.',
                  case when count(*) = 1 then '1 request is' else count(*) || ' requests are' end,
                  left(string_agg(coalesce(service_needed, 'request'), ', '), 300)) as line
      from base where assigned_contractor_id is not null and job_ct = 0
    union all
    select 2, count(*),
           -- "opened" comes from the pick-page view stamp (20261112_pick_view_stamp.sql).
           -- Requests older than that stamp read as not opened; the count says so.
           format('CUSTOMERS — %s not picked a pro. %s opened their pick link (tracked since Nov 12). The oldest has waited since %s. Call or text them their pick link: %s.',
                  case when count(*) = 1 then '1 client has estimates and has'
                       else count(*) || ' clients have estimates and have' end,
                  count(*) filter (where opened) || ' of ' || count(*),
                  public.ff_local_ts(min(newest_bid)),
                  left(string_agg(coalesce(fname, 'client') || ' (' || coalesce(service_needed, 'request')
                                  || case when opened then ', OPENED' else '' end || ')',
                                  '; ' order by newest_bid desc), 600))
      from base
     where status = 'pending' and assigned_contractor_id is null
       and pending_bids > 0 and newest_bid < now() - interval '1 day'
    union all
    select 3, count(*),
           format('CUSTOMERS — %s no estimate after a day: %s. Assign a pro by hand or tell the client.',
                  case when count(*) = 1 then '1 request has' else count(*) || ' requests have' end,
                  left(string_agg(coalesce(service_needed, 'request'), ', '), 300))
      from base
     where status = 'pending' and assigned_contractor_id is null
       and pending_bids = 0 and reach > 0 and created_at < now() - interval '1 day'
    union all
    select 4, count(*),
           format('CONTRACTORS — nobody on the platform can do: %s. %s waiting on it. Recruit for this trade first.',
                  left(string_agg(distinct coalesce(service_needed, 'unknown'), ', '), 300),
                  case when count(*) = 1 then '1 open request is' else count(*) || ' open requests are' end)
      from base
     where status = 'pending' and assigned_contractor_id is null
       and pending_bids = 0 and reach = 0
    union all
    -- Recent requests (1-21 days old) that went out and still have fewer than
    -- three estimates, with the pros who were sent it and have not answered.
    select 5, count(*),
           format('CONTRACTORS — %s still short of estimates: %s. Nudge those pros.',
                  case when count(*) = 1 then '1 recent request is' else count(*) || ' recent requests are' end,
                  left(string_agg(format('%s (posted %s) went to %s pros, %s quoted, no answer from %s',
                             coalesce(q.service_needed, 'request'), public.ff_local_ts(q.created_at),
                             q.sent, q.quoted, coalesce(q.silent, 'nobody else')),
                           '; ' order by q.created_at desc), 900))
      from (
        select r.service_needed, r.created_at, cardinality(r.dispatched_to) as sent,
               (select count(*) from public.bids b where b.request_id = r.id) as quoted,
               (select string_agg(nm, ', ') from (
                  select coalesce(nullif(btrim(c.company_name), ''), nullif(btrim(p.first_name), ''), 'a pro') as nm
                    from unnest(r.dispatched_to) d(id)
                    join public.profiles p on p.id = d.id
                    left join public.contractors c on c.id = d.id
                   where not exists (select 1 from public.bids b
                                      where b.request_id = r.id and b.contractor_id = d.id)
                   limit 8) s) as silent
          from public.client_requests r
         where coalesce(r.waitlisted, false) = false
           and r.status = 'pending' and r.assigned_contractor_id is null
           and r.created_at < now() - interval '1 day'
           and r.created_at > now() - interval '21 days'
           and coalesce(cardinality(r.dispatched_to), 0) > 0
           and (select count(*) from public.bids b
                 where b.request_id = r.id and b.status = 'pending') < 3
      ) q
    union all
    -- Informational only (n = 0): never makes the digest send on its own.
    select 6, 0,
           format('CONTRACTORS — %s signed up in the last 7 days.',
                  case when count(*) = 1 then '1 new pro' else count(*) || ' new pros' end)
      from public.contractors where created_at > now() - interval '7 days'
    having count(*) > 0
    union all
    select 7, count(*),
           format('SITE — %s failing: %s.',
                  case when count(*) = 1 then '1 health check is' else count(*) || ' health checks are' end,
                  string_agg(check_name, ', '))
      from public.platform_health_check() where not ok and check_name <> 'admin_can_act'
  )
  select (select count(*) from items where n > 0),
         string_agg(line, E'\n' order by ord) filter (where n > 0 or ord = 6)
    into v_need, v_body
    from items;

  if coalesce(v_need, 0) = 0 and not v_monday then
    return 'nothing needs the owner today; not sent';
  end if;

  v_title := case when coalesce(v_need, 0) = 0 then 'Freddy today: nothing needs you'
                  when v_need = 1 then 'Freddy today: 1 thing needs you'
                  else 'Freddy today: ' || v_need || ' things need you' end;
  v_body := coalesce(v_body, 'No stuck customers, no uncovered trades, all health checks passing.');

  if p_send then
    for v_admin in select id from public.profiles where role = 'admin' loop
      if not exists (
        select 1 from public.notifications
         where user_id = v_admin and type = 'owner_digest'
           and created_at > now() - interval '20 hours'
      ) then
        perform public._notify(v_admin, 'owner_digest', v_title, v_body, null);
      end if;
    end loop;
  end if;

  return v_title || E'\n' || v_body;
exception when others then
  -- Never let the digest break cron; the health check is the backstop.
  raise warning 'owner_daily_digest failed: %', sqlerrm;
  return 'error: ' || sqlerrm;
end;
$function$;

-- photo_rules_start()   grants: {postgres=X/postgres,anon=X/postgres,authenticated=X/postgres,service_role=X/postgres}
CREATE OR REPLACE FUNCTION public.photo_rules_start()
 RETURNS timestamp with time zone
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$ select timestamptz '2026-08-02 00:00:00+00' $function$;

-- place_bid(p_request_id uuid, p_amount numeric, p_message text, p_labour numeric, p_parts numeric, p_callout numeric, p_assumptions text, p_subject_to_inspection boolean, p_price_low numeric, p_price_high numeric, p_used_base_price boolean, p_walkthrough boolean)   grants: {postgres=X/postgres,anon=X/postgres,authenticated=X/postgres,service_role=X/postgres}
CREATE OR REPLACE FUNCTION public.place_bid(p_request_id uuid, p_amount numeric, p_message text DEFAULT NULL::text, p_labour numeric DEFAULT NULL::numeric, p_parts numeric DEFAULT NULL::numeric, p_callout numeric DEFAULT NULL::numeric, p_assumptions text DEFAULT NULL::text, p_subject_to_inspection boolean DEFAULT false, p_price_low numeric DEFAULT NULL::numeric, p_price_high numeric DEFAULT NULL::numeric, p_used_base_price boolean DEFAULT false, p_walkthrough boolean DEFAULT false)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
declare
  v_active text; v_status text; v_client uuid; v_service text;
  v_cnt int; v_bid uuid; v_cname text; v_admin uuid;
  v_client_email text; v_client_name text; v_total numeric;
  v_pref uuid; v_created timestamptz; v_token uuid;
  v_cap int := 7;
begin
  select status into v_active from contractors where id = auth.uid();
  if v_active is null then raise exception 'Only contractors can bid'; end if;
  if v_active <> 'active' then raise exception 'Your contractor account is not active yet'; end if;

  select status, user_id, service_needed, preferred_contractor_id, created_at, pick_token
    into v_status, v_client, v_service, v_pref, v_created, v_token
    from client_requests where id = p_request_id;
  if v_status is null then raise exception 'Request not found'; end if;
  if v_status <> 'pending' then raise exception 'This job is no longer open for bids'; end if;

  perform pg_advisory_xact_lock(hashtext(p_request_id::text)::bigint);

  if v_pref is not null and v_pref <> auth.uid() and v_created > now() - interval '48 hours' then
    raise exception 'This job is reserved for the contractor the client requested';
  end if;

  select count(distinct contractor_id) into v_cnt
    from bids where request_id = p_request_id and status <> 'declined';
  if v_cnt >= v_cap and not exists (
    select 1 from bids where request_id = p_request_id and contractor_id = auth.uid()
  ) then
    raise exception 'This job already has the maximum of % bids', v_cap;
  end if;

  if p_labour is not null or p_parts is not null or p_callout is not null then
    v_total := coalesce(p_labour,0) + coalesce(p_parts,0) + coalesce(p_callout,0);
  else
    v_total := p_amount;
  end if;

  -- A walkthrough bid carries no firm price, so the ballpark range IS the price
  -- as far as the client is concerned. The range used to be optional and three
  -- of the first five walkthrough bids arrived carrying no numbers at all --
  -- one request collected three walkthrough bids, two of them completely
  -- priceless. That client had literally nothing to compare and never picked
  -- anyone. The range is now mandatory.
  if coalesce(p_walkthrough,false) then
    if p_price_low is null or p_price_high is null then
      raise exception 'A walkthrough-first bid still needs a ballpark range, so the client has something to compare';
    end if;
    if p_price_low <= 0 or p_price_high <= 0 then
      raise exception 'Your ballpark range needs to be more than zero';
    end if;
    if p_price_high < p_price_low then
      raise exception 'Your ballpark high cannot be below the low';
    end if;
    v_total := null;
  elsif v_total is null then
    raise exception 'A bid needs a price (or mark it walkthrough-first)';
  elsif p_price_low is not null and p_price_high is not null and p_price_high < p_price_low then
    raise exception 'Your estimated range high cannot be below the low';
  end if;

  insert into bids(request_id, contractor_id, amount, message, labour_amount, parts_amount, callout_fee, assumptions, subject_to_inspection, price_low, price_high, used_base_price, walkthrough_requested)
    values (p_request_id, auth.uid(), v_total, nullif(p_message,''),
            case when coalesce(p_walkthrough,false) then null else p_labour end,
            case when coalesce(p_walkthrough,false) then null else p_parts end,
            case when coalesce(p_walkthrough,false) then null else p_callout end,
            nullif(p_assumptions,''), coalesce(p_subject_to_inspection,false), p_price_low, p_price_high, coalesce(p_used_base_price,false), coalesce(p_walkthrough,false))
    on conflict (request_id, contractor_id)
    do update set amount = excluded.amount, message = excluded.message,
                  labour_amount = excluded.labour_amount, parts_amount = excluded.parts_amount,
                  callout_fee = excluded.callout_fee, assumptions = excluded.assumptions,
                  subject_to_inspection = excluded.subject_to_inspection,
                  price_low = excluded.price_low, price_high = excluded.price_high,
                  used_base_price = excluded.used_base_price,
                  walkthrough_requested = excluded.walkthrough_requested, created_at = now()
    returning id into v_bid;

  select trim(coalesce(first_name,'')||' '||coalesce(last_name,'')) into v_cname from profiles where id = auth.uid();

  if v_client is not null then
    if coalesce(p_walkthrough,false) then
      perform public._notify(v_client, 'bid_received', 'New bid on your request',
        coalesce(nullif(v_cname,''),'A contractor')||' wants to see the space first before pricing your '||coalesce(v_service,'job')||
        ' (ballpark $'||p_price_low::text||'-$'||p_price_high::text||').', null);
    else
      perform public._notify(v_client, 'bid_received', 'New bid on your request',
        coalesce(nullif(v_cname,''),'A contractor')||' bid'||
        coalesce(' $'||v_total::text,'')||' on your '||coalesce(v_service,'job')||'.', null);
    end if;

    select email, trim(coalesce(first_name,'')||' '||coalesce(last_name,''))
      into v_client_email, v_client_name from profiles where id = v_client;

    -- send-bid-email renders the one-tap pick link. The token goes in the body,
    -- never in the notification text above -- notifications are readable by
    -- anyone who can read the row, and the token is a bearer credential.
    if v_client_email is not null then
      perform net.http_post(
        url := 'https://kvypmjxbbaaknvddwwai.supabase.co/functions/v1/send-bid-email',
        headers := jsonb_build_object('Content-Type','application/json','x-ff-internal',coalesce(public.issue_internal_token('edge-internal'),'')),
        body := jsonb_build_object('to_email', v_client_email, 'client_name', v_client_name,
          'contractor_name', v_cname, 'service', v_service, 'amount', v_total,
          'price_low', p_price_low, 'price_high', p_price_high,
          'walkthrough', coalesce(p_walkthrough,false),
          'pick_token', v_token,
          'bid_count', v_cnt + case when exists (
            select 1 from bids where request_id = p_request_id and contractor_id = auth.uid()
          ) then 0 else 1 end));
    end if;
  end if;

  select id into v_admin from profiles where role = 'admin' limit 1;
  if v_admin is not null then
    perform public._notify(v_admin, 'bid_received', 'New bid placed',
      coalesce(nullif(v_cname,''),'A contractor')||' bid on '||coalesce(v_service,'a job')||'.', null);
  end if;

  if v_cnt = v_cap - 1 and v_client is not null then
    perform net.http_post(
      url := 'https://kvypmjxbbaaknvddwwai.supabase.co/functions/v1/notify-accepted',
      headers := jsonb_build_object('Content-Type','application/json','x-ff-internal',coalesce(public.issue_internal_token('edge-internal'),'')),
      body := jsonb_build_object('event','three_bids','client_id',v_client,'service',v_service,'request_id',p_request_id));
  end if;

  return v_bid;
end; $function$;

-- platform_commission_rate()   grants: {postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres}
CREATE OR REPLACE FUNCTION public.platform_commission_rate()
 RETURNS numeric
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$ select 0.07::numeric $function$;

-- platform_deposit_rate()   grants: {postgres=X/postgres,anon=X/postgres,authenticated=X/postgres,service_role=X/postgres}
CREATE OR REPLACE FUNCTION public.platform_deposit_rate()
 RETURNS numeric
 LANGUAGE sql
 STABLE
 SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$ select 0.40::numeric $function$;

-- platform_fee_rate()   grants: {=X/postgres,postgres=X/postgres,anon=X/postgres,authenticated=X/postgres,service_role=X/postgres}
CREATE OR REPLACE FUNCTION public.platform_fee_rate()
 RETURNS numeric
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$ select 0.03::numeric $function$;

-- platform_health_check()   grants: {postgres=X/postgres,service_role=X/postgres}
CREATE OR REPLACE FUNCTION public.platform_health_check()
 RETURNS TABLE(check_name text, ok boolean, detail text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
declare
  v_rate       numeric := platform_fee_rate();
  v_bad_fees   int;
  v_stuck      int;
  v_owing      int;
  v_short      int;
  v_signup     int;
  v_oldest_h   int;
  v_missing    text;
  v_lapsed     int;
  v_noadmin    int;
  v_blocked    int;
  v_pros       int;
begin
  check_name := 'fee_rate_sane';
  ok := (v_rate is not null and v_rate >= 0 and v_rate < 0.20);
  detail := 'platform_fee_rate() = ' || coalesce(v_rate::text,'NULL');
  return next;

  select count(*) into v_bad_fees
  from jobs
  where client_fee is not null
    and amount is not null
    and client_fee <> 0
    and abs(client_fee - round(amount * v_rate, 2)) > 0.01;
  check_name := 'charged_fees_consistent';
  ok := (v_bad_fees = 0);
  detail := v_bad_fees || ' charged job(s) whose fee != 0 and != amount*rate';
  return next;

  -- Widened 2026-11-04 from 6 names to 15: the original six were money-path
  -- only; the additions are the GATES and the DOORS. A gate that disappears
  -- does not raise, and a door that disappears is the 2026-11-04 lockout.
  select string_agg(want, ', ') into v_missing
  from (values ('platform_fee_rate'),('get_job_fee'),('referral_waiver_eligible'),
               ('list_open_jobs'),('admin_rank_contractors'),('kick_reconcile_payouts'),
               ('admin_guard'),('admin_action_allowed'),('mfa_ok'),
               ('contract_ready'),('job_money_block'),
               ('mfa_request_code'),('mfa_verify'),('mfa_use_recovery'),('mfa_status')
       ) as t(want)
  where not exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = t.want);
  check_name := 'critical_rpcs_present';
  ok := (v_missing is null);
  detail := coalesce('missing: ' || v_missing, 'all 15 present (6 money, 5 gates, 4 doors)');
  return next;

  select count(*) into v_stuck
  from jobs
  where status = 'completed'
    and payment_status = 'held'
    and coalesce(fully_funded, false)
    and client_confirmed_at is not null
    and disputed_at is null
    and client_confirmed_at < now() - interval '2 hours';
  check_name := 'no_stuck_payouts';
  ok := (v_stuck = 0);
  detail := v_stuck || ' confirmed job(s) held >2h without payout';
  return next;

  select count(*) into v_owing
  from jobs
  where payment_status = 'held'
    and not coalesce(fully_funded, false)
    and disputed_at is null
    and contractor_completed_at is not null
    and contractor_completed_at < now() - interval '3 days';
  check_name := 'no_unpaid_balances';
  ok := (v_owing = 0);
  detail := v_owing || ' finished job(s) with a balance unpaid for >3 days';
  return next;

  select count(*) into v_short
  from jobs
  where payment_status = 'released'
    and total_charged is not null
    and funded_amount < total_charged - 0.01;
  check_name := 'no_underfunded_payouts';
  ok := (v_short = 0);
  detail := v_short || ' released job(s) that were paid out while under-funded';
  return next;

  select count(*),
         coalesce(max(extract(epoch from (now() - u.created_at)) / 3600), 0)::int
    into v_signup, v_oldest_h
  from auth.users u
  where u.email_confirmed_at is null
    and u.last_sign_in_at is null
    and u.created_at < now() - interval '24 hours'
    and u.created_at > now() - interval '7 days';
  check_name := 'no_stuck_signups';
  ok := (v_signup = 0);
  detail := case
              when v_signup = 0 then 'every signup in the last 7 days got in'
              else v_signup || ' account(s) never confirmed and never signed in (oldest '
                   || v_oldest_h || 'h) - check the Supabase auth mailer'
            end;
  return next;

  -- 8) CAN THE ADMIN ACTUALLY ACT?  (added 2026-11-04, the day it bit)
  -- Asks admin_action_allowed(id) rather than re-deriving the 12-hour rule, so
  -- this check and the live gate can never disagree. Self-clearing.
  select count(*) into v_lapsed
  from profiles p
  where p.role = 'admin'
    and not coalesce((public.admin_action_allowed(p.id)->>'ok')::boolean, true);

  -- No admin at all would otherwise read as a clean pass on an empty set.
  select count(*) into v_noadmin from profiles where role = 'admin';

  check_name := 'admin_can_act';
  ok := (v_lapsed = 0 and v_noadmin > 0);
  detail := case
              when v_noadmin = 0 then 'NO account has role=admin - nobody can administer the platform'
              when v_lapsed = 0  then v_noadmin || ' admin(s), all currently able to act'
              else v_lapsed || ' of ' || v_noadmin || ' admin(s) blocked: two-step window lapsed, so every '
                   || 'guarded action is refused. Fix: sign in and enter the emailed code, or use a recovery code.'
            end;
  return next;

  -- 9) contract_ready()'s fifth reason requires stripe_payouts_enabled, so a job
  -- assigned to a contractor who has not onboarded parks the client on
  -- ContractPanel's waiting branch indefinitely with no explanation. Named in
  -- PAYMENT-AUDIT-2026-08-18.md and never enforced until now.
  select count(*), count(distinct j.contractor_id) into v_blocked, v_pros
  from jobs j
  join contractors c on c.id = j.contractor_id
  where j.payment_status = 'unpaid'
    and j.status not in ('cancelled','completed')
    and j.disputed_at is null
    and not coalesce(c.stripe_payouts_enabled, false);
  check_name := 'no_jobs_blocked_on_payout_onboarding';
  ok := (v_blocked = 0);
  detail := case
              when v_blocked = 0 then 'no live job is waiting on contractor payout onboarding'
              else v_blocked || ' live job(s) can never be paid: ' || v_pros
                   || ' contractor(s) have not finished Stripe payout onboarding, so '
                   || 'contract_ready() refuses and the client waits with no explanation'
            end;
  return next;
end $function$;

-- platform_mode()   grants: {=X/postgres,postgres=X/postgres,anon=X/postgres,authenticated=X/postgres,service_role=X/postgres}
CREATE OR REPLACE FUNCTION public.platform_mode()
 RETURNS text
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
  select coalesce((select value #>> '{}' from public.platform_settings where key = 'mode'), 'open');
$function$;

-- platform_status()   grants: {=X/postgres,postgres=X/postgres,anon=X/postgres,authenticated=X/postgres,service_role=X/postgres}
CREATE OR REPLACE FUNCTION public.platform_status()
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
  select jsonb_build_object(
    'mode',   public.platform_mode(),
    'notice', coalesce((select value from public.platform_settings where key = 'pause_notice'), '{}'::jsonb));
$function$;

-- prevent_role_escalation()   grants: {postgres=X/postgres,service_role=X/postgres}
CREATE OR REPLACE FUNCTION public.prevent_role_escalation()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
declare
  old_role text;
  v_block  text;
begin
  -- service role (edge functions / server) bypasses
  if (select auth.role()) = 'service_role' then return new; end if;
  -- existing admins may set any role (this is the owner's repair route)
  if public.is_admin() then return new; end if;

  old_role := case when tg_op = 'UPDATE' then old.role else null end;

  -- nobody but an admin/service may newly assign the admin role
  if new.role = 'admin' and (old_role is distinct from 'admin') then
    raise exception 'not authorized to assign admin role';
  end if;

  -- restrict self-assigned roles to the known onboarding values
  if new.role is not null and new.role not in ('client','contractor','admin') then
    raise exception 'invalid role: %', new.role;
  end if;

  -- one email = one account type, once the account has been used
  if tg_op = 'UPDATE' and new.role is distinct from old_role then
    v_block := public.role_change_block(new.id, new.role);
    if v_block is not null then
      raise exception '%', v_block;
    end if;
  end if;

  return new;
end;
$function$;

-- propose_job_schedule(p_job_id uuid, p_scheduled_at timestamp with time zone, p_amount numeric, p_notes text, p_labour numeric, p_parts numeric, p_callout numeric, p_subject_to_inspection boolean, p_price_low numeric, p_price_high numeric, p_used_base_price boolean, p_quote_items jsonb)   grants: {=X/postgres,postgres=X/postgres,anon=X/postgres,authenticated=X/postgres,service_role=X/postgres}
CREATE OR REPLACE FUNCTION public.propose_job_schedule(p_job_id uuid, p_scheduled_at timestamp with time zone, p_amount numeric, p_notes text, p_labour numeric DEFAULT NULL::numeric, p_parts numeric DEFAULT NULL::numeric, p_callout numeric DEFAULT NULL::numeric, p_subject_to_inspection boolean DEFAULT false, p_price_low numeric DEFAULT NULL::numeric, p_price_high numeric DEFAULT NULL::numeric, p_used_base_price boolean DEFAULT false, p_quote_items jsonb DEFAULT NULL::jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare v_contractor uuid; v_client uuid; v_status text; v_service text; v_total numeric; v_items jsonb; it jsonb;
begin
  select contractor_id, client_id, status,
         (select service_needed from client_requests cr where cr.id = j.request_id)
    into v_contractor, v_client, v_status, v_service
    from jobs j where j.id = p_job_id;
  if v_contractor is null then raise exception 'Job not found'; end if;
  if auth.uid() is null or v_contractor <> auth.uid() then raise exception 'Not authorized'; end if;
  if v_status not in ('assigned','scheduled') then raise exception 'Job is not awaiting scheduling'; end if;

  if p_labour is not null or p_parts is not null or p_callout is not null then
    v_total := coalesce(p_labour,0) + coalesce(p_parts,0) + coalesce(p_callout,0);
  else
    v_total := p_amount;
  end if;

  -- Validate + normalize optional add-on items (accepted reset to null on every re-propose)
  if p_quote_items is not null and jsonb_typeof(p_quote_items) = 'array' and jsonb_array_length(p_quote_items) > 0 then
    if jsonb_array_length(p_quote_items) > 15 then raise exception 'Too many add-on items (max 15)'; end if;
    v_items := '[]'::jsonb;
    for it in select * from jsonb_array_elements(p_quote_items) loop
      if coalesce(btrim(it->>'label'),'') = '' then raise exception 'Add-on items need a name'; end if;
      if (it->>'amount') is null or (it->>'amount')::numeric < 0 or (it->>'amount')::numeric > 100000 then
        raise exception 'Add-on amounts must be between $0 and $100,000';
      end if;
      v_items := v_items || jsonb_build_array(jsonb_build_object(
        'label', left(btrim(it->>'label'), 120),
        'amount', round((it->>'amount')::numeric, 2),
        'optional', true,
        'accepted', null
      ));
    end loop;
  else
    v_items := null;
  end if;

  update jobs
     set scheduled_at = p_scheduled_at,
         schedule_proposed_at = now(),
         amount = coalesce(v_total, amount),
         labour_amount = p_labour,
         parts_amount = p_parts,
         callout_fee = p_callout,
         subject_to_inspection = coalesce(p_subject_to_inspection,false),
         price_low = p_price_low,
         price_high = p_price_high,
         used_base_price = coalesce(p_used_base_price,false),
         notes = coalesce(p_notes, notes),
         quote_items = v_items,
         client_approved_at = null,
         client_rescheduled_at = null,
         reschedule_accepted_at = null,
         client_confirmed_visit_at = null,
         status = 'assigned'
   where id = p_job_id;

  perform public._notify(v_client, 'schedule_proposed', 'Time proposed for your job',
    'Your contractor proposed '||coalesce(public.ff_local_ts(p_scheduled_at),'a time')||
    coalesce(' — $'||v_total::text,'')||
    case when v_items is not null then ' (plus optional add-ons you can pick)' else '' end||
    '. Open your dashboard to approve.', p_job_id);
  perform public.notify_email('schedule_proposed', p_job_id);
end; $function$;

-- propose_milestones(p_job_id uuid, p_stages jsonb)   grants: {postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres}
CREATE OR REPLACE FUNCTION public.propose_milestones(p_job_id uuid, p_stages jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
declare
  v_job public.jobs%rowtype;
  v_count int;
  v_sum numeric := 0;
  v_amount numeric;
  v_rate numeric := public.platform_fee_rate();
  v_comm numeric := public.platform_commission_rate();
  v_stage jsonb;
  v_seq int := 0;
  v_title text;
  v_pf numeric;
begin
  select * into v_job from public.jobs where id = p_job_id;
  if not found then
    raise exception 'Job not found';
  end if;
  if auth.uid() is null or (not public.is_admin() and auth.uid() <> v_job.contractor_id) then
    raise exception 'Only the assigned contractor can propose milestones';
  end if;
  if coalesce(v_job.amount,0) <= 2000 then
    raise exception 'Milestones are only for jobs over $2,000';
  end if;

  v_count := jsonb_array_length(p_stages);
  if v_count < 2 or v_count > 5 then
    raise exception 'A milestone plan needs between 2 and 5 stages';
  end if;

  for v_stage in select * from jsonb_array_elements(p_stages) loop
    v_amount := (v_stage->>'amount')::numeric;
    if v_amount is null or v_amount <= 0 then
      raise exception 'Every stage needs a positive amount';
    end if;
    v_sum := v_sum + v_amount;
  end loop;

  if round(v_sum,2) <> round(coalesce(v_job.amount,0),2) then
    raise exception 'Stage amounts (%) must add up to the quote (%)', v_sum, v_job.amount;
  end if;

  -- reset any prior proposed (un-funded) plan
  delete from public.job_milestones
   where job_id = p_job_id and status = 'pending';

  for v_stage in select * from jsonb_array_elements(p_stages) loop
    v_seq := v_seq + 1;
    v_amount := (v_stage->>'amount')::numeric;
    v_title := coalesce(nullif(trim(v_stage->>'title'),''), 'Stage ' || v_seq);
    v_pf := round(v_amount * v_comm, 2);
    insert into public.job_milestones
      (job_id, seq, title, amount, client_fee, contractor_payout, platform_fee, status)
    values
      (p_job_id, v_seq, v_title, v_amount,
       round(v_amount * v_rate, 2),
       v_amount - v_pf,
       v_pf,
       'pending');
  end loop;

  update public.jobs
     set is_milestone = true,
         milestone_schedule_status = 'proposed'
   where id = p_job_id;
end;
$function$;

-- propose_price_change(p_job_id uuid, p_amount numeric, p_reason text, p_labour numeric, p_parts numeric, p_callout numeric, p_subject_to_inspection boolean, p_price_low numeric, p_price_high numeric, p_used_base_price boolean)   grants: {=X/postgres,postgres=X/postgres,anon=X/postgres,authenticated=X/postgres,service_role=X/postgres}
CREATE OR REPLACE FUNCTION public.propose_price_change(p_job_id uuid, p_amount numeric, p_reason text, p_labour numeric DEFAULT NULL::numeric, p_parts numeric DEFAULT NULL::numeric, p_callout numeric DEFAULT NULL::numeric, p_subject_to_inspection boolean DEFAULT false, p_price_low numeric DEFAULT NULL::numeric, p_price_high numeric DEFAULT NULL::numeric, p_used_base_price boolean DEFAULT false)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
declare
  v_contractor uuid; v_client uuid; v_status text; v_pay text; v_paid timestamptz;
  v_disp timestamptz; v_ms boolean; v_old_notes text; v_total numeric; v_old_amount numeric;
  v_is_hike boolean;
begin
  select contractor_id, client_id, status, payment_status, paid_at, disputed_at, is_milestone, notes, amount
    into v_contractor, v_client, v_status, v_pay, v_paid, v_disp, v_ms, v_old_notes, v_old_amount
    from jobs where id = p_job_id;
  if v_contractor is null then raise exception 'Job not found'; end if;
  if auth.uid() is null or v_contractor <> auth.uid() then raise exception 'Not authorized'; end if;
  if coalesce(v_ms,false) then raise exception 'For staged (milestone) jobs, adjust the amount on each stage instead.'; end if;
  if v_pay = 'released' then raise exception 'This job has already paid out — the price is locked.'; end if;
  if v_pay = 'disputed' or v_disp is not null then raise exception 'This job is under dispute — price changes are paused until it is resolved.'; end if;
  if v_status not in ('assigned','scheduled','in_progress','pending_confirmation') then
    raise exception 'You can only change the price while the job is still active.';
  end if;
  if coalesce(trim(p_reason),'') = '' then raise exception 'Please explain why the price is changing'; end if;

  if p_labour is not null or p_parts is not null or p_callout is not null then
    v_total := coalesce(p_labour,0) + coalesce(p_parts,0) + coalesce(p_callout,0);
  else
    v_total := p_amount;
  end if;
  if v_total is null or v_total <= 0 then raise exception 'Enter the new price'; end if;

  -- HELD: money is already secured. Record a pending change for the client to approve.
  if v_pay = 'held' then
    update jobs set
      price_change_pending = jsonb_build_object(
        'amount', v_total, 'labour', p_labour, 'parts', p_parts, 'callout', p_callout,
        'subject', coalesce(p_subject_to_inspection,false),
        'price_low', p_price_low, 'price_high', p_price_high,
        'used_base_price', coalesce(p_used_base_price,false), 'reason', p_reason),
      price_change_proposed_at = now()
    where id = p_job_id;

    perform public._notify(v_client, 'price_change', 'Your pro proposed a new price',
      'Your contractor proposed changing the price to $'||v_total::text||': '||p_reason||
      ' Open your dashboard to approve or decline.', p_job_id);
    perform public.notify_email('price_change', p_job_id);
    return 'pending_client_approval';
  end if;

  -- UNPAID: apply the new price now and send back for schedule re-approval.
  v_is_hike := v_total > coalesce(v_old_amount, 0);
  update jobs set
    amount = v_total,
    labour_amount = p_labour,
    parts_amount = p_parts,
    callout_fee = p_callout,
    subject_to_inspection = coalesce(p_subject_to_inspection,false),
    price_low = p_price_low,
    price_high = p_price_high,
    used_base_price = coalesce(p_used_base_price,false),
    notes = coalesce(v_old_notes||E'\n','')||'Price update: '||p_reason,
    client_approved_at = null,
    schedule_proposed_at = now(),
    status = 'assigned',
    payment_status = case when v_pay in ('processing','failed') then 'unpaid' else v_pay end,
    price_change_pending = null,
    price_change_proposed_at = null,
    price_hike_from   = case when v_is_hike then v_old_amount else null end,
    price_hike_reason = case when v_is_hike then p_reason    else null end,
    price_hike_at     = case when v_is_hike then now()       else null end
  where id = p_job_id;

  perform public._notify(v_client,
    case when v_is_hike then 'price_change' else 'schedule_proposed' end,
    case when v_is_hike then 'Your pro raised the price' else 'Updated price needs your approval' end,
    case when v_is_hike
      then 'Your contractor raised the estimate from $'||v_old_amount::text||' to $'||v_total::text||': '||p_reason||
           ' Open your dashboard to approve the new price or decline and re-open the job to other pros.'
      else 'Your contractor updated the estimate to $'||v_total::text||': '||p_reason||' Open your dashboard to review and approve.'
    end, p_job_id);
  -- The email must match the bell above. A raise is a PRICE email, not a
  -- schedule email: the schedule_proposed body says "a time has been proposed"
  -- and would have hidden the increase entirely.
  perform public.notify_email(
    case when v_is_hike then 'price_change' else 'schedule_proposed' end, p_job_id);
  return 'reapprove';
end; $function$;

-- propose_walkthrough(p_job_id uuid, p_at timestamp with time zone, p_note text)   grants: {=X/postgres,postgres=X/postgres,anon=X/postgres,authenticated=X/postgres,service_role=X/postgres}
CREATE OR REPLACE FUNCTION public.propose_walkthrough(p_job_id uuid, p_at timestamp with time zone, p_note text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare v_contractor uuid; v_client uuid; v_status text; v_service text;
begin
  select contractor_id, client_id, status,
         (select service_needed from client_requests cr where cr.id = j.request_id)
    into v_contractor, v_client, v_status, v_service
    from jobs j where j.id = p_job_id;
  if v_contractor is null then raise exception 'Job not found'; end if;
  if auth.uid() is null or v_contractor <> auth.uid() then raise exception 'Not authorized'; end if;
  if v_status <> 'assigned' then raise exception 'Walkthroughs can only be proposed before the job is scheduled'; end if;
  if p_at is null or p_at <= now() then raise exception 'Pick a future time for the walkthrough'; end if;

  update jobs
     set walkthrough_proposed_at = now(),
         walkthrough_at = p_at,
         walkthrough_note = nullif(left(coalesce(p_note,''),500),''),
         walkthrough_approved_at = null,
         walkthrough_done_at = null
   where id = p_job_id;

  perform public.notify_user(v_client, 'walkthrough_proposed', 'Your pro wants to do a quick walkthrough',
    'Your contractor would like to see the space before giving a firm price for your '||coalesce(v_service,'job')||
    '. Proposed visit: '||coalesce(public.ff_local_ts(p_at),'a time to confirm')||
    '. The visit is free - approve the time in your dashboard.',
    'https://freddyfixit.ca/client-dashboard', 'Review the time');
end; $function$;

-- prune_alert_throttle_log()   grants: {postgres=X/postgres,service_role=X/postgres}
CREATE OR REPLACE FUNCTION public.prune_alert_throttle_log()
 RETURNS void
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
  delete from public.alert_throttle_log where last_sent_at < now() - interval '30 days';
$function$;

-- prune_rate_limit_hits()   grants: {postgres=X/postgres,service_role=X/postgres}
CREATE OR REPLACE FUNCTION public.prune_rate_limit_hits()
 RETURNS void
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
  delete from public.rate_limit_hits where window_start < now() - interval '2 days';
$function$;

-- receipt_on_job_release()   grants: {postgres=X/postgres,service_role=X/postgres}
CREATE OR REPLACE FUNCTION public.receipt_on_job_release()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if new.payment_status = 'released'
     and old.payment_status is distinct from 'released' then
    perform public.enqueue_payment_receipt('job_released', new.id);
  end if;
  return new;
end;
$function$;

-- receipt_on_milestone_release()   grants: {postgres=X/postgres,service_role=X/postgres}
CREATE OR REPLACE FUNCTION public.receipt_on_milestone_release()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if new.status = 'released'
     and old.status is distinct from 'released' then
    perform public.enqueue_payment_receipt('milestone_released', new.id);
  end if;
  return new;
end;
$function$;

-- recompute_contractor_stats(p_contractor uuid)   grants: {postgres=X/postgres,service_role=X/postgres}
CREATE OR REPLACE FUNCTION public.recompute_contractor_stats(p_contractor uuid)
 RETURNS void
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
  update contractors c set
    total_jobs   = coalesce((select count(*) from jobs j
                              where j.contractor_id = p_contractor and j.status = 'completed'), 0),
    total_earned = coalesce((select sum(coalesce(j.contractor_payout,
                                                 round(j.amount * (1 - public.platform_commission_rate()), 2)))
                              from jobs j
                              where j.contractor_id = p_contractor and j.status = 'completed'), 0)
  where c.id = p_contractor;
$function$;

-- record_autopay_attempt(p_job_id uuid, p_error text)   grants: {postgres=X/postgres,service_role=X/postgres}
CREATE OR REPLACE FUNCTION public.record_autopay_attempt(p_job_id uuid, p_error text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
  update public.jobs
     set autopay_attempts        = autopay_attempts + 1,
         autopay_last_attempt_at = now(),
         autopay_last_error      = p_error
   where id = p_job_id;
$function$;

-- recurrence_interval(p_freq text)   grants: {=X/postgres,postgres=X/postgres,anon=X/postgres,authenticated=X/postgres,service_role=X/postgres}
CREATE OR REPLACE FUNCTION public.recurrence_interval(p_freq text)
 RETURNS interval
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
  select case lower(coalesce(p_freq,''))
    when 'per_km' then interval '4 months'
    else public.freq_interval(p_freq)
  end;
$function$;

-- referral_waiver_eligible(p_client uuid, p_job_id uuid)   grants: {=X/postgres,postgres=X/postgres,anon=X/postgres,authenticated=X/postgres,service_role=X/postgres}
CREATE OR REPLACE FUNCTION public.referral_waiver_eligible(p_client uuid, p_job_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE v_pending boolean; v_prior int;
BEGIN
  SELECT true INTO v_pending FROM referrals WHERE referred_id = p_client AND status='pending';
  IF v_pending IS NULL THEN RETURN false; END IF;
  SELECT count(*) INTO v_prior FROM jobs
    WHERE client_id = p_client AND id <> p_job_id AND payment_status IN ('held','released');
  RETURN v_prior = 0;
END; $function$;

-- refire_request(p_request_id uuid)   grants: {postgres=X/postgres,service_role=X/postgres}
CREATE OR REPLACE FUNCTION public.refire_request(p_request_id uuid)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
declare
  v_req      record;
  v_required text[];
  v_bidders  uuid[];
  v_reach    int;
  v_url  text := coalesce(current_setting('app.supabase_url', true),
                          'https://kvypmjxbbaaknvddwwai.supabase.co')
                 || '/functions/v1/dispatch-job';
  v_anon text := '<ANON_KEY>';
begin
  select * into v_req from public.client_requests where id = p_request_id;
  if not found then
    raise exception 'request not found';
  end if;
  if v_req.status <> 'pending' then
    return 0;
  end if;
  if v_req.waitlisted then
    return 0;
  end if;

  select array_agg(distinct b.contractor_id) into v_bidders
  from public.bids b where b.request_id = p_request_id;
  v_bidders := coalesce(v_bidders, '{}'::uuid[]);

  v_required := public.service_specialties(v_req.service_needed);

  if v_req.preferred_contractor_id is not null
     and v_req.created_at > now() - interval '48 hours' then
    v_reach := (select count(*) from public.contractors c
                 where c.id = v_req.preferred_contractor_id
                   and c.status = 'active'
                   and not (c.id = any(v_bidders)));
  else
    select count(*) into v_reach
    from public.contractors c
    join public.profiles p on p.id = c.id
    where c.status = 'active'
      and p.email is not null
      and not (c.id = any(v_bidders))
      and (v_required is null or c.specialties && v_required)
      and not exists (select 1 from public.hidden_jobs h
                       where h.request_id = p_request_id and h.contractor_id = c.id);
  end if;

  update public.client_requests
     set dispatched_to  = v_bidders,
         refire_count   = refire_count + 1,
         refire_last_at = now()
   where id = p_request_id;

  begin
    perform net.http_post(
      url     := v_url,
      headers := jsonb_build_object(
        'Content-Type',  'application/json',
        'Authorization', 'Bearer ' || v_anon
      ),
      body    := jsonb_build_object('request_id', p_request_id),
      timeout_milliseconds := 30000
    );
  exception when others then
    raise warning 'dispatch-job re-fire failed for %: %', p_request_id, sqlerrm;
  end;

  return coalesce(v_reach, 0);
end;
$function$;

-- refire_stale_requests(p_min_bids integer)   grants: {postgres=X/postgres,service_role=X/postgres}
CREATE OR REPLACE FUNCTION public.refire_stale_requests(p_min_bids integer DEFAULT 3)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
declare
  r      record;
  n_done int := 0;
begin
  for r in
    select cr.id
    from public.client_requests cr
    where cr.status = 'pending'
      and cr.waitlisted is not true
      and cr.refire_count < 2
      and coalesce(cr.reposted_at, cr.created_at)
            < now() - make_interval(hours => 24 * (cr.refire_count + 1))
      and (cr.refire_last_at is null or cr.refire_last_at < now() - interval '20 hours')
      and (select count(distinct b.contractor_id)
             from public.bids b where b.request_id = cr.id) < p_min_bids
      and not exists (select 1 from public.jobs j where j.request_id = cr.id)
    order by coalesce(cr.reposted_at, cr.created_at)
  loop
    begin
      perform public.refire_request(r.id);
      n_done := n_done + 1;
    exception when others then
      raise warning 'refire_stale_requests skipped %: %', r.id, sqlerrm;
    end;
  end loop;

  return n_done;
end $function$;

-- release_unconfirmed_visits()   grants: {postgres=X/postgres,service_role=X/postgres}
CREATE OR REPLACE FUNCTION public.release_unconfirmed_visits()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  r     record;
  v_n   integer := 0;
  v_when text;
begin
  for r in
    select j.id, j.client_id, j.contractor_id, j.scheduled_at,
           cr.service_needed
      from jobs j
      left join client_requests cr on cr.id = j.request_id
     where j.status = 'scheduled'
       and j.scheduled_at is not null
       and j.client_approved_at is not null
       and coalesce(j.payment_status, 'unpaid') not in ('held', 'released', 'disputed')
       and j.on_my_way_at is null
       and not public.contract_signed(j.id)
       and now() >= greatest(j.scheduled_at - interval '12 hours',
                             j.client_approved_at + interval '2 hours')
       -- staged jobs pay per stage, so jobs.payment_status stays 'unpaid'
       and not exists (
             select 1 from job_milestones m
              where m.job_id = j.id
                and m.status in ('funded', 'completed', 'released', 'disputed'))
       -- prepaid recurring visits are already covered by the pool
       and not exists (
             select 1 from recurring_prepayments rp
              where rp.id = j.prepayment_id
                and rp.status in ('held', 'partially_released'))
  loop
    v_when := coalesce(public.ff_local_ts(r.scheduled_at), 'the booked time');

    update jobs
       set status                    = 'assigned',
           slot_released_at          = now(),
           slot_released_from        = r.scheduled_at,
           scheduled_at              = null,
           schedule_proposed_at      = null,
           client_approved_at        = null,
           client_confirmed_visit_at = null,
           client_rescheduled_at     = null,
           reschedule_accepted_at    = null,
           visit_reminder_sent_at    = null,
           hour_reminder_sent_at     = null
     where id = r.id;

    begin
      perform public._notify(
        r.client_id, 'visit_slot_released',
        'Your ' || coalesce(r.service_needed, 'job') || ' visit needs rebooking',
        'The visit booked for ' || v_when || ' has been released, because the service agreement was not signed and the deposit not paid in time. Nothing is cancelled and you have not been charged -- your pro is still on the job. Sign the agreement and pay the deposit, and pick a new time together.',
        r.id);
      perform public._notify(
        r.contractor_id, 'visit_slot_released',
        'Visit slot released -- no signed agreement or deposit in time',
        'The ' || coalesce(r.service_needed, 'job') || ' visit booked for ' || v_when || ' has been released, so you can use that time for other work. The job is still yours -- send the agreement, and propose a new time once the client has signed and paid their deposit.',
        r.id);
    exception when others then null;
    end;

    v_n := v_n + 1;
  end loop;

  return v_n;
end;
$function$;

-- release_waitlisted_requests(p_ids uuid[], p_max integer, p_max_age_days integer, p_dispatch boolean)   grants: {postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres}
CREATE OR REPLACE FUNCTION public.release_waitlisted_requests(p_ids uuid[] DEFAULT NULL::uuid[], p_max integer DEFAULT 25, p_max_age_days integer DEFAULT 30, p_dispatch boolean DEFAULT true)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
declare
  r          record;
  n_released int := 0;
  n_sent     int := 0;
  v_url  text := coalesce(current_setting('app.supabase_url', true),
                          'https://kvypmjxbbaaknvddwwai.supabase.co')
                 || '/functions/v1/dispatch-job';
  v_anon text := '<ANON_KEY>';
begin
  perform public.admin_guard();
  perform public.log_admin_action('release_waitlisted_requests', 'client_requests', null, jsonb_build_object('ids', coalesce(array_length(p_ids, 1), 0), 'max', p_max, 'max_age_days', p_max_age_days, 'dispatch', p_dispatch));

  for r in
    select cr.id, cr.user_id, cr.service_needed
    from public.client_requests cr
    where cr.waitlisted
      and cr.status = 'pending'
      and (p_ids is null or cr.id = any(p_ids))
      and cr.created_at > now() - make_interval(days => greatest(p_max_age_days, 1))
    order by cr.created_at
    limit greatest(p_max, 1)
  loop
    update public.client_requests set waitlisted = false where id = r.id;
    n_released := n_released + 1;

    -- tell the client their request is live now
    begin
      perform public._notify(
        r.user_id,
        'request_reopened',
        'We''re back — your request is live',
        coalesce(r.service_needed, 'Your request')
          || ' has been sent to Calgary pros. Estimates should start arriving shortly.',
        null
      );
    exception when others then
      raise warning 'release notify skipped for %: %', r.id, sqlerrm;
    end;

    if p_dispatch then
      begin
        perform net.http_post(
          url     := v_url,
          headers := jsonb_build_object(
            'Content-Type',  'application/json',
            'Authorization', 'Bearer ' || v_anon
          ),
          body    := jsonb_build_object('request_id', r.id),
          timeout_milliseconds := 30000
        );
        n_sent := n_sent + 1;
      exception when others then
        raise warning 'release dispatch failed for %: %', r.id, sqlerrm;
      end;
    end if;
  end loop;

  return jsonb_build_object(
    'released',  n_released,
    'dispatched', n_sent,
    'remaining', (select count(*) from public.client_requests
                   where waitlisted and status = 'pending')
  );
end $function$;

-- remove_client_request(p_request_id uuid)   grants: {postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres}
CREATE OR REPLACE FUNCTION public.remove_client_request(p_request_id uuid)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
declare
  v_client   uuid;
  v_assigned boolean := false;
  v_job      record;
  v_block    text;
begin
  select user_id into v_client from client_requests where id = p_request_id;
  if v_client is null then
    raise exception 'Request not found';
  end if;
  if v_client <> auth.uid() and not public.is_admin() then
    raise exception 'Not authorized';
  end if;

  for v_job in select id from jobs where request_id = p_request_id loop
    v_block := public.job_money_block(v_job.id);
    if v_block is not null then
      raise exception '%', v_block;
    end if;
  end loop;

  if exists (
    select 1 from jobs j
     where j.request_id = p_request_id
       and j.status in ('in_progress', 'pending_confirmation')
  ) then
    raise exception 'Work on this job has already started, so it cannot be deleted here. Contact us at hello@freddyfixit.ca.';
  end if;

  if exists (select 1 from jobs where request_id = p_request_id) then
    v_assigned := true;
  end if;

  if v_assigned then
    update jobs set status = 'cancelled'
     where request_id = p_request_id
       and status not in ('completed', 'cancelled');
    update client_requests set status = 'cancelled' where id = p_request_id;
    return 'cancelled';
  else
    delete from client_requests where id = p_request_id;
    return 'deleted';
  end if;
end;
$function$;

-- repost_job(p_job_id uuid)   grants: {postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres}
CREATE OR REPLACE FUNCTION public.repost_job(p_job_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
declare
  v_client     uuid;
  v_contractor uuid;
  v_req        uuid;
  v_block      text;
  v_service    text;
  v_repost     jsonb;
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;

  select client_id, contractor_id, request_id
    into v_client, v_contractor, v_req
    from public.jobs where id = p_job_id;
  if v_client is null then raise exception 'Job not found'; end if;
  if v_client is distinct from auth.uid() then raise exception 'Job not found'; end if;

  -- The one predicate. The dashboard shows the button on exactly this, so the
  -- server and the browser can never disagree about whether it would work.
  v_block := public.job_repost_block(p_job_id);
  if v_block is not null then
    raise exception '%', v_block;
  end if;

  select service_needed into v_service from public.client_requests where id = v_req;

  update public.jobs set status = 'cancelled' where id = p_job_id;

  -- preferred_contractor_id is cleared too, or the 48h rehire reservation hands
  -- the job straight back to the pro the client just gave up on.
  update public.client_requests
     set status = 'pending', assigned_contractor_id = null, preferred_contractor_id = null
   where id = v_req;

  update public.bids
     set status = 'declined'
   where request_id = v_req and contractor_id = v_contractor;

  -- Resurface the bids that were only auto-declined when this pro was picked.
  -- A bid the client deliberately passed on carries declined_by_client_at and
  -- stays declined.
  update public.bids
     set status = 'pending'
   where request_id = v_req
     and contractor_id <> v_contractor
     and declined_by_client_at is null;

  perform public.notify_user(v_contractor, 'job_reopened', 'A job has been re-opened',
    'The client has re-opened ' || coalesce(v_service, 'a job')
      || ' to other pros because nothing was booked in. It is no longer assigned to you.',
    'https://freddyfixit.ca/contractor-dashboard', 'See open jobs');

  v_repost := public._repost_request_internal(v_req);
  return v_repost || jsonb_build_object('request_id', v_req);
end $function$;

-- request_quote_revision(p_job_id uuid, p_amount numeric, p_reason text, p_labour numeric, p_parts numeric, p_callout numeric, p_subject_to_inspection boolean, p_price_low numeric, p_price_high numeric, p_used_base_price boolean)   grants: {=X/postgres,postgres=X/postgres,anon=X/postgres,authenticated=X/postgres,service_role=X/postgres}
CREATE OR REPLACE FUNCTION public.request_quote_revision(p_job_id uuid, p_amount numeric, p_reason text, p_labour numeric DEFAULT NULL::numeric, p_parts numeric DEFAULT NULL::numeric, p_callout numeric DEFAULT NULL::numeric, p_subject_to_inspection boolean DEFAULT false, p_price_low numeric DEFAULT NULL::numeric, p_price_high numeric DEFAULT NULL::numeric, p_used_base_price boolean DEFAULT false)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare v_contractor uuid; v_client uuid; v_status text; v_paid timestamptz; v_total numeric; v_old_notes text;
begin
  select contractor_id, client_id, status, paid_at, notes
    into v_contractor, v_client, v_status, v_paid, v_old_notes
    from jobs where id = p_job_id;
  if v_contractor is null then raise exception 'Job not found'; end if;
  if auth.uid() is null or v_contractor <> auth.uid() then raise exception 'Not authorized'; end if;
  if v_status not in ('assigned','scheduled','in_progress') then raise exception 'You can only revise a quote on an active job'; end if;
  if v_paid is not null then raise exception 'This job is already paid. Please contact support to change the price.'; end if;
  if coalesce(trim(p_reason),'') = '' then raise exception 'Please explain why the price is changing'; end if;

  if p_labour is not null or p_parts is not null or p_callout is not null then
    v_total := coalesce(p_labour,0) + coalesce(p_parts,0) + coalesce(p_callout,0);
  else
    v_total := p_amount;
  end if;
  if v_total is null then raise exception 'Enter the new price'; end if;

  update jobs
     set amount = v_total,
         labour_amount = p_labour,
         parts_amount = p_parts,
         callout_fee = p_callout,
         subject_to_inspection = coalesce(p_subject_to_inspection,false),
         price_low = p_price_low,
         price_high = p_price_high,
         used_base_price = coalesce(p_used_base_price,false),
         notes = coalesce(v_old_notes||E'\n','')||'Price update: '||p_reason,
         client_approved_at = null,
         schedule_proposed_at = now(),
         status = 'assigned'
   where id = p_job_id;

  perform public._notify(v_client, 'schedule_proposed', 'Updated price needs your approval',
    'Your contractor updated the quote to $'||v_total::text||': '||p_reason||' Open your dashboard to review and approve.', p_job_id);
  perform public.notify_email('schedule_proposed', p_job_id);
end; $function$;

-- rescue_stuck_signups()   grants: {postgres=X/postgres,service_role=X/postgres}
CREATE OR REPLACE FUNCTION public.rescue_stuck_signups()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
declare
  r        record;
  v_token  text;
  v_key    text;
  v_n      integer := 0;
begin
  select substring(prosrc from 'eyJ[A-Za-z0-9_.-]{40,}')
    into v_key from pg_proc where proname = 'kick_reconcile_payouts' limit 1;
  if v_key is null then return 0; end if;

  for r in
    select u.id
    from auth.users u
    where u.email_confirmed_at is null
      and u.last_sign_in_at is null
      and u.created_at < now() - interval '6 hours'
      and u.created_at > now() - interval '7 days'
      and (select count(*) from public.signup_rescue_log l
             where l.user_id = u.id and l.ok) < 2
      and not exists (select 1 from public.signup_rescue_log l
             where l.user_id = u.id and l.sent_at > now() - interval '24 hours')
    order by u.created_at
    limit 25
  loop
    -- Per-row exception block: one bad row must never abort the sweep and
    -- silently strand everyone behind it (the auto_confirm_stale_jobs lesson).
    begin
      v_token := public.issue_internal_token('edge-internal');
      perform net.http_post(
        url     := 'https://kvypmjxbbaaknvddwwai.supabase.co/functions/v1/auth-rescue',
        headers := jsonb_build_object(
                     'Content-Type', 'application/json',
                     'Authorization', 'Bearer ' || v_key,
                     'x-ff-internal', v_token),
        body    := jsonb_build_object('user_id', r.id, 'kind', 'stuck')
      );
      v_n := v_n + 1;
    exception when others then
      null;
    end;
  end loop;

  return v_n;
end;
$function$;

-- respond_to_dispute(p_dispute_id uuid, p_response text, p_photos text[])   grants: {postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres}
CREATE OR REPLACE FUNCTION public.respond_to_dispute(p_dispute_id uuid, p_response text, p_photos text[] DEFAULT '{}'::text[])
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
declare v_contractor uuid; v_client uuid; v_job uuid; v_status text; r record;
begin
  select contractor_id, client_id, job_id, status
    into v_contractor, v_client, v_job, v_status
    from disputes where id = p_dispute_id;
  if v_contractor is null then raise exception 'Claim not found'; end if;
  if auth.uid() is null or v_contractor <> auth.uid() then raise exception 'Not authorized'; end if;
  if v_status <> 'open' then raise exception 'This claim has already been resolved.'; end if;
  if coalesce(p_response,'') = '' then raise exception 'Please describe your response.'; end if;

  update disputes set
    contractor_response = p_response,
    contractor_response_photos = coalesce(p_photos,'{}'),
    contractor_responded_at = now()
  where id = p_dispute_id;

  perform public._notify(v_client, 'dispute_response', 'The contractor responded to your claim',
    'The contractor submitted their response. Our team is reviewing both sides.', v_job);
  for r in select id from profiles where role = 'admin' loop
    perform public._notify(r.id, 'dispute_response', 'Contractor responded to a claim',
      'The contractor submitted a response. Review it in the admin dashboard.', v_job);
  end loop;
end; $function$;

-- rl_hit(p_bucket text, p_limit integer, p_window_secs integer)   grants: {postgres=X/postgres,service_role=X/postgres}
CREATE OR REPLACE FUNCTION public.rl_hit(p_bucket text, p_limit integer, p_window_secs integer)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
declare v_hdrs json; v_key text;
begin
  begin
    v_hdrs := current_setting('request.headers', true)::json;
  exception when others then
    v_hdrs := null;
  end;
  v_key := split_part(coalesce(v_hdrs->>'x-forwarded-for',''), ',', 1);
  return public.rl_hit_key(p_bucket, v_key, p_limit, p_window_secs);
end;
$function$;

-- rl_hit_key(p_bucket text, p_key text, p_limit integer, p_window_secs integer)   grants: {postgres=X/postgres,service_role=X/postgres}
CREATE OR REPLACE FUNCTION public.rl_hit_key(p_bucket text, p_key text, p_limit integer, p_window_secs integer)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
declare v_key text := nullif(btrim(coalesce(p_key,'')), ''); v_n int;
begin
  if v_key is null then
    return true;  -- can't identify the caller; don't block
  end if;

  insert into public.rate_limit_hits as t (bucket, key, window_start, count)
  values (p_bucket, v_key, now(), 1)
  on conflict (bucket, key) do update set
    window_start = case when t.window_start < now() - make_interval(secs => p_window_secs)
                        then now() else t.window_start end,
    count        = case when t.window_start < now() - make_interval(secs => p_window_secs)
                        then 1 else t.count + 1 end
  returning t.count into v_n;

  return v_n <= p_limit;
end;
$function$;

-- role_change_block(p_user_id uuid, p_new_role text)   grants: {postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres}
CREATE OR REPLACE FUNCTION public.role_change_block(p_user_id uuid, p_new_role text)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
declare
  v_role text;
  v_label text;
  v_busy boolean := false;
begin
  if p_user_id is null then
    return 'Could not work out which account this is.';
  end if;

  -- Authorization. auth.uid() IS NULL is tested FIRST and on its own: in SQL
  -- `auth.uid() <> p_user_id` is NULL when auth.uid() is NULL, and a NULL IF
  -- condition does not fire, so an unauthenticated caller would fall straight
  -- through. NULL here means service_role or an internal (trigger-side) caller,
  -- which is allowed to ask about any account. Everyone else may ask only about
  -- themselves, and a refusal is itself a "blocked" answer, so this fails closed.
  if auth.uid() is null then
    null;
  elsif auth.uid() <> p_user_id and not public.is_admin() then
    return 'You are not allowed to change this account.';
  end if;

  select role into v_role from public.profiles where id = p_user_id;

  -- No profile yet, or no change asked for: nothing to refuse.
  if v_role is null then return null; end if;
  if p_new_role is null or p_new_role = v_role then return null; end if;

  if v_role = 'admin' then
    return 'This is an administrator account. Its account type cannot be changed here.';
  end if;

  v_label := case v_role
    when 'contractor' then 'a contractor account'
    else 'a homeowner account'
  end;

  -- Has this account done anything yet?
  select exists (select 1 from public.client_requests where user_id = p_user_id)
      or exists (select 1 from public.bids            where contractor_id = p_user_id)
      or exists (select 1 from public.jobs            where client_id = p_user_id
                                                         or contractor_id = p_user_id)
      or exists (select 1 from public.reviews         where client_id = p_user_id
                                                         or contractor_id = p_user_id)
      -- A contractors row on its own is NOT activity: ensure_profile() creates a
      -- bare one. Real data in it is.
      or exists (select 1 from public.contractors c
                  where c.id = p_user_id
                    and (nullif(btrim(coalesce(c.company_name, '')), '') is not null
                         or coalesce(array_length(c.specialties, 1), 0) > 0
                         or c.stripe_account_id is not null
                         or coalesce(c.total_earned, 0) > 0
                         or c.review_status in ('approved', 'rejected')))
    into v_busy;

  if v_busy then
    return 'This email is already in use as ' || v_label || ' on Freddy Fix It, '
        || 'and one email can only hold one type of account. Please sign up with a '
        || 'different email address, or email hello@freddyfixit.ca and we will help '
        || 'you sort it out.';
  end if;

  return null;
end;
$function$;

-- run_platform_health_check()   grants: {postgres=X/postgres,service_role=X/postgres}
CREATE OR REPLACE FUNCTION public.run_platform_health_check()
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
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
$function$;

-- run_reminders()   grants: {postgres=X/postgres,service_role=X/postgres}
CREATE OR REPLACE FUNCTION public.run_reminders()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
DECLARE
  r record; n int := 0;
  v_season text; v_title text; v_body text; v_kind text;
  v_month int := extract(month from now())::int;
  v_year int := extract(year from now())::int;
BEGIN
  -- Site paused: every step below ends in an email to a client or a
  -- contractor. Returning here also leaves reminder_log and
  -- visit_reminder_sent_at untouched, so nothing is permanently skipped --
  -- these nudges simply resume when set_platform_mode('open') runs.
  IF public.outbound_paused() THEN RETURN 0; END IF;

  -- 0) Auto-generate due recurring occurrences (reserved for the plan's pro).
  BEGIN
    n := n + public.generate_recurring_occurrences();
  EXCEPTION WHEN OTHERS THEN RAISE WARNING 'generate_recurring_occurrences failed: %', SQLERRM;
  END;

  -- 1) Recurring requests that are due again since the client's last completed job (soft nudge)
  FOR r IN
    SELECT cr.id AS req_id, cr.user_id, cr.service_needed, cr.recurring_frequency,
           max(j.client_confirmed_at) AS last_done
    FROM client_requests cr
    JOIN jobs j ON j.request_id = cr.id AND j.status = 'completed'
    WHERE cr.recurring = true AND coalesce(cr.recurring_plan_status,'active') = 'active'
    GROUP BY cr.id, cr.user_id, cr.service_needed, cr.recurring_frequency
    HAVING max(j.client_confirmed_at) IS NOT NULL
       AND now() >= max(j.client_confirmed_at) + public.recurrence_interval(cr.recurring_frequency)
  LOOP
    v_kind := 'recurring:'||r.req_id||':'||to_char(now(),'YYYY-MM');
    IF NOT EXISTS (SELECT 1 FROM reminder_log WHERE user_id=r.user_id AND kind=v_kind) THEN
      PERFORM public.notify_user(r.user_id, 'recurring_due',
        'Time for your '||coalesce(r.service_needed,'service')||' again',
        'It''s been a while since your last '||coalesce(r.service_needed,'service')||
        '. Want to book it again? Your saved details make it a 30-second request.',
        'https://freddyfixit.ca/new-request', 'Book again');
      INSERT INTO reminder_log(user_id, kind) VALUES (r.user_id, v_kind) ON CONFLICT DO NOTHING;
      n := n + 1;
    END IF;
  END LOOP;

  -- 2) Seasonal nudge (one per engaged client per season)
  v_season := CASE
    WHEN v_month IN (9,10) THEN 'fall'
    WHEN v_month IN (11,12,1,2) THEN 'winter'
    WHEN v_month IN (3,4) THEN 'spring'
    ELSE 'summer' END;
  v_title := CASE v_season
    WHEN 'fall'   THEN 'Get ahead of Calgary winter'
    WHEN 'winter' THEN 'Calgary winter is here'
    WHEN 'spring' THEN 'Spring home tune-up time'
    ELSE 'Summer home projects season' END;
  v_body := CASE v_season
    WHEN 'fall'   THEN 'Book a furnace check, gutter clean, or weatherproofing before the snow flies. Calgary pros are booking up fast.'
    WHEN 'winter' THEN 'Line up snow removal and keep your furnace running warm. Our vetted Calgary pros are ready.'
    WHEN 'spring' THEN 'Post-winter roof & gutter checks, hail-season prep, and yard cleanups — get on the list early.'
    ELSE 'Long days are perfect for painting, landscaping, AC service and outdoor fixes. Get a free quote today.' END;
  v_kind := 'seasonal:'||v_year||'-'||v_season;

  FOR r IN
    SELECT DISTINCT cr.user_id
    FROM client_requests cr
    JOIN jobs j ON j.request_id = cr.id AND j.status = 'completed'
  LOOP
    IF NOT EXISTS (SELECT 1 FROM reminder_log WHERE user_id=r.user_id AND kind=v_kind) THEN
      PERFORM public.notify_user(r.user_id, 'seasonal', v_title, v_body,
        'https://freddyfixit.ca/new-request', 'Get a free quote');
      INSERT INTO reminder_log(user_id, kind) VALUES (r.user_id, v_kind) ON CONFLICT DO NOTHING;
      n := n + 1;
    END IF;
  END LOOP;

  -- 3) Day-before visit reminder: ask the client to confirm or change the time.
  FOR r IN
    SELECT j.id AS job_id, j.client_id, j.scheduled_at,
           cr.service_needed
    FROM jobs j
    JOIN client_requests cr ON cr.id = j.request_id
    WHERE j.status = 'scheduled'
      AND j.scheduled_at IS NOT NULL
      AND j.scheduled_at > now()
      AND j.scheduled_at <= now() + interval '28 hours'
      AND j.visit_reminder_sent_at IS NULL
      AND j.client_confirmed_visit_at IS NULL
  LOOP
    PERFORM public.notify_user(r.client_id, 'visit_tomorrow',
      'Your '||coalesce(r.service_needed,'service')||' is coming up',
      'Your pro is booked for '||coalesce(public.ff_local_ts(r.scheduled_at), 'the booked time')||
      '. Tap to confirm the visit or pick a different time — the day before is your last easy change.',
      'https://freddyfixit.ca/client-dashboard', 'Confirm or change');
    UPDATE jobs SET visit_reminder_sent_at = now() WHERE id = r.job_id;
    n := n + 1;
  END LOOP;

  -- 4) Estimates sitting unactioned: client has PENDING bids on an open request
  --    and the newest of them is 48h+ old. Re-arms per bid count (a new bid
  --    restarts the clock).
  --
  --    Three things here are load-bearing and were all wrong until 2026-11-05:
  --    * The count is filtered to status='pending'. It used to count EVERY bid,
  --      accepted and declined included, so the email could promise more
  --      estimates than ClientDashboard renders -- the dashboard reads pending
  --      bids only. A number in an email that the page then contradicts is
  --      worse than no email at all.
  --    * The link carries the request's pick_token and goes to /pick/<token>,
  --      not /client-dashboard. The dashboard sits behind a login wall, and
  --      that login step is already recorded as having lost the platform's
  --      first four clients -- which is precisely why pick_token and the
  --      /pick/:token route exist. Only the first-bid email was using them.
  --    * The 30-day ceiling. A "your estimates are waiting" email about a
  --      three-month-old request is noise, and a cron is the wrong sender for
  --      it -- an old lead belongs to the owner personally. Without the
  --      ceiling, repairing stale request data silently mails every client it
  --      touches, which is how a data fix turns into an unplanned campaign.
  FOR r IN
    SELECT cr.id AS req_id, cr.user_id, cr.service_needed, cr.pick_token,
           count(b.id) AS bid_count, max(b.created_at) AS newest_bid
    FROM client_requests cr
    JOIN bids b ON b.request_id = cr.id AND b.status = 'pending'
    WHERE cr.status = 'pending'
      AND cr.user_id IS NOT NULL
      AND cr.assigned_contractor_id IS NULL
    GROUP BY cr.id, cr.user_id, cr.service_needed, cr.pick_token
    HAVING max(b.created_at) < now() - interval '48 hours'
       AND max(b.created_at) > now() - interval '30 days'
  LOOP
    v_kind := 'bids_waiting:'||r.req_id||':'||r.bid_count;
    IF NOT EXISTS (SELECT 1 FROM reminder_log WHERE user_id=r.user_id AND kind=v_kind) THEN
      PERFORM public.notify_user(r.user_id, 'bids_waiting',
        r.bid_count||' estimate'||CASE WHEN r.bid_count=1 THEN '' ELSE 's' END||' waiting for your '||coalesce(r.service_needed,'request'),
        'Vetted Calgary pros have sent you '||CASE WHEN r.bid_count=1 THEN 'an estimate' ELSE r.bid_count||' estimates' END||
        ' for your '||coalesce(r.service_needed,'request')||'. Take a look and pick the one that fits — pros book up fast this time of year.',
        CASE WHEN r.pick_token IS NOT NULL
             THEN 'https://freddyfixit.ca/pick/'||r.pick_token
             ELSE 'https://freddyfixit.ca/client-dashboard' END, 'Review estimates');
      INSERT INTO reminder_log(user_id, kind) VALUES (r.user_id, v_kind) ON CONFLICT DO NOTHING;
      n := n + 1;
    END IF;
  END LOOP;

  -- 5) Schedule/price proposal awaiting the client's approval for 48h+.
  --    Skips jobs mid-reschedule (ball is in the contractor's court) and jobs
  --    with a pending price change (step 6 handles those).
  FOR r IN
    SELECT j.id AS job_id, j.client_id, j.schedule_proposed_at, cr.service_needed
    FROM jobs j
    JOIN client_requests cr ON cr.id = j.request_id
    WHERE j.status = 'assigned'
      AND j.schedule_proposed_at IS NOT NULL
      AND j.schedule_proposed_at < now() - interval '48 hours'
      AND j.client_approved_at IS NULL
      AND j.price_change_pending IS NULL
      AND NOT (j.client_rescheduled_at IS NOT NULL AND j.reschedule_accepted_at IS NULL)
  LOOP
    v_kind := 'proposal:'||r.job_id||':'||to_char(r.schedule_proposed_at,'YYYYMMDDHH24MI');
    IF NOT EXISTS (SELECT 1 FROM reminder_log WHERE user_id=r.client_id AND kind=v_kind) THEN
      PERFORM public.notify_user(r.client_id, 'proposal_waiting',
        'Your pro''s estimate is waiting on you',
        'Your pro proposed a time and price for your '||coalesce(r.service_needed,'job')||
        ' a couple of days ago. Approve it to lock in your spot, or message them if something doesn''t work.',
        'https://freddyfixit.ca/client-dashboard', 'Review & approve');
      INSERT INTO reminder_log(user_id, kind) VALUES (r.client_id, v_kind) ON CONFLICT DO NOTHING;
      n := n + 1;
    END IF;
  END LOOP;

  -- 6) Price change pending the client's approval for 48h+.
  FOR r IN
    SELECT j.id AS job_id, j.client_id, j.price_change_proposed_at, cr.service_needed
    FROM jobs j
    JOIN client_requests cr ON cr.id = j.request_id
    WHERE j.price_change_pending IS NOT NULL
      AND j.price_change_proposed_at IS NOT NULL
      AND j.price_change_proposed_at < now() - interval '48 hours'
      AND j.payment_status IS DISTINCT FROM 'released'
  LOOP
    v_kind := 'pricechange:'||r.job_id||':'||to_char(r.price_change_proposed_at,'YYYYMMDDHH24MI');
    IF NOT EXISTS (SELECT 1 FROM reminder_log WHERE user_id=r.client_id AND kind=v_kind) THEN
      PERFORM public.notify_user(r.client_id, 'price_change_waiting',
        'A price update needs your OK',
        'Your pro proposed an updated price for your '||coalesce(r.service_needed,'job')||
        '. Nothing is charged until you approve it — review the change or decline it from your dashboard.',
        'https://freddyfixit.ca/client-dashboard', 'Review price change');
      INSERT INTO reminder_log(user_id, kind) VALUES (r.client_id, v_kind) ON CONFLICT DO NOTHING;
      n := n + 1;
    END IF;
  END LOOP;

  -- 7) Contractor owes an estimate: assigned 48h+ ago, nothing proposed yet
  --    (and no walkthrough in flight). Nudged once per job.
  FOR r IN
    SELECT j.id AS job_id, j.contractor_id, cr.service_needed
    FROM jobs j
    JOIN client_requests cr ON cr.id = j.request_id
    WHERE j.status = 'assigned'
      AND j.schedule_proposed_at IS NULL
      AND j.created_at < now() - interval '48 hours'
      AND (j.walkthrough_proposed_at IS NULL OR j.walkthrough_done_at IS NOT NULL)
      AND j.contractor_id IS NOT NULL
  LOOP
    v_kind := 'estimate_owed:'||r.job_id;
    IF NOT EXISTS (SELECT 1 FROM reminder_log WHERE user_id=r.contractor_id AND kind=v_kind) THEN
      PERFORM public.notify_user(r.contractor_id, 'estimate_owed',
        'A client is waiting on your estimate',
        'You were assigned a '||coalesce(r.service_needed,'job')||' two days ago and haven''t sent a time and price yet. '||
        'Clients book whoever responds first — send your estimate now to keep this one.',
        'https://freddyfixit.ca/contractor-dashboard', 'Send estimate');
      INSERT INTO reminder_log(user_id, kind) VALUES (r.contractor_id, v_kind) ON CONFLICT DO NOTHING;
      n := n + 1;
    END IF;
  END LOOP;

  -- 8) Balance owed after the work is done -- the "ghost client".
  --    Deposit is held, the pro has finished and photographed the job, and the
  --    client never came back to pay the 60%. Every payout guard correctly
  --    refuses to release, so the contractor waits forever and only the admin
  --    ever hears about it (health check 5). This is the client-facing half.
  --
  --    Predicate mirrors the dashboard's awaitingBalance(): held, not a
  --    milestone job, real outstanding amount. Milestone and prepay jobs are
  --    excluded because their money moves per stage / per pool and neither has
  --    a whole-job balance to pay. A pending price change is excluded because
  --    the amount is mid-negotiation -- naming a figure that is about to change
  --    would be worse than saying nothing, and step 6 already nudges those.
  --
  --    Escalates 24h -> 3d -> 7d and then STOPS. The stage is part of the
  --    dedupe key, so paying (or the job leaving 'held') ends it early, and a
  --    client who never pays gets three emails, not one a day forever.
  FOR r IN
    SELECT j.id AS job_id, j.client_id, cr.service_needed,
           round(j.total_charged - coalesce(j.funded_amount,0), 2) AS owed,
           CASE
             WHEN now() >= j.contractor_completed_at + interval '7 days'  THEN 3
             WHEN now() >= j.contractor_completed_at + interval '3 days'  THEN 2
             WHEN now() >= j.contractor_completed_at + interval '24 hours' THEN 1
             ELSE 0 END AS stage
    FROM jobs j
    JOIN client_requests cr ON cr.id = j.request_id
    WHERE j.payment_status = 'held'
      AND j.status = 'pending_confirmation'
      AND coalesce(j.is_milestone,false) = false
      AND j.prepayment_id IS NULL
      AND j.price_change_pending IS NULL
      AND j.client_id IS NOT NULL
      AND j.contractor_completed_at IS NOT NULL
      AND j.total_charged IS NOT NULL
      AND j.total_charged - coalesce(j.funded_amount,0) > 0.005
      AND now() >= j.contractor_completed_at + interval '24 hours'
  LOOP
    v_kind := 'balance_owed:'||r.job_id||':'||r.stage;
    IF NOT EXISTS (SELECT 1 FROM reminder_log WHERE user_id=r.client_id AND kind=v_kind) THEN
      PERFORM public.notify_user(r.client_id, 'balance_owed',
        CASE r.stage
          WHEN 1 THEN 'Your '||coalesce(r.service_needed,'job')||' is done — one step left'
          WHEN 2 THEN 'Your pro is still waiting to be paid'
          ELSE 'Final reminder: a balance is outstanding'
        END,
        'Your pro has finished your '||coalesce(r.service_needed,'job')||' and uploaded their photos. '||
        'There''s $'||to_char(r.owed,'FM999999990.00')||' left on the job — you paid a deposit up front, and this is the rest. '||
        'Pay the balance from your dashboard, then confirm the work so your pro gets paid.',
        'https://freddyfixit.ca/client-dashboard', 'Pay the balance');
      INSERT INTO reminder_log(user_id, kind) VALUES (r.client_id, v_kind) ON CONFLICT DO NOTHING;
      n := n + 1;
    END IF;
  END LOOP;

  RETURN n;
END; $function$;

-- save_contract_draft(p_job_id uuid, p_custom_clauses text, p_source text, p_uploaded_path text, p_uploaded_ack boolean)   grants: {=X/postgres,postgres=X/postgres,anon=X/postgres,authenticated=X/postgres,service_role=X/postgres}
CREATE OR REPLACE FUNCTION public.save_contract_draft(p_job_id uuid, p_custom_clauses text DEFAULT NULL::text, p_source text DEFAULT 'generated'::text, p_uploaded_path text DEFAULT NULL::text, p_uploaded_ack boolean DEFAULT false)
 RETURNS job_contracts
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_uid uuid := (select auth.uid());
  v_job record;
  v_body text;
  v_row public.job_contracts;
begin
  select id, client_id, contractor_id, status into v_job from public.jobs where id = p_job_id;
  if not found then raise exception 'job not found'; end if;
  if v_job.contractor_id is null or v_job.contractor_id <> v_uid then
    raise exception 'only the assigned contractor can prepare the contract';
  end if;
  if p_source not in ('generated','uploaded') then raise exception 'bad source'; end if;
  if p_source = 'uploaded' and (p_uploaded_path is null or not p_uploaded_ack) then
    raise exception 'uploaded contract requires a file and the liability acknowledgment';
  end if;

  v_body := public.build_contract_body(p_job_id);

  insert into public.job_contracts (job_id, client_id, contractor_id, status, source, body_md, custom_clauses, uploaded_path, uploaded_ack)
  values (p_job_id, v_job.client_id, v_uid, 'draft', p_source, v_body, nullif(trim(coalesce(p_custom_clauses,'')),''), p_uploaded_path, coalesce(p_uploaded_ack,false))
  on conflict (job_id) do update set
    client_id      = excluded.client_id,
    source         = excluded.source,
    body_md        = excluded.body_md,
    custom_clauses = excluded.custom_clauses,
    uploaded_path  = excluded.uploaded_path,
    uploaded_ack   = excluded.uploaded_ack,
    status         = case when public.job_contracts.status = 'signed' then public.job_contracts.status else 'draft' end
  where public.job_contracts.status <> 'signed'   -- never mutate a fully-signed contract
  returning * into v_row;

  if v_row.id is null then
    raise exception 'this contract is already signed and cannot be changed';
  end if;
  return v_row;
end $function$;

-- save_job_photo(p_job_id uuid, p_kind text, p_path text)   grants: {postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres}
CREATE OR REPLACE FUNCTION public.save_job_photo(p_job_id uuid, p_kind text, p_path text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare v_contractor uuid; v_status text;
begin
  if p_kind not in ('before','after') then raise exception 'Unknown photo type'; end if;
  if p_path is null or btrim(p_path) = '' then raise exception 'No photo was uploaded'; end if;

  -- The bucket RLS already keys on <job_id>/… ; mirror that here so a path
  -- belonging to another job can never be written onto this record.
  if split_part(p_path, '/', 1) <> p_job_id::text then
    raise exception 'That photo does not belong to this job';
  end if;

  select contractor_id, status into v_contractor, v_status from public.jobs where id = p_job_id;
  if v_contractor is null then raise exception 'Job not found'; end if;
  if v_contractor <> auth.uid() then raise exception 'Not authorized'; end if;
  if v_status not in ('assigned','scheduled','in_progress','pending_confirmation') then
    raise exception 'This job is no longer open for photos';
  end if;

  if p_kind = 'before' then
    update public.jobs set before_photo_path = p_path, before_photo_at = now() where id = p_job_id;
  else
    update public.jobs set completion_photo_path = p_path, after_photo_at = now() where id = p_job_id;
  end if;
end;
$function$;

-- scan_rate_check(p_ip text, p_limit integer, p_window_secs integer)   grants: {=X/postgres,postgres=X/postgres,service_role=X/postgres}
CREATE OR REPLACE FUNCTION public.scan_rate_check(p_ip text, p_limit integer, p_window_secs integer)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  new_count int;
begin
  if p_ip is null or p_ip = '' then
    return true; -- can't identify caller; don't block
  end if;
  insert into public.scan_rate_limit as t (ip, window_start, count)
  values (p_ip, now(), 1)
  on conflict (ip) do update set
    window_start = case when t.window_start < now() - make_interval(secs => p_window_secs)
                        then now() else t.window_start end,
    count        = case when t.window_start < now() - make_interval(secs => p_window_secs)
                        then 1 else t.count + 1 end
  returning t.count into new_count;
  return new_count <= p_limit;
end; $function$;

-- scrub_address_text(p_text text)   grants: {postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres}
CREATE OR REPLACE FUNCTION public.scrub_address_text(p_text text)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
  select case when p_text is null then null else
    regexp_replace(
      regexp_replace(
        p_text,
        '(?i)\m\d{1,6}\s+[A-Za-z0-9''\.\-]+(\s+[A-Za-z0-9''\.\-]+)?\s+(st|street|ave|avenue|rd|road|dr|drive|blvd|boulevard|cres|crescent|way|close|cl|court|ct|place|pl|gate|green|grove|bay|link|mews|terrace|trail|tr|rise|point|pt|landing|manor|heights|hts|parkway|pkwy|lane|ln|circle|cir|hill|row|common|commons|gardens|gdns|villas|square|sq)\M\.?(\s+(nw|ne|sw|se)\M)?',
        '[address hidden]', 'g'),
      '(?i)\m[A-Za-z]\d[A-Za-z][ \-]?\d[A-Za-z]\d\M',
      '[postal code hidden]', 'g')
  end;
$function$;

-- send_client_welcome()   grants: {postgres=X/postgres,service_role=X/postgres}
CREATE OR REPLACE FUNCTION public.send_client_welcome()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
declare
  v_url text := coalesce(current_setting('app.supabase_url', true),
                         'https://kvypmjxbbaaknvddwwai.supabase.co')
                || '/functions/v1/client-welcome';
begin
  begin
    perform net.http_post(
      url     := v_url,
      headers := jsonb_build_object('Content-Type', 'application/json'),
      body    := jsonb_build_object('id', new.id)
    );
  exception when others then
    -- A mail hiccup must never cost somebody their account.
    raise warning 'client-welcome enqueue failed: %', sqlerrm;
  end;
  return new;
end;
$function$;

-- send_contractor_welcome()   grants: {postgres=X/postgres,service_role=X/postgres}
CREATE OR REPLACE FUNCTION public.send_contractor_welcome()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
declare
  v_url text := coalesce(current_setting('app.supabase_url', true),
                         'https://kvypmjxbbaaknvddwwai.supabase.co')
                || '/functions/v1/contractor-welcome';
begin
  -- DELIBERATELY NOT gated on outbound_paused(). Someone who just signed up is
  -- owed an answer whether or not we are taking new work. See header.
  begin
    perform net.http_post(
      url     := v_url,
      headers := jsonb_build_object('Content-Type', 'application/json'),
      body    := jsonb_build_object('id', new.id)
    );
  exception when others then
    -- Never let a mail hiccup roll back the contractor row it is announcing.
    raise warning 'contractor-welcome enqueue failed: %', sqlerrm;
  end;
  return new;
end;
$function$;

-- send_login_fix_apology()   grants: {postgres=X/postgres,service_role=X/postgres}
CREATE OR REPLACE FUNCTION public.send_login_fix_apology()
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
declare
  v_send_at constant timestamptz := timestamptz '2026-08-06 16:00:00+00';  -- 10:00am Calgary (MDT)
  v_type    constant text := 'account_login_fixed';
  v_title   constant text := 'Sorry - a bug was blocking your login. It is fixed.';
  v_body    constant text :=
    'We found a bug on our end that stopped your confirmation email from going out, which is why you could not get into your Freddy Fix It account. That was our mistake and we are sorry. It is fixed now - your account is confirmed and ready, so you can sign in with the email and password you signed up with. If anything still is not working, email us at hello@freddyfixit.ca and we will sort it out right away.';
  v_ids     constant uuid[] := array[
    '29dd5f27-3b2c-4c26-b135-ef243b8b5870'::uuid,   -- Rangeview
    'f55da513-5aff-436e-a568-15e2a28ab7e5'::uuid,   -- Lisa
    'd6eed5b1-090e-4001-9b10-2b7ba4b799e5'::uuid    -- TightFramingYYC
  ];
  v_uid  uuid;
  v_sent int := 0;
begin
  -- Belt and braces: never fire early, whatever cron thinks the time is.
  if now() < v_send_at then
    return 'too early - nothing sent';
  end if;

  foreach v_uid in array v_ids loop
    -- Write-once per person. A retry or a double-fire cannot email twice.
    insert into public.notifications (user_id, type, title, body)
    select v_uid, v_type, v_title, v_body
     where exists (select 1 from public.profiles where id = v_uid)
       and not exists (
         select 1 from public.notifications
          where user_id = v_uid and type = v_type
       );
    v_sent := v_sent + coalesce((select 1 where found), 0);
  end loop;

  -- One-shot: retire the schedule so it can never run again.
  begin
    perform cron.unschedule('login-fix-apology');
  exception when others then
    null;  -- already gone, or run manually; not a failure
  end;

  return 'sent ' || v_sent::text;
end;
$function$;

-- send_visit_time_confirm_oneshot()   grants: {postgres=X/postgres,service_role=X/postgres}
CREATE OR REPLACE FUNCTION public.send_visit_time_confirm_oneshot()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_job    record;
  v_client text;
  v_pro    text;
  v_time   text;
begin
  -- One-shot: unschedule first so a retry or stray tick can't double-send.
  begin
    perform cron.unschedule('visit-time-confirm-oneshot');
  exception when others then null;
  end;

  select j.id, j.client_id, j.contractor_id, j.scheduled_at, j.status,
         r.service_needed, r.location
    into v_job
    from public.jobs j
    join public.client_requests r on r.id = j.request_id
   where j.id = 'd57175f6-6492-44a7-b32a-f4cd3af19cd8';

  if v_job.id is null or v_job.status <> 'scheduled' then
    return;  -- visit cancelled or already moved on: stay quiet
  end if;

  -- Just the clock time; the copy already says "today".
  v_time := trim(to_char(v_job.scheduled_at at time zone 'America/Edmonton',
                         'FMHH12:MI AM'));

  select coalesce(first_name,'there') into v_client from public.profiles where id = v_job.client_id;
  select coalesce(first_name,'there') into v_pro    from public.profiles where id = v_job.contractor_id;

  insert into public.notifications (user_id, type, title, body, job_id)
  values (
    v_job.client_id, 'schedule_confirmed',
    'Your plumbing visit today at ' || v_time,
    'Hi ' || v_client || ' - just confirming your ' || v_job.service_needed ||
    ' at ' || v_job.location || ' is booked for today at ' || v_time ||
    '. If your dashboard showed a different time earlier today, ' || v_time ||
    ' is the correct one.',
    v_job.id
  );

  insert into public.notifications (user_id, type, title, body, job_id)
  values (
    v_job.contractor_id, 'schedule_confirmed',
    'Your plumbing job today at ' || v_time,
    'Hi ' || v_pro || ' - just confirming your ' || v_job.service_needed ||
    ' at ' || v_job.location || ' is booked for today at ' || v_time ||
    '. If your dashboard showed a different time earlier today, ' || v_time ||
    ' is the correct one.',
    v_job.id
  );
end;
$function$;

-- service_benchmark(p_service text)   grants: {=X/postgres,postgres=X/postgres,anon=X/postgres,authenticated=X/postgres,service_role=X/postgres}
CREATE OR REPLACE FUNCTION public.service_benchmark(p_service text)
 RETURNS TABLE(benchmark numeric, low_price numeric, high_price numeric, benchmark_source text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  with tokens as (
    select trim(t) as service
    from unnest(string_to_array(coalesce(p_service, ''), ',')) as t
    where trim(t) <> ''
  ),
  hit as (
    select st.*
    from tokens tk
    join public.get_service_price_stats() st on st.service = tk.service
  )
  select
    nullif(sum(hit.benchmark), 0)                                  as benchmark,
    sum(coalesce(hit.typical_low, hit.base_price))                 as low_price,
    sum(coalesce(hit.typical_high, hit.base_price))                as high_price,
    case when bool_or(hit.benchmark_source = 'jobs') then 'jobs' else 'pricebook' end as benchmark_source
  from hit
  having count(*) > 0;
$function$;

-- service_is_compulsory(p_service text)   grants: {=X/postgres,postgres=X/postgres,anon=X/postgres,authenticated=X/postgres,service_role=X/postgres}
CREATE OR REPLACE FUNCTION public.service_is_compulsory(p_service text)
 RETURNS boolean
 LANGUAGE sql
 STABLE
 SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
  select coalesce(bool_or(sc.compulsory), false)
  from public.service_compulsory sc
  where lower(btrim(sc.service)) = lower(btrim(coalesce(p_service, '')));
$function$;

-- service_specialties(p_service text)   grants: {=X/postgres,postgres=X/postgres,anon=X/postgres,authenticated=X/postgres,service_role=X/postgres}
CREATE OR REPLACE FUNCTION public.service_specialties(p_service text)
 RETURNS text[]
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
declare
  v_label  text;
  v_labels text[];
  v_spec   text[];
  v_out    text[] := '{}'::text[];
begin
  select array_agg(distinct btrim(l))
    into v_labels
    from unnest(string_to_array(coalesce(p_service, ''), ',')) l
   where btrim(l) <> '';

  -- No labels at all (null, blank, or ", ,") reaches everyone, same as an
  -- unmapped one.
  if v_labels is null or array_length(v_labels, 1) is null then
    return null;
  end if;

  foreach v_label in array v_labels loop
    v_spec := null;   -- SELECT INTO sets NULL on zero rows, but say it anyway
    select m.specialties into v_spec
      from public.service_specialty_map m
     where m.service = v_label;
    if v_spec is null then
      return null;    -- one unknown label ⇒ reach everyone
    end if;
    v_out := v_out || v_spec;
  end loop;

  select array_agg(distinct s order by s) into v_out from unnest(v_out) s;
  -- array_agg over an empty input returns NULL, and NULL here would mean
  -- "everyone" — the opposite of what a map row holding '{}' says. Coalesce so
  -- an empty mapping keeps meaning "nobody", unchanged.
  return coalesce(v_out, '{}'::text[]);
end;
$function$;

-- set_job_autopay(p_job_id uuid, p_on boolean)   grants: {postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres}
CREATE OR REPLACE FUNCTION public.set_job_autopay(p_job_id uuid, p_on boolean)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
declare v_client uuid;
begin
  select client_id into v_client from public.jobs where id = p_job_id;
  if v_client is null then raise exception 'Job not found'; end if;
  -- auth.uid() is null for service_role and any unauthenticated caller. This
  -- control is the client's own consent switch and nothing else may touch it.
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

-- set_job_checklist(p_job_id uuid, p_checklist jsonb)   grants: {=X/postgres,postgres=X/postgres,anon=X/postgres,authenticated=X/postgres,service_role=X/postgres}
CREATE OR REPLACE FUNCTION public.set_job_checklist(p_job_id uuid, p_checklist jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare v_contractor uuid; v_status text; v_items jsonb; it jsonb;
begin
  select contractor_id, status into v_contractor, v_status from jobs where id = p_job_id;
  if v_contractor is null then raise exception 'Job not found'; end if;
  if auth.uid() is null or v_contractor <> auth.uid() then raise exception 'Not authorized'; end if;
  if v_status in ('cancelled') then raise exception 'Job is cancelled'; end if;

  if p_checklist is null or jsonb_typeof(p_checklist) <> 'array' then
    update jobs set checklist = null where id = p_job_id;
    return;
  end if;
  if jsonb_array_length(p_checklist) > 40 then raise exception 'Checklist too long (max 40 items)'; end if;

  v_items := '[]'::jsonb;
  for it in select * from jsonb_array_elements(p_checklist) loop
    if coalesce(btrim(it->>'text'),'') = '' then continue; end if;
    v_items := v_items || jsonb_build_array(jsonb_build_object(
      'text', left(btrim(it->>'text'), 200),
      'done', coalesce((it->>'done')::boolean, false)
    ));
  end loop;
  update jobs set checklist = case when jsonb_array_length(v_items) = 0 then null else v_items end
   where id = p_job_id;
end; $function$;

-- set_platform_mode(p_mode text, p_notice jsonb)   grants: {postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres}
CREATE OR REPLACE FUNCTION public.set_platform_mode(p_mode text, p_notice jsonb DEFAULT NULL::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
declare
  quiet boolean := (p_mode in ('paused', 'waitlist'));
  j     record;
begin
  perform public.admin_guard();
  perform public.log_admin_action('set_platform_mode', 'platform_settings', p_mode, jsonb_build_object('mode', p_mode));
  if p_mode not in ('open', 'paused', 'waitlist') then
    raise exception 'mode must be open, waitlist or paused, got %', p_mode;
  end if;

  insert into public.platform_settings (key, value, updated_at, updated_by)
  values ('mode', to_jsonb(p_mode), now(), auth.uid())
  on conflict (key) do update set value = excluded.value, updated_at = now(), updated_by = excluded.updated_by;

  if p_notice is not null then
    insert into public.platform_settings (key, value, updated_at, updated_by)
    values ('pause_notice', p_notice, now(), auth.uid())
    on conflict (key) do update set value = excluded.value, updated_at = now(), updated_by = excluded.updated_by;
  end if;

  begin
    for j in select jobid, jobname from cron.job
             where jobname in ('refire-stale-requests',
                               'escalate-unbid-requests',
                               'newsletter-client',
                               'newsletter-contractor',
                               'daily-reminders',
                               'visit-reminders')
    loop
      perform cron.alter_job(j.jobid, active := not quiet);
    end loop;
  exception when others then
    raise notice 'cron toggle skipped: %', sqlerrm;
  end;

  return public.platform_status();
end;
$function$;

-- set_quote(p_request_id uuid, p_amount numeric, p_notes text)   grants: {=X/postgres,postgres=X/postgres,anon=X/postgres,authenticated=X/postgres,service_role=X/postgres}
CREATE OR REPLACE FUNCTION public.set_quote(p_request_id uuid, p_amount numeric, p_notes text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if public.is_admin()
     or exists (select 1 from public.client_requests cr
                where cr.id = p_request_id and cr.assigned_contractor_id = auth.uid())
     or exists (select 1 from public.jobs j
                where j.request_id = p_request_id and j.contractor_id = auth.uid())
  then
    update public.client_requests
       set estimated_quote = p_amount, quote_notes = p_notes
     where id = p_request_id;
  else
    raise exception 'Not authorized to quote this request';
  end if;
end;
$function$;

-- set_recurring_plan_status(p_request uuid, p_status text)   grants: {=X/postgres,postgres=X/postgres,anon=X/postgres,authenticated=X/postgres,service_role=X/postgres}
CREATE OR REPLACE FUNCTION public.set_recurring_plan_status(p_request uuid, p_status text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
begin
  if p_status not in ('active','paused','ended') then
    raise exception 'invalid status %', p_status;
  end if;
  update client_requests
    set recurring_plan_status = p_status
  where id = p_request
    and user_id = (select auth.uid())
    and recurring = true;
  if not found then
    raise exception 'plan not found or not yours';
  end if;
end;
$function$;

-- set_request_budget(p_request_id uuid, p_min numeric, p_max numeric, p_flexible boolean)   grants: {=X/postgres,postgres=X/postgres,anon=X/postgres,authenticated=X/postgres,service_role=X/postgres}
CREATE OR REPLACE FUNCTION public.set_request_budget(p_request_id uuid, p_min numeric DEFAULT NULL::numeric, p_max numeric DEFAULT NULL::numeric, p_flexible boolean DEFAULT false)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_owner uuid; v_status text;
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;

  select user_id, status into v_owner, v_status
  from public.client_requests where id = p_request_id;

  if v_owner is null then raise exception 'Request not found'; end if;
  if v_owner is distinct from (select auth.uid()) and not public.is_admin() then
    raise exception 'You do not have permission to edit this request';
  end if;
  if v_status <> 'pending' then
    raise exception 'Budget can only be changed while the job is still open for bids';
  end if;

  if not coalesce(p_flexible, false) then
    if p_min is not null and p_min < 0 then raise exception 'Budget cannot be negative'; end if;
    if p_min is not null and p_max is not null and p_max < p_min then
      raise exception 'Budget maximum must be at least the minimum';
    end if;
  end if;

  update public.client_requests
     set budget_flexible = coalesce(p_flexible, false),
         budget_min      = case when coalesce(p_flexible, false) then null else p_min end,
         budget_max      = case when coalesce(p_flexible, false) then null else p_max end
   where id = p_request_id;
end;
$function$;

-- set_weekly_goal(p_goal numeric)   grants: {=X/postgres,postgres=X/postgres,anon=X/postgres,authenticated=X/postgres,service_role=X/postgres}
CREATE OR REPLACE FUNCTION public.set_weekly_goal(p_goal numeric)
 RETURNS void
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  UPDATE public.contractors SET weekly_goal = NULLIF(p_goal, 0) WHERE id = auth.uid();
$function$;

-- shares_connection(other uuid)   grants: {=X/postgres,postgres=X/postgres,anon=X/postgres,authenticated=X/postgres,service_role=X/postgres}
CREATE OR REPLACE FUNCTION public.shares_connection(other uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
  select
    exists (select 1 from public.jobs j
            where (j.client_id = auth.uid() and j.contractor_id = other)
               or (j.contractor_id = auth.uid() and j.client_id = other))
    or
    exists (select 1 from public.client_requests cr
            where (cr.user_id = auth.uid() and cr.assigned_contractor_id = other)
               or (cr.assigned_contractor_id = auth.uid() and cr.user_id = other));
$function$;

-- social_bot_secret()   grants: {postgres=X/postgres,service_role=X/postgres}
CREATE OR REPLACE FUNCTION public.social_bot_secret()
 RETURNS text
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
  select value from public.social_bot_config where key = 'bot_key';
$function$;

-- social_propose_action(p_conversation_id uuid, p_kind text, p_payload jsonb)   grants: {postgres=X/postgres,service_role=X/postgres}
CREATE OR REPLACE FUNCTION public.social_propose_action(p_conversation_id uuid, p_kind text, p_payload jsonb DEFAULT '{}'::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
begin
  return public.agent_propose_action(
    p_agent           => 'social-bot',
    p_kind            => p_kind,
    p_dedupe_key      => null,
    p_payload         => p_payload,
    p_conversation_id => p_conversation_id);
end;
$function$;

-- social_record_outbound(p_conversation_id uuid, p_messages text[], p_state jsonb, p_intent text, p_disclosed boolean, p_handed_off boolean)   grants: {postgres=X/postgres,service_role=X/postgres}
CREATE OR REPLACE FUNCTION public.social_record_outbound(p_conversation_id uuid, p_messages text[], p_state jsonb DEFAULT NULL::jsonb, p_intent text DEFAULT NULL::text, p_disclosed boolean DEFAULT NULL::boolean, p_handed_off boolean DEFAULT NULL::boolean)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
declare m text;
begin
  foreach m in array coalesce(p_messages, array[]::text[]) loop
    if coalesce(m, '') <> '' then
      insert into public.social_messages (conversation_id, direction, body)
      values (p_conversation_id, 'out', m);
    end if;
  end loop;

  update public.social_conversations
     set state            = coalesce(p_state, state),
         intent           = coalesce(nullif(p_intent, ''), intent),
         disclosed        = coalesce(p_disclosed, disclosed),
         handed_off       = coalesce(p_handed_off, handed_off),
         last_outbound_at = now()
   where id = p_conversation_id;
end;
$function$;

-- social_upsert_turn(p_channel text, p_external_user_id text, p_display_name text, p_external_message_id text, p_text text)   grants: {postgres=X/postgres,service_role=X/postgres}
CREATE OR REPLACE FUNCTION public.social_upsert_turn(p_channel text, p_external_user_id text, p_display_name text DEFAULT NULL::text, p_external_message_id text DEFAULT NULL::text, p_text text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
declare
  v_convo   public.social_conversations;
  v_msg_id  uuid;
  v_history jsonb;
begin
  if p_channel is null or p_external_user_id is null or p_external_user_id = '' then
    raise exception 'social_upsert_turn: channel and external_user_id are required';
  end if;

  insert into public.social_conversations (channel, external_user_id, display_name)
  values (p_channel, p_external_user_id, nullif(p_display_name, ''))
  on conflict (channel, external_user_id) do update
    set display_name = coalesce(nullif(excluded.display_name, ''), public.social_conversations.display_name)
  returning * into v_convo;

  insert into public.social_messages (conversation_id, direction, external_message_id, body)
  values (v_convo.id, 'in', nullif(p_external_message_id, ''), p_text)
  on conflict (conversation_id, external_message_id) where external_message_id is not null
  do nothing
  returning id into v_msg_id;

  if v_msg_id is null and nullif(p_external_message_id, '') is not null then
    return jsonb_build_object('conversation_id', v_convo.id, 'duplicate', true);
  end if;

  update public.social_conversations
     set turn_count        = turn_count + 1,
         last_inbound_at   = now(),
         window_expires_at = now() + interval '24 hours'
   where id = v_convo.id
  returning * into v_convo;

  select coalesce(jsonb_agg(x order by x.created_at), '[]'::jsonb) into v_history
  from (
    select direction, body, created_at
    from public.social_messages
    where conversation_id = v_convo.id and body is not null and body <> ''
    order by created_at desc
    limit 24
  ) x;

  return jsonb_build_object(
    'conversation_id',    v_convo.id,
    'duplicate',          false,
    'channel',            v_convo.channel,
    'display_name',       v_convo.display_name,
    'intent',             v_convo.intent,
    'state',              v_convo.state,
    'disclosed',          v_convo.disclosed,
    'handed_off',         v_convo.handed_off,
    'turn_count',         v_convo.turn_count,
    'created_request_id', v_convo.created_request_id,
    'history',            v_history
  );
end;
$function$;

-- start_job_timer(p_job_id uuid)   grants: {postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres}
CREATE OR REPLACE FUNCTION public.start_job_timer(p_job_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
declare
  v_contractor uuid;
  v_status     text;
  v_client     uuid;
  v_service    text;
  v_first      boolean;
  v_name       text;
  v_id         uuid;
begin
  select j.contractor_id, j.status, j.client_id, r.service_needed
    into v_contractor, v_status, v_client, v_service
    from jobs j
    left join client_requests r on r.id = j.request_id
   where j.id = p_job_id;

  if v_contractor is null then raise exception 'Job not found'; end if;
  if v_contractor <> auth.uid() then raise exception 'Not authorized'; end if;
  if v_status in ('completed','cancelled') then raise exception 'Job is finished — the timer can''t be started'; end if;
  if exists (select 1 from job_time_logs where job_id = p_job_id and ended_at is null) then
    raise exception 'A timer is already running on this job';
  end if;

  -- Read BEFORE the insert, or the row we are about to write makes every start
  -- look like a resume and the client is never told at all.
  v_first := not exists (select 1 from job_time_logs where job_id = p_job_id);

  insert into job_time_logs (job_id, contractor_id) values (p_job_id, v_contractor)
  returning id into v_id;

  if v_first and v_client is not null then
    -- Cosmetic only, and guarded on its own so it cannot take the notification
    -- with it. `contractors.id` IS the auth uid; there is no user_id column.
    begin
      select nullif(trim(coalesce(c.company_name, p.first_name, '')), '')
        into v_name
        from profiles p
        left join contractors c on c.id = p.id
       where p.id = v_contractor;
    exception when others then
      v_name := null;
    end;

    begin
      perform public._notify(
        v_client,
        'timer_started',
        coalesce(v_name, 'Your contractor') || ' has started work',
        coalesce(v_name, 'Your pro') || ' just started the timer on your '
          || coalesce(lower(v_service), 'job')
          || '. You can watch the tracked time on your dashboard. The price you agreed does not change on its own — if they need to bill for the time, you will get a price change to approve first.',
        p_job_id
      );
    exception when others then
      -- A notification must never roll back a timer the pro has already
      -- started standing in someone's kitchen.
      null;
    end;
  end if;

  return v_id;
end; $function$;

-- stop_job_timer(p_job_id uuid)   grants: {=X/postgres,postgres=X/postgres,anon=X/postgres,authenticated=X/postgres,service_role=X/postgres}
CREATE OR REPLACE FUNCTION public.stop_job_timer(p_job_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare v_n int;
begin
  update job_time_logs
     set ended_at = now()
   where job_id = p_job_id and contractor_id = auth.uid() and ended_at is null;
  get diagnostics v_n = row_count;
  if v_n = 0 then raise exception 'No running timer on this job'; end if;
end; $function$;

-- storage_upload_rate_guard()   grants: {postgres=X/postgres,service_role=X/postgres}
CREATE OR REPLACE FUNCTION public.storage_upload_rate_guard()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
declare v_uid uuid;
begin
  begin
    v_uid := auth.uid();
  exception when others then
    v_uid := null;
  end;

  -- service_role and internal writers: not a user, not gated.
  if v_uid is null then
    return new;
  end if;

  if not public.rl_hit_key('storage_upload', v_uid::text, 60, 3600) then
    raise exception
      'Too many uploads in a short time. Please wait a few minutes and try again.'
      using errcode = '54000';
  end if;

  return new;
end;
$function$;

-- submit_quote_lead(p_name text, p_email text, p_phone text, p_service text, p_location text, p_details text)   grants: {=X/postgres,postgres=X/postgres,anon=X/postgres,authenticated=X/postgres,service_role=X/postgres}
CREATE OR REPLACE FUNCTION public.submit_quote_lead(p_name text, p_email text, p_phone text, p_service text, p_location text, p_details text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
begin
  insert into public.quote_leads (name, email, phone, service_needed, location, details)
  values (
    nullif(left(trim(coalesce(p_name,'')), 120), ''),
    nullif(left(trim(coalesce(p_email,'')), 160), ''),
    nullif(left(trim(coalesce(p_phone,'')), 40), ''),
    nullif(left(trim(coalesce(p_service,'')), 200), ''),
    nullif(left(trim(coalesce(p_location,'')), 200), ''),
    nullif(left(trim(coalesce(p_details,'')), 2000), '')
  );
end; $function$;

-- submit_review(p_job_id uuid, p_price integer, p_experience integer, p_result integer, p_comment text)   grants: {postgres=X/postgres,anon=X/postgres,authenticated=X/postgres,service_role=X/postgres}
CREATE OR REPLACE FUNCTION public.submit_review(p_job_id uuid, p_price integer, p_experience integer, p_result integer, p_comment text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare v_client uuid; v_contractor uuid; v_status text;
begin
  select client_id, contractor_id, status into v_client, v_contractor, v_status
    from jobs where id = p_job_id;
  if v_client is null then raise exception 'Job not found'; end if;
  if auth.uid() is null or v_client <> auth.uid() then raise exception 'Not authorized'; end if;
  if v_status <> 'completed' then raise exception 'You can only review a completed job'; end if;
  if p_price not between 1 and 10 or p_experience not between 1 and 10 or p_result not between 1 and 10 then
    raise exception 'Scores must be between 1 and 10'; end if;

  insert into reviews(job_id, contractor_id, client_id, price_score, experience_score, result_score, comment)
  values (p_job_id, v_contractor, v_client, p_price, p_experience, p_result, nullif(p_comment, ''))
  on conflict (job_id) do update set
    price_score = excluded.price_score, experience_score = excluded.experience_score,
    result_score = excluded.result_score, comment = excluded.comment, created_at = now();

  update contractors c set
    rating_price      = sub.ap,
    rating_experience = sub.ae,
    rating_result     = sub.ar,
    rating_count      = sub.n,
    rating            = round((sub.ap + sub.ae + sub.ar) / 3.0, 1)
  from (
    select avg(price_score)::numeric(4,1) ap, avg(experience_score)::numeric(4,1) ae,
           avg(result_score)::numeric(4,1) ar, count(*) n
    from reviews where contractor_id = v_contractor
  ) sub
  where c.id = v_contractor;

  perform public._notify(v_contractor, 'review_received', 'You received a rating',
    'A client rated your completed job. Open your dashboard to see your updated score.', p_job_id);
end; $function$;

-- tg_job_contracts_touch()   grants: {postgres=X/postgres,service_role=X/postgres}
CREATE OR REPLACE FUNCTION public.tg_job_contracts_touch()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
begin new.updated_at := now(); return new; end $function$;

-- toggle_favorite(p_contractor_id uuid)   grants: {=X/postgres,postgres=X/postgres,anon=X/postgres,authenticated=X/postgres,service_role=X/postgres}
CREATE OR REPLACE FUNCTION public.toggle_favorite(p_contractor_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE v_exists boolean;
BEGIN
  SELECT true INTO v_exists FROM favorites WHERE client_id=auth.uid() AND contractor_id=p_contractor_id;
  IF v_exists THEN
    DELETE FROM favorites WHERE client_id=auth.uid() AND contractor_id=p_contractor_id;
    RETURN false;
  ELSE
    INSERT INTO favorites(client_id, contractor_id) VALUES (auth.uid(), p_contractor_id)
      ON CONFLICT DO NOTHING;
    RETURN true;
  END IF;
END; $function$;

-- trade_reach(p_service text)   grants: {postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres}
CREATE OR REPLACE FUNCTION public.trade_reach(p_service text)
 RETURNS integer
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
  select count(*)::int
  from public.contractors c
  join public.profiles p on p.id = c.id
  cross join lateral (select public.service_specialties(p_service) as required) m
  where c.status = 'active'
    and p.email is not null
    and (m.required is null or c.specialties && m.required);
$function$;

-- trg_admin_alert_new_contractor()   grants: {postgres=X/postgres,service_role=X/postgres}
CREATE OR REPLACE FUNCTION public.trg_admin_alert_new_contractor()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
begin
  perform public.enqueue_admin_alert('new_contractor', new.id);
  return new;
end;
$function$;

-- trg_admin_alert_new_job()   grants: {postgres=X/postgres,service_role=X/postgres}
CREATE OR REPLACE FUNCTION public.trg_admin_alert_new_job()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
begin
  if new.recurring_source_date is null and new.recurring_parent_id is null then
    perform public.enqueue_admin_alert('new_job', new.id);
  end if;
  return new;
end;
$function$;

-- trg_dispatch_new_request()   grants: {postgres=X/postgres,service_role=X/postgres}
CREATE OR REPLACE FUNCTION public.trg_dispatch_new_request()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
declare
  v_url  text := coalesce(current_setting('app.supabase_url', true),
                          'https://kvypmjxbbaaknvddwwai.supabase.co')
                 || '/functions/v1/dispatch-job';
  v_anon text := '<ANON_KEY>';
begin
  if new.waitlisted then return new; end if;
  -- Site paused: the request is still recorded, contractors just aren't paged.
  if public.outbound_paused() then return new; end if;
  begin
    perform net.http_post(
      url     := v_url,
      headers := jsonb_build_object('Content-Type', 'application/json',
                                    'Authorization', 'Bearer ' || v_anon),
      body    := jsonb_build_object('request_id', new.id),
      timeout_milliseconds := 30000);
  exception when others then
    raise warning 'dispatch-job enqueue failed: %', sqlerrm;
  end;
  return new;
end;
$function$;

-- trg_jobs_notify_client()   grants: {postgres=X/postgres,service_role=X/postgres}
CREATE OR REPLACE FUNCTION public.trg_jobs_notify_client()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
begin
  if tg_op = 'UPDATE' then
    if old.status is distinct from 'pending_confirmation'
       and new.status = 'pending_confirmation' then
      perform public.notify_email('job_completed_client', new.id);
    end if;
  end if;
  return new;
end;
$function$;

-- trg_notify_request_received()   grants: {postgres=X/postgres,anon=X/postgres,authenticated=X/postgres,service_role=X/postgres}
CREATE OR REPLACE FUNCTION public.trg_notify_request_received()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
begin
  -- A welcome note is never worth the row it is announcing. Same discipline as
  -- the signup welcome email: this runs inside the client's own INSERT, so any
  -- failure here must not cost them the request.
  begin
    -- user_id is null on a request with no account behind it, so there is
    -- nobody to notify. recurring_parent_id marks an auto-generated occurrence
    -- of a plan the client already set up — they did not just post it, and
    -- "here's what happens next" would be wrong. waitlisted rows are NOT
    -- dispatched to pros, so promising estimates would be a lie; the pause
    -- would suppress the email anyway, but the bell would still say it.
    if new.user_id is not null
       and new.recurring_parent_id is null
       and coalesce(new.waitlisted, false) = false then
      perform public._notify(
        new.user_id,
        'request_received',
        'We''ve got your request — here''s what happens next',
        'Your request for ' || coalesce(nullif(trim(new.service_needed), ''), 'help around the home')
          || ' is in, and it has gone out to the Calgary pros who do this work. They''ll review it and send you estimates — you''ll get an email for each one with the price and a one-tap link to accept it, so there''s nothing you need to watch for. You choose who gets the job: nothing is charged until you pick a pro and sign the service agreement they send you, and your payment is held securely until the work is done. One thing that speeds this up a lot — add a photo of the job on your dashboard if you haven''t already. Pros quote faster and far more accurately when they can see what they''re walking into.',
        null
      );
    end if;
  exception when others then
    null;  -- never let the confirmation take the request down with it
  end;
  return new;
end;
$function$;

-- ui_dismissals_cap()   grants: {postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres}
CREATE OR REPLACE FUNCTION public.ui_dismissals_cap()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
begin
  if (select count(*) from public.ui_dismissals d where d.user_id = new.user_id) >= 200 then
    raise exception 'Too many dismissals stored for this account.' using errcode = '54000';
  end if;
  return new;
end;
$function$;

-- update_client_request(p_request_id uuid, p_service text, p_schedule text, p_location text, p_description text)   grants: {postgres=X/postgres,anon=X/postgres,authenticated=X/postgres,service_role=X/postgres}
CREATE OR REPLACE FUNCTION public.update_client_request(p_request_id uuid, p_service text, p_schedule text, p_location text, p_description text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare v_owner uuid;
begin
  select user_id into v_owner from client_requests where id = p_request_id;
  if v_owner is null then raise exception 'Request not found'; end if;
  if auth.uid() is null or v_owner <> auth.uid() then raise exception 'Not authorized'; end if;

  update client_requests
     set service_needed     = coalesce(p_service, service_needed),
         preferred_schedule = coalesce(p_schedule, preferred_schedule),
         location           = coalesce(p_location, location),
         job_description    = coalesce(p_description, job_description)
   where id = p_request_id;
end;
$function$;

-- update_job(p_job_id uuid, p_status text, p_scheduled_date date, p_notes text)   grants: {postgres=X/postgres,anon=X/postgres,authenticated=X/postgres,service_role=X/postgres}
CREATE OR REPLACE FUNCTION public.update_job(p_job_id uuid, p_status text, p_scheduled_date date, p_notes text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_contractor uuid;
  v_request    uuid;
begin
  select contractor_id, request_id into v_contractor, v_request
    from jobs where id = p_job_id;
  if v_contractor is null then raise exception 'Job not found'; end if;
  if auth.uid() is null or v_contractor <> auth.uid() then raise exception 'Not authorized'; end if;

  if p_status is not null and p_status not in ('assigned','in_progress','completed') then
    raise exception 'Invalid status';
  end if;

  update jobs
     set status         = coalesce(p_status, status),
         scheduled_date = coalesce(p_scheduled_date, scheduled_date),
         notes          = coalesce(p_notes, notes)
   where id = p_job_id;

  -- keep the client's request in sync with job progress
  if p_status = 'in_progress' then
    update client_requests set status = 'in_progress' where id = v_request;
  elsif p_status = 'completed' then
    update client_requests set status = 'completed' where id = v_request;
  end if;
end;
$function$;

-- visit_reminder_enabled()   grants: {postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres}
CREATE OR REPLACE FUNCTION public.visit_reminder_enabled()
 RETURNS boolean
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$ select false $function$;

-- void_contract_on_price_change()   grants: {postgres=X/postgres,service_role=X/postgres}
CREATE OR REPLACE FUNCTION public.void_contract_on_price_change()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare v_had boolean;
begin
  if coalesce(new.payment_status, 'unpaid') not in ('unpaid') then
    return new;
  end if;

  update job_contracts
     set status = 'void'
   where job_id = new.id
     and status = 'signed';

  get diagnostics v_had = row_count;
  if not v_had then return new; end if;

  begin
    perform public._notify(
      new.contractor_id, 'contract_signature',
      'The price changed — send a new agreement',
      'The price on this job changed, so the signed agreement no longer matches it. Send a fresh agreement for the client to sign — they cannot pay until they do.',
      new.id);
    perform public._notify(
      new.client_id, 'contract_signature',
      'Your pro updated the price',
      'The price on this job changed, so the agreement you signed no longer matches it. Your pro will send a new one to sign — nothing has been charged.',
      new.id);
  exception when others then null;
  end;

  return new;
end;
$function$;

-- withdraw_job(p_job_id uuid)   grants: {postgres=X/postgres,anon=X/postgres,authenticated=X/postgres,service_role=X/postgres}
CREATE OR REPLACE FUNCTION public.withdraw_job(p_job_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
declare
  v_contractor uuid;
  v_request    uuid;
  v_status     text;
  v_block      text;
begin
  select contractor_id, request_id, status
    into v_contractor, v_request, v_status
    from jobs where id = p_job_id;

  if v_contractor is null then
    raise exception 'Job not found';
  end if;
  if auth.uid() is null or v_contractor <> auth.uid() then
    raise exception 'Not authorized';
  end if;

  v_block := public.job_money_block(p_job_id);
  if v_block is not null then
    raise exception '%', v_block;
  end if;

  if v_status in ('completed', 'pending_confirmation') then
    raise exception 'This job is already finished, so it cannot be withdrawn.';
  end if;

  delete from messages where job_id = p_job_id;
  delete from jobs where id = p_job_id;

  update client_requests
     set status = 'pending', assigned_contractor_id = null
   where id = v_request
     and status not in ('completed', 'cancelled');
end;
$function$;

-- withdraw_price_change(p_job_id uuid)   grants: {postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres}
CREATE OR REPLACE FUNCTION public.withdraw_price_change(p_job_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
declare v_contractor uuid; v_client uuid; v_pending jsonb;
begin
  if auth.uid() is null then raise exception 'Not authorized'; end if;

  select contractor_id, client_id, price_change_pending
    into v_contractor, v_client, v_pending
    from jobs where id = p_job_id;
  if v_client is null then raise exception 'Job not found'; end if;

  -- is_admin() is one branch of a normal-user OR, deliberately: this is a
  -- reversible write by the job's own contractor, so it must not demand the
  -- admin second factor from a contractor.
  if not (public.is_admin() or v_contractor = auth.uid()) then
    raise exception 'Not authorized';
  end if;

  if v_pending is null then raise exception 'There is no pending price change'; end if;

  update jobs set price_change_pending = null, price_change_proposed_at = null
   where id = p_job_id;

  -- The client may well have already read the email about it, so say it plainly
  -- and name the price that now stands. A cosmetic lookup failure must never
  -- take the real notification down with it, so there is no shared catch-all
  -- here — _notify is the only call in the block.
  perform public._notify(v_client, 'price_change_withdrawn',
    'Your pro withdrew the price change',
    'The new price your pro proposed has been withdrawn. The price you already agreed to still stands, and nothing was charged.',
    p_job_id);
end;
$function$;

