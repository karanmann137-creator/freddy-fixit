-- Restrict client_requests visibility.
-- Already applied to production via Supabase on 2026-05-29.
-- Clients see only their own; active contractors see open + assigned; admins see all.

drop policy if exists "Clients see own requests" on public.client_requests;
drop policy if exists "Contractors see requests in their area" on public.client_requests;
drop policy if exists "Clients insert own requests" on public.client_requests;

create policy "Clients view own requests" on public.client_requests
  for select to authenticated using (user_id = auth.uid());

create policy "Clients insert own requests" on public.client_requests
  for insert to authenticated with check (user_id = auth.uid());

create policy "Contractors view open and assigned requests" on public.client_requests
  for select to authenticated
  using (
    exists (select 1 from public.contractors c
            where c.id = auth.uid() and c.status = 'active')
    and (
      status = 'pending'
      or assigned_contractor_id = auth.uid()
      or exists (select 1 from public.jobs j
                 where j.request_id = client_requests.id and j.contractor_id = auth.uid())
    )
  );
