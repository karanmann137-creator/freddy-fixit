-- Rate-limit user uploads.  APPLIED LIVE 2026-08-26 via Supabase MCP.
-- This file is version control only; the installer did not apply it.
--
-- WHY A TRIGGER AND NOT THE RLS POLICIES. There are seven INSERT policies on
-- storage.objects, one per bucket, and a new bucket gets a new policy. A gate
-- pasted into seven predicates is a gate that will be missing from the eighth
-- -- and it would fail SILENTLY, because a missing rate limit throws no error
-- and shows nothing. One BEFORE INSERT trigger covers every bucket that
-- exists and every bucket added later, by construction.
--
-- WHY NOT rl_hit(). That function keys on the first hop of x-forwarded-for
-- out of the `request.headers` GUC, which PostgREST sets and storage-api does
-- not. It would have keyed every upload on the empty string and, because it
-- fails OPEN on an unidentifiable caller, returned true forever -- a gate
-- that looks installed and does nothing. Uploads are keyed on auth.uid()
-- instead, which storage-api does set (every one of the seven policies
-- already depends on it).
--
-- SERVICE-ROLE WRITERS ARE NEVER GATED. auth.uid() is null for the
-- service-role client, so compress-images, contract-sign and the receipt
-- functions fall through before the counter is touched. That is deliberate:
-- compress-images rewrites up to 4 objects per invocation and re-runs are an
-- expected part of the procedure.
--
-- THE CAP IS DELIBERATELY LOOSE. 60 per hour is far above anything a real
-- session does -- the largest legitimate burst is a contractor loading a
-- portfolio, and the whole portfolio bucket holds 33 objects across all
-- contractors. It exists to stop a script filling the 1 GB storage cap, not
-- to police normal use. A limit tight enough to bite a real user would be
-- found by that user, not by an attacker.
--
-- Verified by rolled-back probe: 60th rl_hit_key call true / 61st false;
-- rl_hit still fails OPEN with no request.headers (the signup contract);
-- insert with NULL auth.uid() not gated; normal in-budget upload allowed;
-- over-budget upload blocked with 54000.  platform_health_check() 7/7 green.

-- Generic sibling of rl_hit that takes an explicit key. rl_hit now delegates
-- rather than keeping a second copy of the upsert: six byte-identical copies
-- of upsertMeta is exactly how this codebase has drifted before.
create or replace function public.rl_hit_key(
  p_bucket text, p_key text, p_limit integer, p_window_secs integer
) returns boolean
language plpgsql security definer
set search_path = public, extensions, pg_temp
as $fn$
declare v_key text := nullif(btrim(coalesce(p_key,'')), ''); v_n int;
begin
  if v_key is null then
    return true;  -- can't identify the caller; don't block
  end if;

  insert into public.rate_limit_hits as t (bucket, key, window_start, count)
  values (p_bucket, v_key, now(), 1)
  on conflict (bucket, key) do update set
    window_start = case when t.window_start < now() - make_interval(secs => p_window_secs)
                        then now() else t.window_start end,
    count        = case when t.window_start < now() - make_interval(secs => p_window_secs)
                        then 1 else t.count + 1 end
  returning t.count into v_n;

  return v_n <= p_limit;
end;
$fn$;

revoke all on function public.rl_hit_key(text,text,integer,integer) from public, anon, authenticated;
grant execute on function public.rl_hit_key(text,text,integer,integer) to service_role;

comment on function public.rl_hit_key(text,text,integer,integer) is
  'Fixed-window counter on an EXPLICIT key. Never grant this to anon or '
  'authenticated: an arbitrary key means a caller could exhaust somebody '
  'else''s budget. SECURITY DEFINER callers reach it as the owner.';

-- rl_hit keeps its exact signature, behaviour and fail-open contract; only
-- the body moves. check_signup_availability calls it unchanged.
create or replace function public.rl_hit(p_bucket text, p_limit integer, p_window_secs integer)
returns boolean
language plpgsql security definer
set search_path = public, extensions, pg_temp
as $fn$
declare v_hdrs json; v_key text;
begin
  begin
    v_hdrs := current_setting('request.headers', true)::json;
  exception when others then
    v_hdrs := null;
  end;
  v_key := split_part(coalesce(v_hdrs->>'x-forwarded-for',''), ',', 1);
  return public.rl_hit_key(p_bucket, v_key, p_limit, p_window_secs);
end;
$fn$;

create or replace function public.storage_upload_rate_guard()
returns trigger
language plpgsql security definer
set search_path = public, extensions, pg_temp
as $fn$
declare v_uid uuid;
begin
  begin
    v_uid := auth.uid();
  exception when others then
    v_uid := null;
  end;

  -- service_role and internal writers: not a user, not gated.
  if v_uid is null then
    return new;
  end if;

  if not public.rl_hit_key('storage_upload', v_uid::text, 60, 3600) then
    raise exception
      'Too many uploads in a short time. Please wait a few minutes and try again.'
      using errcode = '54000';
  end if;

  return new;
end;
$fn$;

revoke all on function public.storage_upload_rate_guard() from public, anon, authenticated;
grant execute on function public.storage_upload_rate_guard() to service_role;

drop trigger if exists ff_upload_rate_guard on storage.objects;
create trigger ff_upload_rate_guard
  before insert on storage.objects
  for each row execute function public.storage_upload_rate_guard();
