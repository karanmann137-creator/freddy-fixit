-- ============================================================================
-- Service Agreement: Permits & certification section
-- Applied live 2026-08-16 via Supabase MCP. Committed here for version control.
-- ============================================================================
--
-- WHY
-- Unpermitted electrical, plumbing and gas work is the failure that surfaces
-- years later: an insurer refuses a claim, or it has to be disclosed on sale
-- and kills the deal. Nothing on the platform asked who was pulling the permit.
-- The agreement now sets a default in writing - the contractor decides, pulls
-- it, and hands over the number and the inspection result - so the question is
-- settled before anyone is paid instead of argued about afterwards.
--
-- The section only appears on trades where the work is genuinely restricted,
-- driven by public.service_compulsory. That is deliberate: boilerplate that
-- shows up on every job, including a lawn mow, is boilerplate the client skims
-- past. An unknown service label produces NO section rather than a false claim.
--
-- CHANGES FROM THE PREVIOUS VERSION (three, all additive)
--   1. New v_permits block, inserted between Price & payment and the Alberta
--      cancellation rights. Nothing else in the body moved.
--   2. search_path gains 'extensions'. It was 'public', 'pg_temp' - a
--      house-rule violation left over from before the pgcrypto incident.
--   3. v_comp / v_trade / v_article declared for the new block.
-- The fee derivation and the 40/60 schedule text are untouched, byte for byte.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.build_contract_body(p_job_id uuid)
 RETURNS text
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
declare
  j            record;
  v_comp       record;
  v_trade      text;
  v_article    text;
  v_client     text;
  v_company    text;
  v_contractor text;
  v_start      text;
  v_price      text;
  v_permits    text := '';
  v_stages     text := '';
  v_fee        numeric;
  v_total      numeric;
  v_dep_rate   numeric;
  v_due_now    numeric;
  v_balance    numeric;
  v_totals     text;
  v_body       text;
