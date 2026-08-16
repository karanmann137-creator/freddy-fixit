#!/usr/bin/env bash
#
# cleanup-freddy-folders.sh — tidy up the three Freddy Fix It folders.
#
#   PREVIEW (safe, changes nothing):   bash ~/freddy-fixit/cleanup-freddy-folders.sh
#   ACTUALLY DO IT:                    bash ~/freddy-fixit/cleanup-freddy-folders.sh --go
#
# Three phases:
#   1. ~/freddy-fixit        — the LIVE folder. Removes already-applied installers and
#                              other junk FROM THE REPO, and untracks tooling folders
#                              (they stay on your disk so nothing stops working).
#   2. ~/Desktop/freddy-fixit — a stale duplicate copy of the same repo. Deleted.
#   3. ~/Desktop/Website      — old scratch folder. Everything disposable is MOVED to
#                              an archive folder (not deleted), so it's reversible.
#
# Nothing here touches src/, supabase/, public/, package.json or any config the site
# builds from. Phase 1 refuses to run until the batch-2 installer has been applied.
#
set -euo pipefail

GO=0
[ "${1:-}" = "--go" ] && GO=1

A="$HOME/freddy-fixit"
B="$HOME/Desktop/freddy-fixit"
C="$HOME/Desktop/Website"
STAMP="$(date +%Y-%m-%d)"
DOCS="$HOME/Desktop/freddy-docs"
CARCH="$HOME/Desktop/Website-old-$STAMP"

say()  { printf '%s\n' "$*"; }
head1(){ printf '\n\033[1m%s\033[0m\n' "$*"; }
run()  { if [ "$GO" = "1" ]; then eval "$@"; else say "   would run: $*"; fi; }

if [ "$GO" != "1" ]; then
  head1 "PREVIEW MODE — nothing will be changed."
  say   "Re-run with --go once the list below looks right."
fi

# ─────────────────────────────────────────────────────────────────────────────
# PHASE 1 — the live repo (~/freddy-fixit)
# ─────────────────────────────────────────────────────────────────────────────
head1 "PHASE 1  ~/freddy-fixit  (the live folder)"
cd "$A"

# Guard: batch 2 must be applied first. If it isn't, this script would run against a
# working tree that still has un-shipped changes in it, and a later installer doing
# "git add -A" could sweep them into the wrong commit.
if ! git ls-files --error-unmatch src/pages/PickPro.tsx >/dev/null 2>&1; then
  say ""
  say "STOP — the batch-2 installer hasn't been applied yet."
  say "Run this first, wait for the green tick, then come back:"
  say ""
  say "    bash ~/freddy-fixit/apply-batch2-pick-pro.sh"
  say ""
  exit 1
fi

BR="$(git rev-parse --abbrev-ref HEAD)"
if [ "$BR" != "main" ]; then
  say "STOP — you're on branch '$BR', expected 'main'. Nothing changed."
  exit 1
fi

git fetch origin --quiet || true

# 1a. Already-applied installer scripts. Every one of these has been run; the changes
#     they carried are in the code and in git history. Keeping 12 MB of base64 blobs
#     at the top of a public repo just makes it hard to find anything.
INSTALLERS="$(git ls-files 'apply-*.sh' || true)"
N_INST=$(printf '%s\n' "$INSTALLERS" | grep -c . || true)
say ""
say "  • $N_INST already-applied installer scripts (~12 MB)"
if [ -n "$INSTALLERS" ]; then
  run "git rm -q --ignore-unmatch $(printf '%s\n' "$INSTALLERS" | tr '\n' ' ')"
fi

# 1b. One-off notes and artifacts. Nothing in src/ or supabase/ imports any of these —
#     checked. They're leftovers from finished work.
JUNK="SESSION-HANDOFF.md SESSION_HANDOFF.md loadtest-freddyfixit.js loadtest-summary.json marketing-brief.md milestone-escrow-spec.md"
say "  • old notes + load-test leftovers: $JUNK"
run "git rm -q --ignore-unmatch $JUNK"

# 1c. new-contractors.csv — 66 real names, emails and phone numbers sitting in a PUBLIC
#     repo. It gets copied to your Desktop first so you keep the list.
#     ⚠️ READ THE NOTE AT THE END OF THIS SCRIPT: removing it here does NOT erase it
#     from the repo's history. That needs a separate step.
if [ -f new-contractors.csv ]; then
  say "  • new-contractors.csv  →  copied to $DOCS/ then removed from the repo"
  run "mkdir -p '$DOCS'"
  run "cp new-contractors.csv '$DOCS/new-contractors.csv'"
  run "git rm -q --ignore-unmatch new-contractors.csv"
fi

# 1d. Your own documents. These are yours to keep — they just don't belong in a public
#     code repo. Copied to ~/Desktop/freddy-docs first, then removed from the repo.
say "  • your guides/plans (.docx/.pages)  →  copied to $DOCS/ then removed from the repo"
run "mkdir -p '$DOCS'"
while IFS= read -r f; do
  [ -n "$f" ] || continue
  run "cp '$f' '$DOCS/'"
  run "git rm -q --ignore-unmatch '$f'"
