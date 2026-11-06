-- ============================================================================
-- 20261105_lead_response_agent.sql
-- APPLIED LIVE 2026-11-05 via Supabase MCP. Committed for version control only.
--
-- The first agent harness: lead-response. ZERO model calls, by construction.
--
-- WHY A DB FUNCTION AND NOT AN EDGE FUNCTION. Everything this agent does is a
-- join: "does this request's state disagree with the jobs table", "has this
-- quote been sitting unchased past the nudge ceiling", "would anyone even see
-- this trade". Asking a language model to re-derive an answer SQL already holds
-- costs money, adds latency, and can be confidently wrong. A DB function plus
-- pg_cron also cannot burn a token even by accident, which is the owner's
-- standing cost instruction made structural rather than advisory.
--
-- MONEY: this migration touches NONE of the four payout guards. It reads
-- client_requests / bids / jobs and writes only agent_actions and agent_runs.
-- No branch here receives or releases money, so funded_amount and fully_funded
-- are untouched.
--
-- FOUR THINGS LAND HERE, and three of them are fixes to the queue we already
-- shipped rather than new agent code:
--
--   1. agent_expire_stale_actions() — and it is NOT housekeeping. The dedupe
--      branch in agent_propose_action matches status in ('pending','approved',
--      'sent'). A proposal past expires_at is still literally 'pending', so it
--      matches, gets refreshed forever and is never re-proposed. Combine that
--      with the expiry refusal added below and the owner would be left with a
--      row he can neither approve nor get a fresh copy of: a control that can
--      never succeed, which is worse than no control. The sweep closes that
--      loop, and it runs from agent_run_start so no harness can forget it.
--
--   2. admin_review_agent_action gains a real expiry check. The Agents tab has
--      told the owner since day one that approving an expired suggestion "will
--      be refused". Nothing checked expires_at. The UI was lying.
--
--   3. agent_kind_needs_harness() — the declared list of kinds that are a
--      HANDOFF to the owner rather than work for a bot. Approving one of those
--      means "I have done this", so it goes straight to 'sent'. Without this,
--      every approval would sit at 'approved' forever and read as the exact
--      failure the Agents tab exists to surface: approved, and nothing picked
--      it up. An UNKNOWN kind returns true on purpose — fail safe toward
--      "nothing picked it up" rather than silently marking work done.
--
--   4. agent_lead_response_run() — the harness itself.
--
-- Proven with a rolled-back probe, 11/11 PASS: privileges, first run (9 found /
-- 9 new / model_calls 0), second run refreshes rather than duplicates, a forced
-- expiry is swept and re-proposed fresh, the needs_harness predicate, the
-- per-run cap biting with the run row surviving as 'warn', and a forced error
-- leaving an agent_runs row with status='error' instead of vanishing.
--
-- Then, live: one manual run (9 proposals), cron 'agent-lead-response' at
-- 0 14 * * * (07:00 Calgary, an hour before the health check), and
-- agent_registry.enabled flipped true with expected_every = 1 day. Nothing else
-- on the roster is enabled.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Expire stale proposals.
-- ----------------------------------------------------------------------------
create or replace function public.agent_expire_stale_actions()
returns int
language plpgsql
security definer
set search_path = public, pg_temp
as $$
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
$$;

revoke all on function public.agent_expire_stale_actions() from public;
revoke all on function public.agent_expire_stale_actions() from anon;
revoke all on function public.agent_expire_stale_actions() from authenticated;
grant execute on function public.agent_expire_stale_actions() to service_role;

-- ----------------------------------------------------------------------------
-- 2. agent_run_start now sweeps. Same signature, so create-or-replace keeps the
--    ACL (a drop+create would reset it to Supabase's default grant to anon and
--    authenticated — the 2026-11-04 hole).
--
--    The run row is inserted BEFORE the sweep, and the sweep gets its OWN
--    exception block: the run row is the thing that matters, the sweep is
--    maintenance, and a catch-all shared between the two would let a cosmetic
--    failure take the real telemetry down. The failure is recorded in details
--    rather than swallowed.
-- ----------------------------------------------------------------------------
create or replace function public.agent_run_start(p_agent text, p_trigger text default 'schedule')
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
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
$$;

revoke all on function public.agent_run_start(text, text) from public;
revoke all on function public.agent_run_start(text, text) from anon;
revoke all on function public.agent_run_start(text, text) from authenticated;
grant execute on function public.agent_run_start(text, text) to service_role;

-- ----------------------------------------------------------------------------
-- 3. Which kinds need a bot, and which are a handoff to the owner.
-- ----------------------------------------------------------------------------
create or replace function public.agent_kind_needs_harness(p_kind text)
returns boolean
language sql
immutable
set search_path = public, pg_temp
as $$
  -- false = approving this means "the owner did it himself", so it completes.
  -- An unknown kind returns TRUE: better to show "approved, nothing picked it
  -- up" than to mark work done that nobody did.
  select coalesce(p_kind, '') not in (
    'stranded_request',
    'stale_estimates',
    'unreachable_trade',
    'no_bids_exhausted'
  );
$$;

