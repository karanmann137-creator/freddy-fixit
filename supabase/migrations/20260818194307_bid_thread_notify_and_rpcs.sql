-- Bid-stage threads: notification + the two RPCs the UI reads.
--
-- notify_new_message() gains a request-thread branch placed BEFORE the existing
-- job branch, which is untouched. It deliberately does NOT touch
-- message_email_log — that table is keyed (job_id, recipient_id) and job_id is
-- null here — so it throttles on the notifications table instead, 15 minutes per
-- recipient, matching the job-side behaviour.
--
-- NOTE: this file records the branch that was added. The full body of
-- notify_new_message() lives in the database; see the earlier migration that
-- created it for the job branch.
--
--   if NEW.request_id is not null then
--     select r.user_id, r.service_needed into v_client, v_service
--       from public.client_requests r where r.id = NEW.request_id;
--     if v_client is null then return NEW; end if;
--     if    NEW.sender_id = v_client                  then v_recipient := NEW.thread_contractor_id;
--     elsif NEW.sender_id = NEW.thread_contractor_id  then v_recipient := v_client;
--     else return NEW; end if;
--     if v_recipient is null then return NEW; end if;
--     if exists (select 1 from public.notifications n
--                 where n.user_id = v_recipient and n.type = 'bid_message'
--                   and n.created_at > now() - interval '15 minutes') then return NEW; end if;
--     if NEW.sender_id = v_client then
--       perform public._notify(v_recipient, 'bid_message', 'A client messaged you about your bid',
--         'A client has a question about the '||coalesce(v_service,'job')||' you bid on. Reply from your dashboard.', null);
--     else
--       perform public._notify(v_recipient, 'bid_message', 'A pro replied to your question',
--         'One of the pros who bid on your '||coalesce(v_service,'request')||' has replied. Open your dashboard to read it.', null);
--     end if;
--     return NEW;
--   end if;

-- Every thread the caller is party to, plus its unread count, in one call — so
-- an unread badge can never open onto an empty list.
create or replace function public.my_bid_threads()
returns table(request_id uuid, contractor_id uuid, service_needed text, location text,
              request_status text, other_id uuid, other_name text, other_company text,
              other_photo_url text, bid_amount numeric, last_message_at timestamptz,
              last_snippet text, last_sender_id uuid, last_has_attachment boolean, unread integer)
language plpgsql
stable
security definer
set search_path to 'public', 'extensions', 'pg_temp'
as $function$
declare v_uid uuid := auth.uid();
begin
  if v_uid is null then return; end if;

  return query
  with threads as (
    -- Client side: one row per pro who has bid on one of my open requests, so a
    -- thread can be STARTED from the inbox, not just continued.
    select r.id as req, b.contractor_id as pro, r.service_needed, r.location, r.status,
           b.contractor_id as other, b.amount
      from public.client_requests r
      join public.bids b on b.request_id = r.id
     where r.user_id = v_uid
       and r.status = 'pending'
    union
    -- Contractor side: only threads the client has already opened.
    select r.id, m.thread_contractor_id, r.service_needed, r.location, r.status,
           r.user_id, (select b2.amount from public.bids b2 where b2.request_id = r.id and b2.contractor_id = v_uid limit 1)
      from public.messages m
      join public.client_requests r on r.id = m.request_id
     where m.thread_contractor_id = v_uid
       and m.request_id is not null
  ),
  vis as (
    select m.request_id, m.thread_contractor_id, m.sender_id, m.content,
           m.created_at, m.attachment_path
      from public.messages m
     where m.request_id is not null
       and (m.blocked is not true or m.sender_id = v_uid)
  )
  select t.req, t.pro, t.service_needed, t.location, t.status,
         t.other,
         nullif(trim(coalesce(p.first_name,'')||' '||coalesce(p.last_name,'')), ''),
         c.company_name, c.photo_url, t.amount,
         lm.created_at,
         left(coalesce(nullif(lm.content,''), case when lm.attachment_path is not null then 'Sent a photo' else '' end), 140),
         lm.sender_id,
         lm.attachment_path is not null,
         coalesce(u.n, 0)::int
    from threads t
    left join public.profiles    p on p.id = t.other
    left join public.contractors c on c.id = t.other
    left join lateral (
      select v.content, v.created_at, v.sender_id, v.attachment_path
        from vis v
       where v.request_id = t.req and v.thread_contractor_id = t.pro
       order by v.created_at desc limit 1
    ) lm on true
    left join lateral (
      select count(*) as n
        from vis v
        left join public.bid_thread_reads br
          on br.request_id = t.req and br.contractor_id = t.pro and br.user_id = v_uid
       where v.request_id = t.req and v.thread_contractor_id = t.pro
         and v.sender_id <> v_uid
         and v.created_at > coalesce(br.last_read_at, '-infinity'::timestamptz)
    ) u on true
   order by lm.created_at desc nulls last;
end; $function$;

-- Read state is per-person. Returns early unless the caller is one of the two
-- parties, which is what makes an admin peek harmless.
create or replace function public.mark_bid_thread_read(p_request_id uuid, p_contractor_id uuid)
returns void
language plpgsql
security definer
set search_path to 'public', 'extensions', 'pg_temp'
as $function$
declare v_uid uuid := auth.uid();
begin
  if v_uid is null then return; end if;
  -- Only the two parties to this thread may hold a read position.
  if not (
    v_uid = p_contractor_id
    or v_uid = (select r.user_id from public.client_requests r where r.id = p_request_id)
  ) then
    return;
  end if;
  insert into public.bid_thread_reads (request_id, contractor_id, user_id, last_read_at)
  values (p_request_id, p_contractor_id, v_uid, now())
  on conflict (request_id, contractor_id, user_id) do update set last_read_at = now();
end; $function$;

revoke all on function public.my_bid_threads() from public;
revoke all on function public.mark_bid_thread_read(uuid, uuid) from public;
grant execute on function public.my_bid_threads() to authenticated;
grant execute on function public.mark_bid_thread_read(uuid, uuid) to authenticated;
