# Freddy Fix It — code quality & maintainability review
**2026-08-22 · report only, no code changed**

## How to read this

Every claim below was verified against the live system, not inferred from a grep count. "Unused" means: zero references in `src/`, zero in `supabase/functions/`, zero in any other `pg_proc.prosrc` (word-boundary regex, not `LIKE '%…%'`), zero in RLS policies, zero in triggers, and zero in `cron.job`. Where a subagent's finding turned out to be overstated I say so rather than repeating it.

Findings are ranked by **payoff ÷ risk**, not by size. Tier 0 items are safety issues that surfaced during the cleanup pass and should be handled before anything else. Tier 4 is the "flag, don't cut" list: things that look dead by usage but are deliberately unproven, and must not be deleted.

**Two numbers frame the whole review.** The repo tracks **597 files**, of which **only 101 are `src/` and 107 are `supabase/`** — 359 tracked files are neither app code nor infrastructure. And the database currently holds **1 job, 0 contracts, 0 milestones, 0 prepay pools, 0 disputes, 0 messages, 0 held payments**. So low usage is *not* evidence of dead code here; almost nothing has been exercised. That is exactly why the "flag, don't cut" rule matters.

---

# Tier 0 — Safety. Do these first.

## 0.1 `new-contractors.csv` publishes 66 real business contacts from a public repo

**What.** Root-level, tracked in git, 67 lines. Header: `Trade,Company Name,Contact Info,Specific Trade(s),Opening Hours,general quote`. 66 of 67 rows contain an email address or a phone number.

**Why it shouldn't be there.** `CLAUDE.md` states the rule itself: *"Repo is PUBLIC → never commit … user PII (real contractor/client emails, phones, names)."* This file breaks that rule. Even if each contact came from a public listing, the compiled artifact is a prospect list published under the company's own name — a different thing legally and reputationally from the same facts scattered across the web, and awkward under Alberta PIPA given the privacy policy you publish.

**Impact of removing.** 5.7KB. Zero functional impact — nothing imports it; it was a one-off recruiting worksheet.

**Risk.** Deleting the file from `HEAD` does **not** remove it from history. Anyone can still read it at an older commit. Treat the contents as already disclosed.

**Cleanup plan.** Remove from the index (`git rm --cached new-contractors.csv`), add it to `.gitignore`, keep the local copy on the owner's Desktop with the other offline deliverables. History rewriting (`git filter-repo`) is possible but breaks every existing clone and every `apply-*.sh` assumption; given the data is business-directory-grade, removing it going forward is the proportionate response. Do not spend a session on a force-push.

## 0.2 `.gitignore` has no `.env` rule at all

**What.** `.env` is tracked. Its current contents are only `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` — both of which ship publicly in the JS bundle anyway, so **this is not a live secret leak**. But `.gitignore` contains no `env` pattern of any kind.

**Why it matters.** This is a loaded trap rather than a current wound. The moment anyone adds `STRIPE_SECRET_KEY`, `RESEND_API_KEY` or the service-role key to `.env` for local work — the natural thing to do — it is committed to a public repo on the next `git add -A`, which is exactly what every installer script runs. The blast radius is the whole platform: live Stripe keys and the service-role key bypass RLS entirely.

**Impact.** None today. Removes a category of catastrophic future mistake.

**Risk.** If `.env` is untracked, a fresh clone has no Supabase URL/key and `npm run dev` fails until `.env` is recreated. Mitigate with a committed `.env.example`.

**Cleanup plan.** Add `.env`, `.env.local`, `.env.*.local` to `.gitignore`; `git rm --cached .env`; commit `.env.example` holding the two `VITE_` names with placeholder values; note the two real values in the owner's password manager.

## 0.3 `send-reminder` is live in production with no recoverable source

**What.** Deployed as `send-reminder` v1, `verify_jwt=false`, and — unlike the other source-less functions — it is **actually called**: the DB function `notify_user` invokes it. There is no `supabase/functions/send-reminder/` directory.

**Why it matters.** This is the inverse of dead code: running code nobody can read, edit or audit. It cannot be reviewed for the security posture the rest of the platform now follows (`verify_jwt=false` plus no in-code identity check means anyone on the internet can invoke it), and if it ever misbehaves the only remedy is to delete it and break `notify_user`.

**Impact of acting.** Restores auditability of a live mail path.

**Risk.** Do **not** delete this one. Redeploying over it from a guess would silently change notification behaviour on a path that runs on every `notify_user` call.

**Cleanup plan.** Pull the deployed bundle (`supabase functions download send-reminder`) into the repo, read it, then decide: gate it with the existing internal-token primitive, or fold its behaviour into `send-notification` and retire it. Until then, leave it alone.

