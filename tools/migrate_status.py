#!/usr/bin/env python3
"""
One-shot migration: raw STATUS-colour literals -> the theme-aware status tokens.

WHY (2026-11-08). This is the orange bug again, in four more colours, and it was
found while aligning Contractor and Admin to Client. The same semantic colour was
being spelled two ways INSIDE ONE FILE -- `color:"#22c55e"` on one line and
`color:"var(--ff-success)"` forty lines down -- so the inconsistency was not even
cross-file drift you could blame on two authors. Counted at the start: 102 raw
sites across the three dashboards against 76 uses of the four tokens.

AND IT IS A LIVE BUG IN BOTH THEMES AT ONCE, which is worse than orange was.
Read the token pairs as a SET:

    --ff-success   #86efac dark   #15803d light
    --ff-warn      #fbbf24 dark   #b45309 light
    --ff-danger    #f87171 dark   #dc2626 light
    --ff-info      #93c5fd dark   #2563eb light

The light value is DARKER than the dark value, because the dark theme needs a
pale hue to carry on navy and the light theme needs a deep one to carry on
off-white. The literals being replaced sit BETWEEN the two: #22c55e is neither
#86efac nor #15803d. So a hardcoded "success" green was the wrong green on navy
and ALSO the wrong green on off-white. Orange at least looked right in dark mode.

⚠️ THE MIGRATION IS THEREFORE VISIBLE, not a no-op. Every rewritten site gets
lighter in dark mode and darker in light mode. That is the point -- it is now the
same green as the token spelling beside it -- but it wants a human eye on both
themes after the run, which no checker can give.

THE EIGHT SUBSTITUTIONS, four hues x two spellings:

    #22c55e              ->  var(--ff-success)
    rgba(34,197,94,A)    ->  rgba(var(--ff-success-rgb), A)      alpha preserved
    #f59e0b / 245,158,11 ->  var(--ff-warn)   / --ff-warn-rgb
    #ef4444 / 239,68,68  ->  var(--ff-danger) / --ff-danger-rgb
    #3b82f6 / 59,130,246 ->  var(--ff-info)   / --ff-info-rgb

The four `-rgb` triplets were added to main.tsx for this run, for exactly the
reason --ff-accent-rgb exists: the three dashboards carried 54 alpha tints across
15 distinct alphas, and folding those onto two named steps would have been a
visual redesign wearing a token migration's clothes. The alpha stays at the call
site; only the colour is tokenised. They are MIGRATION tokens -- a new tint wants
a plain var(--ff-success).

WHAT IT REFUSES, and the one refusal that is NEW here
-----------------------------------------------------
The classifier is imported wholesale from migrate_orange.py -- ONE copy of the
JSX-attribute / JS-assignment / custom-property / comment / standalone-document
rules, for the same reason check_ux owns the scanner. Read that file's header for
why each one exists; all five apply here unchanged, and the custom-property one
is what stops this script from eating the four token DECLARATIONS in main.tsx.

The new hazard is one this script does NOT detect and a human must: a FILLED
BUTTON'S PAIRED INK. `background:"#22c55e", color:"#06210f"` is near-black on
mid-green, which is fine; rewrite only the background and light mode becomes
near-black on #15803d, about 1.3:1, which is unreadable. The ink has to move in
the same edit, and the correct ink for all four hues in both themes is
`var(--ff-bg)` -- it is the page ground, so it is dark when the hue is pale and
pale when the hue is dark, by construction.

Seven such pairs existed inside the three dashboards and ALL SEVEN WERE FIXED BY
HAND BEFORE THIS SCRIPT WAS FIRST RUN, so it would see none of them. That order
matters and is not an accident: a regex cannot tell a filled button from a tinted
chip, so the only safe sequence is pairs-by-hand-first, then the mechanical pass
over what is left. If you point this at new files, GREP FOR SOLID-HUE
BACKGROUNDS FIRST:

    grep -n 'background:\s*"#\(22c55e\|f59e0b\|ef4444\|3b82f6\)"'

SCOPE: the three dashboards by default, `--all` for the whole tree
-----------------------------------------------------------------
This is deliberately narrower than migrate_orange.py, which went tree-wide. The
job that found this was dashboard alignment, and `src/` outside the dashboards
holds roughly 70 more sites -- including filled buttons in ContractPanel and
MilestonePanel, the two highest-risk money surfaces on the platform, each with
the paired-ink hazard above. Migrating those is a separate, reviewed pass, not a
side effect of this one. `--all` exists so that pass is a flag and not a rewrite
of this script, but run it with the grep above in hand.

Usage:
    python3 tools/migrate_status.py --dry-run          # report only (default)
    python3 tools/migrate_status.py --apply
    python3 tools/migrate_status.py --all --dry-run    # whole tree

After --apply: `npm run typecheck`, then `python3 tools/check_ux.py`, then look
at both themes.
"""

