# Freddy Fix It — CLAUDE.md

Calgary home-services marketplace. Clients post a request → admin/contractors quote or bid → job lifecycle → review.
Live: https://freddyfixit.ca (+ www), https://freddy-fixit.vercel.app

The owner is **non-technical** and deploys by pasting terminal commands. Optimize every answer for that:
ship one runnable thing, keep explanations short, never assume CLI fluency.

## Stack
- **Frontend:** React 19 + TypeScript + Vite + Wouter (routing) + Framer Motion. Build = `vite build` (esbuild, **no typecheck** — type errors don't block deploys).
- **Backend:** Supabase only (Postgres + Auth + RLS + Storage + Edge Functions). No app server. "API" = PostgREST (`supabase.from(...)`) for reads + `SECURITY DEFINER` RPCs / edge functions for privileged writes.
- **Deploy:** Vercel auto-deploys from GitHub `main`. Email via Resend. DNS via Cloudflare.
- Details by area: see `src/CLAUDE.md` (frontend) and `supabase/CLAUDE.md` (DB/functions).

## How work ships (READ THIS FIRST)
Repo `github.com/karanmann137-creator/freddy-fixit` is **PUBLIC**. The assistant can clone but **cannot push**; the owner deploys by running installer scripts.

1. Clone once per session to `/home/claude/ff4`. This clone is **cumulative** — keep editing it across turns; don't re-clone fresh mid-project (you'd lose un-pushed edits).
2. Edit files in the clone (`str_replace`/`create_file`). Validate with `npx vite build` before shipping.
3. Emit ONE installer `.sh` to `/mnt/user-data/outputs/` that base64-decodes each changed file into `~/freddy-fixit/`, then `git add -A && commit && push`. Verify the installer round-trips (decode == source) before presenting.
4. Owner runs: `bash ~/Desktop/Website/apply-<x>.sh`, waits for `✅ … pushed`, then hard-refreshes (Cmd+Shift+R).

**Installer rules:**
- Installers are **cumulative per file** and **supersede** older installers that touch the same files. Owner runs **only the newest**; running an older one after a newer one reverts changes.
- When in doubt, ship a **superset** installer (include every file from prior installers + the new ones) so "run the newest" always delivers everything.
- **DB changes are NOT in installers** — apply them live via Supabase MCP tools (migrations / RPCs / edge-function deploys). Edge-function source is also committed to the repo (via installer) for version control, but deploying it is a separate Supabase step.

## Build / validate commands
```
cd /home/claude/ff4
npm install            # first time
npx vite build         # full build (catches import/JSX errors; no typecheck)
npx esbuild <file> --loader:.tsx=tsx   # quick single-file parse check
```

## Brand tokens
Navy `#1a2236` · section navy `#151d2e` · footer `#111827` · orange `#ea6b14` · text `#f0f4ff`.
Fonts: Bebas Neue (headings), DM Sans (body). Loaded per-page via a Google Fonts `<link>`.

## Current feature state (live unless noted)
- Auth + role-gated dashboards (client / contractor / admin). Auth-deadlock fix in place (never call supabase queries inside `onAuthStateChange`).
- Job lifecycle: assign → contractor proposes time+price → client approves → contractor completes+photo → client confirms → auto-confirm after 3 days (pg_cron). In-app 🔔 + email notifications.
- Bidding (max 3 bids/request), client-picks-from-bids, admin assign/approve.
- Contractor onboarding with vetting (licensed/insurance/WCB/references) + company name; admin review line; FAQ on home; full service-category list.
- **Self-serve account deletion** (`delete-account` edge fn + `DeleteAccount` component) with re-signup flagging for poorly-rated contractors. See `supabase/CLAUDE.md`.
- **Claims / dispute process.** Client files a formal claim (`ReportProblem` → `open_dispute` RPC: structured fields — reason, service date, agreed scope, requested remedy, amount, signed declaration + photos) which freezes payment to `disputed` and notifies contractor + all admins (in-app + email via notifications→send-notification). Contractor sees the claim on their job and responds within a 3-day window (`RespondToClaim` → `respond_to_dispute` RPC). Admin reviews both sides in the disputes tab and resolves via `resolve-dispute` edge fn (full/partial refund or release). Photos in private `problem-photos` bucket; dispute parties can read each other's via RLS.
- **Returning-client new-request flow** (`NewRequest`): signed-in users skip signup and get a short form ("same address as last time?"). `ClientOnboarding` branches logged-out→signup, logged-in→NewRequest.
- Code-review pass done: client-dashboard query parallelized, server-side Browse specialty filter (GIN), admin pagination, admin status RPC, RLS `(select auth.uid())` wrapping, contractor-earnings single source of truth (jobs → trigger).

- **SEO service landing pages (2026-06-27).** `/services` index + `/services/:slug` (ServicesIndex.tsx / ServiceLanding.tsx) target Calgary trade searches ("handyman calgary", "calgary plumber", etc.). 18 slugs, each with per-page meta + Service/FAQPage JSON-LD, "what we cover"/"how it works"/FAQ/related-services sections, CTAs to /client-onboarding?service=<name> (name matches Home SERVICES label). Site-wide LocalBusiness+WebSite JSON-LD in index.html. Sitemap + footer carry internal links to all service pages.

