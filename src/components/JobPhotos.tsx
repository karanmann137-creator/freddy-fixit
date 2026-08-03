import { useEffect, useState } from "react";
import { Ic } from "@/components/Ic";
import { supabase } from "@/lib/supabase";

// Before / after job photos. Both are mandatory for the contractor: the "after"
// photo is what unlocks marking the job complete (and therefore payment), and
// the "before" photo is what makes the after shot mean anything to the client.
//
// Each photo is saved the moment it is taken (save_job_photo RPC) rather than
// being held until completion — if the pro closes the app on site, the photo is
// already on the record. mark_job_complete then just reads the columns.
//
// Both photos live in the private completion-photos bucket under <job_id>/…,
// which is what the existing bucket RLS keys on, so no storage changes were
// needed. Client and admin see the same two photos, read-only.
//
// Note: accept="image/*" without `capture` on purpose — mobile still offers the
// camera first, but a pro who shot the photo in another app can still attach it
// rather than being forced to re-take it on the spot.

// Must match public.photo_rules_start() in the database. Jobs created before
// this were never prompted for a before photo, so they are not blocked on one.
export const PHOTO_RULES_START = Date.parse("2026-08-02T00:00:00Z");

const MAX_BYTES = 10 * 1024 * 1024; // matches the bucket's 10MB cap
const OK_TYPES = ["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"];
const OK_EXTS = ["jpg", "jpeg", "png", "webp", "heic", "heif"];

// Some browsers hand us a File with an empty `type` for iPhone HEIC photos, so
// a strict MIME check would reject a perfectly good photo. Fall back to the
// file extension whenever the browser didn't tell us what it is.
function looksLikePhoto(f: File): boolean {
  if (f.type) return OK_TYPES.includes(f.type) || f.type.startsWith("image/");
  return OK_EXTS.includes((f.name.split(".").pop() || "").toLowerCase());
}

export function beforeRequired(job: any): boolean {
  const created = Date.parse(job?.created_at ?? "");
  return !Number.isFinite(created) || created >= PHOTO_RULES_START;
}

/** What the contractor still owes on this job, in plain words. Empty = done. */
export function photosMissing(job: any): string[] {
  const out: string[] = [];
  if (!job?.before_photo_path && beforeRequired(job)) out.push("a before photo");
  if (!job?.completion_photo_path) out.push("a photo of the finished work");
  return out;
}

type Kind = "before" | "after";

