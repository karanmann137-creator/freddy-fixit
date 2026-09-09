#!/usr/bin/env python3
"""
Build a Freddy Fix It installer script.

The owner is non-technical and deploys by pasting one command, so the installer
is the single point where a mistake reaches production silently. It has happened
twice:

  56f96d3 — a superset installer built from a stale clone carried full copies of
            files that had moved on, and wiped the contractor pipeline strip and
            calendar.
  fa5e2b5 — the same shape, but it dropped the <ContractPanel/> mounts. Because
            the payment gate fails CLOSED, every job on the platform became
            unpayable: the client had no surface on which to sign. Nothing
            errored. job_contracts sat at zero rows and nobody knew.

Both had one cause: a full file copy written from a working tree that was behind
origin/main. Every guard below exists for that.

⚠️ This file is TOOLING, not application source. It is never imported by the app
and never reaches the vite build. It lives in the repo because the ship skill
tells each session to run it, and for a long time it did not exist here — it
lived only in a sandbox clone that was destroyed between sessions, so every
session rewrote it from scratch and the guards drifted.

Usage:
    python3 scripts/build_installer.py --repo . --name approx-location \\
        --message "Approximate location until a pro is chosen" [files...]

With no file arguments it ships whatever git reports as changed AND tracked,
plus any explicitly-named untracked file. Untracked files are never picked up
automatically — a working tree usually holds scratch files, probe output and
owner deliverables that must not reach a public repo.
"""

import argparse
import base64
import hashlib
import json
import os
import re
import subprocess
import sys

# --------------------------------------------------------------------------
# Guard 4: invariants.
#
# The test for adding one is: *if this line vanished, would anything error?*
# If the answer is no, it does not belong here — this list is for things whose
# absence fails SILENTLY. Each entry is (path, pattern, minimum count).
# --------------------------------------------------------------------------
INVARIANTS = [
    # The payment gate fails closed, so losing this mount makes every job
    # unpayable with no error anywhere. This is fa5e2b5.
    ("src/pages/ClientDashboard.tsx", r"<ContractPanel", 1),
    # The pipeline strip's counters and its filter share these, so losing them
    # silently desyncs what a count says from what a click shows. This is 56f96d3.
    ("src/pages/ContractorDashboard.tsx", r"STAGE_MATCH", 2),
    ("src/pages/ContractorDashboard.tsx", r"JobsCalendar", 1),
    # App-level mounts that nothing else re-creates.
    ("src/App.tsx", r"<FinishSignupBanner", 1),
    ("src/App.tsx", r"<ScrollToTop", 1),
    ("src/App.tsx", r"<ChatWidget", 1),
    ("src/App.tsx", r"<GoogleReviewModal", 1),
    ("src/main.tsx", r"initAnalytics", 1),
    # Added 2026-09-09 with the approximate-location change. addressMissing is
    # the ONE predicate shared by the renderer, the attention row, focusAddress
    # and the payForJob guard — the photosMissing idiom. If a consumer drops it
    # the others keep working, so the disagreement is invisible: a client is
    # sent to Stripe for a job whose address nobody ever confirmed.
    ("src/pages/ClientDashboard.tsx", r"<ConfirmAddress", 2),
    ("src/pages/ClientDashboard.tsx", r"addressMissing", 4),
    # Both halves of the stored approximate location are load-bearing —
    # mask_location() and list_open_jobs() read the raw string, and a postal
    # code with no area token still passes a blank check while ranking the job
    # out-of-zone for every contractor, silently.
    ("src/components/NewRequest.tsx", r"formatApproxLocation", 1),
    ("src/pages/ClientOnboarding.tsx", r"formatApproxLocation", 1),
]

