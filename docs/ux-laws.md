# UX laws — what this project already enforces, and where it leaks

Written 2026-11-08, after the question "what UI/UX laws exist in this project?" turned out to
have an awkward answer: **nine of them are enforced, several of them unusually well, and not
one of them is named.** The rules were discovered one outage at a time and recorded as
mechanics — "orange appears exactly once per screen", "only the first three attention rows
render", "44px min-height under coarse pointers" — scattered across `CLAUDE.md`'s Frontend
block, `docs/brand-and-motion.md` and `src/CLAUDE.md`.

**Naming them is not decoration, and this file is not a reading list.** An unnamed rule has
three specific failure modes in this repo, all of which have already happened to the brand
tokens:

1. **It cannot be argued with.** "Don't put a second orange thing here" sounds like one
   person's taste, so the next session overrides it. "That is the Von Restorff effect, and
   the orange is only legible as a call to action because it is rationed" is a claim about
   how people work, and it survives a disagreement.
2. **It gets re-derived instead of reused.** Three dashboards each invented a row height
   before `--ff-h-row` existed. The same thing is happening to the accent colour right now
   (see the ranked list below).
3. **It cannot be checked.** The project's instinct is to make a rule mechanical —
   `check_mounts.py` for the critical mounts, `platform_health_check()` for the data. When
   this file was written there was **no checker of any kind for a UX rule**, so every law
   here was enforced by whoever happened to remember it.

**Four of them are now checked**, all on 2026-11-08: `tools/check_ux.py` holds the orange
ratchet, both focus-ring rules and — added last, once the Law of Proximity was measured — the
spacing ratchet; `tools/check_tokens.py` holds the light/dark literal parity; both run in
`ship.py` and CI. The rest remain judgement calls, and the file says so rather than
pretending. See *The two phantom checkers, and the four that now exist* at the bottom —
including the one that was specified and deliberately **not** built.

**Both checked laws are RATCHETS, and that shape is the finding, not a compromise.** Orange
and spacing are each a population of hundreds of call sites with a permanent irreducible
remainder, so "must be 0" would have been red on arrival and taught the owner to skip the
whole run. A ratchet has a reachable green state on day one and still forbids the only thing
that actually matters day to day, which is the number going **up**. The two laws that could
have been checked as absolutes — the focus rules — are checked as absolutes.

**This file is reasoning, not hard rules.** The rules that must hold on every turn are in the
root `CLAUDE.md` under *UX laws*. What is here is why, where, and what is currently broken.

---

## The scoreboard

| Law | What it says | Enforced? | Where |
|---|---|---|---|
| **Fitts's Law** | Time to hit a target falls with its size | **Strong** — the hole is closed | `--ff-h-ctl` + the `@media (pointer: coarse)` block in `main.tsx`: a 48px floor, opt-**out** since 2026-11-08, with the prose-link restore beside it |
| **Von Restorff** | The one thing that differs is the thing that's seen | **Stated twice; now ratcheted** | `main.tsx` token comments + `StateLine.tsx:12-25`; 971 raw orange literals → 96 → **18**, and `check_ux.py` won't let that number rise |
| **Law of Proximity** | Things placed close together are read as one group | **Was ABSENT; now ratcheted** | The `--ff-s1..s10` scale existed and was unused — 39 of 1731 single-value spacing declarations, **1.5%**. `migrate_spacing.py` + `SPACING_BASELINE` in `check_ux.py` |
| **Doherty Threshold** | Feedback under ~400ms keeps attention | **Strong** | `.ff-sk` / `.ff-enter` / `.ff-btn-spin`, `main.tsx:425-513` |
| **Miller's Law** | Working memory holds ~4 chunks | **Strong** | `<AttentionCard max={3}>` / `max={4}`, `ClientDashboard.tsx:2187`, `ContractorDashboard.tsx:1990` |
| **Hick's Law** | Decision time rises with the number of choices | **Partial — mitigated, not reduced** | `ServicePicker.tsx:7-9,25` wraps a 36-item list in search |
| **Serial Position** | First and last items are remembered | **Strong** | Attention-row push order, money-gating first; `docs/gotchas.md:34` |
| **Peak-End Rule** | A journey is judged by its peak and its end | **Strong** | Success-screen springs, `ClientSuccess.tsx` / `ContractorSuccess.tsx` |
| **Tesler's Law** | Complexity is conserved — someone absorbs it | **Very strong** | `contract_ready()` returning plain English; the one-predicate rule |
| **Postel's Law** | Be liberal in what you accept | **Strong** | `tidyDescription()`, `compressImage()` returning the original on every failure |
| **Occam's Razor** | Remove until removing breaks it | **Strong** | `StateLine` has four states and refuses a fifth |
| **Law of Common Region** | A shared border groups things | **Strong** | One `--ff-gut`, shared by a row's icon column and its separator inset |
| **Goal-Gradient** | Effort rises as the goal nears | **Partial** | `Stepper` exists; no evidence it's mounted on every multi-step flow |
| **Jakob's Law** | People expect your site to work like the others | **No evidence** | Conventional controls are used, but nothing records it as a principle |
| **Aesthetic-Usability** | Attractive things are perceived as more usable | **Deliberate** | Band rhythm; the hand-drawn icon filters, `main.tsx:402-407` |

