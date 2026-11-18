-- Contractor GST / BN number, for the printable bookkeeping documents (2026-11-17).
--
-- WHY A PLAIN TEXT COLUMN AND NOT A VALIDATED ONE:
-- a CRA business number is "123456789RT0001" but pros type it a dozen ways, and a
-- CHECK that refuses a real number the pro copied off their own CRA letter would
-- block the one field whose whole purpose is to appear on their tax paperwork.
-- The number is PRINTED, never computed with.
--
-- The platform does NOT collect or remit GST on bookings. This number therefore
-- appears ONLY on the contractor's own documents (payout statement, earnings
-- summary) — printing it on a client invoice would imply GST was charged on the
-- booking, which it was not. See src/lib/printDoc.ts and the proIdentity() comment
-- in src/pages/ContractorDashboard.tsx.
--
-- No grant or policy change is needed: "Contractors manage own profile" is FOR ALL
-- on contractors, so the existing browser write path (savePricing) covers it.

alter table public.contractors
  add column if not exists gst_number text;

comment on column public.contractors.gst_number is
  'Contractor''s own GST/BN number, free text, printed on their payout statements and earnings summaries. The platform charges no GST; this is the pro''s own registration.';
