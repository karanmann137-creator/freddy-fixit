-- 2026-11-03 · Stale jobs come off the board; a job can be reposted as new.
--
-- NOT APPLIED BY THE INSTALLER. Applied live via Supabase MCP on 2026-11-03 and
-- committed for version control only.
--
-- WHY. Owner's instruction: "old jobs dont matter anymore, any job older than
-- 2 weeks should be removed from the board but we should store the raw data.
-- the exception is if the job is being discussed and the users are still
-- figuring out details. if a user decides to go with a different contractor the
-- job should be reposted as new" + "add option to repost job if client and
-- contractor have not reached an agreement after 7 days (after picking pro)".
--
-- THE CENTRAL IDEA: there are now two clocks on a request. `created_at` is the
-- raw post date and is NEVER overwritten. `coalesce(reposted_at, created_at)`
-- is the *board clock*, and every age reader uses it, so a repost restarts the
-- 14-day window without rewriting history.

-- ── 1. The board clock ───────────────────────────────────────────────────────
alter table public.client_requests
  add column if not exists reposted_at  timestamptz,
  add column if not exists repost_count int not null default 0;

comment on column public.client_requests.reposted_at is
  'When this request was last put back on the board as new. The board clock is coalesce(reposted_at, created_at) — created_at is never overwritten, so the raw post date survives every repost.';

create index if not exists client_requests_board_age_idx
  on public.client_requests (coalesce(reposted_at, created_at) desc)
  where status = 'pending';

-- ── 2. bids.declined_by_client_at ────────────────────────────────────────────
-- 'declined' already means two different things. `_accept_bid_internal` declines
-- every losing bid the moment one is accepted — that is "not chosen", not
-- "rejected" — which is why `decline_price_reopen` resurrects all of them to
-- 'pending' when it re-opens a job. A client who deliberately passed on a bid
-- must NOT have it handed back by that same resurrection. This stamp is the
-- only way to tell the two apart after the fact.
alter table public.bids add column if not exists declined_by_client_at timestamptz;

comment on column public.bids.declined_by_client_at is
  'Set only by decline_bid(): the client explicitly passed on this bid. A bid carrying this stamp is never resurrected to pending by a repost. status=''declined'' with a NULL stamp just means "another pro was picked".';

-- ── 3. list_open_jobs() — the 14-day cutoff ──────────────────────────────────
-- Three changes to a function that is otherwise unchanged: the SELECT list and
-- the final ORDER BY key read the board clock, and the age clause below is new.
-- Same signature and return type, so CREATE OR REPLACE is safe and the grants
-- survive. The full body is live; `pg_get_functiondef` is the truth.
--
-- The age clause, and the two revisions it went through on the day:
--
--   and (
--     coalesce(r.reposted_at, r.created_at) > now() - interval '14 days'
--     or exists (select 1 from bids b2
--                 where b2.request_id = r.id
--                   and b2.status <> 'declined'
--                   and b2.created_at > now() - interval '7 days')
--     or exists (select 1 from messages mg
--                 where mg.request_id = r.id
--                   and mg.blocked is not true
--                   and mg.created_at > now() - interval '7 days')
--   )
--
-- v1 of the bid exception was `b2.status <> 'declined'` with no recency test,
-- and a probe showed it made the whole cutoff a no-op: 6 of the 7 pending
-- requests were older than 14 days (up to 95 days) and EVERY one of them was
-- rescued by a bid 23-89 days old with zero chat. A bid nobody has touched in
-- two months is not a live negotiation. `bids` has no `updated_at`, so
-- `created_at` is the only recency signal available.
--
-- v2 then added an unconditional escape for `status = 'accepted'`, on the
-- theory that an accepted bid means a live handoff. It was removed immediately:
-- `_accept_bid_internal` sets `client_requests.status = 'matched'` in the same
-- transaction it marks the bid accepted, and `decline_price_reopen` — the only
-- route back to 'pending' — explicitly declines the offending bid and resets
-- the rest to 'pending'. So a request still 'pending' CANNOT legitimately hold
-- an accepted bid, and the only row the escape rescued was a 94-day-old orphan
-- (420a4f6c) with an accepted bid, no assigned_contractor_id and no jobs row.
-- Rescuing broken state forever is not the same thing as not hiding live work.
--
-- Verified by rolled-back probe: of 7 pending requests, the one live job
-- (599faf53, 0.1 days) stays on the board and all 6 stale ones (28.9-95.8 days)
-- come off. Nothing is deleted; `client_requests` is untouched by this.

-- ── 4. refire_stale_requests() — the last bare-created_at age reader ─────────
-- A reposted request would otherwise never qualify for its two automatic
-- re-fires again: created_at stays at the original post date, so the staggered
-- 24h/48h window is already long expired the moment the repost happens.
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

