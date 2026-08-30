-- Freddy Fix It — 2026-08-30
-- ALREADY APPLIED LIVE via Supabase MCP. This file is version control only;
-- running the installer does NOT apply it.
--
-- Context: the platform's first real job could not pay its contractor. The
-- client's money was fully collected, but a Stripe transfer draws on the
-- AVAILABLE balance and card money sits in PENDING until it settles, so
-- release-payment failed with "Insufficient funds in Stripe account" and
-- reconcile-payouts retried -- and emailed -- every 15 minutes.
--
-- Two things were needed: somewhere to record a SPLIT payout (a job funded by a
-- deposit charge plus a balance charge cannot be paid by one source_transaction
-- transfer), and a throttle so one stuck payout stops sending ~96 identical
-- alerts a day.
--
-- MONEY: touches none of the four payout guards. Nothing here decides whether a
-- payout may happen; it records how one was made and how loudly we complain.

-- ── 1. a payout can now be several transfers ─────────────────────────────────
alter table public.jobs
  add column if not exists stripe_transfer_ids text[];

comment on column public.jobs.stripe_transfer_ids is
  'Every Stripe transfer that makes up this payout. A job funded by two charges (deposit + balance) must be paid by two transfers, because a transfer with source_transaction cannot exceed the charge it draws on. stripe_transfer_id is kept as the FIRST leg so existing readers (resolve-dispute) are unchanged.';

-- ── 2. alert throttle ────────────────────────────────────────────────────────
create table if not exists public.alert_throttle_log (
  key          text primary key,
  last_sent_at timestamptz not null default now(),
  hits         integer     not null default 1,
  created_at   timestamptz not null default now()
);

-- Service-role only. No policy is added on purpose: RLS on with no policy means
-- no authenticated or anon access at all, which is what an internal ledger wants.
alter table public.alert_throttle_log enable row level security;
revoke all on public.alert_throttle_log from public, anon, authenticated;

-- Returns {send, hits}. FAILS OPEN: any problem at all and the caller sends the
-- email anyway, because a missed alert is worse than a duplicate one.
--
-- ⚠️ The staleness test reads the PRE-UPDATE value out of a CTE. The first
-- version inferred "did we just send?" from RETURNING (last_sent_at = now()) --
-- but now() is frozen for the whole transaction, so a repeat call inside one
-- transaction still read as a fresh send and the throttle did nothing.
create or replace function public.alert_should_send(
  p_key text,
  p_cooldown_mins integer default 360
) returns jsonb
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_send boolean;
  v_hits integer;
begin
  if p_key is null or btrim(p_key) = '' then
    return jsonb_build_object('send', true, 'hits', 1);
  end if;

  with prev as (
    select l.last_sent_at from public.alert_throttle_log l where l.key = p_key
  ), up as (
    insert into public.alert_throttle_log as t (key, last_sent_at, hits)
    values (p_key, now(), 1)
    on conflict (key) do update set
      last_sent_at = case
        when t.last_sent_at < now() - make_interval(mins => p_cooldown_mins) then now()
        else t.last_sent_at end,
      hits = t.hits + 1
    returning t.hits
  )
  select coalesce((select last_sent_at from prev) < now() - make_interval(mins => p_cooldown_mins), true),
         (select hits from up)
  into v_send, v_hits;

  return jsonb_build_object('send', coalesce(v_send, true), 'hits', coalesce(v_hits, 1));
exception when others then
  return jsonb_build_object('send', true, 'hits', 1);
end
$$;

create or replace function public.prune_alert_throttle_log()
returns void
language sql
security definer
set search_path = public, extensions, pg_temp
as $$
  delete from public.alert_throttle_log where last_sent_at < now() - interval '30 days';
$$;

-- Remember: the default function grant is to PUBLIC, so revoking from anon
-- alone is a no-op.
revoke all on function public.alert_should_send(text, integer)   from public, anon, authenticated;
revoke all on function public.prune_alert_throttle_log()          from public, anon, authenticated;
grant execute on function public.alert_should_send(text, integer) to postgres, service_role;
grant execute on function public.prune_alert_throttle_log()       to postgres, service_role;
