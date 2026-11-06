-- 2026-11-05 — Agent cost discipline, declared on the roster and ENFORCED in the
-- one write path.
--
-- The owner's instruction was "ensure that these agents dont burn tokens for no
-- reason. if a cheaper model can be used with similar results then use the cheaper
-- model." The honest way to honour that is NOT a paragraph in a doc: a policy that
-- lives only in prose is a policy nothing applies. So the per-agent model ceiling
-- and the per-agent caps are columns on agent_registry, the caps are checked inside
-- agent_propose_action (the only write path into the approval queue), and the model
-- spend is self-reported per run and compared against the declared budget in the
-- overview the owner actually reads.
--
-- Be precise about what is a GATE and what is only a DETECTOR (full table in
-- docs/agents.md):
--   GATE      max_pending, max_proposals_per_run, roster membership, and the
--             model/budget agreement CHECK.
--   DETECTOR  which model the harness really called. The DB cannot stop a harness
--             reaching for Opus any more than it can stop an edge function posting
--             to an arbitrary URL. What it can do is make the overspend visible.
--
-- The caps protect the INBOX before they protect the invoice. The approval queue is
-- the owner's trusted inbox; a surface that can be flooded is a surface he learns to
-- scroll past, and that single failure undoes the entire approval design. Same
-- reasoning as the health checks.
--
-- MONEY: touches none of the four payout guards. No branch here receives money
-- (nothing increments funded_amount) and none pays out (nothing reads fully_funded).
-- confirm_job_completion(), auto_confirm_stale_jobs(), release-payment's 409 and
-- reconcile-payouts' fully_funded filter are untouched.
--
-- ACL: every function below is replaced with `create or replace`, NEVER drop+create,
-- so the service_role-only grants survive. drop+create resets the ACL to Supabase's
-- default grant to anon and authenticated — that is the 2026-11-04 hole, and it was
-- reached from a migration whose revoke block was correct and had never run.
-- agent_run_finish deliberately gains NO new parameter (model_calls rides the
-- existing p_details jsonb) so there is no second signature for PostgREST to be
-- ambiguous about and no grant block to re-issue.
--
-- Proven with a rolled-back probe, 10/10: off-roster refused; max_pending bites and
-- inserts nothing; a dedupe refresh still succeeds while over the cap; the per-run
-- cap bites and stamps agent_runs.details; agent_run_finish records model_calls and
-- does not erase the capped flag; the breach count fires at 7 calls against a budget
-- of 5 and CLEARS at a budget of 20 (self-clearing); model='none' with a call budget
-- is refused by the CHECK; anon and authenticated hold no execute on any of the
-- three; admin_agent_overview still returns {} from an unauthenticated session.
--
-- APPLIED LIVE 2026-11-05 via Supabase MCP. Committed here for version control only;
-- installers do not apply DB changes.

alter table public.agent_registry
  add column if not exists model text not null default 'none',
  add column if not exists max_model_calls_per_run int not null default 0,
  add column if not exists max_proposals_per_run int not null default 5,
  add column if not exists max_pending int not null default 20;

-- model is the CEILING, not the only model an agent may use: an agent declared
-- 'sonnet' still does its triage on haiku and its counting in SQL. 'none' means it
-- makes no model call at all, which is where every agent starts.
alter table public.agent_registry drop constraint if exists agent_registry_model_check;
alter table public.agent_registry add constraint agent_registry_model_check
  check (model in ('none','haiku','sonnet','opus'));

-- The two must agree or the declaration is a lie in one direction or the other:
-- 'none' with a call budget, or a model with no budget to call it.
alter table public.agent_registry drop constraint if exists agent_registry_model_budget_check;
alter table public.agent_registry add constraint agent_registry_model_budget_check
  check ((model = 'none') = (max_model_calls_per_run = 0));

alter table public.agent_registry drop constraint if exists agent_registry_caps_check;
alter table public.agent_registry add constraint agent_registry_caps_check
  check (max_model_calls_per_run >= 0 and max_proposals_per_run > 0 and max_pending > 0);

