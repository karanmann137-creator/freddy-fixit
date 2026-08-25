import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";

/**
 * Skeleton loaders.
 *
 * The shimmer itself is one rule in main.tsx (`.ff-sk`) so it is token-driven
 * and themes for free. This file is only the shapes and the two timing rules
 * that make skeletons safe to use:
 *
 *  1. NOTHING SHOWS FOR THE FIRST 120ms (`useDelayed`). A skeleton that
 *     flashes for 80ms and vanishes reads as a glitch, not as polish -- it is
 *     the single thing that makes a fast app feel cheap. Below the threshold
 *     the user sees an empty box for a frame or two and perceives it as
 *     instant, which is the truth.
 *
 *  2. A SKELETON IS NEVER A RESTING STATE (`Stalled`). The honesty rule in
 *     CLAUDE.md is that a failed read must never look like an empty one, and
 *     an eternal shimmer is exactly that failure wearing a nicer coat -- worse
 *     than the old spinner, because it looks like data that is nearly here.
 *     `Stalled` renders a plain-English way out after a timeout. It only ever
 *     ADDS a line to the DOM; it never touches the caller's state, so it
 *     cannot interfere with a fetch that is simply slow.
 */

/** One shimmering block. Width takes a string ("60%") or a number of px. */
export function Sk({ w, h = 12, r, circle, style }: {
  w?: string | number;
  h?: string | number;
  r?: number;
  circle?: boolean;
  style?: CSSProperties;
}) {
  return (
    <div
      aria-hidden="true"
      className={"ff-sk" + (circle ? " ff-sk-circle" : "")}
      style={{
        width: w ?? "100%",
        height: h,
        flexShrink: 0,
        ...(r !== undefined ? { borderRadius: r } : null),
        ...style,
      }}
    />
  );
}

/** A stack of text lines. The last one is short so it reads as a paragraph. */
export function SkText({ lines = 3, w = "100%", gap = 8 }: {
  lines?: number;
  w?: string | number;
  gap?: number;
}) {
  const widths = ["100%", "92%", "78%", "85%", "70%"];
  return (
    <div style={{ display: "grid", gap, width: w }}>
      {Array.from({ length: lines }).map((_, i) => (
        <Sk key={i} w={i === lines - 1 ? "62%" : widths[i % widths.length]} h={10} />
      ))}
    </div>
  );
}

/**
 * A card-shaped block, matching the card chrome the dashboards use so the
 * real card lands in the same place rather than shifting the page under the
 * reader. `--ff-card-border` is the same token every real card uses.
 */
export function SkCard({ children, style }: { children?: ReactNode; style?: CSSProperties }) {
  return (
    <div
      aria-hidden="true"
      style={{
        background: "var(--ff-surface)",
        border: "1px solid var(--ff-card-border)",
        borderRadius: 12,
        padding: "clamp(0.9rem, 3vw, 1.25rem)",
        ...style,
      }}
    >
      {children ?? (
        <>
          <Sk w="46%" h={13} />
          <div style={{ height: 10 }} />
          <SkText lines={2} />
        </>
      )}
    </div>
  );
}

/** A row with an avatar and two lines -- messages, bids, pros, job lists. */
export function SkRow({ avatar = true }: { avatar?: boolean }) {
  return (
    <div aria-hidden="true" style={{ display: "flex", alignItems: "center", gap: 12, padding: "0.7rem 0" }}>
      {avatar && <Sk w={40} h={40} circle />}
      <div style={{ flex: 1, minWidth: 0, display: "grid", gap: 8 }}>
        <Sk w="38%" h={11} />
        <Sk w="66%" h={9} />
      </div>
    </div>
  );
}

/**
 * True only once `ms` has elapsed. Callers render nothing until then, so a
 * load that resolves quickly never paints a skeleton at all.
 */
export function useDelayed(ms = 120): boolean {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setReady(true), ms);
    return () => clearTimeout(t);
  }, [ms]);
  return ready;
}

/**
 * Renders `children` only after `after` ms. Used to put an escape hatch under
 * a skeleton that has been shimmering long enough to mean something is wrong.
 */
export function Stalled({ after = 12000, children }: { after?: number; children: ReactNode }) {
  const [show, setShow] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setShow(true), after);
    return () => clearTimeout(t);
  }, [after]);
  if (!show) return null;
  return <div className="ff-fade">{children}</div>;
}

/** The standard "this has taken too long" way out, used under every shell. */
export function StalledNotice({ after = 12000 }: { after?: number }) {
  return (
    <Stalled after={after}>
      <div style={{ textAlign: "center", padding: "1.5rem 1rem", fontSize: ".88rem", color: "rgba(var(--ff-muted), .7)" }}>
        This is taking longer than usual.{" "}
        <button
          onClick={() => window.location.reload()}
          style={{ background: "none", border: "none", padding: 0, color: "#ea6b14", font: "inherit", fontWeight: 600, cursor: "pointer" }}
        >
          Reload the page
        </button>
      </div>
    </Stalled>
  );
}

/**
 * The rail width the real sidebar is about to render at.
 *
 * DashboardSidebar decides this from exactly two inputs -- `innerWidth < 780`
 * and the `ff_sidebar_collapsed` preference -- so the shell reads the same two
 * and lands on the same number. Guessing instead (a fixed 64px rail, say)
 * would make the whole page shunt sideways the moment real data arrived, which
 * is the specific jolt a skeleton exists to prevent.
 */
