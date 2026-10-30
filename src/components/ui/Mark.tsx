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