import os
import re
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
# ONE copy of the refusal rules and ONE copy of the scanner. _classify is
# colour-blind by construction -- it is handed a line and a column and asks only
# what KIND of site that column is -- so it transfers here with no edit, which is
# the test of whether it was the right shape to begin with.
from migrate_orange import _classify  # noqa: E402
from check_ux import _strip_comments, _doc_lines  # noqa: E402

REPO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(REPO, "src")
EXTS = (".ts", ".tsx")

DASHBOARDS = (
    "src/pages/ClientDashboard.tsx",
    "src/pages/ContractorDashboard.tsx",
    "src/pages/AdminDashboard.tsx",
)

# hue -> (hex, (r, g, b), solid token, triplet token)
HUES = {
    "success": ("#22c55e", (34, 197, 94), "var(--ff-success)", "--ff-success-rgb"),
    "warn":    ("#f59e0b", (245, 158, 11), "var(--ff-warn)",    "--ff-warn-rgb"),
    "danger":  ("#ef4444", (239, 68, 68),  "var(--ff-danger)",  "--ff-danger-rgb"),
    "info":    ("#3b82f6", (59, 130, 246), "var(--ff-info)",    "--ff-info-rgb"),
}


def _rgba_re(rgb):
    """rgba(r, g, b, A) with any whitespace, capturing the alpha."""
    return re.compile(
        r"rgba\(\s*%d\s*,\s*%d\s*,\s*%d\s*,\s*([0-9.]+)\s*\)" % rgb, re.I)


def _prefix_re(rgb):
    """The rgba PREFIX, alpha not required -- see the note in the rewrite loop."""
    return re.compile(r"rgba\(\s*%d\s*,\s*%d\s*,\s*%d\b" % rgb, re.I)


PATTERNS = []   # (hue, kind, compiled) -- kind is "hex" | "rgba" | "prefix"
for _hue, (_hex, _rgb, _solid, _trip) in HUES.items():
    PATTERNS.append((_hue, "hex", re.compile(re.escape(_hex), re.I)))
    PATTERNS.append((_hue, "rgba", _rgba_re(_rgb)))
    PATTERNS.append((_hue, "prefix", _prefix_re(_rgb)))

# One pattern to find the next hit of ANY hue in either spelling, so the
# left-to-right walk below has a single cursor. Same shape as migrate_orange's
# ANY: it matches the rgba prefix WITHOUT requiring a parseable alpha, so an odd
# spelling is SEEN and reported rather than silently stepped over.
ANY = re.compile("|".join(
    [re.escape(h) for h, _, _, _ in HUES.values()]
    + [r"rgba\(\s*%d\s*,\s*%d\s*,\s*%d\b" % rgb for _, rgb, _, _ in HUES.values()]
), re.I)


