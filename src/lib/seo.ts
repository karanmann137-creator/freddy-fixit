// Per-page <head> tags for the six public marketing/SEO routes.
//
// This function was copy-pasted, byte-identical, into About, ServicesIndex,
// ServiceLanding, AreaLanding, ForContractors and BlogPost. Six copies of the
// same eleven lines is six chances for them to drift, and the thing they
// control — canonical URLs and Open Graph tags — is the part of the site whose
// breakage is completely invisible in the browser. You'd find out from a
// ranking drop weeks later, not from a stack trace.
//
// Why upsert rather than render tags in JSX: these are client-rendered routes,
// so index.html already shipped a site-wide description/canonical. Creating a
// second <meta name="description"> would leave both in the head and let the
// crawler pick. Mutating the existing element in place is what makes the
// per-page value actually win.
//
// Each caller is responsible for restoring document.title on unmount. The meta
// tags are deliberately NOT restored: the next route overwrites every one of
// them on mount, and a cleanup that raced with the next page's effect would
// blank the tag that page had just set.
export function upsertMeta(
  selector: string,
  attr: "name" | "property" | "rel",
  key: string,
  content: string,
  valueAttr: "content" | "href" = "content",
) {
  let el = document.head.querySelector(selector) as HTMLElement | null;
  if (!el) {
    el = document.createElement(selector.startsWith("link") ? "link" : "meta");
    el.setAttribute(attr, key);
    document.head.appendChild(el);
  }
  el.setAttribute(valueAttr, content);
}
