#!/usr/bin/env python3
"""
ship.py -- build the one-command installer the owner runs to deploy.

THE MODEL CHANGED. Read this before editing.

The assistant's workspace mount IS this repository -- the same directory the
installer does `cd ~/freddy-fixit` into. So the assistant edits files here
directly and the installer no longer carries a base64 copy of anything. It is
now ~1KB of gates instead of ~500KB of payload.

That deletes an entire documented failure class BY CONSTRUCTION rather than by
checking for it:

  - decode corruption (`base64 -d file` vs `base64 -d < file`)  -- no decode
  - 0-byte truncation from a redirect onto the destination      -- no redirect
  - superset installers silently reverting newer work           -- no payload
  - round-trip verification of installer vs source              -- they are one file

But it introduces exactly ONE new sharp edge, and it is sharp:

  *** THE WORKING TREE IS NOW THE ONLY COPY OF THE CHANGE. ***

  In the old model the installer carried the payload, so `git checkout -- .`
  on failure was free -- re-running the script restored everything. Now a
  blanket revert DESTROYS the work with nothing to redo it from. The emitted
  installer therefore NEVER runs a bare `git checkout -- .`; its failure trap
  restores ONLY the paths it deleted, by name.

What the assistant cannot do from the sandbox: delete files, and run git write
operations (git must unlink .git/index.lock and the mount refuses unlink).
So git and deletion both live in the installer, which runs on the owner's
machine with full permissions.

Usage:
    python3 tools/ship.py --message "what changed" \
        [--delete path ...] [--delete-untracked path ...] \
        [--allow-behind] [--skip-typecheck] [-o apply-x.sh]
"""

import argparse
import base64
import json
import os
import re
import subprocess
import sys

REPO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

# ---------------------------------------------------------------------------
# Critical mounts. A file may be edited freely, but if one of these strings
# stops appearing in it, something upstream deleted a mount and the change is
# refused. fa5e2b5 dropped the <ContractPanel/> mounts and, because the payment
# gate fails CLOSED, made every job on the platform unpayable with no error
# anywhere -- the client simply had no surface on which to sign.
# ---------------------------------------------------------------------------
INVARIANTS = {
    "src/pages/ClientDashboard.tsx": ["<ContractPanel"],
    "src/pages/ContractorDashboard.tsx": ["<ContractPanel", "STAGE_MATCH", "JobsCalendar"],
    "src/pages/AdminDashboard.tsx": ["<ContractPanel"],
    "src/App.tsx": ["<ChatWidget", "<GoogleReviewModal", "<FinishSignupBanner", "<ScrollToTop"],
    "src/main.tsx": ["initAnalytics"],
}

# Files that must never be deleted, whatever the reference scan says.
UNDELETABLE = set(INVARIANTS) | {
    "CLAUDE.md",
    "src/CLAUDE.md",
    "supabase/CLAUDE.md",
    "package.json",
    "package-lock.json",
    "tsconfig.json",
    "tsconfig.check.json",
    "vite.config.ts",
    "index.html",
    "vercel.json",
    ".gitignore",
    "tools/ship.py",
}

# The repo is PUBLIC. These must never reach a commit.
SECRET_PATTERNS = [
    (r"sk_live_[A-Za-z0-9]{10,}", "Stripe live secret key"),
    (r"sk_test_[A-Za-z0-9]{10,}", "Stripe test secret key"),
    (r"rk_live_[A-Za-z0-9]{10,}", "Stripe restricted key"),
    (r"whsec_[A-Za-z0-9]{10,}", "Stripe webhook secret"),
    (r"sk-ant-[A-Za-z0-9\-_]{10,}", "Anthropic API key"),
    (r"re_[A-Za-z0-9]{20,}", "Resend API key"),
    (r"SUPABASE_SERVICE_ROLE_KEY\s*[:=]\s*[\"'][^\"']{20,}", "inline service-role key"),
]

JWT_RE = re.compile(r"eyJ[A-Za-z0-9_-]{10,}\.([A-Za-z0-9_-]{10,})\.[A-Za-z0-9_-]{10,}")