---

# Tier 1 — Zero-risk deletions. Highest payoff per minute.

## 1.1 259 tracked files belong to an abandoned agent framework

**What.** `.claude/` (239 files, 2.0 MB), `.claude-flow/` (15 files), `.swarm/` (5 files, 1.6 MB) and `ruvector.db` (1.6 MB) are all tracked. They are configuration and state for a multi-agent orchestration tool — swarm coordinators, byzantine consensus agents, SPARC command docs — none of which touches the running product.

**Why unnecessary.** Nothing in `src/`, `supabase/` or the build reads any of it. `ruvector.db` and `.swarm/swarm-state.json` are machine-generated *state*, not configuration; they are the kind of file that produces a spurious diff on every session and trains people to `git add -A` without looking.

**Impact.** Removes **43% of all tracked files** and ~5 MB from the working tree. The practical win is that `git status` becomes readable again, which is what makes the next person notice when something real changes.

**Risk.** Low, but not zero: if the owner still runs claude-flow locally, deleting `.claude-flow/config.yaml` loses its settings. `.claude/` may also hold slash-commands someone uses.

**Cleanup plan.** Untrack rather than delete: `git rm -r --cached .claude-flow .swarm ruvector.db`, add all three plus `*.db` to `.gitignore`. Leave the directories on disk. Handle `.claude/` separately — check whether any of its 239 files is a command the owner actually invokes; if not, untrack it the same way.

## 1.2 52 `apply-*.sh` installers, 16 MB, tracked

**What.** 52 installer scripts at the repo root totalling 16 MB — each one carrying base64 payloads of files that have since been superseded.

**Why unnecessary.** An installer is a delivery mechanism with a lifespan of one deploy. `CLAUDE.md` already says "the owner runs only the newest." Keeping the old ones tracked is worse than useless: a stale superset installer is precisely the thing that has broken production twice (`56f96d3` wiped the pipeline strip; `fa5e2b5` orphaned `ContractPanel` and made every job unpayable). Having 52 of them one tab-complete away is a live footgun.

**The root cause is worth fixing, not just the symptom.** `.gitignore` lists **thirteen individual installer filenames** — `apply-auth-oauth.sh`, `apply-bugfixes.sh`, `apply-legal-pages.sh` and so on — instead of one `apply-*.sh` glob. So every new installer is tracked by default and someone has to remember to add it by name. Nobody did, 52 times.

**Impact.** −16 MB, −51 tracked files, and the footgun is disarmed.

**Risk.** Genuinely low. These are re-generatable from git history and none is re-runnable safely anyway (each embeds a snapshot of files that have moved on). The only real loss is a rough audit trail of what shipped when — which the commit log already holds, better.

**Cleanup plan.** Replace the thirteen named lines in `.gitignore` with a single `apply-*.sh`, then `git rm --cached apply-*.sh`. Keep the local files. If the owner wants a record, `git log --oneline` is it.

## 1.3 Root-level `migration-*.sql` duplicates of `supabase/migrations/`

**What.** Five loose files at the repo root — `migration-contract-permits.sql`, `migration-require-payout-before-contract.sql`, `migration-require-payout-to-bid.sql`, `migration-service-compulsory.sql`, `migration-verification-markers.sql` — alongside the canonical 49 files in `supabase/migrations/`.

**Why unnecessary.** Two locations for the same artifact, with no rule saying which wins. `supabase/migrations/` is the one the CLI reads. The root copies are the version somebody pasted into the MCP session.

**Impact.** Small in bytes, meaningful in clarity: it removes the question "which of these two files is the one that ran?"

**Risk.** Before deleting, confirm each root file has a genuine counterpart in `supabase/migrations/` — if any root file contains DDL that was applied live but never migrated into the canonical folder, deleting it loses the only record.

**Cleanup plan.** Diff each of the five against its `supabase/migrations/` counterpart. Move any orphan into `supabase/migrations/` with a proper timestamp prefix; delete the rest.

## 1.4 `supabase/.temp/` — 9 CLI cache files tracked

**What.** `cli-latest`, `gotrue-version`, `linked-project.json`, `pooler-url`, `postgres-version`, `project-ref`, `rest-version`, `storage-migration`, `storage-version`.

**Why unnecessary.** These are the Supabase CLI's local scratch cache. They change whenever the CLI or the hosted platform version moves, producing meaningless diffs, and `pooler-url` in particular is connection-topology detail with no business being in a public repo.

**Impact.** Trivial size; removes a recurring source of noise diffs.

**Risk.** None. The CLI regenerates all of them.

**Cleanup plan.** `git rm -r --cached supabase/.temp` and add `supabase/.temp/` to `.gitignore`.

