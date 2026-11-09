#!/usr/bin/env python3
"""
One-shot migration: raw orange literals in src/ -> brand tokens.

WHY (2026-11-08). Von Restorff in this repo means orange appears exactly once
per screen and only when the answer is "you". The token system says so twice
independently -- main.tsx's token comments ("Reserved for ONE action per view";
"use the ramp rather than a raw hex") and ui/StateLine.tsx's gate -- and both
were losing badly: 971 raw literals across 80 files against ~45 uses of the
entire accent ramp, about 4% token adoption.

It is also a LIVE LIGHT-MODE BUG rather than untidiness. --ff-c10 is #ea6b14
in dark but #d65f10 in light, so every one of those 971 literals painted the
dark-mode orange onto the off-white ground. Nothing throws; you find out by
switching the theme and looking.

THE TWO SUBSTITUTIONS, both exact in dark mode:

    #ea6b14              ->  var(--ff-c10)
    rgba(234,107,20,A)   ->  rgba(var(--ff-accent-rgb), A)      alpha preserved

The second one is why --ff-accent-rgb was added. Folding fifteen distinct
alphas onto -soft (0.12) and -line (0.32) would have been a visual redesign
wearing a token migration's clothes, and some of those alphas are load-bearing
-- the photo-pulse keyframe animates .55 -> 0.

WHAT IT REFUSES TO TOUCH, which is the actual content of this script. A blind
sed would have broken all three of these:

  1. JSX/SVG ATTRIBUTES -- stroke=, fill=, and color= on anything that is not
     an <Ic>. A presentation attribute is not a CSS declaration, and var()
     support in one is uneven enough that a token passed that way can resolve
     to nothing and draw an INVISIBLE icon. The fix is per-site: set CSS
     `color` on the element and let currentColor carry through the attribute.

     `color=` ON AN <Ic> WAS 68 OF THESE 78 AND IS NOW SAFE (2026-11-08), but
     NOT because the rule was relaxed -- because Ic stopped being an instance of
     it. It used to render stroke={color}; it now renders the constant
     stroke="currentColor" and turns the prop into a real CSS `color`
     declaration in its inline style. The hazard was the mechanism, so the
     mechanism was changed rather than the 68 call sites, and the refusal
     survives for the shape that still has it: the carve-out in _classify is
     keyed on the ELEMENT, so a raw <svg color="…"> is still refused.

     That left 10 real refusals of this kind: 8 stroke= and 2 fill= on
     hand-written SVG. ServicePicker.tsx shows the currentColor pattern.

  2. CUSTOM-PROPERTY DECLARATIONS -- a var() inside a `--ff-*:` declaration is
     substituted WHERE IT IS DECLARED, so rewriting --ff-accent-soft to
     rgba(var(--ff-accent-rgb), …) would freeze it to whatever the enclosing
     block last set. That is the .ff-on-dark alias trap exactly.
     tools/check_tokens.py would catch it; better not to write it.

  3. STANDALONE DOCUMENTS -- ClientDashboard's printed receipt is a full
     <!doctype html> string opened in a new window. It has no :root, so every
     var() in it resolves to nothing. A token there is not a fix, it is a
     blank.

Everything it skips, it PRINTS with file:line, because the whole point of the
split is that a human finishes the job. Re-run it after a hand pass to see
what is left.

Usage:
    python3 tools/migrate_orange.py --dry-run     # report only (default)
    python3 tools/migrate_orange.py --apply       # rewrite files in place

After --apply: run `npm run typecheck`, then `python3 tools/check_ux.py`, then
LOWER the BASELINE constant in check_ux.py to the new count. That constant
falling is the ratchet clicking.
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

HEX = re.compile(r"#ea6b14", re.I)
RGBA = re.compile(r"rgba\(\s*234\s*,\s*107\s*,\s*20\s*,\s*([0-9.]+)\s*\)", re.I)
ANY = re.compile(r"#ea6b14|rgba\(\s*234\s*,\s*107\s*,\s*20", re.I)

# (1a) a JSX/SVG attribute: ident="<literal>" or ident={"<literal>"}, with NO
# space around the '=' -- that is the JSX convention and every real hazard in
# this tree follows it (color=, stroke=, fill=). `style` never appears in this
# shape here (always style={{...}}), so it needs no exception.
ATTR = re.compile(r"""([A-Za-z][A-Za-z0-9_$-]*)=\{?\s*["']\s*$""")

# The open <Ic tag the hit sits inside, if any. `[^<>]*` cannot cross another
# tag boundary, so this matches only when <Ic is the element currently being
# written -- an <Ic> earlier on the same line that has already closed does not
# vouch for a later attribute. See the carve-out in _classify.
IC_ELEMENT = re.compile(r"<Ic\b[^<>]*$")

# (1b) a JS assignment: `ident = "<literal>"`, spaces around the '='. A
# different hazard, reported separately because the reason differs. Three
# shapes live here and only one of them is actually safe:
#   ctx.fillStyle = "#ea6b14"     CANVAS -- var() does not resolve at all
#   el.style.borderColor = "..."  imperative style; a var() would work, but a
#                                 handler-drawn colour is the ServicePicker
#                                 anti-pattern and wants a CSS rule instead
#   const ORANGE = "#ea6b14"      a module constant; safe, but whether it
#                                 should become a token or be deleted in favour
#                                 of var() at its use sites is a judgement call
# Leaving all three to a human is the conservative read, and the report says
# which is which by showing the line.
ASSIGN = re.compile(r"""([A-Za-z][A-Za-z0-9_$.\[\]-]*)\s+=\s+["']\s*$""")

# (2) a custom-property declaration on the same line, to the LEFT of the hit.
CUSTOM_PROP = re.compile(r"--[A-Za-z0-9-]+\s*:[^;]*$")

# (3) a standalone document assembled as a string. Detected per FILE by the
# doctype, then per LINE -- a file may contain one such block and a page's
# worth of ordinary styles, so skipping the whole file would be wrong. The rule
# is check_ux._doc_lines, imported for the same one-copy reason as the scanner
# above; it ends the block at `</html>` rather than at a flat 90-line window,
# which is the 2026-11-08 over-reach fix (see that function's docstring).

# (4) COMMENTS. Three comments in this tree discuss the literal by name --
# Home.tsx explaining why the hero marks are a knowing exception to the
# once-per-screen rule, ContractorDashboard twice explaining a value-blind
# orange it has already fixed. The first run of this script rewrote all three
# into "a literal var(--ff-c10)", which is self-contradicting nonsense and had
# to be undone by hand. A literal in prose renders nothing; leave prose alone.
#
# Detection is check_ux._strip_comments, imported rather than reimplemented so
# there is ONE scanner (the repo's one-copy rule). It blanks comment bytes while
# preserving length and line structure EXACTLY, which is what makes the
# per-POSITION test below possible: a hit is in a comment iff that same offset
# in the stripped text is no longer the literal. Position beats the line-based
# guess this script shipped with -- that one hand-rolled its own block-comment
# tracker, and `accept="image/*"` opened a block it never closed, so every
# orange literal from JobPhotos.tsx:180 and ContractorDashboard.tsx:2894 onward
# was reported as "inside a comment" when two of them were live color= props.


def _files():
    for dirpath, dirnames, filenames in os.walk(SRC):
        dirnames[:] = [d for d in dirnames if d != "node_modules"]
        for fn in sorted(filenames):
            if fn.endswith(EXTS):
                yield os.path.join(dirpath, fn)


def _classify(line, col, doc_lines, lineno, bare_line):
    """Return None to rewrite, or a reason string to skip.

    `bare_line` is the same line with comment bytes blanked, same length -- so
    `bare_line[col] != line[col]` means this exact hit sits inside a comment.
    """
    before = line[:col]
    if bare_line[col:col + 1] != line[col:col + 1]:
        return "inside a comment (prose renders nothing)"
    if lineno in doc_lines:
        return "standalone document (no :root, var() resolves to nothing)"
    m = ATTR.search(before)
    if m:
        # `color=` on an <Ic> is SAFE AS OF 2026-11-08 and nothing else about
        # this branch changed. Ic no longer renders stroke={color}: `stroke` is
        # the constant "currentColor" and the prop becomes a real CSS `color`
        # declaration in the inline style, where var() has always worked. The
        # carve-out is keyed on the ELEMENT, not on the attribute name -- `color`
        # is also a genuine SVG presentation attribute, so a raw <svg color="…">
        # would still be the original hazard and still gets refused here.
        if m.group(1) == "color" and IC_ELEMENT.search(before):
            return None
        return ("JSX/SVG attribute %s=  (presentation attribute -- var() support is "
                "uneven; use currentColor)" % m.group(1))
    m = ASSIGN.search(before)
    if m:
        return ("JS assignment %s =  (canvas / imperative style / module constant -- "
                "see the script header)" % m.group(1))
    if CUSTOM_PROP.search(before):
        return "custom-property declaration (var() here is the alias trap)"
    return None


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
            if not ANY.search(line):
                continue
            out = []
            pos = 0
            # Walk left-to-right so a column index is meaningful, and rebuild
            # the line rather than re-scanning a mutating string.
            while True:
                m = ANY.search(line, pos)
                if not m:
                    out.append(line[pos:])
                    break
                reason = _classify(line, m.start(), doc_lines, lineno, bare[idx])
                out.append(line[pos:m.start()])
                if reason:
                    skipped.append((rel, lineno, line[m.start():m.start() + 26], reason))
                    out.append(line[m.start():m.end()])
                    pos = m.end()
                    continue
                # Rewrite. Re-match at this exact position so the full rgba(...)
                # including its alpha is consumed, not just the ANY prefix.
                #
                # ANY deliberately matches the rgba PREFIX without requiring a
                # parseable alpha, so that a malformed or unusual spelling is
                # SEEN rather than silently passed over -- but it must not then
                # be rewritten blind. Everything the two precise patterns can't
                # parse is reported instead. Today that is exactly one hit:
                # main.tsx's own comment describing the migration.
                r = RGBA.match(line, m.start())
                h = HEX.match(line, m.start())
                if not r and not h:
                    skipped.append((rel, lineno, line[m.start():m.start() + 26],
                                    "not a parseable literal (prose, or an alpha "
                                    "this script does not understand)"))
                    out.append(line[m.start():m.end()])
                    pos = m.end()
                    continue
                if r:
                    out.append("rgba(var(--ff-accent-rgb), %s)" % r.group(1))
                    pos = r.end()
                else:
                    out.append("var(--ff-c10)")
                    pos = h.end()
                swapped += 1
                changed = True
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
            by_reason.setdefault(reason, []).append((rel, lineno, snippet))
        print("LEFT FOR A HUMAN -- %d literal(s). Each needs a per-site decision;" % len(skipped))
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
    if not apply and "--dry-run" not in sys.argv:
        print("(no flag given -- defaulting to --dry-run)\n")
    return run(apply=apply)


if __name__ == "__main__":
    sys.exit(main())
