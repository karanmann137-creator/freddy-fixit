# Code review — 1 Sep 2026

Reviewed at `71cff55` ("Light-mode peek on first visit to About/Blog, plus new About section on how we build").

---

## 1. Is MatrAIx-Persona-8B useful for code review?

No. It is not a code-review tool and has no code-analysis component.

MatrAIx is persona-driven **user simulation** infrastructure from Harvard/MIT (arXiv 2608.04205, MIT license). It ships a 1,290-dimension persona schema and a coreset of a million synthetic personas, and drives them through four environments — Survey, Chatbot, Web, and OS-app — so you can run a product past a simulated population before running it past a real one. Python 3.12, uv, Docker.

Where it *could* earn its keep on Freddy Fix It: pointing the Web environment at freddyfixit.ca and simulating a few hundred Calgary homeowners walking the request funnel. That is a genuinely useful thing to have — the funnel currently has four clients with estimates and no picks, and simulation is one way to find out why. But it is a UX/conversion instrument, not a reviewer. It will never tell you a payout guard is wrong.

## 2. What to actually use

**CodeRabbit CLI** is the closest thing to what you asked for and it has a free tier. It reviews your staged or unstaged changes, a specific commit, or a whole branch, and it plugs into Claude Code, Codex CLI, Cursor CLI, and Gemini. Install and run it on your Mac (the sandbox here is network-restricted and can't reach the installer):

```
curl -fsSL https://cli.coderabbit.ai/install.sh | sh
coderabbit auth login
cd ~/freddy-fixit && coderabbit review
```

Beyond that, for this codebase specifically:

The single highest-value addition is not another AI reviewer — it is **a test suite, because there isn't one**. The money paths are verified today by rolled-back SQL probes run by hand, which is genuinely rigorous but leaves nothing behind that runs on the next change. Vitest plus React Testing Library would let the pure-logic modules that already carry the platform's rules be tested directly: `photosMissing`, `canWithdraw`, `canRemoveRequest`, `jobBalance`, `blockedReason`, `detectDateTime`, `chatReadOnly`, `tidyDescription`, and `contractorGaps`. Those are ordinary functions with no Supabase dependency, and every one of them is a documented source of truth that several call sites are required to agree with. The `detectDateTime` verification you already did by hand — 11/11 should-fire, 16/16 should-not — is a test file that was written, run once, and thrown away.

Second, **make the typecheck blocking**. `.github/workflows/typecheck.yml` runs it non-blocking, and typecheck is the *only* thing that caught the 0-byte `ClientDashboard.tsx` that took down `/client-dashboard` — `vite build` sailed straight past it because esbuild does no typechecking. The one check that has actually saved you is currently advisory.

Third, **Playwright for one path only**: post a request, place a bid, accept, sign, pay a deposit against Stripe test keys. Not a broad suite — just the spine, so a superset installer can never again silently orphan `ContractPanel` and make every job unpayable with nothing anywhere reporting an error.

Skip SonarQube and Snyk for now. Snyk's value is dependency CVEs, and this project's real exposure is RLS policy and payment logic, which it cannot see.

## 3. Review findings

Typecheck is clean: `npx tsc -p tsconfig.check.json --noEmit` → **0 errors**. Baseline intact.

ESLint reports 142 errors and 16 warnings, and most of it is noise against this codebase's deliberate idioms. The largest bucket, 41 × `no-empty`, is the documented `catch {}` pattern where a failure must not raise — the pgcrypto lesson. The 37 × `react-hooks/refs` and 40 × `set-state-in-effect` are React Compiler pedantry the code doesn't opt into. The 6 `purity` and 7 `immutability` hits on the dashboards all resolve to `Date.now()` being called during render (`visitLocked`, the chat-time prompt predicates, the attention-row builder). Those are real in the narrow sense that a boundary crossed while the page sits idle won't re-render — the 24-hour reschedule cutoff being the sharp one — but the DB check is the real rule there and the UI is explicitly a courtesy, so it's cosmetic. Both `no-useless-assignment` hits (`ContractorDashboard.tsx:2412`, `passwordStrength.ts:118`) are `let msg = ""` followed by an exhaustive if/else chain. Neither is a swallowed error.

Also checked and clear: `.env` appears in two historical commits (`ddd9b01` added, `4c9e7f7` deleted) on a public repo, but the content was only `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`, both public by design. No leak.

The two findings worth acting on are both in the light-mode peek that shipped in this commit.

### Finding 1 — the peek can loop forever where localStorage writes fail

`src/lib/theme.ts` claims, in its own comment, that on any localStorage failure both helpers answer in the direction that stops the peek, so that an unreadable answer is a refusal and never a peek. That holds for **read** failures. It does not hold for **write** failures, which is the case the comment was written for — Safari private mode reads fine and throws on write.

In that browser `markLightPeekUsed()` swallows its throw and stores nothing, and `setTheme("light")` swallows its throw and stores nothing. So on the next navigation `lightPeekEligible()` still returns true (no `ff_light_peek`, no `ff_theme`), and the peek fires again and re-flips the theme. Every `/` → `/about` or `/` → `/blog` navigation, indefinitely. That is precisely the loop the design set out to prevent, arrived at through the write path rather than the read path.

The fix is a session-scoped claim that doesn't depend on storage succeeding:

```ts
let peekUsedThisSession = false;

export function lightPeekEligible(): boolean {
  if (peekUsedThisSession) return false;
  try {
    if (localStorage.getItem(PEEK_KEY)) return false;
    return !hasThemePreference();
  } catch { return false; }
}

export function markLightPeekUsed() {
  peekUsedThisSession = true;
  try { localStorage.setItem(PEEK_KEY, "1"); } catch {}
}
```

This keeps the existing claim-then-act ordering in `TopNav` and makes the claim actually stick regardless of what storage does.

### Finding 2 — the copy says "for a moment" but the change is permanent

The peek card reads: *"We've switched to the lighter look for a moment."* Nothing reverts it. `setTheme("light")` persists to `ff_theme`, and after that `hasThemePreference()` returns true forever.

Two consequences. The wording promises something the code doesn't do, and a visitor who ignores the card is now in light mode permanently having chosen nothing. More subtly, the stored value is indistinguishable from a deliberate choice, and CLAUDE.md's own rule for this feature is that absence of the key is the only signal nobody has chosen, and that a deliberate choice is never overridden. Writing the key on the user's behalf destroys exactly that signal.

Either resolution is defensible. Change the copy to say the look has been switched and can be switched back — one line, no behaviour change. Or write a separate `ff_theme_peeked` marker instead of `ff_theme`, so `hasThemePreference()` keeps telling the truth. The first is what `setTheme` was chosen for in the first place: `SettingsPanel` reads the *stored* value on open, so applying without persisting would show "Dark" selected on a visibly light page, on the very screen the prompt sends people to. Given that, changing the copy is the smaller and safer change.

## 4. Suggestions

Fix Finding 1 in `theme.ts` and Finding 2's copy in `TopNav.tsx` — that is a single small installer touching two files.

Flip the CI typecheck to blocking. It is the one check with a proven save behind it.

Add Vitest and port the verification work you already do by hand into files that persist. `detectDateTime` and the two destructive-control predicates (`canWithdraw`, `canRemoveRequest`) are the place to start, because all three are documented as needing to stay in lockstep with a server rule, and lockstep is exactly what a test enforces and a comment doesn't.

Run CodeRabbit on your Mac against each installer's diff before you send it. Its natural unit is a diff, which is also the unit your deploy process works in.

Consider MatrAIx separately, as a funnel-testing experiment rather than a code tool. It answers a question you actually have — why estimates aren't converting to picks — but it answers nothing about the code.

---

Sources: [CodeRabbit CLI](https://www.coderabbit.ai/cli) · [MatrAIx-Persona-8B](https://github.com/MatrAIx-ai/MatrAIx-Persona-8B)
