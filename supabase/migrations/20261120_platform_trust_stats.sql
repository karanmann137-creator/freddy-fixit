-- platform_trust_stats() — the live numbers behind the public trust strip (2026-11-20)
--
-- WHY A FUNCTION AND NOT A HARDCODED FIGURE
-- The owner's first instinct was to publish invented traction. The resolution was
-- to publish the real numbers and let them climb — which only works if the page
-- reads them live. A hardcoded "$6,555" would be a claim nobody can audit and it
-- would be wrong the day after it shipped; this is the same sentence computed
-- from the table it describes, so it is true on every page load by construction.
--
-- WHAT "WORK QUOTED" MEANS, exactly
-- For each client request, the HIGHEST quote any contractor put on it, summed
-- across all requests. That is the value of work contractors have priced through
-- the platform. It is deliberately NOT:
--   * the sum of every bid (double-counts the same job across competing pros),
--   * revenue (total ever charged is $5.15 — a test transaction),
--   * anything projected or annualised.
-- `price_high` is the top of a ranged quote and takes precedence over `amount`
-- when both exist; greatest() over coalesce()d zeros so a null never swallows a
-- real figure.
--
-- The public copy must say "quoted", never "generated" or "earned" — see
-- docs/growth-and-seo.md. Competition Act deceptive-marketing provisions apply to
-- performance claims, and the gap between quoted and collected here is enormous.
--
-- QUOTE RATE is requests that received at least one quote / all requests. At
-- 13/13 this is a real 100%, which is the claim worth making on a young platform:
-- it says nobody who posted got ignored, and it makes no promise about volume.
--
-- SECURITY DEFINER because an anonymous visitor has no RLS route to other
-- people's bids. It returns ONLY scalars — no ids, no names, no amounts
-- attributable to any one job — so the definer rights buy aggregation and
-- nothing else. `auth.uid()` is never consulted, so there is no null-guard class
-- bug here: the answer is identical for every caller by design.

create or replace function public.platform_trust_stats()
returns jsonb
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  with per_request as (
    select cr.id,
           max(greatest(coalesce(b.price_high, 0), coalesce(b.amount, 0))) as top_quote,
           count(b.id) as n_bids
    from public.client_requests cr
    left join public.bids b on b.request_id = cr.id
    group by cr.id
  )
  select jsonb_build_object(
    'work_quoted',      coalesce(floor(sum(top_quote)), 0)::bigint,
    'requests_total',   count(*),
    'requests_quoted',  count(*) filter (where n_bids > 0),
    'quote_rate',       case when count(*) = 0 then null
                        else round(100.0 * count(*) filter (where n_bids > 0) / count(*))::int end,
    'contractors_total',(select count(*) from public.contractors),
    'as_of',            now()
  )
  from per_request;
$$;

comment on function public.platform_trust_stats() is
  'Public aggregate traction numbers for the trust strip. Aggregates only, no PII. Safe for anon.';

-- The default grant on a new function is to PUBLIC, so revoke before granting the
-- two roles we actually want. A `create or replace` preserves the existing ACL,
-- but a later drop+create would reset it to the defaults — so this block must be
-- re-run after any recreate, and privileges verified by reading pg_proc.proacl
-- rather than by reading this file.
revoke all on function public.platform_trust_stats() from public;
grant execute on function public.platform_trust_stats() to anon, authenticated;