## 1.5 `src/components/IntroTips.tsx` — 105 lines, orphaned, and documented as live

**What.** The only occurrence of the string `IntroTips` anywhere in `src/` is its own `export default` on line 17. It is not imported by `App.tsx` or anything else.

**Why unnecessary.** It renders nothing because nothing mounts it. Its localStorage flag `ff_seen_intro_tips` is never written, so the feature is not merely off, it is unreachable.

**This one carries a documentation lesson.** `CLAUDE.md` describes it as shipped and working: *"two first-visit coach-marks (Settings gear, chat bubble) for logged-out first-timers only … hidden on auth/onboarding/dashboard routes (and the flag is only burned when actually shown)."* That is a precise description of code that has never run. Most likely a superset installer dropped the mount in `App.tsx` — the same failure mode that once orphaned `ContractPanel` — and nobody noticed because there is no test and no typecheck error for an unused component.

**Impact.** −105 lines. More valuable: it settles whether the feature exists.

**Risk.** The only risk is choosing wrong between the two options. If the coach-marks were wanted, deleting them loses working code; if they were deliberately dropped, keeping the file keeps lying in the docs.

**Cleanup plan.** Ask the owner one question: do you want first-visit tooltips? If yes, add `<IntroTips />` to `App.tsx` alongside the other globals and test it logged-out. If no, delete the file and strike the paragraph from `CLAUDE.md`. Do not leave it as-is.

## 1.6 `lucide-react` and `sonner` — two unused dependencies

**What.** Both are in `package.json` `dependencies`. Both have **zero** imports across all 97 files in `src/`.

**Why unnecessary.** `lucide-react` was superseded by the in-house `Ic` component (36 references), which is why `CLAUDE.md` has a whole gotcha about `Ic` lacking a `menu` glyph — the project already committed to `Ic`. `sonner` (toasts) was never adopted; the dashboards use inline banners.

**Impact.** ~39 MB of `node_modules` for `lucide-react` alone. Because both are tree-shaken, the shipped bundle barely changes — the win is install time, `npm audit` surface, and one less library a future session might reach for by accident.

**Risk.** Near zero, and cheaply verified: `npm run typecheck` catches any import instantly.

**Cleanup plan.** `npm uninstall lucide-react sonner`, run `npm run typecheck` (baseline is 0 errors), commit `package.json` + `package-lock.json`. While in there: `recharts`, `date-fns`, `clsx` and `zod` are *not* installed despite being commonly assumed — no action needed, just don't import them.

## 1.7 `src/assets/` — three unreferenced files

**What.** `hero.png` (13 KB), `react.svg` (4.1 KB), `vite.svg` (8.7 KB). Zero references in `src/`, `index.html` or `public/`.

**Why unnecessary.** `react.svg` and `vite.svg` are Vite scaffold leftovers. `hero.png` was superseded by the current hero treatment; the live before/after imagery lives in `public/before-after/` as responsive WebP pairs.

**Impact.** −26 KB, and `src/assets/` disappears entirely, which is one less place to look for images.

**Risk.** None. Vite would fail the build on a missing import.

**Cleanup plan.** Delete the directory. Confirm with `npm run typecheck` and one `npx vite build` on the owner's machine.

## 1.8 Small dead exports

**`hasSpecificQuestions`** in `src/lib/jobQuestions.ts:252` — exported, called by nothing, 3 lines. Delete.

**`src/lib/theme.ts` over-exports.** `applyTheme`, `applyTextScale` and `DEFAULT_SCALE` are exported but used only inside the module, by `initPrefs`/`setTheme`/`setTextScale`. The only external consumers are `initPrefs` (from `main.tsx`) and the getters/setters used by `SettingsModal`. Narrowing the exports costs nothing and stops a future session from calling `applyTheme` directly and bypassing the localStorage write that `setTheme` performs — a real bug waiting to happen, since the two look interchangeable from the outside.

**Note on two earlier false positives.** I initially flagged `src/lib/serviceTags.ts` (426 lines) and `src/lib/jobQuestions.ts` (274 lines) as largely dead based on external-import counts. Tracing the internal call graphs showed both are essentially fully reachable — the entry points fan out to nearly everything below them. Only the 3-line `hasSpecificQuestions` is genuinely dead. **Do not delete either file.** This is a good illustration of why import counts alone are not evidence.

## 1.9 Duplicate and stale root documents