begin
  select
    jb.id, jb.amount, jb.client_fee, jb.total_charged, jb.is_milestone,
    jb.scheduled_at, jb.prepayment_id, jb.deposit_rate,
    r.service_needed, r.job_description, r.location, r.recurring, r.recurring_frequency,
    cp.first_name  as c_first, cp.last_name  as c_last,
    pp.first_name  as p_first, pp.last_name  as p_last,
    ct.company_name as company
  into j
  from public.jobs jb
  left join public.client_requests r  on r.id  = jb.request_id
  left join public.profiles       cp on cp.id = jb.client_id
  left join public.profiles       pp on pp.id = jb.contractor_id
  left join public.contractors    ct on ct.id = jb.contractor_id
  where jb.id = p_job_id;

  if not found then return null; end if;

  v_client     := nullif(trim(coalesce(j.c_first,'')||' '||coalesce(j.c_last,'')), '');
  v_contractor := nullif(trim(coalesce(j.p_first,'')||' '||coalesce(j.p_last,'')), '');
  v_company    := coalesce(j.company, v_contractor, 'the contractor');
  v_start      := coalesce(
                    to_char(j.scheduled_at at time zone 'America/Edmonton', 'FMDay, FMMonth FMDD, YYYY "at" FMHH12:MI am'),
                    'a date to be arranged between the parties');

  -- price / payment section
  if j.is_milestone then
    select string_agg(
             '- Stage '||seq||': '||title||' — $'||to_char((amount + coalesce(client_fee,0)), 'FM999999990.00'),
             E'\n' order by seq)
      into v_stages
      from public.job_milestones where job_id = p_job_id;
    v_price := 'This is a staged (milestone) job. You approve and fund each stage in order; nothing is charged until you fund a stage, and each stage is held securely and released to the contractor only after you approve that stage''s work.'
               || case when v_stages is not null then E'\n\n'||v_stages else '' end;
  elsif j.prepayment_id is not null or coalesce(j.recurring,false) then
    v_price := 'This is a recurring job'
               || case when j.recurring_frequency is not null then ' ('||j.recurring_frequency||')' else '' end
               || '. Each visit is approved and paid separately, or drawn from a prepaid pool you choose to set up. Funds for a visit are held securely and released to the contractor after you confirm that visit is complete.';
  else
    -- Fall back to the platform rate while the job is still unpaid. A referral
    -- credit can only ever reduce the fee at checkout, so this is the ceiling.
    v_fee   := coalesce(j.client_fee, round(coalesce(j.amount,0) * public.platform_fee_rate(), 2));
    v_total := coalesce(j.total_charged, coalesce(j.amount,0) + v_fee);

    v_totals := 'Job price $'||to_char(coalesce(j.amount,0),'FM999999990.00')
                || ' + service fee $'||to_char(v_fee,'FM999999990.00')
                || ' = total $'||to_char(v_total,'FM999999990.00')||'.';

    v_dep_rate := coalesce(j.deposit_rate, 1);
    if v_dep_rate > 0 and v_dep_rate < 1 then
      -- The deposit is a share of the job price; the service fee is charged
      -- once, with the deposit. Rounding must never push it past the total.
      v_due_now := least(round(coalesce(j.amount,0) * v_dep_rate, 2) + v_fee, v_total);
      v_balance := greatest(v_total - v_due_now, 0);
      v_price := v_totals || E'\n\n'
                 || 'You pay this in two parts:' || E'\n'
                 || '- $'||to_char(v_due_now,'FM999999990.00')||' when you book — a '
                    ||to_char(round(v_dep_rate * 100), 'FM990')||'% deposit on the job price, plus the service fee.' || E'\n'
                 || '- $'||to_char(v_balance,'FM999999990.00')||' once the work is finished.' || E'\n\n'
                 || 'Both payments are held securely and are only released to the contractor after you confirm the work is complete. The contractor is not paid anything from the deposit before then.';
    else
      v_price := v_totals || ' Your payment is held securely and only released to the contractor after you confirm the work is complete.';
    end if;
  end if;

  -- Permits & certification. Data-driven from public.service_compulsory, which
  -- follows Alberta's Restricted Activities lists. Only appears on trades where
  -- the work is actually certificate-gated, so it can't become boilerplate the
  -- client skims past. Unknown label => no section, never a false claim.
  select sc.compulsory, sc.trade into v_comp
    from public.service_compulsory sc
   where lower(btrim(sc.service)) = lower(btrim(coalesce(j.service_needed, '')));

  if coalesce(v_comp.compulsory, false) then
    v_trade   := coalesce(v_comp.trade, 'certified tradesperson');
    v_article := case when v_trade ~* '^[aeiou]' then 'an ' else 'a ' end;
    v_permits :=
      '## Permits & certification' || E'\n' ||
      'Alberta restricts this kind of work to certified tradespeople. It must be carried out by '
        || v_article || v_trade
        || ' holding a journeyperson certificate, or by a registered apprentice working under one.' || E'\n\n' ||
      'Work like this often needs a City of Calgary permit and an inspection. Unless the scope of work above says otherwise, '
        || v_company
        || ' is responsible for determining whether a permit is required, taking it out before starting, and giving you the permit number and the final inspection result. Any permit fee is included in the price above.' || E'\n\n' ||
      'This matters after the job is done: work that needed a permit and never got one can be refused by your insurer and must be disclosed when you sell the property. If you are told no permit is needed, ask for that in writing in the messages on this job.' || E'\n\n';
  end if;

  v_body :=
    '# Service Agreement' || E'\n\n' ||
    '**Contractor:** ' || v_company || case when v_contractor is not null and v_contractor <> v_company then ' ('||v_contractor||')' else '' end || E'\n' ||
    '**Client:** ' || coalesce(v_client, 'the client') || E'\n' ||
    '**Service address:** ' || coalesce(j.location, 'the address on file') || E'\n' ||
    '**Service:** ' || coalesce(j.service_needed, 'the requested service') || E'\n' ||
    '**Start:** ' || v_start || E'\n\n' ||
    '## Scope of work' || E'\n' ||
    coalesce(nullif(trim(j.job_description),''), coalesce(j.service_needed,'As discussed between the parties.')) || E'\n\n' ||
    '## Price & payment' || E'\n' || v_price || E'\n\n' ||
    v_permits ||
    '## Your cancellation rights (Alberta)' || E'\n' ||
    'Because payment is collected before the work is finished, you may cancel this agreement without penalty within 10 days of receiving your written copy. If the work has not started within 30 days of the agreed date, you may cancel for up to one year. On a valid cancellation we refund any funds still held (not yet released to the contractor) within 15 days. To cancel, contact hello@freddyfixit.ca. These rights are in addition to, and do not waive, your rights under Alberta''s Consumer Protection Act.' || E'\n\n' ||
    'This agreement is governed by the Freddy Fix It User Agreement (freddyfixit.ca/user-agreement). Freddy FixIt Contractors Inc. operates the platform that connects the parties and facilitates payment; the work itself is contracted directly between the contractor and the client.';

  return v_body;
end $function$;

-- ============================================================================
-- VERIFIED against a real job, in a rolled-back transaction:
--   Electrical Work            -> "...carried out by an Electrician..."
--   Appliance Repair / Install -> "...by an Appliance Service Technician..."
--   Solar                      -> "...by an Electrician..."
--   Battery / Brakes           -> "...by an Automotive Service Technician..."
--   Vehicle Maintenance        -> no section
--   General Handyman           -> no section
-- Section order intact: Price @487 < Permits @878 < Cancellation @1684.
-- platform_health_check(): 7 of 7 passing.
--
-- The article is computed rather than hardcoded because "a Electrician" in a
-- legal document reads like the whole thing was generated carelessly.
-- ============================================================================
