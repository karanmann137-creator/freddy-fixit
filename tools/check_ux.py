#!/usr/bin/env python3
"""
UX-law guard for src/ -- the four laws in CLAUDE.md that are mechanically
checkable, and nothing else.

WHY THIS FILE EXISTS (2026-11-08). CLAUDE.md said, in the UX-laws block:
"There is NO UX checker of any kind. Every law above is enforced by whoever
remembers it." It then named the three laws that COULD be checked and noted
that all three have a reachable green state, which is the bar. This is those
three. The six other laws in that block (Miller's cap, Doherty's 400ms,
Tesler, Postel, Occam, Hick) are judgement calls about ordering and wording;
a regex cannot hold them and pretending otherwise would be worse than the
honest "enforced by whoever remembers it".

A fourth check was DESIGNED AND REJECTED, and the rejection is part of the
spec: `check_rhythm.py`, asserting Home's bands alternate ground/surface. The
bands are a mix of CSS classes (.ff-services, .ff-how, .ff-about) and inline
<div> backgrounds, two --ff-bg bands already sit near each other at
Home.tsx:1321 and :1367, and resolving JSX render order across ~1400 lines is
fragile. It would have been RED ON ARRIVAL, and "a gate that cries wolf is a
gate someone learns to skip" -- which undoes the checks that do work. Same
treatment CLAUDE.md gives the rejected "feature table has 0 rows" sweep.


THE SIX CHECKS
--------------

(1) RAW-ORANGE RATCHET, not a zero. Von Restorff in this repo means orange
    appears exactly once per screen and only when the answer is "you". The
    token system says so twice independently (main.tsx's token comments and
    ui/StateLine.tsx's gate), and on 2026-11-08 both were losing badly: 971
    raw #ea6b14 / rgba(234,107,20,...) literals across 80 files against ~45
    uses of the entire accent ramp, about 4% token adoption. This is also a
    live LIGHT-MODE BUG, not untidiness: --ff-c10 is #ea6b14 in dark but
    #d65f10 in light, so every literal paints the dark-mode orange on the
    off-white ground.

    A "must be 0" assertion would be red for months, so this is a RATCHET: the
    count may fall, never rise. Lower BASELINE whenever a migration pass lands
    -- that is the ratchet clicking, and it is the only edit this constant
    should ever get. Raising it is the thing the check exists to stop.

    tools/migrate_orange.py did the first click the same day: 875 literals
    swapped mechanically, 971 -> 96. The 96 each needed a per-site human
    decision, and that pass is now COMPLETE -- 971 -> 96 -> 18, same day.

    The 78 of those 96 that were JSX/SVG presentation attributes collapsed to
    10 by ONE component edit rather than 68 call-site edits, and that is the
    reusable lesson here. The refusal reason was real (var() support in a
    presentation attribute is uneven enough to draw an INVISIBLE icon), but 68
    of the 78 were the same prop on the same component: Ic rendered
    stroke={color}. Ic now renders the constant stroke="currentColor" and turns
    the caller's `color` into a real CSS declaration, where var() has always
    worked -- so the hazard stopped existing instead of being worked around,
    and migrate_orange.py's carve-out is keyed on the ELEMENT (a raw
    <svg color="..."> is still the original hazard and still refused). When a
    refusal category is large, check whether it is one mechanism before
    accepting it as N judgement calls.

    THE 18 THAT REMAIN ARE PERMANENT, and listing them is cheaper than
    rediscovering it: 9 custom-property declarations in main.tsx (a var() inside
    a --ff-* declaration is the .ff-on-dark alias trap, and check_tokens.py
    fails on it), 4 canvas fillStyle assignments in FreddyRewind (canvas 2D does
    not resolve custom properties at all), 3 in ui/Mark.tsx (a logo is a fixed
    asset -- see its docstring; its navy and ink are literals too, so
    tokenising only the orange would leave the mark half-themed), and 2 inside
    ClientDashboard's standalone <!doctype html> receipt string, which has no
    :root for a var() to resolve against. So 18 is the floor unless one of those
    four facts changes. Run that script to see the live list with a reason per
    site; it is idempotent and safe to re-run.

(2) THE SHARED FOCUS RULE MUST EXIST. src/components/ui/uiStyles.ts is the one
    injected sheet behind every shared Button/Row/IconButton across all three
    dashboards. Until 2026-11-08 it had no focus rule at all, so the entire
    app fell back to the browser default ring -- technically visible,
    unbranded, and near-invisible on navy. One rule there fixes every
    dashboard at once, which is the entire reason the sheet exists, and its
    absence is invisible until a keyboard user tries to tab.

(3) NO `outline: none` WITHOUT A `:focus-visible` SIBLING IN THE SAME FILE.
    Deleting the outline is how you delete keyboard access. It is legitimate
    exactly when the file draws its own ring -- Home.tsx:758 suppresses the
    outline on .ff-panel-box and immediately re-draws it with
    :focus-visible, which is correct and must stay passing.

    The same-file scope is deliberate. Cross-file reasoning ("the ring comes
    from the global sheet") is exactly the argument ServicePicker used to make
    by accident, where the mitigation was two event handlers away from the
    thing it mitigated and deleting either one removed the indicator
    silently. If a file kills the outline, that file shows the ring.

    Comments are stripped before matching, so a file DISCUSSING outline:none
    in prose -- which uiStyles.ts and ServicePicker.tsx both now do at
    length -- is not a finding.

(4) SPACING RATCHET -- the Law of Proximity. Things that belong together are
    read as belonging together because they sit closer than the things around
    them, so a spacing scale is a CORRECTNESS tool and not a tidiness one: if
    "the gap inside a card" and "the gap between cards" are 10.56px and
    13.20px, the grouping is not legible, and nobody did that on purpose -- it
    is two people typing `.6rem` and `.75rem` a year apart.

    The scale (--ff-s1..s10 = 4/8/12/16/20/24/32/40px, main.tsx:208-215) was
    used by 39 of 1731 single-value spacing declarations when measured
    2026-11-08. 1.5% adoption, worse than the orange ramp's 4%, and the gaps
    alone used NINE distinct values between .3rem and .8rem.

    THE STRUCTURAL REASON IT DRIFTED is worth more than the count: the scale
    is in px, every call site is in rem, and --ff-font-scale is 1.1, so
    1rem = 17.6px and a round rem value CANNOT land on a 4px grid except by
    coincidence (.5rem is 8.80px, not 8px). "Just use the token" was therefore
    never a free swap -- it always moved the pixels a little, which is exactly
    the friction that makes someone type `.5rem` again and move on.

    Ratchet, not a zero, for two independent reasons. The usual one: 1503 is
    not reachable in one reviewed pass. The specific one: a zero here would be
    WRONG, because several of migrate_spacing.py's refusals are permanent --
    a negative margin is correcting for something specific, and a multi-value
    shorthand's two numbers can quantize in opposite directions. Shorthands
    are not counted at all, for that reason.

(5) ALL THREE DISPLAY PREFERENCES ANSWERED. An absolute, not a ratchet --
    see the long note above PREF_QUERIES, including what it admits it cannot
    see (whether a frosted surface's ground is opaque ENOUGH).

(6) HAIRLINE RATCHET -- `1px solid <neutral>` must not come back.

    A 1px CSS border is THREE DEVICE PIXELS on a 3x screen. It is not "a thin
    line", it is a line three times heavier than the thinnest the display can
    draw, and that single fact is most of why a web separator reads as a rule
    while an iOS separator reads as a seam. --ff-hair-w (0.5px) resolves to one
    device pixel at 2x/3x and rounds up to 1px at 1x, so the heavier line
    survives exactly where it is the only one available.

    The token was added on 2026-11-08 with the other three material tokens and
    used FOUR times against 576 `1px solid` borders. For once the cause was not
    drift -- the token was added in the pass that stopped, so nothing was ever
    migrated onto it. tools/migrate_hairlines.py then rewrote 333 separators
    across 70 files.

    WHAT THIS COUNTS IS ONLY THE NEUTRALS, and that scoping is the whole
    design. A SEPARATOR GETS THINNER; A SIGNAL DOES NOT. The three needles are
    neutral BY NAME, not by appearance -- --ff-hair is named for the job,
    --ff-card-border is the card's own separator, and --ff-fg at a low alpha is
    the foreground bled into the ground. The ~222 accent and state borders
    (--ff-accent-rgb, --ff-c10, red/green/amber) are not counted at all,
    because on those the heavier line IS the information and thinning it is
    deleting information to gain tidiness. Counting them would make this
    number rise every time someone legitimately marks something as needing
    attention -- a gate that cries wolf.

    THE FLOOR IS 21 AND IT IS A SHARP ONE, which changes how to read a rise.
    All 21 are migrate_hairlines.py's mixed-ternary refusals:

        border: on ? "1px solid var(--ff-c10)" : "1px solid rgba(var(--ff-fg), .12)"

    Only the OFF arm is a separator, so migrating it alone makes the two states
    physically different SIZES -- a row of chips where the selected one is 1px
    wider than its neighbours, a static inconsistency in the middle of the
    screen. Those 21 need the pair decided together by a human (both arms to
    the hairline, losing the accent border's weight as a signal, or both stay).
    Nothing else neutral remains. So at 21 a rise is not ordinary drift: it is
    a new neutral border typed as 1px. Run the migration script -- it is
    idempotent, prints a reason per refused site, and will do the swap.

    Lines inside a standalone <!doctype html> document string are excluded, the
    same carve-out both migration scripts use: there is no :root there, and an
    UNDEFINED var() inside a `border` shorthand invalidates the whole
    declaration, so the border would VANISH rather than fall back to 1px --
    worse than the defect. (`border: var(--ff-hair-w) solid var(--ff-hair)` is
    otherwise safe because var() substitution happens BEFORE shorthand
    parsing.)

ALL SIX ARE SELF-CLEARING on the tree as written today, and the only way to
make any of them go red is to introduce the defect.

Note which laws got which SHAPE, because it is the reusable rule: the three
that are populations with an irreducible remainder (orange, spacing, hairlines)
are ratchets; the three that can genuinely be zero (the shared focus rule, the
unringed outline, the display preferences) are absolutes. Don't ratchet
something that can be zero, and don't demand zero of something that can't be.

Usage:  python3 tools/check_ux.py        # exits 1 and prints every finding
"""

