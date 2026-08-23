-- notify_user stops emailing a second time, and send-reminder loses its last caller.
--
-- Applied LIVE via Supabase MCP on 2026-08-23. Committed here for version
-- control only — installers do not run migrations.
--
-- notify_user did two things. It called _notify(), which writes the
-- public.notifications row — and the "send-notification-email" Database Webhook
-- on that insert emails the title and body. Then it ALSO posted the same title
-- and body to the `send-reminder` edge function, which emailed a second,
-- thinner copy from the same address. Every one of the thirteen notification
-- types routed through this helper sent two emails per event.
--
-- EMAIL_HANDLED_ELSEWHERE could never have caught this. That set suppresses the
-- webhook's email when a richer function owns the type — but here the webhook's
-- copy was the better of the two, and the duplicate emitter was inside this
-- function body, not in the type list. None of the thirteen types was in the
-- set, and adding them would have been the wrong fix.
--
-- The direct post also bypassed outbound_paused(). The webhook honours the site
-- pause through its trigger WHEN clause; a raw net.http_post in a function body
-- answers to nothing. So while the site sat in 'waitlist', the only mail going
-- out for these types was the thin duplicate — going out precisely when the
-- pause said nothing should.
--
-- What the post carried that the row does not: a per-call CTA. The notifications
-- table has no column for one. Eleven of the thirteen pointed at the same
-- dashboard that send-notification's dashboardFor(role) already resolves — and
-- resolves better, since it is derived from the recipient's role rather than
-- passed by the caller. The two that did not, `recurring_due` and `seasonal`,
-- pointed at /new-request; they are re-booking nudges, so a dashboard with
-- nothing on it would put a click between the nudge and the thing it is nudging
-- you to do. Those two are preserved in CTA_OVERRIDE in send-notification v16.
--
-- The unused p_cta_url / p_cta_label parameters are DELIBERATELY KEPT. Six
-- functions call notify_user; changing the signature would mean dropping the old
-- one first, and PostgREST hits overload ambiguity if both exist. They are inert.
--
-- search_path is pinned to public, extensions, pg_temp while we are here —
-- SECURITY DEFINER with a bare `public` breaks pgcrypto, which lives in
-- extensions. That exact bug once killed every signup for a month.
--
-- After this, `send-reminder` has zero callers anywhere: pg_proc.prosrc across
-- public/extensions/cron, every non-internal trigger, cron.job, and the repo.
-- It is deployed as a 410 tombstone with verify_jwt=true.

CREATE OR REPLACE FUNCTION public.notify_user(
  p_user uuid,
  p_type text,
  p_title text,
  p_body text,
  p_cta_url text DEFAULT 'https://freddyfixit.ca/client-dashboard'::text,
  p_cta_label text DEFAULT 'Book now'::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
BEGIN
  -- Writes the bell row. The send-notification-email webhook on this insert is
  -- the ONLY thing that emails these types. Do not add a second send here.
  PERFORM public._notify(p_user, p_type, p_title, p_body, NULL);
END;
$function$;

-- CREATE OR REPLACE preserves the ACL, but assert it rather than assume:
-- notify_user is an internal helper and must stay {postgres, service_role}.
-- Revoking from anon alone is a no-op — the default grant is to PUBLIC.
revoke all on function public.notify_user(uuid, text, text, text, text, text) from public;
revoke all on function public.notify_user(uuid, text, text, text, text, text) from anon;
revoke all on function public.notify_user(uuid, text, text, text, text, text) from authenticated;
grant execute on function public.notify_user(uuid, text, text, text, text, text) to postgres, service_role;
