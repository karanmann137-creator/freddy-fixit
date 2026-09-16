import { useState, useEffect } from "react";
import { Ic } from "@/components/Ic";

/**
 * OnboardingVideo — the walkthrough, out of the way and optional to view.
 *
 * Collapsed, it is a single strip directly above the form card at every width.
 * An earlier version docked it into the right-hand gutter on wide screens, and
 * that read as detached: the gutter is empty background art, so a panel
 * floating there looks like it belongs to the page rather than to the form,
 * and its vertical position had to be guessed at a fixed offset that only
 * lines up at one header height. One collapsed layout everywhere is calmer,
 * and it is one fewer thing that can fall out of step with the pages above it.
 *
 * OPENED, desktop and phone diverge, and the split is done in CSS rather than
 * in JS. On a phone the video plays inline exactly as before. From 900px up it
 * lifts into a soft full-screen panel — about 55vw — over a scrim that darkens
 * the page without hiding it, so the form the person is filling in stays
 * legible behind the video explaining it.
 *
 * The two wrappers that make the panel are `display:contents` at base width,
 * so on a phone they have no box at all and the children lay out precisely as
 * they did before this existed. A media query is the entire mechanism; there
 * is no `matchMedia`, no resize listener and no second render path that could
 * disagree with the first. The cost of `display:contents` is that such a
 * wrapper is NEVER its own event target, which is why the click-outside
 * handler tests `e.target === e.currentTarget` — without that guard, tapping
 * the video itself on a phone would bubble up and close it.
 *
 * The collapsed strip is still RENDERED while the panel is open (hidden only
 * at base width, shown again inside the media query). That is what stops the
 * form behind the scrim reflowing the instant the video opens, which matters
 * precisely because the point of the scrim is that the page stays visible.
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
  + ".ff-onbvid-btn{display:flex;align-items:center;gap:.7rem;width:100%;background:none;border:none;padding:0;cursor:pointer;font-family:inherit;color:var(--ff-text);text-align:left;}"
  + ".ff-onbvid-play{flex-shrink:0;display:flex;align-items:center;justify-content:center;width:34px;height:34px;border-radius:50%;background:#ea6b14;}"
  + ".ff-onbvid-ttl{font-size:.92rem;font-weight:500;line-height:1.3;}"
  + ".ff-onbvid-sub{font-size:.76rem;color:rgba(var(--ff-muted), .65);margin-top:.15rem;}"
  + ".ff-onbvid-vid{width:100%;display:block;border-radius:8px;margin-top:.85rem;background:#000;}"
  // Slightly larger than the sub-label it sits under: it is a control, not a
  // caption, and at .78rem it read as fine print on a panel whose only other
  // affordance is the video's own chrome.
  + ".ff-onbvid-hide{display:flex;align-items:center;gap:.45rem;background:none;border:none;padding:0;margin-top:.7rem;cursor:pointer;font-family:inherit;font-size:.92rem;color:rgba(var(--ff-muted), .8);}"
  // Base width: both wrappers vanish from layout entirely, so the phone keeps
  // the inline strip it has always had, and the collapsed trigger is hidden
  // while the video is showing because the video is sitting in its place.
  + ".ff-onbvid-ovl{display:contents;}"
  + ".ff-onbvid-panel{display:contents;}"
  + ".ff-onbvid-on .ff-onbvid-btn{display:none;}"
  // Declared AFTER the rule it overrides: the two `.ff-onbvid-on .ff-onbvid-btn`
  // selectors have identical specificity, so source order is what decides, and
  // reversing these two blocks would silently hide the trigger on desktop.
  + "@media (min-width: 900px){"
  // .55 rather than the house .72 — he asked for the page darkened but still
  // visible, and at .72 with a blur the form behind reads as switched off.
  + ".ff-onbvid-ovl{display:flex;position:fixed;inset:0;z-index:9999;align-items:center;justify-content:center;padding:1.2rem;background:rgba(8,12,22,.55);}"
  + ".ff-onbvid-panel{display:block;width:55vw;max-width:1200px;background:var(--ff-bg);border:1px solid rgba(var(--ff-fg), .12);border-radius:14px;padding:1.1rem 1.2rem 1rem;box-shadow:0 24px 60px rgba(0,0,0,.45);}"
  + ".ff-onbvid-on .ff-onbvid-btn{display:flex;}"
  // A tall portrait clip would otherwise push the hide button off-screen; the
  // cap is on the video, not the panel, so the button always stays reachable.
  + ".ff-onbvid-vid{max-height:70vh;object-fit:contain;}"
  + "}";

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

  // Escape closes it. On desktop the panel covers most of the screen, so the
  // key people reach for has to work; on a phone the listener is harmless
  // because there is no keyboard to press it with.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <aside className={open ? "ff-onbvid ff-onbvid-on" : "ff-onbvid"}>
      <style>{CSS}</style>
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
      {open && (
        <div
          className="ff-onbvid-ovl"
          onClick={(e) => {
            // `display:contents` at base width means this div is never its own
            // event target there, so an unguarded handler would close the video
            // when a phone user taps the video itself.
            if (e.target === e.currentTarget) setOpen(false);
          }}
        >
          <div className="ff-onbvid-panel">
            <span className="ff-onbvid-ttl" style={{ display: "block" }}>{title}</span>
            {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
            <video className="ff-onbvid-vid" src={src} controls autoPlay playsInline preload="auto" />
            <button type="button" className="ff-onbvid-hide" onClick={() => setOpen(false)}>
              <Ic name="x-circle" size={17} />
              Hide video
            </button>
          </div>
        </div>
      )}
    </aside>
  );
}
