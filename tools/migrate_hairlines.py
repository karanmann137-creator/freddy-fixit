#!/usr/bin/env python3
"""
Migration: structural `1px solid <neutral>` borders in src/ -> --ff-hair-w.

WHY (2026-11-08). `--ff-hair-w: 0.5px` was added with the other three material
tokens and then used FOUR times, against 576 `1px solid` borders in src/. That
is 0.7% adoption -- worse than the orange ramp's 4% and worse than the spacing
scale's 1.5%, and for once the cause is not drift: the token was added in the
same pass that stopped, so nothing was ever migrated onto it.

The reason the width matters, which is the whole point and is easy to lose:
**a 1px CSS border is THREE device pixels on a 3x screen.** It is not "a thin
line", it is a line three times heavier than the thinnest the display can
draw. That single fact is most of why a web separator reads as a rule and an
iOS separator reads as a seam. `0.5px` resolves to one device pixel at 2x/3x
and rounds up to 1px at 1x, so the heavier line survives exactly where it is
the only line available.

WHAT THIS MIGRATES -- three needles, all of them NEUTRAL by name:

    1px solid var(--ff-hair)           10
    1px solid var(--ff-card-border)    15
    1px solid rgba(var(--ff-fg), A)   329
                                      ---
                                      354

Nothing here is inferred from a colour's appearance. `--ff-hair` is named for
the job, `--ff-card-border` is the card's own separator, and `--ff-fg` at a low
alpha is the foreground bled into the ground -- the definition of a separator.
A SEPARATOR GETS THINNER; A SIGNAL DOES NOT.

WHAT IT REFUSES, and the first one is the interesting one:

  1. A MIXED TERNARY -- 21 lines. `border: on ? "1px solid var(--ff-c10)"
     : "1px solid rgba(var(--ff-fg), .12)"`. Only the OFF arm is a separator,
     so a blanket pass migrates one arm of a two-arm toggle and the two states
     stop being the same size. The visible defect is not the 0.5px motion on
     click -- it is a ROW OF CHIPS where the selected one is physically 1px
     wider than its neighbours, which is a static inconsistency sitting in the
     middle of the screen. These 21 need the pair decided together by a human:
     either both arms go to the hairline (losing the accent border's weight as
     a signal) or both stay. Refused, not guessed.

     The detection is PER LINE -- a line is refused when it holds at least one
     migratable `1px solid` and at least one that is not. That is deliberately
     conservative and can in principle false-positive on a line setting two
     unrelated properties (borderTop neutral, borderBottom accent). All 21
     current hits are genuine ternaries, and the asymmetry is the argument:
     **a false positive here leaves a border at 1px, which is the status quo,
     while a false negative ships a visibly uneven row.**

  2. ACCENT AND STATE BORDERS -- 222 sites, untouched by construction because
     they do not match a needle. `rgba(var(--ff-accent-rgb), A)` (106),
     `var(--ff-c10)` (20), `var(--ff-accent-line)` (3), and the semantic
     families: red 239,68,68 (24), green 34,197,94 (16), amber 251,191,36 (8),
     WhatsApp green 37,211,102 (2), and the rest. On these the heavier line IS
     the signal -- thinning a "this needs your attention" border is deleting
     information to gain tidiness. CLAUDE.md states this as a rule; this
     script is where it is mechanical.

  3. `1px solid transparent` -- 5 sites. A transparent border is RESERVING
     LAYOUT for a border that appears in another state. Changing its width is
     changing the layout of the state that has no border at all. All five pair
     with an accent arm or with `none`, so none of them is a hidden instance
     of refusal 1.

  4. STANDALONE DOCUMENTS. ClientDashboard's printed receipt is a full
     `<!doctype html>` string opened in a new window with no `:root`, so
     `var(--ff-hair-w)` would resolve to nothing and the border would vanish
     entirely -- a worse failure than the one being fixed. Carve-out imported
     from check_ux._doc_lines, the ONE copy of that rule.

  5. COMMENTS. Same per-POSITION test as migrate_spacing.py, using the same
     imported check_ux._strip_comments, so there is ONE scanner.

WHY THE `border` SHORTHAND IS SAFE HERE, since it is the obvious objection:
`var()` substitution happens BEFORE shorthand parsing, so `border:
var(--ff-hair-w) solid var(--ff-hair)` parses exactly as if the width were
written out. uiStyles.ts:656 (.ffu-ptitle-bar) has shipped this spelling since
the collapsing-title work, so it is proven in this codebase, not just in the
spec. The one thing that would break it is the token being UNDEFINED, which is
refusal 4 -- an undefined var() in a shorthand invalidates the whole
declaration, so the border disappears rather than falling back to 1px.

This script handles CSS inside `<style>` template literals as well as quoted JS
declarations (317 quoted / 37 CSS), which is the opposite of migrate_spacing.py
and not an inconsistency: spacing in a `<style>` block is often inside a media
query where the right answer differs per breakpoint, while a separator's width
does not change with the viewport.

Usage:
    python3 tools/migrate_hairlines.py --dry-run     # report only (default)
    python3 tools/migrate_hairlines.py --apply       # rewrite files in place

After --apply: run `npm run typecheck`, then LOWER HAIRLINE_BASELINE in
check_ux.py to the new count, then `python3 tools/check_ux.py`. Idempotent -- a
second --apply rewrites nothing, because the needle requires the literal `1px`.
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

# The three neutral needles. Each is NAMED for a separator's job -- none of this
# is inferred from how a colour looks.
NEUTRAL = (r"var\(--ff-hair\)"
           r"|var\(--ff-card-border\)"
           r"|rgba\(\s*var\(--ff-fg\)\s*,\s*[0-9.]+\s*\)")

MIGRATABLE = re.compile(r"1px(\s+)solid(\s+)(%s)" % NEUTRAL)
# Any `1px solid` at all, migratable or not. Used only for the mixed-line test.
ANY_BORDER = re.compile(r"1px\s+solid")


def _files():
    for dirpath, dirnames, filenames in os.walk(SRC):
        dirnames[:] = [d for d in dirnames if d != "node_modules"]
        for fn in sorted(filenames):
            if fn.endswith(EXTS):
                yield os.path.join(dirpath, fn)


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
            hits = list(MIGRATABLE.finditer(line))
            if not hits:
                continue

            snippet = line.strip()
            if len(snippet) > 120:
                snippet = snippet[:117] + "..."

            # ---- refusal 1: a mixed line. See the header for why this is
            # per-line and why a false positive is the cheap direction.
            if len(ANY_BORDER.findall(line)) > len(hits):
                skipped.append((rel, lineno, snippet,
                                "mixed line -- an accent/state `1px solid` sits "
                                "beside the separator, so migrating one arm "
                                "makes the two states different SIZES. Decide "
                                "the pair together."))
                continue

            # ---- refusal 4: no :root in a standalone document, and an
            # undefined var() in a shorthand deletes the border outright.
            if lineno in doc_lines:
                skipped.append((rel, lineno, snippet,
                                "standalone document (no :root -- an undefined "
                                "var() invalidates the shorthand and the border "
                                "VANISHES, worse than 1px)"))
                continue

            out = []
            pos = 0
            for m in hits:
                # ---- refusal 5: a hit inside a comment. Per-POSITION test:
                # the same offset in the stripped text is no longer the literal.
                raw = m.group(0)
                if bare[idx][m.start():m.start() + len(raw)] != raw:
                    skipped.append((rel, lineno, snippet,
                                    "inside a comment (prose renders nothing)"))
                    continue
                out.append(line[pos:m.start()])
                # preserve the author's spacing exactly -- `border:1px solid x`
                # and `border: 1px solid x` both occur and both must survive
                out.append("var(--ff-hair-w)%ssolid%s%s"
                           % (m.group(1), m.group(2), m.group(3)))
                swapped += 1
                changed = True
                pos = m.end()
            if pos:
                out.append(line[pos:])
                lines[idx] = "".join(out)

        if changed:
            touched.append(rel)
            if apply:
                with open(path, "w", encoding="utf-8") as fh:
                    fh.write("\n".join(lines))

    print("%s %d separator(s) across %d file(s)"
          % ("rewrote" if apply else "WOULD rewrite", swapped, len(touched)))
    print()
    if skipped:
        by_reason = {}
        for rel, lineno, snippet, reason in skipped:
            by_reason.setdefault(reason, []).append((rel, lineno, snippet))
        print("LEFT ALONE -- %d line(s)." % len(skipped))
        for reason in sorted(by_reason):
            hits = by_reason[reason]
            print("\n  %s  (%d)" % (reason, len(hits)))
            for rel, lineno, snippet in hits[:25]:
                print("    %s:%d\n        %s" % (rel, lineno, snippet))
            if len(hits) > 25:
                print("    ... and %d more" % (len(hits) - 25))
    else:
        print("nothing left alone.")
    print()
    print("Accent and state borders are untouched BY CONSTRUCTION -- they match "
          "no needle.\nOn those the heavier line is the signal. See the header.")
    return 0


def main():
    apply = "--apply" in sys.argv
    if not apply and "--dry-run" not in sys.argv:
        print("(no flag given -- defaulting to --dry-run)\n")
    return run(apply=apply)


if __name__ == "__main__":
    sys.exit(main())
