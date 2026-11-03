-- 2026-11-03 · Null-unsafe authorization guards, round two: six anon-reachable
-- RPCs, plus a detector so there isn't a round three.
--
-- NOT APPLIED BY THE INSTALLER. Applied live via Supabase MCP on 2026-11-03;
-- committed for version control only.
--
-- WHY. The 2026-08-04 audit fixed a family of twenty functions whose guards read
-- `v_x <> auth.uid()`. The hazard is that in SQL a comparison against NULL is
-- NULL, not false, and **a plpgsql IF with a NULL condition does not fire** — so
-- for an unauthenticated caller the `raise` is skipped and execution falls
-- straight through into the privileged body. `SECURITY DEFINER` removes RLS as
-- the backstop, so nothing downstream catches it either.
--
-- Six functions were missed, because they are spelled differently:
--
--   if not public.is_admin() and auth.uid() <> v_job.client_id then raise ...
--       -> true AND NULL = NULL -> does not fire
--   IF NOT (public.is_admin() OR v_client = auth.uid()) THEN raise ...
--       -> NOT (false OR NULL) = NULL -> does not fire
--
-- The grep that found the first twenty looked for `<> auth.uid()`. Neither of
-- these shapes matches it. The lesson is in the detector at the bottom of this
-- file: scan by REACHABILITY (what can anon execute?) crossed with the ABSENCE
-- of a null test, not by one spelling of the bug.
--
-- All six were EXECUTE-granted to anon, and the anon key is a valid
-- project-signed JWT that ships in the public JS bundle. Confirmed exploitable
-- by rolled-back probe, not inferred: an unauthenticated `accept_bid` call
-- assigned a contractor to a stranger's pending request, inserted the `jobs`
-- row, and queued the "you won the job" email.
--
-- Severity split. `accept_bid` was live and reachable today. The five milestone
-- functions were the same hole against a table with 0 rows — latent, and it
-- would have gone live the first time anyone booked a job over $2,000.
-- `approve_milestone` is a money function: it is the client's release signal.
--
-- NOT affected, and worth recording so nobody "fixes" them twice:
--   * client_reschedule_visit, save_job_photo, start_job_timer,
--     remove_client_request carry the same null-unsafe shape but are NOT
--     granted to anon, and for a signed-in caller auth.uid() is never null, so
--     the guard does fire. Defence-in-depth only.
--   * Functions that scope by `where x = auth.uid()` are safe by construction —
--     anon matches zero rows. Same for `exists(...)`, which returns false
--     rather than null. set_weekly_goal is a no-op, and toggle_favorite /
--     apply_referral_code are stopped by NOT NULL constraints (all three probed).
--   * accept_bid_by_token is the legitimate unauthenticated path — the
--     /pick/<token> page lets a client choose a pro without signing in. It
--     authorizes off client_requests.pick_token, scopes the bid to that one
--     request, and is untouched here. It MUST stay granted to anon. Probed
--     after this change: a real token still accepts, a bogus one is refused.

-- ── 1. The guard fix ─────────────────────────────────────────────────────────
-- Done by rewriting the guard line in place off pg_get_functiondef rather than
-- retyping six bodies. Nothing else in any body can drift, and the migration
-- refuses loudly if a guard line it expects has moved.

do $mig$
declare
  r      record;
  v_def  text;
  v_new  text;
  v_hits int := 0;
begin
  for r in
    select p.oid, p.proname
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname in ('accept_bid','propose_milestones','approve_milestone_schedule',
                        'complete_milestone','approve_milestone','dispute_milestone')
  loop
    v_def := pg_get_functiondef(r.oid);
    v_new := v_def;

    v_new := replace(v_new,
      'if not public.is_admin() and auth.uid() <> v_job.client_id then',
      'if auth.uid() is null or (not public.is_admin() and auth.uid() <> v_job.client_id) then');
    v_new := replace(v_new,
      'if not public.is_admin() and auth.uid() <> v_job.contractor_id then',
      'if auth.uid() is null or (not public.is_admin() and auth.uid() <> v_job.contractor_id) then');
    v_new := replace(v_new,
      'IF NOT (public.is_admin() OR v_client = auth.uid()) THEN',
      'IF auth.uid() IS NULL OR NOT (public.is_admin() OR v_client = auth.uid()) THEN');

    if v_new = v_def then
      raise exception 'guard line not found in %, refusing to continue', r.proname;
    end if;

    execute v_new;
    v_hits := v_hits + 1;
  end loop;

  if v_hits <> 6 then
    raise exception 'expected to patch 6 functions, patched %', v_hits;
  end if;
