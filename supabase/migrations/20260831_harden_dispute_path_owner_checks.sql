-- Harden the three RPCs on the claim / confirm path (2026-08-31).
-- APPLIED LIVE via Supabase MCP. This file is version control only.
--
-- Two defects, both shared by all three functions.
--
-- 1. `v_client <> auth.uid()` is NULL when auth.uid() is NULL, and a NULL `if`
--    condition does not fire -- so the "Not authorized" guard silently PASSED
--    for a caller with no JWT. Found while fixing the identical shape in
--    set_job_autopay. It was latent, not live: verified zero DB callers, zero
--    cron callers, and the only edge-function mentions are comments -- all
--    three are called from the browser with a real user JWT. Fixed by testing
--    `auth.uid() is null` FIRST.
--
-- 2. search_path was pinned to 'public, pg_temp' -- missing `extensions`, the
--    schema pgcrypto lives in. That exact omission killed every signup for a
--    month. Nothing in these bodies calls pgcrypto today; the pin is what stops
--    a future edit inheriting the bug.
--
-- MONEY: confirm_job_completion is PAYOUT GUARD 1. Its balance-owed raise, its
-- disputed check, its price-change check, its status check, both updates and
-- both notifications are preserved byte-for-byte; only the authorization line
-- and the search_path change. The guard is made STRICTER (it now refuses a
-- caller it previously accepted), never looser. Guards 2 (auto_confirm_stale_jobs),
-- 3 (release-payment 409) and 4 (reconcile-payouts filter) are untouched -- this
-- change cannot make an under-funded job payable.
--
-- CREATE OR REPLACE, not DROP/CREATE, on purpose: it preserves the OID, the
-- signature and the ACL, so PostgREST sees no overload ambiguity and no live
-- definition the fail-closed payment gate depends on is rewritten from scratch.
--
-- Verified by rolled-back probe under real and absent JWT claims, 6/6:
--   1. no-JWT confirm_job_completion -> refused: Not authorized
--   2. no-JWT open_dispute           -> refused: Not authorized
--   3. real client, under-funded     -> guard 1 raised: "Please pay the
--                                       remaining balance of $61.80 ..."
--   4. real client, fully funded     -> confirmed ok (not over-tightened)
--   5. a different real user         -> refused: Not authorized
--   6. search_path carries extensions on all three
-- platform_health_check() 7/7 after apply.

create or replace function public.open_dispute(
  p_job_id uuid, p_reason text, p_description text default null::text,
  p_service_date date default null::date, p_agreed_scope text default null::text,
  p_requested_remedy text default null::text, p_amount_in_dispute numeric default null::numeric,
  p_declarant_name text default null::text, p_photo_paths text[] default '{}'::text[])
returns uuid language plpgsql security definer
set search_path to 'public', 'extensions', 'pg_temp'
as $function$
declare v_client uuid; v_contractor uuid; v_pay text; v_id uuid; v_deadline timestamptz; r record;
begin
  select client_id, contractor_id, payment_status
    into v_client, v_contractor, v_pay
    from jobs where id = p_job_id;
  if v_client is null then raise exception 'Job not found'; end if;
  if auth.uid() is null or v_client <> auth.uid() then raise exception 'Not authorized'; end if;
  if coalesce(p_reason,'') = '' then raise exception 'A reason is required'; end if;
  if coalesce(p_declarant_name,'') = '' then
    raise exception 'You must sign the declaration (type your full name) to submit a claim.';
  end if;
  if v_pay <> 'held' then
    raise exception 'This job is not eligible for an in-app claim (payment is no longer held). Please contact support.';
  end if;

  v_deadline := now() + interval '3 days';

  insert into disputes(
    job_id, client_id, contractor_id, reason, description, photo_paths,
    service_date, agreed_scope, requested_remedy, amount_in_dispute,
    declarant_name, declaration_signed, response_deadline
  ) values (
    p_job_id, v_client, v_contractor, p_reason, nullif(p_description,''), coalesce(p_photo_paths,'{}'),
    p_service_date, nullif(p_agreed_scope,''), nullif(p_requested_remedy,''), p_amount_in_dispute,
    p_declarant_name, true, v_deadline
  ) returning id into v_id;

  -- freeze: blocks release-payment (needs 'held') and auto-confirm (skips disputed).
  -- disputed_at is ALSO what removes the job from jobs_due_for_autopay, so filing
  -- a claim stops the card-on-file balance charge. Proven by rolled-back probe.
  update jobs set payment_status = 'disputed', disputed_at = now() where id = p_job_id;

  perform public._notify(v_contractor, 'dispute_opened', 'A claim was filed on your job',
    'The client filed a formal claim about a job. Your payout is paused while it''s reviewed. Please open your dashboard to read the claim and submit your response within 3 days.', p_job_id);
  perform public._notify(v_client, 'dispute_opened', 'We received your claim',
    'Your claim has been filed and your payment is paused while our team reviews. We''ll be in touch.', p_job_id);
  for r in select id from profiles where role = 'admin' loop
    perform public._notify(r.id, 'dispute_opened', 'New claim filed',
      'A client filed a claim on a job. Review it in the admin dashboard.', p_job_id);
  end loop;

  return v_id;