import os
import re
import sys

REPO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = "src"

# ── (1) the ratchet ────────────────────────────────────────────────────────
# 971 when first measured 2026-11-08; 96 after tools/migrate_orange.py --apply
# the same day; 18 after the hand pass over those 96, also the same day.
# LOWER this when a migration lands; never raise it.
#
# Comment prose is stripped before counting, so this is the number of literals
# that actually RENDER. It is deliberately tight against the tree: a ratchet
# left slack by hundreds is not a ratchet, it is a number.
#
# 18 is believed to be the FLOOR -- see the docstring for why each of the four
# remaining groups is permanent. That matters for how to read a failure here:
# at 96 a rise meant "someone typed a literal instead of the token", which is
# ordinary drift. At 18 a rise much more likely means someone has reintroduced
# one of the four hazards the groups exist for -- a var() in a --ff-* declaration
# (the alias trap), a token handed to canvas, or a token in a presentation
# attribute. Read the new site before lowering anything.
BASELINE = 18

ORANGE = re.compile(r"#ea6b14|rgba\(\s*234\s*,\s*107\s*,\s*20\b", re.I)

# ── (4) the spacing ratchet ────────────────────────────────────────────────
# 1731 single-value spacing declarations when first measured 2026-11-08, of
# which 39 used the --ff-s* scale -- 1.5% adoption, worse than the orange
# ramp's 4%. tools/migrate_spacing.py swapped the 228 that were already within
# half a pixel of a token, leaving 1503 raw against 258 tokenised (14.7%).
#
# SAME RULE AS THE ORANGE RATCHET: may fall, never rise. Lower it when a
# migration pass or a hand pass lands. A "must be 0" assertion here would be
# red for years and would also be WRONG -- see the per-site refusals in
# migrate_spacing.py, several of which are permanent.
#
# 1503 -> 1486 on 2026-11-08 WITHOUT a migration pass: converting 13 dialogs to
# .ffu-scrim/.ffu-modal deleted their hand-rolled overlay and card style
# objects outright, and every `padding: "1.5rem"` in them went with it. That is
# the shape of most future progress here -- Proximity improves fastest when a
# layout moves to a shared primitive, not when a literal is swapped for a
# token one site at a time.
#
# 1486 -> 1481 the same day, by that mechanism a third time: the three read
# pages moved their h1 + dateline pair into <PageTitle>, and the marginBottom
# literals went with them. The replacement spacing lives in ui/uiStyles.ts,
# which this checker does not count because it scans style OBJECTS, not the
# stylesheet. That is not the ratchet flattering itself -- a value in the one
# shared sheet is the cured state, and counting it would tax the only cure.
#
# 1481 -> 1478 the same day, by the SAME mechanism a fourth time: the last two
# hand-rolled dialogs (ProfileCompleteCelebration, FreddyRewind) moved onto
# .ffu-scrim/.ffu-modal and their overlay padding and card padding went with
# them. Four falls, four by moving a layout onto a primitive, none by a
# migration pass -- at this point that is not a coincidence, it is the rule:
# PROXIMITY IMPROVES BY DELETING A HAND-ROLLED LAYOUT, not by swapping a
# literal for a token one site at a time. The token scale is how a primitive
# SPELLS its spacing; the primitive is what makes the ratios agree.
SPACING_BASELINE = 1478

