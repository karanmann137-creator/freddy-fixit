-- Pause ALL outbound email while the site is paused -- on ONE switch.
--
-- The owner asked to "pause all emails and outgoing functions until the pause
-- on the site is lifted". The load-bearing word is *until*: a second, separate
-- email switch would have to be remembered and flipped back by hand, and the
-- day it isn't, the site reopens silently and nobody hears from us. So this
-- does not own a flag. public.outbound_paused() READS public.platform_mode(),
-- which the admin Platform tab already sets. set_platform_mode('open') turns
-- every emitter below back on by itself, with no further action.
--
-- Deliberately NOT gated:
--   * enqueue_admin_alert / platform-health-check / the health_alert
--     notification type -- these are the owner's own alerts and are the only
--     warning system he has while the site is dark. Owner chose to keep them.
--   * payment receipts and the money sweeps (reconcile-payouts,
--     auto-confirm-stale-jobs, release-unconfirmed-visits). Owner chose to keep
--     them running: a payout that is owed is owed whether or not we are open.
--   * Supabase's own GoTrue mailer -- signup confirmation and password reset.
--     Silencing that reproduces the Aug 2026 incident exactly: users sign up,
--     never get the confirmation, and are locked out with no error visible to
--     anyone. Auth mail must keep flowing even with the front door shut.
--
-- Defence in depth: the cron stand-down in set_platform_mode is belt-and-braces.
-- The real guarantee is outbound_paused() INSIDE each emitter, so re-arming a
-- cron job by hand still cannot send mail while the site is paused.

-- ---------------------------------------------------------------------------
-- 1. The switch
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.outbound_paused()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$ select public.platform_mode() in ('paused', 'waitlist') $function$;

COMMENT ON FUNCTION public.outbound_paused() IS
  'True while the site is paused or waitlisted. Single source of truth for "should we be emailing anyone right now". Lifting the site pause lifts this.';

GRANT EXECUTE ON FUNCTION public.outbound_paused() TO anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 2. Webhook triggers
--
-- Supabase Database Webhooks are ordinary triggers running
-- supabase_functions.http_request(...). Recreating them with a WHEN clause is
-- self-re-arming; ALTER TABLE ... DISABLE TRIGGER would need a manual,
-- forgettable reversal.
--
-- The health_alert exemption is keyed on NEW.type, not on a profiles lookup for
-- admin recipients, because a trigger WHEN clause may call a function but may
-- NOT contain a subquery.
--
-- The notification ROW is still inserted either way -- only the email fan-out is
-- suppressed. The in-app bell, unread counts and my_conversations() are
-- untouched by the pause.
--
-- NOTE: the trigger name "notify-admin-client " has a TRAILING SPACE and that is
-- load-bearing. Reproduce it exactly.
-- ---------------------------------------------------------------------------

DROP TRIGGER IF EXISTS "send-notification-email" ON public.notifications;
CREATE TRIGGER "send-notification-email"
  AFTER INSERT ON public.notifications
  FOR EACH ROW
  WHEN (NEW.type = 'health_alert' OR NOT public.outbound_paused())
  EXECUTE FUNCTION supabase_functions.http_request(
    'https://kvypmjxbbaaknvddwwai.supabase.co/functions/v1/send-notification',
    'POST', '{"Content-type":"application/json"}', '{}', '5000');

DROP TRIGGER IF EXISTS "notify-admin-client " ON public.client_requests;
CREATE TRIGGER "notify-admin-client "
  AFTER INSERT ON public.client_requests
  FOR EACH ROW
  WHEN (NOT public.outbound_paused())
  EXECUTE FUNCTION supabase_functions.http_request(
    'https://kvypmjxbbaaknvddwwai.supabase.co/functions/v1/notify-admin',
    'POST', '{"Content-type":"application/json"}', '{}', '5000');

-- ---------------------------------------------------------------------------
-- 3. Gated emitters
--
-- Each body below is byte-identical to its previous version apart from the
-- early return. Full bodies are carried so this file is replayable.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.trg_dispatch_new_request()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
declare
  v_url  text := coalesce(current_setting('app.supabase_url', true),
                          'https://kvypmjxbbaaknvddwwai.supabase.co')
                 || '/functions/v1/dispatch-job';
  v_anon text := 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imt2eXBtanhiYmFha252ZGR3d2FpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk3MTM3MTIsImV4cCI6MjA5NTI4OTcxMn0.5VMp6SerPxUUnnjr-43N29pHbh6kpgJc71USvL_Ooj4';
