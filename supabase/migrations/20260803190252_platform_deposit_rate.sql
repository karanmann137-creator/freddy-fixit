-- The upfront deposit fraction lives in ONE place, the same way platform_fee_rate()
-- owns the 3% service fee. create-payment-intent reads it at checkout and stamps
-- the result onto jobs.deposit_rate, freezing that job's split - so changing this
-- later only affects new bookings, never one already in flight.
create or replace function public.platform_deposit_rate()
returns numeric
language sql
stable
set search_path to 'public'
as $$ select 0.40::numeric $$;

revoke all on function public.platform_deposit_rate() from public;
grant execute on function public.platform_deposit_rate() to anon, authenticated, service_role;

comment on function public.platform_deposit_rate() is
  'Fraction of a job total collected upfront as a deposit. The remainder is collected when the work is done. Set to 1.0 to go back to charging in full at booking.';
