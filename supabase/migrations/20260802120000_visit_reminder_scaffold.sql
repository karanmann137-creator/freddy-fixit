-- T-1h visit reminder: address, job facts and what the two of them actually
-- discussed in the chat, sent to both sides an hour before a scheduled visit.
--
-- SENDING IS OFF. The owner asked for this to ship switched off, so
-- visit_reminder_enabled() returns false and the edge function returns without
-- calling Resend. The cron runs, the in-app bells still fire, and the whole path
-- is exercised — only the email is held back. To turn it on, one command:
--
--   create or replace function public.visit_reminder_enabled()
--   returns boolean language sql immutable as $$ select true $$;

alter table public.jobs
  add column if not exists hour_reminder_sent_at timestamptz;

create index if not exists jobs_hour_reminder_idx
  on public.jobs (scheduled_at)
  where status = 'scheduled' and hour_reminder_sent_at is null;

create or replace function public.visit_reminder_enabled()
returns boolean language sql immutable as $$ select false $$;

-- Cron kicks the edge function; the function does the window selection, the
-- claim-then-send idempotency and the composing. Wrapped so a mail hiccup can
-- never surface as a failed cron run.
create or replace function public.kick_visit_reminders()
returns void
language plpgsql
security definer
set search_path to 'public', 'extensions', 'net', 'pg_temp'
as $function$
declare
  v_url  text := coalesce(current_setting('app.supabase_url', true),
                          'https://kvypmjxbbaaknvddwwai.supabase.co')
                 || '/functions/v1/visit-reminder';
  v_anon text := current_setting('app.anon_key', true);
begin
  begin
    perform net.http_post(
      url     := v_url,
      headers := jsonb_build_object(
        'Content-Type',  'application/json',
        'Authorization', 'Bearer ' || v_anon
      ),
      body    := jsonb_build_object('source','cron')
    );
  exception when others then
    raise warning 'visit-reminder enqueue failed: %', sqlerrm;
  end;
end;
$function$;

-- Every 10 minutes; the edge function only acts on visits 50-70 minutes out, so
-- each visit is caught exactly once and a missed tick still lands in the window.
select cron.unschedule('visit-reminders')
where exists (select 1 from cron.job where jobname = 'visit-reminders');

select cron.schedule('visit-reminders', '*/10 * * * *', $$ select public.kick_visit_reminders(); $$);
