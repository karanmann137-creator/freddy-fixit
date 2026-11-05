-- 20261104_agent_team_queue_and_registry.sql
--
-- APPLIED LIVE VIA SUPABASE MCP ON 2026-11-04. This file is version control only —
-- installers do not apply DB changes (see CLAUDE.md, "How work ships").
--
-- WHAT THIS IS
-- ------------
-- A human-approval queue plus run telemetry for a team of background agents
-- (marketing, outreach, customer care, dev/test, lead response, contractor supply,
-- ops watchdog, social). Every agent WRITES A PROPOSAL AND STOPS. Nothing an agent
-- produces reaches a client, a contractor, a social account or `main` until the
-- owner approves it in the admin dashboard.
--
-- WHY IT IS A RENAME AND NOT A NEW TABLE
-- --------------------------------------
-- `social_actions` was already exactly this queue — kind / payload / claim_token /
-- status / approved_by / approved_at / expires_at / result, with working propose,
-- list and review RPCs and correct grants. It sat at 0 rows with no UI, and
-- `docs/open-queued.md` flagged it as "finish it or delete it whole".
--
-- Building a second queue beside it would have given the platform TWO answers to
-- "what is waiting on the owner" — the failure shape CLAUDE.md names under "one
-- predicate, shared by every reader". So the table was renamed and widened in place.
--
-- THE DEPLOYED EDGE FUNCTION WAS NOT REDEPLOYED, ON PURPOSE.
-- `supabase/functions/social-bot-brain/index.ts` reaches the queue only through
-- `social_propose_action` (4 call sites, no direct table access anywhere). That
-- function is kept as a thin wrapper with a BYTE-IDENTICAL signature, so the bot
-- keeps working untouched. CLAUDE.md warns the repo copy of an edge function can
-- lag the deployed one; not needing a redeploy sidesteps that entirely.
--
-- ============================================================================
-- 1. Generalize the queue
-- ============================================================================

alter table if exists public.social_actions rename to agent_actions;

alter index if exists social_actions_pkey        rename to agent_actions_pkey;
alter index if exists social_actions_token_idx   rename to agent_actions_token_idx;
alter index if exists social_actions_status_idx  rename to agent_actions_status_idx;
alter index if exists social_actions_one_live_idx rename to agent_actions_one_live_convo_idx;

alter table public.agent_actions
  rename constraint social_actions_approved_by_fkey      to agent_actions_approved_by_fkey;
alter table public.agent_actions
  rename constraint social_actions_conversation_id_fkey  to agent_actions_conversation_id_fkey;

-- `agent` defaults to 'social-bot' so every pre-existing row (and any in-flight
-- write from the un-redeployed edge function) lands correctly without a backfill.
alter table public.agent_actions
  add column if not exists agent      text not null default 'social-bot',
  add column if not exists dedupe_key text,
  add column if not exists run_id     uuid;

create index if not exists agent_actions_agent_idx
  on public.agent_actions (agent, status, created_at desc);
create index if not exists agent_actions_run_idx
  on public.agent_actions (run_id);

-- Dedupe is keyed on (agent, dedupe_key) rather than (agent, kind) because a
-- partial unique index treats NULLs as DISTINCT — an agent with nothing to dedupe
-- on must be able to file many proposals of the same kind. The old social index on
-- (conversation_id, kind) is deliberately KEPT: for social rows dedupe_key is
-- derived as 'convo_id:kind', so the two indexes assert the same thing instead of
-- competing, and for every other agent conversation_id is NULL and therefore
-- distinct under the unique index.
create unique index if not exists agent_actions_one_live_key_idx
  on public.agent_actions (agent, dedupe_key)
  where dedupe_key is not null
    and status in ('pending','approved','sent');

