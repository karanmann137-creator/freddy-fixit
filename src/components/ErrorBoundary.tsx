import { Component, type ReactNode } from "react";

/**
 * The app had NO error boundary anywhere in `src/`. React 19 unmounts the whole
 * tree on an uncaught render throw, and `main.tsx` paints `html, body` with
 * `--ff-bg` (navy in dark mode) — so a single bad field rendered as a black,
 * silent, unrecoverable page. That is exactly how a `formatWhen(null)` throw in
 * JobChat took out both dashboards.
 *
 * This is a backstop, not a licence to throw. It exists so one bad row degrades
 * to a panel the user can retry out of, instead of a blank screen with nothing
 * to report and nowhere to go.
 *
 * Deliberately dependency-free and inline-styled: it has to render correctly
 * even when the failure is in the theme layer, so it cannot rely on `.ffdash`
 * scoped CSS or on any token resolving sanely.
 */
type Props = {
  children: ReactNode;
  /** Shown instead of the default panel. Use for small embedded surfaces. */
  fallback?: ReactNode;
  /** Names the surface in the message, e.g. "Messages". */
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

    const what = this.props.label ? this.props.label.toLowerCase() : "this section";
    return (
      <div
        role="alert"
        style={{
          padding: "1.25rem",
          margin: "0.75rem 0",
          borderRadius: 14,
          border: "1px solid rgba(234,107,20,0.45)",
          background: "rgba(234,107,20,0.08)",
          color: "#f0f4ff",
          maxWidth: "100%",
        }}
      >
        <div style={{ fontWeight: 700, marginBottom: 6 }}>
          Something went wrong loading {what}.
        </div>
        <div style={{ fontSize: "0.92rem", opacity: 0.85, marginBottom: 12 }}>
          Nothing has been lost — your job, messages and any payment are safe. Try
          again, and if it keeps happening reply to any Freddy email and we'll fix it.
        </div>
        <button
          type="button"
          onClick={() => this.setState({ err: null })}
          style={{
            padding: "0.6rem 1.1rem",
            borderRadius: 10,
            border: "none",
            background: "#ea6b14",
            color: "#fff",
            fontWeight: 700,
            cursor: "pointer",
            minHeight: 44,
          }}
        >
          Try again
        </button>
      </div>
    );
  }
}
