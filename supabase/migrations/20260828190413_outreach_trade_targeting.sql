-- Trade-targeted cold outreach.
--
-- contractor_outreach already drives the CASL-compliant `contractor-outreach`
-- edge function: it emails every row at status='pending', flips it to 'sent',
-- and therefore can never mail the same address twice. What it could not do
-- was aim -- there was no trade column, so a queue was all-or-nothing.
--
-- New status 'new' is the holding state: imported but NOT queued. Only 'pending'
-- is picked up by the sender, so importing a list can never send anything by
-- itself. Queueing is an explicit act, and the send still requires an admin
-- JWT plus confirm:"SEND".

alter table public.contractor_outreach
  add column if not exists trade        text,
  add column if not exists source       text,
  add column if not exists city         text default 'Calgary',
  add column if not exists queued_at    timestamptz,
  add column if not exists queued_for   uuid,
  add column if not exists unsubscribed boolean not null default false;

create index if not exists contractor_outreach_trade_status_idx
  on public.contractor_outreach (trade, status);

create unique index if not exists contractor_outreach_email_uidx
  on public.contractor_outreach (lower(email));

comment on column public.contractor_outreach.trade is
  'A public.service_specialty_map.service label. Null = untargeted legacy row.';
comment on column public.contractor_outreach.status is
  'new = imported, never queued | pending = queued to send | sent | failed';
comment on column public.contractor_outreach.queued_for is
  'client_requests.id that triggered the queue. Never put job details in the email.';