-- ----------------------------------------------------------------------------
-- The two inherited CHECK constraints, and why both had to go
-- ----------------------------------------------------------------------------
-- (a) STATUS. Two CHECKs on one column INTERSECT. The table already carried
--     `social_actions_status_check`, whose list includes 'claimed'; a second
--     constraint added here that omitted 'claimed' silently made that value
--     UNREACHABLE. 'claimed' is how a harness marks an approved action it has
--     picked up — that is what `claim_token` exists for. Nothing would have errored
--     at deploy time; the harness would simply have failed the first time it ever
--     claimed work. Collapsed to ONE authoritative constraint.
--
-- (b) KIND. The inherited whitelist allowed only ('post_job','invite_contractor',
--     'handoff'), so every non-social agent's first proposal was guaranteed to be
--     rejected at runtime. Replaced with a slug format check.
--
--     This is a deliberate LOOSENING. It is justified because the only writer is a
--     service_role SECURITY DEFINER RPC, so the whitelist bought no security — only
--     guaranteed breakage for new agents. CLAUDE.md's "make guards stricter, never
--     looser" governs the four payout guards and the contract gate; this touches
--     neither. No money flows through this table.
alter table public.agent_actions drop constraint if exists social_actions_status_check;
alter table public.agent_actions drop constraint if exists agent_actions_status_chk;
alter table public.agent_actions
  add constraint agent_actions_status_chk
  check (status in ('pending','approved','claimed','rejected','sent','failed','expired'));

alter table public.agent_actions drop constraint if exists social_actions_kind_check;
alter table public.agent_actions drop constraint if exists agent_actions_kind_chk;
alter table public.agent_actions
  add constraint agent_actions_kind_chk check (kind ~ '^[a-z][a-z0-9_]{1,63}$');

drop policy if exists social_actions_admin on public.agent_actions;
create policy agent_actions_admin on public.agent_actions
  for select using ((select public.is_admin()));

-- ============================================================================
-- 2. Run telemetry — so a SILENT agent is distinguishable from a BROKEN one
-- ============================================================================
-- The queue alone cannot tell "nothing to propose" from "never ran". Every outage
-- on this platform has been an ABSENCE, and an agent that quietly stopped is
-- exactly that shape: no row, no error, no alert.

create table if not exists public.agent_runs (
  id          uuid primary key default gen_random_uuid(),
  agent       text not null,
  trigger     text not null default 'schedule'
              check (trigger in ('schedule','event','manual')),
  status      text not null default 'running'
              check (status in ('running','ok','warn','error')),
  started_at  timestamptz not null default now(),
  finished_at timestamptz,
  summary     text,
  details     jsonb not null default '{}'::jsonb,
  proposals_created integer not null default 0,
  error       text
);

create index if not exists agent_runs_agent_idx   on public.agent_runs (agent, started_at desc);
create index if not exists agent_runs_status_idx  on public.agent_runs (status, started_at desc);
create index if not exists agent_runs_running_idx on public.agent_runs (started_at desc)
  where status = 'running';

alter table public.agent_runs enable row level security;
create policy agent_runs_admin on public.agent_runs
  for select using ((select public.is_admin()));

alter table public.agent_actions
  add constraint agent_actions_run_id_fkey
  foreign key (run_id) references public.agent_runs(id) on delete set null;

-- ============================================================================
-- 3. The registry — so an agent that has NEVER run is still visible
-- ============================================================================
-- Without this, the dashboard could only list agents it had seen a run from, which
-- means a never-deployed or silently-removed agent shows as nothing at all. You
-- cannot query an absence; you can only compare against a declared list.

create table if not exists public.agent_registry (
  agent          text primary key,
  label          text not null,
  purpose        text not null default '',
  enabled        boolean not null default true,
  autonomy       text not null default 'propose'
                 check (autonomy in ('propose','notify','auto')),
  expected_every interval,
  created_at     timestamptz not null default now()
);

alter table public.agent_registry enable row level security;
create policy agent_registry_admin on public.agent_registry
  for select using ((select public.is_admin()));