begin
  if new.waitlisted then return new; end if;
  -- Site paused: the request is still recorded, contractors just aren't paged.
  if public.outbound_paused() then return new; end if;
  begin
    perform net.http_post(
      url     := v_url,
      headers := jsonb_build_object('Content-Type', 'application/json',
                                    'Authorization', 'Bearer ' || v_anon),
      body    := jsonb_build_object('request_id', new.id));
  exception when others then
    raise warning 'dispatch-job enqueue failed: %', sqlerrm;
  end;
  return new;
end;
$function$;

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
  v_anon text := 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imt2eXBtanhiYmFha252ZGR3d2FpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk3MTM3MTIsImV4cCI6MjA5NTI4OTcxMn0.5VMp6SerPxUUnnjr-43N29pHbh6kpgJc71USvL_Ooj4';
begin
  -- No campaign window: every new contractor gets the welcome + guide email.
  if public.outbound_paused() then return new; end if;
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
    raise warning 'contractor-welcome enqueue failed: %', sqlerrm;
  end;
  return new;
end;
$function$;

CREATE OR REPLACE FUNCTION public.kick_newsletter(p_audience text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if public.outbound_paused() then return; end if;
  perform net.http_post(
    url := 'https://kvypmjxbbaaknvddwwai.supabase.co/functions/v1/newsletter-send',
    headers := jsonb_build_object(
      'Content-Type','application/json',
      'Authorization','Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imt2eXBtanhiYmFha252ZGR3d2FpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk3MTM3MTIsImV4cCI6MjA5NTI4OTcxMn0.5VMp6SerPxUUnnjr-43N29pHbh6kpgJc71USvL_Ooj4','x-ff-internal',coalesce(public.issue_internal_token('edge-internal'),'')),
    body := jsonb_build_object('audience', p_audience),
    timeout_milliseconds := 120000
  );
exception when others then
  null; -- never let a mail hiccup break cron
end;
$function$;

CREATE OR REPLACE FUNCTION public.kick_visit_reminders()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions', 'net', 'pg_temp'
AS $function$
declare
  v_url  text := coalesce(current_setting('app.supabase_url', true),
                          'https://kvypmjxbbaaknvddwwai.supabase.co')
                 || '/functions/v1/visit-reminder';
  v_anon text := 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imt2eXBtanhiYmFha252ZGR3d2FpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk3MTM3MTIsImV4cCI6MjA5NTI4OTcxMn0.5VMp6SerPxUUnnjr-43N29pHbh6kpgJc71USvL_Ooj4';
begin
  if public.outbound_paused() then return; end if;
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

-- notify_new_message: the gate sits AFTER the recipient is resolved but BEFORE
-- the message_email_log upsert, so the 15-minute throttle is not burned on a
-- message nobody was told about -- the first message after the site reopens
-- still emails. The bid-stage branch above it throttles on the notifications
-- table and is suppressed by the send-notification-email trigger instead.
CREATE OR REPLACE FUNCTION public.notify_new_message()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
declare
  v_client     uuid;
  v_contractor uuid;
  v_recipient  uuid;
  v_did        boolean;
  v_service    text;
  v_url  text := 'https://kvypmjxbbaaknvddwwai.supabase.co/functions/v1/notify-message';
  v_anon text := 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imt2eXBtanhiYmFha252ZGR3d2FpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk3MTM3MTIsImV4cCI6MjA5NTI4OTcxMn0.5VMp6SerPxUUnnjr-43N29pHbh6kpgJc71USvL_Ooj4';
begin
  -- The chat guard stopped this one. Nothing was delivered; say nothing.
  if NEW.blocked then return NEW; end if;

  -- ---- bid-stage thread (no job exists yet) ----
  if NEW.request_id is not null then
    select r.user_id, r.service_needed into v_client, v_service
      from public.client_requests r where r.id = NEW.request_id;
    if v_client is null then return NEW; end if;

    if NEW.sender_id = v_client then v_recipient := NEW.thread_contractor_id;
    elsif NEW.sender_id = NEW.thread_contractor_id then v_recipient := v_client;
    else return NEW;
    end if;
    if v_recipient is null then return NEW; end if;

    -- Throttle: one bell per recipient per 15 minutes, so a fast back-and-forth
    -- doesn't turn into a dozen emails.
    if exists (
      select 1 from public.notifications n
       where n.user_id = v_recipient
         and n.type = 'bid_message'
         and n.created_at > now() - interval '15 minutes'
    ) then
      return NEW;
    end if;

    if NEW.sender_id = v_client then
      perform public._notify(v_recipient, 'bid_message', 'A client messaged you about your bid',
        'A client has a question about the '||coalesce(v_service,'job')||' you bid on. Reply from your dashboard.', null);
    else
      perform public._notify(v_recipient, 'bid_message', 'A pro replied to your question',
        'One of the pros who bid on your '||coalesce(v_service,'request')||' has replied. Open your dashboard to read it.', null);
    end if;
    return NEW;
  end if;

  -- ---- job thread (unchanged) ----
  select client_id, contractor_id into v_client, v_contractor
    from public.jobs where id = NEW.job_id;
  if v_client is null and v_contractor is null then return NEW; end if;

  if NEW.sender_id = v_client then v_recipient := v_contractor;
  elsif NEW.sender_id = v_contractor then v_recipient := v_client;
  else v_recipient := null;
  end if;
  if v_recipient is null then return NEW; end if;

  -- Site paused: message is delivered and unread-counted as normal, we just
  -- don't email about it. Return before the log write so the throttle is intact.
  if public.outbound_paused() then return NEW; end if;

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
      headers := jsonb_build_object('Content-Type','application/json','Authorization','Bearer '||v_anon,'x-ff-internal',coalesce(public.issue_internal_token('edge-internal'),'')),
      body    := jsonb_build_object('message_id', NEW.id, 'recipient_id', v_recipient)
    );
  exception when others then
    raise warning 'notify-message enqueue failed: %', sqlerrm;
  end;
  return NEW;