def find_service_role_jwt(text):
    """A JWT on its own is fine -- the anon key IS a JWT and ships in the
    browser bundle on purpose. Only the service_role claim is a leak, so decode
    the payload and look at the claim rather than matching the shape."""
    for m in JWT_RE.finditer(text):
        payload = m.group(1)
        payload += "=" * (-len(payload) % 4)
        try:
            claims = json.loads(base64.urlsafe_b64decode(payload))
        except Exception:
            continue
        if isinstance(claims, dict) and claims.get("role") == "service_role":
            return True
    return False


def git(*args, check=True):
    r = subprocess.run(["git", "-C", REPO, *args], capture_output=True, text=True)
    if check and r.returncode != 0:
        die("git " + " ".join(args) + " failed:\n" + (r.stderr or r.stdout))
    return r.stdout


def die(msg):
    print("\nREFUSED: " + msg + "\n", file=sys.stderr)
    sys.exit(1)


def ok(msg):
    print("  ok   " + msg)


# ---------------------------------------------------------------------------
# 1. Freshness. The mount is the live repo, so "stale clone" now means the
#    owner pushed from somewhere else and this tree hasn't caught up. Shipping
#    on top of that is how a superset installer used to revert newer work; the
#    mechanism is gone but the hazard of committing against an old base is not.
# ---------------------------------------------------------------------------
def check_fresh(allow_behind):
    subprocess.run(["git", "-C", REPO, "fetch", "--quiet", "origin", "main"],
                   capture_output=True, text=True)
    counts = git("rev-list", "--left-right", "--count", "origin/main...HEAD", check=False).strip()
    try:
        behind, ahead = (int(x) for x in counts.split())
    except ValueError:
        print("  warn origin/main unreadable -- could not check freshness")
        return
    if behind and not allow_behind:
        die("this tree is %d commit(s) behind origin/main.\n"
            "  Run:  cd ~/freddy-fixit && git pull\n"
            "  then re-read the files you changed. Pass --allow-behind only if\n"
            "  you are deliberately reverting." % behind)
    if behind:
        print("  warn %d commit(s) behind origin/main (--allow-behind given)" % behind)
    if ahead:
        print("  warn %d local commit(s) not yet pushed -- they will go up too" % ahead)
    ok("up to date with origin/main")


# ---------------------------------------------------------------------------
# 2. What changed. Parse porcelain RAW -- do not strip the line, because the
#    status column is two characters wide and stripping eats it, which
#    truncates the first character of the first filename.
# ---------------------------------------------------------------------------
def changed_files():
    added, removed = [], []
    for line in git("status", "--porcelain").splitlines():
        if not line:
            continue
        code, path = line[:2], line[3:]
        if " -> " in path:                       # rename
            path = path.split(" -> ", 1)[1]
        path = path.strip('"')
        if code in (" D", "D ", "DD"):
            removed.append(path)
        elif path.endswith("/"):
            # An untracked DIRECTORY. Expand it through git rather than walking
            # it by hand, so .gitignore is honoured -- a hand-rolled walk picks
            # up __pycache__, .DS_Store and anything else the ignore file
            # already excludes, and then reports them as part of the change.
            listed = git("ls-files", "--others", "--exclude-standard", "--", path)
            added += [x for x in listed.splitlines() if x]
        else:
            added.append(path)
    return sorted(set(added)), sorted(set(removed))


# ---------------------------------------------------------------------------
# 3. Secrets.
# ---------------------------------------------------------------------------
def check_secrets(paths):
    for p in paths:
        full = os.path.join(REPO, p)
        if not os.path.isfile(full):
            continue
        try:
            text = open(full, encoding="utf-8", errors="ignore").read()
        except Exception:
            continue
        for pat, label in SECRET_PATTERNS:
            if re.search(pat, text):
                die("%s appears in %s.\n  The repo is PUBLIC. Remove it before shipping." % (label, p))
        if find_service_role_jwt(text):
            die("a JWT with role=service_role appears in %s.\n"
                "  The repo is PUBLIC. Remove it before shipping." % p)
    ok("no secrets in %d changed file(s)" % len(paths))


