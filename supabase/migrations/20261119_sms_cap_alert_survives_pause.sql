-- The SMS volume alert must reach the owner even while outbound email is paused.
--
-- WHY THIS EXISTS. `20261119_sms_consent_and_caps.sql` added `sms_cap_alert`, the
-- notification type that carries the volume warning and the paste-back prompt the owner
-- asked for. Its header comment claimed the alert survives a pause, on the strength of the
-- CLAUDE.md rule that `enqueue_admin_alert` and `health_alert` are deliberately not gated.
--
-- That claim was FALSE when written. The pause is enforced in two independent places —
-- `outbound_paused()` inside each emitter, and the WHEN clause on the
-- `send-notification-email` trigger — and the trigger's clause named exactly one type:
--
--   when (new.type = 'health_alert' or not public.outbound_paused())
--
-- So `sms_cap_alert` would have inserted the row, shown the 🔔 in-app, and sent no email
-- at all during a pause or waitlist. The row is not the alert; the email is. An alert that
-- goes quiet exactly when the platform is in an unusual state is the alert-throttle rule
-- read backwards: a throttle fails OPEN because a throttle that silences an alert on its
-- own bug is worse than a duplicate.
--
-- Found by probing the migration above, not by reading it — the trigger lives in
-- `supabase_functions`, not in any migration file, which is why the comment and the
-- behaviour could disagree without anything flagging it. Same shape as the ACL rule: a
-- block committed in a migration is not evidence that it ran.
--
-- `create or replace trigger` is not available here (the trigger name is quoted and
-- carries a hyphen), so this is a drop + create. The argument list is reproduced exactly
-- as the live trigger had it, timeout included — pg_net's default is 5 s and this one was
-- already explicit at 5000, so nothing about the timeout changes.

drop trigger if exists "send-notification-email" on public.notifications;

create trigger "send-notification-email"
  after insert on public.notifications
  for each row
  when (new.type in ('health_alert', 'sms_cap_alert') or not public.outbound_paused())
  execute function supabase_functions.http_request(
    'https://kvypmjxbbaaknvddwwai.supabase.co/functions/v1/send-notification',
    'POST',
    '{"Content-type":"application/json"}',
    '{}',
    '5000'
  );
