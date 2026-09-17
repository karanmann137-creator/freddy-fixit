-- Bid-stage chat: the client keeps every thread they actually started, after
-- they pick a pro.
--
-- The two branches were asymmetric. The CLIENT branch filtered
-- `r.status = 'pending'`; the CONTRACTOR branch had no status filter at all.
-- So the moment a client picked somebody, every bid conversation vanished from
-- their side — while the losing pros kept their threads and went on replying
-- into a conversation the client could no longer see.
--
-- Fixed with one added predicate: a request that has left 'pending' still
-- yields any thread that actually HAS messages. A request nobody ever wrote on
-- still drops out, so picking a pro does not leave six dead rows in the inbox.
--
-- Deliberately an `or exists (...)` on the existing client branch rather than a
-- third UNION branch: a new branch would need its own `limit 1` subselect for
-- bid_amount, which could disagree with the join-derived `b.amount` above and
-- defeat the UNION's dedup, producing two rows for one thread.
--
-- Applied live via Supabase MCP on 2026-09-16. This file is version control
-- only — installers do not apply DB changes.

CREATE OR REPLACE FUNCTION public.my_bid_threads()
 RETURNS TABLE(request_id uuid, contractor_id uuid, service_needed text, location text, request_status text, other_id uuid, other_name text, other_company text, other_photo_url text, bid_amount numeric, last_message_at timestamp with time zone, last_snippet text, last_sender_id uuid, last_has_attachment boolean, unread integer)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
declare v_uid uuid := auth.uid();
begin
  if v_uid is null then return; end if;

  return query
  with threads as (
    -- Client side: one row per pro who has bid on one of my open requests, so a
    -- thread can be STARTED from the inbox, not just continued. A request that
    -- has left 'pending' still yields any thread that actually has messages —
    -- otherwise picking a pro wipes the client's conversations while the pros
    -- keep theirs.
    select r.id as req, b.contractor_id as pro, r.service_needed, r.location, r.status,
           b.contractor_id as other, b.amount
      from public.client_requests r
      join public.bids b on b.request_id = r.id
     where r.user_id = v_uid
       and (r.status = 'pending'
            or exists (select 1 from public.messages m2
                        where m2.request_id = r.id
                          and m2.thread_contractor_id = b.contractor_id))
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
