import { useState } from "react";
import { Ic } from "@/components/Ic";

/**
 * OnboardingVideo — the walkthrough, off to the side and optional to view.
 *
 * Both signup flows are a single 580px column centred in a very wide page, so
 * "off to the side" is real estate that already exists: from 1180px up this
 * docks into the right-hand gutter and the form is not moved by one pixel.
 * Below that there is no side, so it falls back to a single collapsed strip
 * directly above the card — still one line tall, still silent until asked.
 *
 * ⚠️ THE <video> ELEMENT IS NOT RENDERED UNTIL THE PERSON CLICKS.
 * These files are ~2MB each. `preload="none"` would be the usual answer, but it
 * is a *hint* — Safari in particular has historically fetched anyway, and a
 * poster frame would be a second file to ship and keep in step. Not mounting
 * the element at all is the one form of "don't download this" that no browser
 * can reinterpret, and it makes the promise exact: someone who never presses
 * play never pays for the video. Closing unmounts it again, which both stops
 * playback and abandons the transfer.
 *
 * `autoPlay` here is not an autoplay banner ad — the element only exists
 * because of a click a moment earlier, so it plays on the person's own gesture.
 * If a browser refuses anyway the controls are right there and nothing is lost.
 *
 * The play glyph is a literal inline <svg> rather than an `Ic` name on purpose:
 * `Ic` has no play triangle, and a missing glyph in that component renders
 * BLANK rather than erroring — a button labelled with nothing. Adding one to
 * the shared icon set for a single use here would put a shared file in an
 * installer that otherwise touches two pages.
 */

const CSS =
  ".ff-onbvid{margin:0 0 1.5rem;border:1px solid rgba(var(--ff-fg), .1);background:rgba(var(--ff-fg), .04);border-radius:12px;padding:.85rem 1rem;}"
  // The gutter dock. `left` clears half the 580px column plus a gap; the width
  // is whatever is left of that half-viewport, capped, so the panel can never
  // be the thing that introduces a horizontal scrollbar. At the 1180px breakpoint
  // itself that arithmetic still leaves 280px, which is why the query starts there.
  + "@media (min-width: 1180px){.ff-onbvid{position:absolute;top:13rem;left:calc(50% + 300px);width:min(320px, calc(50vw - 310px));margin:0;}}"
  + ".ff-onbvid-btn{display:flex;align-items:center;gap:.7rem;width:100%;background:none;border:none;padding:0;cursor:pointer;font-family:inherit;color:var(--ff-text);text-align:left;}"
  + ".ff-onbvid-play{flex-shrink:0;display:flex;align-items:center;justify-content:center;width:34px;height:34px;border-radius:50%;background:#ea6b14;}"
  + ".ff-onbvid-ttl{font-size:.92rem;font-weight:500;line-height:1.3;}"
  + ".ff-onbvid-sub{font-size:.76rem;color:rgba(var(--ff-muted), .65);margin-top:.15rem;}"
  + ".ff-onbvid-vid{width:100%;display:block;border-radius:8px;margin-top:.85rem;background:#000;}"
  + ".ff-onbvid-hide{display:flex;align-items:center;gap:.4rem;background:none;border:none;padding:0;margin-top:.6rem;cursor:pointer;font-family:inherit;font-size:.78rem;color:rgba(var(--ff-muted), .7);}";

export default function OnboardingVideo({
  src,
  title,
  seconds,
}: {
  src: string;
  title: string;
  seconds: number;
}) {
  const [open, setOpen] = useState(false);

  return (
    <aside className="ff-onbvid">
      <style>{CSS}</style>
      {!open && (
        <button type="button" className="ff-onbvid-btn" onClick={() => setOpen(true)}>
          <span className="ff-onbvid-play">
            <svg width="13" height="13" viewBox="0 0 24 24" aria-hidden="true">
              <path d="M6 3.5 20 12 6 20.5Z" fill="#fff" />
            </svg>
          </span>
          <span style={{ minWidth: 0 }}>
            <span className="ff-onbvid-ttl" style={{ display: "block" }}>{title}</span>
            {/* The length is named up front because that is the only thing anyone
                wants to know before pressing play on a video attached to a form. */}
            <span className="ff-onbvid-sub" style={{ display: "block" }}>
              {seconds} seconds · optional
            </span>
          </span>
        </button>
      )}
      {open && (
        <>
          <span className="ff-onbvid-ttl" style={{ display: "block" }}>{title}</span>
          {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
          <video className="ff-onbvid-vid" src={src} controls autoPlay playsInline preload="auto" />
          <button type="button" className="ff-onbvid-hide" onClick={() => setOpen(false)}>
            <Ic name="x-circle" size={14} />
            Hide video
          </button>
        </>
      )}
    </aside>
  );
}