SPACING_PROP = (
    r"(?:gap|rowGap|columnGap|padding|paddingTop|paddingBottom|paddingLeft"
    r"|paddingRight|margin|marginTop|marginBottom|marginLeft|marginRight)"
)
# Single-value quoted declarations only. A shorthand ("1rem 1.25rem") is
# deliberately NOT counted: its two numbers can quantize in opposite
# directions and the vertical/horizontal relationship inside a control is
# usually deliberate, so it is not work this ratchet should ever demand.
SPACING_RAW = re.compile(r'\b(%s):\s*"-?[0-9.]+(?:rem|px)"' % SPACING_PROP)

# ── (2) the shared sheet ───────────────────────────────────────────────────
FOCUS_SHEET = os.path.join("src", "components", "ui", "uiStyles.ts")

# ── (3) outline suppression ────────────────────────────────────────────────
OUTLINE_NONE = re.compile(r"outline\s*:\s*[\"']?none", re.I)
FOCUS_VISIBLE = re.compile(r"focus-visible")

# ── (6) the hairline ratchet ───────────────────────────────────────────────
# 354 neutral `1px solid` borders when measured 2026-11-08 (10 var(--ff-hair),
# 15 var(--ff-card-border), 329 rgba(var(--ff-fg), A)). migrate_hairlines.py
# --apply rewrote 333 of them across 70 files the same day, leaving exactly the
# 21 it refused.
#
# SAME RULE AS THE OTHER TWO RATCHETS: may fall, never rise.
#
# This one is the TIGHTEST of the three -- 21 with a known cause for every
# single site, rather than orange's 18 in four groups or spacing's 1478 in a
# long tail. Treat any rise as a specific new defect rather than as drift, and
# read the new site before touching this number.
#
# The three needles are the migration script's, verbatim and deliberately so:
# this check and that script must agree about what a separator IS, or the
# script will refuse something the check demands. They are duplicated rather
# than imported because the script imports FROM here (_strip_comments,
# _doc_lines) and the other direction would be a cycle.
HAIRLINE_BASELINE = 21

