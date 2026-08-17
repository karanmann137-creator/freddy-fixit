#!/usr/bin/env bash
# Installs 30 hand-picked skills into ~/.claude/skills/
# Sources: garrytan/gstack, w95/awesome-claude-corporate-skills, coreyhaines31/marketingskills
# Safe to re-run. Nothing is committed to the freddy-fixit repo.
set -euo pipefail

DEST="$HOME/.claude/skills"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

mkdir -p "$DEST"

echo "→ Cloning source repos (shallow)…"
git clone --depth 1 -q https://github.com/garrytan/gstack.git "$TMP/gstack"
git clone --depth 1 -q https://github.com/w95/awesome-claude-corporate-skills.git "$TMP/corp"
git clone --depth 1 -q https://github.com/coreyhaines31/marketingskills.git "$TMP/mktg"

install_skill() {   # $1 = source dir, $2 = installed name
  local src="$1" name="$2"
  if [ ! -f "$src/SKILL.md" ]; then
    echo "  ✗ skipped $name (no SKILL.md)"
    return
  fi
  rm -rf "${DEST:?}/$name"
  mkdir -p "$DEST/$name"
  # copy everything except VCS / build noise
  ( cd "$src" && tar -cf - --exclude='.git' --exclude='node_modules' --exclude='__pycache__' . ) \
    | ( cd "$DEST/$name" && tar -xf - )
  echo "  ✓ $name"
}

echo "→ Engineering (gstack)…"
for s in review qa investigate design-review office-hours; do
  install_skill "$TMP/gstack/$s" "gstack-$s"
done

echo "→ Operations / support / legal / data (corporate)…"
install_skill "$TMP/corp/07-operations/sop-builder"                sop-builder
install_skill "$TMP/corp/07-operations/incident-postmortem"        incident-postmortem
install_skill "$TMP/corp/07-operations/process-optimization"       process-optimization
install_skill "$TMP/corp/11-customer-success/ticket-triage"        ticket-triage
install_skill "$TMP/corp/11-customer-success/response-drafting"    response-drafting
install_skill "$TMP/corp/11-customer-success/churn-analysis"       churn-analysis
install_skill "$TMP/corp/06-legal-compliance/contract-review"      contract-review
install_skill "$TMP/corp/06-legal-compliance/legal-risk-assessment" legal-risk-assessment
install_skill "$TMP/corp/01-executive-leadership/risk-assessment"  risk-assessment
install_skill "$TMP/corp/03-human-resources/interview-kit-builder" interview-kit-builder
install_skill "$TMP/corp/10-data-analytics/sql-queries"            sql-queries

echo "→ Marketing / growth…"
for s in seo-audit programmatic-seo schema site-architecture ai-seo cro copywriting \
         analytics referrals marketing-plan pricing churn-prevention emails cold-email; do
  install_skill "$TMP/mktg/skills/$s" "$s"
done

echo
echo "✅ Installed $(find "$DEST" -maxdepth 2 -name SKILL.md | wc -l | tr -d ' ') skills into $DEST"
echo "   Restart the Claude desktop app to pick them up."
