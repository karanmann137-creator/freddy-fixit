-- Chat usability: per-person read state so the app can show unread badges,
-- an inbox and a "new message" attention row. Until now `public.messages` had
-- no read column at all and no notification row was ever written, so a throttled
-- email was the ONLY signal that a message had arrived.

create table if not exists public.message_reads (
  job_id       uuid not null references public.jobs(id)     on delete cascade,
  user_id      uuid not null references public.profiles(id) on delete cascade,
  last_read_at timestamptz not null default now(),
  primary key (job_id, user_id)
);

alter table public.message_reads enable row level security;

drop policy if exists message_reads_own on public.message_reads;
create policy message_reads_own on public.message_reads
  for all
  using      (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

drop policy if exists message_reads_admin_read on public.message_reads;
create policy message_reads_admin_read on public.message_reads
  for select using (public.is_admin());

-- Marks the whole conversation read up to now. Only a party to the job may do
-- it; an admin peeking at a chat must never clear the real recipient's badge.
create or replace function public.mark_job_read(p_job_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare v_uid uuid := auth.uid();
begin
  if v_uid is null then return; end if;

  if not exists (
    select 1 from public.jobs j
     where j.id = p_job_id and v_uid in (j.client_id, j.contractor_id)
  ) then
    return;
  end if;

  insert into public.message_reads (job_id, user_id, last_read_at)
  values (p_job_id, v_uid, now())
  on conflict (job_id, user_id) do update set last_read_at = now();
end;
$$;

-- One payload that drives the inbox, every unread badge and the attention row,
-- so a count can never disagree with the list it links to.
create or replace function public.my_conversations()
returns table (
  job_id              uuid,
  request_id          uuid,
  service_needed      text,
  location            text,
  job_status          text,
  scheduled_at        timestamptz,
  amount              numeric,
  i_am                text,
  other_id            uuid,
  other_name          text,
  other_company       text,
  last_message_at     timestamptz,
  last_snippet        text,
  last_sender_id      uuid,
  last_has_attachment boolean,
  unread              integer
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare v_uid uuid := auth.uid();
begin
  if v_uid is null then return; end if;

  return query
  with mine as (
    select j.id, j.request_id, j.status, j.scheduled_at, j.amount, j.created_at,
           case when j.client_id = v_uid then 'client' else 'contractor' end as i_am,
           case when j.client_id = v_uid then j.contractor_id else j.client_id end as other_id
      from public.jobs j
     where v_uid in (j.client_id, j.contractor_id)
  ),
  -- Mirrors the `messages participant read` RLS policy: a blocked message only
  -- ever comes back to the person who wrote it.
  vis as (
    select m.id, m.job_id, m.sender_id, m.content, m.created_at, m.attachment_path
      from public.messages m
      join mine x on x.id = m.job_id
     where m.blocked is not true or m.sender_id = v_uid
  )
  select
    x.id,
    x.request_id,
    r.service_needed,
    r.location,
    x.status,
    x.scheduled_at,
    x.amount,
    x.i_am,
    x.other_id,
    nullif(trim(coalesce(p.first_name,'') || ' ' || coalesce(p.last_name,'')), ''),
    c.company_name,
    lm.created_at,
    left(coalesce(nullif(lm.content,''), case when lm.attachment_path is not null then 'Sent a photo' else '' end), 140),
    lm.sender_id,
    lm.attachment_path is not null,
    coalesce(u.n, 0)::int
  from mine x
  left join public.client_requests r on r.id = x.request_id
  left join public.profiles        p on p.id = x.other_id
  left join public.contractors     c on c.id = x.other_id
  left join lateral (
    select v.content, v.created_at, v.sender_id, v.attachment_path
      from vis v where v.job_id = x.id
     order by v.created_at desc limit 1
  ) lm on true
  left join lateral (
    select count(*) as n
      from vis v
      left join public.message_reads mr
        on mr.job_id = x.id and mr.user_id = v_uid
     where v.job_id = x.id
       and v.sender_id <> v_uid
       and v.created_at > coalesce(mr.last_read_at, '-infinity'::timestamptz)
  ) u on true
  -- Keep every live job so a conversation can be STARTED from the inbox, plus
  -- any finished job that actually has history worth re-reading.
  where lm.created_at is not null
     or x.status not in ('completed','cancelled')
  order by lm.created_at desc nulls last, x.created_at desc;
end;
$$;

revoke all on function public.mark_job_read(uuid)  from public, anon;
revoke all on function public.my_conversations()   from public, anon;
grant execute on function public.mark_job_read(uuid) to authenticated;
grant execute on function public.my_conversations()  to authenticated;
