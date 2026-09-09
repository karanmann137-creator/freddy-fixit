-- Pre-deposit full-address confirmation (2026-09-09)
--
-- APPLIED LIVE via Supabase MCP. This file exists for version control only;
-- running the installer does NOT apply it.
--
-- WHY THE ADDRESS LIVES ON `jobs` AND NOT ON `client_requests`
-- Since the approximate-location change a client request carries only a postal
-- code and a quadrant token ("T3A 1B2 · NW Calgary"). That is deliberate:
-- `client_requests` is readable by every contractor the job is dispatched to
-- (up to seven), so a street address there would hand the inside of someone's
-- house to strangers who may never be hired.
--
-- A `jobs` row does not exist until a bid is accepted, so "no street address
-- before a pro is chosen" is true BY CONSTRUCTION rather than by a policy
-- somebody has to remember. The existing `Job parties see their jobs` RLS
-- policy then scopes it to exactly two people, so no new policy is needed.
alter table public.jobs
  add column if not exists service_address text,
  add column if not exists service_address_at timestamptz;

-- Clients have no UPDATE policy on `jobs` at all and should not gain one for
-- this, so the write goes through a SECURITY DEFINER RPC.
--
-- DELIBERATELY NOT WRITE-ONCE, unlike `contract_copy_sent_at`. A typo here
-- sends a tradesperson to the wrong house, so the address stays editable for
-- the live life of the job; the RPC refuses only once the job is cancelled or
-- paid out. Every raise is in plain English because the frontend shows the
-- message verbatim — each one is something the client can act on.
create or replace function public.confirm_job_address(p_job_id uuid, p_address text)
returns text language plpgsql security definer
-- `extensions` is not optional. `search_path = public` alone is the shape that
-- broke pgcrypto and silently killed every signup for a month.
set search_path = public, extensions, pg_temp
as $fn$
declare
  v_client uuid; v_status text; v_pay text;
  v_addr text := btrim(coalesce(p_address, ''));
begin
  -- `auth.uid() is null` is tested FIRST and separately. The obvious single
  -- check `v_client <> auth.uid()` evaluates to NULL when auth.uid() is NULL,
  -- and a NULL `if` condition does not fire — so an unauthenticated caller
  -- would fall straight through the guard. Same fix as `set_job_autopay`.
  if auth.uid() is null then raise exception 'Not authorized'; end if;

  select client_id, status, payment_status into v_client, v_status, v_pay
    from public.jobs where id = p_job_id;
  if v_client is null then raise exception 'Job not found'; end if;
  if v_client <> auth.uid() then raise exception 'Not authorized'; end if;

  if v_status = 'cancelled' then
    raise exception 'This job was cancelled, so its address can no longer be changed.';
  end if;
  if v_pay = 'released' then
    raise exception 'This job is finished and paid out, so its address can no longer be changed. Message your pro if something needs correcting.';
  end if;

  -- A postal code alone passes a non-empty check and is exactly the value we
  -- are trying to stop being submitted as an address, so require a digit and
  -- some length — a street address has a house number.
  if length(v_addr) < 8 or v_addr !~ '\d' then
    raise exception 'Please enter the full street address, including the house or unit number.';
  end if;

  update public.jobs set service_address = v_addr, service_address_at = now()
   where id = p_job_id;
  return v_addr;
end;
$fn$;

-- The default function grant is to PUBLIC, so revoking from `anon` alone is a
-- no-op — `public` must be named too.
revoke all on function public.confirm_job_address(uuid, text) from public, anon;
grant execute on function public.confirm_job_address(uuid, text) to authenticated;
