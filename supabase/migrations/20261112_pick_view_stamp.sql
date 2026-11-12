-- Pick-page view stamp (2026-11-12).
--
-- On 2026-11-11 all 11 open requests had estimates and no client had picked a
-- pro, and nothing recorded whether the client ever opened the pick link. So
-- "the email never landed" and "they looked and walked away" were
-- indistinguishable, and they need opposite fixes. This records the first view,
-- the latest view and a count, on the request row.
--
-- get_bids_by_token was STABLE; it must be VOLATILE to write. Signature and
-- return shape are unchanged, so the frontend (src/pages/PickPro.tsx) is
-- untouched. The page is a SPA that calls this by RPC, so a mail scanner that
-- only fetches the URL does not count as a view.
--
-- NOTE: this function had no definition in the repo before this file; the body
-- below is the live definition as of 2026-11-11 plus the stamp.

alter table public.client_requests
  add column if not exists pick_first_viewed_at timestamptz,
  add column if not exists pick_last_viewed_at  timestamptz,
  add column if not exists pick_views           integer not null default 0;

create or replace function public.get_bids_by_token(p_token uuid)
returns jsonb
language plpgsql
volatile security definer
set search_path = public, extensions, pg_temp
as $function$
declare
  v_req record;
  v_bids jsonb;
begin
  if p_token is null then return null; end if;

  select r.id, r.status, r.service_needed, r.job_description, r.created_at,
         r.assigned_contractor_id,
         trim(coalesce(p.first_name,'')) as client_first
    into v_req
    from client_requests r
    left join profiles p on p.id = r.user_id
   where r.pick_token = p_token;

  if v_req.id is null then
    return jsonb_build_object('found', false);
  end if;

  -- View stamp. In its own block so a failure here can never stop the client
  -- seeing their estimates. Skipped for service_role, because send-bid-email
  -- calls this same function every time it builds an estimate email and that
  -- is not the client looking.
  if coalesce(auth.role(), '') <> 'service_role' then
  begin
    update client_requests
       set pick_first_viewed_at = coalesce(pick_first_viewed_at, now()),
           pick_last_viewed_at  = now(),
           pick_views           = pick_views + 1
     where id = v_req.id;
  exception when others then
    raise warning 'pick view stamp failed: %', sqlerrm;
  end;
  end if;

  select coalesce(jsonb_agg(x order by x->>'sort_key'), '[]'::jsonb) into v_bids
  from (
    select jsonb_build_object(
             'bid_id',        b.id,
             'contractor_id', b.contractor_id,
             'name',          nullif(trim(coalesce(pr.first_name,'')), ''),
             'company',       nullif(trim(coalesce(c.company_name,'')), ''),
             'rating',        c.rating,
             'rating_count',  c.rating_count,
             'total_jobs',    c.total_jobs,
             'years',         c.years_of_experience,
             'photo_url',     c.photo_url,
             'specialties',   c.specialties,
             'amount',        b.amount,
             'price_low',     b.price_low,
             'price_high',    b.price_high,
             'walkthrough',   coalesce(b.walkthrough_requested, false),
             'message',       b.message,
             'created_at',    b.created_at,
             -- priced bids first (cheapest first), walkthrough offers after
             'sort_key',      case when coalesce(b.walkthrough_requested,false)
                                   then '1' else '0' end
                              || lpad(coalesce(b.amount, b.price_low, 0)::bigint::text, 12, '0')
           ) as x
      from bids b
      join profiles pr on pr.id = b.contractor_id
      left join contractors c on c.id = b.contractor_id
     where b.request_id = v_req.id
       and b.status <> 'declined'
  ) s;

  return jsonb_build_object(
    'found',            true,
    'status',           v_req.status,
    'already_matched',  v_req.status <> 'pending',
    'service',          v_req.service_needed,
    'description',      v_req.job_description,
    'client_first',     nullif(v_req.client_first, ''),
    'created_at',       v_req.created_at,
    'bids',             v_bids
  );
end; $function$;
