-- Add the x-ff-internal header to every DB->edge net.http_post so the receiving
-- function can prove the call came from the database and not from the internet.
-- Done by rewriting the function definition in place so no body is retyped by
-- hand (retyping a 200-line RPC to change one line is how things get dropped).
do $$
declare
  r record;
  v_def text;
  v_new text;
  v_hdr_old text;
  v_hdr_new text;
  v_hits int;
begin
  for r in
    select p.oid, p.proname, pg_get_function_identity_arguments(p.oid) as args
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace and n.nspname = 'public'
    where p.proname in ('accept_bid','place_bid','notify_new_message','kick_newsletter')
  loop
    v_def := pg_get_functiondef(r.oid);
    v_new := v_def;

    -- form A: no Authorization header at all (accept_bid, place_bid)
    v_hdr_old := $q$jsonb_build_object('Content-Type','application/json')$q$;
    v_hdr_new := $q$jsonb_build_object('Content-Type','application/json','x-ff-internal',coalesce(public.issue_internal_token('edge-internal'),''))$q$;
    v_new := replace(v_new, v_hdr_old, v_hdr_new);

    -- form B: anon bearer from a local variable (notify_new_message)
    v_hdr_old := $q$jsonb_build_object('Content-Type','application/json','Authorization','Bearer '||v_anon)$q$;
    v_hdr_new := $q$jsonb_build_object('Content-Type','application/json','Authorization','Bearer '||v_anon,'x-ff-internal',coalesce(public.issue_internal_token('edge-internal'),''))$q$;
    v_new := replace(v_new, v_hdr_old, v_hdr_new);

    -- form C: anon bearer inlined across lines (kick_newsletter)
    if r.proname = 'kick_newsletter' then
      v_new := regexp_replace(
        v_new,
        $q$('Authorization','Bearer eyJ[A-Za-z0-9._-]+')$q$,
        $q$\1,'x-ff-internal',coalesce(public.issue_internal_token('edge-internal'),'')$q$
      );
    end if;

    if v_new = v_def then
      raise exception 'no header expression matched in %', r.proname;
    end if;

    execute v_new;

    select count(*) into v_hits
    from pg_proc p2 where p2.oid = r.oid and p2.prosrc like '%x-ff-internal%';
    if v_hits = 0 then
      raise exception 'patch did not persist for %', r.proname;
    end if;
  end loop;
end $$;
