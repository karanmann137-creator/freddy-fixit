#!/usr/bin/env python3
"""
Migration: raw spacing literals in src/ -> the --ff-s* scale. SAFE TIER ONLY.

WHY (2026-11-08). The Law of Proximity says things that belong together are read
as belonging together because they sit closer than the things around them. That
makes a spacing scale a correctness tool, not a tidiness one: if "the gap inside
a card" and "the gap between cards" are 10.56px and 13.20px, the grouping is
not legible, and nobody did that on purpose -- it is two people typing `.6rem`
and `.75rem` a year apart.

The scale already existed (`--ff-s1..s10` = 4/8/12/16/20/24/32/40px, main.tsx
:208-215) and was used by 39 of 1731 **single-value** spacing declarations
(2571 counting multi-value shorthands, which this script refuses -- see below).
1.5% adoption, worse than the orange ramp's 4%. The gaps alone used NINE
distinct values between .3rem and .8rem.

THE STRUCTURAL REASON THIS DRIFTED, which matters more than the count:
**the scale is in px and every call site is in rem, and `--ff-font-scale` is
1.1**, so `html { font-size: calc(100% * 1.1) }` makes 1rem = 17.6px. A round
rem value therefore CANNOT land on a 4px grid except by coincidence --
`.5rem` is 8.80px, not 8px. So "just use the token" was never a free swap for
anyone who tried it: it always moved the pixels a little, which is exactly the
kind of friction that makes a developer type `.5rem` again and move on.

That is why this script migrates a SAFE TIER and refuses the rest. A literal is
rewritten only when the token it would become is **within 0.5px** of what the
literal already computes to -- half a CSS pixel, under one device pixel on the
2x/3x screens this is mostly read on. Everything else is a visual decision and
is printed for a human.

THE SAFE TIER, all seven members, with the shift each one takes:

    4px      ->  var(--ff-s1)    0.00px   exact; pure token adoption
    .45rem   ->  var(--ff-s2)    0.08px
    .7rem    ->  var(--ff-s3)    0.32px
    1.8rem   ->  var(--ff-s8)    0.32px
    .25rem   ->  var(--ff-s1)    0.40px
    .2rem    ->  var(--ff-s1)    0.48px
    .9rem    ->  var(--ff-s4)    0.16px

**`.5rem` IS NOT IN IT, and that is the whole discipline of this script.** It is
the single most common spacing value in the codebase (232 sites) and it misses
`--ff-s2` by 0.80px. Including it would have migrated more than twice as many
sites and would have been the one change in this pass that a person could see.
The threshold was quoted as 0.5px before the arithmetic was run and `.5rem` was
predicted to clear it; it does not. **The threshold did not move to fit the
prediction** -- if it had, "within half a pixel" would mean nothing the next
time somebody invokes it.

WHAT IT REFUSES TO TOUCH:

  1. MULTI-VALUE SHORTHANDS -- `padding: "1rem 1.25rem"`. Two numbers that may
     quantize in opposite directions, and the vertical/horizontal relationship
     inside a control is deliberate often enough that it cannot be assumed.

  2. NEGATIVE VALUES -- `marginTop: "-.25rem"`. A negative margin is almost
     always correcting for something specific (an optical overhang, a nested
     container's own padding), so the nearest token is meaningless.

  3. CSS INSIDE `<style>` BLOCKS AND TEMPLATE LITERALS. The matcher requires a
     quoted JS object value (`gap: "..."`), so the `.ffdash` blocks and
     main.tsx's stylesheet are untouched by construction. Not an oversight: CSS
     there can use the token directly and several of those rules are inside
     media queries where the right answer differs per breakpoint.

  4. STANDALONE DOCUMENTS -- ClientDashboard's printed receipt is a full
     `<!doctype html>` string opened in a new window with no `:root`, so every
     var() in it resolves to nothing. Same carve-out as migrate_orange.py.

  5. COMMENTS. Detection is check_ux._strip_comments, imported rather than
     reimplemented so there is ONE scanner (the repo's one-copy rule), and the
     test is per-POSITION: a hit is in a comment iff that same offset in the
     stripped text is no longer the literal. See that function's docstring for
     why `accept="image/*"` makes the naive regex version wrong.

Usage:
    python3 tools/migrate_spacing.py --dry-run     # report only (default)
    python3 tools/migrate_spacing.py --apply       # rewrite files in place

After --apply: run `npm run typecheck`, then LOWER `SPACING_BASELINE` in
check_ux.py to the new count, then `python3 tools/check_ux.py`. The first run
landed 228 swaps on 2026-11-08. The script is idempotent -- a second --apply
rewrites nothing.

The ratchet then fell again, 1503 -> 1486, with this script untouched: the 13
dialog conversions to .ffu-scrim/.ffu-modal deleted their hand-rolled overlay
and card style objects and took the padding literals with them. Worth knowing
before reaching for this script -- moving a layout onto a shared primitive
removes spacing declarations, where this only renames them.
"""

import os
import re
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
# ONE copy of the scanner and ONE copy of the standalone-document rule.
from check_ux import _strip_comments, _doc_lines  # noqa: E402

REPO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(REPO, "src")
EXTS = (".ts", ".tsx")

