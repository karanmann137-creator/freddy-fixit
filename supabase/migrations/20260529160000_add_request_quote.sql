-- Estimated quote on a request + authorized writer function. Applied to prod 2026-05-29.
alter table public.client_requests add column if not exists estimated_quote numeric, add column if not exists quote_notes text;
create or replace function public.set_quote(p_request_id uuid, p_amount numeric, p_notes text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if public.is_admin()
     or exists (select 1 from public.client_requests cr where cr.id = p_request_id and cr.assigned_contractor_id = auth.uid())
     or exists (select 1 from public.jobs j where j.request_id = p_request_id and j.contractor_id = auth.uid())
  then update public.client_requests set estimated_quote = p_amount, quote_notes = p_notes where id = p_request_id;
  else raise exception 'Not authorized to quote this request'; end if;
end; $$;
