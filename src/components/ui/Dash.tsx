import React from "react";
import { cx } from "./uiStyles";

/**
 * THE DASHBOARD SHELL — the chrome all three dashboards share.
 *
 * WHY IT EXISTS. Client, Contractor and Admin each opened with their own `s`
 * style object, and the three had drifted in every dimension that decides
 * whether they read as one product: the content column was 800 / 900 / 1000px,
 * the card was --ff-r3 at clamp(1rem,4vw,1.5rem) / --ff-r3 at 1.75rem /
 * --ff-r2 at --ff-s5, the card title was Bebas-accent on two and a .95rem
 * weight-500 line on Admin, the tab strip was pill chips on two and an
 * underline bar on Contractor, and the pulse ring was 12px / 10px / absent.
 *
 * None of those differences was ever decided. They are three people solving
 * the same problem three times, which is the thing src/components/ui exists to
 * stop. The values here are Client's, because Client is the stated reference.
 *
 * The CSS is in uiStyles.ts under "the dashboard shell". Read it there — the
 * three rules worth knowing before you touch this file are documented at the
 * declarations rather than here, per the rule that a comment near a value
 * should say WHERE the value lives and not what it is.
 *
 * ── What is NOT here ────────────────────────────────────────────────────
 * The navy header block is <Pass>, the grouped lists are <Group>/<Sheet>/<Row>
 * and the attention list is <AttentionCard>. This file is only the frame
 * around them: the page background, the content column, and the one card for
 * content that genuinely is not a list of rows. The chip strip is CSS only —
 * `.ffd-tabs` / `.ffd-tab` in uiStyles.ts, with no component behind it; the
 * note at the bottom of this file says why.
 *
 * Reaching for <DashCard> where a <Sheet> fits is how v1 became a pile of
 * differently-padded boxes. A list of rows is a Sheet.
 */

/**
 * The page background and the .ffdash scope.
 *
 * ⚠️ The className is load-bearing, not cosmetic. Three separate rule blocks
 * in uiStyles.ts are scoped to .ffdash — the button press, the disabled state
 * and the .ff-pulse ring — so an element outside this wrapper gets none of
 * them, silently. That is how Admin ended up applying .ff-pulse to elements
 * with no animation attached.
 */
export function DashShell({
  children,
  style,
}: {
  children: React.ReactNode;
  style?: React.CSSProperties;
}) {
  return (
    <div className="ffdash" style={style}>
      {children}
    </div>
  );
}

/**
 * The centred content column.
 *
 * `wide` is the ONE documented opt-out from the shared width, and it exists
 * for Admin's list tabs, which render tables of accounts and jobs that
 * genuinely need the room. An opt-out with a stated reason is a different
 * thing from three defaults nobody chose — do not add a second one without
 * writing down why the shared column is wrong for it.
 */
export function DashContent({
  children,
  wide,
  style,
  busy,
  className,
}: {
  children: React.ReactNode;
  wide?: boolean;
  style?: React.CSSProperties;
  /** Sets aria-busy for the loading shells. */
  busy?: boolean;
  className?: string;
}) {
  return (
    <div
      className={cx("ffd-col", wide && "ffd-wide", className)}
      style={style}
      aria-busy={busy || undefined}
    >
      {children}
    </div>
  );
}

/**
 * A card, for content that is not a list of rows.
 *
 * Takes `id` because an attention button has to be able to land on the control
 * it names. Anchors are bare ids, deliberately NOT keyed per job — exactly one
 * card is expanded at a time and the pulse compares the anchor by string, so
 * keying them per job silently breaks the ring. Set it on EVERY render branch
 * including loading, or the scroll target disappears while the data is in
 * flight.
 */
export function DashCard({
  children,
  title,
  id,
  className,
  style,
}: {
  children: React.ReactNode;
  /** Rendered as the Bebas accent caption. Omit for an untitled card. */
  title?: React.ReactNode;
  id?: string;
  className?: string;
  style?: React.CSSProperties;
}) {
  return (
    <div id={id} className={cx("ffd-card", className)} style={{ scrollMarginTop: "5.5rem", ...style }}>
      {title ? <div className="ffd-cardtitle">{title}</div> : null}
      {children}
    </div>
  );
}

/**
 * ── The two components that are NOT here, and why ───────────────────────────
 *
 * A `DashCardTitle` and a `DashTabs` were both written for this file and both
 * DELETED before the first ship, unmounted. Writing that down because the
 * reasons are findings, and because a born-dead export that a docblock vouches
 * for is worse than either alone — the same rule that retires a component in
 * the same pass as its last mount.
 *
 * **DashCardTitle** was redundant on arrival: `DashCard`'s `title` prop is the
 * only way a caption gets the right gap to the body, because the gap belongs
 * to the card, not to the caption. A card that wants the caption without the
 * card is a card that wants `.ffd-cardtitle` from the sheet.
 *
 * **DashTabs** was refused on a SEMANTIC ground, not a cosmetic one, and that
 * refusal is now written at all three of its would-be call sites (Admin's
 * account-role and agent filters, Client's history filter). It rendered
 * `role="tablist"` + `aria-selected`, which announces a switch between
 * SECTIONS OF THE PAGE. All three dashboards switch sections from
 * `DashboardSidebar`; every remaining chip strip narrows ONE list in place, so
 * it is a set of toggles and takes `aria-pressed`. A screen reader told
 * "tab, 2 of 4, selected" about a filter is being told the page changed when
 * it did not.
 *
 * So the chips take **`.ffd-tab` / `.ffd-tab.ffd-on` from the shared sheet**
 * and write their own `<button>`. That is the shared LOOK without the wrong
 * semantics, and it is why `.ffd-tabs` is still in uiStyles.ts with no React
 * component behind it. If a dashboard ever grows a real in-page tablist,
 * DashTabs is the right thing to write — but write it then, with a mount.
 */

export default DashShell;
