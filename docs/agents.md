# The agent team — cost discipline and the approval gate

Built 2026-11-04 (queue, telemetry, roster, approval UI) and 2026-11-05 (cost budgets,
then the first harness).

**One of the eight agents now has a harness: `lead-response`, enabled 2026-11-05.** The
other seven are still `enabled = false`, which is exactly what that flag means — no
harness exists, so `stale` cannot fire for an agent nobody claimed was running.

Read this before writing a harness, adding an agent, or raising a budget.

---

## The policy, and why it is this way

**Deterministic-first. A model call is the last resort, not the default.** Six of the eight
declared agents need no model at all, because what they actually do is read rows and
compare them. `trade_reach(service)` already answers "would anyone see this job"; a
`client_requests` / `jobs` join already answers "did this lead get stranded". Asking a
language model to re-derive an answer SQL already holds costs money, adds latency, and
introduces a failure mode the query does not have — it can be confidently wrong.

The tiers, in order of what to reach for:

1. **No model (`model = 'none'`).** The agent is a query plus a template. Every finding is
   reproducible and auditable. This is where an agent starts, and most stay.
2. **Haiku.** Classification, extraction, summarising, deciding which of N buckets a thing
   belongs in. Cheap enough to run per row.
3. **Sonnet.** Prose a human will read and send — a blog draft, a reply the owner will
   edit. Reached for once per output, never per row.
4. **Opus.** Allowed by the constraint, used by nothing. If an agent ever needs it, that is
   a conversation, not a config change.

**`model` on the roster is the CEILING, not the only model the agent may use.** A `sonnet`
agent still does its triage on Haiku and its counting in SQL; the column says how far it is
*permitted* to reach. This matters because the alternative — one column per stage — would
be a declaration nobody keeps current.

**A run that finds nothing exits early and logs a zero-proposal run.** It does not "think
about" an empty result set. The `agent_runs` row with `proposals_created = 0` is the point:
it proves the agent ran, which is the thing you cannot query the absence of.

**Caps protect the inbox, not the invoice.** `max_pending` and `max_proposals_per_run` exist
because the owner's approval queue is his **trusted inbox**. A surface that can be flooded
is a surface he learns to scroll past, and that failure undoes the entire approval design —
the same reasoning that governs the health checks and the four monitoring layers. Token cost
is the secondary benefit.

---

## What is a GATE and what is only a DETECTOR

Be precise about this, because the difference decides what you can rely on.

| Rule | Enforced where | Gate or detector |
|---|---|---|
| `max_pending` — proposals waiting at once | inside `agent_propose_action` | **gate** — the only write path into `agent_actions` |
| `max_proposals_per_run` | inside `agent_propose_action`, when the harness passed a `run_id` | **gate**, conditional |
| agent must be on the roster | inside `agent_propose_action` | **gate** |
| `model = 'none'` ⇔ `max_model_calls_per_run = 0` | CHECK constraint | **gate** on the declaration |
| which model the harness actually called | nowhere | **detector only** |
| `max_model_calls_per_run` | compared against `agent_runs.model_calls`, which the harness self-reports | **detector only** |

**The DB cannot stop a harness calling Opus**, any more than it can stop an edge function
posting to an arbitrary URL. What it can do is make the overspend *visible*: the harness
reports its own spend, and `admin_agent_overview` counts the runs that exceeded their
declared budget in the last 7 days. That count is **self-clearing** — it can only be
non-zero because a real run really overspent, so it drops back to zero on its own once the
agent is fixed or the allowance is raised. A permanently-red number is one the owner learns
to ignore, which is why no check here is allowed to be one.

**A cap REFUSES, it does not raise.** A raise would roll back the harness's whole
transaction including the `agent_runs` row that is the only evidence the cap fired. The
refusal returns the same keys as the success path (`id`, `claim_token`, `status`,
`already_open`) with `status = 'capped'`, `capped = true` and a `reason`, so no caller has to
learn a second shape — and `id` comes back `null`, which is what a caller would already
have got from a failure.

