#!/usr/bin/env python3
"""
Critical-mount guard -- the ONE copy of the invariant table.

WHY THIS FILE EXISTS (2026-11-04). The table below lived inside tools/ship.py,
where it was checked only for files that a given ship happened to touch. That is
the wrong trigger twice over:

  * A mount can be dropped by a route that isn't a ship -- a hand edit, a
    half-applied installer, a bad merge -- and ship.py would never look at the
    file again unless something else changed it.
  * The failure it exists to catch is SILENT. fa5e2b5 dropped the
    <ContractPanel/> mounts and, because the payment gate fails CLOSED, made
    every job on the platform unpayable with no error anywhere: the client
    simply had no surface on which to sign. Nothing in the product reported it.

So the table moved here, ship.py imports it, and CI runs this script on every
push with no regard for what changed. A guard that only fires when you remember
to look is not a guard.

The entries are deliberately COARSE -- a substring, not a parse. The question
being asked is "is this component still mounted at all", and a substring answers
that without pretending to understand JSX. A renamed component will trip this
and should: renaming a mount is exactly when you want to be asked.

Usage:  python3 tools/check_mounts.py        # exits 1 and prints every miss
"""

import os
import sys

REPO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

# ---------------------------------------------------------------------------
# A file may be edited freely, but if one of these strings stops appearing in
# it, something upstream deleted a mount and the tree is refused.
#
# Each entry is here because its absence is INVISIBLE AT RUNTIME -- the page
# still renders, the build still passes, and the capability is simply gone.
# That is the only test for membership. Do not add a mount whose absence throws.
# ---------------------------------------------------------------------------
INVARIANTS = {
    # The payment gate fails closed, so no ContractPanel means no job can ever
    # be paid for, with no error on any surface. This is the costliest entry.
    "src/pages/ClientDashboard.tsx": ["<ContractPanel"],
    "src/pages/ContractorDashboard.tsx": ["<ContractPanel", "STAGE_MATCH", "JobsCalendar"],
    "src/pages/AdminDashboard.tsx": [
        "<ContractPanel",
        # 2026-11-04: without this mount every admin_guard() RPC refuses with
        # "Verify your sign-in code first" and there is no surface anywhere in
        # the product that can request that code. The owner sat locked out of
        # his own dashboard, unable to approve a waiting contractor, with the
        # remedy named in an error message and reachable from nowhere.
        "<VerifyCodeModal",
        "offerVerify",
        # 2026-11-04: the Agents tab is the ONLY surface that can approve an
        # agent proposal -- admin_review_agent_action carries admin_guard(), so
        # it needs a real auth.uid() and cannot be called from a SQL session or
        # an artifact. Drop either half and the queue fills up silently while
        # every agent waits on an approval that has nowhere to come from.
        #
        # This is precisely how the predecessor queue died. social_actions was
        # correct, granted and gated, with working propose/list/review RPCs --
        # and no UI was ever built for them, so it sat at 0 rows for months and
        # read as dead code. Both needles, because the nav entry without the
        # body is an empty tab and the body without the nav entry is a tab that
        # cannot be reached. Neither throws.
        '{ key: "agents"',
        'tab === "agents"',
        # 2026-11-05: the only caller of the agent-draft-lead edge function.
        # Its absence is invisible from every direction -- the two RPCs, the
        # deployed function and the raised Haiku budget on the registry row all
        # keep existing and throw nothing, the lead cards still render, and the
        # only symptom is that the owner silently goes back to writing every
        # follow-up himself. Exactly the shape this table is for.
        "draftLead(a)",
    ],
    # Same lockout reached from the other side: the OAuth route had no MFA
    # handling at all, so Google sign-in walked straight past the second factor
    # AND never refreshed the 12-hour window that admin_guard() reads.
    "src/pages/AuthCallback.tsx": ["<VerifyCodeModal", "mfaOwed"],
    # One predicate behind every "you need to verify" surface. If this export
    # disappears the two mounts above go with it.
    "src/lib/mfa.ts": ["export async function mfaOwed"],
    "src/App.tsx": ["<ChatWidget", "<GoogleReviewModal", "<FinishSignupBanner", "<ScrollToTop"],
    "src/main.tsx": ["initAnalytics"],
}


def check(repo=REPO):
    """Return a list of (path, needle) pairs that are missing. [] means clean."""
    misses = []
    for rel, needles in sorted(INVARIANTS.items()):
        path = os.path.join(repo, rel)
        if not os.path.exists(path):
            misses.append((rel, "<file is missing entirely>"))
            continue
        with open(path, "r", encoding="utf-8", errors="replace") as fh:
            body = fh.read()
        # A file that got truncated to 0 bytes is the b1361b6 shape: esbuild
        # builds it fine and React.lazy explodes at runtime. Report it as such
        # rather than as a pile of missing needles.
        if not body.strip():
            misses.append((rel, "<file is EMPTY -- truncated, see b1361b6>"))
            continue
        for needle in needles:
            if needle not in body:
                misses.append((rel, needle))
    return misses


def main():
    misses = check()
    if not misses:
        total = sum(len(v) for v in INVARIANTS.values())
        print("ok   critical mounts intact (%d needle(s) across %d file(s))"
              % (total, len(INVARIANTS)))
        return 0
    print("FAIL critical mount(s) missing -- refusing the tree\n")
    for rel, needle in misses:
        print("  %s" % rel)
        print("      missing: %s" % needle)
    print("\nThese are the mounts whose absence is invisible at runtime.")
    print("Dropping one is how fa5e2b5 made every job on the platform unpayable")
    print("with no error anywhere. Restore the mount; do not relax the guard.")
    return 1


if __name__ == "__main__":
    sys.exit(main())
