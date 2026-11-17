#!/usr/bin/env python3
"""
Legal-disclosure guard. Two checks, both mechanical, both self-clearing.

WHY THIS FILE EXISTS (2026-11-17). docs/legal.md names the gap in plain words:

    "A processor added by writing an edge function is invisible to the legal
     pages -- nothing in the ship path asks 'did this add a third party?'"

That sentence described a real hole and then left it open, because the remedy
was a habit. This file is the remedy as a gate instead. Every outbound host the
code reaches must be DECLARED here, next to the clause that covers it, and a
host nobody has declared refuses the ship.

THE FAILURE CLASS IS AN ABSENCE, which is why no other layer sees it.
`platform_health_check()` reads rows and a missing policy clause is not a row.
Typecheck reads types and a `fetch()` to a new vendor is perfectly typed. The
smoke tests load the site and an undisclosed processor renders beautifully. You
find out from a PIPA complaint, months later, which is the worst possible
moment and the only one where it costs money.

WHY A DECLARED LIST RATHER THAN A SCRAPE OF THE POLICY PAGE. Parsing a JSX
table to decide whether a row "covers" api.vendor.com is a guess, and a gate
that guesses is a gate that cries wolf. Declaring it by hand is a deliberate
act: whoever adds the host has to write down which clause covers it, and if
they cannot name one, that IS the finding. The cost is that this list and the
page can drift -- so the entries carry the clause number, and the weekly review
reads both.

WHAT THIS CANNOT SEE, so do not trust it as the whole answer:
  - a host assembled at runtime from parts, or read from an env var
  - a processor reached by a vendor's own SDK from inside their script
  - whether the policy's DESCRIPTION of a declared host is still true
  - whether the UA 12 14-day amendment notice was ever sent
The last two are judgement calls and belong to the weekly review, which
proposes wording and waits for the owner. Nothing here or there ever publishes
a legal page on its own: UA 12 promises 14 days' email notice before an
amendment takes effect, so a silent auto-update would breach the very terms it
edited.

Usage:  python3 tools/check_legal.py
        (also imported by tools/ship.py, and run standalone in CI)
"""
import os
import re
import sys

REPO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

# The version string the legal pages claim, and the value
# `platform_settings.terms_version` must hold in the live DB. Check 2 keeps the
# two pages agreeing with this and with each other; only the weekly review can
# reach the database to confirm the third leg.
#
# Bump this ONLY as part of publishing an amendment -- which means sending the
# UA 12 notice too. See docs/legal.md.
TERMS_VERSION = "2026-11-16"
TERMS_VERSION_PRETTY = "November 16, 2026"

LEGAL_PAGES = ["src/pages/PrivacyPolicy.tsx", "src/pages/UserAgreement.tsx"]