---

## Fitts's Law — the best-enforced law here, and the one with a precise hole

`--ff-h-ctl` is **44px** (`main.tsx:144`) and the comment above it at `141-142` already states
the mechanic: a control shorter than this "would be silently grown on a phone and agree with
nothing beside it". That is Fitts's Law and the single-source-of-truth rule arriving at the
same number together, which is why it has held.

The enforcement is `main.tsx:338-368`. Two things in it are worth preserving verbatim because
they are not obvious:

The **16px `!important` font floor** is not a typography decision. iOS Safari zooms the whole
viewport when you focus a field computing under 16px; `--ff-font-scale` is 1.1, so the
habitual inline `fontSize:".85rem"` lands at ~15px — one pixel under. The comment records
what that actually cost: *"Tapping the bid price field zoomed the page in and shifted the form
half off-screen, which is most of what 'bidding doesn't work on my phone' actually was."* The
`!important` is honest rather than lazy, because the size is written inline at roughly forty
call sites and inline styles beat the injected sheet. **Do not remove it, and do not "clean
it up" by moving the forty inline sizes** — the next new input would silently miss the fix.

Checkboxes and radios are excluded from **both** rules deliberately: a 44px checkbox breaks
the walkthrough opt-in row, and they never trigger the zoom.

**The hole: the 44px floor is opt-in for links and labels, and exactly one element opts in.**
The selector is `button, [role="button"], a.ff-tap, label.ff-tap, select`. A bare `<button>`
or `<select>` is covered automatically. An `<a>` or a `<label>` is covered **only** if it
carries `.ff-tap` — and across all of `src/` that class appears on precisely one element,
`IconButton` at `ui/Pass.tsx:108`. The other two occurrences (`ui/JobSwitcher.tsx:57,70`) are
`.ff-tap-auto`, which is the *opt-out*. So every link-styled-as-a-button and every tappable
label on the platform — and there are many, because this codebase reaches for `<a>` and
`<label>` freely — is under the thumb-target floor on a phone, which is the only device most
contractors use on a job site.

> **CLOSED 2026-11-08 — the two paragraphs above describe the PRE-FIX tree and are kept
> because the reason is the fix.** The floor is now **48px** and opt-**out**: the selector
> covers every `<a>` and `<label>` by default, and `.ff-tap-auto` is the escape hatch for the
> handful (`ui/JobSwitcher.tsx`) that must stay inline. `.ff-tap` changed jobs — it no longer
> opts a link *in*, there is nothing left to opt in to. The direction-of-failure argument is
> what settled it: an over-tall link is ugly and visible, an under-tall link is a miss on a
> job site in the rain and is invisible from here. See *Violations → 3* below for the
> `:where()` prose-link restore that makes the floor safe to apply this broadly.

One genuine bright spot: `IconButton` takes `label` and spends it on `aria-label`
(`ui/Pass.tsx:108`), so an icon-only control **cannot** be mounted without an accessible
name. That is the right shape for every law in this file — make the correct thing the only
thing the signature allows.

## Von Restorff — stated twice, in two different places, and enforced in neither

This law is stated **at the token level and at the component level**, independently, and the
two statements agree. That is rare and worth preserving.

`main.tsx:60-76` defines the 60/30/10 ratio and spends four lines on the accent:

> `10% --ff-c10` accent. **Reserved for ONE action per view** plus the few marks that certify
> trust. If you are reaching for orange a third time in a section, the answer is `--ff-c30`.
> […] **Use the ramp rather than a raw hex** — 600 is the pressed state, 500 the brand
> orange, 400 the hover, and `-soft`/`-line` are the tinted fill and border that used to be
> written out as rgba literals in twenty places.

And it names the failure mode it was built to fix, at `:61-64`: *"it's that orange was doing
everything — headings, dividers, icons, links, stat numbers, background glows — so nothing
read as important because everything did."*

`ui/StateLine.tsx:12-25` then says the same thing from the component side, and is the single
best piece of UX reasoning in the codebase:

> Orange appears EXACTLY ONCE per screen, and only when the answer is "you". A screen where
> the client is waiting on a pro to accept has no orange on it anywhere. That is not an
> aesthetic preference — it is what makes the orange legible as a call to action on the
> screens that do have it. The old dashboards used orange for headings, dividers, icons, stat
> numbers and background glows, so nothing read as important because everything did.

It also rations the *pulse* on the same logic — reserved for `turn`, because "a pulsing dot on
a state the person cannot act on is an alarm with no off switch."

**Both statements are unenforceable as written, and the numbers are not close.** Counted
across `src/`:

| | count |
|---|---|
| `#ea6b14` raw hex | **524** |
| `rgba(234,107,20…)` raw tinted fills and borders | **458** |
| **raw orange literals total** | **982, across 81 files** |
| every ramp token combined (`--ff-c10`, `--ff-accent-600/500/400`, `-soft`, `-line`) | **45** |

