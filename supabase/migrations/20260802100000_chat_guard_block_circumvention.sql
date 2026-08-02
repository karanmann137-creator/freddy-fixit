-- Chat guard: stop off-platform contact before it reaches the other person.
--
-- Design notes that matter:
--
-- 1. The rules live HERE, in Postgres, and nowhere else. A browser-side regex is
--    trivially bypassed and would drift from this one. `src/lib/chatParse.ts`
--    only turns the reasons this function writes into a readable sentence.
--
-- 2. The trigger sets `blocked` instead of RAISEing. A RAISE would roll back the
--    row in the same transaction — and the row IS the evidence the owner asked
--    to keep. Inserting it and hiding it with RLS gives us both: the sender sees
--    exactly what didn't land (and can edit it), the recipient never sees it,
--    and an admin has the record.

alter table public.messages
  add column if not exists blocked      boolean not null default false,
  add column if not exists flag_reasons text[];

create index if not exists messages_blocked_idx
  on public.messages (created_at desc) where blocked;

-- Returns the reason tokens for a message, or an empty array. Token values are
-- mirrored in FLAG_LABELS in src/lib/chatParse.ts.
create or replace function public.chat_flag_reasons(p_text text)
returns text[]
language plpgsql
immutable
set search_path to 'public', 'pg_temp'
as $function$
declare
  t text := coalesce(p_text, '');
  r text[] := '{}';
begin
  -- NOTE: `text[] || 'literal'` is ambiguous in Postgres — the ::text casts are required.
  if t ~ '(\+?1[\s.\-]*)?\(?\d{3}\)?[\s.\-]*\d{3}[\s.\-]*\d{4}' then
    r := r || 'phone'::text;
  end if;

  if t ~* '[[:alnum:]._%+\-]+@[[:alnum:]\-]+\.[[:alpha:]]{2,}' then
    r := r || 'email'::text;
  end if;

  if t ~* '\m(whats\s?app|telegram|snap\s?chat|wechat|viber|imessage)\M' then
    r := r || 'messaging_app'::text;
  end if;

  if t ~* '\m(instagram|kijiji|craigslist|marketplace)\M'
     or t ~* '(^|\s)@[[:alnum:]._]{3,}' then
    r := r || 'social'::text;
  end if;

  if t ~* '\m(e[\s\-]?transfer|interac|venmo|paypal|zelle|cash\s?app|wire\s+transfer)\M'
     or t ~* '\m(pay|paid|paying)\M[^.!?]{0,30}\m(cash|directly|in\s+person|under\s+the\s+table)\M'
     or t ~* '\m(cash\s+only|under\s+the\s+table)\M' then
    r := r || 'payment'::text;
  end if;

  if t ~* '\m(off|outside|around|skip|bypass|avoid)\M[^.!?]{0,25}\m(the\s+)?(app|platform|site|website|freddy|fee|fees|commission)\M'
     or t ~* '\m(deal|book|hire|work)\M[^.!?]{0,15}\mdirectly\M' then
    r := r || 'off_platform'::text;
  end if;

  return r;
end;
$function$;

create or replace function public.chat_guard()
returns trigger
language plpgsql
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_reasons text[];
begin
  v_reasons := public.chat_flag_reasons(new.content);
  if array_length(v_reasons, 1) > 0 then
    new.blocked      := true;
    new.flag_reasons := v_reasons;
  end if;
  return new;
end;
$function$;

drop trigger if exists messages_chat_guard on public.messages;
create trigger messages_chat_guard
  before insert or update on public.messages
  for each row execute function public.chat_guard();

-- RLS. The old catch-all ALL policy is split so SELECT can hide blocked rows
-- from the recipient while still showing them to their author. Supabase realtime
-- respects RLS, so this governs the live stream too, not just the first fetch.
-- (A `src` sweep confirmed the app only ever selects and inserts messages —
-- there are no updates or deletes to lose.)
drop policy if exists "messages participant access" on public.messages;
drop policy if exists "messages participant read"   on public.messages;
drop policy if exists "messages participant send"   on public.messages;

