-- The signed service agreement is the thing the fail-closed payment gate trusts
-- (create-payment-intent / create-milestone-payment / create-recurring-prepayment
-- all 428 until contract_signed() is true). Two holes:
--
--   1. Nothing required a price or a visit date before signing, so a contractor
--      could sign an agreement reading "Job price $0.00" on "a date to be
--      arranged" -- and save_contract_draft() refuses to touch a signed row, so
--      it could never be regenerated.
--   2. Nothing voided a signed agreement when jobs.amount later changed
--      (approve_job_schedule's add-on math, propose_price_change), so the
--      document stopped describing the transaction it was binding.
--
-- contract_ready() is the precondition; the trigger handles drift afterwards.

create or replace function public.contract_ready(p_job_id uuid)
 returns text
 language plpgsql
 stable
 security definer
 set search_path to 'public', 'pg_temp'
as $function$
declare j record;
begin
  select id, amount, scheduled_at, client_approved_at, is_milestone,
         milestone_schedule_status, status
    into j
    from jobs where id = p_job_id;

  if j.id is null then
    return 'This job could not be found.';
  end if;

  if coalesce(j.amount, 0) <= 0 then
    return 'Add your price to this job first — the agreement has to show what the client is agreeing to pay.';
  end if;

  if j.scheduled_at is null then
    return 'Book a visit time first — the agreement has to show when the work is happening.';
  end if;

  if j.client_approved_at is null then
    return 'Wait for the client to approve your time and price — then the agreement will match what they agreed to.';
  end if;

  if coalesce(j.is_milestone, false)
     and coalesce(j.milestone_schedule_status, '') <> 'approved' then
    return 'Wait for the client to approve your stage-by-stage payment plan before you send the agreement.';
  end if;

  return null; -- ready to sign
end;
$function$;

revoke all on function public.contract_ready(uuid) from public;
grant execute on function public.contract_ready(uuid) to authenticated, service_role;

-- Void a signed agreement whose price no longer matches the job.
-- Only while the money is still unpaid: once funds are held or released the
-- price-change flow (propose_price_change -> adjust-payment) has its own
-- explicit client consent, and voiding there would strand a funded job.
create or replace function public.void_contract_on_price_change()
 returns trigger
 language plpgsql
 security definer
 set search_path to 'public', 'pg_temp'
as $function$
declare v_had boolean;
begin
  if coalesce(new.payment_status, 'unpaid') not in ('unpaid') then
    return new;
  end if;

  update job_contracts
     set status = 'void'
   where job_id = new.id
     and status = 'signed';

  get diagnostics v_had = row_count;
  if not v_had then return new; end if;

  begin
    perform public._notify(
      new.contractor_id, 'contract_signature',
      'The price changed — send a new agreement',
      'The price on this job changed, so the signed agreement no longer matches it. Send a fresh agreement for the client to sign — they cannot pay until they do.',
      new.id);
    perform public._notify(
      new.client_id, 'contract_signature',
      'Your pro updated the price',
      'The price on this job changed, so the agreement you signed no longer matches it. Your pro will send a new one to sign — nothing has been charged.',
      new.id);
  exception when others then null;
  end;

  return new;
end;
$function$;

drop trigger if exists jobs_void_contract_on_price_change on public.jobs;
create trigger jobs_void_contract_on_price_change
  after update on public.jobs
  for each row
  when (old.amount is distinct from new.amount)
  execute function public.void_contract_on_price_change();