# --------------------------------------------------------------------------
# Guard 3: secrets. The repo is PUBLIC.
# --------------------------------------------------------------------------
SECRET_PATTERNS = [
    ("Stripe secret key", re.compile(r"\b[sr]k_(live|test)_[A-Za-z0-9]{16,}")),
    ("Resend API key", re.compile(r"\bre_[A-Za-z0-9_]{16,}")),
    ("Anthropic API key", re.compile(r"\bsk-ant-[A-Za-z0-9\-_]{16,}")),
    ("OpenAI API key", re.compile(r"\bsk-[A-Za-z0-9]{32,}")),
    ("Twilio auth token", re.compile(r"\bAC[a-f0-9]{32}\b")),
    ("AWS access key", re.compile(r"\bAKIA[0-9A-Z]{16}\b")),
    ("Private key block", re.compile(r"-----BEGIN [A-Z ]*PRIVATE KEY-----")),
]

JWT_RE = re.compile(r"\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}")

# A sanity floor per extension. A file that decodes to almost nothing is the
# ClientDashboard-at-0-bytes incident (b1361b6): esbuild happily builds an empty
# module and it only explodes at runtime inside React.lazy.
MIN_BYTES = {".tsx": 200, ".ts": 100, ".sql": 50, ".md": 100, ".json": 20, ".py": 100}


def sh(args, cwd):
    return subprocess.run(args, cwd=cwd, capture_output=True, text=True)


def fail(msg):
    print("\n❌ ABORT: " + msg, file=sys.stderr)
    print("   Do not work around this. Each guard maps to a real outage.", file=sys.stderr)
    sys.exit(1)


def check_freshness(repo, allow_behind):
    """Guard 1 — the cause of BOTH incidents."""
    sh(["git", "fetch", "origin", "main", "-q"], repo)
    r = sh(["git", "rev-list", "--count", "HEAD..origin/main"], repo)
    if r.returncode != 0:
        fail("could not compare HEAD to origin/main: " + r.stderr.strip())
    behind = int(r.stdout.strip() or "0")
    if behind and not allow_behind:
        fail(
            f"HEAD is {behind} commit(s) behind origin/main.\n"
            "   Building a full file copy from a stale tree is exactly what caused\n"
            "   56f96d3 and fa5e2b5. Run: git pull --rebase, re-apply, rebuild.\n"
            "   --allow-behind exists only for a deliberate revert."
        )
    print(f"  freshness    HEAD is level with origin/main ({behind} behind)")


def select_files(repo, explicit):
    """Guard 2 — file selection. Never auto-pick up untracked files."""
    if explicit:
        chosen = list(explicit)
        for f in chosen:
            if not os.path.isfile(os.path.join(repo, f)):
                fail(f"named file does not exist: {f}")
    else:
        r = sh(["git", "diff", "--name-only", "HEAD"], repo)
        chosen = [x for x in r.stdout.splitlines() if x.strip()]
        if not chosen:
            fail("nothing to ship — no tracked file differs from HEAD")
        print("  note         untracked files are NEVER auto-selected; name them explicitly")

    # Drop no-ops: a file byte-identical to HEAD adds risk and no change.
    kept = []
    for f in chosen:
        disk = open(os.path.join(repo, f), "rb").read()
        r = subprocess.run(["git", "show", f"HEAD:{f}"], cwd=repo, capture_output=True)
        if r.returncode == 0 and r.stdout == disk:
            print(f"  skip         {f} is identical to HEAD")
            continue
        kept.append(f)
    if not kept:
        fail("every selected file is identical to HEAD — nothing to ship")
    print(f"  selection    {len(kept)} file(s)")
    return kept


def scan_secrets(repo, files):
    """Guard 3 — the repo is PUBLIC."""
    for f in files:
        text = open(os.path.join(repo, f), "rb").read().decode("utf-8", "replace")
        for label, pat in SECRET_PATTERNS:
            m = pat.search(text)
            if m:
                fail(f"{label} found in {f} near: {m.group(0)[:12]}…\n"
                     "   Move it to an env var or a Supabase secret. Never ship it.")
        # A JWT is only fatal when it is the SERVICE-ROLE key. The anon key is a
        # valid project-signed JWT and ships publicly in the JS bundle by design,
        # so aborting on every JWT would make this guard useless and it would
        # get switched off.
        for m in JWT_RE.finditer(text):
            payload = m.group(0).split(".")[1]
            payload += "=" * (-len(payload) % 4)
            try:
                claims = json.loads(base64.urlsafe_b64decode(payload))
            except Exception:
                continue
            if str(claims.get("role", "")).lower() == "service_role":
                fail(f"SERVICE-ROLE JWT found in {f}. This grants full DB access "
                     "and the repo is public.")
    print("  secrets      clean (anon JWTs allowed, service_role aborts)")


