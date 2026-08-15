import { useEffect, useState } from "react";
import { getConsent, setConsent, CONSENT_EVENT } from "@/lib/analytics";

/**
 * Cookie consent bar.
 *
 * Analytics on this site are OPT-IN: `initAnalytics()` refuses to inject
 * Google Analytics or PostHog until a choice of "granted" is stored, so until
 * someone clicks Accept, no analytics script is downloaded and no analytics
 * cookie exists. This bar is the only thing that records that choice.
 *
 * It re-appears if the choice is cleared from Settings (which fires
 * CONSENT_EVENT with a null detail).
 */
export default function CookieConsent() {
  const [show, setShow] = useState(false);

  useEffect(() => {
    // Decide after mount so a server-rendered / cached shell can't flash the
    // bar at someone who already answered.
    setShow(getConsent() === null);

    const onChange = (e: Event) => {
      const choice = (e as CustomEvent).detail;
      setShow(choice == null);
    };
    window.addEventListener(CONSENT_EVENT, onChange as EventListener);
    return () => window.removeEventListener(CONSENT_EVENT, onChange as EventListener);
  }, []);

  if (!show) return null;

  const choose = (v: "granted" | "denied") => {
    setConsent(v);
    setShow(false);
  };

  const btn: React.CSSProperties = {
    flex: "1 1 auto", padding: ".62rem 1rem", borderRadius: "10px",
    fontFamily: "'DM Sans',sans-serif", fontWeight: 700, fontSize: ".88rem",
    cursor: "pointer", border: "1px solid transparent",
  };

  return (
    <div
      className="ff-cookie"
      role="dialog"
      aria-live="polite"
      aria-label="Cookie choices"
    >
      <p style={{
        fontFamily: "'DM Sans',sans-serif", fontSize: ".85rem", lineHeight: 1.55,
        color: "var(--ff-text)", margin: "0 0 .85rem",
      }}>
        <strong style={{ display: "block", fontSize: ".95rem", marginBottom: ".3rem" }}>
          Can we use analytics cookies?
        </strong>
        They help us see which parts of the site people get stuck on, and include
        session replay that records how pages are used. Nothing is collected until
        you say yes, and you can change your mind anytime in Settings. The cookies
        that keep you signed in are always on.{" "}
        <a href="/privacy-policy" style={{ color: "#ea6b14", textDecoration: "underline" }}>
          Privacy Policy
        </a>
      </p>

      <div style={{ display: "flex", gap: ".55rem", flexWrap: "wrap" }}>
        <button
          onClick={() => choose("granted")}
          style={{ ...btn, background: "#ea6b14", color: "#fff" }}
        >
          Accept
        </button>
        <button
          onClick={() => choose("denied")}
          style={{
            ...btn,
            background: "rgba(var(--ff-fg), .06)",
            border: "1px solid rgba(var(--ff-fg), .16)",
            color: "var(--ff-text)",
            fontWeight: 600,
          }}
        >
          Decline
        </button>
      </div>

      {/* Inline styles can't express media queries, so the position/size rules
          live here. Sits bottom-left so the chat bubble (bottom-right) stays
          tappable; on narrow screens it lifts clear of the bubble. */}
      <style>{`
        .ff-cookie {
          position: fixed;
          left: 1rem;
          bottom: 1rem;
          z-index: 9998;
          width: min(400px, calc(100% - 2rem));
          background: var(--ff-surface);
          border: 1px solid rgba(var(--ff-fg), .14);
          border-radius: 14px;
          padding: 1rem 1.05rem;
          box-shadow: 0 18px 50px rgba(0,0,0,.45);
          animation: ff-cookie-in .28s ease-out both;
        }
        @keyframes ff-cookie-in {
          from { opacity: 0; transform: translateY(14px); }
          to   { opacity: 1; transform: none; }
        }
        @media (max-width: 560px) {
          .ff-cookie { bottom: 5.25rem; }
        }
        @media (prefers-reduced-motion: reduce) {
          .ff-cookie { animation: none; }
        }
      `}</style>
    </div>
  );
}