-- EVERY agent seeds `enabled = false`, including the ones with a declared cadence.
-- `enabled` means "a harness exists and this agent is expected to run"; no harness
-- exists yet for any of them. Seeding four of these enabled made the overview red
-- on day one with nothing the owner could do about it, and a permanently-red
-- surface teaches him to ignore the whole tab. Flipping `enabled` to true is now
-- step one of wiring each harness, which keeps `stale` honest: it can only fire for
-- an agent somebody claimed was running.
insert into public.agent_registry (agent, label, purpose, enabled, autonomy, expected_every) values
  ('lead-response',     'Lead response',      'Finds requests with no bids, checks trade_reach, drafts the re-fire.', false, 'propose', interval '1 day'),
  ('marketing',         'Marketing',          'Blog drafts, SEO gaps, meta descriptions.',                            false, 'propose', interval '7 days'),
  ('customer-care',     'Customer relations', 'Reads chat and notifications, drafts replies. Never sends.',           false, 'propose', interval '1 day'),
  ('outreach',          'Outreach',           'Builds contractor recruiting lists. CASL review pending — list only.', false, 'propose', null),
  ('contractor-supply', 'Contractor supply',  'Trades with demand and trade_reach = 0.',                              false, 'notify',  interval '7 days'),
  ('dev-test',          'Dev / test',         'Branches, opens a PR, runs the suite. Never pushes to main.',           false, 'propose', null),
  ('ops-watchdog',      'Ops watchdog',       'The existing nightly sweep across all four monitoring layers.',        false, 'notify',  interval '1 day'),
  ('social-bot',        'Social bot',         'Replies to Reddit/social mentions. Drafts only.',                      false, 'propose', null)
on conflict (agent) do nothing;

-- ============================================================================
-- 4. RPCs
-- ============================================================================
-- Guard placement follows CLAUDE.md exactly: admin READS carry plain `is_admin()`,
-- because the second factor rides our own Resend mailer and a mailer outage must
-- never blind the admin dashboard. The one irreversible WRITE carries
-- `admin_guard()` (is_admin AND mfa_ok) with `log_admin_action` IMMEDIATELY after
-- it — an RPC is one transaction, so that placement buys "logged iff committed"
-- for free.
--
-- Every body pins `search_path = public, extensions, pg_temp`. Bare `public` breaks
-- pgcrypto, which lives in `extensions`, and that exact bug killed every signup on
-- this platform for a month.

create or replace function public.agent_run_start(p_agent text, p_trigger text default 'schedule')
returns uuid
language plpgsql security definer set search_path = public, extensions, pg_temp
as $fn$
declare v_id uuid;
begin
  if p_agent is null or btrim(p_agent) = '' then
    raise exception 'agent_run_start needs an agent name';
  end if;
  insert into public.agent_runs (agent, trigger)
  values (p_agent, coalesce(p_trigger,'schedule'))
  returning id into v_id;
  return v_id;
end;
$fn$;

create or replace function public.agent_run_finish(
  p_run_id uuid, p_status text, p_summary text default null,
  p_details jsonb default '{}'::jsonb, p_error text default null
) returns void
language plpgsql security definer set search_path = public, extensions, pg_temp
as $fn$
begin
  update public.agent_runs
     set status      = coalesce(p_status,'ok'),
         finished_at = now(),
         summary     = p_summary,
         details     = coalesce(p_details,'{}'::jsonb),
         error       = p_error,
         proposals_created = (
           select count(*) from public.agent_actions a where a.run_id = p_run_id
         )
   where id = p_run_id;
end;
$fn$;

create or replace function public.agent_propose_action(
  p_agent text, p_kind text, p_dedupe_key text default null,
  p_payload jsonb default '{}'::jsonb, p_conversation_id uuid default null,
  p_run_id uuid default null
) returns jsonb
language plpgsql security definer set search_path = public, extensions, pg_temp
as $fn$
declare
  v public.agent_actions;
  v_key text;
begin
  if p_agent is null or p_kind is null then
    raise exception 'agent_propose_action needs an agent and a kind';
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
$fn$;

