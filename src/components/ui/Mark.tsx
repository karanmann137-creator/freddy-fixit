import React from "react";

/**
 * The Freddy Fix It mark.
 *
 * This exists because the first dashboard concept put a generic wrench glyph
 * where the logo belongs, and a wrench is not the brand — the mark is the
 * rounded navy tile, the orange octagon, and the house with its orange door.
 * One component so that can never drift again.
 *
 * The viewBox is deliberately 80x80 and must stay that way. main.tsx applies a
 * hand-drawn displacement filter to `svg[viewBox="0 0 24 24"]`, which is every
 * icon we own; a brand mark that wobbles reads as a rendering bug, so the mark
 * sits outside that selector by virtue of its size. Do not "normalise" it to
 * 24x24.
 *
 * The colours are literals, not tokens, for the same reason the Google "G" is:
 * a logo is a fixed asset. It must look identical on the navy pass, on an
 * off-white light-mode card, and in an email.
 *
 * ⚠️ SO THE THREE ORANGE LITERALS BELOW ARE A PERMANENT, INTENTIONAL EXCEPTION TO
 * THE ORANGE RATCHET (tools/check_ux.py), NOT A MISS. They are three of the ~20
 * that remain, and `tools/migrate_orange.py` will keep printing them every run.
 * Leave them. Two independent reasons, either one sufficient:
 *   * A mark whose accent shifts with the theme is a different logo in light mode.
 *     --ff-c10 is #ea6b14 dark but #d65f10 light, which is exactly the swap every
 *     other site wants and this one must not have.
 *   * `fill="#1a2236"` and `stroke="#f0f4ff"` here are literals too and have no
 *     token to become — navy and ink are the mark's own colours, not the page's.
 *     Tokenising only the orange would leave the mark half-themed, which is worse
 *     than either state: in light mode you would get a #d65f10 octagon on a navy
 *     tile that stayed navy.
 * The nearly-identical inline copy in Home.tsx's "Freddy Verified" pill DID
 * tokenise, and the distinction is the point: that one is a 30px glyph inside a
 * fully-tokenised pill, not an asset. See the comment there.
 */
export function Mark({ size = 34, style }: { size?: number; style?: React.CSSProperties }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 80 80"
      aria-hidden="true"
      focusable="false"
      style={{ display: "block", borderRadius: "22%", flex: "0 0 auto", ...style }}
    >
      <rect width="80" height="80" rx="18" fill="#1a2236" />
      <polygon
        points="65.9,50.7 50.7,65.9 29.3,65.9 14.1,50.7 14.1,29.3 29.3,14.1 50.7,14.1 65.9,29.3"
        fill="rgba(234,107,20,0.14)"
        stroke="#ea6b14"
        strokeWidth="3"
      />
      <path
        d="M28 54 L28 38 L40 28 L52 38 L52 54 Z"
        fill="none"
        stroke="#f0f4ff"
        strokeWidth="3.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M36 54 L36 43 L44 43 L44 54"
        fill="none"
        stroke="#ea6b14"
        strokeWidth="3.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export default Mark;
