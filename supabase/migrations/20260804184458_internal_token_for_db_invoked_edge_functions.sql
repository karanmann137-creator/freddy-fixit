-- Several edge functions are invoked by the DB (triggers / pg_cron) via
-- net.http_post carrying the ANON key as the bearer. The anon key is public --
-- it ships in the JS bundle -- so "Authorization: Bearer <anon>" proves nothing.
-- Those functions therefore had no caller identity at all.
--
-- Fix: the DB mints a single-use, short-lived token, sends it in a header, and
-- the edge function redeems it through its service-role client. A service-role
-- key is deliberately NOT embedded in any function body: pg_proc.prosrc is
-- publicly readable.
create table if not exists public.internal_tokens (
  token       text primary key,
  purpose     text        not null,
  created_at  timestamptz not null default now(),
  expires_at  timestamptz not null default now() + interval '10 minutes',
  used_at     timestamptz
);

-- RLS on with ZERO policies = default deny for anon and authenticated.
-- service_role bypasses RLS, which is how the edge functions redeem.
alter table public.internal_tokens enable row level security;
revoke all on table public.internal_tokens from anon, authenticated;

create index if not exists internal_tokens_expires_idx on public.internal_tokens (expires_at);

create or replace function public.issue_internal_token(p_purpose text)
returns text
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare v_token text;
begin
  -- pgcrypto lives in `extensions`; schema-qualify or this 42883s silently.
  v_token := encode(extensions.gen_random_bytes(32), 'hex');
  insert into public.internal_tokens(token, purpose) values (v_token, p_purpose);
  -- opportunistic cleanup; keeps the table from growing without a cron job
  delete from public.internal_tokens where expires_at < now() - interval '1 day';
  return v_token;
exception when others then
  -- Never let token minting break the thing that needed the token.
  raise warning 'issue_internal_token failed: %', sqlerrm;
  return null;
end $$;

create or replace function public.consume_internal_token(p_token text, p_purpose text)
returns boolean
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare v_ok boolean;
begin
  if p_token is null or p_token = '' then return false; end if;
  update public.internal_tokens
     set used_at = now()
   where token   = p_token
     and purpose = p_purpose
     and used_at is null
     and expires_at > now()
  returning true into v_ok;
  return coalesce(v_ok, false);
end $$;

revoke all on function public.issue_internal_token(text)   from public, anon, authenticated;
revoke all on function public.consume_internal_token(text, text) from public, anon, authenticated;
grant execute on function public.issue_internal_token(text)   to service_role, postgres;
grant execute on function public.consume_internal_token(text, text) to service_role, postgres;