`SESSION-HANDOFF.md` and `SESSION_HANDOFF.md` both exist — hyphen and underscore. Keep one. Separately, `*.docx` and `*.pages` marketing binaries total 972 KB of tracked, undiffable content (`Analytics-Setup-Guide.docx`, `Contractor-Recruitment-Kit.docx` *and* `Contractor-Recruitment-Kit .pages` with a space in the name, the two marketing plans, the go-to-market playbook, the payout and GBP guides). `CLAUDE.md` already describes these as "offline owner deliverables (Desktop, not in repo)" — the docs and reality disagree. Move them to the Desktop folder the docs claim they live in, and untrack. Same for `loadtest-freddyfixit.js` + `loadtest-summary.json`, a one-off load test from July that nothing references.

---

# Tier 2 — Low risk, worth a small deliberate change.

## 2.1 `upsertMeta` is copy-pasted, byte-identical, into six pages

**What.** The same function, same signature, in `ServiceLanding.tsx`, `ForContractors.tsx`, `BlogPost.tsx`, `ServicesIndex.tsx`, `AreaLanding.tsx` and `About.tsx`:

```ts
function upsertMeta(selector: string, attr: "name" | "property" | "rel",
                    key: string, content: string,
                    valueAttr: "content" | "href" = "content")
```

**Why unnecessary.** Six copies of ~9 lines with no divergence between them. Every one of these pages sets per-page SEO meta and JSON-LD — this is the SEO surface, so a fix applied to five of six copies is a silent partial fix.

**Impact.** −~54 lines, and one place to change when the meta strategy moves.

**Risk.** As close to zero as a refactor gets: identical bodies, pure DOM side effect, and `npm run typecheck` proves every call site still resolves. The only real risk is a botched find-and-replace, which the typecheck catches.

**Cleanup plan.** Add `upsertMeta` to a new `src/lib/seoMeta.ts` (or to an existing lib file), delete the six local definitions, add the import to each page, run `npm run typecheck`, and spot-check one page's `<head>` in the browser after deploy. Do this as its own installer — it touches six files and nothing else, so a bad round-trip is obvious.

## 2.2 `notify-client` is a tombstone that is still deployed

**What.** `supabase/functions/notify-client/index.ts` exists in the repo and is deployed as v11 — and its body returns `{ error: "notify-client has been retired" }`. Nothing anywhere invokes it.

**Why unnecessary.** Somebody already did the hard part: they neutered it. What is left is a deployed HTTP endpoint that exists solely to say it does not exist.

**Impact.** One fewer deployed function; one fewer directory in `supabase/functions/`.

**Risk.** Effectively none — the function already fails on every call, so undeploying it cannot change any behaviour that currently works.

**Cleanup plan.** `supabase functions delete notify-client`, then delete the directory.

## 2.3 Four deployed edge functions with no source and no callers

**What.** Cross-referencing the 48 deployed functions against the 43 in the repo leaves five with no source. `send-reminder` is live (Tier 0.3). The other four have **zero** references from `src/`, from other edge functions, from any DB function, trigger, RLS policy or cron job:

| Slug | Version | `verify_jwt` |
|---|---|---|
| `analyze-repair` | 3 | false |
| `remind-contractor` | 8 | false |
| `resend-domains` | 2 | true |
| `send-welcome` | 10 | false |

**Why unnecessary.** They are unreachable from the product and unreadable by the team. `send-welcome` in particular was superseded by `contractor-welcome` v2; `remind-contractor` by `send-reminder`/`run_reminders`.

**Why this is more than tidiness.** Three of the four are `verify_jwt=false`, meaning they are open, unauthenticated, publicly-addressable HTTP endpoints whose code nobody has read. If any calls Resend, it is an open mail relay attached to your sending domain — and your DKIM reputation is the thing that already took the platform's whole email system down once.

**Impact.** Removes three unauthenticated public endpoints of unknown behaviour.