HAIR_NEUTRAL = (r"var\(--ff-hair\)"
                r"|var\(--ff-card-border\)"
                r"|rgba\(\s*var\(--ff-fg\)\s*,\s*[0-9.]+\s*\)")
HAIRLINE_RAW = re.compile(r"1px\s+solid\s+(?:%s)" % HAIR_NEUTRAL)

# ── (5) the three accessibility preferences ────────────────────────────────
# An OS can express three independent display preferences and this repo
# answered exactly ONE of them until 2026-11-08: prefers-reduced-motion was
# handled in 13 places, while prefers-reduced-transparency and
# prefers-contrast appeared ZERO times in all of src/ -- on the same day a
# material pass put --ff-glass / --ff-glass-blur onto four primitives and left
# four hand-rolled blurs in Home.tsx. The gap was invisible because none of
# the three is a fallback for the others: reducing motion does nothing for a
# user who cannot read text through a blur, and removing blur does nothing for
# one who cannot see a 0.5px hairline.
#
# WHAT THIS CHECKS AND WHAT IT CANNOT. It asserts the three blocks EXIST in
# main.tsx, which is where the two blanket backdrop-filter kills and the token
# overrides live. It is deliberately an absolute rather than a ratchet,
# because unlike the orange and spacing populations there is no irreducible
# remainder here -- three queries, all three present, reachable green state.
#
# It cannot check the half that matters most: whether each frosted surface's
# GROUND is opaque enough once the blur is gone. That is an alpha value read
# against an unknown backdrop and no regex decides it. So this guards against
# the blocks being deleted or a fourth preference being answered nowhere; the
# judgement call about alpha stays with whoever adds the surface, and the rule
# for them is in CLAUDE.md -- the surface must be legible with the blur
# removed, and a NEW translucent surface needs a line in one of these blocks.
PREF_QUERIES = ("prefers-reduced-motion", "prefers-reduced-transparency", "prefers-contrast")
PREF_SHEET = os.path.join("src", "main.tsx")