-- Measured, not declared. Self-reported by the harness through agent_run_finish's
-- existing p_details jsonb.
alter table public.agent_runs
  add column if not exists model_calls int not null default 0;

-- ---------------------------------------------------------------------------
-- Per-agent budgets. Deterministic-first: six of eight need no model at all,
-- because what they do is read rows and compare them. Rationale per agent in
-- docs/agents.md.
-- ---------------------------------------------------------------------------
update public.agent_registry set model='none',   max_model_calls_per_run=0,  max_proposals_per_run=10, max_pending=25 where agent='lead-response';
update public.agent_registry set model='none',   max_model_calls_per_run=0,  max_proposals_per_run=5,  max_pending=15 where agent='ops-watchdog';
update public.agent_registry set model='none',   max_model_calls_per_run=0,  max_proposals_per_run=3,  max_pending=10 where agent='contractor-supply';
update public.agent_registry set model='haiku',  max_model_calls_per_run=5,  max_proposals_per_run=5,  max_pending=10 where agent='outreach';
update public.agent_registry set model='haiku',  max_model_calls_per_run=10, max_proposals_per_run=5,  max_pending=15 where agent='social-bot';
update public.agent_registry set model='sonnet', max_model_calls_per_run=15, max_proposals_per_run=5,  max_pending=20 where agent='customer-care';
update public.agent_registry set model='sonnet', max_model_calls_per_run=10, max_proposals_per_run=3,  max_pending=10 where agent='marketing';
update public.agent_registry set model='sonnet', max_model_calls_per_run=20, max_proposals_per_run=3,  max_pending=5  where agent='dev-test';

-- ---------------------------------------------------------------------------
-- The gate. agent_propose_action is the ONLY write path into agent_actions, which
-- is what makes a cap here a cap rather than a suggestion.
-- ---------------------------------------------------------------------------
create or replace function public.agent_propose_action(
  p_agent text,
  p_kind text,
  p_dedupe_key text default null::text,
  p_payload jsonb default '{}'::jsonb,
  p_conversation_id uuid default null::uuid,
  p_run_id uuid default null::uuid)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public', 'extensions', 'pg_temp'
as $function$
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
  -- A cap REFUSES, it does not raise. A raise would roll back the harness's whole
  -- transaction — including the agent_runs row that is the only evidence the cap
  -- fired. It returns the same keys as the success path so no caller has to learn
  -- a new shape, with status='capped', capped=true and a reason added.
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

-- Record measured model spend. No new parameter: it rides the existing p_details
-- jsonb, so there is no second signature for PostgREST to be ambiguous about and no
-- grant block to re-run.
create or replace function public.agent_run_finish(
  p_run_id uuid,
  p_status text,
  p_summary text default null::text,
  p_details jsonb default '{}'::jsonb,
  p_error text default null::text)
 returns void
 language plpgsql
 security definer
 set search_path to 'public', 'extensions', 'pg_temp'
as $function$
begin
  update public.agent_runs
     set status      = coalesce(p_status,'ok'),
         finished_at = now(),
         summary     = p_summary,
         -- Merge, never overwrite: agent_propose_action writes a `capped` key in
         -- here while the run is open, and the finish call must not erase it.
         details     = coalesce(details,'{}'::jsonb) || coalesce(p_details,'{}'::jsonb),
         error       = p_error,
         -- greatest(), so a second finish call cannot lower a recorded spend.
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

-- ---------------------------------------------------------------------------
-- The detector. Surfaces the declared budget next to the measured spend, and
-- counts the runs that exceeded it. SELF-CLEARING: budget_breach_7d can only be
-- non-zero because a real run really overspent in the last 7 days, so it drops
-- back to zero on its own once the agent is fixed or the allowance is raised. A
-- permanently-red number is one the owner learns to scroll past, and that undoes
-- every layer at once.
-- ---------------------------------------------------------------------------
create or replace function public.admin_agent_overview()
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public', 'extensions', 'pg_temp'
as $function$
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
