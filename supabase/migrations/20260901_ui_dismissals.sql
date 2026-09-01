-- ui_dismissals -- per-account "I've seen this, stop showing it" store for
-- dashboard banners and attention rows.
--
-- APPLIED LIVE via Supabase MCP on 2026-09-01. This file exists for version
-- control only; installers do not apply DB changes.
--
-- WHY A GENERIC (user, key) TABLE. There was no per-account dismissal store on
-- the platform -- only `hidden_jobs.hidden_at` (one specific surface) and
-- `contractors.setup_skipped` (a text[] on one role's row, unusable by clients
-- or admins). Keys are plain strings owned by the frontend, so the next
-- dismissible surface needs no migration.
--
-- NO UPDATE POLICY AND NO UPDATE GRANT, ON PURPOSE. The frontend inserts with
-- `on conflict do nothing`, so re-dismissing is a no-op rather than a rewrite.
-- That means `dismissed_at` can never be back-dated by the client, and the
-- table's whole write surface is insert-once/delete.
--
-- THE 200-ROW CAP is because this is the only table a signed-in client can
-- write arbitrary text into. Failing an insert only means a banner stays
-- visible, which is the safe direction -- the same reasoning as
-- src/lib/dismissals.ts, where a failed READ resolves to "nothing dismissed".

create table if not exists public.ui_dismissals (
  user_id      uuid        not null references auth.users(id) on delete cascade,
  key          text        not null,
  dismissed_at timestamptz not null default now(),
  primary key (user_id, key),
  constraint ui_dismissals_key_len check (length(key) between 1 and 80)
);

alter table public.ui_dismissals enable row level security;

-- Own-row only. `(select auth.uid())` rather than a bare call so Postgres
-- hoists it into an InitPlan instead of evaluating it per row.
drop policy if exists ui_dismissals_own_select on public.ui_dismissals;
create policy ui_dismissals_own_select on public.ui_dismissals
  for select to authenticated using ((select auth.uid()) = user_id);

drop policy if exists ui_dismissals_own_insert on public.ui_dismissals;
create policy ui_dismissals_own_insert on public.ui_dismissals
  for insert to authenticated with check ((select auth.uid()) = user_id);

drop policy if exists ui_dismissals_own_delete on public.ui_dismissals;
create policy ui_dismissals_own_delete on public.ui_dismissals
  for delete to authenticated using ((select auth.uid()) = user_id);

create or replace function public.ui_dismissals_cap()
returns trigger
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare n int;
begin
  select count(*) into n from public.ui_dismissals where user_id = new.user_id;
  if n >= 200 then
    raise exception 'Too many dismissed items.' using errcode = '54000';
  end if;
  return new;
end;
$$;

drop trigger if exists ui_dismissals_cap_trg on public.ui_dismissals;
create trigger ui_dismissals_cap_trg
  before insert on public.ui_dismissals
  for each row execute function public.ui_dismissals_cap();

-- The default grant is to PUBLIC, so revoking from anon alone is a no-op.
revoke all on public.ui_dismissals from public, anon;
revoke all on function public.ui_dismissals_cap() from public, anon;
grant select, insert, delete on public.ui_dismissals to authenticated;