done < <(git ls-files | grep -v '/' | grep -Ei '\.(docx|pages)$' || true)

# 1e. Tooling folders: UNTRACK ONLY. The files stay exactly where they are on your disk,
#     so Claude Code's hooks and settings keep working — they just stop being published
#     to the public repo. (.claude/settings.json wires 10 hook events to
#     .claude/helpers/hook-handler.cjs; deleting that folder would break every session.)
say "  • .claude/ .claude-flow/ .swarm/ ruvector.db .mcp.json  →  untracked, KEPT on disk"
run "git rm -r -q --cached --ignore-unmatch .claude .claude-flow .swarm ruvector.db .mcp.json"

if ! grep -q '^# tooling — kept locally' .gitignore 2>/dev/null; then
  say "  • adding those to .gitignore so they don't come back"
  if [ "$GO" = "1" ]; then
    cat >> .gitignore <<'IGN'

# tooling — kept locally, never published to the public repo
.claude/
.claude-flow/
.swarm/
ruvector.db
.mcp.json

# applied installers + owner documents live on the Desktop, not in the repo
apply-*.sh
*.docx
*.pages
new-contractors.csv
IGN
  else
    say "   would append the tooling block to .gitignore"
  fi
fi

say ""
say "  Committing and pushing (only the removals above — your other work is untouched)"
run "git add .gitignore"
run "git commit -q -m 'Clean up repo: remove applied installers, notes and tooling artifacts' || true"
run "git push -q origin main"
say "  ✅ repo cleaned"

# ─────────────────────────────────────────────────────────────────────────────
# PHASE 2 — the stale duplicate (~/Desktop/freddy-fixit)
# ─────────────────────────────────────────────────────────────────────────────
head1 "PHASE 2  ~/Desktop/freddy-fixit  (stale duplicate copy — deleted)"
if [ -d "$B" ]; then
  say "  This is a second, older copy of the same repo. Its last commit is already"
  say "  contained in the live folder's history, so it holds no work you'd lose."
  say "  The one thing worth saving is its long-form CLAUDE.md changelog (~142 KB)."
  run "mkdir -p '$DOCS'"
  if [ -f "$B/CLAUDE.md" ]; then
    run "cp '$B/CLAUDE.md' '$DOCS/CLAUDE-long-history-2026-07.md'"
    say "  • CLAUDE.md  →  $DOCS/CLAUDE-long-history-2026-07.md"
  fi
  say "  • deleting the folder (~254 MB, most of it node_modules)"
  run "rm -rf '$B'"
  say "  ✅ removed"
else
  say "  (already gone)"
fi

# ─────────────────────────────────────────────────────────────────────────────
# PHASE 3 — the old scratch folder (~/Desktop/Website)
# ─────────────────────────────────────────────────────────────────────────────
head1 "PHASE 3  ~/Desktop/Website  (old scratch folder — archived, not deleted)"
if [ -d "$C" ]; then
  say "  Everything disposable MOVES to:  $CARCH"
  say "  Nothing is deleted — if anything turns out to matter, drag it back."
  say ""
  say "  KEPT in place (your live deliverables):"
  say "    Meta-Setup-Guide.docx · Facebook-Groups-Lead-Kit.docx · Reddit-Reply-Cheatsheet.docx"
  say "    Contractor-Prospects-2026-07.xlsx · reddit-reply-cheatsheet.md"
  say "    contractor_outreach_email.txt · marketing/"
  say ""
  say "  MOVED to the archive: 8 unused hero images (19 MB), ~50 old apply-/push- scripts,"
  say "  May-era .tsx snapshots, old CLAUDE.*.md forks, files.zip, ruvector.db, src/, public/"
  run "mkdir -p '$CARCH'"
  for item in "$C"/* "$C"/.[!.]*; do
    [ -e "$item" ] || continue
    name="$(basename "$item")"
    case "$name" in
      Meta-Setup-Guide.docx|Facebook-Groups-Lead-Kit.docx|Reddit-Reply-Cheatsheet.docx|\
      Contractor-Prospects-2026-07.xlsx|reddit-reply-cheatsheet.md|\
      contractor_outreach_email.txt|marketing)
        continue ;;
    esac
    run "mv '$item' '$CARCH'/"
  done
  say "  ✅ archived"
else
  say "  (folder not found)"
fi

# ─────────────────────────────────────────────────────────────────────────────
head1 "DONE"
if [ "$GO" != "1" ]; then
  say "That was a preview. Run it for real with:"
  say ""
  say "    bash ~/freddy-fixit/cleanup-freddy-folders.sh --go"
  say ""
else
  say "Your documents are all together in:  $DOCS"
  say "The reversible archive is in:        $CARCH"
  say ""
  say "⚠️  ONE THING THIS SCRIPT CANNOT DO"
  say "    new-contractors.csv (66 real names/emails/phones) was committed to the public"
  say "    repo back in commit 8734f08. Removing the file now stops it appearing in the"
  say "    current code, but anyone can still read it from the repo's history."
  say "    Properly erasing it means rewriting history — tell me when you want that done."
  say ""
  say "    Also left alone on purpose: .env — it only holds the two public Supabase keys"
  say "    that already ship inside the website, and a local build needs it."
fi