So the ramp that exists specifically to stop this is used about **4%** of the time. The
`-soft`/`-line` tokens were introduced to replace "rgba literals in twenty places"; there are
now 458 of them. `ServicePicker.tsx` alone paints orange on the search icon, every one of 36
tile icons and every checkmark (`:43,:49,:57`) — on a screen whose actual call to action is
the Next button.

This costs two separate things. The **UX cost** is that `StateLine` is rationing a colour 81
other files spend freely, so the one orange that means "it's on you" competes with dozens
that mean nothing — which is verbatim the pre-ratio failure `main.tsx:61-64` describes, having
returned by a different route.

The **theming cost** is subtler and is a real bug, not a tidiness complaint. `--ff-c10` is
`#ea6b14` in dark mode (`main.tsx:79`) but **`#d65f10` in light mode** (`:168`), darkened for
contrast against the light ground — and `--ff-accent-500` moves the same way (`:81` vs `:164`).
A hardcoded `#ea6b14` never sees either, so **every one of those 982 literals renders the
dark-mode orange on the light ground**, at a contrast ratio the light palette deliberately
rejected. That is exactly the class of silent-wrong-theme bug the `.ff-on-dark` literal-parity
rule exists to prevent, arriving through the one door that rule doesn't cover.

**The replacement token is `var(--ff-c10)` (or `var(--ff-accent-500)`), not
`var(--ff-accent-400)`** — 400 is the *hover* step and is `#f78b3d` in dark mode, so swapping
a brand-orange literal to it would lighten every accent on the site.

> **MOSTLY CLOSED 2026-11-08. The table above is the PRE-FIX count and stays as the
> measurement that justified the work.** Two numbers in it need reading carefully now. The
> **982** was counted with comment prose included; the number of literals that actually
> RENDER was **971**, and that is the one `tools/check_ux.py` ratchets, because a literal
> inside a comment paints nothing and counting it would mean the only way to lower the
> number is to delete the explanation. `tools/migrate_orange.py --apply` then swapped **875**
> of them mechanically, leaving **96**; a hand pass the same day took those to **18**, and
> `BASELINE = 18` in `check_ux.py` now refuses to let that rise. The finding above also
> under-read the rgba problem: folding 458 literals onto `-soft` (0.12) and `-line` (0.32)
> would have been a visual redesign, because fifteen distinct alphas are in use and some are
> load-bearing — hence `--ff-accent-rgb` and `rgba(var(--ff-accent-rgb), A)`, which preserves
> the alpha exactly. See *Violations → 2* for the breakdown of the 18 that remain and why
> each group is permanent.

## Doherty Threshold — enforced, and the fail-safe instinct is already right

Everything needed to stay inside ~400ms is in one place and shared: the `.ff-sk` shimmer
(`main.tsx:429-442`), the 220ms `.ff-enter` (`445-452`), the em-sized `.ff-btn-spin`
(`500-513`). The comments show the thinking is already ahead of the name — `.ff-fade` exists
separately from `.ff-enter` because 10px of travel on a skeleton handing over to real content
"would look like the layout moving rather than settling", and the skeleton is `user-select:
none` because "a skeleton is scenery, never content."

The image safety animation (`479-488`) deserves calling out as the model for the whole file:
an image that somehow reaches none of its three reveal paths is forced visible after 4s,
because *"a slightly late image is a cosmetic miss; an image that never appears is a bug."*
That is the frontend expression of the project's fail-closed/fail-open discipline, applied to
perception instead of money.

`.ff-lift` is correctly gated to `(hover: hover) and (pointer: fine)` (`518-521`) — on touch,
`:hover` sticks after a tap and would leave the last-touched card permanently raised.

## Hick's Law — mitigated by search, which is the right answer, but say so

`ClientOnboarding.SERVICES` is **36 options** (`:29-66`) and
`ContractorOnboarding.SPECIALTIES` is **31**. A 36-item flat grid is a textbook Hick's Law
problem, and the project solved it the correct way rather than the obvious one:
`ServicePicker.tsx` makes the list **searchable** (`:25`) instead of chunking it into
categories, and lets a client add a service that isn't listed at all (`:30-37`). Search
collapses 36 choices to one typed word; category chunking would only have turned one 36-way
decision into a 6-way plus a 6-way.

`allowCustom={false}` for contractors is a deliberate asymmetry with a real reason recorded at
`:17-19` — a specialty outside `service_specialty_map` matches no client request, so letting a
pro invent one "would quietly hand them a trade we never send them jobs for." **Keep that
asymmetry;** it is matching logic wearing a UI constraint.

## Miller's Law and Serial Position — one mechanism, two laws

`<AttentionCard max={3}>` on the client side (`ClientDashboard.tsx:2187`) and `max={4}` on the
contractor side (`ContractorDashboard.tsx:1990`, with the deviation flagged in a comment at
`:1976`) is Miller's Law: a capped list of chunks rather than everything that is true at once.
`AttentionCard` returning **null** when empty is part of it — an empty "needs your attention"
card is a chunk spent on nothing.

