-- meta-lead-scout: 2-hourly kicker + cron arm (2026-09-03)
--
-- ALREADY APPLIED LIVE via Supabase MCP. This file is version control only.
--
-- Pattern follows kick_reconcile_payouts(): SECURITY DEFINER, pinned search_path
-- (public, extensions, pg_temp -- extensions because pgcrypto lives there), an
-- inner exception guard so a mail hiccup can never raise into cron, and grants
-- locked to {postgres, service_role}.
--
-- UNLIKE the older kickers, this one MINTS an internal token rather than
-- carrying the anon bearer. The bearer proves nothing (it is a valid
-- project-signed JWT that ships publicly in the JS bundle) and it sits in
-- publicly-readable pg_proc.prosrc on a public repo. meta-lead-scout v7+ gates
-- in code on x-ff-internal redeemed through consume_internal_token, or a real
-- admin JWT. Nothing else gets in.

create or replace function public.kick_meta_lead_scout()
returns void
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_url   text := coalesce(current_setting('app.supabase_url', true),
                           'https://kvypmjxbbaaknvddwwai.supabase.co')
                  || '/functions/v1/meta-lead-scout';
  v_token text;
begin
  begin
    v_token := public.issue_internal_token('edge-internal');
    perform net.http_post(
      url     := v_url,
      headers := jsonb_build_object(
        'Content-Type',  'application/json',
        'x-ff-internal', coalesce(v_token, '')
      ),
      body    := jsonb_build_object('source', 'cron')
    );
  exception when others then
    raise warning 'meta-lead-scout enqueue failed: %', sqlerrm;
  end;
end;
$$;

revoke all on function public.kick_meta_lead_scout() from public, anon, authenticated;
grant execute on function public.kick_meta_lead_scout() to postgres, service_role;

-- Minute 43 avoids all twelve pre-existing cron jobs. Every 2 hours -> jobid 16.
-- select cron.schedule('meta-lead-scout', '43 */2 * * *',
--                      'select public.kick_meta_lead_scout();');
--
-- Deliberately NOT added to set_platform_mode()'s quiet list: this scout only
-- ever emails hello@ (the owner), so it belongs with platform-health-check --
-- armed during a pause -- not with the six solicitation emitters that stand down.
