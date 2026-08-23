-- Signup mail is permanently exempt from the outbound pause.
--
-- Applied LIVE via Supabase MCP on 2026-08-23. Committed here for version
-- control only — installers do not run migrations.
--
-- send_contractor_welcome() returned early whenever outbound_paused() was true,
-- which is exactly the state the site is in now ('waitlist'). So a contractor who
-- signed up during the pause got nothing at all from us.
--
-- That is the August 2026 lockout shape. People signed up, and because the only
-- mail that reached them was our welcome, the ONE thing that told them anything
-- had happened was a Resend email -- and when the GoTrue confirmation silently
-- failed, three accounts sat stranded for days and we only found out because
-- somebody phoned. Silencing our side of signup makes that failure completely
-- invisible: no welcome, no confirmation, no error, nothing to reply to.
--
-- So this joins the existing pause exemptions -- GoTrue auth mail, health_alert,
-- enqueue_admin_alert, payment receipts -- on the same reasoning: the pause is
-- about not soliciting people, not about refusing to answer someone who just
-- handed us their email address.
--
-- Two other changes while here:
--
--   search_path was 'public, pg_temp'. SECURITY DEFINER with a bare public is the
--   pgcrypto trap that killed every signup for a month; this function makes no
--   pgcrypto call today but it runs INSIDE the signup transaction, so it is
--   precisely the wrong place to leave that landmine.
--
--   The hardcoded anon JWT is dropped. contractor-welcome is verify_jwt=false, so
--   the bearer was decorative -- verified by posting with no Authorization header
--   at all and getting the function's own 400 {"error":"missing id"} back, which
--   proves the body ran. pg_proc.prosrc is publicly readable and the repo is
--   public, so a credential that buys nothing should not be sitting in either.
--
-- MONEY: touches nothing. No payment path, no payout guard, no fee.

CREATE OR REPLACE FUNCTION public.send_contractor_welcome()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
declare
  v_url text := coalesce(current_setting('app.supabase_url', true),
                         'https://kvypmjxbbaaknvddwwai.supabase.co')
                || '/functions/v1/contractor-welcome';
begin
  -- DELIBERATELY NOT gated on outbound_paused(). Someone who just signed up is
  -- owed an answer whether or not we are taking new work. See header.
  begin
    perform net.http_post(
      url     := v_url,
      headers := jsonb_build_object('Content-Type', 'application/json'),
      body    := jsonb_build_object('id', new.id)
    );
  exception when others then
    -- Never let a mail hiccup roll back the contractor row it is announcing.
    raise warning 'contractor-welcome enqueue failed: %', sqlerrm;
  end;
  return new;
end;
$function$;

revoke all on function public.send_contractor_welcome() from public, anon, authenticated;
grant execute on function public.send_contractor_welcome() to postgres, service_role;
