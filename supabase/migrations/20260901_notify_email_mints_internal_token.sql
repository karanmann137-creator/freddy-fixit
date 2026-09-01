-- public.notify_email() proves it is Postgres, instead of carrying a bearer
-- that proves nothing.  APPLIED LIVE VIA SUPABASE MCP -- version control only.
--
-- The old body posted a HARDCODED anon JWT as the Authorization bearer. That
-- proved nothing (the anon key is a valid project-signed JWT and ships
-- publicly in the JS bundle) and it sat in pg_proc.prosrc, which is publicly
-- readable, on a public repo. It now mints a single-use 10-minute
-- x-ff-internal token, which notify-email v9 redeems through
-- consume_internal_token -- redeeming is what proves the caller is Postgres.
--
-- MONEY: touches none of the four payout guards. But confirm_job_completion()
-- IS payout guard 1 and it calls this function, so the token mint stays
-- INSIDE the existing catch-all. A notification is never worth a payout --
-- the pgcrypto lesson.
--
-- Apply order is load-bearing: this migration goes FIRST. An x-ff-internal
-- header sent to a still-ungated function is harmless. The reverse order
-- would break the job_confirmed_contractor email in the window between the
-- two steps.

create or replace function public.notify_email(p_event text, p_job_id uuid)
returns void
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $fn$
declare
  v_url   text := coalesce(current_setting('app.supabase_url', true),
                           'https://kvypmjxbbaaknvddwwai.supabase.co')
                  || '/functions/v1/notify-email';
  v_token text;
begin
  begin
    v_token := public.issue_internal_token('edge-internal');
    perform net.http_post(
      url     := v_url,
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'x-ff-internal', v_token
      ),
      body    := jsonb_build_object('event', p_event, 'job_id', p_job_id)
    );
  exception when others then
    raise warning 'notify-email enqueue failed: %', sqlerrm;
  end;
end;
$fn$;

revoke all on function public.notify_email(text, uuid) from public, anon;
grant execute on function public.notify_email(text, uuid) to postgres, service_role;
