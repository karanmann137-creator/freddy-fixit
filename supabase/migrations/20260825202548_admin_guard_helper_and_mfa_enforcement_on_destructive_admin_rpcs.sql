-- One admin guard, and real MFA enforcement behind it.
--
-- The three destructive admin RPCs each carried their OWN copy of the admin
-- check, and the copies had already drifted:
--
--   admin_delete_job            select (role='admin') into v_is_admin from profiles ...
--   admin_delete_request        if not public.is_admin() ...
--   admin_set_contractor_status if (select role from profiles ...) <> 'admin' ...
--
-- Three spellings of one rule is how a rule silently stops being one rule.
--
-- WHY THE MFA CHECK LIVES HERE AND NOT ON THE LOGIN SCREEN. Supabase issues the
-- session the moment the password is accepted, so a prompt on the sign-in page
-- is a gate on the UI only -- somebody holding the issued JWT can call PostgREST
-- directly and never see it. Putting mfa_ok() inside the guard is what makes the
-- second factor a control rather than decoration, and these three functions are
-- exactly where a stolen owner session does damage that cannot be undone.
--
-- It cannot lock the owner out: mfa_ok() is TRUE for anyone who never enrolled,
-- so nothing changes until two-step is deliberately switched on.

create or replace function public.admin_guard()
returns void language plpgsql stable security definer
set search_path = public, extensions, pg_temp as $function$
begin
  if not exists (select 1 from public.profiles p
                  where p.id = auth.uid() and p.role = 'admin') then
    raise exception 'Not authorized';
  end if;
  if not public.mfa_ok() then
    -- Plain English on purpose: this surfaces in the admin dashboard, and
    -- "permission denied" would send the owner hunting for a role problem that
    -- does not exist.
    raise exception 'Verify your sign-in code first, then try again.';
  end if;
end;
$function$;

revoke execute on function public.admin_guard() from public, anon;
grant  execute on function public.admin_guard() to authenticated;

-- Bodies below are unchanged apart from the guard: admin_delete_job keeps its
-- job_money_block() check and its p_force escape hatch, admin_delete_request
-- keeps its ordered cascade deletes, admin_set_contractor_status keeps its
-- status whitelist.

create or replace function public.admin_delete_job(p_job_id uuid, p_force boolean default false)
returns void language plpgsql security definer
set search_path = public, extensions, pg_temp as $function$
declare
  v_block text;
begin
  perform public.admin_guard();

  if not p_force then
    v_block := public.job_money_block(p_job_id);
    if v_block is not null then
      raise exception 'This job holds money and was not deleted. %  (Refund the charge in Stripe first, then re-run with p_force => true.)', v_block;
    end if;
  end if;

  delete from public.jobs where id = p_job_id;
end;
$function$;

create or replace function public.admin_delete_request(p_request_id uuid)
returns void language plpgsql security definer
set search_path = public, extensions, pg_temp as $function$
begin
  perform public.admin_guard();
  delete from messages where job_id in (select id from jobs where request_id = p_request_id);
  delete from jobs where request_id = p_request_id;          -- cascades reviews; nulls notifications.job_id
  delete from client_requests where id = p_request_id;
end;
$function$;

create or replace function public.admin_set_contractor_status(p_id uuid, p_status text)
returns void language plpgsql security definer
set search_path = public, extensions, pg_temp as $function$
begin
  perform public.admin_guard();
  if p_status not in ('active', 'inactive', 'pending') then
    raise exception 'Invalid status: %', p_status;
  end if;
  update contractors set status = p_status where id = p_id;
end;
$function$;

revoke execute on function public.admin_delete_job(uuid, boolean)         from public, anon;
revoke execute on function public.admin_delete_request(uuid)              from public, anon;
revoke execute on function public.admin_set_contractor_status(uuid, text) from public, anon;
