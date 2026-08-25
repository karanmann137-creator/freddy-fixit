-- P1-8. Rate-limit check_signup_availability, the one anon-callable RPC that
-- answers a yes/no question about whether an email or phone is registered.
-- Unthrottled it is an enumeration oracle.
--
-- Keyed on the caller IP. PostgREST populates the `request.headers` GUC, and
-- the first hop of x-forwarded-for is the client -- verified empirically with
-- a real round-trip (net.http_post -> 200, row landed in rate_limit_hits),
-- not assumed. If the header is absent we FAIL OPEN: we cannot identify the
-- caller, and blocking an unidentifiable caller would block everyone.
--
-- NO FRONTEND CHANGE IS NEEDED. Both call sites (ClientOnboarding.tsx:377,
-- ContractorOnboarding.tsx:280) wrap the RPC in try/catch and fall through on
-- anything unexpected, so a throttled caller loses a nicer error message and
-- nothing else. The real duplicate guards are unchanged and are elsewhere:
-- GoTrue's fake-success on an already-registered email, and the BEFORE INSERT
-- enforce_unique_signup_phone trigger. Throttling must never cost an account.

create table if not exists public.rate_limit_hits (
  bucket       text        not null,
  key          text        not null,
  window_start timestamptz not null default now(),
  count        integer     not null default 0,
  primary key (bucket, key)
);
alter table public.rate_limit_hits enable row level security;
revoke all on table public.rate_limit_hits from public, anon, authenticated;

create or replace function public.rl_hit(p_bucket text, p_limit int, p_window_secs int)
returns boolean language plpgsql security definer
set search_path = public, extensions, pg_temp
as $fn$
declare v_hdrs json; v_key text; v_n int;
begin
  begin
    v_hdrs := current_setting('request.headers', true)::json;
  exception when others then v_hdrs := null; end;
  v_key := coalesce(split_part(coalesce(v_hdrs->>'x-forwarded-for',''), ',', 1), '');
  v_key := nullif(btrim(v_key), '');
  if v_key is null then return true; end if;  -- can't identify the caller; don't block
  insert into public.rate_limit_hits as t (bucket, key, window_start, count)
  values (p_bucket, v_key, now(), 1)
  on conflict (bucket, key) do update set
    window_start = case when t.window_start < now() - make_interval(secs => p_window_secs)
                        then now() else t.window_start end,
    count        = case when t.window_start < now() - make_interval(secs => p_window_secs)
                        then 1 else t.count + 1 end
  returning t.count into v_n;
  return v_n <= p_limit;
end; $fn$;
revoke all on function public.rl_hit(text, int, int) from public, anon, authenticated;
grant execute on function public.rl_hit(text, int, int) to service_role;

-- 10 checks per IP per hour. A real signup needs one.
-- Body below is the live body verbatim; the ONLY addition is the rl_hit gate.
create or replace function public.check_signup_availability(p_email text, p_phone text)
returns jsonb language plpgsql security definer
set search_path = public, extensions, pg_temp
as $fn$
declare
  v_email  text := lower(trim(coalesce(p_email,'')));
  v_digits text := regexp_replace(coalesce(p_phone,''),'\D','','g');
  v_email_taken boolean := false;
  v_phone_taken boolean := false;
begin
  if not public.rl_hit('signup_availability', 10, 3600) then
    return jsonb_build_object('email_taken', false, 'phone_taken', false, 'rate_limited', true);
  end if;

  if v_email <> '' then
    select exists(select 1 from auth.users u where lower(u.email) = v_email)
        or exists(select 1 from public.profiles p where lower(coalesce(p.email,'')) = v_email)
      into v_email_taken;
  end if;
  if length(v_digits) >= 10 then
    select exists(
      select 1 from public.profiles p
      where regexp_replace(coalesce(p.phone,''),'\D','','g') <> ''
        and right(regexp_replace(coalesce(p.phone,''),'\D','','g'),10) = right(v_digits,10)
    ) into v_phone_taken;
  end if;
  return jsonb_build_object('email_taken', v_email_taken, 'phone_taken', v_phone_taken);
end; $fn$;

-- Drift fix, same shape as the pgcrypto bug that killed every signup for a
-- month: both of these were pinned to `public` only.
alter function public.shares_connection(uuid) set search_path = public, extensions, pg_temp;