def check_invariants(repo, files):
    """Guard 4 — mounts whose absence fails silently."""
    shipped = set(files)
    for path, pattern, minimum in INVARIANTS:
        full = os.path.join(repo, path)
        if not os.path.isfile(full):
            if path in shipped:
                fail(f"invariant file missing from the tree: {path}")
            continue
        n = len(re.findall(pattern, open(full, encoding="utf-8", errors="replace").read()))
        if n < minimum:
            where = "in the file you are shipping" if path in shipped else "in the working tree"
            fail(f"invariant broken {where}: {path} has {n} match(es) of "
                 f"/{pattern}/, expected at least {minimum}.\n"
                 "   You removed a mount something depends on. Restore it. If the\n"
                 "   removal is genuinely intended, edit INVARIANTS in this script\n"
                 "   IN THE SAME CHANGE so the next person inherits the new contract.")
    print(f"  invariants   {len(INVARIANTS)} checked, all present")


def warn_db_edge(files):
    """Guard 5 — installers never apply DB or edge changes."""
    db = [f for f in files if f.endswith(".sql") or f.startswith("supabase/functions/")]
    if db:
        print("\n  ⚠️  DB / EDGE FILES ARE VERSION CONTROL ONLY — the installer does NOT apply them:")
        for f in db:
            print(f"       {f}")
        print("      Apply migrations with Supabase MCP apply_migration, edge functions with")
        print("      deploy_edge_function, as a separate explicit step. Do not tell the owner")
        print("      that running the installer applied them. It did not.\n")
    return db


def build(repo, name, message, files):
    """Guard 6 — write the installer."""
    parts = []
    parts.append("#!/usr/bin/env bash")
    parts.append("# Freddy Fix It installer — generated, one-shot. Safe to delete after running.")
    parts.append(f"# {message}")
    parts.append("set -euo pipefail")
    parts.append('cd ~/freddy-fixit')
    parts.append('echo "→ Writing files…"')
    parts.append("")

    for f in files:
        raw = open(os.path.join(repo, f), "rb").read()
        b64 = base64.b64encode(raw).decode("ascii")
        wrapped = "\n".join(b64[i:i + 76] for i in range(0, len(b64), 76))
        ext = os.path.splitext(f)[1]
        floor = MIN_BYTES.get(ext, 20)
        tag = "B64_" + hashlib.sha1(f.encode()).hexdigest()[:8].upper()
        parts.append(f'# ---- {f} ({len(raw)} bytes) ----')
        parts.append(f'mkdir -p "$(dirname "{f}")"')
        parts.append(f"cat > /tmp/ff_payload.b64 <<'{tag}'")
        parts.append(wrapped)
        parts.append(tag)
        # ⚠️ Decode with a STDIN REDIRECT and into /tmp, never onto the destination.
        # macOS base64 rejects a positional input file; and the shell truncates a
        # redirect target BEFORE the command runs, so the positional form did not
        # merely fail — it left ClientDashboard.tsx at 0 bytes, which was committed
        # and pushed (b1361b6) and crashed every client on /client-dashboard.
        parts.append("base64 -d < /tmp/ff_payload.b64 > /tmp/ff_payload.out")
        parts.append('SZ=$(wc -c < /tmp/ff_payload.out | tr -d " ")')
        parts.append(f'if [ "$SZ" != "{len(raw)}" ]; then')
        parts.append(f'  echo "❌ {f}: decoded $SZ bytes, expected {len(raw)} — refusing to write." >&2; exit 1')
        parts.append("fi")
        parts.append(f'if [ "$SZ" -lt {floor} ]; then')
        parts.append(f'  echo "❌ {f}: decoded $SZ bytes, below the {floor}-byte sanity floor." >&2; exit 1')
        parts.append("fi")
        parts.append(f'cp /tmp/ff_payload.out "{f}"')
        parts.append(f'echo "   ✓ {f} ({len(raw)} bytes)"')
        parts.append("")

    parts.append('rm -f /tmp/ff_payload.b64 /tmp/ff_payload.out')
    parts.append("")
    # The owner-machine gate. vite build cannot run in the Linux sandbox
    # (rolldown ships a darwin-only native binding), and esbuild does NO
    # typecheck — an empty module builds fine and only explodes at runtime
    # inside React.lazy. Typecheck is the only thing that caught b1361b6.
    parts.append('echo "→ Typechecking…"')
    parts.append("npm run typecheck")
    parts.append('echo "→ Building…"')
    parts.append("npx vite build")
    parts.append("")
    parts.append('echo "→ Committing…"')
    # Explicit paths, NEVER `git add -A`. The owner's working tree holds probe
    # output, owner deliverables and scratch files that must not reach a public repo.
    add_args = " ".join(f'"{f}"' for f in files)
    parts.append(f"git add {add_args}")
    parts.append('if git diff --cached --quiet; then')
    parts.append('  echo "Nothing changed — already up to date."; exit 0')
    parts.append("fi")
    parts.append(f'git commit -m "{message}"')
    parts.append("git push")
    parts.append('echo ""')
    parts.append('echo "✅ Done — pushed. Wait ~60s for Vercel, then hard-refresh with Cmd+Shift+R."')
    return "\n".join(parts) + "\n"


