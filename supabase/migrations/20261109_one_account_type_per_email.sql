-- 2026-11-09 — One email = one account type.
--
-- APPLIED LIVE VIA SUPABASE MCP. This file is version control only; the
-- installer does not run migrations.
--
-- THE HOLE. The rule "a homeowner account and a contractor account are different
-- accounts" was enforced ONLY in React. profiles' "Users manage own profile"
-- policy is FOR ALL on auth.uid() = id, so any signed-in visitor could PATCH
-- their own `role` straight through PostgREST with the public anon key — and
-- prevent_role_escalation() had no branch for client <-> contractor at all. It
-- blocked newly assigning `admin` and rejected unknown role strings, and
-- permitted the flip unconditionally. An established client could become a
-- contractor while keeping their requests, jobs and reviews, with nothing
-- thrown anywhere. Data was clean when this landed (0 drifted rows), so this is
-- prevention, not cleanup.
--
-- WHY A PREDICATE RETURNING A REASON, not a boolean. Same shape as
-- job_money_block() and contract_ready(): NULL means "allowed", anything else is
-- plain English the frontend can show the person. A boolean forces the UI to
-- invent its own wording, and the two then drift — which is the whole reason
-- those two functions are shaped this way.
--
-- WHY THE TEST IS "HAS THIS ACCOUNT DONE ANYTHING", not "is the role changing".
-- profiles.role is NOT NULL DEFAULT 'client', and handle_new_user() has no role
-- to read off an OAuth identity, so a brand-new Google signup ALREADY holds the
-- role 'client' before the person has said which they are. A flat refusal of any
-- change would therefore break the two things that legitimately set a role:
-- AuthCallback's contractor funnel (?role=contractor) and its "I'm a homeowner /
-- I'm a contractor" chooser. Activity is what separates "fresh account picking
-- its type" from "client trying to become a contractor".
--
-- AND WHY ACTIVITY IS DIRECTION-INDEPENDENT. One definition, asked the same way
-- whichever way the flip goes. Two per-direction branches is the asymmetric-guard
-- shape that has bitten this codebase twice (AuthCallback's role clamp on one of
-- two sibling branches; the four destroy paths where only three reset the
-- request) and it buys nothing here.
--
-- PROVEN BY ROLLED-BACK PROBE, twelve cases:
--   A fresh client -> contractor                  ALLOWED  (funnel + chooser work)
--   B established client -> contractor            REFUSED with the reason
--   C established contractor -> client            REFUSED with the reason
--   D another user changes the admin's role       REFUSED
--   E service_role flips an established client     ALLOWED  (edge-function bypass intact)
--   F a normal user probes someone else's account REFUSED  (no role disclosure)
--   G role written to its own current value        ALLOWED  (ordinary edits unaffected)
--   H phone-only profile edit                      ALLOWED
--   I fresh contractor -> client                   ALLOWED  (symmetric)
--   J admin changes own role                       ALLOWED  (owner repair route)
--   K admin repairs another account                ALLOWED  (support route)
--   L caller with no JWT assigns admin             REFUSED

create or replace function public.role_change_block(p_user_id uuid, p_new_role text)
returns text
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
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
$$;

-- The default function grant is to PUBLIC, so revoking from anon alone is a
-- no-op. Both revokes are required, and must be re-run after any drop+create.
revoke all on function public.role_change_block(uuid, text) from public;
revoke all on function public.role_change_block(uuid, text) from anon;
grant execute on function public.role_change_block(uuid, text) to authenticated;
grant execute on function public.role_change_block(uuid, text) to service_role;

comment on function public.role_change_block(uuid, text) is
  'NULL if this account may become p_new_role, else the plain-English reason it may not. One answer, shared by the prevent_role_escalation trigger (which raises it) and the frontend (which shows it).';


-- The trigger now refuses the flip. A RAISE here is correct: this trigger must
-- REJECT the write, which is the opposite case to chat_guard(), where a RAISE
-- would roll back the row that is itself the evidence.
create or replace function public.prevent_role_escalation()
returns trigger
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
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
$$;
