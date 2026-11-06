-- 2026-11-05 — draft-on-approval for the lead-response agent.
--
-- APPLIED LIVE VIA MCP ON 2026-11-05. This file is version control only; it is
-- not run by any installer. Privileges were verified afterwards by reading
-- has_function_privilege(), never by reading this file — see the CLAUDE.md
-- Postgres rule: a grant block committed in a migration is NOT evidence that it
-- ran, and `drop function` + `create` resets the ACL to Supabase's defaults.
-- Both functions below are `create or replace` precisely so the ACL survives.
--
-- WHY A BUTTON AND NOT THE CRON.
-- Detection costs nothing: agent_lead_response_run() is a plain Postgres
-- function with no network client, so it cannot spend a token even by accident.
-- Writing the actual message to the client is the only part that needs a model.
-- Putting that behind a click means spend is proportional to the leads the owner
-- decided to chase, and a quiet day costs zero. The edge function
-- (supabase/functions/agent-draft-lead) is the only caller of these two RPCs.
--
-- WHY THE REGISTRY ROW HAD TO MOVE IN THE SAME STATEMENT.
-- agent_registry carries a CHECK that ((model = 'none') = (max_model_calls_per_run = 0)),
-- and admin_agent_overview compares measured model_calls against the declared
-- budget. Leaving lead-response at model='none'/0 would have made every single
-- draft read as a budget breach — a permanently-red number, which is the one
-- thing the monitoring rules forbid, because a gate that cries wolf is a gate
-- someone learns to skip. `model` is a CEILING, not a ban: this raises one
-- agent's row, it does not move the policy.

-- ---------------------------------------------------------------------------
-- 1. Read the lead the owner clicked, with the refusals in plain English.
--    Returns {ok:false, reason} rather than raising, so the edge function can
--    turn each refusal into an HTTP status and show the reason verbatim.
-- ---------------------------------------------------------------------------
create or replace function public.agent_lead_draft_context(p_action_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v record;
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

  -- rejected/expired-and-cleared leads are terminal: there is nobody to write to.
  if v.status not in ('pending', 'approved', 'sent') then
    return jsonb_build_object('ok', false, 'reason', 'that lead is ' || v.status || ' -- nothing to draft');
  end if;

  if coalesce(v.payload->>'client', '') = '' then
    return jsonb_build_object('ok', false, 'reason', 'that lead has no client name on it');
  end if;

  return jsonb_build_object('ok', true, 'kind', v.kind, 'payload', v.payload);
end;
$$;

revoke all on function public.agent_lead_draft_context(uuid) from public, anon, authenticated;
grant execute on function public.agent_lead_draft_context(uuid) to service_role;

-- ---------------------------------------------------------------------------
-- 2. Attach the draft to the lead. Merged into payload rather than stored in a
--    new column, so the existing admin_list_agent_actions read already carries
--    it and no RPC needed a DROP + CREATE (which would have reset its grants).
--    The status filter is repeated here on purpose: context and save are two
--    round trips, and the lead can be rejected in between.
-- ---------------------------------------------------------------------------
create or replace function public.agent_lead_draft_save(p_action_id uuid, p_draft jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_payload jsonb;
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
$$;

revoke all on function public.agent_lead_draft_save(uuid, jsonb) from public, anon, authenticated;
grant execute on function public.agent_lead_draft_save(uuid, jsonb) to service_role;

-- ---------------------------------------------------------------------------
-- 3. Raise this one agent's ceiling. One Haiku call per draft.
-- ---------------------------------------------------------------------------
update public.agent_registry
   set model = 'haiku',
       max_model_calls_per_run = 1
 where agent = 'lead-response';