EXTS = (".ts", ".tsx", ".js", ".jsx")


def _walk(root):
    for dirpath, dirnames, filenames in os.walk(root):
        dirnames[:] = [d for d in dirnames if d != "node_modules"]
        for fn in sorted(filenames):
            if fn.endswith(EXTS):
                yield os.path.join(dirpath, fn)


def _strip_comments(text):
    """Blank out // and /* */ comments so prose ABOUT a pattern is never a
    finding, while preserving line structure so a line number still means
    something to a caller that reports one.

    WHY THIS IS A SCANNER AND NOT TWO REGEXES (2026-11-08). It was
    `re.sub(r"/\\*.*?\\*/", " ", text, flags=re.S)`, and that is WRONG in this
    tree in a way that quietly ate real findings. Every file picker here writes

        <input type="file" accept="image/*" ... />

    and the `/*` in that MIME wildcard opened a block comment the regex then ran
    to the next genuine `*/`, hundreds of lines later -- swallowing every orange
    literal in between. JobPhotos.tsx and ContractorDashboard.tsx each lost a
    whole region that way, which is why the ratchet read 95 when the tree holds
    97. A checker that under-counts its own ratchet cannot ratchet.

    So a `/*` inside a quoted string is not a comment opener, and that needs
    string state, and string state needs a scanner. Backticks are deliberately
    NOT treated as string delimiters: main.tsx's entire global stylesheet is one
    template literal, and the CSS `/* ... */` comments inside it -- several of
    which discuss the orange literal by name -- are real comments that must
    still be stripped. A quote inside a comment is ignored, so apostrophes in
    prose ("don't") cannot open a phantom string.
    """
    out = []
    i, n = 0, len(text)
    quote = None          # "'" or '"' when inside a string
    mode = None           # "line" or "block" when inside a comment
    while i < n:
        c = text[i]
        if mode == "line":
            if c == "\n":
                mode = None
                out.append(c)
            else:
                out.append(" ")
            i += 1
            continue
        if mode == "block":
            if c == "*" and text[i + 1:i + 2] == "/":
                mode = None
                out.append("  ")
                i += 2
                continue
            out.append("\n" if c == "\n" else " ")
            i += 1
            continue
        if quote:
            if c == "\\":
                out.append(text[i:i + 2])
                i += 2
                continue
            if c == quote or c == "\n":   # an unterminated string ends at EOL
                quote = None
            out.append(c)
            i += 1
            continue
        if c in "'\"":
            quote = c
            out.append(c)
            i += 1
            continue
        if c == "/" and text[i + 1:i + 2] == "/":
            mode = "line"
            out.append("  ")
            i += 2
            continue
        if c == "/" and text[i + 1:i + 2] == "*":
            mode = "block"
            out.append("  ")
            i += 2
            continue
        out.append(c)
        i += 1
    return "".join(out)


