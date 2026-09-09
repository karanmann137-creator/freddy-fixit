// ConfirmAddress — the last step before a client pays their deposit.
//
// WHY THIS EXISTS
// Since the approximate-location change, a client request carries only a postal
// code and a quadrant token ("T3A 1B2 · NW Calgary"), never a street address.
// That is deliberate: `client_requests` is readable by every contractor the job
// is dispatched to, so a street address there would hand the inside of someone's
// house to seven strangers who may never be hired. The full address is collected
// exactly once, at the moment it becomes necessary — the client has chosen a pro
// and is about to pay.
//
// WHERE THE ADDRESS LIVES, AND WHY THAT IS THE PRIVACY PROPERTY
// `jobs.service_address` / `jobs.service_address_at`, not `client_requests`. A
// `jobs` row does not exist until a bid is accepted, so "no street address
// before a pro is chosen" is true BY CONSTRUCTION rather than by a policy
// somebody has to remember. The existing `Job parties see their jobs` RLS policy
// then scopes it to exactly two people, so no new policy was needed.
//
// The write goes through `confirm_job_address(uuid, text)` — a SECURITY DEFINER
// RPC — because clients have no UPDATE policy on `jobs` at all, and should not
// gain one for this.
//
// DELIBERATELY NOT WRITE-ONCE, unlike `contract_copy_sent_at`. A typo here sends
// a tradesperson to the wrong house, so the address stays editable for the live
// life of the job. The RPC refuses only once the job is cancelled or paid out.
import { useCallback, useEffect, useState } from "react";
import { Ic } from "@/components/Ic";
import { supabase } from "@/lib/supabase";
import AddressAutocomplete from "@/components/AddressAutocomplete";

// Stable scroll target. Module-level and exported for the same reason
// CONTRACT_ANCHOR is: an id typed twice is an id that drifts, and the attention
// row that points here scrolls to nothing if it misses. It must exist on EVERY
// render branch below, including the confirmed one — a client who taps "Change
// the address" after confirming still has to land somewhere.
export const ADDRESS_ANCHOR = "ffc-address";

/**
 * The ONE answer to "does this job still need an address?".
 *
 * Shared by the panel, both Pay-deposit buttons and `payForJob()`, so the button
 * and the handler can never disagree — the same idiom as `photosMissing`,
 * `canWithdraw` and `canRemoveRequest`.
 *
 * Note it is keyed on the COLUMN being empty, not on a date or a flag. A job
 * that predates this feature and was already paid for has no `service_address`
 * and would read as "missing" — which is exactly why only the DEPOSIT buttons
 * consult it and the balance buttons never do. Gating a balance on this would
 * stall money that is already owed on a job whose pro has been on site.
 */
export const addressMissing = (job: any): boolean =>
  !String(job?.service_address || "").trim();

const card: React.CSSProperties = {
  margin: "0 0 1rem", padding: "1rem 1.1rem", borderRadius: "12px",
  scrollMarginTop: "5.5rem", boxSizing: "border-box",
};
const label: React.CSSProperties = {
  fontSize: ".72rem", textTransform: "uppercase" as const, letterSpacing: ".1em",
  color: "rgba(var(--ff-muted), .5)", marginBottom: ".55rem", display: "flex", alignItems: "center", gap: 6,
};
const input: React.CSSProperties = {
  width: "100%", padding: ".55rem .7rem", borderRadius: "8px",
  border: "1px solid rgba(var(--ff-fg), .18)", background: "rgba(var(--ff-fg), .03)",
  color: "var(--ff-text)", fontFamily: "inherit", fontSize: ".9rem", boxSizing: "border-box",
};
const primary: React.CSSProperties = {
  padding: ".6rem 1.2rem", borderRadius: "9px", border: "none", background: "#ea6b14",
  color: "#fff", fontFamily: "inherit", fontSize: ".85rem", fontWeight: 600, cursor: "pointer",
};
const linkBtn: React.CSSProperties = {
  background: "none", border: "none", padding: 0, color: "#ea6b14",
  fontFamily: "inherit", fontSize: ".8rem", cursor: "pointer", textDecoration: "underline",
};
const ghostBtn: React.CSSProperties = {
  display: "inline-flex", alignItems: "center", gap: 6,
  padding: ".45rem .75rem", borderRadius: "8px",
  border: "1px solid rgba(var(--ff-fg), .18)", background: "rgba(var(--ff-fg), .04)",
  color: "var(--ff-text)", fontFamily: "inherit", fontSize: ".8rem", cursor: "pointer",
};