**A cap does not freeze a proposal the agent is keeping accurate.** The dedupe refresh
branch runs *before* the cap check: re-proposing an already-open `dedupe_key` updates the
payload and adds nothing to the inbox, so capping it would leave the owner looking at stale
detail with no way to get the fresh version.

---

## The declared roster (2026-11-05)

> **Measured 2026-11-11.** Only `lead-response` has ever run: 7 runs, 10 proposals, 9 still pending, 1 rejected, 0 approved. The other seven rows have 0 runs and no harness. Per the *Scope discipline* rules in the root `CLAUDE.md`, do not build any of them until the owner is working the `lead-response` queue; `contractor-supply` should become a finding kind inside `lead-response` (it is the same `trade_reach = 0` join), and `ops-watchdog` duplicates the watchdog skill, the health-check cron and the smoke workflow.

Seven of eight are `enabled = false`. `enabled` means **"a harness exists and this agent is
expected to run"** — it is step one of wiring each harness, and until it is true `stale`
cannot fire for an agent nobody claimed was running.

| agent | model | AI calls/run | proposals/run | pending | why that model |
|---|---|---|---|---|---|
| `lead-response` | haiku | 1 | 10 | 25 | **ENABLED — harness is `agent_lead_response_run()`, pg_cron `0 14 * * *`.** The scheduled run is a join and spends **nothing**; the Haiku ceiling exists only for the on-demand drafting step, which runs behind a click. See below |
| `ops-watchdog` | none | 0 | 5 | 15 | Reads the 9 health checks, two CI results, deploy state, runtime errors. All values |
| `contractor-supply` | none | 0 | 3 | 10 | `trade_reach(service) = 0` against demand. Pure arithmetic |
| `outreach` | haiku | 5 | 5 | 10 | Classifying a candidate. **CASL review pending — list-only, no send** |
| `social-bot` | haiku | 10 | 5 | 15 | Short replies the owner edits. If draft quality is the complaint, raise this one row — don't move the policy |
| `customer-care` | sonnet | 15 | 5 | 20 | Drafts replies a human sends. Triage on Haiku, the draft itself on Sonnet |
| `marketing` | sonnet | 10 | 3 | 10 | Blog and meta copy. Prose a human reads |
| `dev-test` | sonnet | 20 | 3 | 5 | The test suite is deterministic; writing the fix is not. Lowest pending cap — a PR queue is not a scroll feed |

**`outreach` shares a Resend domain and quota with auth mail** (GoTrue over SMTP since
2026-08-30). An outreach agent burning quota locks real people out of signup. That is a
harder constraint than any budget in this table.

---

## `lead-response` — the first harness (2026-11-05)

**It is a Postgres function on pg_cron, not an edge function, and that is the point: it
cannot burn a token even by accident.** The owner's instruction was that agents not spend
for no reason; a `model = 'none'` declaration is only a detector, but a harness with no
network client is a gate. Every finding is a join — `trade_reach(service)` already answers
"would anyone see this job", and a `client_requests` / `jobs` join already answers "did
this lead get stranded".

`public.agent_lead_response_run(p_trigger text default 'schedule')`. Four finding kinds in
one `UNION ALL`, ordered by `prio` so that **a cap truncates the least important first**:

| prio | kind | what it catches |
|---|---|---|
| 1 | `stranded_request` | not completed/cancelled, assignee set, **no `jobs` row** — the 2026-11-05 fault, now watched instead of hand-audited |
| 2 | `stale_estimates` | pending, has pending bids, newest one **older than 30 days** — past the nudge ceiling, so nothing automated will ever chase it |
| 3 | `unreachable_trade` | no pending bids and `trade_reach = 0` — nobody can see it |
| 4 | `no_bids_exhausted` | no bids, reach > 0, `refire_count >= 2`, older than 7 days |

Kinds 2–4 also require `assigned_contractor_id is null`, so a stranded request cannot
double-propose. The base CTE is bounded to 365 days and `waitlisted = false`.

