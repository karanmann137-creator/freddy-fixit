-- 'new' = imported but NOT queued. This is the state that makes importing a
-- list safe: only 'pending' is picked up by the sender, so a paste can never
-- send anything by itself. Without it, admin_import_outreach would have to
-- land rows straight into the send queue.
alter table public.contractor_outreach
  drop constraint if exists contractor_outreach_status_check;

alter table public.contractor_outreach
  add constraint contractor_outreach_status_check
  check (status = any (array['new','pending','sent','failed','skipped','unsubscribed']));