/**
 * "Use my current location" — a SHORTCUT INTO THE TEXT FIELD, never a submit.
 *
 * The client is one tap from paying, and the address decides which house a
 * tradesperson drives to. So the fix is written into the input for them to read
 * and correct, and the existing "Confirm this address" button is still what
 * saves it. That is also literally what the owner asked for — offer the button
 * AND have them confirm an address — and it is the only shape that is safe:
 *
 *   - On a desktop the browser has no GPS and derives the position from IP,
 *     which in Calgary lands on the city centroid remarkably often. A silent
 *     auto-save there sends a pro downtown to a house in Tuscany.
 *   - Reverse geocoding returns the NEAREST addressable thing, which on a
 *     corner lot or an acreage is the neighbour.
 *
 * Photon (photon.komoot.io) again — the same keyless OpenStreetMap geocoder
 * `AddressAutocomplete` already uses, so this adds no vendor, no API key and no
 * new sub-processor to disclose (Komoot GmbH is already named in the Privacy
 * Policy). A frontend key would sit readable in a PUBLIC repo anyway.
 *
 * ⚠️ It reuses that file's STRUCTURED-FIELD service-area test rather than a
 * regex over the joined string. The old unanchored `/alberta|AB/i` matched any
 * address containing the letters "ab", and the point of repeating the shape
 * here is that a fix outside Alberta must produce a plain-English note rather
 * than a confidently wrong address in a field the client is about to confirm.
 *
 * EVERY failure path leaves the field exactly as the client left it and says
 * one short sentence — denied permission, no API, timeout, network, no match,
 * out of area. Manual typing was and remains the primary path; this is the same
 * silent-degradation rule `AddressAutocomplete` follows, and the same reason
 * `imageCompress` returns the original file on every failure. A convenience is
 * never worth standing between a client and paying.
 */
const inServiceArea = (p: any): boolean => {
  const country = String(p.countrycode || p.country || "");
  if (country && !/^(ca|canada)$/i.test(country)) return false;
  const state = String(p.state || "").trim();
  return /^alberta$/i.test(state) || /^AB$/.test(state);
};

/** Same display-string assembly as the autocomplete, so a typed pick and a
 *  located one are stored in the same shape. */
const formatFeature = (p: any): string => {
  const line1 = [p.housenumber, p.street || p.name].filter(Boolean).join(" ");
  return [line1, p.city || p.county, p.state, p.postcode].filter(Boolean).join(", ");
};

type Props = {
  job: any;
  /** Called with the saved address so the dashboard can patch its copy of the
   *  job immediately. The realtime subscription on `jobs` will deliver the same
   *  value a moment later; this is what makes the button unblock on the tap
   *  rather than on the round trip. */
  onConfirmed?: (address: string) => void;
  highlight?: boolean;
};

