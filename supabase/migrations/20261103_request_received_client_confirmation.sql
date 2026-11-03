-- Applied live via Supabase MCP on 2026-11-03. Committed for version control only.
--
-- Tell the CLIENT their request landed, and what happens next.
--
-- Until now every one of the seven AFTER INSERT triggers on client_requests
-- notified somebody OTHER than the person who filled in the form: the admin,
-- the matched pros, a reserved pro. The client got silence. Verified by reading
-- the notification history for a live request posted 2026-11-03 — the client's
-- notification list was empty, and no email of any kind had ever been sent to a
-- client on posting. From their side a request vanished into nothing, which is
-- also the window where they'd most plausibly add the photo that makes the
-- estimates accurate.
--
-- Deliberately a plain `_notify` row and NOT a new edge function: the
-- `send-notification-email` webhook already turns a bell into an email, is
-- already gated on `outbound_paused()` in its WHEN clause, and already resolves
-- the recipient from `profiles` server-side. `request_received` has exactly ONE
-- emitter — this trigger — so it must NOT go in `EMAIL_HANDLED_ELSEWHERE`;
-- that generic email IS the confirmation email. (This is the approach the
-- retired `notify-client` function's own header prescribes.)
--
-- Body is ONE paragraph of plain prose on purpose. send-notification renders it
-- inside a single <p> with no newline handling, and the same string is the
-- in-app bell text, where any HTML would show as literal tags.
--
-- Proven with a rolled-back probe: a normal post notifies once; a waitlisted
-- row, a recurring occurrence and a request with no account behind it each
-- notify zero times and raise nothing.
create or replace function public.trg_notify_request_received()
returns trigger
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
begin
  -- A welcome note is never worth the row it is announcing. Same discipline as
  -- the signup welcome email: this runs inside the client's own INSERT, so any
  -- failure here must not cost them the request.
  begin
    -- user_id is null on a request with no account behind it, so there is
    -- nobody to notify. recurring_parent_id marks an auto-generated occurrence
    -- of a plan the client already set up — they did not just post it, and
    -- "here's what happens next" would be wrong. waitlisted rows are NOT
    -- dispatched to pros, so promising estimates would be a lie; the pause
    -- would suppress the email anyway, but the bell would still say it.
    if new.user_id is not null
       and new.recurring_parent_id is null
       and coalesce(new.waitlisted, false) = false then
      perform public._notify(
        new.user_id,
        'request_received',
        'We''ve got your request — here''s what happens next',
        'Your request for ' || coalesce(nullif(trim(new.service_needed), ''), 'help around the home')
          || ' is in, and it has gone out to the Calgary pros who do this work. They''ll review it and send you estimates — you''ll get an email for each one with the price and a one-tap link to accept it, so there''s nothing you need to watch for. You choose who gets the job: nothing is charged until you pick a pro and sign the service agreement they send you, and your payment is held securely until the work is done. One thing that speeds this up a lot — add a photo of the job on your dashboard if you haven''t already. Pros quote faster and far more accurately when they can see what they''re walking into.',
        null
      );
    end if;
  exception when others then
    null;  -- never let the confirmation take the request down with it
  end;
  return new;
end;
$$;

revoke all on function public.trg_notify_request_received() from public;

drop trigger if exists trg_notify_request_received on public.client_requests;
create trigger trg_notify_request_received
  after insert on public.client_requests
  for each row execute function public.trg_notify_request_received();