# ---------------------------------------------------------------------------
# THE DECLARED LIST. Host -> the clause that covers it, in the words someone
# answering a regulator would use. Add a host here and you have written the
# justification; fail to, and the ship stops.
#
# This is deliberately ONE-DIRECTIONAL: every host in the code must be
# declared, but a declared row need not appear in the code. Cloudflare and
# Vercel are both 6.2 processors with no URL anywhere in src/ -- they are
# infrastructure the traffic passes through, not something we call.
# ---------------------------------------------------------------------------
DECLARED = {
    # --- Privacy Policy 6.2 processor rows -------------------------------
    "api.anthropic.com":          "PP 6.2 Anthropic PBC (Claude)",
    "api.resend.com":             "PP 6.2 Resend, Inc.",
    "api.pwnedpasswords.com":     "PP 6.2 Have I Been Pwned (Pwned Passwords)",
    "images.unsplash.com":        "PP 6.2 Unsplash",
    "photon.komoot.io":           "PP 6.2 Komoot GmbH (Photon) -- address look-up",
    "analytics.google.com":       "PP 6.2 Google LLC -- Analytics",
    "www.googletagmanager.com":   "PP 6.2 Google LLC -- Analytics loader",
    "fonts.googleapis.com":       "PP 6.2 Google LLC -- Fonts (loads on EVERY page, pre-consent)",
    "fonts.gstatic.com":          "PP 6.2 Google LLC -- Fonts (font files)",
    "tools.google.com":           "PP 6.2 Google LLC -- the GA opt-out page we link to",
    "www.google.com":             "PP 6.2 Google LLC",
    "accounts.google.com":        "PP 6.2 Google LLC -- Sign in with Google",
    "us.i.posthog.com":           "PP 6.2 PostHog, Inc.",
    "us-assets.i.posthog.com":    "PP 6.2 PostHog, Inc. -- static assets",
    "stripe.com":                 "PP 6.2 Stripe, Inc.",
    "js.stripe.com":              "PP 6.2 Stripe, Inc. -- Stripe.js",
    "api.stripe.com":             "PP 6.2 Stripe, Inc. -- API",
    "connect.stripe.com":         "PP 6.2 Stripe, Inc. -- Connect onboarding",
    "supabase.co":                "PP 6.2 Supabase, Inc.",

    # --- Covered by a clause OTHER than 6.2 ------------------------------
    # The lead scouts. 6.5 is careful about the direction of travel: we READ
    # public posts, we send nothing about our users to either platform. If that
    # ever becomes a two-way integration, 6.5 stops being true and 6.2 needs a
    # Meta row -- which is exactly the kind of change this gate cannot see, so
    # say it out loud in the ship that makes it.
    "graph.facebook.com":         "PP 6.5 Meta Platforms, Inc. -- one-way read of public posts",
    "business.facebook.com":      "PP 6.5 Meta Platforms, Inc. -- one-way read of public posts",
    "www.facebook.com":           "PP 6.5 Meta Platforms, Inc. -- one-way read of public posts",
    "oauth.reddit.com":           "PP 6.5 Reddit, Inc. -- one-way read of public posts",
    "www.reddit.com":             "PP 6.5 Reddit, Inc. -- one-way read of public posts",

    # --- Covered by the 6.2 footnote: handle no personal information -----
    "deno.land":                  "PP 6.2 footnote -- code delivery at build/deploy time, no user data",
    "esm.sh":                     "PP 6.2 footnote -- code delivery at build/deploy time, no user data",
    "cdnjs.cloudflare.com":       "PP 6.2 footnote -- code delivery, no user data",
    "g.page":                     "PP 6.2 footnote -- public map link to our Google Business Profile",

    # --- Our own surfaces. Not a third party. ----------------------------
    "freddyfixit.ca":             "own domain",
    "www.freddyfixit.ca":         "own domain",
    "freddy-fixit.vercel.app":    "own domain (Vercel preview/apex), PP 6.2 Vercel, Inc.",

    # --- Not a network call at all ---------------------------------------
    # These appear as string literals because XML and JSON-LD identify their
    # vocabularies by URL. Nothing ever fetches them. They are declared rather
    # than filtered out by a rule, because a rule that silently drops hosts is
    # the thing this file exists to prevent.
    "schema.org":                 "not a call -- JSON-LD vocabulary identifier",
    "www.w3.org":                 "not a call -- XML/SVG namespace identifier",

    # --- Links the USER chooses to follow --------------------------------
    # Their browser goes there; we transmit nothing. Still declared, because
    # following a link does put the visitor's IP in someone else's log.
    "www.oipc.ab.ca":             "user-followed link -- the Alberta regulator the policy names for complaints",

    # DELIBERATELY ABSENT: wa.me. ClientSuccess.tsx used to carry a "Message us
    # on WhatsApp" button -- click-to-chat to our own business number, so we
    # transmitted nothing, but the destination was Meta and 6.5 covers Meta only
    # as a one-way READ of public posts, which is not a contact channel. The
    # first finding this checker surfaced; the owner chose to remove the button
    # (2026-11-17) rather than write a clause for it. Not re-declaring it is the
    # point: a wa.me link reappearing anywhere now refuses the ship, which is
    # cheaper than remembering the decision.
}

SCAN = [("src", (".ts", ".tsx")),
        ("supabase/functions", (".ts",)),
        ("index.html", None)]

SKIP_DIRS = {"node_modules", "dist", ".git", "__pycache__", "playwright-report", "test-results"}

URL = re.compile(r"https?://([A-Za-z0-9](?:[A-Za-z0-9.-]*[A-Za-z0-9])?)")

