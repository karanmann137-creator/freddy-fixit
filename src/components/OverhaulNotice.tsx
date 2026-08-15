import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { usePlatformStatus } from "@/lib/platformStatus";

/**
 * Site-wide "we're rebuilding" strip.
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

  useEffect(() => {
    try { setDismissed(sessionStorage.getItem(DISMISS_KEY) === "1"); } catch { /* private mode */ }
  }, []);

  const quiet = status.mode === "waitlist" || status.mode === "paused";
  const routeHidden = HIDE_ON.some(p => loc === p || loc.startsWith(p + "/"));

  if (!ready || !quiet || dismissed || routeHidden) return null;

  const close = () => {
    setDismissed(true);
    try { sessionStorage.setItem(DISMISS_KEY, "1"); } catch { /* private mode */ }
  };

  return (
    <div className="ff-ovl" role="status" aria-live="polite">
      <span className="ff-ovl-dot" aria-hidden="true" />
      <p className="ff-ovl-text">
        <strong>{status.notice.headline}.</strong>{" "}
        <span className="ff-ovl-body">{status.notice.body}</span>
      </p>
      <button onClick={close} aria-label="Dismiss" className="ff-ovl-x">×</button>

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
        @media (max-width: 640px) {
          .ff-ovl { padding: .55rem 3.6rem .55rem .8rem; }
          .ff-ovl-text { font-size: .78rem; }
          .ff-ovl-body { display: none; }
        }
        @media (prefers-reduced-motion: reduce) {
          .ff-ovl-dot { animation: none; }
        }
      `}</style>
    </div>
  );
}