# ---------------------------------------------------------------------------
# 4. Critical mounts.
# ---------------------------------------------------------------------------
def check_invariants(paths):
    hit = 0
    for p in paths:
        if p not in INVARIANTS:
            continue
        full = os.path.join(REPO, p)
        if not os.path.isfile(full):
            die("%s is in INVARIANTS but is missing from the tree." % p)
        text = open(full, encoding="utf-8", errors="ignore").read()
        if len(text) < 400:
            die("%s is only %d bytes. That is the 0-byte-truncation shape (b1361b6);\n"
                "  esbuild will build it fine and every visitor will crash at runtime." % (p, len(text)))
        for needle in INVARIANTS[p]:
            if needle not in text:
                die("%s no longer contains %s.\n"
                    "  Dropping that mount is how fa5e2b5 made every job unpayable." % (p, needle))
        hit += 1
    ok("critical mounts intact (%d guarded file(s) touched)" % hit)


# ---------------------------------------------------------------------------
# 5. Deletion safety. The point of this whole gate: a file is only "useless" if
#    nothing reaches it. A missing icon glyph renders BLANK rather than raising,
#    and a lazy-imported page explodes only at runtime -- so "it still builds"
#    is not evidence. Prove nothing references it.
# ---------------------------------------------------------------------------
SEARCH_ROOTS = ["src", "supabase/functions", "public", "index.html", "package.json", "vercel.json"]


def _grep(needle, skip_paths):
    """Return files (outside skip_paths) containing needle."""
    hits = []
    for root in SEARCH_ROOTS:
        full = os.path.join(REPO, root)
        if os.path.isfile(full):
            candidates = [full]
        elif os.path.isdir(full):
            candidates = []
            for r, _d, files in os.walk(full):
                candidates += [os.path.join(r, f) for f in files]
        else:
            continue
        for c in candidates:
            rel = os.path.relpath(c, REPO)
            if rel in skip_paths:
                continue
            try:
                if needle in open(c, encoding="utf-8", errors="ignore").read():
                    hits.append(rel)
            except Exception:
                continue
    return hits


def check_deletions(to_delete):
    if not to_delete:
        return
    skip = set(to_delete)
    for p in to_delete:
        if p in UNDELETABLE:
            die("%s is on the undeletable list. If it really must go, say so in\n"
                "  plain English to the owner and let him decide." % p)
        if not os.path.exists(os.path.join(REPO, p)):
            die("%s does not exist -- nothing to delete. Check the path." % p)

        stem = os.path.splitext(os.path.basename(p))[0]
        # The import specifier: "./Foo", "../lib/Foo", "@/components/Foo".
        refs = _grep("/" + stem, skip) + _grep('"' + stem, skip) + _grep("'" + stem, skip)
        # And the literal path, for anything referenced as a string (workflows,
        # vercel rewrites, dynamic import()).
        refs += _grep(p, skip)
        refs = sorted(set(refs))
        if refs:
            die("%s is still referenced by:\n    %s\n"
                "  Remove those references first. A dangling import is not always a\n"
                "  build error -- a lazy-loaded page fails only at runtime, in the\n"
                "  browser, for whoever visits that route." % (p, "\n    ".join(refs)))
        ok("%s: nothing references it" % p)


# ---------------------------------------------------------------------------
# 5b. Sweeping spent installers. Every deploy before this one left a ~400KB
#     base64 script in the repo root; 124 of them had accumulated to 43MB. They
#     are one-shot artifacts, already gitignored, and once pushed they are dead
#     weight -- but an UNRUN one is the only copy of an undeployed change, so
#     this keeps the newest few and touches nothing else.
#
#     It only ever matches apply-*.sh / fix-*.sh, only ever untracked files,
#     and never the owner's real deliverables (.docx, .env, the private audit)
#     which sit gitignored in the same directory.
# ---------------------------------------------------------------------------
SWEEP_GLOBS = ("apply-", "fix-")


