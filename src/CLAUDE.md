# src/ — Frontend (CLAUDE.md)

React 19 + TS + Vite + Wouter + Framer Motion. Import alias `@/` → `src/`. Styles are inline style objects (no CSS framework). See root `CLAUDE.md` for the deploy/installer model.

## Routes (App.tsx)
Public: `/` (Home), `/login`, `/update-password`, `/client-onboarding`, `/contractor-onboarding`, `/contractors` (Browse), `/client-success`, `/contractor-success`.
Protected via `ProtectedRoute` (role-gated): `/client-dashboard`, `/contractor-dashboard`, `/admin-dashboard`.

## Key pages / components
- `pages/ClientOnboarding.tsx` — on mount checks the session and **branches**: logged-out → 3-step signup flow (calls `supabase.auth.signUp`, creates profile + first request); logged-in → renders `<NewRequest/>`. **Exports `SERVICES` and `SCHEDULES`** (consumed by NewRequest).
- `components/NewRequest.tsx` — returning-client new-request form. Reuses session + saved profile/last-request details, asks "same address as last time?", inserts a `client_requests` row (no signup), redirects to dashboard. Imports `{ SERVICES, SCHEDULES }` from ClientOnboarding (circular import is fine — only used at render time).
- `pages/ClientDashboard.tsx` — loads profile+requests in parallel, then contractor+job (job query embeds `messages(*)`). Realtime 🔔. "+ New Request" → `/client-onboarding`.
- `pages/ContractorDashboard.tsx` — embedded select avoids N+1; earnings stats read DB-maintained `contractor.total_earned` / `total_jobs` (single source of truth, not recomputed).
- `pages/AdminDashboard.tsx` — requests/contractors/jobs tabs with **range-based pagination** (20/page; reloads on page change). Approve/Deactivate call `admin_set_contractor_status` RPC. Shows a **re-signup warning** on contractor cards (hashes the contractor's email/phone/name and matches `deleted_account_flags` where `was_poor`; hashing helpers must stay byte-identical to the `delete-account` edge fn).
- `pages/BrowseContractors.tsx` — reads `get_contractor_directory()` RPC (replaces old contractor_directory view; SECURITY DEFINER, contact-free columns).
- `components/DeleteAccount.tsx` — danger-zone card + typed-"DELETE" modal → `supabase.functions.invoke("delete-account")` → signOut + redirect. Surfaces the function's JSON `error` body (e.g. active-job block).
- `components/RequestPhotoQuote.tsx` — photo/quote widget for an existing request (not a new-request entry point).
- `components/TopNav.tsx` — nav + realtime notifications bell.

## Service categories — keep these in sync
Canonical list = `ContractorOnboarding.tsx` `SPECIALTIES` (stored in `contractors.specialties`). `BrowseContractors.tsx` `CATEGORIES` **must match these strings exactly** (filter uses exact array containment). `Home.tsx` `SERVICES` and `ClientOnboarding.tsx` `SERVICES` carry their own (sometimes reworded) variants + extras like "Other". Adding a category = edit all four.
Current set: General Repairs, Plumbing, Electrical, HVAC, Carpentry, Painting, Drywall, Flooring / Tile, Tire Swap / Rotation, Oil Change, Battery / Brakes, Vehicle Maintenance, Landscaping, Snow Removal, Gutters, Windows & Doors, Siding & Roofing, Garage, Air Conditioning, Cleaning Services.

## Conventions
- Privileged writes go through RPCs / edge functions, not direct table writes (e.g. status changes, bids, deletion). Reads use `supabase.from(...)`.
- Photos upload to Storage under a `${userId}/` prefix (buckets: `problem-photos`, `completion-photos`, `portfolio-photos`).
- JSX/$ gotcha: write money as `{"$" + n.toFixed(2)}`; embed CSS via `<style>{"..."}</style>`; avoid backtick template literals in generator scripts.
- No typecheck on build — but still keep types sane; prefer `vite build` to validate.