def verify(repo, out_path, files):
    """Guard 7 — bash -n, then decode every payload and compare BYTES to source.

    ⚠️ This verifies the INSTALLER, not the payload. A regenerated installer once
    round-tripped perfectly against an already-corrupted working tree and
    reported "13 files decoded, 0 mismatched". That is why select_files also
    compares against HEAD and why the caller runs npm run typecheck separately.
    """
    r = subprocess.run(["bash", "-n", out_path], capture_output=True, text=True)
    if r.returncode != 0:
        fail("bash -n failed on the generated installer:\n" + r.stderr)

    text = open(out_path, encoding="utf-8").read()
    blocks = re.findall(r"cat > /tmp/ff_payload\.b64 <<'(B64_[0-9A-F]{8})'\n(.*?)\n\1\n", text, re.S)
    if len(blocks) != len(files):
        fail(f"installer holds {len(blocks)} payload(s) but {len(files)} file(s) were selected")

    bad = 0
    for f, (_tag, body) in zip(files, blocks):
        decoded = base64.b64decode(body.replace("\n", ""))
        source = open(os.path.join(repo, f), "rb").read()
        if decoded != source:
            print(f"  MISMATCH     {f}", file=sys.stderr)
            bad += 1
    if bad:
        fail(f"{bad} payload(s) do not round-trip to their source bytes")
    print(f"  verify       bash -n clean, {len(files)}/{len(files)} payloads round-trip byte-for-byte")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--repo", default=".")
    ap.add_argument("--name", required=True)
    ap.add_argument("--message", required=True)
    ap.add_argument("--out", default=None)
    ap.add_argument("--allow-behind", action="store_true",
                    help="deliberate revert only — see the incidents at the top of this file")
    ap.add_argument("files", nargs="*")
    a = ap.parse_args()

    repo = os.path.abspath(a.repo)
    print(f"Building installer '{a.name}' from {repo}\n")

    check_freshness(repo, a.allow_behind)
    files = select_files(repo, a.files)
    scan_secrets(repo, files)
    check_invariants(repo, files)
    warn_db_edge(files)

    out = a.out or os.path.join(repo, f"apply-{a.name}.sh")
    open(out, "w").write(build(repo, a.name, a.message, files))
    os.chmod(out, 0o755)
    print(f"  build        {out}")

    verify(repo, out, files)

    print(f"\n✅ Installer ready: {out}")
    print("   Owner runs:  bash ~/freddy-fixit/apply-%s.sh" % a.name)


if __name__ == "__main__":
    main()
