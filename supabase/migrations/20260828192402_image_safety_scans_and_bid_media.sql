-- ────────────────────────────────────────────────────────────────────────────
-- 1. image_scans — the verdict ledger for user-uploaded photos.
--
-- One row per (bucket, path). Written ONLY by scan-image through the service
-- role, so there are no INSERT/UPDATE policies for end users at all: a verdict
-- a user could write is not a verdict.
--
-- 'unknown' is a first-class verdict, not an error state. The scanner is
-- deliberately FAIL-OPEN — a completion photo is a payment gate and a dispute
-- exhibit, so a scanner outage must never be the thing that loses one. An
-- 'unknown' row is what lets an admin find, later, the photos nobody vetted.
-- ────────────────────────────────────────────────────────────────────────────
create table if not exists public.image_scans (
  id          uuid primary key default gen_random_uuid(),
  bucket      text        not null,
  path        text        not null,
  scanned_by  uuid,
  verdict     text        not null check (verdict in ('ok','flag','reject','unknown')),
  categories  text[]      not null default '{}',
  detail      text,
  created_at  timestamptz not null default now()
);

create unique index if not exists image_scans_path_uidx on public.image_scans (bucket, path);
create index if not exists image_scans_verdict_idx on public.image_scans (verdict, created_at desc);

alter table public.image_scans enable row level security;

drop policy if exists image_scans_admin_read on public.image_scans;
create policy image_scans_admin_read on public.image_scans
  for select to authenticated
  using (exists (select 1 from public.profiles p
                 where p.id = (select auth.uid()) and p.role = 'admin'));

revoke all on public.image_scans from public, anon;
grant select on public.image_scans to authenticated;

-- ────────────────────────────────────────────────────────────────────────────
-- 2. Bid-stage chat attachments.
--
-- BidChat was text-only because storage RLS on message-media keys on a JOB id
-- that does not exist before a job is created. Rather than a parallel bucket,
-- bid media lives in message-media under a REQUEST id, so chat_guard, the
-- blocked flag and sender-only visibility all keep applying unchanged.
--
-- ⚠️ The existing message_media_* policies do split_part(name,'/',1)::uuid.
-- That is a CAST, not a match — an object whose first path segment is not a
-- uuid raises 22P02 while the policy is evaluated, which would break reads of
-- the WHOLE bucket for everyone, not just that row. So bid media must keep a
-- uuid first segment. Path is <request_id>/<contractor_id>/<file>.
-- ────────────────────────────────────────────────────────────────────────────
create or replace function public.bid_media_path_ok(p_name text)
returns boolean
language sql
stable
security definer
set search_path = public, extensions, pg_temp
as $$
  -- CASE short-circuits, so the shape test runs BEFORE either ::uuid cast.
  -- A loose regex here is not cosmetic: a 36-character non-uuid would raise
  -- inside a WITH CHECK, which surfaces to the user as an unexplained failure.
  select case
    when p_name !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}/[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}/.+$'
      then false
    else
      -- The client who owns the request, and only into the folder of a pro who
      -- actually bid on it. Mirrors "the client opens the thread".
      exists (
        select 1
        from public.client_requests r
        join public.bids b
          on b.request_id = r.id
         and b.contractor_id = (split_part(p_name, '/', 2))::uuid
        where r.id = (split_part(p_name, '/', 1))::uuid
          and r.user_id = (select auth.uid())
      )
      or
      -- The pro, and only once the client has actually written first — the same
      -- test the message INSERT policy applies, so an upload can never get ahead
      -- of the rule it exists to serve.
      (
        (split_part(p_name, '/', 2))::uuid = (select auth.uid())
        and public.bid_thread_open(
              (split_part(p_name, '/', 1))::uuid,
              (select auth.uid()))
      )
  end
$$;

revoke all on function public.bid_media_path_ok(text) from public, anon;
grant execute on function public.bid_media_path_ok(text) to authenticated;

drop policy if exists bid_media_insert on storage.objects;
create policy bid_media_insert on storage.objects
  for insert to authenticated
  with check (bucket_id = 'message-media' and public.bid_media_path_ok(name));

-- Read is keyed on the MESSAGE row, not the path, exactly like the dispute
-- photo policy. messages RLS already answers "may this person read this
-- thread", so this inherits the pro-A-cannot-read-pro-B rule for free instead
-- of restating it and risking drift. It is deliberately NOT security definer.
drop policy if exists bid_media_select on storage.objects;
create policy bid_media_select on storage.objects
  for select to authenticated
  using (
    bucket_id = 'message-media'
    and exists (
      select 1 from public.messages m
      where m.attachment_path = objects.name
        and m.request_id is not null
    )
  );
