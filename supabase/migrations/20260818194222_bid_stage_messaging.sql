-- Bid-stage messaging: a private thread between the client and ONE pro who bid,
-- before any job exists.
--
-- Deliberately reuses public.messages rather than a parallel table, so
-- chat_guard() circumvention blocking, the `blocked` flag and sender-only
-- visibility all apply unchanged — and bid stage is exactly where the incentive
-- to go off-platform is highest, since there is no job yet to lose.
--
-- A message now belongs to EITHER a job or a request, never both, and a request
-- message must name which pro's thread it is in.

alter table public.messages
  add column if not exists request_id uuid references public.client_requests(id) on delete cascade,
  add column if not exists thread_contractor_id uuid references public.profiles(id) on delete cascade;

alter table public.messages drop constraint if exists messages_one_thread;
alter table public.messages add constraint messages_one_thread check (
  ((job_id is not null) <> (request_id is not null))
  and (request_id is null or thread_contractor_id is not null)
);

create index if not exists messages_request_thread_idx
  on public.messages (request_id, thread_contractor_id, created_at desc);

-- Read state is per-person, mirroring message_reads on the job side: one row per
-- (request, pro, reader), so each party keeps an independent position.
create table if not exists public.bid_thread_reads (
  request_id    uuid not null references public.client_requests(id) on delete cascade,
  contractor_id uuid not null references public.profiles(id) on delete cascade,
  user_id       uuid not null references public.profiles(id) on delete cascade,
  last_read_at  timestamptz not null default now(),
  primary key (request_id, contractor_id, user_id)
);
alter table public.bid_thread_reads enable row level security;
drop policy if exists "bid_thread_reads own" on public.bid_thread_reads;
create policy "bid_thread_reads own" on public.bid_thread_reads
  for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());
revoke truncate on public.bid_thread_reads from anon, authenticated;

-- Read: the request owner sees every thread on their request; a pro sees only
-- their own, because the policy matches on thread_contractor_id. Pro A can never
-- read pro B's conversation. Blocked messages stay visible to their sender only.
drop policy if exists "messages request thread read" on public.messages;
create policy "messages request thread read" on public.messages
  for select to authenticated
  using (
    request_id is not null
    and ( auth.uid() = thread_contractor_id
          or auth.uid() = (select r.user_id from public.client_requests r where r.id = messages.request_id) )
    and (blocked is not true or sender_id = auth.uid())
  );
