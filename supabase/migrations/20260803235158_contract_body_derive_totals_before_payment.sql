-- The agreement is signed BEFORE any payment, so jobs.client_fee and
-- jobs.total_charged are still NULL at that moment (create-payment-intent
-- writes them). The old wording therefore printed a bare "Job price $X." with
-- no fee, no total and no payment schedule — which is exactly what the Alberta
-- written-copy rules require it to state. Derive them from platform_fee_rate()
-- when they aren't set yet, and always show the deposit/balance split.
create or replace function public.build_contract_body(p_job_id uuid)
 returns text
 language plpgsql
 stable security definer
 set search_path to 'public', 'pg_temp'
as $function$
declare
  j            record;
  v_client     text;
  v_company    text;
  v_contractor text;
  v_start      text;
  v_price      text;
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
    '## Your cancellation rights (Alberta)' || E'\n' ||
    'Because payment is collected before the work is finished, you may cancel this agreement without penalty within 10 days of receiving your written copy. If the work has not started within 30 days of the agreed date, you may cancel for up to one year. On a valid cancellation we refund any funds still held (not yet released to the contractor) within 15 days. To cancel, contact hello@freddyfixit.ca. These rights are in addition to, and do not waive, your rights under Alberta''s Consumer Protection Act.' || E'\n\n' ||
    'This agreement is governed by the Freddy Fix It User Agreement (freddyfixit.ca/user-agreement). Freddy FixIt Contractors Inc. operates the platform that connects the parties and facilitates payment; the work itself is contracted directly between the contractor and the client.';

  return v_body;
end $function$;