-- ── 5. _repost_request_internal — the ONE writer of the board clock ──────────
-- Both repost paths go through here, so the 14-day cutoff and the automatic
-- re-fire budget can never disagree about how old a job is.
--
-- The re-fire throttle lives with the writer rather than being re-decided by
-- each caller, and it exists for a concrete reason: `refire_request` resets
-- `dispatched_to` to the bidder list, so every pro who was paged and did not
-- bid gets paged AGAIN. If a client declines the only bid an hour after
-- posting, that is a duplicate email to the whole trade for no new information.
-- 20 hours is the same window `refire_stale_requests` already uses. The board
-- clock is stamped either way — only the email fan-out is held back.
create or replace function public._repost_request_internal(p_request_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
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

  -- created_at is deliberately NOT touched. refire_count goes back to 0 so the
  -- automatic two-re-fire budget is restored (refire_request just incremented
  -- it, hence the order).
  update public.client_requests
     set reposted_at  = now(),
         repost_count = repost_count + 1,
         refire_count = 0
   where id = p_request_id;

  return jsonb_build_object('reposted', true, 'refired', v_fired, 'reach', coalesce(v_reach, 0));
end $$;

revoke all on function public._repost_request_internal(uuid) from public;
revoke all on function public._repost_request_internal(uuid) from anon;
revoke all on function public._repost_request_internal(uuid) from authenticated;

-- ── 6. job_repost_block — the ONE predicate ──────────────────────────────────
-- NULL means "yes, this can be reposted"; any other value is the plain-English
-- reason, ready to show. The dashboard keys the button on this and nothing
-- else, so a control that cannot succeed is never rendered and the hint can
-- never disagree with the gate.
--
-- Money is checked FIRST, through `job_money_block` — the one answer to "can
-- this job be destroyed?" — because this path cancels a job.
-- PAYOUT GUARDS TOUCHED: none. This never pays out, never releases and never
-- increments funded_amount; it refuses outright on any job holding money.
create or replace function public.job_repost_block(p_job_id uuid)
returns text
language plpgsql
stable security definer
set search_path = public, extensions, pg_temp
as $$
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

  -- 2. State. Only an assigned, not-started job can go back on the board.
  -- Anything else is refused by name rather than by omission, so a status
  -- nobody anticipated fails CLOSED.
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
end $$;

revoke all on function public.job_repost_block(uuid) from public;
revoke all on function public.job_repost_block(uuid) from anon;
grant execute on function public.job_repost_block(uuid) to authenticated;

-- ── 7. decline_bid — "use case a" ────────────────────────────────────────────
-- There was no way for a client to pass on a bid at all: `accept_bid` existed,
-- `decline_bid` did not, so an unwanted bid sat on the request forever holding
-- a slot against dispatch-job's BID_CAP=7.
--
-- PRODUCT DECISION: declining ONE of several bids does NOT repost the job — the
-- other pros are still in the running. The repost fires only when no live bid
-- is left, which is the point at which the job really is back to square one.
create or replace function public.decline_bid(p_bid_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
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
end $$;

revoke all on function public.decline_bid(uuid) from public;
revoke all on function public.decline_bid(uuid) from anon;
grant execute on function public.decline_bid(uuid) to authenticated;

-- ── 8. repost_job — the 7-day "we never got anywhere" escape hatch ──────────
-- Modelled line-for-line on `decline_price_reopen`, which is the proven
-- cancel-but-never-delete pattern: the job row is set to 'cancelled', so the
-- chat, the agreement draft and the history all survive on it. Nothing is
-- deleted anywhere, and no row is ever hard-DELETEd by this path.
--
-- PAYOUT GUARDS TOUCHED: none. It refuses outright on any job holding money
-- (job_money_block, via job_repost_block), never pays out, never releases, and
-- never touches funded_amount or payment_status.
create or replace function public.repost_job(p_job_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
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
end $$;

revoke all on function public.repost_job(uuid) from public;
revoke all on function public.repost_job(uuid) from anon;
grant execute on function public.repost_job(uuid) to authenticated;

-- ── Verification actually run on 2026-11-03 (rolled-back probe) ─────────────
--   decline_bid / repost_job with no JWT      → 'Not authenticated' (both)
--   decline_bid on another client's bid       → 'Bid not found' (no id probing)
--   declining 4 of 5 bids                     → reposted=false each time
--   declining the 5th                         → reposted=true, refired=true, reach=10
--   same bid declined twice                   → no error, reposted=false
--   request state after                       → created_at still Jul 30,
--                                               reposted_at=now, repost_count=1,
--                                               refire_count=0, dispatched_to=5 bidders
--   repost_job on an 83-day-old assigned job  → job='cancelled', request='pending',
--                                               assigned/preferred cleared, the pro's
--                                               bid declined, the other resurrected,
--                                               reach=14
--   second repost of the same job             → blocked ('marked "cancelled"')
--   job_repost_block across all 5 jobs        → money block wins on the released job,
--                                               time block fires on the scheduled one,
--                                               3 stale assigned jobs repostable
--   platform_health_check()                   → 7/7 passing