end $mig$;

-- ── 2. Defence in depth: take the grant away too ─────────────────────────────
-- A fixed guard and an absent grant fail independently. Revoking from anon
-- alone would be a no-op on the five milestone functions — their grant is to
-- PUBLIC (`=X/postgres`), so public has to be revoked as well.
--
-- Proof no legitimate caller is cut off, done BEFORE applying (tightening an
-- ACL is the dangerous direction): every call site is a signed-in dashboard —
-- accept_bid from ClientDashboard.pickBid, the five milestone functions from
-- MilestonePanel. The only unauthenticated pick path is PickPro.tsx, which
-- calls accept_bid_by_token. No DB function and no edge function calls any of
-- the six (checked against pg_proc.prosrc and supabase/functions/).

revoke execute on function public.accept_bid(uuid)                    from public, anon;
revoke execute on function public.propose_milestones(uuid, jsonb)     from public, anon;
revoke execute on function public.approve_milestone_schedule(uuid)    from public, anon;
revoke execute on function public.complete_milestone(uuid, text)      from public, anon;
revoke execute on function public.approve_milestone(uuid)             from public, anon;
revoke execute on function public.dispute_milestone(uuid, text)       from public, anon;

grant execute on function public.accept_bid(uuid)                     to authenticated;
grant execute on function public.propose_milestones(uuid, jsonb)      to authenticated;
grant execute on function public.approve_milestone_schedule(uuid)     to authenticated;
grant execute on function public.complete_milestone(uuid, text)       to authenticated;
grant execute on function public.approve_milestone(uuid)              to authenticated;
grant execute on function public.dispute_milestone(uuid, text)        to authenticated;

-- ── 3. The detector ──────────────────────────────────────────────────────────
-- A fix is a point-in-time event; this is what catches the next one. It crosses
-- "anon can execute it" with "it compares against auth.uid() and never tests
-- for null", which is the property that actually matters — not a spelling.
--
-- It is a LEAD GENERATOR, NOT A VERDICT. Comparing against auth.uid() inside a
-- WHERE clause or an exists() is perfectly safe. Every hit must be read, then
-- proved reachable or not with a rolled-back probe. As of this migration it
-- returns 17 rows and all 17 are the safe WHERE/exists shape.

create or replace function public.admin_anon_reachable_guards()
returns table (
  fn           text,
  args         text,
  anon_execute boolean,
  public_grant boolean,
  guard_line   text
)
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
begin
  perform public.admin_guard();
  return query
  select p.proname::text,
         pg_catalog.pg_get_function_identity_arguments(p.oid),
         has_function_privilege('anon', p.oid, 'EXECUTE'),
         (p.proacl is null or (p.proacl)[1]::text like '=X/%'),
         (regexp_match(p.prosrc, '[^\n]*auth\.uid\(\)[^\n]*'))[1]
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.prosecdef
    and has_function_privilege('anon', p.oid, 'EXECUTE')
    and p.prosrc ~ 'auth\.uid\(\)'
    and p.prosrc !~ 'auth\.uid\(\)\s+is\s+(not\s+)?null'
    and p.prosrc ~ '(<>|!=|=)\s*auth\.uid\(\)|auth\.uid\(\)\s*(<>|!=|=)'
  order by p.proname;
end $$;

revoke all on function public.admin_anon_reachable_guards() from public, anon;
grant execute on function public.admin_anon_reachable_guards() to authenticated;

-- ── 4. Verification actually run (rolled back) ───────────────────────────────
--
-- Before:
--   anon accept_bid SUCCEEDED, created job e19a3c70
--   anon propose_milestones reached the business rule ("only for jobs over
--     $2,000") — i.e. it got PAST the authorization check
--   anon approve_milestone_schedule reached "No proposed milestone plan to
--     approve" — likewise past the check
--
-- After:
--   accept_bid anon=false authenticated=true
--   approve_milestone anon=false authenticated=true
--   propose_milestones anon=false authenticated=true
--   accept_bid_by_token anon=true            <- unchanged, still the pick path
--   accept_bid (no JWT) refused: Not authorized
--   propose_milestones (no JWT) refused: Only the assigned contractor can ...
--   approve_milestone_schedule (no JWT) refused: Only the client can approve ...
--   owner accept_bid OK, job e2881ee4        <- no regression for the real client
--   /pick/<token> accept OK, job fac2da6d    <- no regression for the no-login path
--   bogus token refused: Invalid link
--   platform_health_check(): 7/7 passing
