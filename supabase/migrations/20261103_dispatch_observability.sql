-- 2026-11-03 · Make dispatch delivery observable.
--
-- WHY. Before this, a dispatch that reached nobody and a dispatch that reached
-- sixteen pros who ignored it looked identical from the outside: no bids. The
-- only artefact dispatch-job left behind was `client_requests.dispatched_to`,
-- and that array is appended to ONLY on a 2xx from Resend — so a 422, a blown
-- quota or a thrown fetch left no trace anywhere. The live concrete job
-- (2026-11-03 audit) could not be diagnosed because of exactly this.
--
-- Two separate problems, fixed together:
--   1. No per-recipient record. → public.dispatch_log, written by dispatch-job
--      v23 in BOTH the res.ok and !res.ok branches, plus the terminal
--      no_contractors / no_match no-ops (contractor_id null).
--   2. pg_net's 5000ms default timeout. dispatch-job does one Resend
--      round-trip per recipient up to BID_CAP=7, so it routinely runs past 5s;
--      pg_net then aborts the connection mid-loop and the remaining pros are
--      never paged. All three callers now pass timeout_milliseconds := 30000.
--
-- NOT APPLIED BY THE INSTALLER. This was applied live via Supabase MCP on
-- 2026-11-03 and is committed for version control only.

-- ── 1. The log ────────────────────────────────────────────────────────────────
create table if not exists public.dispatch_log (
  id            bigserial primary key,
  request_id    uuid not null references public.client_requests(id) on delete cascade,
  contractor_id uuid,          -- null = a request-level outcome (no_match etc.)
  ok            boolean not null,
  status_code   int,            -- Resend HTTP status, null if the fetch threw
  error         text,
  reserved      boolean not null default false,  -- was this inside the 48h rehire window
  created_at    timestamptz not null default now()
);

create index if not exists dispatch_log_request_idx
  on public.dispatch_log (request_id, created_at desc);
create index if not exists dispatch_log_contractor_idx
  on public.dispatch_log (contractor_id, created_at desc);
create index if not exists dispatch_log_fail_idx
  on public.dispatch_log (created_at desc) where ok = false;

-- No policies on purpose: the service-role client in dispatch-job bypasses RLS
-- to write, and reads are curated by the SECURITY DEFINER RPC below. A
-- contractor must not be able to enumerate who else was paged on a job.
alter table public.dispatch_log enable row level security;
revoke all on public.dispatch_log from anon, authenticated;
revoke all on sequence public.dispatch_log_id_seq from anon, authenticated;

-- ── 2. Admin read path ───────────────────────────────────────────────────────
-- A table nobody can reach is a table nobody checks. ff_local_ts(), never a
-- bare to_char() on the timestamptz.
create or replace function public.admin_dispatch_log(
  p_request_id uuid default null,
  p_limit      int  default 200
)
returns table (
  request_id    uuid,
  service       text,
  contractor_id uuid,
  company       text,
  ok            boolean,
  status_code   int,
  error         text,
  reserved      boolean,
  sent_at       text
)
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
begin
  perform public.admin_guard();
  return query
  select d.request_id,
         cr.service_needed,
         d.contractor_id,
         c.company_name,
         d.ok,
         d.status_code,
         d.error,
         d.reserved,
         public.ff_local_ts(d.created_at)
  from public.dispatch_log d
  left join public.client_requests cr on cr.id = d.request_id
  left join public.contractors     c  on c.id  = d.contractor_id
  where p_request_id is null or d.request_id = p_request_id
  order by d.created_at desc
  limit greatest(coalesce(p_limit, 200), 1);
end $$;

-- Revoking from anon alone is a no-op; the default grant is to PUBLIC.
revoke all on function public.admin_dispatch_log(uuid, int) from public;
revoke all on function public.admin_dispatch_log(uuid, int) from anon;
grant execute on function public.admin_dispatch_log(uuid, int) to authenticated;

-- ── 3. timeout_milliseconds on all three dispatch-job callers ────────────────
-- Bodies are otherwise byte-identical to the versions they replace; the only
-- change in each is the added `timeout_milliseconds := 30000`.

CREATE OR REPLACE FUNCTION public.trg_dispatch_new_request()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
declare
  v_url  text := coalesce(current_setting('app.supabase_url', true),
                          'https://kvypmjxbbaaknvddwwai.supabase.co')
                 || '/functions/v1/dispatch-job';
  v_anon text := '<anon key — see live function body>';
begin
  if new.waitlisted then return new; end if;
  -- Site paused: the request is still recorded, contractors just aren't paged.
  if public.outbound_paused() then return new; end if;
  begin
    perform net.http_post(
      url     := v_url,
      headers := jsonb_build_object('Content-Type', 'application/json',
                                    'Authorization', 'Bearer ' || v_anon),
      body    := jsonb_build_object('request_id', new.id),
      timeout_milliseconds := 30000);
  exception when others then
    raise warning 'dispatch-job enqueue failed: %', sqlerrm;
  end;
  return new;
end;
$function$;

-- refire_request() and release_waitlisted_requests() received the identical
-- one-line change. Their full bodies are long and carry the inline anon bearer
-- (the older-kicker cleanup backlog noted in CLAUDE.md); read the live
-- definitions with pg_get_functiondef rather than trusting a copy here.
--
--   perform net.http_post(
--     url     := v_url,
--     headers := jsonb_build_object('Content-Type','application/json',
--                                   'Authorization','Bearer ' || v_anon),
--     body    := jsonb_build_object('request_id', <id>),
--     timeout_milliseconds := 30000   -- ← added 2026-11-03
--   );