DOCTYPE = re.compile(r"<!doctype html|<!DOCTYPE html", re.I)
DOC_END = re.compile(r"</html>", re.I)
DOC_WINDOW_CAP = 90


def _doc_lines(lines):
    """1-indexed line numbers sitting inside a standalone-document string.

    A printed receipt / new-window document is a full `<!doctype html>` string
    opened with `window.open`, so it has NO `:root` -- every var() in it
    resolves to nothing. Both migration scripts must refuse to touch those
    lines, and this is the ONE copy of that rule (same reason _strip_comments
    is here rather than in each script).

    IT TERMINATES AT `</html>`, AND THAT IS THE FIX (2026-11-08). Both scripts
    carried a flat 90-line window from the doctype line with no end marker. The
    receipt opens at ClientDashboard.tsx:1037 and closes at :1063, so a 90-line
    window ran 64 lines PAST it and labelled ordinary JSX style objects at
    :1118-1127 as "standalone document". That was harmless only by luck -- every
    literal inside the over-reach happened to be over-tolerance anyway -- and a
    guard that is wrong but currently harmless is a guard that bites the day
    someone adds a migratable value inside the over-reach, silently refusing it
    with a reason that reads as authoritative.

    The 90-line cap stays as a BACKSTOP for a document string that never closes
    its `</html>` (a fragment, or a close built by concatenation): an unbounded
    scan to EOF on a malformed open would suppress the rest of the file.
    """
    out = set()
    n = len(lines)
    for i, line in enumerate(lines, 1):
        if not DOCTYPE.search(line):
            continue
        end = min(i + DOC_WINDOW_CAP, n)
        for j in range(i, end + 1):
            if DOC_END.search(lines[j - 1]):
                end = j
                break
        out.update(range(i, end + 1))
    return out


def _count_hairlines(src, repo):
    """(count, {relpath: count}) of neutral `1px solid` borders that RENDER.

    Comments stripped for the same reason as the other two ratchets -- this
    repo's prose quotes the needle verbatim in several places, including the
    migration script's own carve-out explanations, and a literal in prose
    renders nothing. Standalone-document lines excluded per _doc_lines.
    """
    total = 0
    per_file = {}
    for path in _walk(src):
        with open(path, "r", encoding="utf-8", errors="replace") as fh:
            text = fh.read()
        doc = _doc_lines(text.split("\n"))
        n = 0
        for lineno, line in enumerate(_strip_comments(text).split("\n"), 1):
            if lineno in doc:
                continue
            n += len(HAIRLINE_RAW.findall(line))
        if n:
            per_file[os.path.relpath(path, repo)] = n
            total += n
    return total, per_file