end; $function$;

create or replace function public.respond_to_dispute(
  p_dispute_id uuid, p_response text, p_photos text[] default '{}'::text[])
returns void language plpgsql security definer
set search_path to 'public', 'extensions', 'pg_temp'
as $function$
declare v_contractor uuid; v_client uuid; v_job uuid; v_status text; r record;
begin
  select contractor_id, client_id, job_id, status
    into v_contractor, v_client, v_job, v_status
    from disputes where id = p_dispute_id;
  if v_contractor is null then raise exception 'Claim not found'; end if;
  if auth.uid() is null or v_contractor <> auth.uid() then raise exception 'Not authorized'; end if;
  if v_status <> 'open' then raise exception 'This claim has already been resolved.'; end if;
  if coalesce(p_response,'') = '' then raise exception 'Please describe your response.'; end if;

  update disputes set
    contractor_response = p_response,
    contractor_response_photos = coalesce(p_photos,'{}'),
    contractor_responded_at = now()
  where id = p_dispute_id;

  perform public._notify(v_client, 'dispute_response', 'The contractor responded to your claim',
    'The contractor submitted their response. Our team is reviewing both sides.', v_job);
  for r in select id from profiles where role = 'admin' loop
    perform public._notify(r.id, 'dispute_response', 'Contractor responded to a claim',
      'The contractor submitted a response. Review it in the admin dashboard.', v_job);
  end loop;
end; $function$;

create or replace function public.confirm_job_completion(p_job_id uuid)
returns void language plpgsql security definer
set search_path to 'public', 'extensions', 'pg_temp'
as $function$
declare
  v_contractor uuid; v_client uuid; v_status text; v_req uuid; v_pay text;
  v_pending jsonb; v_funded numeric; v_total numeric; v_full boolean;
begin
  select contractor_id, client_id, status, request_id, payment_status, price_change_pending,
         funded_amount, total_charged, fully_funded
    into v_contractor, v_client, v_status, v_req, v_pay, v_pending,
         v_funded, v_total, v_full
    from jobs where id = p_job_id;
  if v_client is null then raise exception 'Job not found'; end if;
  if auth.uid() is null or v_client <> auth.uid() then raise exception 'Not authorized'; end if;
  if v_pay = 'disputed' then raise exception 'This job is under dispute and cannot be confirmed yet.'; end if;
  if v_pending is not null then raise exception 'Please approve or decline your pro''s proposed price change before confirming.'; end if;
  -- PAYOUT GUARD 1 -- unchanged.
  if v_pay = 'held' and not coalesce(v_full, false) then
    raise exception 'Please pay the remaining balance of $% before confirming the work is done.',
      to_char(greatest(coalesce(v_total,0) - coalesce(v_funded,0), 0), 'FM999999990.00');
  end if;
  if v_status <> 'pending_confirmation' then raise exception 'Job is not awaiting confirmation'; end if;

  update jobs set status = 'completed', client_confirmed_at = now() where id = p_job_id;
  update client_requests set status = 'completed' where id = v_req;

  perform public._notify(v_contractor, 'job_confirmed', 'Job confirmed complete',
    'The client confirmed the job is done. Nice work!', p_job_id);
  perform public.notify_email('job_confirmed_contractor', p_job_id);
end; $function$;

-- The default function grant is to PUBLIC, so revoking from anon alone is a no-op.
revoke all on function public.open_dispute(uuid,text,text,date,text,text,numeric,text,text[]) from public, anon;
revoke all on function public.respond_to_dispute(uuid,text,text[]) from public, anon;
revoke all on function public.confirm_job_completion(uuid) from public, anon;
grant execute on function public.open_dispute(uuid,text,text,date,text,text,numeric,text,text[]) to authenticated;
grant execute on function public.respond_to_dispute(uuid,text,text[]) to authenticated;
grant execute on function public.confirm_job_completion(uuid) to authenticated;
