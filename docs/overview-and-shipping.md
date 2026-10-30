# Freddy Fix It — CLAUDE.md

Calgary home-services marketplace. Client posts a request → contractors bid (or admin assigns) → client picks → job lifecycle → payment → review.
Live: https://freddyfixit.ca (+ www), https://freddy-fixit.vercel.app · Supabase project ref `kvypmjxbbaaknvddwwai`

The owner is **non-technical** and deploys by pasting terminal commands. Optimize every answer for that:
ship one runnable thing, keep explanations short, never assume CLI fluency.

## Stack
- **Frontend:** React 19 + TypeScript + Vite + Wouter (routing) + Framer Motion. Build = `vite build` (esbuild, **no typecheck** — type errors don't block deploys). There is **no `.css` file** in `src/`; global styles are injected in `main.tsx`.
- **Backend:** Supabase only (Postgres + Auth + RLS + Storage + Edge Functions). No app server. "API" = PostgREST (`supabase.from(...)`) for reads + `SECURITY DEFINER` RPCs / edge functions for privileged writes.
- **Deploy:** Vercel auto-deploys from GitHub `main`. Email via Resend. DNS via Cloudflare. Payments via Stripe Connect. Analytics GA4 `G-WFMM73FJVL`.
- Details by area: see `src/CLAUDE.md` (frontend) and `supabase/CLAUDE.md` (DB/functions).

## How work ships (READ THIS FIRST)

Repo `github.com/karanmann137-creator/freddy-fixit` is **PUBLIC**.

**THE MODEL CHANGED (and `tools/ship.py` is the authority on it, not this file).**
The assistant's mounted folder **IS** the live repo — `/Users/karanmann/freddy-fixit` is the
same directory the installer's `cd ~/freddy-fixit` lands in. There is **no separate clone**,
and the installer **carries no file contents at all**: it is ~1-5KB of gates that check what
is already in the folder and push it. Its own header says so: *"This carries NO file contents.
Claude already wrote the changes into this folder. All this does is check them and push."*

1. Edit files in `/Users/karanmann/freddy-fixit` directly with Read/Edit/Write. Don't clone.
2. Validate (see Build / validate below).
3. `python3 tools/ship.py --message "what changed" [--delete path ...] [--delete-untracked path ...]`
4. Owner runs `bash ~/freddy-fixit/apply-<x>.sh`, waits for `✅ … pushed`, then hard-refreshes
   (Cmd+Shift+R). If git complains, prefix `rm -f ~/freddy-fixit/.git/index.lock &&`.

**A payload-free installer deletes four documented failure classes BY CONSTRUCTION** rather than
by checking for them, which is why the old rules about them are gone rather than merely relaxed:

- decode corruption (`base64 -d file` vs `base64 -d < file`) — there is no decode
- 0-byte truncation from redirecting a decode onto its destination (`b1361b6`, which pushed an
  empty `src/pages/ClientDashboard.tsx` and crashed every client on `/client-dashboard`) — no redirect
- superset installers silently reverting newer work (`56f96d3` wiped the pipeline strip/calendar;
  `fa5e2b5` orphaned `ContractPanel` and made **every job unpayable**) — no payload to revert from
- round-trip verification of installer vs source — they are the same file

**⚠️ But it introduces exactly ONE new sharp edge, and it is sharp: the working tree is now the
only copy of the change.** In the old model the installer carried the payload, so a blanket
`git checkout -- .` on failure was free — re-running the script restored everything. Now a blanket
revert **destroys the work with nothing to redo it from**. So the emitted installer **never** runs
a bare `git checkout -- .`; its failure trap restores only the paths it deleted, by name. Do not
add a general revert. For the same reason, un-shipped edits in the mount are not backed up by
anything: ship, or lose them.

**Installer rules that still hold:**
- `npm run typecheck` at 0 errors is the gate that matters, and the installer runs it on the
  owner's machine before committing. **`vite build` cannot catch an empty or broken module**:
  esbuild does no typecheck, so an empty module builds fine and only explodes at runtime inside
  `React.lazy`. Typecheck is what caught `b1361b6` (`TS2322: Property 'default' is missing`).
- **DB and edge changes are NOT applied by installers** — apply them live via Supabase MCP.
  Migration + edge source is committed via the installer for version control only.
- **⚠️ The repo copy of an edge function can lag the deployed one, and the deployed one is the
  truth.** Because installers don't deploy edge code, `supabase/functions/<slug>/index.ts` is
  documentation, not the artefact. Regenerating a deploy from a stale repo copy silently reverts
  live work — the edge equivalent of the superset-installer outages above. **Read the deployed
  source with `get_edge_function` before editing any edge function.** Known stale as of
  2026-09-01: `create-payment-intent` (deployed v19), `stripe-webhook` (v19), `resolve-dispute`,
  `adjust-payment`.
- `mcp__cowork__present_files` can't present `.sh` — give the run command as plain text.
- **`tools/ship.py`'s deletion gate needles differ by KIND of file, and the two kinds fail in opposite directions (2026-09-17).** A TS/TSX import omits the extension (`from "../components/GuideBubble"`), so only the bare **stem** can match it. An asset is referenced by URL and always carries the extension (`src="/onboarding-videos/x.mp4"`), so a bare-stem needle there is needlessly loose — it refused `public/icons.svg` because the words `text/icons/borders` appear in a **prose comment** in `Home.tsx`. `check_deletions` now picks the needle off the extension. **A gate that cries wolf is a gate someone learns to skip**, which is how a real dangling import ships — and a dangling import is not always a build error, since a lazy-loaded page fails only at runtime, in the browser, for whoever visits that route. Both directions are regression-tested by hand before trusting a run: the served `public/` mp4 must still be REFUSED (`ClientOnboarding.tsx`), a live component must still be REFUSED (`MessagesInbox.tsx` → both dashboards), and only the comment-matched asset may newly pass.
- **The other half of that gate is `_public_twin()`, and it is md5-gated on purpose.** Vite serves **only** `public/`, so a URL-style reference can never reach an identically-named file outside it — without the exemption a byte-identical 5MB duplicate at the repo root is pinned in the public repo forever by a reference belonging to the copy that actually serves. The waiver is granted **only** on an md5 match, so "same name, different file" is never waived. That distinction was load-bearing here: `onboarding-shots/` and `onboarding-video/shots/` carry the same seven filenames and are **different renders**, so they had to be justified as scratch, not as duplicates.
- **What the assistant cannot do from the sandbox:** delete files, and run git write operations
  (git must unlink `.git/index.lock` and the mount refuses unlink). Both therefore live in the
  installer, which runs on the owner's machine with full permissions.

## Build / validate
```
npm install                             # first time
npm run typecheck                       # tsconfig.check.json — baseline is 0 errors
npx esbuild <file> --loader:.tsx=tsx    # per-file parse check
npx vite build                          # full build — OWNER'S MACHINE ONLY
```
`vite build` **cannot run in the Linux sandbox** (rolldown ships a darwin-only native binding). Validate with typecheck + esbuild and embed `vite build` in the installer as the owner-machine gate.
CI: `.github/workflows/typecheck.yml` runs `npm run typecheck` non-blocking on push/PR to main.