-- READ. Plain is_admin(), returns '[]' rather than raising so the dashboard can
-- render an empty state instead of an error.
create or replace function public.admin_list_agent_actions(
  p_limit integer default 50, p_status text default null
) returns jsonb
language plpgsql security definer set search_path = public, extensions, pg_temp
as $fn$
declare v jsonb;
begin
  if not public.is_admin() then return '[]'::jsonb; end if;

  select coalesce(jsonb_agg(row_to_json(t)), '[]'::jsonb) into v from (
    select a.id, a.agent, r.label as agent_label, a.kind, a.status, a.payload,
           a.dedupe_key, a.claim_token, a.created_at, a.expires_at,
           public.ff_local_ts(a.created_at) as created_local,
           public.ff_local_ts(a.expires_at) as expires_local,
           (a.expires_at <= now()) as is_expired,
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
$fn$;

-- READ. Every timestamp goes through ff_local_ts — bare to_char() on a timestamptz
-- renders Calgary times 6-7h ahead, because the session TimeZone is UTC.
create or replace function public.admin_agent_overview()
returns jsonb
language plpgsql security definer set search_path = public, extensions, pg_temp
as $fn$
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
               lr.started_at                       as last_run_at,
               public.ff_local_ts(lr.started_at)   as last_run_local,
               lr.status                           as last_run_status,
               lr.summary                          as last_run_summary,
               lr.error                            as last_run_error,
               (select count(*) from public.agent_actions a
                 where a.agent = reg.agent and a.status = 'pending')      as pending,
               (select count(*) from public.agent_runs r2
                 where r2.agent = reg.agent
                   and r2.started_at > now() - interval '7 days')         as runs_7d,
               (select count(*) from public.agent_runs r3
                 where r3.agent = reg.agent and r3.status = 'error'
                   and r3.started_at > now() - interval '7 days')         as errors_7d,
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
            select r.started_at, r.status, r.summary, r.error
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
$fn$;

-- WRITE — the approval gate. Irreversible from the agent's point of view: approving
-- is what releases the claim_token a harness acts on. Carries admin_guard() (the
-- second factor) and logs immediately after it.
--
-- NOTE: admin_guard() needs auth.uid(), so this cannot be called from an MCP SQL
-- session or a Cowork artifact. Approvals have to live in the real signed-in admin
-- dashboard with the VerifyCodeModal flow. That is a design constraint, not a bug.
create or replace function public.admin_review_agent_action(
  p_action_id uuid, p_approve boolean, p_payload jsonb default null
) returns jsonb
language plpgsql security definer set search_path = public, extensions, pg_temp
as $fn$
declare v public.agent_actions;
begin
  perform public.admin_guard();
  perform public.log_admin_action(
    'admin_review_agent_action', 'agent_actions', p_action_id::text,
    jsonb_build_object('approve', p_approve, 'edited', p_payload is not null));

  update public.agent_actions
     set status      = case when p_approve then 'approved' else 'rejected' end,
         payload     = coalesce(p_payload, payload),
         approved_by = auth.uid(),
         approved_at = now()
   where id = p_action_id and status = 'pending'
  returning * into v;

  if not found then
    raise exception 'that action is not pending any more';
  end if;

  return jsonb_build_object('id', v.id, 'agent', v.agent, 'status', v.status,
                            'claim_token', v.claim_token);
end;
$fn$;

-- ============================================================================
-- 5. Back-compat wrappers — the deployed social-bot-brain calls these
-- ============================================================================
-- Signatures and parameter DEFAULTS are reproduced EXACTLY. A CREATE OR REPLACE
-- cannot remove a parameter default (42P13), and DROPping these while the deployed
-- edge function still calls them would break the bot mid-flight with no redeploy
-- to catch it.

create or replace function public.social_propose_action(
  p_conversation_id uuid, p_kind text, p_payload jsonb default '{}'::jsonb
) returns jsonb
language plpgsql security definer set search_path = public, extensions, pg_temp
as $fn$
begin
  return public.agent_propose_action(
    p_agent           => 'social-bot',
    p_kind            => p_kind,
    p_dedupe_key      => null,
    p_payload         => p_payload,
    p_conversation_id => p_conversation_id);
end;
$fn$;

create or replace function public.admin_list_social_actions(p_limit integer default 50)
returns jsonb
language plpgsql security definer set search_path = public, extensions, pg_temp
as $fn$
begin
  return public.admin_list_agent_actions(p_limit, null);
end;
$fn$;

create or replace function public.admin_review_social_action(
  p_action_id uuid, p_approve boolean, p_payload jsonb default null
) returns jsonb
language plpgsql security definer set search_path = public, extensions, pg_temp
as $fn$
begin
  return public.admin_review_agent_action(p_action_id, p_approve, p_payload);
end;
$fn$;

-- ============================================================================
-- 6. Grants
-- ============================================================================
-- `revoke from anon` alone is a NO-OP: the default function grant is to PUBLIC, so
-- `revoke ... from public` is required too.
--
-- ⚠️ 2026-11-04, FOUND AFTER THE FACT: this block was correct in the file and had NOT
-- run against the live DB. All six functions sat at Supabase's DEFAULT privileges
-- (`{postgres=X, anon=X, authenticated=X, service_role=X}`), so the anon key -- which
-- ships publicly in the JS bundle -- could call `agent_run_start`, `agent_propose_action`
-- and `agent_run_finish`. Those three are SECURITY DEFINER with NO caller guard, by
-- design, because the only intended caller is a service_role harness. The practical
-- effect was that anyone could insert pending proposals into the owner's approval queue
-- and rewrite any run row by uuid.
--
-- No money and no PII, but the queue IS the owner's trusted inbox, and a surface that
-- can be flooded with noise is one he learns to scroll past -- the exact failure the
-- registry/self-clearing design exists to prevent. It also silently invalidated the
-- justification recorded in section 1 for replacing the `kind` whitelist with a format
-- check: "the only writer is a service_role RPC, so the whitelist buys no security."
-- That sentence was load-bearing and it was not true. Now it is.
--
-- TWO LESSONS, both the shape of failures already in CLAUDE.md:
--   * SQL committed in a migration file is NOT evidence that it ran. DB changes here are
--     applied live via MCP and the file is version control only, so the file is a claim
--     about the database, exactly like the repo copy of an edge function is a claim about
--     the deployed one. Verify grants by reading `pg_proc.proacl`, never by reading this.
--   * A `drop function` + `create` (as opposed to `create or replace`) RESETS the ACL to
--     the schema defaults. Any recreate -- the 42702 fix on `admin_agent_overview` was
--     one -- silently re-opens every revoke above. Re-run this block after any recreate.
--
-- The correct executability test is `proacl is null OR (proacl)[1]::text like '=X/%'`;
-- `proacl::text like '%=X/%'` is WRONG and reports a false FAIL on every one of these,
-- because they all legitimately grant to `authenticated`. Easier and harder to misread:
-- `has_function_privilege('anon', oid, 'execute')`.

-- Writers: service_role ONLY. `authenticated` is revoked too -- a signed-in client or
-- contractor has no business proposing agent work either.
revoke all on function public.agent_run_start(text, text)                           from public, anon, authenticated;
revoke all on function public.agent_run_finish(uuid, text, text, jsonb, text)       from public, anon, authenticated;
revoke all on function public.agent_propose_action(text, text, text, jsonb, uuid, uuid) from public, anon, authenticated;
-- The back-compat wrapper must follow its target, or the revoke above is cosmetic: the
-- wrapper would stay the anon-reachable door to the same insert. The deployed
-- social-bot-brain holds a service-role client, so this does not break it.
revoke all on function public.social_propose_action(uuid, text, jsonb)              from public, anon, authenticated;

-- Admin surfaces: guarded AND ungranted, matching the older admin_review_social_action.
-- anon can never pass is_admin()/admin_guard(), so the only legitimate caller is the
-- signed-in admin (`authenticated`) -- revoking anon removes no reachable caller.
revoke all on function public.admin_list_agent_actions(integer, text)               from public, anon;
revoke all on function public.admin_agent_overview()                                from public, anon;
revoke all on function public.admin_review_agent_action(uuid, boolean, jsonb)       from public, anon;

grant execute on function public.agent_run_start(text, text)                           to service_role;
grant execute on function public.agent_run_finish(uuid, text, text, jsonb, text)       to service_role;
grant execute on function public.agent_propose_action(text, text, text, jsonb, uuid, uuid) to service_role;
grant execute on function public.social_propose_action(uuid, text, jsonb)              to service_role;
grant execute on function public.admin_list_agent_actions(integer, text)               to authenticated, service_role;
grant execute on function public.admin_agent_overview()                                to authenticated, service_role;
grant execute on function public.admin_review_agent_action(uuid, boolean, jsonb)       to authenticated, service_role;