function railWidth(): string {
  if (typeof window === "undefined") return "232px";
  if (window.innerWidth < 780) return "56px";
  let collapsed = false;
  try { collapsed = window.localStorage.getItem("ff_sidebar_collapsed") === "1"; } catch { /* private mode */ }
  return collapsed ? "64px" : "232px";
}

/**
 * The loading shell for the client and contractor dashboards.
 *
 * It mirrors the real chrome: the 3.75rem spacer under the fixed nav, the
 * sticky sidebar rail, the header strip with a greeting and two buttons, and
 * the 800px content column. Because those four are in the right places, the
 * real dashboard replaces it without moving anything -- the reader's eye is
 * already where the first card is going to be.
 *
 * `rows` is the number of card placeholders. Three is roughly what both
 * dashboards open with once "Needs your attention" has rendered.
 */
export function DashboardSkeleton({ rows = 3 }: { rows?: number }) {
  // The delay lives HERE, not at the call site. Every consumer renders this
  // from inside an `if (loading)` early return, and a hook above an early
  // return is a hook-order break waiting to happen the first time someone
  // reorders the branches.
  const ready = useDelayed(120);
  const w = railWidth();
  if (!ready) return null;
  return (
    <div aria-busy="true" aria-live="polite">
      <span className="ff-sr-only">Loading your dashboard</span>
      <div style={{ height: "3.75rem" }} />
      <div style={{ display: "flex", alignItems: "flex-start" }}>
        <div
          aria-hidden="true"
          style={{
            width: w, flex: "0 0 " + w, height: "calc(100vh - 3.75rem)",
            position: "sticky", top: "3.75rem", alignSelf: "flex-start",
            borderRight: "1px solid rgba(var(--ff-fg), .08)", background: "var(--ff-card-bg)",
            padding: w === "232px" ? "1.1rem .7rem" : "1.1rem .4rem",
            display: "grid", gap: 10, alignContent: "start",
          }}
        >
          {Array.from({ length: 7 }).map((_, i) => (
            <div key={i} style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <Sk w={22} h={22} r={6} />
              {w === "232px" && <Sk w="62%" h={10} />}
            </div>
          ))}
        </div>

        <div style={{ flex: 1, minWidth: 0 }}>
          <div
            aria-hidden="true"
            style={{
              background: "rgba(var(--ff-fg), .03)", borderBottom: "1px solid rgba(var(--ff-fg), .07)",
              padding: ".75rem 1.5rem", display: "flex", justifyContent: "space-between",
              alignItems: "center", flexWrap: "wrap", gap: ".75rem",
            }}
          >
            <div style={{ display: "grid", gap: 8 }}>
              <Sk w={180} h={18} />
              <Sk w={230} h={10} />
            </div>
            <div style={{ display: "flex", gap: ".75rem" }}>
              <Sk w={104} h={34} r={8} />
              <Sk w={128} h={34} r={8} />
            </div>
          </div>

          <div style={{ maxWidth: "800px", margin: "0 auto", padding: "clamp(1rem, 4vw, 1.5rem)" }}>
            <div style={{ display: "grid", gap: "1rem" }}>
              {Array.from({ length: rows }).map((_, i) => <SkCard key={i} />)}
            </div>
            <StalledNotice />
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * The shell behind a lazily-loaded route chunk and the auth gate. There is no
 * way to know what page is coming, so this is deliberately generic: a title, a
 * line of body copy and three blocks, centred in the same column widths the
 * content pages use.
 */
export function PageSkeleton() {
  const ready = useDelayed(120);
  if (!ready) return null;
  return (
    <div aria-busy="true" style={{ minHeight: "100vh", background: "var(--ff-bg)" }}>
      <span className="ff-sr-only">Loading</span>
      <div style={{ height: "3.75rem" }} />
      <div style={{ maxWidth: "860px", margin: "0 auto", padding: "clamp(1.5rem, 5vw, 3rem) clamp(1rem, 4vw, 1.5rem)" }}>
        <Sk w="52%" h={30} />
        <div style={{ height: 18 }} />
        <SkText lines={3} />
        <div style={{ height: 32 }} />
        <div style={{ display: "grid", gap: "1rem" }}>
          <SkCard />
          <SkCard />
        </div>
        <StalledNotice />
      </div>
    </div>
  );
}

/**
 * A class name that replays the enter animation each time `dep` changes.
 *
 * Used for dashboard tab switches. It alternates between two classes naming
 * two identical keyframe sets, because swapping the animation-NAME is the only
 * thing that restarts a CSS animation on an element that is not remounting.
 *
 * Not `key={tab}`: that remounts the whole content column on every click,
 * re-running mount effects and re-showing modals the reader already dismissed.
 * Nothing here unmounts, so tab switching keeps exactly the behaviour it had.
 */
export function useEnterAnim(dep: unknown): string {
  const [flip, setFlip] = useState(false);
  const first = useRef(true);
  useEffect(() => {
    if (first.current) { first.current = false; return; }
    setFlip(f => !f);
  }, [dep]);
  return flip ? "ff-enter-b" : "ff-enter";
}
