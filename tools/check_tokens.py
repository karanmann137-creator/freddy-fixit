#!/usr/bin/env python3
"""
Theme-token parity guard for src/main.tsx -- the .ff-on-dark literal check.

WHY THIS FILE EXISTS (2026-11-08). It did not. CLAUDE.md and
docs/brand-and-motion.md both cited `tools/check_tokens.js` as a live gate
asserting "30/30 tokens", and that file had never been written -- the same
failure shape as `.github/` on 2026-11-04, where a documented workflow turned
out not to exist at all. A documented check is absent until you have seen the
file. This is the file.

THE BUG IT CATCHES, precisely. main.tsx declares the palette three times:

    :root                                  dark values (dark is the default --
                                           there is no data-theme attribute)
    :root[data-theme="light"]              the light overrides
    .ff-on-dark (+ .ff-anchor)             dark values again, to force navy
                                           chrome inside a light-mode page

A custom property is substituted WHERE IT IS DECLARED, not where it is used. So
this, inside .ff-on-dark:

    --ff-c60: var(--ff-bg);

resolves --ff-bg at the point of declaration -- picking up whatever :root or the
light block last set -- and then inherits into the subtree still carrying the
LIGHT value. The navy band renders off-white. Nothing throws, no build fails,
and you find out by looking at the site. That is why the seven aliases in that
class are spelled out as literals, and it is the whole content of the rule in
CLAUDE.md that this script finally makes mechanical.

TWO ASSERTIONS, both derived rather than listed. A hand-maintained list of
"the 30 tokens" would rot the first time someone added a colour, which is
exactly the failure being prevented, so neither rule names a single token:

  (1) PARITY. Every custom property the light block overrides is theme-
      dependent BY CONSTRUCTION -- overriding it is what makes it so. Each one
      must therefore also be restored inside .ff-on-dark, or a forced-navy
      subtree under light mode keeps the light value. Adding a colour to the
      light block without a .ff-on-dark counterpart is the defect; this finds
      it the same day.

  (2) NO var() INSIDE .ff-on-dark. Any declaration in that block whose value
      contains var() is the substitution trap above, in the one place it is
      guaranteed to bite. rgba(var(--ff-fg), .06) is the SAME trap and is
      caught too: --ff-fg is itself re-declared in all three blocks.

WHY IT IS SELF-CLEARING, which is the bar every check here has to meet: both
assertions are green on the tree as written today, and the only way to make
either go red is to introduce the defect. A check that is red on arrival
teaches the owner to ignore the whole report.

Usage:  python3 tools/check_tokens.py        # exits 1 and prints every miss
"""

import os
import re
import sys

REPO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
TARGET = os.path.join("src", "main.tsx")

# The three blocks, keyed by the selector text that opens them. These are
# substrings of the real selector, not the whole thing, so reformatting the
# selector list does not break the guard.
ROOT_OPEN = ":root {"
LIGHT_OPEN = ':root[data-theme="light"] {'
# The forced-navy block is opened by a two-selector list; the second line is
# the stable one to find, since the first is a :not() that has been reworded
# before.
DARK_OPEN = ':root[data-theme="light"] .ff-on-dark.ff-anchor {'

# Properties that are deliberately NOT restored in .ff-on-dark because they are
# not colours and have nothing theme-dependent to get wrong. Each needs a
# reason, and the reason must be "a px value / a filter / a curve cannot render
# the wrong theme" -- never "we forgot" and never "it looked fine".
#
# Keep this EMPTY unless a non-colour genuinely lands in the light block. It is
# a pressure valve for a real case, not a place to silence a finding.
EXEMPT: "set[str]" = set()

DECL = re.compile(r"(--[a-zA-Z0-9-]+)\s*:\s*([^;]*);")


def _block(body: str, opener: str) -> str:
    """Return the text between `opener` and its matching closing brace."""
    i = body.find(opener)
    if i < 0:
        return ""
    start = i + len(opener)
    depth = 1
    for j in range(start, len(body)):
        if body[j] == "{":
            depth += 1
        elif body[j] == "}":
            depth -= 1
            if depth == 0:
                return body[start:j]
    return body[start:]


