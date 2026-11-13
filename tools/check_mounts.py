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
    # 2026-11-08: <DashShell> is the ONLY thing that puts `ffdash` on the page,
    # and three rule blocks in ui/uiStyles.ts are scoped to it -- the button
    # press, the disabled state, and `.ff-pulse`. Swap it back for a plain
    # <div> and the page renders pixel-identical at rest while every attention
    # button silently stops ringing the control it names: focusJobAnchor()
    # still scrolls, ringAnchor() still sets the class, the class simply has no
    # animation attached. Nothing throws and nothing looks wrong on a Mac.
    #
    # This already happened once, in the other direction -- Admin was applying
    # `.ff-pulse` to elements that were outside any `.ffdash` wrapper -- which
    # is what Dash.tsx's docblock is warning about. Needled on all three pages
    # because the wrapper is per page; losing one loses one dashboard's worth
    # of feedback, which is the sort of thing only the owner would find.
    "src/pages/ClientDashboard.tsx": [
        "<ContractPanel", "<DashShell",
        # 2026-11-07: the ONLY surface on the platform that can approve or
        # decline a pending price change. adjust-payment and
        # decline_price_change both need a real auth.uid(), so neither is
        # reachable from a SQL session, an email or an artifact. Drop these and
        # a held job with a pending change has no exit in ANY direction: the
        # client cannot approve, cannot decline, confirm_job_completion blocks,
        # auto_confirm_stale_jobs filters the job out, and run_reminders step 6
        # keeps mailing the client about a decision they have no button for.
        # Nothing throws, nothing renders red, and the pro never gets paid.
        "approvePriceChange",
        "declinePriceChange",
    ],
    "src/pages/ContractorDashboard.tsx": [
        "<ContractPanel", "STAGE_MATCH", "JobsCalendar", "<DashShell",
        # 2026-11-07: the pro's only undo for a price change they proposed
        # themselves. Without it the proposal sits 'pending' forever, the client
        # keeps getting nudged about a figure the pro no longer wants, and the
        # pro's only escape is to ask the client to "decline" them -- which
        # records the wrong thing. Invisible: the RPC, the grant and the banner
        # all keep existing.
        "withdrawPriceChange",
    ],
    "src/pages/AdminDashboard.tsx": [
        "<ContractPanel", "<DashShell",
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
        # 2026-11-12: the tab bodies moved to src/pages/admin/. The handler is
        # still defined here and the button lives in AdminAgentsTab, so the
        # guard is now three needles across two files: the handler, the tab
        # mount that passes it down, and (below) the button that calls it.
        "const draftLead",
        "<AdminAgentsTab",
        "draftLead={draftLead}",
    ],
    "src/pages/admin/AdminAgentsTab.tsx": [
        "draftLead(a)",
    ],
    # 2026-11-09: the same lockout one surface further in. The admin-message
    # edge fn asks admin_action_allowed(), so once the 12-hour window lapses it
    # returns 403 with the literal "Verify your sign-in code first, then try
    # again." -- which this modal correctly DISPLAYED and could not act on,
    # because it had no verify gate at all. The owner read an instruction with
    # no surface behind it and retried forever. Invisible in the ordinary way:
    # the modal renders, the button works, the error is even accurate.
    #
    # Both needles, because they fail in opposite directions. Drop the mount and
    # the gate still opens -- onto nothing, so Send silently does nothing at
    # all, which is worse than the dead end. Drop `mfaOwed` and the gate never
    # opens, and we are back to the dead end exactly.
    "src/components/AdminMessageModal.tsx": ["<VerifyCodeModal", "mfaOwed"],
    # Same lockout reached from the other side: the OAuth route had no MFA
    # handling at all, so Google sign-in walked straight past the second factor
    # AND never refreshed the 12-hour window that admin_guard() reads.
    "src/pages/AuthCallback.tsx": ["<VerifyCodeModal", "mfaOwed"],
    # One predicate behind every "you need to verify" surface. If this export
    # disappears the two mounts above go with it.
    "src/lib/mfa.ts": ["export async function mfaOwed"],
    "src/App.tsx": ["<ChatWidget", "<GoogleReviewModal", "<FinishSignupBanner", "<ScrollToTop"],
    "src/main.tsx": ["initAnalytics"],
    # 2026-11-08. NOT a mount -- a POSITIONING declaration, and the first entry
    # in this table that is one. It earns its place by the membership test
    # rather than by shape: its absence is invisible at build time and loud at
    # runtime, which is exactly what nothing else catches.
    #
    # c12d446 split both of these style objects to add a comment above the
    # bottom/inset calc, and dropped `position: "fixed"` from each in the
    # process. Everything downstream still LOOKED right -- bottom, left and
    # zIndex were all still there, reading as if they were doing something --
    # but on a static element all three are inert. So the bubble rendered
    # inline at the top of the document over the nav logo, and opening the
    # panel pushed the entire homepage down. Nothing threw, typecheck passed,
    # the build was clean, and check (8) in check_ux.py was satisfied because
    # the env() inset it looks for was present and correct on a property that
    # no longer applied.
    #
    # Two needles because the panel and the bubble are separate style objects
    # and were broken independently by the same edit. Count them: 2.
    "src/components/ChatWidget.tsx": ['position: "fixed"'],
    # 2026-11-09. The dead-end screens, and they belong here for the reason the
    # whole table exists: a render branch that returns nothing renders NOTHING.
    # React throws no error for a missing child, typecheck is happy, and the
    # symptom is a blank page on the one screen whose entire job is to stop a
    # blank page. That is the failure being fixed, reintroduced by the fix.
    #
    # ClientOnboarding's is the "we couldn't tell whether you're signed in"
    # branch of the three-outcome auth read. NewRequest's is the failed-profile
    # -read retry. Both are terminal: nothing downstream of either renders, so
    # there is no second surface to notice the absence from.
    #
    # 2026-11-09: BOTH intake forms also carry the multi-trade split prompt, and
    # on ClientOnboarding the absence is quieter than on NewRequest. It is the
    # first-job signup form, so its request is inserted by `handle_new_user()`.
    # Drop `detectJobSplit(` here and `split_jobs` never reaches the signup
    # metadata, the trigger takes its single-row default -- which is exactly the
    # fallback that makes a malformed split safe -- and the only trace anywhere
    # is a contractor wondering why he was emailed a masonry job. A fallback
    # designed to swallow a bad split swallows a missing one identically, which
    # is precisely the membership test for this table.
    "src/pages/ClientOnboarding.tsx": ["<DeadEnd", "<SplitJobDialog", "detectJobSplit("],
    # The split prompt is here for a reason worth stating because it is the
    # opposite of the ContractPanel case.
    #
    # submit() sets `splitSuggestion` and returns, having deliberately NOT used
    # the askConfirm promise pattern -- so dropping the mount does not hang the
    # button, it just means a multi-trade description silently posts as one
    # request again. That is a quiet regression to the exact bug this feature
    # exists to fix, on the one form at the top of the funnel, and the only
    # person who could notice is a contractor wondering why he was emailed a
    # masonry job. Nothing throws; typecheck is clean either way.
    #
    # `detectJobSplit(` is needled separately because the mount and the call
    # fail in opposite directions: the dialog with no caller is a component that
    # never opens, the caller with no dialog is a submit that quietly no-ops the
    # split. Each looks fine on its own.
    "src/components/NewRequest.tsx": ["<DeadEnd", "<SplitJobDialog", "detectJobSplit("],
    # The refusal surface for a role write that can never succeed. Drop this and
    # AuthCallback's `showBlocked(w.reason, ...)` has nowhere to put the reason,
    # which puts us back in the endless redirect the sentence exists to end --
    # and the account is in no worse state, so there is nothing in the data to
    # find afterwards either.
    "src/lib/roleWrite.ts": ["export async function setMyRole", "role_change_block"],
}

# Needles that must appear a MINIMUM number of times rather than at least once.
# A plain `in` test passes when one of two identical declarations survives, and
# the ChatWidget bug was exactly two identical declarations lost together.
MIN_COUNTS = {
    ("src/components/ChatWidget.tsx", 'position: "fixed"'): 2,
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
            want = MIN_COUNTS.get((rel, needle), 1)
            got = body.count(needle)
            if got < want:
                misses.append((rel, needle if want == 1 else
                               "%s  (found %d, need %d)" % (needle, got, want)))
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