export default function ConfirmAddress({ job, onConfirmed, highlight }: Props) {
  const anchor = { id: ADDRESS_ANCHOR, className: highlight ? "ff-pulse" : undefined };

  const current = String(job?.service_address || "").trim();
  const [editing, setEditing] = useState(false);
  const [addr, setAddr] = useState("");
  const [saved, setSaved] = useState<{ id: string; address: string }[]>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  // Kept SEPARATE from `err`. `err` is the RPC refusing to save — something the
  // client must act on before they can pay. A geolocation miss is a shortcut
  // that didn't work, and dressing the two the same would make a failed
  // convenience look like a blocked payment.
  const [locating, setLocating] = useState(false);
  const [locNote, setLocNote] = useState<string | null>(null);

  const useMyLocation = () => {
    setLocNote(null);
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      setLocNote("This browser can't share a location. Please type the address instead.");
      return;
    }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        // Photon can hang; the client is holding a button, so give up early and
        // let them type. Giving up early is safe — nothing was written.
        const ctrl = new AbortController();
        const t = setTimeout(() => ctrl.abort(), 12000);
        try {
          const { latitude, longitude } = pos.coords;
          const url = `https://photon.komoot.io/reverse?lat=${encodeURIComponent(String(latitude))}&lon=${encodeURIComponent(String(longitude))}&limit=5&lang=en`;
          const res = await fetch(url, { signal: ctrl.signal });
          if (!res.ok) throw new Error("lookup failed");
          const data = await res.json();
          const feats: any[] = Array.isArray(data?.features) ? data.features : [];
          // Prefer a result that actually carries a house number — reverse
          // geocoding happily returns a street, a suburb or a whole city, and
          // "Tuscany, Calgary, Alberta" in an address field is worse than an
          // empty one because it looks finished.
          const props = feats.map((f: any) => f?.properties || {}).filter(inServiceArea);
          const best = props.find((p: any) => p.housenumber && (p.street || p.name)) || null;
          const line = best ? formatFeature(best) : "";
          if (!line) {
            setLocNote(
              props.length === 0 && feats.length > 0
                ? "That looks like it's outside our service area. Please type the address instead."
                : "We couldn't turn that into a street address. Please type it instead."
            );
            return;
          }
          // FILL, never save. The client reads it, fixes it if it's the
          // neighbour's, and presses Confirm themselves.
          setAddr(line);
          setErr(null);
          setLocNote("We filled in the closest address we could find — please check it's right, then confirm.");
        } catch {
          setLocNote("We couldn't look that up just now. Please type the address instead.");
        } finally {
          clearTimeout(t);
          setLocating(false);
        }
      },
      (e: any) => {
        setLocating(false);
        // PERMISSION_DENIED is 1. Everything else is a failure to get a fix,
        // and neither is worth more than one sentence.
        setLocNote(
          e?.code === 1
            ? "No problem — location sharing is off for this site. Please type the address instead."
            : "We couldn't get your location. Please type the address instead."
        );
      },
      { enableHighAccuracy: true, timeout: 12000, maximumAge: 60000 }
    );
  };

  // Quick-pick list. Nothing else in the app reads or writes `saved_addresses`,
  // so this component owns it end to end: it offers what is there and adds what
  // the client confirms. A failed read leaves the list empty and the typing path
  // untouched — a missing shortcut is not worth an error message here.
  const loadSaved = useCallback(async () => {
    const { data: u } = await supabase.auth.getUser();
    const uid = u?.user?.id;
    if (!uid) return;
    const { data, error } = await supabase
      .from("saved_addresses").select("id, address")
      .eq("user_id", uid).order("created_at", { ascending: false }).limit(6);
    if (error) return;
    setSaved((data || []).filter((r: any) => String(r.address || "").trim()));
  }, []);

  useEffect(() => { void loadSaved(); }, [loadSaved]);

  // Remember the address for next time. Fire-and-forget inside its own guard:
  // this runs AFTER the confirmation has already succeeded, and a convenience
  // list is never worth failing a step that stands between a client and paying.
  // Same rule as "a referral code is never worth a signup".
  const remember = async (value: string) => {
    try {
      const { data: u } = await supabase.auth.getUser();
      const uid = u?.user?.id;
      if (!uid) return;
      // Only de-duplicate against a list we actually managed to read. If the
      // read failed we skip the insert rather than risk piling up duplicates in
      // a list whose whole job is to be a short set of shortcuts.
      if (saved.some(r => r.address.trim().toLowerCase() === value.trim().toLowerCase())) return;
      await supabase.from("saved_addresses").insert({ user_id: uid, address: value, label: null });
      void loadSaved();
    } catch { /* convenience only */ }
  };

  const save = async (value: string) => {
    const v = value.trim();
    if (!v) { setErr("Please enter the full street address, including the house or unit number."); return; }
    setBusy(true); setErr(null); setLocNote(null);
    try {
      const { data, error } = await supabase.rpc("confirm_job_address", { p_job_id: job.id, p_address: v });
      if (error) throw error;
      const stored = String(data || v);
      setEditing(false);
      setAddr("");
      onConfirmed?.(stored);
      void remember(stored);
    } catch (e: any) {
      // The RPC raises in plain English on purpose — every one of its refusals
      // is something the client can act on ("include the house number", "this
      // job was cancelled"). Show it verbatim rather than replacing it with a
      // generic failure that hides the instruction.
      setErr(e?.message || "We couldn't save that address. Please try again.");
    } finally {
      setBusy(false);
    }
  };

  // ---- Confirmed ----------------------------------------------------------
  if (current && !editing) {
    return (
      <div {...anchor} style={{ ...card, background: "rgba(34,197,94,.07)", border: "1px solid rgba(34,197,94,.25)" }}>
        <div style={label}><Ic name="map-pin" size={13} />Service address</div>
        <div style={{ fontSize: ".92rem", color: "var(--ff-text)", lineHeight: 1.5, marginBottom: ".45rem" }}>{current}</div>
        <div style={{ fontSize: ".78rem", color: "rgba(var(--ff-muted), .6)", lineHeight: 1.5 }}>
          Only your pro can see this. <button style={linkBtn} onClick={() => { setAddr(current); setEditing(true); setErr(null); setLocNote(null); }}>Change the address</button>
        </div>
      </div>
    );
  }

  // ---- Needs confirming (or being changed) --------------------------------
  return (
    <div {...anchor} style={{ ...card, background: "rgba(234,107,20,.08)", border: "1px solid rgba(234,107,20,.32)" }}>
      <div style={{ ...label, color: "#ea6b14" }}><Ic name="map-pin" size={13} />{current ? "Change the service address" : "Confirm your address"}</div>
      <p style={{ fontSize: ".84rem", lineHeight: 1.6, color: "var(--ff-ink-2)", margin: "0 0 .75rem" }}>
        {current
          ? "Update where your pro should go. They'll see the change straight away."
          : "We only shared your postal code while you were comparing estimates. Now that you've picked your pro, they need the full address to show up — this is the last step before payment."}
      </p>

      {saved.length > 0 && (
        <div style={{ marginBottom: ".75rem" }}>
          <div style={{ fontSize: ".76rem", color: "rgba(var(--ff-muted), .6)", marginBottom: ".4rem" }}>Use a saved address</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: ".4rem" }}>
            {saved.map(r => (
              <button key={r.id} disabled={busy} onClick={() => void save(r.address)}
                style={{ padding: ".45rem .7rem", borderRadius: "8px", border: "1px solid rgba(var(--ff-fg), .16)",
                  background: "rgba(var(--ff-fg), .05)", color: "var(--ff-text)", fontFamily: "inherit",
                  fontSize: ".8rem", cursor: busy ? "default" : "pointer", opacity: busy ? .6 : 1, textAlign: "left" as const }}>
                {r.address}
              </button>
            ))}
          </div>
        </div>
      )}

      <div style={{ marginBottom: ".6rem" }}>
        <AddressAutocomplete
          id="ffc-address-input"
          value={addr}
          onChange={setAddr}
          placeholder="123 Example Street NW, Calgary, AB"
          style={input}
        />
      </div>

      {/* Sits UNDER the field, not above it. Typing is the primary path and the
          shortcut is the alternative — putting it first would imply the field
          is the fallback, and on a desktop (no GPS, IP-derived position) it
          usually is the worse of the two. */}
      <div style={{ marginBottom: ".6rem" }}>
        <button type="button" style={{ ...ghostBtn, opacity: locating ? .6 : 1, cursor: locating ? "default" : "pointer" }}
          disabled={locating} onClick={useMyLocation}>
          <Ic name="map-pin" size={13} />{locating ? "Finding you…" : "Use my current location"}
        </button>
        {locNote && (
          <div style={{ fontSize: ".78rem", color: "rgba(var(--ff-muted), .65)", marginTop: ".4rem", lineHeight: 1.5 }}>
            {locNote}
          </div>
        )}
      </div>

      {err && (
        <div style={{ fontSize: ".82rem", color: "var(--ff-warn)", marginBottom: ".6rem", lineHeight: 1.5 }}>
          <Ic name="alert-triangle" size={13} style={{ marginRight: 4 }} />{err}
        </div>
      )}

      <div style={{ display: "flex", gap: ".5rem", alignItems: "center", flexWrap: "wrap" }}>
        <button style={{ ...primary, opacity: busy ? .6 : 1, cursor: busy ? "default" : "pointer" }}
          disabled={busy} onClick={() => void save(addr)}>
          {busy ? "Saving…" : current ? "Save the new address" : "Confirm this address"}
        </button>
        {current && (
          <button style={linkBtn} onClick={() => { setEditing(false); setErr(null); setLocNote(null); setAddr(""); }}>Cancel</button>
        )}
      </div>

      <div style={{ fontSize: ".76rem", color: "rgba(var(--ff-muted), .55)", marginTop: ".6rem", lineHeight: 1.5 }}>
        Shared only with the pro you hired, never with the others who quoted.
      </div>
    </div>
  );
}
