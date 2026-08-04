-- propose_price_change() cleared a stale 'processing'/'failed' payment_status by
-- writing NULL, but the column is NOT NULL -> 23502. The intent was "back to
-- unpaid". Recreated verbatim apart from that one CASE branch.
create or replace function public.propose_price_change(
  p_job_id uuid, p_amount numeric, p_reason text,
  p_labour numeric default null, p_parts numeric default null, p_callout numeric default null,
  p_subject_to_inspection boolean default false,
  p_price_low numeric default null, p_price_high numeric default null,
  p_used_base_price boolean default false)
returns text
language plpgsql
security definer
set search_path to 'public','pg_temp'
as $function$
declare
  v_contractor uuid; v_client uuid; v_status text; v_pay text; v_paid timestamptz;
  v_disp timestamptz; v_ms boolean; v_old_notes text; v_total numeric; v_old_amount numeric;
  v_is_hike boolean;
begin
  select contractor_id, client_id, status, payment_status, paid_at, disputed_at, is_milestone, notes, amount
    into v_contractor, v_client, v_status, v_pay, v_paid, v_disp, v_ms, v_old_notes, v_old_amount
    from jobs where id = p_job_id;
  if v_contractor is null then raise exception 'Job not found'; end if;
  if v_contractor <> auth.uid() then raise exception 'Not authorized'; end if;
  if coalesce(v_ms,false) then raise exception 'For staged (milestone) jobs, adjust the amount on each stage instead.'; end if;
  if v_pay = 'released' then raise exception 'This job has already paid out — the price is locked.'; end if;
  if v_pay = 'disputed' or v_disp is not null then raise exception 'This job is under dispute — price changes are paused until it is resolved.'; end if;
  if v_status not in ('assigned','scheduled','in_progress','pending_confirmation') then
    raise exception 'You can only change the price while the job is still active.';
  end if;
  if coalesce(trim(p_reason),'') = '' then raise exception 'Please explain why the price is changing'; end if;

  if p_labour is not null or p_parts is not null or p_callout is not null then
    v_total := coalesce(p_labour,0) + coalesce(p_parts,0) + coalesce(p_callout,0);
  else
    v_total := p_amount;
  end if;
  if v_total is null or v_total <= 0 then raise exception 'Enter the new price'; end if;

  -- HELD: money is already secured. Record a pending change for the client to approve.
  if v_pay = 'held' then
    update jobs set
      price_change_pending = jsonb_build_object(
        'amount', v_total, 'labour', p_labour, 'parts', p_parts, 'callout', p_callout,
        'subject', coalesce(p_subject_to_inspection,false),
        'price_low', p_price_low, 'price_high', p_price_high,
        'used_base_price', coalesce(p_used_base_price,false), 'reason', p_reason),
      price_change_proposed_at = now()
    where id = p_job_id;

    perform public._notify(v_client, 'price_change', 'Your pro proposed a new price',
      'Your contractor proposed changing the price to $'||v_total::text||': '||p_reason||
      ' Open your dashboard to approve or decline.', p_job_id);
    perform public.notify_email('price_change', p_job_id);
    return 'pending_client_approval';
  end if;

  -- UNPAID: apply the new price now and send back for schedule re-approval.
  v_is_hike := v_total > coalesce(v_old_amount, 0);
  update jobs set
    amount = v_total,
    labour_amount = p_labour,
    parts_amount = p_parts,
    callout_fee = p_callout,
    subject_to_inspection = coalesce(p_subject_to_inspection,false),
    price_low = p_price_low,
    price_high = p_price_high,
    used_base_price = coalesce(p_used_base_price,false),
    notes = coalesce(v_old_notes||E'\n','')||'Price update: '||p_reason,
    client_approved_at = null,
    schedule_proposed_at = now(),
    status = 'assigned',
    payment_status = case when v_pay in ('processing','failed') then 'unpaid' else v_pay end,
    price_change_pending = null,
    price_change_proposed_at = null,
    price_hike_from   = case when v_is_hike then v_old_amount else null end,
    price_hike_reason = case when v_is_hike then p_reason    else null end,
    price_hike_at     = case when v_is_hike then now()       else null end
  where id = p_job_id;

  perform public._notify(v_client,
    case when v_is_hike then 'price_change' else 'schedule_proposed' end,
    case when v_is_hike then 'Your pro raised the price' else 'Updated price needs your approval' end,
    case when v_is_hike
      then 'Your contractor raised the estimate from $'||v_old_amount::text||' to $'||v_total::text||': '||p_reason||
           ' Open your dashboard to approve the new price or decline and re-open the job to other pros.'
      else 'Your contractor updated the estimate to $'||v_total::text||': '||p_reason||' Open your dashboard to review and approve.'
    end, p_job_id);
  perform public.notify_email('schedule_proposed', p_job_id);
  return 'reapprove';
end; $function$;
