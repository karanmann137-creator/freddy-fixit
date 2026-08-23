-- Clients get a welcome email. Until now they got nothing.
--
-- Applied LIVE via Supabase MCP on 2026-08-23. Committed here for version
-- control only — installers do not run migrations.
--
-- Contractors have had `contractor-welcome` since launch. A client signed up and
-- the only thing that ever landed in their inbox was a GoTrue confirmation from a
-- sender they don't recognise -- which is a spam folder waiting to happen, and it
-- is exactly the failure that stranded three accounts in Aug 2026.
--
-- Three deliberate choices:
--
--   NOT gated on outbound_paused(). Same reasoning as send_contractor_welcome:
--   the pause exists so we stop soliciting people, not so we stop answering
--   somebody who just handed us their email address. The email's copy is
--   mode-aware instead -- in 'waitlist' it says plainly that we are not taking
--   jobs yet, rather than promising estimates that cannot arrive.
--
--   Fires on public.profiles, not auth.users. The role lives on profiles, and a
--   WHEN clause is the cheapest possible filter -- a contractor signup never even
--   enqueues a request. It also means ensure_profile()'s orphan repair sends the
--   welcome too, which is the one case where somebody most needs to hear from us.
--
--   Wrapped in its own exception block. This runs INSIDE the signup transaction.
--   An unguarded raise here would roll back the profiles insert and leave an auth
--   user with no profile -- the precise shape of the bug that killed every signup
--   for a month. A welcome email is never worth an account.
--
-- No anon JWT in the body: client-welcome is verify_jwt=false, so the bearer buys
-- nothing, and pg_proc.prosrc is publicly readable.
--
-- MONEY: touches nothing. No payment path, no payout guard, no fee.

CREATE OR REPLACE FUNCTION public.send_client_welcome()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
declare
  v_url text := coalesce(current_setting('app.supabase_url', true),
                         'https://kvypmjxbbaaknvddwwai.supabase.co')
                || '/functions/v1/client-welcome';
begin
  begin
    perform net.http_post(
      url     := v_url,
      headers := jsonb_build_object('Content-Type', 'application/json'),
      body    := jsonb_build_object('id', new.id)
    );
  exception when others then
    -- A mail hiccup must never cost somebody their account.
    raise warning 'client-welcome enqueue failed: %', sqlerrm;
  end;
  return new;
end;
$function$;

revoke all on function public.send_client_welcome() from public, anon, authenticated;
grant execute on function public.send_client_welcome() to postgres, service_role;

drop trigger if exists client_welcome_email on public.profiles;
create trigger client_welcome_email
  after insert on public.profiles
  for each row
  when (new.role = 'client')
  execute function public.send_client_welcome();