Because the list is capped, **push order decides what a human actually sees**, which makes it
a Serial Position problem too. The existing rule — money-gating rows first
(`docs/gotchas.md:34`) — is the correct resolution: the first position is the strongest, and
the row that unblocks a payment is the one that must have it. The contractor side is an
`else if` chain, so a new overlapping predicate must be inserted **before** the one it
overlaps or it is unreachable.

## Tesler's Law — the law this project is best at without trying

Complexity cannot be deleted, only moved; the question is who carries it. This codebase
consistently makes the *platform* carry it:

`contract_ready(p_job_id)` returns NULL or **the plain-English reason** rather than a boolean,
so the frontend never has to reconstruct why a job is unpayable. `job_money_block(p_job_id)`
is the one answer to "can this job be destroyed?", in the same shape. The one-predicate rule
(`photosMissing`, `canWithdraw`, `chatReadOnly`, `jobFullyFunded`, …) exists so "a gate, a
dimmed button, a hint and an attention card can never disagree" — four surfaces, one truth,
complexity absorbed once.

The corollary already in `CLAUDE.md` is the Tesler's Law failure mode named exactly: **"a
control that can never succeed is worse than no control"**, and an explanatory note must be
keyed on the thing it claims, not on the predicate that hid the button. That is complexity
handed back to the user disguised as a feature.

## Postel's Law — be liberal in what you accept

`tidyDescription()` **normalises and never rewrites** — spacing, case, punctuation only,
because a contractor prices the job off that text. `compressImage()` returns the **original
file on every failure path**. HEIC photos arriving with an empty `f.type` fall back to the
extension. `applyReferralAtSignup()` cannot throw, and a network error is explicitly not
treated as a bad code. Phone numbers are formatted as typed
(`ContractorOnboarding.tsx:95-96`); postal codes are normalised in `lib/calgaryAreas.ts:62-68`.

The matching rule on the other side is the one that keeps this honest: **a failed read is not
an empty result.** Being liberal about *input* must not become being confident about
*absence*.

## Occam's Razor and Common Region — small, and already right

`StateLine` has four states "and only four, by design", with the explicit instruction that
wanting a fifth means you want `wait` or a neutral pill. `--ff-gut` is **one** token shared by
a row's icon column, the left inset of its separator and the hanging indent beneath it,
because spelled as three numbers they drift and "a hairline that disagrees with the column
above it by 2px is the kind of flaw that reads as sloppiness without anyone being able to name
it." `.ffu-ri-wrap` renders even with no icon for the same reason.

## Law of Proximity — the law this document originally MISSED

The first version of this page scored fourteen laws and had no Proximity row. That is the
most interesting omission in the file, because Proximity is the law that governs the thing
the owner actually asked about — *"spacing and good placement of buttons and info that
belongs together"* — and because the project had already built the right tool for it and
then not used it.

**The finding, measured rather than asserted.** `--ff-s1` through `--ff-s10` exist in
`main.tsx` as a proper 4px-based scale. Across `src/`, single-value spacing declarations in
style objects (`gap`, `padding*`, `margin*`, `rowGap`, `columnGap`) numbered **1731**. Of
those, **39** used a token. **1.5% adoption** — worse than the orange ramp's 4%, and for the
same structural reason: a developer writing an inline style object has the literal in reach
and the token two files away.

**Why this is Proximity and not tidiness.** Proximity says a reader infers grouping from
distance alone, before reading a word. That makes the *ratios* between gaps the carrier of
meaning, not the absolute values — a label 6px above its field and 24px below the previous
field reads as one group; at 12px and 14px it reads as five loose rows. Ratios survive only
if the numbers come from one scale. 1731 independently-chosen numbers cannot express a
ratio, which is why the symptom is the vague "this page feels unorganised" rather than any
single visible defect. **This is also why it could never have been found by looking.**

**Two things were deliberately NOT done.** A full migration was rejected: most of the 1731
are correct-looking numbers whose nearest token is 2–3px away, and moving them all would
have been an un-reviewable visual redesign on a platform that takes money. And `rem` was not
converted to `px`: the scale is in px while the call sites are overwhelmingly in `rem`, which
is a real finding on its own — `--ff-font-scale` is 1.1, so `1rem` is ~17.6px and a `rem`
call site and a px token *drift apart as the user changes their text size*. Reconciling that
is a separate decision about whether spacing should scale with type at all, and it is
recorded here as open rather than guessed at.

**What was done instead: migrate only the provably-safe tier, then ratchet.**
`tools/migrate_spacing.py` snaps a literal to a token only when it is already within 0.5px
of that token's value — i.e. where the swap is a spelling change and cannot move a pixel. It
prints every refusal with a reason. `SPACING_BASELINE` in `check_ux.py` then holds the line:
may fall, never rise.