def sweep_installers(keep):
    tracked = set(git("ls-files").splitlines())
    cands = []
    for name in os.listdir(REPO):
        if not name.endswith(".sh"):
            continue
        if not name.startswith(SWEEP_GLOBS):
            continue
        if name in tracked:
            continue
        full = os.path.join(REPO, name)
        if os.path.isfile(full):
            cands.append((os.path.getmtime(full), name, os.path.getsize(full)))
    cands.sort(reverse=True)
    keeping, sweeping = cands[:keep], cands[keep:]
    if not sweeping:
        ok("no spent installers to sweep (%d present, keeping %d)" % (len(cands), keep))
        return []
    freed = sum(s for _m, _n, s in sweeping)
    ok("sweeping %d spent installer(s), %.0f MB; keeping the newest %d"
       % (len(sweeping), freed / 1e6, len(keeping)))
    for _m, n, _s in keeping:
        print("       keep " + n)
    return [n for _m, n, _s in sweeping]


# ---------------------------------------------------------------------------
# 6. Typecheck. THIS IS THE GATE THE OLD BUILDER WAS MISSING and it is the only
#    thing that has ever caught the 0-byte-file incident: esbuild does no
#    typecheck, so `vite build` compiles an empty module happily and it blows up
#    at runtime inside React.lazy. It also runs HERE, in the assistant's
#    sandbox, so a type error is found before the owner ever sees a command.
# ---------------------------------------------------------------------------
def run_typecheck():
    if not os.path.isdir(os.path.join(REPO, "node_modules")):
        print("  warn node_modules missing -- skipping typecheck here; the installer still runs it")
        return
    r = subprocess.run(["npm", "run", "--silent", "typecheck"], cwd=REPO,
                       capture_output=True, text=True)
    if r.returncode != 0:
        out = (r.stdout + r.stderr).strip()
        die("npm run typecheck failed. Baseline is 0 errors.\n\n" + out[-4000:])
    ok("npm run typecheck -- 0 errors")


# ---------------------------------------------------------------------------
# 7. Emit. Everything below runs on the OWNER'S machine.
# ---------------------------------------------------------------------------
def sh_quote(p):
    return "'" + p.replace("'", "'\\''") + "'"