revoke all on function public.agent_kind_needs_harness(text) from public;
revoke all on function public.agent_kind_needs_harness(text) from anon;
grant execute on function public.agent_kind_needs_harness(text) to authenticated;
grant execute on function public.agent_kind_needs_harness(text) to service_role;

-- ----------------------------------------------------------------------------
-- 4. Review: honest expiry refusal + handoff completion.
--    Returns jsonb, so create-or-replace preserves the ACL.
-- ----------------------------------------------------------------------------
create or replace function public.admin_review_agent_action(p_action_id uuid, p_approve boolean, p_payload jsonb default null)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
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
$$;

revoke all on function public.admin_review_agent_action(uuid, boolean, jsonb) from public;
revoke all on function public.admin_review_agent_action(uuid, boolean, jsonb) from anon;
grant execute on function public.admin_review_agent_action(uuid, boolean, jsonb) to authenticated;
grant execute on function public.admin_review_agent_action(uuid, boolean, jsonb) to service_role;

-- ----------------------------------------------------------------------------
-- 5. The list gains needs_harness, so the button label and the status the RPC
--    will actually write come from ONE predicate instead of two copies.
-- ----------------------------------------------------------------------------
create or replace function public.admin_list_agent_actions(p_limit int default 50, p_status text default null)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
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
$$;

revoke all on function public.admin_list_agent_actions(int, text) from public;
revoke all on function public.admin_list_agent_actions(int, text) from anon;
grant execute on function public.admin_list_agent_actions(int, text) to authenticated;
grant execute on function public.admin_list_agent_actions(int, text) to service_role;

-- ----------------------------------------------------------------------------
-- 6. The harness.
--
-- Four finding kinds, one UNION ALL, in priority order so that a cap truncates
-- the LEAST important findings rather than an arbitrary slice:
--
--   1 stranded_request   non-terminal status + assignee + no job row. The state
--                        that is invisible from every surface at once — no
--                        estimates, no job panel, no error, no nudge. Five of
--                        the six requests that ever got an accepted bid sat in
--                        it. Fixed at the source on 2026-11-05; this is the
--                        detector that proves it stays fixed.
--   2 stale_estimates    pending request, live pending bids, newest bid older
--                        than the 30-day nudge ceiling. Nothing automated will
--                        ever chase these — the ceiling exists because a cron
--                        is the wrong sender for "your estimates are waiting"
--                        on a three-month-old request, but that leaves a real
--                        warm lead with nobody chasing it. That is the gap, and
--                        it is where all nine of the first run's findings sat.
--   3 unreachable_trade  no bids and trade_reach() = 0. A label mapped to a
--                        specialty nobody holds reaches NOBODY, with no error
--                        and no empty state.
--   4 no_bids_exhausted  no bids, reach > 0, re-fires spent, older than 7 days.
--
-- The last three also require assigned_contractor_id is null, so a stranded
-- request can never double-propose under two kinds.
--
-- A 365-day floor keeps the list from accumulating forever: a two-year-old
-- request is not a lead.
--
-- The payload carries the client's name, email and phone so the handoff is
-- actionable without a second lookup. That is runtime data read from a private
-- DB — it must never be pasted into this file, which lives in a PUBLIC repo.
-- ----------------------------------------------------------------------------
create or replace function public.agent_lead_response_run(p_trigger text default 'schedule')
returns jsonb
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_run    uuid;
  v_found  int := 0;
  v_made   int := 0;
  v_open   int := 0;
  v_capped text := null;
  v_res    jsonb;
  f        record;
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
                 'detail',  format('The newest estimate is %s days old, past the 30-day ceiling on the automatic nudge, so no email will ever go out for this one. Quoted %s. Phone or email the client and send them their pick link.',
                                   (extract(epoch from (now() - b.newest_bid)) / 86400)::int,
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
           and b.newest_bid < now() - interval '30 days'

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
           then 'Nothing to chase - every request is either picked, recently quoted, or still fresh.'
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
$$;

revoke all on function public.agent_lead_response_run(text) from public;
revoke all on function public.agent_lead_response_run(text) from anon;
revoke all on function public.agent_lead_response_run(text) from authenticated;
grant execute on function public.agent_lead_response_run(text) to service_role;

-- ----------------------------------------------------------------------------
-- 7. Arm it. Applied live, recorded here.
-- ----------------------------------------------------------------------------
-- select cron.schedule('agent-lead-response', '0 14 * * *',
--   $x$select public.agent_lead_response_run('schedule');$x$);
--
-- 14:00 UTC = 07:00 Calgary, deliberately an hour BEFORE the 15:00 health check
-- so the owner's morning queue is already current when the health email lands.
-- Nothing else was scheduled at 14:00.
--
-- update public.agent_registry
--    set enabled = true, expected_every = interval '1 day'
--  where agent = 'lead-response';
--
-- expected_every drives `stale` in admin_agent_overview, which allows a 1.5x
-- grace margin — so a daily cron has a 36h window and only goes red after two
-- consecutive misses. enabled = true is the claim "a harness exists and this is
-- expected to run"; it is now true for exactly one of the eight agents.