end; $function$;

-- run_reminders: the gate is the FIRST statement, so reminder_log and
-- jobs.visit_reminder_sent_at are never stamped. Nothing is permanently
-- skipped -- the nudges simply resume when the site reopens.
-- (This function had no source in the repo before now; the full body below is
-- what is live, not a reconstruction.)
CREATE OR REPLACE FUNCTION public.run_reminders()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  r record; n int := 0;
  v_season text; v_title text; v_body text; v_kind text;
  v_month int := extract(month from now())::int;
  v_year int := extract(year from now())::int;
BEGIN
  -- Site paused: every step below ends in an email to a client or a
  -- contractor. Returning here also leaves reminder_log and
  -- visit_reminder_sent_at untouched, so nothing is permanently skipped --
  -- these nudges simply resume when set_platform_mode('open') runs.
  IF public.outbound_paused() THEN RETURN 0; END IF;

  -- 0) Auto-generate due recurring occurrences (reserved for the plan's pro).
  BEGIN
    n := n + public.generate_recurring_occurrences();
  EXCEPTION WHEN OTHERS THEN RAISE WARNING 'generate_recurring_occurrences failed: %', SQLERRM;
  END;

  -- 1) Recurring requests that are due again since the client's last completed job (soft nudge)
  FOR r IN
    SELECT cr.id AS req_id, cr.user_id, cr.service_needed, cr.recurring_frequency,
           max(j.client_confirmed_at) AS last_done
    FROM client_requests cr
    JOIN jobs j ON j.request_id = cr.id AND j.status = 'completed'
    WHERE cr.recurring = true AND coalesce(cr.recurring_plan_status,'active') = 'active'
    GROUP BY cr.id, cr.user_id, cr.service_needed, cr.recurring_frequency
    HAVING max(j.client_confirmed_at) IS NOT NULL
       AND now() >= max(j.client_confirmed_at) + public.recurrence_interval(cr.recurring_frequency)
  LOOP
    v_kind := 'recurring:'||r.req_id||':'||to_char(now(),'YYYY-MM');
    IF NOT EXISTS (SELECT 1 FROM reminder_log WHERE user_id=r.user_id AND kind=v_kind) THEN
      PERFORM public.notify_user(r.user_id, 'recurring_due',
        'Time for your '||coalesce(r.service_needed,'service')||' again',
        'It''s been a while since your last '||coalesce(r.service_needed,'service')||
        '. Want to book it again? Your saved details make it a 30-second request.',
        'https://freddyfixit.ca/new-request', 'Book again');
      INSERT INTO reminder_log(user_id, kind) VALUES (r.user_id, v_kind) ON CONFLICT DO NOTHING;
      n := n + 1;
    END IF;
  END LOOP;

  -- 2) Seasonal nudge (one per engaged client per season)
  v_season := CASE
    WHEN v_month IN (9,10) THEN 'fall'
    WHEN v_month IN (11,12,1,2) THEN 'winter'
    WHEN v_month IN (3,4) THEN 'spring'
    ELSE 'summer' END;
  v_title := CASE v_season
    WHEN 'fall'   THEN 'Get ahead of Calgary winter'
    WHEN 'winter' THEN 'Calgary winter is here'
    WHEN 'spring' THEN 'Spring home tune-up time'
    ELSE 'Summer home projects season' END;
  v_body := CASE v_season
    WHEN 'fall'   THEN 'Book a furnace check, gutter clean, or weatherproofing before the snow flies. Calgary pros are booking up fast.'
    WHEN 'winter' THEN 'Line up snow removal and keep your furnace running warm. Our vetted Calgary pros are ready.'
    WHEN 'spring' THEN 'Post-winter roof & gutter checks, hail-season prep, and yard cleanups — get on the list early.'
    ELSE 'Long days are perfect for painting, landscaping, AC service and outdoor fixes. Get a free quote today.' END;
  v_kind := 'seasonal:'||v_year||'-'||v_season;

  FOR r IN
    SELECT DISTINCT cr.user_id
    FROM client_requests cr
    JOIN jobs j ON j.request_id = cr.id AND j.status = 'completed'
  LOOP
    IF NOT EXISTS (SELECT 1 FROM reminder_log WHERE user_id=r.user_id AND kind=v_kind) THEN
      PERFORM public.notify_user(r.user_id, 'seasonal', v_title, v_body,
        'https://freddyfixit.ca/new-request', 'Get a free quote');
      INSERT INTO reminder_log(user_id, kind) VALUES (r.user_id, v_kind) ON CONFLICT DO NOTHING;
      n := n + 1;
    END IF;
  END LOOP;

  -- 3) Day-before visit reminder: ask the client to confirm or change the time.
  FOR r IN
    SELECT j.id AS job_id, j.client_id, j.scheduled_at,
           cr.service_needed
    FROM jobs j
    JOIN client_requests cr ON cr.id = j.request_id
    WHERE j.status = 'scheduled'
      AND j.scheduled_at IS NOT NULL
      AND j.scheduled_at > now()
      AND j.scheduled_at <= now() + interval '28 hours'
      AND j.visit_reminder_sent_at IS NULL
      AND j.client_confirmed_visit_at IS NULL
  LOOP
    PERFORM public.notify_user(r.client_id, 'visit_tomorrow',
      'Your '||coalesce(r.service_needed,'service')||' is coming up',
      'Your pro is booked for '||coalesce(public.ff_local_ts(r.scheduled_at), 'the booked time')||
      '. Tap to confirm the visit or pick a different time — the day before is your last easy change.',
      'https://freddyfixit.ca/client-dashboard', 'Confirm or change');
    UPDATE jobs SET visit_reminder_sent_at = now() WHERE id = r.job_id;
    n := n + 1;
  END LOOP;

  -- 4) Estimates sitting unactioned: client has bids on an open request and the
  --    newest bid is 48h+ old. Re-arms per bid count (a new bid restarts the clock).
  FOR r IN
    SELECT cr.id AS req_id, cr.user_id, cr.service_needed,
           count(b.id) AS bid_count, max(b.created_at) AS newest_bid
    FROM client_requests cr
    JOIN bids b ON b.request_id = cr.id
    WHERE cr.status = 'pending'
      AND cr.user_id IS NOT NULL
      AND cr.assigned_contractor_id IS NULL
    GROUP BY cr.id, cr.user_id, cr.service_needed
    HAVING max(b.created_at) < now() - interval '48 hours'
  LOOP
    v_kind := 'bids_waiting:'||r.req_id||':'||r.bid_count;
    IF NOT EXISTS (SELECT 1 FROM reminder_log WHERE user_id=r.user_id AND kind=v_kind) THEN
      PERFORM public.notify_user(r.user_id, 'bids_waiting',
        r.bid_count||' estimate'||CASE WHEN r.bid_count=1 THEN '' ELSE 's' END||' waiting for your '||coalesce(r.service_needed,'request'),
        'Vetted Calgary pros have sent you '||CASE WHEN r.bid_count=1 THEN 'an estimate' ELSE r.bid_count||' estimates' END||
        ' for your '||coalesce(r.service_needed,'request')||'. Take a look and pick the one that fits — pros book up fast this time of year.',
        'https://freddyfixit.ca/client-dashboard', 'Review estimates');
      INSERT INTO reminder_log(user_id, kind) VALUES (r.user_id, v_kind) ON CONFLICT DO NOTHING;
      n := n + 1;
    END IF;
  END LOOP;

  -- 5) Schedule/price proposal awaiting the client's approval for 48h+.
  --    Skips jobs mid-reschedule (ball is in the contractor's court) and jobs
  --    with a pending price change (step 6 handles those).
  FOR r IN
    SELECT j.id AS job_id, j.client_id, j.schedule_proposed_at, cr.service_needed
    FROM jobs j
    JOIN client_requests cr ON cr.id = j.request_id
    WHERE j.status = 'assigned'
      AND j.schedule_proposed_at IS NOT NULL
      AND j.schedule_proposed_at < now() - interval '48 hours'
      AND j.client_approved_at IS NULL
      AND j.price_change_pending IS NULL
      AND NOT (j.client_rescheduled_at IS NOT NULL AND j.reschedule_accepted_at IS NULL)
  LOOP
    v_kind := 'proposal:'||r.job_id||':'||to_char(r.schedule_proposed_at,'YYYYMMDDHH24MI');
    IF NOT EXISTS (SELECT 1 FROM reminder_log WHERE user_id=r.client_id AND kind=v_kind) THEN
      PERFORM public.notify_user(r.client_id, 'proposal_waiting',
        'Your pro''s estimate is waiting on you',
        'Your pro proposed a time and price for your '||coalesce(r.service_needed,'job')||
        ' a couple of days ago. Approve it to lock in your spot, or message them if something doesn''t work.',
        'https://freddyfixit.ca/client-dashboard', 'Review & approve');
      INSERT INTO reminder_log(user_id, kind) VALUES (r.client_id, v_kind) ON CONFLICT DO NOTHING;
      n := n + 1;
    END IF;
  END LOOP;

  -- 6) Price change pending the client's approval for 48h+.
  FOR r IN
    SELECT j.id AS job_id, j.client_id, j.price_change_proposed_at, cr.service_needed
    FROM jobs j
    JOIN client_requests cr ON cr.id = j.request_id
    WHERE j.price_change_pending IS NOT NULL
      AND j.price_change_proposed_at IS NOT NULL
      AND j.price_change_proposed_at < now() - interval '48 hours'
      AND j.payment_status IS DISTINCT FROM 'released'
  LOOP
    v_kind := 'pricechange:'||r.job_id||':'||to_char(r.price_change_proposed_at,'YYYYMMDDHH24MI');
    IF NOT EXISTS (SELECT 1 FROM reminder_log WHERE user_id=r.client_id AND kind=v_kind) THEN
      PERFORM public.notify_user(r.client_id, 'price_change_waiting',
        'A price update needs your OK',
        'Your pro proposed an updated price for your '||coalesce(r.service_needed,'job')||
        '. Nothing is charged until you approve it — review the change or decline it from your dashboard.',
        'https://freddyfixit.ca/client-dashboard', 'Review price change');
      INSERT INTO reminder_log(user_id, kind) VALUES (r.client_id, v_kind) ON CONFLICT DO NOTHING;
      n := n + 1;
    END IF;
  END LOOP;

  -- 7) Contractor owes an estimate: assigned 48h+ ago, nothing proposed yet
  --    (and no walkthrough in flight). Nudged once per job.
  FOR r IN
    SELECT j.id AS job_id, j.contractor_id, cr.service_needed
    FROM jobs j
    JOIN client_requests cr ON cr.id = j.request_id
    WHERE j.status = 'assigned'
      AND j.schedule_proposed_at IS NULL
      AND j.created_at < now() - interval '48 hours'
      AND (j.walkthrough_proposed_at IS NULL OR j.walkthrough_done_at IS NOT NULL)
      AND j.contractor_id IS NOT NULL
  LOOP
    v_kind := 'estimate_owed:'||r.job_id;
    IF NOT EXISTS (SELECT 1 FROM reminder_log WHERE user_id=r.contractor_id AND kind=v_kind) THEN
      PERFORM public.notify_user(r.contractor_id, 'estimate_owed',
        'A client is waiting on your estimate',
        'You were assigned a '||coalesce(r.service_needed,'job')||' two days ago and haven''t sent a time and price yet. '||
        'Clients book whoever responds first — send your estimate now to keep this one.',
        'https://freddyfixit.ca/contractor-dashboard', 'Send estimate');
      INSERT INTO reminder_log(user_id, kind) VALUES (r.contractor_id, v_kind) ON CONFLICT DO NOTHING;
      n := n + 1;
    END IF;
  END LOOP;

  RETURN n;
