-- Close anon execute on the contract gate and the client-delete RPC, and pin
-- two missing search_paths.
--
-- APPLIED LIVE via Supabase MCP. Version control only.
--
-- Four SECURITY DEFINER functions were reachable by `anon`. Two of them —
-- contract_signed and contract_required — were additionally still carrying the
-- DEFAULT grant, which is to PUBLIC, not to anon. That distinction is the trap:
-- `proacl` reads as a bare `=X/postgres`, so
--
--   revoke execute on function f() from anon;
--
-- IS A NO-OP. The privilege lives on PUBLIC and anon inherits it. Both roles
-- have to be named, which is why every revoke below says `from public, anon`.
--
-- WHY THIS NEEDED PROVING BEFORE APPLYING. The contract gate FAILS CLOSED:
-- create-payment-intent, create-balance-payment, create-milestone-payment and
-- create-recurring-prepayment all return 428 when the contract check does not
-- come back positive, and the frontend starts `contractBlocked = true`. So a
-- revoke that caught a real caller would not throw a visible error anywhere —
-- it would make EVERY JOB ON THE PLATFORM UNPAYABLE, silently. That exact
-- outcome has already happened twice from other causes (56f96d3, fa5e2b5).
--
-- Callers were therefore enumerated first, and every one of them holds a real
-- session or a service-role key:
--   * all five edge-function call sites go through their `admin` service-role
--     client, never the anon key
--   * both browser call sites (ClientDashboard, ContractPanel) sit behind
--     ProtectedRoute, so the JWT presented is `authenticated`
-- Nothing on the platform calls these as anon.
--
-- Verified after applying, by rolled-back probe under real JWT claims:
--   contract_signed      as authenticated -> true
--   contract_required    as authenticated -> true
--   contract_ready       as authenticated -> NULL (ready)
--   contract_signed      as anon -> DENIED (correct)
--   remove_client_request as anon -> DENIED (correct)
-- and platform_health_check() green on all 7 checks afterwards.
--
-- The two `alter function ... set search_path` statements are the minimal fix:
-- they do not touch the body, so there is no chance of a DROP/CREATE rewriting
-- a function whose live definition is the thing being relied on. `extensions`
-- is in the list because pgcrypto lives there — omitting it is what killed
-- every signup for a month.

alter function public.contract_signed(uuid)   set search_path = public, extensions, pg_temp;
alter function public.contract_required(uuid) set search_path = public, extensions, pg_temp;

revoke execute on function public.contract_signed(uuid)       from public, anon;
revoke execute on function public.contract_required(uuid)     from public, anon;
revoke execute on function public.contract_ready(uuid)        from public, anon;
revoke execute on function public.remove_client_request(uuid) from public, anon;

grant execute on function public.contract_signed(uuid)       to authenticated, service_role;
grant execute on function public.contract_required(uuid)     to authenticated, service_role;
grant execute on function public.contract_ready(uuid)        to authenticated, service_role;
grant execute on function public.remove_client_request(uuid) to authenticated, service_role;
