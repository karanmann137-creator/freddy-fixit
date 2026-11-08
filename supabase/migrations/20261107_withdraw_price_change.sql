-- APPLIED LIVE 2026-11-07 via Supabase MCP. Committed for version control only —
-- running this file does not deploy it, and installers never apply DB changes.
--
-- withdraw_price_change(job) — the contractor's half of decline_price_change.
--
-- WHY: propose_price_change() had no inverse for the person who called it. A pro
-- who fat-fingered a figure, or who talked it through with the client in chat and
-- agreed to leave the price alone, had no way out: the proposal sat 'pending'
-- forever, run_reminders step 6 kept nudging the client about a number the pro no
-- longer wanted, and the only exits were the client approving a price nobody
-- intended or the client declining — which notifies the pro that they were
-- declined, when in fact they withdrew. One missing button, two wrong records.
--
-- MONEY GUARDS: touches NONE of the four. No money moves, nothing is charged or
-- refunded, funded_amount and total_charged are untouched, and payment_status is
-- not read or written. It clears a jsonb PROPOSAL — the pre-money half of a price
-- change — so `fully_funded` cannot change value as a result of this call.
--
-- CONTRACT: void_contract_on_price_change only fires while payment_status is
-- 'unpaid', and on that branch propose_price_change APPLIES the new price
-- immediately rather than queueing it (price_change_pending stays null), so a row
-- reachable by this function has never had its contract voided by the proposal.
-- There is therefore nothing to un-void here. Verified against the deployed
-- trigger body, not assumed.
--
-- NULL-SAFETY: `auth.uid() is null` is tested FIRST and on its own line. The
-- family of twenty-six broken guards on this platform all share the property
-- that they compare against auth.uid() with no null test, so an anon caller
-- evaluates the condition to NULL and a NULL `if` does not fire. Written this way
-- so public.admin_anon_reachable_guards() has nothing to find. Proved with a
-- rolled-back probe from an MCP session (the unauthenticated case): refused with
-- 'Not authorized'.
create or replace function public.withdraw_price_change(p_job_id uuid)
returns void
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare v_contractor uuid; v_client uuid; v_pending jsonb;
begin
  if auth.uid() is null then raise exception 'Not authorized'; end if;

  select contractor_id, client_id, price_change_pending
    into v_contractor, v_client, v_pending
    from jobs where id = p_job_id;
  if v_client is null then raise exception 'Job not found'; end if;

  -- is_admin() is one branch of a normal-user OR, deliberately: this is a
  -- reversible write by the job's own contractor, so it must not demand the
  -- admin second factor from a contractor.
  if not (public.is_admin() or v_contractor = auth.uid()) then
    raise exception 'Not authorized';
  end if;

  if v_pending is null then raise exception 'There is no pending price change'; end if;

  update jobs set price_change_pending = null, price_change_proposed_at = null
   where id = p_job_id;

  -- The client may well have already read the email about it, so say it plainly
  -- and name the price that now stands. A cosmetic lookup failure must never
  -- take the real notification down with it, so there is no shared catch-all
  -- here — _notify is the only call in the block.
  perform public._notify(v_client, 'price_change_withdrawn',
    'Your pro withdrew the price change',
    'The new price your pro proposed has been withdrawn. The price you already agreed to still stands, and nothing was charged.',
    p_job_id);
end;
$$;

-- A brand-new function is granted to PUBLIC by default, and revoking from anon
-- alone is a no-op. Both, in this order, every time. Verified live afterwards by
-- reading pg_proc.proacl, not by reading this file.
revoke all on function public.withdraw_price_change(uuid) from public;
revoke all on function public.withdraw_price_change(uuid) from anon;
grant execute on function public.withdraw_price_change(uuid) to authenticated;

-- 'price_change_withdrawn' is deliberately NOT added to EMAIL_HANDLED_ELSEWHERE
-- in send-notification: it has exactly one emitter (this function) and no richer
-- dedicated email, so the Database Webhook fan-out is the only thing that mails
-- it, and suppressing it would make the withdrawal silent to the client who has
-- already read the email about the change.
