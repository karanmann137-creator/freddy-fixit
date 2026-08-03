#!/usr/bin/env bash
# apply-job-flow-fixes.sh
#
# Fixes everything the job-flow audit turned up, plus one new safeguard.
#
# Money safety (the two serious ones):
#   * A contractor could "withdraw" a job the client had already PAID for.
#     That deleted the job row and every record attached to it, including the
#     record of the Stripe payment - the client's money would have been left
#     sitting with nothing pointing at it. Withdrawing a paid job is now
#     refused, with a message telling them to contact us for a refund instead.
#   * A client could delete a request whose payment was already being held.
#     That quietly cancelled the job with no refund. Also refused now, with a
#     message saying their money is safe and how to reach us.
#
# The service agreement now has to describe a real job:
#   * It cannot be sent or signed until the job has a price, a booked time and
#     the client's approval. Before this, a contractor could sign an agreement
#     reading "Job price $0.00" on "a date to be arranged" - and once signed it
#     could never be regenerated.
#   * If the price later changes while the job is still unpaid, the signed
#     agreement is voided automatically and both sides are told to sign a fresh
#     one, so the document always matches what is actually being charged.
#
# Buttons that did nothing now work:
#   * Six "Needs your attention" prompts on the client dashboard were dead -
#     tapping "Review & sign", "Approve the new price", "Confirm the visit" and
#     three others just scrolled to the top of the page. Each now jumps to the
#     exact card and rings it with an orange pulse. The agreement prompt is also
#     pushed to the top of the list, because nothing else can happen until it
#     is signed.
#   * Unread-message and alert counts were invisible on phones (the sidebar
#     collapses to icons and the badge sat in the hidden label). They now show
#     as a small orange dot on the icon itself.
#   * "Mark complete" and the milestone stage buttons looked greyed out but
#     were still clickable, producing an error instead of an explanation. They
#     are now genuinely disabled until the required photo is there.
#   * A stage could not be disputed at all - the button referred to something
#     that did not exist, so nothing happened. It now opens a proper form.
#   * Photos taken on an iPhone were sometimes rejected as "not an image", and
#     a photo that failed to load showed nothing at all with no way to retry.
#
# New: a booked visit that never gets signed and paid frees itself up.
#   Twelve hours before the visit (and never sooner than two hours after the
#   client approved the time), if the agreement still is not signed and paid,
#   the TIME is released and both sides are told why. Nothing is cancelled -
#   the job, the price, the contractor and the agreement all stay exactly as
#   they were, and either side can book a new time straight away. This stops a
#   contractor's calendar being held hostage by a visit that was never going to
#   happen, and it runs automatically every fifteen minutes.
#
# The database side is already live. This script checks the matching website
# files, builds to be sure nothing is broken, and pushes.
#
# Run:  bash ~/freddy-fixit/apply-job-flow-fixes.sh

set -euo pipefail

# Find the repo: prefer this script's own directory, then the usual spots.
SELF_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TARGET=""
for cand in "$SELF_DIR" "$HOME/freddy-fixit" "$HOME/Desktop/freddy-fixit"; do
  if [ -d "$cand/.git" ] && [ -f "$cand/package.json" ]; then TARGET="$cand"; break; fi
done
if [ -z "$TARGET" ]; then
  echo "Could not find the freddy-fixit repo. Put this script inside it and run it again."
  exit 1
fi
cd "$TARGET"
echo "Repo: $TARGET"

check_file() {
  local path="$1" want="$2" got
  if [ ! -f "$path" ]; then
    echo "Missing $path - nothing was pushed."
    exit 1
  fi
  got="$(shasum -a 256 "$path" | awk '{print $1}')"
  if [ "$got" != "$want" ]; then
    echo "Unexpected contents in $path - nothing was pushed."
    exit 1
  fi
  echo "  ok  $path"
}

