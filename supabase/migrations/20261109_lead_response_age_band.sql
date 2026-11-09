-- ============================================================================
-- 20261109_lead_response_age_band.sql
-- APPLIED LIVE 2026-11-09 via Supabase MCP. Committed for version control only.
--
-- agent_lead_response_run: give the lead sweep an AGE BAND instead of a floor.
--
-- WHAT WAS WRONG, AND IT WAS NOT A MISSING CUTOFF. The stale_estimates finding
-- fired on `newest_bid < now() - interval '30 days'` — a FLOOR with no ceiling,
-- chosen so it would only ever surface leads the automatic email nudge can no
-- longer reach (run_reminders step 4 covers 48 hours to 30 days). That is sound
-- as a non-duplication rule and useless as a work queue: it means every single
-- thing the agent can propose is, by construction, over a month cold. The nine
-- proposals in the queue on 2026-11-09 were 37, 56, 59, 63, 69, 90 and 95 days
-- old, and the agent's own detail text said so out loud — "past the 30-day
-- ceiling on the automatic nudge, so no email will ever go out for this one".
-- The owner read the queue, correctly concluded the suggestions were useless,
-- and asked for leads older than 2-3 weeks to be disregarded.
--
-- GENERALISE THAT: A RULE THAT KEEPS AN AGENT FROM DUPLICATING ANOTHER SYSTEM
-- IS NOT THE SAME AS A RULE FOR WHAT IS WORTH DOING. This floor was written to
-- answer the first question and was then left to answer the second one, which
-- it cannot. The symptom reaches the owner as "the agent is useless", and the
-- cause is one predicate doing a job it was never chosen for.
--
-- THE FLOOR AND THE CEILING CANNOT BOTH BE RIGHT AT THOSE VALUES. A 21-day
-- ceiling on top of a 30-day floor is an empty set, so this is not "add a
-- cutoff" — the floor has to come down to where a human call is still worth
-- making. It moves to 3 days: the automatic email goes out at 48 hours, and
-- this gives it a day to work before asking a person to spend time on the same
-- lead. The band is now 3 to 21 days.
--
-- OVERLAPPING THE AUTOMATIC NUDGE IS DELIBERATE, NOT AN OVERSIGHT. The nudge
-- dedupes on `reminder_log(user_id, kind)` with no request or job scoping, so
-- it fires at most ONCE PER PERSON EVER — a client nudged in August gets no
-- email at all for a request posted in November. So "the system already
-- emailed them" is not a reason to stay quiet, and one email that did not work
-- is precisely when a phone call earns its keep.
--
-- WHICH FINDINGS GET THE CEILING: the three that are about chasing one
-- client's request (stale_estimates, unreachable_trade, no_bids_exhausted).
-- `stranded_request` deliberately does NOT get one. It is a DATA DEFECT, not a
-- lead: the request claims an assigned contractor with no job row, so that
-- client sees no estimates, no job panel and no error, and no reminder fires
-- either. Age does not make that acceptable, and a cutoff there would hide the
-- invisible-state class this finding exists to catch. Read the two apart by
-- what the owner does with them — a lead is chased or dropped, a defect is
-- repaired.
--
-- FUTURE RUNS ONLY. The nine already in the queue are NOT expired here, by the
-- owner's explicit choice: they stop matching the findings query, so nothing
-- refreshes them and they lapse on their own expires_at (2026-11-13), which
-- agent_expire_stale_actions() collects from agent_run_start. Mass-expiring a
-- queue the owner is still looking at would delete the evidence of why this
-- change was needed.
--
-- PROVED BY A ROLLED-BACK PROBE, not by reading: old predicate 9 matches, new
-- band 0 matches, 9 pending proposals still in the queue and none past
-- expires_at. Zero today is the CORRECT answer and is self-clearing — the
-- youngest unchased quote is 2 days old and enters the band tomorrow.
--
-- CREATE OR REPLACE, so the ACL is preserved rather than reset to the Supabase
-- defaults; verified after applying with has_function_privilege (anon false,
-- service_role true), per the "a grant in a migration file is not evidence it
-- ran" rule.
--
-- NO PII IN THIS FILE. The payloads this function builds carry client name,
-- email and phone at runtime; nothing from a row is quoted here.
-- ============================================================================

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
