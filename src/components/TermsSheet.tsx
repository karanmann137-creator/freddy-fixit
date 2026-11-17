import { useEffect, useRef, useState } from "react";
import { acceptTerms, termsSheetMounted, TERMS_GATE_EVENT } from "@/lib/terms";
import { ensureUiStyles } from "./ui/uiStyles";

// TermsSheet — the asking half of the terms gate. `src/lib/terms.ts` is the
// deciding half and carries the reasoning; read its header first.
//
// MOUNTED EXACTLY ONCE, IN App.tsx. It registers itself with
// `termsSheetMounted(true)` so `ensureTermsAccepted()` knows somebody is
// listening; with nothing mounted that gate returns true and the action
// proceeds, so a dropped mount is SILENT. The mount is guarded in
// `tools/check_mounts.py` for exactly that reason.
//
// ⚠️ THIS SHEET IS BLOCKING, SO IT HAS NO SCRIM DISMISS AND NO ESCAPE DISMISS.
// Every other modal on the platform has both, and copying one of them here
// would be wrong: a stray tap outside a sheet the person did not ask for would
// silently abandon the bid/payment/signature they were part-way through, with
// no explanation. The way out is the "Not now" BUTTON, which resolves false and
// lets the caller abandon the action quietly — the person has seen the sheet, so
// an error message on top of it would be noise.
//
// WHY THE DATE IS SPLIT RATHER THAN PARSED. `version` is a plain date string
// like "2026-11-16". `new Date("2026-11-16")` is parsed as UTC midnight, which
// renders as Nov 15 in Calgary — a published-on date that is off by a day in the
// one piece of text whose entire job is to be the evidentiary record.

const MONTHS = ["January","February","March","April","May","June","July","August","September","October","November","December"];

function prettyVersion(v: string | null): string | null {
  if (!v) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v);
  if (!m) return v;
  const mon = MONTHS[Number(m[2]) - 1];
  if (!mon) return v;
  return mon + " " + String(Number(m[3])) + ", " + m[1];
}

type Pending = { surface: string; version: string | null; resolve: (ok: boolean) => void };

export default function TermsSheet() {
  ensureUiStyles();
  const [pending, setPending] = useState<Pending | null>(null);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const acceptRef = useRef<HTMLButtonElement | null>(null);

  // One effect, one registration. `pending` is held in a ref-free closure via
  // the functional setState below, so this never needs to re-run — a re-run
  // would unregister and re-register the mount mid-flight.
  useEffect(() => {
    termsSheetMounted(true);
    const onEvt = (e: Event) => {
      const d = (e as CustomEvent).detail as Pending | undefined;
      if (!d || typeof d.resolve !== "function") return;
      setPending(prev => {
        // A second consequential action fired while the sheet was already open.
        // Resolve the newcomer false immediately rather than queueing it: the
        // person is looking at the first sheet, and swapping its contents under
        // them would accept for an action they can no longer see.
        if (prev) { d.resolve(false); return prev; }
        return d;
      });
    };
    window.addEventListener(TERMS_GATE_EVENT, onEvt as EventListener);
    return () => {
      window.removeEventListener(TERMS_GATE_EVENT, onEvt as EventListener);
      termsSheetMounted(false);
    };
  }, []);

  useEffect(() => { if (pending) acceptRef.current?.focus(); }, [pending]);

  if (!pending) return null;

  const settle = (ok: boolean) => {
    const r = pending.resolve;
    setPending(null);
    setBusy(false);
    setFailed(false);
    r(ok);
  };

  const onAccept = async () => {
    setBusy(true);
    setFailed(false);
    const ok = await acceptTerms(pending.surface);
    if (!ok) {
      // The write is the only thing this sheet exists to produce, so an
      // unconfirmed write is never reported as an acceptance. Stay open and
      // offer the button again — this is the one refusal a refresh can clear.
      setBusy(false);
      setFailed(true);
      return;
    }
    settle(true);
  };

  const published = prettyVersion(pending.version);

  return (
    <div className="ffu-scrim">
      <div
        className="ffu-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="ff-terms-title"
        aria-describedby="ff-terms-msg"
      >
        <span className="ffu-grab" aria-hidden="true" />

        <div id="ff-terms-title" style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: "1.5rem", letterSpacing: ".04em", marginBottom: "var(--ff-s3)" }}>
          We&rsquo;ve updated our terms
        </div>

        <p id="ff-terms-msg" style={{ fontSize: ".92rem", lineHeight: 1.6, color: "rgba(var(--ff-muted), .9)", margin: "0 0 var(--ff-s3)" }}>
          {published
            ? "Our User Agreement and Privacy Policy changed on " + published + ". The main change: we now list every outside service we use to run Freddy Fix It and what each one sees."
            : "Our User Agreement and Privacy Policy have changed. The main change: we now list every outside service we use to run Freddy Fix It and what each one sees."}
        </p>
        <p style={{ fontSize: ".92rem", lineHeight: 1.6, color: "rgba(var(--ff-muted), .9)", margin: "0 0 var(--ff-s4)" }}>
          Please accept to continue.
        </p>

        <div style={{ display: "flex", flexWrap: "wrap", gap: "var(--ff-s2) var(--ff-s4)", marginBottom: "var(--ff-s5)" }}>
          <a href="/user-agreement" target="_blank" rel="noopener noreferrer" style={{ fontSize: ".85rem", color: "var(--ff-accent-500)", textDecoration: "underline" }}>
            Read the User Agreement
          </a>
          <a href="/privacy-policy" target="_blank" rel="noopener noreferrer" style={{ fontSize: ".85rem", color: "var(--ff-accent-500)", textDecoration: "underline" }}>
            Read the Privacy Policy
          </a>
        </div>

        {failed && (
          <p role="alert" style={{ fontSize: ".85rem", lineHeight: 1.5, color: "var(--ff-danger)", margin: "0 0 var(--ff-s4)" }}>
            We couldn&rsquo;t record that just now. Check your connection and try again.
          </p>
        )}

        <div className="ffu-btnrow">
          <button className="ffu-btn ffu-sec" onClick={() => settle(false)} disabled={busy}>
            Not now
          </button>
          <button ref={acceptRef} className="ffu-btn ffu-pri" onClick={onAccept} disabled={busy}>
            {busy ? "Saving…" : failed ? "Try again" : "Accept and continue"}
          </button>
        </div>
      </div>
    </div>
  );
}
