# The agent team — cost discipline and the approval gate

Built 2026-11-04 (queue, telemetry, roster, approval UI) and 2026-11-05 (cost budgets).
The queue half is proven; **no harness exists for any of the eight agents yet**, which is
exactly what `enabled = false` means on every registry row.

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

All eight are `enabled = false`. `enabled` means **"a harness exists and this agent is
expected to run"** — it is step one of wiring each harness, and until it is true `stale`
cannot fire for an agent nobody claimed was running.

| agent | model | AI calls/run | proposals/run | pending | why that model |
|---|---|---|---|---|---|
| `lead-response` | none | 0 | 10 | 25 | A join answers it. Requests with no bids, zero `trade_reach`, or a state that disagrees with the jobs table |
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

Migrations: `supabase/migrations/20261104_agent_team_queue_and_registry.sql` (the queue) and
`supabase/migrations/20261105_agent_cost_budgets.sql` (this).
