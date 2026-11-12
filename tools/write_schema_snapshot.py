#!/usr/bin/env python3
"""Write supabase/schema/functions.sql and tables.sql from a saved snapshot.

Run supabase/schema/snapshot.sql through the Supabase MCP (execute_sql), save
the result to a file, then:  python3 tools/write_schema_snapshot.py <file> [date]
The files are a read-only reference of what production runs. Never applied.
"""
import json, os, sys

def load(path):
    t = open(path).read()
    try:
        t = json.loads(t)["result"]
    except Exception:
        pass
    i, j = t.index('[{"snapshot"'), t.rindex("}]") + 2
    return json.loads(t[i:j])[0]["snapshot"]

def main():
    snap = load(sys.argv[1])
    date = sys.argv[2] if len(sys.argv) > 2 else "unknown date"
    hdr = ("-- GENERATED from the live database on %s. Do not edit by hand and do not apply.\n"
           "-- This is a read-only reference so the repo can show what production runs.\n"
           "-- The public anon key is replaced with <ANON_KEY>.\n"
           "-- Regenerate after any DB change: tools/write_schema_snapshot.py.\n\n" % date)
    os.makedirs("supabase/schema", exist_ok=True)

    fns = snap["functions"]
    out = hdr + "-- %d functions in schema public\n\n" % len(fns)
    for x in fns:
        out += "-- %s(%s)   grants: %s\n%s;\n\n" % (x["name"], x["args"], x["acl"], x["def"].rstrip())
    open("supabase/schema/functions.sql", "w").write(out)

    tabs = {}
    for c in snap["tables"]:
        tabs.setdefault(c["table"], []).append(c)
    rls = set(snap.get("rls") or [])
    o = hdr + "-- %d tables in schema public\n\n" % len(tabs)
    for name, cols in tabs.items():
        o += "-- table %s   (%s)\n" % (name, "RLS on" if name in rls else "RLS OFF")
        for c in cols:
            o += "--   %s  %s%s%s%s\n" % (
                c["col"], c["type"], "" if c["nullable"] == "YES" else "  not null",
                "  default %s" % c["default"] if c["default"] else "",
                "  generated: %s" % c["generated"] if c["generated"] else "")
        o += "\n"
    o += "-- constraints\n" + "".join("--   %s.%s: %s\n" % (c["table"], c["name"], c["def"]) for c in snap["constraints"] or [])
    o += "\n-- indexes\n" + "".join("%s;\n" % d for d in snap["indexes"] or [])
    o += "\n-- policies\n" + "".join("--   %s / %s [%s] roles=%s\n--     using: %s\n--     check: %s\n" % (
        p["table"], p["name"], p["cmd"], p["roles"], p["using"], p["check"]) for p in snap["policies"] or [])
    o += "\n-- triggers\n" + "".join("%s;\n" % d for d in snap["triggers"] or [])
    o += "\n-- cron jobs\n" + "".join("--   %s  [%s]  active=%s  %s\n" % (
        c["name"], c["schedule"], c["active"], c["command"].strip()) for c in snap["cron"] or [])
    o += "\n-- views\n" + "".join("--   %s: %s\n" % (v["name"], v["def"]) for v in snap["views"] or [])
    open("supabase/schema/tables.sql", "w").write(o)
    print("%d functions, %d tables, %d policies, %d triggers, %d cron jobs" % (
        len(fns), len(tabs), len(snap["policies"] or []), len(snap["triggers"] or []), len(snap["cron"] or [])))

if __name__ == "__main__":
    main()