**It sends no email.** Standing owner instruction is don't send bulk email without asking,
and the proposals land in a queue he already reads.

Armed: `cron.schedule('agent-lead-response', '0 14 * * *', …)` — 07:00 Calgary, an hour
before the 15:00 UTC health check so a fresh finding is in the queue when that report
lands. `expected_every = interval '1 day'`, which `admin_agent_overview`'s 1.5× grace
margin turns into a 36h window, so `stale` only reddens after two consecutive misses.

First real run: 9 `stale_estimates` findings, `model_calls = 0`.

**The payload carries the client's name, email and phone**, because the whole point is that
the owner can act on it without a second lookup. That is runtime data and **must never be
pasted into a migration, a doc or a commit message** — this repo is PUBLIC.

### Two traps this harness exposed in the already-shipped queue

**Expiry was a lie, and fixing it honestly would have created a dead row.**
`agent_propose_action` dedupes on `status in ('pending','approved','sent')`, and a proposal
past its `expires_at` is still literally `'pending'` — so it was refreshed forever and
never re-proposed, while the Agents tab claimed approving it "will be refused" and nothing
checked the column. Adding the refusal alone would have produced a row the owner could
neither approve nor refresh: *a control that can never succeed is worse than no control*.
So `public.agent_expire_stale_actions()` flips expired pending rows to `'expired'` and is
called **from `agent_run_start`**, where no harness can forget it. The UI now removes the
Approve button entirely for an expired row; **Reject still works**, because clearing the
inbox must always work.

**`agent_run_start` inserts the run row BEFORE the sweep, and the sweep has its own
`exception` block.** A plpgsql `begin…exception` is a subtransaction, so a run row created
inside one rolls back with the error — and the run row is the only evidence the agent ran
and failed. Same reason `agent_lead_response_run`'s handler calls `agent_run_finish(…,
'error', …)` and **returns without re-raising**; `errors_7d` in `admin_agent_overview` is
what surfaces it.

### Handoffs — `agent_kind_needs_harness`

All four lead-response kinds are **handoffs to the owner**: approving one means "I'll call
this client", not "a worker will pick this up". Left at `'approved'` they would sit forever
looking like work nothing collected. So `public.agent_kind_needs_harness(p_kind)` (`sql
immutable`) returns false for those four, and `admin_review_agent_action` closes them at
`'sent'` with `result` merged `{"handled_by":"owner","handled_at":…}`.

**One predicate, shared by every reader** — it drives the button label ("Mark handled" vs
"Approve"), the confirm text, the optimistic status in the UI and the status the RPC
writes, so none of the four can disagree. **An unknown kind returns TRUE**, failing safe
toward "approved, waiting on a worker" rather than silently marking work done.

### Draft on approval (2026-11-05) — the one place a model runs, and why it's a button

Finding the lead is free. Writing the message to the client is not. So those are two
different triggers: detection is on the cron and spends nothing, and **drafting hangs off a
"Draft a message" button on each lead card**. One Haiku call per lead the owner actually
decided to chase. A quiet day costs zero, and a busy day costs exactly as much as the work
he chose to do — which is the shape to copy for any future agent whose output a human sends.

- `supabase/functions/agent-draft-lead` (deployed 2026-11-05) is the **only** caller of
  `agent_lead_draft_context(uuid)` and `agent_lead_draft_save(uuid, jsonb)`. Both are
  service_role-only, both `create or replace` so the ACL survives, both verified afterwards
  with `has_function_privilege` rather than by reading the migration.
- **It is admin-gated in code, not by `verify_jwt`** — the anon key is a valid project-signed
  JWT that ships in the public bundle. Bearer → `getUser()` → `profiles.role === 'admin'`.
- **No second factor.** Drafting is reversible and sends nothing, so it is a read-shaped
  action; the rule is that *irreversible* admin writes carry the factor. What a stolen
  session could actually do here is run up a token bill, so that is what's capped:
  `chat_rate_check` at 30/hour, failing open like every other limiter.
- **The run row opens before the model call and closes on all three outcomes.** A draft that
  was generated but failed to persist comes back `ok:true, saved:false` with a copy-it-now
  warning and finishes the run `warn` — the money was already spent, so swallowing it would
  be the one dishonest option.
- **The model string is tried from an ordered Haiku-only list and retried on 404 only.**
  Neither candidate was ever proven against this project's key (`social-bot-brain` names a
  model and has never run), so a missing model name degrades to the next candidate, while a
  401/429/5xx fails loudly instead of being retried three times. Only successful calls count
  toward `model_calls`, so probing cannot inflate reported spend. `LEAD_DRAFT_MODEL` env var
  overrides the list, which makes a wrong model name a one-env-var fix.
- **The button is absent, not refused, where the server would say no** — `canDraft` in
  `AdminDashboard.tsx` mirrors `agent_lead_draft_context`'s own tests exactly
  (lead-response, non-terminal status, a client name on the payload).
- `draftLead(a)` is in `tools/check_mounts.py`. Dropping it throws nothing anywhere: the
  RPCs, the deployed function and the raised budget all keep existing, the cards still
  render, and the only symptom is the owner quietly going back to writing every follow-up
  by hand.
- `ANTHROPIC_API_KEY` must be set in Supabase → Edge Functions → Secrets. Without it the
  function returns **503 with a plain-English reason**, not a crash.

---

## The harness contract

```
v_run := agent_run_start('<agent>', 'schedule');   -- or 'event' / 'manual'
   … deterministic query …
   if nothing found: agent_run_finish(v_run,'ok','nothing to do','{"model_calls":0}')  and STOP
   … for each finding: agent_propose_action(p_agent, p_kind, p_dedupe_key, p_payload, null, v_run)
       -- check the return: status='capped' means stop proposing, not retry
