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
 *
 * SIZE: this is deliberately about a third of what it used to be — one row
 * instead of a four-line paragraph and two full-width buttons. The old copy
 * explained session replay, the Settings opt-out and sign-in cookies in
 * prose, which is a lot of screen to spend on a bar most people dismiss
 * without reading. What has to survive the cut is the disclosure itself, so
 * the two facts that carry the CASL/PIPA weight are still on the face of it:
 * that session replay is part of what is being asked for, and that nothing
 * runs before consent. The detail moved to the Privacy Policy link, which is
 * where a person actually goes to read it.
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

  return (
    <div
      className="ff-cookie"
      role="dialog"
      aria-live="polite"
      aria-label="Cookie choices"
    >
      <p className="ff-cookie-txt">
        Analytics cookies, including session replay? Nothing runs until you agree.{" "}
        <a href="/privacy-policy">Privacy&nbsp;Policy</a>
      </p>

      <div className="ff-cookie-btns">
        <button className="ff-cookie-yes" onClick={() => choose("granted")}>Accept</button>
        <button className="ff-cookie-no" onClick={() => choose("denied")}>Decline</button>
      </div>

      {/* Inline styles can't express media queries or :hover, so the whole bar
          is styled here. Sits bottom-left so the chat bubble (bottom-right)
          stays tappable; on narrow screens it lifts clear of the bubble and
          the buttons drop below the text rather than squeezing it. */}
      <style>{`
        .ff-cookie {
          position: fixed;
          left: .75rem;
          bottom: .75rem;
          z-index: 9998;
          width: min(420px, calc(100% - 1.5rem));
          display: flex;
          align-items: center;
          gap: .6rem;
          background: var(--ff-surface);
          border: 1px solid var(--ff-hair);
          border-radius: 12px;
          padding: .5rem .55rem .5rem .8rem;
          box-shadow: var(--ff-lift-3);
          animation: ff-cookie-in .28s ease-out both;
        }
        .ff-cookie-txt {
          flex: 1 1 auto;
          min-width: 0;
          margin: 0;
          font-family: 'DM Sans', sans-serif;
          font-size: .73rem;
          line-height: 1.4;
          color: var(--ff-ink-3);
        }
        .ff-cookie-txt a { color: var(--ff-c10); text-decoration: underline; text-underline-offset: 2px; white-space: nowrap; }
        .ff-cookie-btns { flex: 0 0 auto; display: flex; gap: .35rem; }
        .ff-cookie-btns button {
          font-family: 'DM Sans', sans-serif;
          font-size: .78rem;
          padding: .35rem .7rem;
          border-radius: 8px;
          cursor: pointer;
          border: 1px solid transparent;
          transition: filter .18s ease, background .18s ease;
        }
        .ff-cookie-yes { background: var(--ff-accent-500); color: #fff; font-weight: 700; }
        .ff-cookie-yes:hover { filter: brightness(1.06); }
        .ff-cookie-no { background: rgba(var(--ff-fg), .06); border-color: var(--ff-hair); color: var(--ff-ink-2); font-weight: 600; }
        .ff-cookie-no:hover { background: rgba(var(--ff-fg), .11); }
        @keyframes ff-cookie-in {
          from { opacity: 0; transform: translateY(14px); }
          to   { opacity: 1; transform: none; }
        }
        @media (max-width: 560px) {
          .ff-cookie { bottom: 5.25rem; flex-wrap: wrap; }
          .ff-cookie-btns { width: 100%; }
          .ff-cookie-btns button { flex: 1 1 auto; }
        }
        @media (prefers-reduced-motion: reduce) {
          .ff-cookie { animation: none; }
        }
      `}</style>
    </div>
  );
}
