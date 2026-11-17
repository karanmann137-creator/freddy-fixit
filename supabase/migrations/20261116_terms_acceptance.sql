-- Terms acceptance: an append-only record of who agreed to which version, and when.
--
-- WHY THIS EXISTS. Until now the acceptance checkbox in every signup flow was a
-- `useState(false)` validated in the browser and then thrown away. Nothing was stored
-- anywhere, so the platform could not answer "prove this person agreed, and to which
-- version" — which is the question UA §12 (14-day amendment notice) and PIPA both
-- eventually ask. The third-party disclosure shipped 2026-11-16 is the first amendment
-- that materially changes the terms, so the record starts here.
--
-- WHY A TABLE AND NOT TWO COLUMNS ON `profiles`. The "Users manage own profile" policy on
-- `profiles` is FOR ALL on `auth.uid() = id`, so columns there are PATCHable straight
-- through PostgREST with the public anon key — the same shape as the role-escalation hole
-- closed on 2026-11-09. A user forging their own acceptance is not an attack on anyone
-- else, but it destroys the only thing the record is for. So this follows the
-- `admin_audit_log` pattern instead: SELECT policy only, NO insert/update/delete policy at
-- all, and the single write path is a SECURITY DEFINER function. A forged direct call gets
-- `permission denied`. It is append-only and must stay that way.
--
-- The unique index makes re-accepting the same version idempotent rather than an error, so
-- a double-tap on the Accept button cannot fail. Accepting a NEW version appends a row, so
-- the history is visible: v1 then v2, with dates.
--
-- FK with ON DELETE CASCADE is deliberate and differs from `admin_audit_log`, which has no
-- FKs: the most important row the audit log can hold is "the admin deleted this account",
-- whereas an acceptance row for an account that no longer exists is evidence of nothing.
-- Deleting an account should delete it (PIPA), and this row holds no PII to preserve.

create table if not exists public.terms_acceptances (
  id          bigserial primary key,
  user_id     uuid        not null references public.profiles(id) on delete cascade,
  version     text        not null,
  surface     text        not null default 'unknown',
  accepted_at timestamptz not null default now()
);

create unique index if not exists terms_acceptances_user_version_key
  on public.terms_acceptances (user_id, version);

create index if not exists terms_acceptances_user_idx
  on public.terms_acceptances (user_id, accepted_at desc);

alter table public.terms_acceptances enable row level security;

-- Read your own; admins read all (oversight). Deliberately NO write policy — see header.
drop policy if exists "Users read own terms acceptances" on public.terms_acceptances;
create policy "Users read own terms acceptances"
  on public.terms_acceptances for select
  using (auth.uid() = user_id or public.is_admin());

-- The current version lives in platform_settings, mirroring platform_mode(): one row,
-- readable by one STABLE function, so the version the server records and the version the
-- browser is told to accept cannot drift. The browser never supplies it.
insert into public.platform_settings (key, value)
values ('terms_version', '"2026-11-16"'::jsonb)
on conflict (key) do nothing;

create or replace function public.current_terms_version()
returns text
language sql
stable security definer
set search_path to 'public', 'extensions', 'pg_temp'
as $function$
  select coalesce(
    (select value #>> '{}' from public.platform_settings where key = 'terms_version'),
    '2026-11-16'
  );
$function$;

-- terms_status(): what the browser asks on load. Returns the current version, what this
-- caller last accepted, and whether an acceptance is owed.
--
-- `auth.uid() is null` is tested FIRST and returns needed=false, per the null-guard rule:
-- an anon visitor is owed nothing, service_role and internal callers pass through, and a
-- NULL comparison never silently decides anything here.
create or replace function public.terms_status()
returns jsonb
language plpgsql
stable security definer
set search_path to 'public', 'extensions', 'pg_temp'
as $function$
declare
  v_cur  text := public.current_terms_version();
  v_uid  uuid := auth.uid();
  v_ver  text;
  v_at   timestamptz;
begin
  if v_uid is null then
    return jsonb_build_object('version', v_cur, 'accepted_version', null,
                              'accepted_at', null, 'needed', false);
  end if;

  select t.version, t.accepted_at into v_ver, v_at
    from public.terms_acceptances t
   where t.user_id = v_uid
   order by t.accepted_at desc
   limit 1;

  return jsonb_build_object(
    'version',          v_cur,
    'accepted_version', v_ver,
    'accepted_at',      v_at,
    'needed',           (v_ver is distinct from v_cur)
  );
end;
$function$;

-- accept_terms(): the ONE write path. Takes no version — it stamps
-- current_terms_version() server-side, so a browser cannot claim to have accepted a
-- version that was never published, and cannot pre-accept a future one.
--
-- `p_surface` is a label for where the acceptance happened ('signup-client',
-- 'signup-contractor', 'new-request', 'reaccept'). It is free text from the client and is
-- therefore descriptive only — never read it as a permission.
--
-- RAISEs rather than returning a reason because, unlike job_money_block() or
-- role_change_block(), there is no refusal to explain: an authenticated caller is always
-- allowed to accept. The only failure is "we don't know who you are", which is a bug.
create or replace function public.accept_terms(p_surface text default 'reaccept')
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'extensions', 'pg_temp'
as $function$
declare
  v_uid uuid := auth.uid();
  v_cur text := public.current_terms_version();
begin
  if v_uid is null then
    raise exception 'Sign in to accept the terms.';
  end if;

  insert into public.terms_acceptances (user_id, version, surface)
  values (v_uid, v_cur, coalesce(nullif(trim(p_surface), ''), 'unknown'))
  on conflict (user_id, version) do nothing;

  return jsonb_build_object('version', v_cur, 'accepted', true);
end;
$function$;

-- Grants. `revoke from public` is required as well as from anon: the default function
-- grant is to PUBLIC, so revoking from anon alone is a no-op.
revoke all on function public.current_terms_version()      from public, anon;
revoke all on function public.terms_status()               from public, anon;
revoke all on function public.accept_terms(text)           from public, anon;

grant execute on function public.current_terms_version()   to authenticated, service_role;
grant execute on function public.terms_status()            to authenticated, service_role;
grant execute on function public.accept_terms(text)        to authenticated, service_role;

-- admin_terms_tail(): owner-visible evidence. A plain is_admin() read, NOT admin_guard() —
-- reads do not carry the second factor, because that factor rides our own Resend mailer
-- and a mailer outage must never blind the admin dashboard.
create or replace function public.admin_terms_tail(p_limit int default 200)
returns table (accepted_at timestamptz, email text, role text, version text, surface text)
language sql
stable security definer
set search_path to 'public', 'extensions', 'pg_temp'
as $function$
  select t.accepted_at, p.email, p.role, t.version, t.surface
    from public.terms_acceptances t
    join public.profiles p on p.id = t.user_id
   where public.is_admin()
   order by t.accepted_at desc
   limit greatest(1, least(coalesce(p_limit, 200), 1000));
$function$;

revoke all on function public.admin_terms_tail(int) from public, anon;
grant execute on function public.admin_terms_tail(int) to authenticated, service_role;
