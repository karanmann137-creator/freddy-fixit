import { useCallback, useEffect, useRef } from "react";
import type { ImgHTMLAttributes } from "react";

/**
 * An <img> that fades in once its pixels actually arrive, instead of snapping
 * into place a paint after the layout has already settled.
 *
 * The CSS is in main.tsx: `img[data-ff-fade]` is opacity 0 and goes to 1 when
 * `data-ff-in="1"` lands on it. Getting that attribute set reliably is the
 * whole reason this is a component rather than an onLoad handler at each call
 * site, because there are three separate ways an image finishes:
 *
 *  - It was already in the browser cache and was COMPLETE before React ever
 *    attached a handler. The load event fired before anyone was listening, so
 *    onLoad is never called. This is the common case on a second page view and
 *    it is exactly how a naive fade-in leaves images permanently invisible.
 *    The ref callback catches it by reading `el.complete` on mount.
 *  - It loaded normally -> onLoad.
 *  - It FAILED -> onError, which also reveals it, because a broken-image icon
 *    in the right place is information and an invisible gap is not.
 *
 * Belt and braces, `img[data-ff-fade]` also carries a 4s safety animation that
 * forces opacity to 1 regardless. A late image is cosmetic; a missing one is a
 * bug, and this is the kind of bug that only shows up on someone else's
 * network.
 *
 * Anything the caller passes through -- srcSet, sizes, loading, decoding,
 * className, style, draggable -- is forwarded untouched.
 */
export default function FadeImg(props: ImgHTMLAttributes<HTMLImageElement>) {
  const { onLoad, onError, src, ...rest } = props;
  const node = useRef<HTMLImageElement | null>(null);

  // Stable identity on purpose. An inline arrow here would be a NEW ref every
  // render, so React would detach and reattach on each one -- and the
  // before/after slider re-renders on every pointer move while it is dragged.
  const setNode = useCallback((el: HTMLImageElement | null) => {
    node.current = el;
    if (el && el.complete) el.setAttribute("data-ff-in", "1");
  }, []);

  // A changed src is a different picture, so it fades in again. Without this
  // the element keeps data-ff-in from the previous image and the new one pops.
  useEffect(() => {
    const el = node.current;
    if (!el) return;
    if (el.complete) el.setAttribute("data-ff-in", "1");
    else el.removeAttribute("data-ff-in");
  }, [src]);

  return (
    <img
      {...rest}
      src={src}
      data-ff-fade=""
      ref={setNode}
      onLoad={(e) => { e.currentTarget.setAttribute("data-ff-in", "1"); onLoad?.(e); }}
      onError={(e) => { e.currentTarget.setAttribute("data-ff-in", "1"); onError?.(e); }}
    />
  );
}
