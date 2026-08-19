import { useEffect, useRef, useState } from "react";
import { useLocation } from "wouter";
import { usePlatformStatus } from "@/lib/platformStatus";
import { MdBody } from "@/lib/blogDb";
import WaitlistForm from "@/components/WaitlistForm";

/**
 * Site-wide "we're rebuilding" strip, and the detail panel behind it.
 *
 * Shows only while `platform_status().mode` is `waitlist` or `paused`, so when
 * the marketplace is open this component renders nothing and costs one cached
 * RPC per session.
 *
 * Placement: fixed to the BOTTOM, full width, z-index 940 — deliberately below
 * FinishSignupBanner (950), which is a more urgent, personal nag. The chat
 * bubble sits bottom-right at 9999, so the strip reserves room on its right so
 * text never runs underneath it.
 *
 * Dismissal is per-tab (sessionStorage), not permanent: an overhaul is
 * temporary and someone who returns tomorrow should be told again.
 *
 * ── The detail panel ───────────────────────────────────────────────────────
 * A closed sign with no reason on it reads as "this business died". The strip
 * is therefore pressable and opens `notice.details` — why we're paused, what is
 * actually being improved, and what happens next — ending in the waitlist form,
 * because someone who just read all of that is the single most likely person on
 * the site to leave their email.
 *
 * The copy is markdown in the DB notice blob, rendered by the SAME `MdBody` the
 * blog and newsletter use, so there is one set of formatting rules on the
 * platform rather than two. It is editable from the admin Platform tab with no
 * deploy. If the owner clears it, `hasDetails` goes false and this degrades
 * cleanly back to the plain, unpressable strip it used to be.
 */

const DISMISS_KEY = "ff_overhaul_dismissed";

// Onboarding and the waitlist pages carry their own, louder version of this
// message inline, so the strip would just be noise there.
const HIDE_ON = [
  "/client-onboarding",
  "/contractor-onboarding",
  "/client-success",
  "/contractor-success",
  "/login",
  "/update-password",
  "/auth/callback",
];