# --ff-font-scale is 1.1 and main.tsx:390 is
#   html { font-size: calc(100% * var(--ff-font-scale, 1)); }
# so 1rem is 17.6px everywhere on the site. Changing the scale changes which
# literals are safe, which is a reason to prefer the token, not a reason to
# re-run this with a different number: the tokens are px and do not move.
ROOT_PX = 16 * 1.1

TOKENS = {1: 4, 2: 8, 3: 12, 4: 16, 5: 20, 6: 24, 8: 32, 10: 40}

# Half a CSS pixel. Under one device pixel at 2x. Do not raise this; see the
# header on why .5rem is excluded.
TOLERANCE_PX = 0.5

PROP = (r"(?:gap|rowGap|columnGap|padding|paddingTop|paddingBottom|paddingLeft"
        r"|paddingRight|margin|marginTop|marginBottom|marginLeft|marginRight)")

# A single-value quoted declaration. The quoted value must be ONE number plus a
# unit and nothing else, so a shorthand ("1rem 1.25rem") simply does not match
# and lands in the report as an unmigrated site rather than being half-rewritten.
DECL = re.compile(r'\b(%s):\s*"(-?[0-9.]+)(rem|px)"' % PROP)


def _files():
    for dirpath, dirnames, filenames in os.walk(SRC):
        dirnames[:] = [d for d in dirnames if d != "node_modules"]
        for fn in sorted(filenames):
            if fn.endswith(EXTS):
                yield os.path.join(dirpath, fn)


def nearest(value, unit):
    """Return (token_number, delta_px, computed_px) for the closest --ff-s*."""
    px = value * ROOT_PX if unit == "rem" else value
    k, tpx = min(TOKENS.items(), key=lambda kv: abs(kv[1] - px))
    return k, abs(tpx - px), px


def run(apply=False):
    swapped = 0
    skipped = []
    touched = []

    for path in _files():
        rel = os.path.relpath(path, REPO)
        with open(path, "r", encoding="utf-8") as fh:
            text = fh.read()
        lines = text.split("\n")
        bare = _strip_comments(text).split("\n")
        doc_lines = _doc_lines(lines)
        changed = False

        for idx, line in enumerate(lines):
            lineno = idx + 1
            if not DECL.search(line):
                continue
            out = []
            pos = 0
            while True:
                m = DECL.search(line, pos)
                if not m:
                    out.append(line[pos:])
                    break
                out.append(line[pos:m.start()])
                raw = m.group(0)
                prop, val, unit = m.group(1), m.group(2), m.group(3)
                snippet = "%s: \"%s%s\"" % (prop, val, unit)

                def skip(reason):
                    skipped.append((rel, lineno, snippet, reason))
                    out.append(raw)

                # a hit inside a comment -- same offset in the stripped text is
                # no longer the literal
                if bare[idx][m.start():m.start() + len(raw)] != raw:
                    skip("inside a comment (prose renders nothing)")
                    pos = m.end()
                    continue
                if lineno in doc_lines:
                    skip("standalone document (no :root, var() resolves to nothing)")
                    pos = m.end()
                    continue
                try:
                    v = float(val)
                except ValueError:
                    skip("unparseable number")
                    pos = m.end()
                    continue
                if v < 0:
                    skip("negative value (corrects for something specific; "
                         "nearest token is meaningless)")
                    pos = m.end()
                    continue
                if v == 0:
                    skip("zero (0 needs no token)")
                    pos = m.end()
                    continue

                k, delta, px = nearest(v, unit)
                if delta > TOLERANCE_PX:
                    skip("%.2fpx -> --ff-s%d would move it %.2fpx "
                         "(over the %.1fpx bar) -- a VISUAL decision"
                         % (px, k, delta, TOLERANCE_PX))
                    pos = m.end()
                    continue

                out.append('%s: "var(--ff-s%d)"' % (prop, k))
                swapped += 1
                changed = True
                pos = m.end()
            lines[idx] = "".join(out)

        if changed:
            touched.append(rel)
            if apply:
                with open(path, "w", encoding="utf-8") as fh:
                    fh.write("\n".join(lines))

    print("%s %d literal(s) across %d file(s)"
          % ("rewrote" if apply else "WOULD rewrite", swapped, len(touched)))
    print()
    if skipped:
        by_reason = {}
        for rel, lineno, snippet, reason in skipped:
            # collapse the per-value detail in the over-tolerance reason so the
            # report groups by KIND of refusal, not by 36 distinct numbers
            key = ("over the tolerance -- a VISUAL decision"
                   if "VISUAL decision" in reason else reason)
            by_reason.setdefault(key, []).append((rel, lineno, snippet))
        print("LEFT ALONE -- %d declaration(s)." % len(skipped))
        for reason in sorted(by_reason):
            hits = by_reason[reason]
            print("\n  %s  (%d)" % (reason, len(hits)))
            for rel, lineno, snippet in hits[:10]:
                print("    %s:%d  %s" % (rel, lineno, snippet))
            if len(hits) > 10:
                print("    ... and %d more" % (len(hits) - 10))
    else:
        print("nothing left alone.")
    return 0


def main():
    apply = "--apply" in sys.argv
    if not apply and "--dry-run" not in sys.argv:
        print("(no flag given -- defaulting to --dry-run)\n")
    return run(apply=apply)


if __name__ == "__main__":
    sys.exit(main())