**And the ratchet has fallen three times without a single migration pass**, which turned out
to be the real lesson. 1503 → 1486 came from converting 13 dialogs to `.ffu-scrim` /
`.ffu-modal`, which deleted their hand-rolled overlay and card style objects outright and
every `padding: "1.5rem"` inside them. 1486 → 1481 came from moving three read pages' titles
into `<PageTitle>`. 1481 → 1478 came from the last two ordinary centred dialogs
(`ProfileCompleteCelebration`, `FreddyRewind`) moving onto that same modal primitive. **Three
falls, three by deleting a hand-rolled layout — treat that as the rule, not a coincidence.**
**Proximity improves fastest when a layout moves to a shared primitive,
not when a literal is swapped for a token one site at a time** — because the primitive
decides the ratios once, for everything that mounts it. The token scale is how a primitive
spells its spacing; it was never going to be how 1731 call sites got fixed.

---

# Violations — what the 2026-11-08 pass fixed, and what is still open

The six below were the ranked list when this document was first written as a doc-only audit.
Four of them were then fixed in the same day's build pass. **The original finding text is kept
for each, because a fix you cannot read the reason for is a fix someone undoes** — and three of
these were already undone once by an edit that looked harmless.

## 1. ✅ FIXED — keyboard focus was effectively unstyled outside the home page

*The finding:* `:focus-visible` appeared in **two files only** — `Home.tsx`
(`:664,:758-760,:775`, done properly: `:focus` kills the outline and `:focus-visible` restores
a 2px orange ring, with the ordering reasoned at `:755`) and `OverhaulNotice.tsx:198` (a
border-bottom, not a ring). **`ui/uiStyles.ts` contained no focus rule at all**, so every
shared `Button`, `Row`, `IconButton`, `Pill` and `Stepper` — i.e. all three dashboards — fell
back to the browser default ring: technically visible, unbranded, and close to invisible on
navy in some browsers.

*What the fix actually had to be, which is not what the finding assumed.* "One rule in the
shared sheet" was only half of it. A sweep found **14 files carrying an inline
`outline: "none"` with no ring anywhere in the file** — `ChatWidget`, `NewRequest`,
`ProfileBar`, `DeleteAccount`, `TwoStepPanel`, `Footer`, `VerifyCodeModal`, `DashSearch`,
`JobChat`, `Login`, `ContractorOnboarding`, `UpdatePassword`, `ClientOnboarding`, `GetQuote`.
**An inline `style` attribute beats the injected stylesheet**, so no sheet rule could ever have
restored those rings. The 14 inline declarations were **removed**, not overridden. (Three other
files merely *mention* `outline:none` in prose, and `Home.tsx` suppresses it and re-draws it
correctly — all four are legitimate and were left alone.)

Then two rules, in the two places that cover everything:

- **`ui/uiStyles.ts:32-78`** — `:focus-visible` on `.ffu-btn`, `.ffu-row`, `.ffu-iconbtn`,
  `.ffu-jobchip`, `.ffu-step` and links/buttons inside `.ffu-sheet`. `:focus-visible` and
  never `:focus`, because `:focus` fires on a mouse click too and would leave an orange ring
  sitting on whatever you last clicked. There is deliberately **no `:focus{outline:none}`
  anywhere in that file**.
- **`main.tsx`**, the global field rule, immediately after `input, select, textarea
  { max-width: 100% }` — `box-shadow: 0 0 0 3px var(--ff-accent-soft)` on `:focus` plus
  `outline: 2px solid var(--ff-accent-400); outline-offset: 2px` on `:focus-visible`.
  **`box-shadow` and not `border-color`**, because those field style objects set the `border`
  **shorthand** inline and the shorthand would win. Checkboxes and radios are excluded, the
  same carve-out the `pointer: coarse` block makes.

`--ff-accent-400` is used here **on purpose and only here**. It is the hover step of the ramp
and is wrong for a surface colour, but a focus ring is the one thing that should be the
brightest step available.

**Now gated:** `tools/check_ux.py` checks (2) and (3) — the shared sheet must contain a
`:focus-visible` rule, and no file may kill the outline without re-drawing it.

## 2. ✅ FIXED — 971 raw orange literals, now 18, which is the floor

*The finding:* 982 raw orange literals across 81 files (524 `#ea6b14` + 458
`rgba(234,107,20…)`) against 45 uses of the whole accent ramp — ~4% token adoption. This
defeats the Von Restorff ration *and*, because `--ff-c10` is `#ea6b14` in dark but `#d65f10`
in light, renders the dark-mode orange on the off-white ground in all 81 files. A live bug,
not untidiness: nothing throws, and you find out by switching the theme and looking.

(971 was the count once comment prose was excluded, which is the number the ratchet uses.)

**`tools/migrate_orange.py` swapped 875 of them across 78 files, mechanically, with zero
visual change in dark mode.** Two substitutions, both exact:

```
#ea6b14              ->  var(--ff-c10)
rgba(234,107,20,A)   ->  rgba(var(--ff-accent-rgb), A)      alpha preserved
```