def _strip_comments(text: str) -> str:
    """Drop /* ... */ so a token NAMED in prose is never read as declared."""
    return re.sub(r"/\*.*?\*/", " ", text, flags=re.S)


def check(repo: str = REPO):
    """Return a list of human-readable problems. [] means clean."""
    problems = []
    path = os.path.join(repo, TARGET)
    if not os.path.exists(path):
        return ["%s is missing entirely" % TARGET]

    with open(path, "r", encoding="utf-8", errors="replace") as fh:
        body = fh.read()

    for name, opener in (("root", ROOT_OPEN), ("light", LIGHT_OPEN), ("on-dark", DARK_OPEN)):
        if opener not in body:
            problems.append(
                "could not find the %s block (looked for %r in %s).\n"
                "      The selector was reworded, or the block is gone. Either way this\n"
                "      guard is now blind -- fix the opener above, do not delete the check."
                % (name, opener, TARGET)
            )
    if problems:
        return problems

    light = _strip_comments(_block(body, LIGHT_OPEN))
    dark = _strip_comments(_block(body, DARK_OPEN))

    light_decls = {m.group(1): m.group(2).strip() for m in DECL.finditer(light)}
    dark_decls = {m.group(1): m.group(2).strip() for m in DECL.finditer(dark)}

    # Assertion (2) walks a LIST, not the dict above, and the difference is a
    # real miss found by negative-testing this file on 2026-11-08. A dict keeps
    # only the LAST declaration of a repeated token, which matches the CSS
    # cascade -- so an aliased declaration followed later in the same block by a
    # literal is, strictly, harmless. But a token declared twice in that block
    # is already a mistake nobody made on purpose, the harmless reading depends
    # on source order the next editor has no reason to preserve, and a checker
    # whose coverage silently depends on which copy came last is not a checker.
    # Flag every occurrence.
    dark_pairs = [(m.group(1), m.group(2).strip()) for m in DECL.finditer(dark)]

    # (1) parity
    for tok in sorted(light_decls):
        if tok in EXEMPT or tok in dark_decls:
            continue
        problems.append(
            "%s is overridden in the light block but NOT restored in .ff-on-dark.\n"
            "      Light sets it to %r. A forced-navy subtree under light mode will\n"
            "      therefore render the LIGHT value -- add the dark literal to the\n"
            "      .ff-on-dark block, or add it to EXEMPT with a reason if it is not\n"
            "      a colour." % (tok, light_decls[tok])
        )

    # (2) no var() in the forced-navy block
    for tok, val in sorted(dark_pairs):
        if "var(" in val:
            problems.append(
                "%s inside .ff-on-dark has a var() in its value: %r\n"
                "      A var() in a custom-property DECLARATION is substituted where it\n"
                "      is declared, so this freezes to whatever the light block last set\n"
                "      and inherits into the navy subtree carrying the wrong theme.\n"
                "      Spell the value out as a literal." % (tok, val)
            )

    return problems


def main():
    problems = check()
    if not problems:
        path = os.path.join(REPO, TARGET)
        with open(path, "r", encoding="utf-8", errors="replace") as fh:
            body = fh.read()
        n_light = len(set(DECL.findall(_strip_comments(_block(body, LIGHT_OPEN)))))
        n_dark = len(set(DECL.findall(_strip_comments(_block(body, DARK_OPEN)))))
        print("ok   theme tokens in parity (%d light override(s) all restored; "
              "%d declaration(s) in .ff-on-dark, none aliased)" % (n_light, n_dark))
        return 0
    print("FAIL theme-token parity broken in %s\n" % TARGET)
    for p in problems:
        print("  %s" % p)
    print("\nThis is the failure with NO runtime symptom: no error, no failed build,")
    print("just a band rendering the wrong theme. See CLAUDE.md -> Brand tokens.")
    return 1


if __name__ == "__main__":
    sys.exit(main())