END; $function$;

REVOKE ALL ON FUNCTION public.run_reminders() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.run_reminders() TO postgres, service_role;

-- ---------------------------------------------------------------------------
-- 4. set_platform_mode: close the cron-list gap
--
-- PRE-EXISTING BUG. The quiet-list named only three jobs and omitted
-- newsletter-contractor, daily-reminders and visit-reminders. Consequence:
-- newsletter-contractor stayed armed for the WHOLE pause (site paused
-- 2026-08-15), firing every Tuesday 16:00 UTC at 25 subscribers with 8 issues
-- still queued. Now six jobs, and cron.alter_job(active := not quiet) means
-- set_platform_mode('open') re-arms all six.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.set_platform_mode(p_mode text, p_notice jsonb DEFAULT NULL::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
declare
  quiet boolean := (p_mode in ('paused', 'waitlist'));
  j     record;
begin
  if not public.is_admin() then
    raise exception 'admin only';
  end if;
  if p_mode not in ('open', 'paused', 'waitlist') then
    raise exception 'mode must be open, waitlist or paused, got %', p_mode;
  end if;

  insert into public.platform_settings (key, value, updated_at, updated_by)
  values ('mode', to_jsonb(p_mode), now(), auth.uid())
  on conflict (key) do update set value = excluded.value, updated_at = now(), updated_by = excluded.updated_by;

  if p_notice is not null then
    insert into public.platform_settings (key, value, updated_at, updated_by)
    values ('pause_notice', p_notice, now(), auth.uid())
    on conflict (key) do update set value = excluded.value, updated_at = now(), updated_by = excluded.updated_by;
  end if;

  begin
    for j in select jobid, jobname from cron.job
             where jobname in ('refire-stale-requests',
                               'escalate-unbid-requests',
                               'newsletter-client',
                               'newsletter-contractor',
                               'daily-reminders',
                               'visit-reminders')
    loop
      perform cron.alter_job(j.jobid, active := not quiet);
    end loop;
  exception when others then
    raise notice 'cron toggle skipped: %', sqlerrm;
  end;

  return public.platform_status();
end;
$function$;

-- One-off stand-down for the three jobs the old list missed. set_platform_mode
-- is is_admin()-gated and therefore not callable from an MCP SQL session, so
-- this is applied directly. Harmless on replay.
DO $$
DECLARE j record;
BEGIN
  IF public.outbound_paused() THEN
    FOR j IN SELECT jobid, jobname FROM cron.job
             WHERE jobname IN ('newsletter-contractor','daily-reminders','visit-reminders')
               AND active
    LOOP
      PERFORM cron.alter_job(j.jobid, active := false);
    END LOOP;
  END IF;
END $$;