**The second one is why `--ff-accent-rgb` exists, and the original finding got this wrong.**
It proposed folding the rgba tints onto `--ff-accent-soft` / `--ff-accent-line`. Those are
0.12 and 0.32; the tree used **15 distinct alphas**, and some are load-bearing — the
photo-pulse keyframe animates `.55 → 0`. Folding 451 sites onto two values would have been a
visual redesign wearing a token migration's clothes. `--ff-accent-rgb` (`234,107,20` dark /
`214,95,16` light) lets every alpha survive the move. **`-soft` and `-line` must stay spelled
out as literals** — a `var()` inside a `--ff-*` declaration is the `.ff-on-dark` alias trap,
and `check_tokens.py` now fails on it.

**The 96 that remained each needed a per-site human decision**, and the script refuses to
touch them by design, printing every one with `file:line` and a reason. The hand pass over
them was done the same day and took the count to **18**. Here is what the 96 were, and what
happened to each group — the second column is the part worth keeping:

| was | what it was, and how it resolved |
|---|---|
| 78 | **JSX/SVG presentation attributes** — `color=`, `stroke=`, `fill=`. `var()` support in a presentation attribute is uneven enough that a token passed that way can draw an **invisible icon**. **68 of the 78 were one component.** `Ic` took a `color` prop and spent it on `stroke={color}`, so every caller that wanted a themed icon had to hand a token to an attribute. Fixing `Ic` once — it now renders the constant `stroke="currentColor"` and turns the caller's `color` into a real CSS `color` declaration — made all 68 mechanically swappable in a single pass. **10 left**, each a raw `<svg>` rather than an `Ic`, which is still the original hazard and still refused |
| 9 | **custom-property declarations** in `main.tsx` — the token definitions themselves. **All 9 remain, permanently.** They are *supposed* to be literals; see the alias trap above, and `check_tokens.py` fails if one becomes a `var()` |
| 7 | **canvas / imperative / module constants.** **4 remain** — `ctx.fillStyle` in `FreddyRewind`, where `var()` never resolves on a canvas at all. The `el.style.borderColor` handler and the two `const ORANGE =` were real DOM/CSS and went |
| 2 | **a standalone document** — `ClientDashboard`'s printed receipt is a full `<!doctype html>` string opened in a new window. **Both remain, permanently.** It has no `:root`, so a `var()` there is not a fix, it is a blank |

**The reusable lesson is the 78 → 10 row, and it is not about orange.** A refusal list of 78
individually-justified sites looked like 78 judgement calls, and 68 of them were one
component's API making the hazard unavoidable for its callers. **When a refusal category is
large, check whether it is one mechanism before accepting it as N judgement calls.** The
corollary is a rule now in `CLAUDE.md`: a component that takes a colour must spend it on a
CSS declaration, never on a presentation attribute — because `currentColor` is the one value
that is universally supported in an attribute *and* defers to CSS.

**18 is believed to be the floor**, and the four remaining groups (10 raw-SVG attributes, 9
token declarations, 4 canvas, 2 the receipt — plus 3 of the 10 being `ui/Mark.tsx`, which is
a permanent exception documented in its own docstring) each rest on a fact that is not going
to change. That changes how to read a failure here: at 96 a rise meant someone typed a
literal instead of a token, which is ordinary drift. At 18 it much more likely means one of
the four hazards has been reintroduced — a `var()` in a `--ff-*` declaration, a token handed
to canvas, or a token in a presentation attribute. **Read the new site before lowering
anything.**

**Now gated:** the `check_ux.py` ratchet, `BASELINE = 18`, tight against the tree. It may fall
and never rise. Re-run `migrate_orange.py` after any hand pass to see what is left; it is
idempotent.

## 3. ✅ FIXED — the tap floor was opt-in, and exactly one element opted in

*The finding:* the 44px floor applied to `a.ff-tap, label.ff-tap` — opt-**in**, with one
element in all of `src/` opting in (`ui/Pass.tsx:108`). Every other tappable link and label on
the platform was under the thumb-target floor on a phone.

The floor is now **48px** (44 is the published minimum; 48 is what iOS actually ships for a
list row, it matches `--ff-h-row`, and the owner asked for generous), and it is **opt-out** for
`<a>` and `<label>` via `.ff-tap-auto`. **The direction is the whole argument:** a missed
opt-in is an invisible accessibility failure, a missed opt-out is a visibly too-tall link
someone fixes in a minute.

**The restore rule beneath it is not a refinement — it is what makes the floor safe to apply at
all.** `min-height` does nothing to a plain inline element, so the floor needs `inline-flex` to
bite; but an inline-flex element will not break its text across lines, so a blanket floor on
`a` turns every link inside a sentence into an unwrappable 48px box that overflows its column.
On the legal pages, where whole clauses are links, that is worse than the bug being fixed. So
prose links are restored to `inline`, keyed on the **container** — `:where(p, li, h1..h6,
blockquote, dd, dt, figcaption, small, label) a:not(.ff-tap)` — because the container is the
only thing that distinguishes a link that is a control from a link that is a word. `:where()`
so the restore carries **zero specificity** and the single class `.ff-tap` can still beat it;
with a plain descendant selector the restore would be 0,0,1,2 and the escape hatch would be
silently dead.

