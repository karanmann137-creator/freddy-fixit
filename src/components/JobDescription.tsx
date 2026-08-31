import { useLayoutEffect, useRef, useState } from "react";
import { Ic } from "@/components/Ic";
import { tidyDescription } from "@/lib/jobText";

// A client's job description, tidied and collapsed to a few lines with a
// Read more / Show less toggle.
//
// Two problems it solves at once. The text was rendered raw in a plain <div>,
// so `composedDescription()`'s blank-line-separated parts collapsed into one
// run-on wall — see `tidyDescription`, which restores the paragraphs and
// normalises spacing/case WITHOUT rewriting a word. And a long description
// pushed the Bids block and the bid button far below the fold on a phone, so
// the one thing a contractor opened the card to do was the hardest to reach.
//
// The toggle is measured, not assumed: `-webkit-line-clamp` is applied first,
// then we compare scrollHeight to clientHeight and only render the button if
// the text is ACTUALLY clipped. A "Read more" that expands to reveal nothing is
// worse than no button, and line count depends on the container width, so this
// cannot be decided from character length.
export default function JobDescription({
  text, lines = 4, size = ".85rem", color = "rgba(var(--ff-muted), .65)",
}: {
  text: string | null | undefined;
  lines?: number;
  size?: string;
  color?: string;
}) {
  const paras = tidyDescription(text);
  const [open, setOpen] = useState(false);
  const [clipped, setClipped] = useState(false);
  const boxRef = useRef<HTMLDivElement | null>(null);

  // useLayoutEffect so the measurement happens before paint — with useEffect the
  // button flashes in on a description that turns out to fit.
  useLayoutEffect(() => {
    const el = boxRef.current;
    if (!el) return;
    const measure = () => setClipped(el.scrollHeight > el.clientHeight + 1);
    measure();
    // Re-measure on resize: a rotation or a narrowing window changes how many
    // lines the same text takes, so a description that fits in landscape can
    // clip in portrait.
    if (typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [text, lines, open]);

  if (!paras.length) return null;

  const clamp: React.CSSProperties = open ? {} : {
    display: "-webkit-box", WebkitLineClamp: lines, WebkitBoxOrient: "vertical" as any,
    overflow: "hidden",
  };

  return (
    <div style={{ marginBottom: "1rem" }}>
      <div ref={boxRef} style={{ fontSize: size, color, lineHeight: 1.55, ...clamp }}>
        {paras.map((p, i) => (
          <span key={i} style={{ display: "block", marginBottom: i < paras.length - 1 ? ".5rem" : 0 }}>{p}</span>
        ))}
      </div>
      {(clipped || open) && (
        <button
          onClick={() => setOpen(o => !o)}
          aria-expanded={open}
          style={{
            background: "none", border: "none", padding: ".5rem 0", marginTop: ".1rem",
            minHeight: 44, cursor: "pointer", fontFamily: "'DM Sans',sans-serif",
            fontSize: ".8rem", fontWeight: 600, color: "#ea6b14",
            display: "inline-flex", alignItems: "center", gap: ".25rem",
          }}
        >
          {open ? "Show less" : "Read more"}
          <Ic name={open ? "chevron-up" : "chevron-down"} size={13} color="#ea6b14" />
        </button>
      )}
    </div>
  );
}
