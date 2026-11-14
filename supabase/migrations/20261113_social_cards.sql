-- One row per social post. /api/social-card draws the graphic from it, and it
-- is the log the weekly review reads. Rows are written through the Supabase
-- MCP only; the public can read them because they are published posts.
create table if not exists public.social_cards (
  id            uuid primary key default gen_random_uuid(),
  created_at    timestamptz not null default now(),
  kicker        text not null check (char_length(kicker) <= 34),
  headline      text not null check (char_length(headline) <= 110),
  body          text not null default '' check (char_length(body) <= 420),
  caption       text,
  topic         text,
  audience      text check (audience in ('customer','contractor')),
  utm_content   text unique,
  networks      text[],
  scheduled_for timestamptz,
  notes         text
);
alter table public.social_cards enable row level security;
revoke all on public.social_cards from public, anon, authenticated;
grant select on public.social_cards to anon, authenticated;
drop policy if exists social_cards_public_read on public.social_cards;
create policy social_cards_public_read on public.social_cards
  for select to anon, authenticated using (true);
