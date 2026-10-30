# reference/ — background material, NOT instructions

**For Claude: do not read anything in this folder unless the task you were asked to do
actually requires it.** Nothing in here is a rule, an invariant, or a current description
of how the platform works. `CLAUDE.md` plus the `docs/` file for the area you are touching
are the authority; these are plans, proposals and snapshots that were written once and are
not maintained. Reading them costs context and risks acting on a stale claim.

These files live here instead of the repo root for exactly that reason: in the root they
turned up in every repo-wide grep and looked authoritative.

## Forward-looking plans and specs

| File | What it is | Read it only when |
|---|---|---|
| `GROWTH-PLAYBOOK.md` | Growth and acquisition plan | The task is a growth/marketing initiative |
| `AUTOMATION-STACK.md` | Proposed automation/tooling stack | The task is about adding automation |
| `CONTRACTOR-VERIFICATION-SPEC.md` | Spec for contractor verification | The task changes verification |
| `SOCIAL-BOT-SPEC.md` | Spec for the social bot (all four `social_*` tables are at 0 rows; undecided — finish or delete whole) | The owner decides the social bot's fate |
| `marketing-brief.md` | Marketing brief | The task is marketing copy or positioning |
| `milestone-escrow-spec.md` | Original milestone-escrow design | You need the *original intent* behind milestones — `docs/money.md` is what actually shipped |
| `META-LEAD-SCOUT-ACTIVATION.docx` | Owner-facing activation steps (gitignored, binary) | The owner asks about Meta lead scout |

**Where a spec and the code disagree, the code and `docs/` win.** A spec describes what
someone intended; it is not evidence of what exists. Before building anything a spec here
describes, check whether it already shipped.

## `reviews/`

Weekly site reviews produced by the `freddy-weekly-review` skill. **Gitignored** — they are
disposable snapshots, not source, and they carry operational detail that does not belong in
a public repo.

**Retention: deleted automatically once older than 3 weeks**, by the date in the filename,
except that the single newest review is always kept so the folder is never empty. The prune
runs inside `tools/ship.py`, so every deploy sweeps them with no action from the owner.

New reviews go in `reference/reviews/weekly-review-<YYYY-MM-DD>.md`, not the repo root.