`.ff-tap` did not become dead when the default flipped — **it changed jobs.** Its only job now
is forcing the floor back **on** for a control link that happens to sit inside one of those
prose containers.

**And then the floor turned out to cover only ONE AXIS, which is finding 1 of the later pass
the same day.** `min-height: 48px` says nothing about width, so every control whose content is
narrow — an icon, a glyph, a chevron — passed the floor as a **tall sliver**. `FreddyRewind`'s
close `×` was about 14px wide and 48px tall. Home's two carousel arrows were worse, and worse
in an instructive way: they are declared `30px` square, and they rendered as a **30×48 pill**,
because **`min-height` beats `height` outright — they are different properties, not competing
selectors.** Specificity never enters it, so nothing in `Home.tsx` looked wrong and the
component's own declaration simply had no say. **A component can be mis-sized by a rule two
files away that it appears to override.**

Both fixes set the missing axis explicitly, and they deliberately land on **different numbers**,
which is the part worth keeping. `.ffu-iconbtn` goes to 48px square — it is the generic icon
button and 48 is what the floor already promised. The carousel arrows go to **44**, because
`.ff-ba-knob` sitting between them is already 44, and 48 would make the arrows the largest
circles in a component whose primary control is the knob; two stacked 48px circles also eat
~53% of the image height on a 360px-wide phone, where the image *is* the content. The 44 is
restated on the class so it outranks the element-level 48 from `main.tsx` (a class beats a type
selector). **The published minimum is a floor, not a target** — Fitts says make the target big
enough to hit, not make every target the same size as every other.

## 4. ✅ FIXED — `ServicePicker` hand-rolled its focus ring in event handlers

*The finding:* `ServicePicker.tsx:70` set `outline: "none"` and rebuilt the ring in imperative
`onFocus`/`onBlur` handlers (`:63-64`) mutating `style.borderColor` and `style.boxShadow`
directly. Three faults, and they compound: `onFocus` fires for mouse clicks too, so clicking
produced a keyboard affordance; the mitigation sat two handlers away from the thing it
mitigated, so deleting either one removed the indicator silently; and the hardcoded orange was
`#ea6b14`, so focusing the field painted the **dark-mode** orange in light mode.

Now two CSS rules (`:81-82`): `.ff-svc-q:focus` carries the border and shadow — `:focus` is
correct for *that* pair, because a clicked field should look focused, you are about to type —
and `.ff-svc-q:focus-visible` layers the keyboard-only ring on top.

**This is why `check_ux.py`'s outline check is scoped to the same file.** Cross-file reasoning
("the ring comes from the global sheet") is exactly the argument this component made by
accident. If a file kills the outline, that file shows the ring.

## 5. ⬜ OPEN — Goal-Gradient is unverified

`Stepper` exists in `components/ui/`, but nothing establishes that every multi-step flow mounts
a progress indicator. `ClientOnboarding` is a 3-step signup; `ContractorOnboarding` is longer.
Worth one pass to confirm each shows where you are and how much is left. **Not mechanically
checkable** — "this flow has steps" is not greppable.

## 6. ⬜ OPEN — Jakob's Law is nowhere

Not a defect, an absence: no doc records "use the control people already know" as a principle,
so a future session has no written reason not to invent a novel one. The highest-value place to
hold this line is any screen in the payment path, where an unfamiliar control reads as
untrustworthy rather than merely confusing.

---

# The two phantom checkers, and the six that now exist

**`check_tokens.js` and `check_rhythm.js` never existed.** Both were cited as live mechanical
gates — the root `CLAUDE.md` said *"`check_tokens.js` asserts 30/30"* and *"`check_rhythm.js`
fails on two adjacent bands landing on the same colour"*, and `docs/brand-and-motion.md`
repeated both claims as though they ran. `tools/` contained exactly two files: `ship.py` and
`check_mounts.py`. There was no `.js` checker anywhere in the repo outside `node_modules`.

A third was specified and **deliberately not built**: `check_rhythm.py`, the real version of
the phantom. Home's bands mix CSS classes with inline `<div>` backgrounds, and two `--ff-bg`
bands already sit near each other at `Home.tsx:1321` and `:1367`, so it would have been red
on arrival with nothing to do about it. **A gate that cries wolf is a gate someone learns to
skip**, and that costs more than the check was worth. The refusal is recorded in
`tools/check_ux.py`'s docstring so the next person reaches the same conclusion faster
instead of reaching the opposite one.

This is the failure mode `CLAUDE.md` already warns about in its own words, after `.github/`
turned out never to have existed: **"Treat a documented check as absent until you have seen the
file."** It happened again, in the same file, about different checks. **Keep applying that rule
to this page too** — including to the three checkers described below.

## What exists now