export default function JobPhotos({ job, role, onSaved, onError }: {
  job: any;
  role: "contractor" | "client" | "admin";
  onSaved?: (kind: Kind, path: string) => void;
  onError?: (msg: string) => void;
}) {
  const readOnly = role !== "contractor";
  const paths: Record<Kind, string | null> = {
    before: job?.before_photo_path ?? null,
    after: job?.completion_photo_path ?? null,
  };
  const [urls, setUrls] = useState<Record<string, string>>({});
  const [failed, setFailed] = useState<Record<string, true>>({});
  const [signTick, setSignTick] = useState(0);
  const [busy, setBusy] = useState<Kind | null>(null);

  // Sign whatever exists so it can be shown inline (1h, same as elsewhere).
  // A signing failure is recorded rather than swallowed — otherwise an uploaded
  // photo renders as a blank grey box with no way to tell it apart from one
  // that's still loading, and no way to try again.
  useEffect(() => {
    let alive = true;
    const want = ([["before", paths.before], ["after", paths.after]] as [Kind, string | null][])
      .filter(([, p]) => p && !urls[p]);
    if (!want.length) return;
    (async () => {
      for (const [, p] of want) {
        const key = p as string;
        const { data, error } = await supabase.storage.from("completion-photos").createSignedUrl(key, 3600);
        if (!alive) return;
        if (error || !data?.signedUrl) setFailed(f => ({ ...f, [key]: true }));
        else setUrls(u => ({ ...u, [key]: data.signedUrl }));
      }
    })();
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paths.before, paths.after, signTick]);

  const retrySign = (p: string) => {
    setFailed(f => { const n = { ...f }; delete n[p]; return n; });
    setSignTick(t => t + 1);
  };

  const pick = async (kind: Kind, e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return; // cancelled the picker — keep whatever was there
    if (!looksLikePhoto(f)) {
      e.target.value = "";
      onError?.("That file isn't a photo. Use a JPG, PNG, WEBP or a photo straight from your phone.");
      return;
    }
    if (f.size > MAX_BYTES) {
      e.target.value = "";
      onError?.("That photo is over 10MB. Take it at a lower resolution or pick another one.");
      return;
    }
    setBusy(kind);
    try {
      const ext = (f.name.split(".").pop() || "jpg").toLowerCase();
      const path = job.id + "/" + kind + "-" + crypto.randomUUID() + "." + ext;
      const { error: upErr } = await supabase.storage.from("completion-photos").upload(path, f);
      if (upErr) throw upErr;
      const { error } = await supabase.rpc("save_job_photo", { p_job_id: job.id, p_kind: kind, p_path: path });
      if (error) throw error;
      onSaved?.(kind, path);
    } catch (err: any) {
      onError?.("Couldn't save that photo: " + (err?.message || err));
    } finally {
      e.target.value = "";
      setBusy(null);
    }
  };

  const needBefore = beforeRequired(job);

  // Client / admin with nothing uploaded yet: show nothing rather than two
  // empty boxes that look like something is broken.
  if (readOnly && !paths.before && !paths.after) return null;

  const slot = (kind: Kind, label: string, hint: string) => {
    const p = paths[kind];
    const url = p ? urls[p] : null;
    const optional = kind === "before" && !needBefore;
    return (
      <div style={{ flex: "1 1 190px", minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: ".35rem", marginBottom: ".3rem" }}>
          <div style={{ fontSize: ".7rem", textTransform: "uppercase" as const, letterSpacing: ".08em", fontWeight: 700, color: p ? "var(--ff-success)" : "#ea6b14" }}>
            {label}
          </div>
          {p
            ? <Ic name="check-circle" size={13} color="#22c55e" style={{ flexShrink: 0 }} />
            : !readOnly && <span style={{ fontSize: ".62rem", fontWeight: 700, textTransform: "uppercase" as const, letterSpacing: ".06em", padding: ".1rem .35rem", borderRadius: "5px", background: optional ? "rgba(var(--ff-fg), .1)" : "rgba(234,107,20,.15)", color: optional ? "rgba(var(--ff-muted), .7)" : "#ea6b14" }}>{optional ? "Optional" : "Required"}</span>}
        </div>

        {url ? (
          <a href={url} target="_blank" rel="noopener noreferrer" style={{ display: "block" }}>
            <img src={url} alt={label} style={{ width: "100%", maxWidth: "100%", height: "132px", objectFit: "cover" as const, borderRadius: "10px", border: "1px solid rgba(var(--ff-fg), .12)", display: "block" }} />
          </a>
        ) : p && failed[p] ? (
          <div style={{ height: "132px", display: "flex", flexDirection: "column" as const, alignItems: "center", justifyContent: "center", gap: ".3rem", textAlign: "center" as const, padding: ".5rem", borderRadius: "10px", background: "rgba(var(--ff-fg), .03)", border: "1px dashed rgba(var(--ff-fg), .16)" }}>
            <div style={{ fontSize: ".74rem", color: "rgba(var(--ff-muted), .65)", lineHeight: 1.35 }}>The photo is saved, but we couldn't load it just now.</div>
            <button onClick={() => retrySign(p as string)} style={{ background: "none", border: "none", padding: 0, fontFamily: "inherit", fontSize: ".74rem", fontWeight: 600, color: "#ea6b14", cursor: "pointer" }}>Try again</button>
          </div>
        ) : p ? (
          <div style={{ height: "132px", borderRadius: "10px", background: "rgba(var(--ff-fg), .05)", border: "1px solid rgba(var(--ff-fg), .1)" }} />
        ) : readOnly ? (
          <div style={{ height: "132px", display: "flex", alignItems: "center", justifyContent: "center", textAlign: "center" as const, padding: ".5rem", borderRadius: "10px", background: "rgba(var(--ff-fg), .03)", border: "1px dashed rgba(var(--ff-fg), .14)", fontSize: ".76rem", color: "rgba(var(--ff-muted), .55)" }}>
            Not uploaded yet
          </div>
        ) : (
          <label style={{ height: "132px", display: "flex", flexDirection: "column" as const, alignItems: "center", justifyContent: "center", gap: ".3rem", textAlign: "center" as const, padding: ".5rem", borderRadius: "10px", cursor: "pointer", background: optional ? "rgba(var(--ff-fg), .03)" : "rgba(234,107,20,.07)", border: "1px dashed " + (optional ? "rgba(var(--ff-fg), .18)" : "rgba(234,107,20,.45)") }}>
            <Ic name="camera" size={20} color="#ea6b14" style={{ flexShrink: 0 }} />
            <div style={{ fontSize: ".8rem", fontWeight: 600, color: "var(--ff-text)" }}>{busy === kind ? "Uploading…" : "Take / choose photo"}</div>
            <div style={{ fontSize: ".68rem", color: "rgba(var(--ff-muted), .6)", lineHeight: 1.3 }}>{hint}</div>
            <input type="file" accept="image/*" disabled={busy !== null} onChange={e => pick(kind, e)} style={{ display: "none" }} />
          </label>
        )}

        {!readOnly && p && (
          <label style={{ display: "inline-block", marginTop: ".35rem", fontSize: ".72rem", color: "#ea6b14", cursor: "pointer", fontWeight: 600 }}>
            {busy === kind ? "Uploading…" : "Replace photo"}
            <input type="file" accept="image/*" disabled={busy !== null} onChange={e => pick(kind, e)} style={{ display: "none" }} />
          </label>
        )}
      </div>
    );
  };

  return (
    <div style={{ padding: ".85rem .95rem", borderRadius: "12px", background: "rgba(var(--ff-fg), .03)", border: "1px solid rgba(var(--ff-fg), .08)" }}>
      <div style={{ display: "flex", alignItems: "center", gap: ".4rem", marginBottom: ".2rem" }}>
        <Ic name="camera" size={15} color="#ea6b14" style={{ flexShrink: 0 }} />
        <div style={{ fontSize: ".82rem", fontWeight: 700, color: "var(--ff-text)" }}>Before &amp; after photos</div>
      </div>
      <div style={{ fontSize: ".76rem", color: "rgba(var(--ff-muted), .65)", lineHeight: 1.45, marginBottom: ".7rem" }}>
        {readOnly
          ? "Your contractor photographs the work area before starting and the finished job at the end, so you can see exactly what changed."
          : "Take one when you arrive and one when you're done. The finished-work photo is what lets the client confirm and release your payment."}
      </div>
      <div style={{ display: "flex", gap: ".7rem", flexWrap: "wrap" as const }}>
        {slot("before", "Before", "The work area as you found it")}
        {slot("after", readOnly ? "After" : "After — finished work", "The finished job")}
      </div>
    </div>
  );
}