**Risk.** The zero-caller finding is strong but not absolute: an external system (a Zapier hook, a Stripe endpoint, a bookmark, a cron on the owner's machine) could be calling one. Deleting is irreversible without the source.

**Cleanup plan.** Two steps, in order. First `supabase functions download <slug>` for all four and commit the source — this costs nothing and makes the decision reversible. Then check the edge-function invocation logs for the last 30 days; anything with zero invocations gets deleted, anything with traffic gets investigated before it does.

## 2.4 Confirmed-dead database functions

Each of these has zero references in `src/`, in `supabase/functions/`, in any other function body (word-boundary matched), in any RLS policy, in any non-internal trigger, and in `cron.job`.

**Superseded by a renamed successor** — the old name was left behind when the new one shipped:

| Dead | Live successor |
|---|---|
| `client_remove_request` | `remove_client_request` |
| `client_update_request` | `update_client_request` |
| `contractor_withdraw_job` | `withdraw_job` |
| `request_quote_revision` | `propose_price_change` |
| `delete_my_account` | the `delete-account` edge function |

**Dead with no successor:** `contractor_update_job` and `update_job` (both), `set_quote`.

**One-shot campaign scripts** that ran once and were never removed: `send_login_fix_apology`, `send_visit_time_confirm_oneshot`.

**Never-built admin UI:** `admin_review_social_action` and `admin_list_social_actions` have no callers. Their counterpart writers — `social_propose_action`, `social_record_outbound`, `social_upsert_turn` — *are* called by `social-bot-brain`. So the social bot can propose an action, but the approval screen that was meant to review it was never built. That is a design gap to note, not two functions to delete in isolation. See Tier 4.

**Also dead:** `scan_rate_check`.

**A two-function dead cluster:** `client_fee_rate` is called by nothing, and `client_completed_jobs` is called only by `client_fee_rate`. Delete the caller and the callee becomes dead too — remove both.

**Impact.** Roughly a dozen functions out of a large catalogue. The value is not bytes: it is that `client_remove_request` and `remove_client_request` sitting side by side in the function list is an active hazard. A future session — or a future you at 11pm — will call the wrong one, and in this codebase the wrong one hard-deletes a job and cascades every child row including disputes.

**Risk.** The main risk is a caller I could not see: PostgREST exposes every `public` function over HTTP, so an old cached frontend bundle, a bookmarked URL, or a manual `curl` could still hit one. There is no way to prove absence from static analysis alone.

**Cleanup plan.** Do not drop them blind. First `revoke execute … from anon, authenticated, public` on each (remember the default grant is to `PUBLIC`, so revoking from `anon` alone is a no-op — this exact trap is already documented in the security section). Leave the revokes in place for two weeks and watch for errors. Then `drop function` in a single migration, committed via installer for version control. Write the migration so each drop is a separate statement, so one failure does not roll back the batch.

## 2.5 The re-signup flagging feature has a dead older half

**What.** Three functions form a self-contained cluster: `ff_hash`, `record_deleted_contractor_flag`, and `flagged_deleted_matches`. `record_deleted_contractor_flag` and `flagged_deleted_matches` have no callers; `ff_hash` is called only by those two.

**Why they're dead, and why it's more interesting than it looks.** The feature itself is live — but through a *different* implementation. The `delete-account` edge function writes flags directly to `deleted_account_flags` (line 108) using a plain `sha256Hex()`, and the live reader `admin_resignup_matches` matches on plain `encode(digest(e,'sha256'),'hex')`. Those two agree, so the Accounts tab works.

The dead trio uses `ff_hash`, which **peppers** the input first: `digest('ffix_v1_pepper_8f3a' || p, 'sha256')`. A peppered hash can never equal an un-peppered one. So these are not just unused — if anyone wired them back in, they would write rows that `admin_resignup_matches` can never match, and the re-signup flagging would silently return nothing while appearing to work.

**Impact.** Removes a booby-trapped parallel implementation of a live feature.

**Risk.** Low, with one caveat: check whether any rows already in `deleted_account_flags` were written by the old peppered path. If so they are permanently unmatchable and should be deleted alongside, or the admin will keep seeing a table with rows and a screen with no results.

**Cleanup plan.** Same revoke-then-drop sequence as 2.4. Delete all three together — dropping `ff_hash` alone would break the other two, and dropping the other two alone leaves `ff_hash` orphaned.

**Worth noting separately:** the pepper `'ffix_v1_pepper_8f3a'` is a hardcoded literal in a `SECURITY DEFINER` function body, and `pg_proc.prosrc` is publicly readable — a point the security audit already makes about not embedding service-role keys. A pepper that anyone can read provides no protection over a plain hash. Since the function is being deleted anyway this is moot, but do not resurrect the pattern.

---

# Tier 3 — Real performance and maintainability wins that need a plan.

## 3.1 One pagination click in the admin dashboard fires ~14 round trips

**What.** `AdminDashboard.tsx:131`:

```ts
// Reload whenever any tab's page changes (also fires once on mount).
useEffect(() => { loadAll(); }, [page]);
```

`page` is an **object**, mutated via `setPage(p => ({ ...p, requests: n }))`. Every spread produces a new object identity, so the effect fires on every page change of *any* tab — and `loadAll()` reloads everything: requests, jobs, accounts, bids, re-signup matches, disputes, quote leads, health, prepayments, picks.

**Why it's wasteful.** Paging the Requests tab re-fetches the entire Accounts list, every dispute, every prepayment and the health check. The comment on the line ("also fires once on mount") shows the object dependency was deliberate as a mount trigger — the reload-everything consequence looks unintended.

**Compounding it: several of those reads are unranged.** In the same `loadAll`:

```ts
supabase.from("bids").select("*").order("amount", { ascending: true }),
```

Every bid ever placed, no `range()`, no `limit()`. `admin_list_accounts()`, the `disputes` select (which joins into `jobs`) and the `recurring_prepayments` read are likewise unbounded. Today that is 14 bids and it is invisible. At a thousand jobs it is the admin dashboard timing out, and it will arrive as "the admin page is broken" rather than as a gradual slowdown.

**Impact.** Cuts admin round trips by roughly an order of magnitude per interaction and removes a growth cliff before it is hit.

**Risk.** Moderate — this is the highest-value item in the report and also the one most able to break something quietly. `loadAll` currently guarantees that every piece of state is fresh after any interaction; splitting it means some tab can now show stale data. Worse, the existing error handling checks each `Promise.all` result's `.error` and shows a banner naming the failed areas; a careless split can lose that, and `CLAUDE.md` records that a swallowed error here previously rendered a **silent false-empty tab**.

**Cleanup plan.** Three steps, smallest first.
1. Change the dependency to primitives: `[page.requests, page.jobs, …]`, or hold each tab's page in its own `useState`. This alone removes the accidental full reload with a one-line change.
2. Split `loadAll` into per-tab loaders, each keeping its own `try`/`catch` and contributing to the same failure banner. Newer tabs already load in their own `try`/`catch` — extend that pattern rather than inventing a new one.
3. Add `.range()` to the four unbounded reads, matching the existing `PAGE_SIZE = 20` convention, and surface a count so the admin knows there is more.

Ship step 1 by itself and let it sit for a few days. Steps 2 and 3 are a separate installer.

## 3.2 The admin Jobs tab renders 20 `ContractPanel`s per page

**What.** `AdminDashboard.tsx:1001`, inside `jobs.map`, with `PAGE_SIZE = 20`:

```tsx
<ContractPanel role="admin" job={j} />
{j.is_milestone && <MilestonePanel role="admin" job={j} />}
```

Unconditional. Both other dashboards gate it — `ContractorDashboard.tsx:1424` renders it only for the expanded job, and its own code comment says why: *"expanded job renders a ContractPanel, so the anchor id is unique."*

**Why it's a problem, in two ways.** First, load: each mounted `ContractPanel` fires its own `get_job_contract` RPC, so opening the Jobs tab makes 20 sequential-ish RPC calls for contracts the admin has not asked to see. Second, and more subtly, **`CONTRACT_ANCHOR = "ff-contract-panel"` is spread onto all seven of `ContractPanel`'s return branches** — so 20 mounted panels put 20 elements with the same `id` in the DOM. Duplicate ids are invalid HTML and `scrollIntoView`/anchor targeting resolves to whichever came first, which is why the contractor dashboard gates it in the first place.

**Impact.** ~20 fewer RPCs per Jobs-tab render, and the anchor invariant is restored on the one page that currently violates it.

**Risk.** Low functionally, but this is the contract surface, and `CLAUDE.md` is emphatic: *"This is the highest-risk surface on the platform. A superset installer once dropped the `<ContractPanel/>` mounts, and because the gate fails closed, every job became unpayable with no error anywhere."* The failure mode of touching this is invisible, so the change must not be casual.

**Cleanup plan.** Copy the contractor dashboard's pattern exactly — gate on an `activeJobId === j.id` expansion state — rather than inventing a variant. Add a "View contract" toggle per row. After deploying, verify by hand that an admin can still open a contract on a real job. This is worth its own minimal installer with nothing else in it.

## 3.3 Money math is implemented three times

**What.** Three independent implementations of "is this job funded, and what is owed":

`ClientDashboard.tsx:705-748` — the fullest version, seven helpers (`jobTotal`, `jobFunded`, `jobDueNow`, `jobBalance`, `jobFullyFunded`, `depositSplit`, `r2`), and the only one that knows about the fee rate and the referral waiver.

`ContractorDashboard.tsx:937-946` — `jobBalanceDue` + `awaitingBalance`, using a `0.005` tolerance.

`JobTimeline.tsx:24-31` — a third inline computation, using a `0.01` tolerance.

**An important correction.** An earlier automated pass reported these as actively diverging in production. Reading all three, that is overstated: **each prefers the database's `fully_funded` generated column when it is present**, and the DB is the authority. The divergence — NULL handling, `0.005` vs `0.01`, the client's exclusive knowledge of the fee and waiver — only manifests on the *fallback* path, which is reached for rows where `fully_funded` is absent. Today that is stale or legacy rows, of which there are effectively none.

So: this is a **maintainability** finding with a currently narrow blast radius, not a live bug. Report it honestly as such. But it is still the right thing to fix, because the money invariant is the one place in this codebase where a quiet inconsistency is expensive — `CLAUDE.md` opens its gotchas with *"a payout requires `payment_status='held'` AND `fully_funded` … miss one and the platform transfers 93% of a job it collected 40% of, silently, on a 3-day timer."*

**Impact.** One definition of funded/owed instead of three, in the subsystem where correctness matters most.

**Risk.** Meaningful. The three copies are not interchangeable — the client version needs `feeRate` and `waivedForJob`, which are React state local to `ClientDashboard`. A naive extraction into a shared lib either drags that state along or silently changes the client's numbers. And there is no test suite: `vite build` does not typecheck, so the only automated safety net is `npm run typecheck`, which cannot catch a wrong tolerance.

**Cleanup plan.** Extract to `src/lib/jobMoney.ts` as **pure functions that take everything they need as arguments** — `jobTotal(job, { feeRate, waived })` rather than reading state. Standardise on the `0.005` tolerance (it matches `create-balance-payment`'s server-side derivation more closely than `0.01` does). Then migrate one call site per installer, starting with `JobTimeline` (display-only, lowest stakes), then the contractor dashboard, and the client dashboard last. Before and after each step, verify against the database that `fully_funded` and the computed value agree for every existing job row. Do not batch these three into one installer.

## 3.4 Three dashboard files hold a quarter of the frontend

**What.** `ContractorDashboard.tsx` 2,418 lines, `ClientDashboard.tsx` 2,145, `AdminDashboard.tsx` 1,532 — 6,095 lines, **24% of the 25,868 lines in `src/`**, across 3 of 97 files.

**Why it's technical debt.** Every finding in Tier 3 lives in one of these three files, which is not a coincidence: file size is what let a duplicated money helper, an over-firing effect and an ungated panel all go unnoticed. They also concentrate the deployment risk — a superset installer carrying a stale copy of a 2,400-line file is exactly how `ContractPanel` got orphaned.

**Impact.** Long-term, not immediate. Smaller files mean smaller installers, and a smaller installer is a safer installer in this specific deploy model.

**Risk.** High if done as a big-bang refactor, and I would not recommend one. These files encode a great deal of hard-won behaviour — attention-row ordering, `ownsScroll` scroll arbitration, the `contractBlocked` fail-closed default, `jobLoadFailed` read-failure handling — much of it documented as fixing a specific past incident. A refactor that loses one of those re-creates the incident.

**Cleanup plan.** Do not schedule a refactor. Instead adopt a rule: **when you next touch a section of one of these files for a feature, extract that section as part of the work.** Natural seams already exist — the "Needs your attention" builders, the money helpers (3.3), the pipeline strip's `STAGE_MATCH`/`STAGE_LABEL` (already module-level), the `<style>` blocks. Extract opportunistically, always with `npm run typecheck` at 0 errors, and always in an installer that does nothing else.

---

# Tier 4 — Flag, don't cut.

Per the scoping decision, everything here looks unused by the metrics but is deliberate. **None of it should be deleted.** Listed so that a future session doing a similar sweep does not "helpfully" remove it.

## 4.1 The unproven money paths

The database currently holds: **jobs = 1, jobs with money = 0, contracts = 0, milestones = 0, prepay pools = 0, disputes = 0, messages = 0, job expenses = 0, time logs = 0, favorites = 0, referrals = 0**. Against that, `bids = 14`, `requests = 5`, `newsletter subscribers = 26`.

So the following are all at zero usage and all intentional: **milestone escrow** (`job_milestones`, `MilestonePanel`, `create-milestone-payment`, `refund-milestone`, six RPCs); **recurring prepay pools** (`recurring_prepayments`, both edge functions); **the dispute/claim path** (`open_dispute`, `respond_to_dispute`, `resolve-dispute`, `ReportProblem`, `RespondToClaim`, `FileClaimModal`); **bid-stage chat** (`BidChat.tsx`, `my_bid_threads`, `bid_thread_open`, `bid_thread_reads`); **job expenses, the job timer and the checklist**; **referrals**; **Freddy Rewind**.

`CLAUDE.md` states the position plainly: *"the held→dispute→release path is still production-untested — no job has ever reached `held`. One real end-to-end live run is owed."* Zero rows is the expected reading for a platform in `waitlist` mode, not evidence of dead code. **Keep all of it.** The one action worth taking is the end-to-end live payment run that is already on the open list — that converts this entire block from "unproven" to "proven" in a single afternoon and is worth more than any deletion in this report.

## 4.2 Deliberately dormant

`reddit-lead-scout` is blocked by Reddit's Responsible Builder Policy with OAuth pre-wired for if that changes. `meta-lead-scout` activates when `META_PAGE_TOKEN` and `META_PAGE_ID` are set. `newsletter-ai-draft` is dormant until `ANTHROPIC_API_KEY` is set. `visit-reminder`'s email is gated off behind `visit_reminder_enabled()` while the cron and the in-app bell still run. Each is off by a documented decision with a documented switch. Keep.

## 4.3 `OverhaulNotice` / `WaitlistForm` are **live right now**

`platform_mode()` currently returns **`waitlist`**, so `OverhaulNotice` and `WaitlistForm` are rendering to every visitor at this moment, and `outbound_paused()` is **true**, which is why the email emitters look quiet. A usage-based sweep would flag all of this as dead. It is the opposite of dead — it is the only thing visitors see. Do not touch.

## 4.4 The social bot's approval screen was never built

`social-bot-brain` calls `social_propose_action`, `social_record_outbound` and `social_upsert_turn`, but the reader RPCs `admin_review_social_action` and `admin_list_social_actions` have no callers — no admin UI exists for them.

This is a **half-wired feature**, and I am flagging it rather than recommending deletion because the missing half is the *approval gate*. The write path can propose an outbound social action; nothing lets a human review it. Before the social bot is ever switched on, either build the review screen those two RPCs were designed for, or confirm the bot genuinely cannot send without approval. Do not delete the two RPCs — they are the specification for the screen that is owed.

## 4.5 `get_job_fee` — documented as canonical, called by nothing

`CLAUDE.md` names it a single source of truth: *"`get_job_fee(client, job)` returns the canonical `{base, rate, fee, total, waived}`"* and *"never hardcode these."* In fact **nothing calls it.** Its only appearance anywhere in the database is inside `platform_health_check`, in the list of function *names* that check 3 asserts still exist — an existence check, not a call. Meanwhile the frontend computes the same numbers itself, three times over (3.3).

**Do not delete it**, for two reasons: dropping it turns health check 3 red, and it is the natural destination for the 3.3 consolidation. The real finding is that the documented invariant is not enforced anywhere. When you do 3.3, make the shared helper call `get_job_fee` — that turns a stale doc claim into a true one and closes both findings at once. If you decide against that, remove `get_job_fee` from the health check's list so the check stops asserting the existence of something the platform does not use.

---

# Appendix A — Documentation drift found along the way

`CLAUDE.md` is unusually good and is doing real work. Three specific claims are now false and should be corrected, because each one would mislead a future session:

1. **`IntroTips` is described as mounted and working.** It is not imported by anything (1.5).
2. **"Six deployed edge functions have no source in the repo"**, listing `send-bid-email` among them. `supabase/functions/send-bid-email/index.ts` now exists. The real count is **five**, and the list is: `analyze-repair`, `remind-contractor`, `resend-domains`, `send-reminder`, `send-welcome`.
3. **`get_job_fee` is described as the canonical fee source.** Nothing calls it (4.5).

Also worth adding to the file: the `.gitignore` lists installers individually rather than by glob (1.2), which is the mechanical reason 52 of them are tracked.

# Appendix B — Suggested order of work

Roughly by payoff ÷ risk, and grouped so each installer does one thing:

1. **Repo hygiene, one commit** — 0.1, 0.2, 1.1, 1.2, 1.3, 1.4, 1.9. Removes ~350 tracked files and closes the `.env` trap. No app code touched, so no deploy risk.
2. **Download the five source-less edge functions** — 0.3, 2.3 step one. Costs nothing, makes everything else reversible.
3. **Dead frontend code, one installer** — 1.5 (after asking about IntroTips), 1.6, 1.7, 1.8. Gate on `npm run typecheck` at 0 errors and one `vite build` on the owner's machine.
4. **`upsertMeta` consolidation** — 2.1. Six files, nothing else.
5. **Admin `[page]` dependency fix** — 3.1 step one. One line, large effect.
6. **Revoke the dead DB functions** — 2.4, 2.5. Revoke only; wait two weeks; then drop.
7. **Admin `ContractPanel` gating** — 3.2. Own installer, hand-verified after.
8. **Money-math consolidation** — 3.3. One call site per installer, `JobTimeline` first, `ClientDashboard` last.
9. **Ongoing** — 3.4, opportunistically, never as a scheduled refactor.

Everything in Tier 4 stays exactly where it is.

# Appendix C — What limits this review

There is no test suite, and `vite build` does not typecheck (esbuild only), so `npm run typecheck` is the sole automated safety net for every recommendation above. It catches broken imports and type errors; it cannot catch a changed tolerance, a lost error branch, or a panel that stopped rendering. That is why every Tier 3 item asks for hand-verification after deploy and its own minimal installer.

PostgREST also exposes every `public` function over HTTP, so "no caller in the codebase" can never fully prove "no caller." That is the reasoning behind the revoke-wait-drop sequence rather than a direct `drop function`.
