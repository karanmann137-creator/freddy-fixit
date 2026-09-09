-- `saved_addresses` — the quick-pick list on the pre-deposit address panel.
--
-- APPLIED LIVE via Supabase MCP. This file exists for version control only;
-- running the installer does NOT apply it.
--
-- The table itself predates this migration (it was created in an earlier
-- session and never written to a repo file). It is spelled out here in full,
-- idempotently, so the repo finally records it — and so the grant tightening at
-- the bottom has its reasoning attached to the object it applies to.
--
-- `ConfirmAddress.tsx` owns this table end to end: it offers what is there and
-- adds what the client confirms. Nothing else in the app reads or writes it, so
-- a failed read degrades to an empty shortcut list and the typing path is
-- untouched — a missing convenience is never worth an error message on the
-- screen that stands between a client and paying.
create table if not exists public.saved_addresses (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users(id) on delete cascade,
  label      text,
  address    text not null,
  created_at timestamptz not null default now()
);

create index if not exists saved_addresses_user_idx on public.saved_addresses (user_id);

alter table public.saved_addresses enable row level security;

-- Own-row only, and `authenticated` only. `auth.uid()` is wrapped in a SELECT
-- so the planner hoists it to an InitPlan instead of re-evaluating per row.
drop policy if exists "saved_addresses owner all" on public.saved_addresses;
create policy "saved_addresses owner all" on public.saved_addresses
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

-- The table carried Supabase's default grants, which include `anon`. RLS meant
-- anon could not actually read a row — but that makes the ACL depend on the
-- policy being correct, which is the inverse of the `set_job_autopay` lesson
-- and one policy edit away from being wrong.
--
-- Tightening a read grant is the dangerous direction, so it was proven safe
-- first: 0 DB functions and 0 cron jobs reference the table, and both frontend
-- call sites sit behind ProtectedRoute with a real user JWT.
revoke all on table public.saved_addresses from anon;

-- TRUNCATE is not subject to RLS, so it is revoked explicitly.
revoke truncate on table public.saved_addresses from authenticated;