agent_run_finish(v_run, 'ok'|'warn'|'error', '<one line a human reads>',
                 '{"model_calls": N, …}', '<error or null>')
```

- **Always pass `run_id`** to `agent_propose_action`. Without it the per-run cap cannot be
  measured at all — `social_propose_action` is the legacy wrapper that doesn't, which is
  precisely why `max_pending` is the cap that always bites.
- **Always report `model_calls`** in `agent_run_finish`'s `p_details`, zero included. A
  missing count reads as zero, so under-reporting is indistinguishable from thrift — the
  only thing stopping that is that the harness is ours.
- `agent_run_finish` **merges** `p_details` rather than overwriting, because
  `agent_propose_action` writes a `capped` key in there while the run is open.
- `model_calls` is taken as `greatest(existing, reported)`, so a second finish call cannot
  lower a spend that was already recorded.
- Every RPC here is **`service_role` only** and `SECURITY DEFINER` with no caller guard, on
  purpose: the only intended caller is a harness holding the service key. That was briefly
  untrue — see the 2026-11-04 entry in `docs/open-queued.md` — and the lesson is in the
  CLAUDE.md Postgres section: verify execute privileges by reading `pg_proc.proacl`, never
  by reading the migration.

## Adding an agent

1. Insert the `agent_registry` row **first**. `agent_propose_action` refuses an agent that
   is not on the roster: an off-roster writer would be both uncapped and invisible, and
   invisible-by-absence is the failure class this whole platform keeps relearning.
2. Start at `model = 'none'`. If that genuinely cannot do the job, say in the `purpose`
   which step needs the model and why a query can't answer it.
3. Leave `enabled = false` until the harness exists and has run once by hand.
4. Budgets are **per agent, not per policy**. If one agent's drafts are too thin, raise that
   agent's row. Changing the tier definitions above changes eight agents at once.

Migrations: `supabase/migrations/20261104_agent_team_queue_and_registry.sql` (the queue),
`supabase/migrations/20261105_agent_cost_budgets.sql` (the budgets) and
`supabase/migrations/20261105_lead_response_agent.sql` (the first harness, plus the expiry
sweep and the handoff predicate).