create policy "messages participant read" on public.messages
  for select using (
    (select auth.uid()) in (
      select client_id from public.jobs where id = messages.job_id
      union
      select contractor_id from public.jobs where id = messages.job_id
    )
    and (blocked is not true or sender_id = (select auth.uid()))
  );

create policy "messages participant send" on public.messages
  for insert with check (
    (select auth.uid()) in (
      select client_id from public.jobs where id = messages.job_id
      union
      select contractor_id from public.jobs where id = messages.job_id
    )
  );

-- Admin review feed for the dashboard's "Flagged chat" tab.
create or replace function public.admin_list_chat_flags(p_limit integer default 100)
returns table(
  message_id uuid, job_id uuid, created_at timestamptz, content text,
  flag_reasons text[], sender_id uuid, sender_name text, sender_role text,
  service text, client_name text, contractor_name text
)
language sql
security definer
set search_path to 'public', 'pg_temp'
as $function$
  select
    m.id, m.job_id, m.created_at, m.content, m.flag_reasons, m.sender_id,
    nullif(trim(coalesce(sp.first_name,'') || ' ' || coalesce(sp.last_name,'')), ''),
    sp.role,
    r.service_needed,
    nullif(trim(coalesce(cp.first_name,'') || ' ' || coalesce(cp.last_name,'')), ''),
    nullif(trim(coalesce(kp.first_name,'') || ' ' || coalesce(kp.last_name,'')), '')
  from public.messages m
  left join public.profiles        sp on sp.id = m.sender_id
  left join public.jobs            j  on j.id  = m.job_id
  left join public.client_requests r  on r.id  = j.request_id
  left join public.profiles        cp on cp.id = j.client_id
  left join public.profiles        kp on kp.id = j.contractor_id
  where m.blocked and public.is_admin()
  order by m.created_at desc
  limit greatest(1, least(coalesce(p_limit, 100), 500));
$function$;

revoke all on function public.admin_list_chat_flags(integer) from public, anon;
grant execute on function public.admin_list_chat_flags(integer) to authenticated;

-- A blocked message never reaches the recipient, so the "new message" email must
-- not fire — otherwise they go looking for something RLS hides. Returning before
-- the throttle log is touched also stops a blocked message from consuming the
-- 15-minute window a legitimate follow-up needs.
create or replace function public.notify_new_message()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_client     uuid;
  v_contractor uuid;
  v_recipient  uuid;
  v_did        boolean;
  v_url  text := 'https://kvypmjxbbaaknvddwwai.supabase.co/functions/v1/notify-message';
  v_anon text := current_setting('app.anon_key', true);
begin
  if NEW.blocked then return NEW; end if;

  select client_id, contractor_id into v_client, v_contractor
    from public.jobs where id = NEW.job_id;
  if v_client is null and v_contractor is null then return NEW; end if;

  if NEW.sender_id = v_client then v_recipient := v_contractor;
  elsif NEW.sender_id = v_contractor then v_recipient := v_client;
  else v_recipient := null;
  end if;
  if v_recipient is null then return NEW; end if;

  insert into public.message_email_log(job_id, recipient_id, last_emailed_at)
  values (NEW.job_id, v_recipient, now())
  on conflict (job_id, recipient_id) do update
    set last_emailed_at = now()
    where public.message_email_log.last_emailed_at < now() - interval '15 minutes'
  returning true into v_did;

  if v_did is null then return NEW; end if;

  begin
    perform net.http_post(
      url     := v_url,
      headers := jsonb_build_object('Content-Type','application/json','Authorization','Bearer '||v_anon),
      body    := jsonb_build_object('message_id', NEW.id, 'recipient_id', v_recipient)
    );
  exception when others then
    raise warning 'notify-message enqueue failed: %', sqlerrm;
  end;
  return NEW;
end;
$function$;