- **Homepage conversion rework + contractor recruitment (2026-06-27).** Hero tagline now "Calgary's Vetted Handymen & Trades — On Demand"; client "I Need a Fix" card is primary (first + orange-bordered) with CTA "Get my free quote". New `/for-contractors` recruitment landing page (ForContractors.tsx) — value props (no fees/lead-buying, secure payout, local jobs), how-it-works, FAQ+JSON-LD, CTA→/contractor-onboarding; linked in footer + sitemap. Offline deliverables (owner's Desktop, not in repo): Google-Business-Profile-Guide.docx, Contractor-Recruitment-Kit.docx.

- **Social proof + analytics + SEO batch (2026-06-27).** (1) Homepage "Built On Trust" section now surfaces real client reviews dynamically via new `get_homepage_reviews(p_limit)` SECURITY DEFINER RPC (reviews with a comment, reviewer first name + contractor company name; granted to anon/authenticated). Graceful empty state = the three honest trust cards (no fabricated testimonials; only 1 review with no comment exists in DB). (2) Google Analytics 4 scaffolding: `src/lib/analytics.ts` (placeholder `GA_MEASUREMENT_ID = "G-XXXXXXXXXX"` — OFF until a real ID is pasted; IP anonymized, send_page_view:false). `initAnalytics()` in main.tsx, `trackPageView()` on route change in App.tsx ScrollToTop, conversion events `generate_lead` (GetQuote), `post_job`+`sign_up` (ClientOnboarding), `sign_up` (ContractorOnboarding). Privacy Policy §11 updated to disclose GA4 + cookies + opt-out, and Google LLC added to service-provider table. Owner deliverable: Analytics-Setup-Guide.docx (GA4 + Search Console walkthrough, on Desktop). (3) 3 new Calgary SEO blog posts: calgary-electrician-cost-2026, calgary-furnace-repair-replacement-cost-2026, hiring-a-contractor-calgary-questions-permits (Blog.tsx + BlogPost.tsx article components + POST_DESCRIPTIONS + sitemap). 
- **Pending owner input:** seed contractors Slone (a01c49f7-0ba6-4e0a-bc81-aba53baebcb7) and Justin (44748517-72d6-440a-ab06-b13e2660cc80) still have NULL company_name + vetting answers — apply real values via Supabase MCP once owner provides them.

- **Google review popup (2026-06-27).** `src/lib/reviewPrompt.ts` fires a `window` CustomEvent `ff:google-review`; `src/components/GoogleReviewModal.tsx` (brand navy/orange card, 5 stars) listens for it and is mounted once in App.tsx beside ChatWidget. Triggered at three moments only: account created + job posted (ClientOnboarding both success/verify branches; NewRequest after returning-client post) and job done (ClientDashboard confirmCompletion after RPC). localStorage dedupe: signup/post each ask once ever, job_done dedupes per jobId, ~21-day cooldown between any prompts, "Don't ask again" opt-out. **OFF until owner pastes the platform Google Business Profile review URL** into `GOOGLE_REVIEW_URL` (placeholder contains REPLACE_WITH → popup never shows while placeholder).

## Gotchas
- esbuild build has **no typecheck**; rely on `vite build` for real errors. `any` is used liberally.
- Node/JSX authoring: avoid `${` inside template literals in generator scripts; for `$` amounts in JSX use `{"$" + x}`; embed CSS as `<style>{"...double-quoted css..."}</style>` (no backticks).
- Prior sessions shipped features that were never documented (DeleteAccount, NewRequest, the flags table). **Before building anything, check whether it already exists in the repo/DB.**

## Privacy / safety
- Repo is PUBLIC → never commit secrets (service-role key, etc.) or user PII (real contractor/client emails, phones, names). Reference seed rows by UUID; look up details in the DB when needed.
- Business contacts only: admin `hello@freddyfixit.ca`, from `noreply@freddyfixit.ca`.

## Open / queued
- **Stripe Connect payments — BUILT & LIVE (2026-06-26).** Separate charges+transfers via Stripe-hosted Checkout. Client pays Job price + **3% service fee**; funds held; on client confirmation (or 3-day auto-confirm) **93%** is released to the contractor and the platform keeps the **7%** commission. 6 edge functions deployed; `STRIPE_SECRET_KEY` switched to `sk_live`, single webhook destination set (`STRIPE_WEBHOOK_SECRET`). Test-mode Connect accounts were cleared so contractors re-onboard live payout accounts. Verified live with a real test charge.
- **Legal pages — BUILT & LIVE.** User Agreement (incl. Contractor Terms + §6.7 Fees), Privacy Policy (Alberta PIPA + PIPEDA; discloses Stripe/Supabase/Vercel/Resend; 7-yr payment retention; OIPC Alberta rights), and Homeowner Protection Promise. Routed (`/user-agreement`, `/privacy-policy`, `/homeowner-protection-promise`), linked in footer, and gated behind an acceptance checkbox in all signup flows (ClientOnboarding, ContractorOnboarding, NewRequest). Company entity: **Freddy FixIt Contractors Inc.**
- Set seed contractors' `company_name` + vetting answers in DB (owner to provide values).
- Keep this file + `src/CLAUDE.md` + `supabase/CLAUDE.md` current as features land.