def emit(path, message, del_tracked, del_untracked, skip_typecheck):
    L = []
    a = L.append
    a("#!/usr/bin/env bash")
    a("set -euo pipefail")
    a("cd ~/freddy-fixit")
    a("")
    a("# Freddy Fix It installer")
    a("# " + message)
    a("#")
    a("# This carries NO file contents. Claude already wrote the changes into this")
    a("# folder. All this does is check them and push.")
    a("")
    a('echo "Freddy Fix It -- ' + message.replace('"', "'") + '"')
    a('echo ""')
    a("")

    if del_tracked or del_untracked:
        quoted = " ".join(sh_quote(p) for p in del_tracked)
        a("# --- Removing files that are no longer used -------------------------------")
        a("# If any check below fails, ONLY these paths are put back. Nothing else is")
        a("# reverted: the edits in this folder are the only copy of the change, so a")
        a("# blanket 'git checkout -- .' would destroy work with nothing to redo it from.")
        a("restore_deleted() {")
        a('  echo ""')
        if del_tracked:
            a('  echo "Something failed -- putting the deleted files back..."')
            a("  git reset -q -- " + quoted + " >/dev/null 2>&1 || true")
            a("  git checkout -q -- " + quoted + " >/dev/null 2>&1 || true")
            a('  echo "   Restored. Nothing was committed or pushed."')
        else:
            # Every swept path was untracked, so git has no copy to restore from.
            # Saying "putting the deleted files back" here would be a lie, and a
            # script that lies about what it just did is worse than one that fails.
            a('  echo "A check failed. Nothing was committed or pushed, and your'
              ' code files were NOT changed back."')
            a('  echo "The %d unused file(s) removed above are gone for good --'
              ' they were scratch files git never tracked, so no code was lost."'
              % len(del_untracked))
        a('  echo "Send this whole message back to Claude."')
        a("}")
        a("trap restore_deleted ERR")
        a("")
        for p in del_tracked:
            a('echo "Removing ' + p + '"')
        if del_tracked:
            a("git rm -f --quiet " + quoted)
        if del_untracked:
            a('echo "Removing %d spent/unused file(s) that were never part of the code..."'
              % len(del_untracked))
            a("rm -f \\")
            for i, p in enumerate(del_untracked):
                a("  " + sh_quote(p) + ("" if i == len(del_untracked) - 1 else " \\"))
        a("")
    else:
        a("fail_note() {")
        a('  echo ""')
        a('  echo "A check failed. Nothing was committed or pushed, and your files were NOT changed back."')
        a('  echo "Send this whole message back to Claude."')
        a("}")
        a("trap fail_note ERR")
        a("")

    a("# --- Checks ---------------------------------------------------------------")
    a("[ -d node_modules ] || npm install")
    if not skip_typecheck:
        a('echo "Checking for type errors..."')
        a("npm run typecheck")
        a("")
    a('echo "Building the site (this is the real check -- it stops if anything is wrong)..."')
    a("npx vite build")
    a("")
    a("# --- Ship -----------------------------------------------------------------")
    a("trap - ERR")
    a("git add -A")
    a('git commit -m "' + message.replace('"', "'") + '" || true')
    a("git push")
    a('echo ""')
    a('echo "Pushed. Vercel is deploying now. Hard-refresh in about a minute (Cmd+Shift+R)."')
    a("")

    with open(path, "w", encoding="utf-8") as f:
        f.write("\n".join(L))
    os.chmod(path, 0o755)

    r = subprocess.run(["bash", "-n", path], capture_output=True, text=True)
    if r.returncode != 0:
        die("the generated installer is not valid bash:\n" + r.stderr)
    ok("installer syntax valid (bash -n)")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--message", required=True, help="commit message / what changed")
    ap.add_argument("--delete", action="append", default=[], help="tracked file to remove (repeatable)")
    ap.add_argument("--delete-untracked", action="append", default=[], help="untracked junk to rm (repeatable)")
    ap.add_argument("--sweep-installers", nargs="?", const=3, type=int, default=None,
                    metavar="KEEP", help="delete spent apply-*.sh / fix-*.sh, keeping the newest KEEP (default 3)")
    ap.add_argument("--allow-behind", action="store_true", help="only for a deliberate revert")
    ap.add_argument("--skip-typecheck", action="store_true", help="escape hatch; say so to the owner")
    ap.add_argument("-o", "--out", default=None)
    a = ap.parse_args()

    out = a.out or os.path.join(REPO, "apply-change.sh")
    if not os.path.isabs(out):
        out = os.path.join(REPO, out)

    print("Preflight")
    check_fresh(a.allow_behind)

    added, removed = changed_files()
    to_delete = list(dict.fromkeys(a.delete + removed))
    untracked_gone = list(a.delete_untracked)
    if a.sweep_installers is not None:
        untracked_gone += sweep_installers(a.sweep_installers)

    gone = set(to_delete) | set(untracked_gone) | {os.path.relpath(out, REPO)}
    added = [p for p in added if p not in gone]

    if not added and not to_delete and not untracked_gone:
        die("nothing has changed in the working tree. Edit the files first.")

    print("  --   %d file(s) changed, %d to delete, %d untracked to remove"
          % (len(added), len(to_delete), len(untracked_gone)))
    for p in added:
        print("       + " + p)
    for p in to_delete:
        print("       - " + p)
    if untracked_gone:
        print("       - %d untracked file(s): %s%s"
              % (len(untracked_gone), ", ".join(untracked_gone[:4]),
                 " ..." if len(untracked_gone) > 4 else ""))

    check_secrets(added)
    check_invariants(added)
    check_deletions(to_delete)
    if not a.skip_typecheck:
        run_typecheck()

    db = [p for p in added if p.startswith("supabase/")]
    if db:
        print("\n  NOTE  %d supabase file(s) are in this change. The installer commits them\n"
              "        for VERSION CONTROL ONLY -- it does not apply migrations or deploy\n"
              "        edge functions. Do that live via the Supabase MCP, and do not tell\n"
              "        the owner the script applied them." % len(db))

    emit(out, a.message, to_delete, untracked_gone, a.skip_typecheck)

    print("\nWrote " + out)
    print("\nGive the owner exactly this line:\n")
    print("  rm -f ~/freddy-fixit/.git/index.lock && bash ~/freddy-fixit/" + os.path.basename(out))
    print("")


if __name__ == "__main__":
    main()
