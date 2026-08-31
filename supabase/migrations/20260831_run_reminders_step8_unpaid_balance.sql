-- run_reminders() step 8: nudge a client whose work is DONE and whose balance is
-- still outstanding. This is the "ghost client" case health check 5
-- (no_unpaid_balances) already detects -- but that check only tells the ADMIN, so
-- the one person who can actually fix it was never told anything. The contractor
-- is unpaid indefinitely and nothing in the product asks.
--
-- MONEY: touches none of the four payout guards. It writes a notification and
-- nothing else -- no charge, no transfer, no status change, no funded_amount.
-- confirm_job_completion(), auto_confirm_stale_jobs(), release-payment's 409 and
-- reconcile-payouts' fully_funded filter are all unchanged. It cannot make an
-- under-funded job payable; it only asks the client to fund it.
--
-- Also fixes this function's search_path, which was missing `extensions`.
--
-- APPLIED LIVE via Supabase MCP on 2026-08-31. This file is version control only.
CREATE OR REPLACE FUNCTION public.run_reminders()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions', 'pg_temp'
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

  -- 8) Balance owed after the work is done -- the "ghost client".
  --    Deposit is held, the pro has finished and photographed the job, and the
  --    client never came back to pay the 60%. Every payout guard correctly
  --    refuses to release, so the contractor waits forever and only the admin
  --    ever hears about it (health check 5). This is the client-facing half.
  --
  --    Predicate mirrors the dashboard's awaitingBalance(): held, not a
  --    milestone job, real outstanding amount. Milestone and prepay jobs are
  --    excluded because their money moves per stage / per pool and neither has
  --    a whole-job balance to pay. A pending price change is excluded because
  --    the amount is mid-negotiation -- naming a figure that is about to change
  --    would be worse than saying nothing, and step 6 already nudges those.
  --
  --    Escalates 24h -> 3d -> 7d and then STOPS. The stage is part of the
  --    dedupe key, so paying (or the job leaving 'held') ends it early, and a
  --    client who never pays gets three emails, not one a day forever.
  FOR r IN
    SELECT j.id AS job_id, j.client_id, cr.service_needed,
           round(j.total_charged - coalesce(j.funded_amount,0), 2) AS owed,
           CASE
             WHEN now() >= j.contractor_completed_at + interval '7 days'  THEN 3
             WHEN now() >= j.contractor_completed_at + interval '3 days'  THEN 2
             WHEN now() >= j.contractor_completed_at + interval '24 hours' THEN 1
             ELSE 0 END AS stage
    FROM jobs j
    JOIN client_requests cr ON cr.id = j.request_id
    WHERE j.payment_status = 'held'
      AND j.status = 'pending_confirmation'
      AND coalesce(j.is_milestone,false) = false
      AND j.prepayment_id IS NULL
      AND j.price_change_pending IS NULL
      AND j.client_id IS NOT NULL
      AND j.contractor_completed_at IS NOT NULL
      AND j.total_charged IS NOT NULL
      AND j.total_charged - coalesce(j.funded_amount,0) > 0.005
      AND now() >= j.contractor_completed_at + interval '24 hours'
  LOOP
    v_kind := 'balance_owed:'||r.job_id||':'||r.stage;
    IF NOT EXISTS (SELECT 1 FROM reminder_log WHERE user_id=r.client_id AND kind=v_kind) THEN
      PERFORM public.notify_user(r.client_id, 'balance_owed',
        CASE r.stage
          WHEN 1 THEN 'Your '||coalesce(r.service_needed,'job')||' is done — one step left'
          WHEN 2 THEN 'Your pro is still waiting to be paid'
          ELSE 'Final reminder: a balance is outstanding'
        END,
        'Your pro has finished your '||coalesce(r.service_needed,'job')||' and uploaded their photos. '||
        'There''s $'||to_char(r.owed,'FM999999990.00')||' left on the job — you paid a deposit up front, and this is the rest. '||
        'Pay the balance from your dashboard, then confirm the work so your pro gets paid.',
        'https://freddyfixit.ca/client-dashboard', 'Pay the balance');
      INSERT INTO reminder_log(user_id, kind) VALUES (r.client_id, v_kind) ON CONFLICT DO NOTHING;
      n := n + 1;
    END IF;
  END LOOP;

  RETURN n;
END; $function$;