def _which(line, col):
    """Return (hue, kind, match) for the literal starting at col, or None."""
    for hue, kind, pat in PATTERNS:
        if kind == "prefix":
            continue
        m = pat.match(line, col)
        if m:
            return hue, kind, m
    for hue, kind, pat in PATTERNS:
        if kind != "prefix":
            continue
        m = pat.match(line, col)
        if m:
            return hue, "unparsed", m
    return None


def _files(all_files):
    if not all_files:
        for rel in DASHBOARDS:
            yield os.path.join(REPO, rel)
        return
    for dirpath, dirnames, filenames in os.walk(SRC):
        dirnames[:] = [d for d in dirnames if d != "node_modules"]
        for fn in sorted(filenames):
            if fn.endswith(EXTS):
                yield os.path.join(dirpath, fn)


def run(apply=False, all_files=False):
    swapped = {h: 0 for h in HUES}
    skipped = []
    touched = []

    for path in _files(all_files):
        rel = os.path.relpath(path, REPO)
        with open(path, "r", encoding="utf-8") as fh:
            text = fh.read()
        lines = text.split("\n")
        bare = _strip_comments(text).split("\n")
        doc_lines = _doc_lines(lines)
        changed = False

        for idx, line in enumerate(lines):
            lineno = idx + 1
            if not ANY.search(line):
                continue
            out = []
            pos = 0
            while True:
                m = ANY.search(line, pos)
                if not m:
                    out.append(line[pos:])
                    break
                out.append(line[pos:m.start()])
                reason = _classify(line, m.start(), doc_lines, lineno, bare[idx])
                if reason:
                    skipped.append((rel, lineno, line[m.start():m.start() + 30], reason))
                    out.append(line[m.start():m.end()])
                    pos = m.end()
                    continue
                hit = _which(line, m.start())
                if hit is None or hit[1] == "unparsed":
                    skipped.append((rel, lineno, line[m.start():m.start() + 30],
                                    "not a parseable literal (prose, or an alpha "
                                    "this script does not understand)"))
                    out.append(line[m.start():m.end()])
                    pos = m.end()
                    continue
                hue, kind, mm = hit
                _hex, _rgb, solid, trip = HUES[hue]
                if kind == "rgba":
                    out.append("rgba(var(%s), %s)" % (trip, mm.group(1)))
                else:
                    out.append(solid)
                pos = mm.end()
                swapped[hue] += 1
                changed = True
            lines[idx] = "".join(out)

        if changed:
            touched.append(rel)
            if apply:
                with open(path, "w", encoding="utf-8") as fh:
                    fh.write("\n".join(lines))

    total = sum(swapped.values())
    print("%s %d literal(s) across %d file(s)%s"
          % ("rewrote" if apply else "WOULD rewrite", total, len(touched),
             "" if all_files else "   [dashboards only -- see --all]"))
    for hue in sorted(swapped):
        if swapped[hue]:
            print("    %-8s %3d" % (hue, swapped[hue]))
    print()
    if skipped:
        by_reason = {}
        for rel, lineno, snippet, reason in skipped:
            by_reason.setdefault(reason, []).append((rel, lineno, snippet))
        print("LEFT FOR A HUMAN -- %d literal(s). Each needs a per-site decision;"
              % len(skipped))
        print("none of these can be swapped mechanically without breaking something.")
        for reason in sorted(by_reason):
            hits = by_reason[reason]
            print("\n  %s  (%d)" % (reason, len(hits)))
            for rel, lineno, snippet in hits[:14]:
                print("    %s:%d  %s" % (rel, lineno, snippet.strip()))
            if len(hits) > 14:
                print("    ... and %d more" % (len(hits) - 14))
    else:
        print("nothing left for a human.")
    return 0


def main():
    apply = "--apply" in sys.argv
    all_files = "--all" in sys.argv
    if not apply and "--dry-run" not in sys.argv:
        print("(no flag given -- defaulting to --dry-run)\n")
    return run(apply=apply, all_files=all_files)


if __name__ == "__main__":
    sys.exit(main())