def check(repo=REPO):
    """Return a list of human-readable problems. [] means clean."""
    problems = []
    src = os.path.join(repo, SRC)
    if not os.path.isdir(src):
        return ["%s/ is missing entirely" % SRC]

    # (1) ratchet
    #
    # Comments are stripped before counting, and that is not a nicety. Three of
    # this repo's comments DISCUSS the literal by name -- Home.tsx explaining
    # why the hero marks are a knowing exception, ContractorDashboard twice
    # explaining a value-blind orange it already fixed. Counting those would
    # mean the ratchet could never reach them: the only way to lower the number
    # would be to delete the explanation, which is the opposite of what this
    # repo wants. A literal in prose renders nothing.
    total = 0
    per_file = {}
    for path in _walk(src):
        with open(path, "r", encoding="utf-8", errors="replace") as fh:
            n = len(ORANGE.findall(_strip_comments(fh.read())))
        if n:
            per_file[os.path.relpath(path, repo)] = n
            total += n

    if total > BASELINE:
        worst = sorted(per_file.items(), key=lambda kv: -kv[1])[:5]
        problems.append(
            "raw orange literals ROSE: %d now, ratchet is %d.\n"
            "      --ff-c10 is #ea6b14 in dark but #d65f10 in LIGHT, so a literal\n"
            "      paints the dark orange on the off-white ground. Use var(--ff-c10)\n"
            "      (or --ff-accent-500) -- NOT --ff-accent-400, which is the hover\n"
            "      step. Heaviest files: %s"
            % (total, BASELINE, ", ".join("%s (%d)" % (f, n) for f, n in worst))
        )

    # (2) the shared focus rule
    sheet = os.path.join(repo, FOCUS_SHEET)
    if not os.path.exists(sheet):
        problems.append(
            "%s is missing entirely -- it is the ONE injected sheet behind every\n"
            "      shared primitive in all three dashboards." % FOCUS_SHEET
        )
    else:
        with open(sheet, "r", encoding="utf-8", errors="replace") as fh:
            body = _strip_comments(fh.read())
        if not FOCUS_VISIBLE.search(body):
            problems.append(
                "%s has no :focus-visible rule.\n"
                "      Every shared Button/Row/IconButton across all three dashboards\n"
                "      then falls back to the browser default ring, which is unbranded\n"
                "      and near-invisible on navy. One rule in this sheet fixes the\n"
                "      whole app -- that is why the sheet exists." % FOCUS_SHEET
            )

    # (4) spacing ratchet -- the Law of Proximity
    #
    # Comments stripped for the same reason as the orange count: a spacing
    # literal quoted in prose (migrate_spacing.py's safe tier is written out in
    # its own docstring, and this repo's docs quote call sites verbatim)
    # renders nothing and must never make the number un-lowerable.
    spacing = 0
    spacing_per_file = {}
    for path in _walk(src):
        with open(path, "r", encoding="utf-8", errors="replace") as fh:
            n = len(SPACING_RAW.findall(_strip_comments(fh.read())))
        if n:
            spacing_per_file[os.path.relpath(path, repo)] = n
            spacing += n

    if spacing > SPACING_BASELINE:
        worst = sorted(spacing_per_file.items(), key=lambda kv: -kv[1])[:5]
        problems.append(
            "raw spacing literals ROSE: %d now, ratchet is %d.\n"
            "      Proximity is a CORRECTNESS tool, not tidiness: if the gap inside a\n"
            "      card and the gap between cards are 10.56px and 13.20px, the grouping\n"
            "      is not legible and nobody chose that. Use var(--ff-s1..s10)\n"
            "      (4/8/12/16/20/24/32/40px). NOTE the scale is in px and call sites are\n"
            "      in rem with --ff-font-scale 1.1, so a round rem value never lands on\n"
            "      the grid -- that is WHY the token is the right spelling, not the\n"
            "      literal. Run tools/migrate_spacing.py to see what is mechanical.\n"
            "      Heaviest files: %s"
            % (spacing, SPACING_BASELINE,
               ", ".join("%s (%d)" % (f, n) for f, n in worst))
        )

    # (6) hairline ratchet
    hair, hair_per_file = _count_hairlines(src, repo)
    if hair > HAIRLINE_BASELINE:
        worst = sorted(hair_per_file.items(), key=lambda kv: -kv[1])[:5]
        problems.append(
            "neutral 1px borders ROSE: %d now, ratchet is %d.\n"
            "      A 1px border is THREE DEVICE PIXELS on a 3x screen -- not a thin\n"
            "      line, a line three times heavier than the display can draw. Use\n"
            "      var(--ff-hair-w) solid <neutral>. Accent and state borders are NOT\n"
            "      counted and must stay 1px: a separator gets thinner, a signal does\n"
            "      not. The floor of %d is migrate_hairlines.py's mixed-ternary\n"
            "      refusals, so a rise here is a NEW neutral border typed as 1px\n"
            "      rather than drift. Run tools/migrate_hairlines.py -- it is\n"
            "      idempotent and prints a reason per site. Heaviest files: %s"
            % (hair, HAIRLINE_BASELINE, HAIRLINE_BASELINE,
               ", ".join("%s (%d)" % (f, n) for f, n in worst))
        )

    # (3) outline:none without a ring in the same file
    for path in _walk(src):
        with open(path, "r", encoding="utf-8", errors="replace") as fh:
            body = _strip_comments(fh.read())
        if not OUTLINE_NONE.search(body):
            continue
        if FOCUS_VISIBLE.search(body):
            continue
        rel = os.path.relpath(path, repo)
        problems.append(
            "%s kills the focus outline and never re-draws it.\n"
            "      No :focus-visible rule anywhere in this file, so a keyboard user\n"
            "      gets NO focus indicator -- silently, with nothing thrown. Either\n"
            "      drop the outline:none (a global ring in main.tsx then applies) or\n"
            "      add a :focus-visible rule in this file beside it." % rel
        )

    # (5) all three accessibility preferences answered
    pref_path = os.path.join(repo, PREF_SHEET)
    if not os.path.exists(pref_path):
        problems.append("%s is missing entirely." % PREF_SHEET)
    else:
        with open(pref_path, "r", encoding="utf-8", errors="replace") as fh:
            # Comments are NOT stripped for the media-query names on purpose:
            # these three strings appear in the prose of the very blocks they
            # open, so stripping would be harmless but pointless, and a rule
            # that only matched outside comments could be satisfied by prose
            # alone. The regex requires the @media, which prose does not have.
            pref_body = fh.read()
        for q in PREF_QUERIES:
            if not re.search(r"@media[^{]*" + re.escape(q), pref_body):
                problems.append(
                    "no @media (%s) rule in %s.\n"
                    "      An OS expresses THREE independent display preferences and none\n"
                    "      of them substitutes for another. This one is now unanswered\n"
                    "      site-wide, silently -- there is no error and nothing looks wrong\n"
                    "      on a machine that does not have the preference turned on.\n"
                    "      See CLAUDE.md -> Brand tokens, and the blocks at the end of the\n"
                    "      injected stylesheet in %s." % (q, PREF_SHEET, PREF_SHEET)
                )

    return problems


def main():
    problems = check()
    if not problems:
        src = os.path.join(REPO, SRC)
        total = 0
        spacing = 0
        for path in _walk(src):
            with open(path, "r", encoding="utf-8", errors="replace") as fh:
                body = _strip_comments(fh.read())
            total += len(ORANGE.findall(body))
            spacing += len(SPACING_RAW.findall(body))
        hair, _ = _count_hairlines(src, REPO)
        print("ok   ux laws (%d raw orange, ratchet %d; %d raw spacing, ratchet %d; "
              "%d neutral 1px borders, ratchet %d; shared focus rule present; "
              "no unringed outline:none; all 3 display preferences answered)"
              % (total, BASELINE, spacing, SPACING_BASELINE,
                 hair, HAIRLINE_BASELINE))
        return 0
    print("FAIL ux-law violation in %s/\n" % SRC)
    for p in problems:
        print("  %s" % p)
    print("\nThese fail INVISIBLY: no error, no failed build, just an unreachable")
    print("control or the wrong orange. See CLAUDE.md -> UX laws.")
    return 1


if __name__ == "__main__":
    sys.exit(main())