# A host matches a declared entry exactly, or as a subdomain of one. The
# suffix form is what covers the project-ref Supabase host
# (kvypmjxbbaaknvddwwai.supabase.co) without pinning the ref in two places.
SUFFIX_OK = ("supabase.co", "stripe.com", "freddyfixit.ca")


def _covered(host):
    if host in DECLARED:
        return DECLARED[host]
    for base in SUFFIX_OK:
        if host == base or host.endswith("." + base):
            return DECLARED[base]
    return None


def _files():
    for root, exts in SCAN:
        full = os.path.join(REPO, root)
        if os.path.isfile(full):
            yield root, full
            continue
        for dirpath, dirnames, filenames in os.walk(full):
            dirnames[:] = [d for d in dirnames if d not in SKIP_DIRS]
            for fn in sorted(filenames):
                if exts and fn.endswith(exts):
                    p = os.path.join(dirpath, fn)
                    yield os.path.relpath(p, REPO), p


def check(repo=REPO):
    problems = []

    # -- Check 1: every outbound host is declared ------------------------
    found = {}
    for rel, full in _files():
        try:
            with open(full, encoding="utf-8", errors="ignore") as fh:
                body = fh.read()
        except OSError:
            continue
        for m in URL.finditer(body):
            host = m.group(1).lower().rstrip(".")
            if "." not in host:
                continue  # localhost, a bare scheme in prose
            if _covered(host) is None:
                line = body.count("\n", 0, m.start()) + 1
                found.setdefault(host, []).append("%s:%d" % (rel, line))

    for host in sorted(found):
        where = found[host][:3]
        more = "" if len(found[host]) <= 3 else " (+%d more)" % (len(found[host]) - 3)
        problems.append(
            "UNDECLARED THIRD-PARTY HOST: %s\n"
            "      at %s%s\n"
            "      The code sends a request to a host no legal clause covers. Either\n"
            "      add a Privacy Policy 6.2 row for it in the SAME ship and declare it\n"
            "      in tools/check_legal.py DECLARED, or remove the call. If the host\n"
            "      receives no personal information, declare it under the 6.2 footnote\n"
            "      and say why." % (host, ", ".join(where), more))

    # -- Check 2: the two legal pages agree on the version ---------------
    # A page edited without its sibling is the drift that makes "Last Updated"
    # meaningless, and both pages are cross-referenced from the acceptance
    # record, which stamps TERMS_VERSION server-side.
    for rel in LEGAL_PAGES:
        full = os.path.join(repo, rel)
        if not os.path.isfile(full):
            problems.append("MISSING LEGAL PAGE: %s" % rel)
            continue
        body = open(full, encoding="utf-8", errors="ignore").read()
        m = re.search(r"Last Updated:\s*([A-Z][a-z]+ \d{1,2}, \d{4})", body)
        if not m:
            problems.append(
                "NO \"Last Updated\" DATE in %s\n"
                "      Every legal page states the date it last changed; the acceptance\n"
                "      record is meaningless without it." % rel)
        elif m.group(1) != TERMS_VERSION_PRETTY:
            problems.append(
                "LEGAL PAGE VERSION DRIFT in %s\n"
                "      page says \"Last Updated: %s\", TERMS_VERSION here says \"%s\".\n"
                "      Either the page was amended without bumping TERMS_VERSION (so no\n"
                "      user will ever be asked to re-accept it), or TERMS_VERSION was\n"
                "      bumped without amending the page. Fix whichever is wrong, update\n"
                "      platform_settings.terms_version to match, and send the UA 12\n"
                "      14-day notice." % (rel, m.group(1), TERMS_VERSION_PRETTY))

    return problems


def main():
    problems = check()
    if not problems:
        hosts = sum(1 for _ in DECLARED)
        print("ok   legal disclosure (%d declared host(s); no undeclared outbound host "
              "in src/ or supabase/functions/; both legal pages read \"Last Updated: %s\")"
              % (hosts, TERMS_VERSION_PRETTY))
        return 0
    print("FAIL legal disclosure: %d problem(s)\n" % len(problems))
    for p in problems:
        print("  - %s" % p)
    print("\nThese fail INVISIBLY. Nothing throws, the build is clean, the site looks")
    print("right -- and you find out from a PIPA complaint. See docs/legal.md.")
    return 1


if __name__ == "__main__":
    sys.exit(main())