| file | asserts | shape |
|---|---|---|
| `tools/check_mounts.py` | 21 critical-mount needles across 7 files | enumerated — the list is the point |
| `tools/check_tokens.py` | every light override restored in `.ff-on-dark` (34/34); no `var()` in any `.ff-on-dark` declaration (37, none aliased) | **derived from the stylesheet** |
| `tools/check_ux.py` | the orange ratchet (`BASELINE = 18`); the spacing ratchet (`SPACING_BASELINE = 1478`); a `:focus-visible` rule in `ui/uiStyles.ts`; no `outline:none` without a `:focus-visible` sibling in the same file; all three display preferences answered in `main.tsx`; the hairline ratchet (`HAIRLINE_BASELINE = 21`) | derived |

(Three files, six checks: `check_ux.py` carries Von Restorff, Proximity, the hairline law, the
display preferences and both halves of the focus rule.)

**The three ratchets and the three absolutes are not a style choice — the shape follows from the
population.** Orange, spacing and hairlines each have an **irreducible remainder** that is
correct and will never reach zero: raw-SVG presentation attributes and the `Mark` logo; hundreds
of literals 2–3px from their nearest token whose migration would be an unreviewable redesign;
21 mixed ternaries whose two branches disagree about whether a border is a signal. A "must be 0"
on any of those three is permanently red, and *a permanently-red check teaches the reader to
ignore the whole report*. The shared focus rule, the unringed `outline: none` and the three
display preferences can all genuinely be zero / present, so they are absolutes. **Don't ratchet
something that can be zero, and don't demand zero of something that can't be.**

**One cross-script constraint worth knowing before editing either:** `migrate_hairlines.py`
imports `_strip_comments` and `_doc_lines` **from** `check_ux.py`, so the hairline needles are
duplicated in the checker deliberately. Importing them the other way would be a cycle.

All three run in `tools/ship.py` before it will push (gate 4b, `check_style_guards()`) and in
`.github/workflows/typecheck.yml` on push, PR and the nightly schedule, each with
`if: always()` so one failure doesn't hide the others.

**`check_tokens.py` and `check_ux.py` are derived rather than enumerated on purpose.** A
checker holding a hand-maintained list of 30 token names is a second copy of the thing it
checks, and it rots the same way the doc claiming it existed did. Both read the real
stylesheet and compute the assertion.

**Both were negative-tested in both directions, and the testing found a real hole in each.**
That is the argument for doing it: a checker nobody has seen fail is indistinguishable from
`check_tokens.js`.

- `check_tokens.py` returned **green** on an injected `--ff-c60: var(--ff-bg);` because its
  dict comprehension kept only the *last* declaration of a repeated token. Fixed by iterating
  a **list of pairs** — reasoning in `docs/brand-and-motion.md`.
- `check_ux.py`'s comment stripper was `re.sub(r"/\*.*?\*/", …, re.S)`, and every file picker
  in this tree writes `accept="image/*"`. **That `/*` opened a block comment the regex ran to
  the next genuine `*/`, hundreds of lines later**, swallowing every orange literal in between
  — the ratchet read 95 against a tree holding 96, and `migrate_orange.py` reported two live
  `color="#ea6b14"` props as "inside a comment". Replaced with a scanner that tracks string
  state, blanks comment bytes while **preserving length and line structure exactly**, and
  deliberately does *not* treat backticks as string delimiters, because `main.tsx`'s entire
  global stylesheet is one template literal whose CSS comments are real comments. The two
  scripts share that one scanner by import.

## Why comment prose is stripped before the ratchet counts

Three comments in this tree discuss the orange literal **by name** — `Home.tsx:473` explaining
why the hero marks are a knowing exception to once-per-screen, `ContractorDashboard.tsx:50` and
`:3217` explaining a value-blind orange already fixed, plus `main.tsx:88` describing the
migration itself. Counting those would mean **the ratchet could never reach them: the only way
to lower the number would be to delete the explanation.** A literal in prose renders nothing.

The first run of `migrate_orange.py` learned this the hard way — it rewrote all three comments
into *"a literal `var(--ff-c10)` here would have…"*, which is self-contradicting nonsense that
had to be undone by hand. Both tools are comment-aware now.

## One checker was designed and REJECTED, and the rejection is part of the spec

`check_rhythm.py`, asserting Home's bands alternate ground/surface. **Not built.** The bands are
a mix of CSS classes (`.ff-services`, `.ff-how`, `.ff-about`) and inline `<div>` backgrounds,
two `--ff-bg` bands already sit near each other at `Home.tsx:1321` and `:1367`, and resolving
JSX render order across ~1,400 lines is fragile. It would have been **red on arrival**, and *a
gate that cries wolf is a gate someone learns to skip* — which costs the three checks that do
work. Same treatment `CLAUDE.md` gives the rejected "feature table has 0 rows" sweep.

The six remaining laws in the `CLAUDE.md` block — Miller's cap, Doherty's 400ms, Tesler,
Postel, Occam, Hick — are judgement calls about ordering and wording. A regex cannot hold them,
and pretending otherwise would be worse than the honest *"enforced by whoever remembers it."*
