-- Send policy for bid-stage threads.
--
-- The load-bearing rule: the CLIENT opens the thread, a pro can only reply.
-- A pro who could message first would turn a posted request into a cold-call
-- list, so this is enforced in the database, not the UI.
--
-- The "has the client already written?" test cannot live inline in the policy —
-- an INSERT WITH CHECK on public.messages containing a subquery on
-- public.messages is infinite recursion (Postgres re-evaluates the policy on the
-- subquery). Extracted into a SECURITY DEFINER helper, which also let the test
-- become stricter: it requires that the REQUEST OWNER specifically has spoken,
-- not merely somebody other than the caller.
create or replace function public.bid_thread_open(p_request_id uuid, p_contractor_id uuid)
returns boolean
language sql
stable
security definer
set search_path to 'public', 'extensions', 'pg_temp'
as $function$
  select exists (
    select 1
      from public.messages m
      join public.client_requests r on r.id = m.request_id
     where m.request_id = p_request_id
       and m.thread_contractor_id = p_contractor_id
       and m.sender_id = r.user_id
  );
$function$;

revoke all on function public.bid_thread_open(uuid, uuid) from public;
grant execute on function public.bid_thread_open(uuid, uuid) to authenticated;

drop policy if exists "messages request thread send" on public.messages;
create policy "messages request thread send" on public.messages
  for insert to authenticated
  with check (
    request_id is not null and thread_contractor_id is not null and sender_id = auth.uid()
    and (
      -- Client opening or continuing a thread with a pro who actually bid.
      ( auth.uid() = (select r.user_id from public.client_requests r where r.id = messages.request_id)
        and exists (select 1 from public.bids b
                     where b.request_id = messages.request_id
                       and b.contractor_id = messages.thread_contractor_id) )
      or
      -- Pro replying in their OWN thread, and only after the client has written.
      ( auth.uid() = thread_contractor_id
        and public.bid_thread_open(messages.request_id, messages.thread_contractor_id) )
    )
  );
