-- Remove the two-month campaign window from the contractor welcome email.
--
-- send_contractor_welcome() was written as a limited-run campaign and no-opped
-- from 2026-09-12 06:00 UTC. The welcome email now also carries the contractor
-- guide (/contractor-guide), which every new contractor is meant to receive, so
-- the expiry is gone and this fires for every contractors row from here on.
--
-- Applied live via Supabase MCP on 2026-07-30; recorded here for version control.

CREATE OR REPLACE FUNCTION public.send_contractor_welcome()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_url  text := coalesce(current_setting('app.supabase_url', true),
                          'https://kvypmjxbbaaknvddwwai.supabase.co')
                 || '/functions/v1/contractor-welcome';
  -- Anon key: public by design (it is shipped in the browser bundle too).
  v_anon text := 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imt2eXBtanhiYmFha252ZGR3d2FpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk3MTM3MTIsImV4cCI6MjA5NTI4OTcxMn0.5VMp6SerPxUUnnjr-43N29pHbh6kpgJc71USvL_Ooj4';
begin
  -- No campaign window: every new contractor gets the welcome + guide email.
  begin
    perform net.http_post(
      url     := v_url,
      headers := jsonb_build_object(
        'Content-Type',  'application/json',
        'Authorization', 'Bearer ' || v_anon
      ),
      body    := jsonb_build_object('id', new.id)
    );
  exception when others then
    -- A mail hiccup must never block a contractor signup.
    raise warning 'contractor-welcome enqueue failed: %', sqlerrm;
  end;
  return new;
end;
$function$;
