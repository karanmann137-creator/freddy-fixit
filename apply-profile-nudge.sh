#!/usr/bin/env bash
# apply-profile-nudge.sh
#
# Makes "finish setting up your profile" impossible to miss for contractors.
#
#   * The banner now lists each missing piece as a tappable chip. Tapping one
#     opens the Profile tab, scrolls that exact section into view, and rings it
#     with an orange pulse for about 4.5 seconds.
#   * A contractor who believes they're already done can press
#     "Ignore - my profile is complete". If something later goes missing
#     (insurance lapses, a document is removed) the reminder comes back by itself.
#   * Payout setup can NOT be ignored - it is the only way we can pay them.
#     Its "I don't need this step" link is gone, and anyone who skipped it in
#     the past will see it again.
#
# Front-end only. No database or edge-function changes, and nothing that is
# already working is touched - the same profile checks drive everything, they
# just now report WHERE each gap lives as well as what it is.
#
# The three files are already on disk in the repo. This script verifies them
# and pushes.
#
# Run:  bash ~/freddy-fixit/apply-profile-nudge.sh

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
check_file "src/pages/ContractorDashboard.tsx"              "cc9f5c0f6d53aae6b4f17062bc40703d5e02066b834ba6acd30db5f08c880425"
check_file "src/components/ContractorProfileCompletion.tsx" "dd4e080bd419a1a79551a3e5f9d9c39637a6a3671b05a965371e199d00b9fced"
check_file "CLAUDE.md"                                      "02f9da91df7db0d181497cf69b34b57c6b1b6e7985c0cbfb6ce32c3022550c64"

echo
echo "Building (this catches anything broken before it reaches the site)..."
npx vite build >/tmp/ff-profile-nudge-build.log 2>&1 || {
  echo "Build failed - nothing was pushed. Details: /tmp/ff-profile-nudge-build.log"
  tail -20 /tmp/ff-profile-nudge-build.log
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
Point contractors at the exact part of their profile that is unfinished

The "finish setting up your profile" banner used to name what was missing and
then drop the contractor at the top of the Profile tab to hunt for it. Each
missing piece is now a tappable chip that opens the Profile tab, scrolls that
section into view and rings it with an orange pulse for about 4.5 seconds.

A contractor who believes they are already finished can dismiss the banner.
The dismissal is tied to the exact set of gaps, so if something later goes
missing the reminder returns on its own instead of staying silent.

Payout setup is the one thing that cannot be dismissed - without it we have no
way to pay them - so its skip link is gone and past skips no longer hide it.

Front-end only; the same profile checks drive all of this, they just now report
where each gap lives as well as what it is.
EOF_MSG

git push origin HEAD
echo
echo "Done - pushed. Give Vercel a minute, then hard-refresh (Cmd+Shift+R)."