echo "Checking files..."
check_file "src/pages/ClientDashboard.tsx"          "de2d8b6105c7b83d0903e7716181525b0aaab4b1a5ecfc275408fe372f9cdcce"
check_file "src/pages/ContractorDashboard.tsx"      "41fcfb27cda7c070c62bdf7b17fa960e62b5764d7b6b6617eae3aa1b76aabd7e"
check_file "src/pages/Login.tsx"                    "3eb08ae38b303eb87ace4af9763ce8861c368b9fdd7c88eea8455fb5017b7390"
check_file "src/pages/AuthCallback.tsx"             "794ef993d352d93bdd9d6548ba6d49de4482d63e277098844105b260733d3916"
check_file "src/pages/UpdatePassword.tsx"           "f490b9c155729ae9331035864154f54becbdcabc7eb3d78160c8143ea6226f73"
check_file "src/components/ContractPanel.tsx"       "4b2bd879de0dc06ab8c670ecea0d3afef9917dbec560c388419bf80527791c07"
check_file "src/components/MilestonePanel.tsx"      "8a7aa685ae7481017d81727f19a53d0e62cbe2b95a089c0ce434547a97afcde2"
check_file "src/components/JobPhotos.tsx"           "c003bf3a7b4712dd987682d4f2821235ef323aba8426d95926934468d093582a"
check_file "src/components/JobTimer.tsx"            "932a6f2f87bc73297d9fab6d1b6145021bd975b01a54e39b1841b9fb91bbd4a4"
check_file "src/components/DashboardSidebar.tsx"    "756f761d7bcc9147afac3d5957715edff5f73f004dc52f3e63bb397544c5e71f"
check_file "src/lib/notificationRoutes.ts"          "a0650374bedff15e726042270f617edc3d98752043ffe4cbcc325ac40062efec"
check_file "supabase/functions/contract-sign/index.ts" "180feb77e780a09dce60898b054afa516f184cf9713e71c8274bb3a6119aede5"
check_file "supabase/migrations/20260803043310_guard_withdraw_and_delete_against_paid_jobs.sql" "f1509f0e2d8404e2a4aab9fdfdc6af117463ab8033cd5e5c9b6c50881b72ed03"
check_file "supabase/migrations/20260803043355_contract_ready_gate_and_void_on_price_change.sql" "23d408c7a68d679e9245b812320872819a33bce38ddbe93d65a9308027184984"
check_file "supabase/migrations/20260803043502_release_unconfirmed_visit_slots.sql" "8ed79ec8ce915b2f3283c49d1afe4208b3d59a6193a9c9d119aa4af9eb6ec6e7"
check_file "CLAUDE.md"                              "bea4ba5834caedcf0456dd8d3167f14fe6b8d37a41137e4514cd1bb82c4d8d95"

echo
echo "Building (this catches anything broken before it reaches the site)..."
npx vite build >/tmp/ff-job-flow-build.log 2>&1 || {
  echo "Build failed - nothing was pushed. Details: /tmp/ff-job-flow-build.log"
  tail -20 /tmp/ff-job-flow-build.log
  exit 1
}
echo "  build ok"

echo
echo "Committing..."
git add -A
if git diff --cached --quiet; then
  echo "Nothing changed - the repo already matches. Done."
  exit 0
fi

git commit -q -F - <<'EOF_MSG'
Job-flow audit: money guards, a real agreement gate, working prompts, slot release

Money safety. withdraw_job() hard-deletes the job row and every child record
cascades with it, so withdrawing a job the client had already paid for destroyed
the only record of the Stripe payment intent - the money would have been left in
the platform balance with nothing pointing at it. remove_client_request() did the
same kind of damage from the other side, cancelling a job with a held payment and
no refund. Both now refuse, with plain-English messages pointing at support.

The service agreement now has to describe a real transaction. contract_ready()
requires a price, a booked time and the client's approval before an agreement can
be sent or signed - previously a contractor could sign one reading "Job price
$0.00" on "a date to be arranged", and a signed agreement can never be
regenerated. A new trigger voids a signed agreement when the price later changes
on an unpaid job, and asks both sides to sign a fresh one, so the document never
stops matching what is being charged.

Six "Needs your attention" prompts on the client dashboard had no click handler
at all - tapping them scrolled to the top of the page, away from the very card
being asked for. Each now targets its card by id and rings it with a pulse, and
the agreement prompt is pushed first because nothing else can proceed until it is
signed. Sidebar badges were rendered inside the label, so unread counts vanished
whenever the sidebar collapsed to icons on a phone; they now draw on the icon.
"Mark complete" and the milestone stage buttons were styled as disabled but still
fired, returning a database error instead of an explanation - they are genuinely
disabled until the required photo exists. The milestone dispute button referenced
a function that did not exist, so it silently did nothing.

Photo handling: iPhone HEIC files often arrive with an empty MIME type and were
rejected as "not an image"; a failed signed URL rendered a blank box with no
retry. Both fixed. Timer and photo panels now say when a read failed instead of
showing a confident zero.

New: release_unconfirmed_visits() runs every fifteen minutes and gives back the
TIME on a booked visit that was never signed and paid - twelve hours before the
visit, and never sooner than two hours after the client approved it. The job, the
price, the contractor assignment and the agreement all survive; only the slot is
freed, the job drops back to "needs a time", and both sides are told why so
either can rebook.
EOF_MSG

git push origin HEAD
echo
echo "Done - pushed. Give Vercel a minute, then hard-refresh (Cmd+Shift+R)."
