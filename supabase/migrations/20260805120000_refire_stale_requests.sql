-- Re-fire the new-job email for requests that stalled.
--
-- A request that draws one bid is barely better than a request that draws none,
-- but only the zero-bid case was ever escalated (escalate_stale_unbid_requests),
-- and that escalation sends an in-app bell rather than an email. So a job sitting
-- at 1 bid was invisible to every automatic path we have.
--
-- dispatch-job already does the matching, the ranking, the copy and the sending.
-- The one thing stopping it from being re-run is `client_requests.dispatched_to`,
-- which it treats as a permanent "already told them" list. This resets that array
-- down to the contractors who ALREADY BID before re-invoking, which means:
--   * every matched pro who hasn't bid is emailed again, exactly once per re-fire
--   * nobody who already bid is nudged about a job they've quoted
--   * dispatch-job's own guard is intact afterwards, so a stray double-invoke
--     is still a no-op.

alter table public.client_requests
  add column if not exists refire_count   int         not null default 0,
  add column if not exists refire_last_at timestamptz;

comment on column public.client_requests.refire_count is
  'How many times the new-job email has been re-sent for this request. Capped at 2 automatic nudges (24h and 48h); the admin button can exceed it deliberately.';

-- ── The worker ─────────────────────────────────────────────────────────────
-- Returns how many contractors the re-fire is expected to reach. dispatch-job
-- runs over HTTP and answers asynchronously, so we cannot read its count back;
-- this recomputes the same matcher (service_specialty_map, active only, minus
-- hidden_jobs, minus anyone already in dispatched_to) so the number we report to
-- the admin is the real one and not a guess.
create or replace function public.refire_request(p_request_id uuid)
returns int
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_req      record;
  v_required text[];
  v_bidders  uuid[];
  v_reach    int;
  v_url  text := coalesce(current_setting('app.supabase_url', true),
                          'https://kvypmjxbbaaknvddwwai.supabase.co')
                 || '/functions/v1/dispatch-job';
  -- Public anon key (safe to embed, it ships in the JS bundle). dispatch-job is
  -- verify_jwt=false and uses its own service-role key internally.
  v_anon text := 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imt2eXBtanhiYmFha252ZGR3d2FpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk3MTM3MTIsImV4cCI6MjA5NTI4OTcxMn0.5VMp6SerPxUUnnjr-43N29pHbh6kpgJc71USvL_Ooj4';
begin
  select * into v_req from public.client_requests where id = p_request_id;
  if not found then
    raise exception 'request not found';
  end if;
  -- dispatch-job returns not_pending for anything else, so stop here rather than
  -- burn a refire_count on a call that was never going to send.
  if v_req.status <> 'pending' then
    return 0;
  end if;

  select array_agg(distinct b.contractor_id) into v_bidders
  from public.bids b where b.request_id = p_request_id;
  v_bidders := coalesce(v_bidders, '{}'::uuid[]);

  -- Same matcher as the feed, the in-app notifier and dispatch-job itself.
  -- No row for this service label = passthrough, so the job is never invisible.
  select m.specialties into v_required
  from public.service_specialty_map m where m.service = v_req.service_needed;

  if v_req.preferred_contractor_id is not null
     and v_req.created_at > now() - interval '48 hours' then
    -- Still inside the rehire reservation. dispatch-job will mail only the
    -- requested pro, so report that and don't imply a wider send.
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

  -- Shrink the guard to the pros who already bid, then let dispatch-job run.
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
      body    := jsonb_build_object('request_id', p_request_id)
    );
  exception when others then
    raise warning 'dispatch-job re-fire failed for %: %', p_request_id, sqlerrm;
  end;

  return coalesce(v_reach, 0);
end $$;

-- ── The scheduled sweep ────────────────────────────────────────────────────
-- Two nudges maximum, at roughly 24h and 48h, and only while the request is
-- still short of p_min_bids. Runs hourly, so "24h" means "the first sweep after
-- the request turns 24h old".
create or replace function public.refire_stale_requests(p_min_bids int default 3)
returns int
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  r      record;
  n_done int := 0;
begin
  for r in
    select cr.id
    from public.client_requests cr
    where cr.status = 'pending'
      and cr.refire_count < 2
      -- first nudge after 24h, second after 48h
      and cr.created_at < now() - make_interval(hours => 24 * (cr.refire_count + 1))
      -- belt and braces: never two sends in the same day whatever the counter says
      and (cr.refire_last_at is null or cr.refire_last_at < now() - interval '20 hours')
      and (select count(distinct b.contractor_id)
             from public.bids b where b.request_id = cr.id) < p_min_bids
      -- a job that has already been awarded is not stale, it's done with bidding
      and not exists (select 1 from public.jobs j where j.request_id = cr.id)
    order by cr.created_at
  loop
    -- One bad request must not stop the sweep for the rest.
    begin
      perform public.refire_request(r.id);
      n_done := n_done + 1;
    exception when others then
      raise warning 'refire_stale_requests skipped %: %', r.id, sqlerrm;
    end;
  end loop;

  return n_done;
end $$;

-- ── The admin button ───────────────────────────────────────────────────────
-- Deliberately ignores the two-nudge cap: this is the owner overriding it on
-- purpose, and the button shows the reach up front so it's an informed press.
create or replace function public.admin_refire_request(p_request_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_reach int;
  v_bids  int;
begin
  if not public.is_admin() then
    raise exception 'not authorised';
  end if;

  v_reach := public.refire_request(p_request_id);
  select count(distinct b.contractor_id) into v_bids
  from public.bids b where b.request_id = p_request_id;

  return jsonb_build_object(
    'reached', v_reach,
    'bids',    coalesce(v_bids, 0),
    'refire_count', (select refire_count from public.client_requests where id = p_request_id)
  );
end $$;

-- Internal: cron and other definer functions only. PUBLIC must be revoked too —
-- the default grant is to PUBLIC, so revoking anon/authenticated alone is a no-op.
revoke all on function public.refire_request(uuid)      from public, anon, authenticated;
revoke all on function public.refire_stale_requests(int) from public, anon, authenticated;
grant execute on function public.refire_request(uuid)      to postgres, service_role;
grant execute on function public.refire_stale_requests(int) to postgres, service_role;

-- The admin RPC is called over PostgREST by a signed-in admin, so authenticated
-- needs EXECUTE; is_admin() inside is what actually gates it.
revoke all on function public.admin_refire_request(uuid) from public, anon;
grant execute on function public.admin_refire_request(uuid) to authenticated, service_role, postgres;
