#!/usr/bin/env bash
# apply-send-notification-dedupe.sh
#
# Commits the source-of-record for a fix that is ALREADY LIVE in Supabase:
# send-notification v11 no longer emails "job_in_field" bells.
#
# Why: a Database Webhook emails on every notifications INSERT. When a job is
# posted, notify_contractors_new_request() writes a bell to every matched pro
# AND dispatch-job emails those same pros - so each contractor got two emails
# about the same job. dispatch-job's version is the richer one (service, area,
# timing, details, bid button) and it is what tracks who has been notified, so
# it wins; the generic bell email is skipped. The in-app bell still appears,
# and every other notification type still emails exactly as before.
#
# The two files are already on disk in the repo. This script verifies them and
# pushes. Nothing here changes the running site - the function was already
# deployed; this just stops the repo from drifting.
#
# Run:  bash ~/freddy-fixit/apply-send-notification-dedupe.sh

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
check_file "supabase/functions/send-notification/index.ts" "d2b9586db07861fb96ea3bf9c9110758b9bdfda612cbba73a208b0f33312d6c7"
check_file "CLAUDE.md" "f6be460d728ecaec576c4303994c65e81e9fd8d393df465a4657294aa388fd99"

echo
echo "Committing..."
git add -A
if git diff --cached --quiet; then
  echo "Nothing changed - the repo already matches. Done."
  exit 0
fi

git commit -q -F - <<'EOF_MSG'
Send one email per contractor when a job is posted

A Database Webhook emails on every notifications insert. Posting a job wrote a
"new job in your field" bell to each matched pro and separately had dispatch-job
email those same pros, so every contractor got two emails saying the same thing.

send-notification v11 skips the email for job_in_field bells only. dispatch-job's
email is the one that survives: it carries the service, area, timing, details and
a bid button, and it is what records who has already been notified. The in-app
bell is unchanged, and every other notification type still emails as before.
EOF_MSG

git push origin HEAD
echo
echo "Done - pushed."