export default function OverhaulNotice() {
  const [loc] = useLocation();
  const { status, ready } = usePlatformStatus();
  const [dismissed, setDismissed] = useState(false);
  const [open, setOpen] = useState(false);
  const closeRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    try { setDismissed(sessionStorage.getItem(DISMISS_KEY) === "1"); } catch { /* private mode */ }
  }, []);

  // Escape closes. Registered only while open so this isn't a permanent global
  // key listener on every page of the site.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    window.addEventListener("keydown", onKey);
    // Move focus into the panel so a keyboard or screen-reader user isn't left
    // behind on the strip reading a dialog they can't reach.
    closeRef.current?.focus();
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  // Navigating away closes the panel — otherwise a link inside the copy leaves
  // an orphaned overlay covering the page it just went to.
  useEffect(() => { setOpen(false); }, [loc]);

  const quiet = status.mode === "waitlist" || status.mode === "paused";
  const routeHidden = HIDE_ON.some(p => loc === p || loc.startsWith(p + "/"));

  if (!ready || !quiet || dismissed || routeHidden) return null;

  const details = (status.notice.details || "").trim();
  const hasDetails = details.length > 0;

  const close = () => {
    setDismissed(true);
    try { sessionStorage.setItem(DISMISS_KEY, "1"); } catch { /* private mode */ }
  };

  // The headline already ends in a full stop when spoken aloud, so the strip
  // adds one. The panel title must NOT, or it renders "under construction.."
  const headline = status.notice.headline.replace(/\.\s*$/, "");

  return (
    <>
      <div className="ff-ovl" role="status" aria-live="polite">
        <span className="ff-ovl-dot" aria-hidden="true" />

        {/* Pressable only when there is something to open. A button that opens
            nothing is worse than no button. */}
        {hasDetails ? (
          <button
            type="button"
            className="ff-ovl-text ff-ovl-btn"
            onClick={() => setOpen(true)}
            aria-haspopup="dialog"
            aria-expanded={open}
          >
            <strong>{headline}.</strong>{" "}
            <span className="ff-ovl-body">{status.notice.body}</span>{" "}
            <span className="ff-ovl-more">Why? What we're fixing&nbsp;&rarr;</span>
          </button>
        ) : (
          <p className="ff-ovl-text">
            <strong>{headline}.</strong>{" "}
            <span className="ff-ovl-body">{status.notice.body}</span>
          </p>
        )}

        <button onClick={close} aria-label="Dismiss" className="ff-ovl-x">&times;</button>
      </div>

      {open && (
        <div
          className="ff-ovlp-back"
          onClick={() => setOpen(false)}
          role="dialog"
          aria-modal="true"
          aria-labelledby="ff-ovlp-title"
        >
          {/* Clicks inside must not fall through to the backdrop's close — a
              client half-way through typing their email into the form would
              otherwise lose it to a stray click on the padding. */}
          <div className="ff-ovlp" onClick={e => e.stopPropagation()}>
            <div className="ff-ovlp-head">
              <h2 className="ff-ovlp-title" id="ff-ovlp-title">{headline}</h2>
              <button
                type="button"
                ref={closeRef}
                className="ff-ovlp-x"
                onClick={() => setOpen(false)}
                aria-label="Close"
              >&times;</button>
            </div>

            <div className="ff-ovlp-body">
              <MdBody md={details} />
            </div>

            <div className="ff-ovlp-form">
              <WaitlistForm source="overhaul_panel" hideIntro bare />
            </div>
          </div>
        </div>
      )}

      {/* Inline styles can't express media queries, so the responsive rules live
          here. Right padding keeps the text clear of the chat bubble. */}
      <style>{`
        .ff-ovl {
          position: fixed;
          left: 0; right: 0; bottom: 0;
          z-index: 940;
          display: flex;
          align-items: center;
          gap: .6rem;
          padding: .6rem 4.5rem .6rem 1rem;
          background: linear-gradient(90deg, rgba(234,107,20,.16), rgba(234,107,20,.08));
          border-top: 1px solid rgba(234,107,20,.35);
          backdrop-filter: blur(6px);
          font-family: 'DM Sans', sans-serif;
          color: var(--ff-text);
        }
        .ff-ovl-dot {
          flex: 0 0 auto;
          width: 8px; height: 8px; border-radius: 50%;
          background: #ea6b14;
          box-shadow: 0 0 0 0 rgba(234,107,20,.55);
          animation: ff-ovl-pulse 2.4s ease-out infinite;
        }
        .ff-ovl-text {
          margin: 0;
          flex: 1 1 auto;
          min-width: 0;
          font-size: .84rem;
          line-height: 1.45;
        }
        .ff-ovl-btn {
          background: none;
          border: none;
          padding: 0;
          text-align: left;
          font-family: inherit;
          color: inherit;
          cursor: pointer;
        }
        .ff-ovl-btn:hover .ff-ovl-more,
        .ff-ovl-btn:focus-visible .ff-ovl-more { border-bottom-color: currentColor; }
        .ff-ovl-more {
          color: #ea6b14;
          font-weight: 700;
          white-space: nowrap;
          border-bottom: 1px solid transparent;
        }
        .ff-ovl-x {
          flex: 0 0 auto;
          background: none; border: none;
          color: rgb(var(--ff-muted));
          font-size: 1.35rem; line-height: 1;
          cursor: pointer; font-family: inherit;
          padding: 0 .2rem;
        }
        @keyframes ff-ovl-pulse {
          0%   { box-shadow: 0 0 0 0 rgba(234,107,20,.55); }
          70%  { box-shadow: 0 0 0 8px rgba(234,107,20,0); }
          100% { box-shadow: 0 0 0 0 rgba(234,107,20,0); }
        }

        /* ── Detail panel ─────────────────────────────────────────────────── */
        /* Above the chat bubble (9999) on purpose: a floating bubble sitting on
           top of a modal looks like a rendering bug. */
        .ff-ovlp-back {
          position: fixed;
          inset: 0;
          z-index: 10000;
          background: rgba(10,14,24,.72);
          backdrop-filter: blur(3px);
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 1.25rem;
          overflow-y: auto;
          animation: ff-ovlp-fade .18s ease-out;
        }
        .ff-ovlp {
          width: 100%;
          max-width: 620px;
          /* The page behind is NOT scroll-locked (setting overflow on body
             breaks position:sticky elsewhere on the site), so the panel scrolls
             internally and caps its own height instead. */
          max-height: calc(100vh - 2.5rem);
          overflow-y: auto;
          background: #151d2e;
          border: 1px solid rgba(234,107,20,.3);
          border-radius: 18px;
          box-shadow: 0 24px 60px rgba(0,0,0,.5);
          font-family: 'DM Sans', sans-serif;
          color: var(--ff-text);
          animation: ff-ovlp-rise .22s cubic-bezier(.2,.9,.3,1);
        }
        .ff-ovlp-head {
          display: flex;
          align-items: flex-start;
          gap: .75rem;
          padding: 1.4rem 1.5rem .25rem;
        }
        .ff-ovlp-title {
          flex: 1 1 auto;
          min-width: 0;
          margin: 0;
          font-family: 'Bebas Neue', sans-serif;
          font-size: 1.9rem;
          letter-spacing: .02em;
          line-height: 1.1;
        }
        .ff-ovlp-x {
          flex: 0 0 auto;
          background: none; border: none;
          color: rgb(var(--ff-muted));
          font-size: 1.7rem; line-height: 1;
          cursor: pointer; font-family: inherit;
          padding: 0 .2rem;
        }
        .ff-ovlp-body { padding: 0 1.5rem .4rem; }
        .ff-ovlp-body h2 {
          font-family: 'Bebas Neue', sans-serif;
          font-size: 1.15rem;
          letter-spacing: .06em;
          text-transform: uppercase;
          color: #ea6b14;
          margin: 1.4rem 0 .5rem;
        }
        .ff-ovlp-body p {
          font-size: .92rem;
          line-height: 1.65;
          color: rgb(var(--ff-muted));
          margin: 0 0 .8rem;
        }
        .ff-ovlp-body ul { margin: 0 0 .9rem; padding-left: 1.1rem; }
        .ff-ovlp-body li {
          font-size: .92rem;
          line-height: 1.6;
          color: rgb(var(--ff-muted));
          margin-bottom: .55rem;
        }
        .ff-ovlp-body strong { color: var(--ff-text); }
        .ff-ovlp-form {
          padding: 1.1rem 1.5rem 1.5rem;
          margin-top: .4rem;
          border-top: 1px solid rgba(var(--ff-fg), .1);
        }

        @keyframes ff-ovlp-fade { from { opacity: 0; } to { opacity: 1; } }
        @keyframes ff-ovlp-rise {
          from { opacity: 0; transform: translateY(14px); }
          to   { opacity: 1; transform: none; }
        }

        @media (max-width: 640px) {
          .ff-ovl { padding: .55rem 3.6rem .55rem .8rem; }
          .ff-ovl-text { font-size: .78rem; }
          /* The long body is hidden on small screens, but the "why?" prompt is
             the whole point of the strip there — it stays. */
          .ff-ovl-body { display: none; }
          .ff-ovlp-back { padding: .75rem; align-items: flex-start; }
          .ff-ovlp { max-height: calc(100vh - 1.5rem); }
          .ff-ovlp-head { padding: 1.1rem 1.15rem .25rem; }
          .ff-ovlp-title { font-size: 1.6rem; }
          .ff-ovlp-body { padding: 0 1.15rem .4rem; }
          .ff-ovlp-form { padding: 1rem 1.15rem 1.25rem; }
        }
        @media (prefers-reduced-motion: reduce) {
          .ff-ovl-dot { animation: none; }
          .ff-ovlp-back, .ff-ovlp { animation: none; }
        }
      `}</style>
    </>
  );
}
