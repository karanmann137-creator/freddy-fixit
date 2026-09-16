import { Component, type ReactNode } from "react";

/**
 * The app had NO error boundary anywhere in `src/`. React 19 unmounts the whole
 * tree on an uncaught render throw, and `main.tsx` paints `html, body` with
 * `--ff-bg` (navy in dark mode) — so a single bad field rendered as a black,
 * silent, unrecoverable page. That is exactly how a `formatWhen(null)` throw in
 * JobChat took out both dashboards.
 *
 * This is a backstop, not a licence to throw. It exists so one bad row degrades
 * to a screen the user can get out of, instead of a blank page with nothing to
 * report and nowhere to go.
 *
 * ⚠️ THERE IS NO "TRY AGAIN" BUTTON, AND IT MUST NOT COME BACK.
 * The old one was `onClick={() => this.setState({ err: null })}`, which re-renders
 * the *same* children — so for a deterministic render throw they throw again on
 * the same commit and the button visibly does nothing. It is worse than useless
 * for the failure that actually happens here: `App.tsx` `lazy()`-imports every
 * heavy page, **React memoizes a REJECTED lazy promise**, so once a chunk fetch
 * has failed (a tab left open across a Vercel redeploy asks for a hashed
 * filename that no longer exists) it re-throws instantly, forever, no matter how
 * many times state is cleared. A full page load is the only thing that recovers
 * it — which is why this screen asks for a refresh and offers a button that
 * really does `location.reload()`, rather than a control that can never succeed.
 * (Same rule as `canWithdraw` / `canRemoveRequest`: a control that cannot
 * succeed is worse than no control.)
 *
 * ONE SCREEN FOR EVERY ERROR. `App.tsx` mounts exactly one of these, around the
 * whole `<Switch>`, so this is what the user meets whatever broke. The `label`
 * is deliberately NOT in the visible copy — naming the surface made the wording
 * different per failure, and the remedy is identical in every case. It still
 * names the surface in the console, which is what the owner can be walked
 * through over the phone.
 *
 * Deliberately dependency-free and inline-styled with LITERAL colours: the thing
 * that failed may be the theme layer itself, so it cannot rely on `.ffdash`
 * scoped CSS, on `Ic` (a missing glyph there renders blank, not an error), or on
 * any `--ff-*` token resolving sanely. The top padding clears the fixed nav —
 * the previous version was an inline panel (`margin: .75rem 0`, no min-height,
 * no centring) used as a whole-page state, so its text sat clipped behind
 * TopNav with the footer stranded under a navy void.
 */
type Props = {
  children: ReactNode;
  /** Shown instead of the default screen. Use for small embedded surfaces. */
  fallback?: ReactNode;
  /** Names the surface in the console log, e.g. "Messages". */
  label?: string;
  /** Changing this value clears the error — pass the active job/route id. */
  resetKey?: unknown;
};
type State = { err: Error | null };

export default class ErrorBoundary extends Component<Props, State> {
  state: State = { err: null };

  static getDerivedStateFromError(err: Error): State {
    return { err };
  }

  componentDidUpdate(prev: Props) {
    // Switching jobs/routes should give the user a clean slate rather than
    // pinning them on a stale error from the row they navigated away from.
    if (this.state.err && prev.resetKey !== this.props.resetKey) {
      this.setState({ err: null });
    }
  }

  componentDidCatch(err: Error, info: unknown) {
    // No telemetry vendor is wired for exceptions; the console is what the
    // owner can actually be walked through over the phone.
    console.error("[ff] render error in " + (this.props.label || "app"), err, info);
  }

  render() {
    if (!this.state.err) return this.props.children;
    if (this.props.fallback) return this.props.fallback;

    return (
      <div
        role="alert"
        style={{
          minHeight: "58vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: "7rem 1.25rem 4rem",
          boxSizing: "border-box",
        }}
      >
        <div
          style={{
            width: "100%",
            maxWidth: 520,
            textAlign: "center",
            padding: "2rem 1.6rem 1.75rem",
            borderRadius: 18,
            border: "1px solid rgba(234,107,20,0.35)",
            background: "#1a2236",
            boxShadow: "0 18px 48px rgba(0,0,0,0.35)",
            color: "#f0f4ff",
          }}
        >
          <span
            aria-hidden="true"
            style={{
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              width: 52,
              height: 52,
              borderRadius: "50%",
              background: "rgba(234,107,20,0.14)",
              marginBottom: "1rem",
            }}
          >
            <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#ea6b14" strokeWidth="2" strokeLinecap="round">
              <path d="M12 7v6" />
              <path d="M12 17h.01" />
              <circle cx="12" cy="12" r="9" />
            </svg>
          </span>

          <div style={{ fontSize: "1.35rem", fontWeight: 700, marginBottom: ".6rem" }}>
            Something went wrong
          </div>

          <div style={{ fontSize: "1rem", lineHeight: 1.55, opacity: 0.9, marginBottom: "1.4rem" }}>
            Refreshing the page almost always fixes this. Nothing has been lost —
            your request, your messages and any payment are all safe.
          </div>

          <button
            type="button"
            onClick={() => window.location.reload()}
            style={{
              width: "100%",
              maxWidth: 260,
              padding: "0.8rem 1.25rem",
              borderRadius: 12,
              border: "none",
              background: "#ea6b14",
              color: "#fff",
              fontSize: "1rem",
              fontWeight: 700,
              fontFamily: "inherit",
              cursor: "pointer",
              minHeight: 48,
            }}
          >
            Refresh the page
          </button>

          <div style={{ fontSize: ".92rem", lineHeight: 1.5, opacity: 0.65, marginTop: "1.1rem" }}>
            Still stuck after a refresh? Reply to any Freddy email, or write to
            hello@freddyfixit.ca and we&rsquo;ll sort it out.
          </div>
        </div>
      </div>
    );
  }
}
