// ONE print-document renderer for every printable/bookkeeping document on the platform.
//
// Why this file exists: four documents (client invoice, contractor payout statement,
// period earnings summary, signed service agreement) all need the same thing — a
// standalone letter-paper HTML page the browser can print or "Save as PDF". They were
// never going to stay consistent as four hand-rolled window.open() blobs; the client
// receipt alone shipped with "border-top:2px solid var(--ff-bg)", which renders NO
// border, because a standalone document opened with document.write() has no :root and
// therefore no CSS custom properties at all.
//
// Hard rules for anything added here:
//   1. NEVER use var(--ff-*) in this file. There is no :root in the printed document.
//      Hex literals only. (This is also why the orange below is declared exactly once —
//      tools/check_ux.py ratchets the count of #ea6b14 literals across src/.)
//   2. NEVER type a backtick inside the stylesheet strings, including in a comment.
//      Same failure mode as main.tsx: one backtick closes the string and the rest of the
//      sheet becomes JavaScript.
//   3. System font stack only. A webfont is a network dependency at print time, and a
//      print dialog opened offline must still produce a correct document.
//   4. Backgrounds are not load-bearing. Browsers drop background colours when printing
//      by default, so nothing may rely on one to be legible.

export const DOC_ACCENT = "#ea6b14";

const INK = "#111827";
const MUTE = "#6b7280";
const LINE = "#d1d5db";

export function escHtml(v: any): string {
  return String(v ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** "$1,234.56" — or an em dash when there is genuinely no number (never "$0.00" for unknown). */
export function money(n: any): string {
  if (n == null || n === "" || !isFinite(Number(n))) return "—";
  const v = Number(n);
  return (v < 0 ? "-$" : "$") + Math.abs(v).toLocaleString("en-CA", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/** Calgary-local date. Never bare toLocaleDateString() — the session zone is UTC on some surfaces. */
export function docDate(v?: any): string {
  const d = v ? new Date(v) : new Date();
  if (isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-CA", { timeZone: "America/Edmonton", year: "numeric", month: "short", day: "numeric" });
}

export type DocLine = {
  label: string;
  value?: string;
  note?: string;
  /** "row" = normal, "sub" = subtotal rule above, "total" = heavy rule above + bold */
  kind?: "row" | "sub" | "total";
};

export type DocBlock =
  | { kind: "parties"; items: { title: string; lines: string[] }[] }
  | { kind: "lines"; title?: string; lines: DocLine[]; note?: string }
  | { kind: "table"; title?: string; head: string[]; rows: string[][]; foot?: string[]; note?: string; right?: number[] }
  | { kind: "text"; title?: string; body: string }
  | { kind: "html"; title?: string; html: string };

export type PrintDocument = {
  /** "INVOICE", "PAYOUT STATEMENT", "EARNINGS SUMMARY", "SERVICE AGREEMENT" */
  docType: string;
  /** Usually jobCode(job.id). Becomes part of the suggested PDF filename. */
  docNumber: string;
  issued?: string;
  subtitle?: string;
  blocks: DocBlock[];
  footNotes?: string[];
};

const CSS: string = [
  "@page { size: letter; margin: 0.55in; }",
  "* { box-sizing: border-box; }",
  "html, body { margin:0; padding:0; background:#fff; color:" + INK + "; }",
  "body { font-family: -apple-system, BlinkMacSystemFont, Segoe UI, Roboto, Helvetica, Arial, sans-serif; font-size:10.5pt; line-height:1.45; -webkit-font-smoothing:antialiased; }",
  ".wrap { max-width:7.4in; margin:0 auto; padding:28px 22px 56px; }",
  // screen-only action bar
  ".bar { position:sticky; top:0; display:flex; gap:.5rem; align-items:center; justify-content:flex-end; padding:10px 0 14px; background:#fff; }",
  ".btn { font:inherit; font-weight:700; font-size:10pt; padding:.6rem 1rem; min-height:44px; border-radius:10px; border:1px solid " + DOC_ACCENT + "; background:" + DOC_ACCENT + "; color:#fff; cursor:pointer; }",
  ".btn.alt { background:#fff; color:" + INK + "; border-color:" + LINE + "; }",
  ".hint { flex:1 1 auto; font-size:9pt; color:" + MUTE + "; }",
  // header
  ".head { display:flex; flex-wrap:wrap; gap:16px; justify-content:space-between; align-items:flex-start; border-bottom:3px solid " + DOC_ACCENT + "; padding-bottom:14px; }",
  ".brand { font-size:19pt; font-weight:800; letter-spacing:.06em; margin:0 0 2px; }",
  ".brand-sub { font-size:9pt; color:" + MUTE + "; margin:0; }",
  ".meta { text-align:right; min-width:2.3in; }",
  ".doctype { font-size:14pt; font-weight:800; letter-spacing:.1em; margin:0 0 4px; }",
  ".meta dl { margin:0; font-size:9.5pt; }",
  ".meta dl div { display:flex; gap:10px; justify-content:flex-end; }",
  ".meta dt { color:" + MUTE + "; }",
  ".meta dd { margin:0; font-weight:700; }",
  ".subtitle { font-size:10pt; color:" + MUTE + "; margin:12px 0 0; }",
  // blocks
  ".block { margin-top:22px; page-break-inside:avoid; }",
  ".block h2 { font-size:9.5pt; font-weight:800; letter-spacing:.12em; text-transform:uppercase; color:" + MUTE + "; margin:0 0 8px; }",
  ".parties { display:flex; flex-wrap:wrap; gap:22px; }",
  ".party { flex:1 1 2.6in; min-width:2.3in; }",
  ".party h3 { font-size:8.5pt; font-weight:800; letter-spacing:.12em; text-transform:uppercase; color:" + MUTE + "; margin:0 0 4px; }",
  ".party p { margin:0; font-size:10pt; }",
  ".party p.strong { font-weight:700; }",
  "table { width:100%; border-collapse:collapse; font-size:10pt; }",
  "th { text-align:left; font-size:8.5pt; font-weight:800; letter-spacing:.08em; text-transform:uppercase; color:" + MUTE + "; border-bottom:1px solid " + LINE + "; padding:0 0 5px; }",
  "td { padding:6px 0; vertical-align:top; border-bottom:1px solid #eef0f3; }",
  "th.r, td.r { text-align:right; white-space:nowrap; }",
  "tfoot td { border-bottom:none; border-top:2px solid " + INK + "; font-weight:800; padding-top:8px; }",
  ".lines td { border-bottom:none; padding:4px 0; }",
  ".lines tr.sub td { border-top:1px solid " + LINE + "; padding-top:7px; }",
  ".lines tr.total td { border-top:2px solid " + INK + "; padding-top:8px; font-weight:800; font-size:11.5pt; }",
  ".lines .note { display:block; font-size:8.5pt; color:" + MUTE + "; }",
  ".body { font-size:10pt; white-space:pre-wrap; margin:0; }",
  ".bnote { font-size:8.5pt; color:" + MUTE + "; margin:8px 0 0; }",
  // embedded signed HTML, normalised to dark ink on white
  ".embed { font-size:10pt; }",
  ".embed * { background:transparent !important; background-color:transparent !important; color:" + INK + " !important; border-color:" + LINE + " !important; max-width:100% !important; box-shadow:none !important; }",
  ".embed a { color:" + INK + " !important; text-decoration:underline; }",
  ".embed table { border-collapse:collapse; }",
  ".embed h1, .embed h2, .embed h3 { page-break-after:avoid; }",
  // footer
  ".foot { margin-top:30px; padding-top:12px; border-top:1px solid " + LINE + "; font-size:8.5pt; color:" + MUTE + "; }",
  ".foot p { margin:0 0 4px; }",
  "@media print { .noprint { display:none !important; } .wrap { padding:0; max-width:none; } body { font-size:10pt; } }",
  "@media (max-width:640px) { .wrap { padding:14px 12px 40px; } .meta { text-align:left; min-width:0; } .meta dl div { justify-content:flex-start; } .head { border-bottom-width:2px; } }",
].join("\n");

function partiesBlock(items: { title: string; lines: string[] }[]): string {
  const cols = items
    .map((it) => {
      const body = it.lines
        .filter((l) => l != null && String(l).trim() !== "")
        .map((l, i) => "<p" + (i === 0 ? ' class="strong"' : "") + ">" + escHtml(l) + "</p>")
        .join("");
      return '<div class="party"><h3>' + escHtml(it.title) + "</h3>" + (body || "<p>—</p>") + "</div>";
    })
    .join("");
  return '<div class="block"><div class="parties">' + cols + "</div></div>";
}

function linesBlock(b: Extract<DocBlock, { kind: "lines" }>): string {
  const rows = b.lines
    .map((l) => {
      const cls = l.kind && l.kind !== "row" ? ' class="' + l.kind + '"' : "";
      const note = l.note ? '<span class="note">' + escHtml(l.note) + "</span>" : "";
      return (
        "<tr" + cls + "><td>" + escHtml(l.label) + note + '</td><td class="r">' + escHtml(l.value ?? "") + "</td></tr>"
      );
    })
    .join("");
  return (
    '<div class="block">' +
    (b.title ? "<h2>" + escHtml(b.title) + "</h2>" : "") +
    '<table class="lines"><tbody>' + rows + "</tbody></table>" +
    (b.note ? '<p class="bnote">' + escHtml(b.note) + "</p>" : "") +
    "</div>"
  );
}

function tableBlock(b: Extract<DocBlock, { kind: "table" }>): string {
  const right = new Set(b.right ?? []);
  const head = b.head.map((h, i) => "<th" + (right.has(i) ? ' class="r"' : "") + ">" + escHtml(h) + "</th>").join("");
  const body = b.rows
    .map((r) => "<tr>" + r.map((c, i) => "<td" + (right.has(i) ? ' class="r"' : "") + ">" + escHtml(c) + "</td>").join("") + "</tr>")
    .join("");
  const foot = b.foot
    ? "<tfoot><tr>" + b.foot.map((c, i) => "<td" + (right.has(i) ? ' class="r"' : "") + ">" + escHtml(c) + "</td>").join("") + "</tr></tfoot>"
    : "";
  return (
    '<div class="block">' +
    (b.title ? "<h2>" + escHtml(b.title) + "</h2>" : "") +
    "<table><thead><tr>" + head + "</tr></thead><tbody>" + body + "</tbody>" + foot + "</table>" +
    (b.note ? '<p class="bnote">' + escHtml(b.note) + "</p>" : "") +
    "</div>"
  );
}

function renderBlock(b: DocBlock): string {
  if (b.kind === "parties") return partiesBlock(b.items);
  if (b.kind === "lines") return linesBlock(b);
  if (b.kind === "table") return tableBlock(b);
  if (b.kind === "text") {
    return (
      '<div class="block">' +
      (b.title ? "<h2>" + escHtml(b.title) + "</h2>" : "") +
      '<p class="body">' + escHtml(b.body) + "</p></div>"
    );
  }
  // kind === "html": already-trusted HTML we generated ourselves (the signed agreement).
  // Normalised to dark-on-white by the .embed rules above, because the stored signed_html
  // is a dark-navy email fragment and browsers drop backgrounds when printing.
  return (
    '<div class="block">' +
    (b.title ? "<h2>" + escHtml(b.title) + "</h2>" : "") +
    '<div class="embed">' + b.html + "</div></div>"
  );
}

export function renderDocument(doc: PrintDocument): string {
  const title = doc.docType + " " + doc.docNumber;
  const meta =
    '<div><dt>Document</dt><dd>' + escHtml(doc.docNumber) + "</dd></div>" +
    '<div><dt>Issued</dt><dd>' + escHtml(doc.issued || docDate()) + "</dd></div>";
  const notes = (doc.footNotes ?? []).filter((n) => n && String(n).trim() !== "");
  return (
    "<!doctype html><html lang=\"en\"><head><meta charset=\"utf-8\">" +
    '<meta name="viewport" content="width=device-width, initial-scale=1">' +
    '<meta name="robots" content="noindex">' +
    "<title>" + escHtml(title) + "</title><style>" + CSS + "</style></head><body><div class=\"wrap\">" +
    '<div class="bar noprint">' +
    '<span class="hint">Use Print, then choose Save as PDF.</span>' +
    '<button class="btn alt" onclick="window.close()">Close</button>' +
    '<button class="btn" onclick="window.print()">Print / Save as PDF</button>' +
    "</div>" +
    '<div class="head"><div><p class="brand">FREDDY FIX IT</p>' +
    '<p class="brand-sub">Calgary home services &middot; freddyfixit.ca &middot; hello@freddyfixit.ca</p></div>' +
    '<div class="meta"><p class="doctype">' + escHtml(doc.docType) + "</p><dl>" + meta + "</dl></div></div>" +
    (doc.subtitle ? '<p class="subtitle">' + escHtml(doc.subtitle) + "</p>" : "") +
    doc.blocks.map(renderBlock).join("") +
    (notes.length ? '<div class="foot">' + notes.map((n) => "<p>" + escHtml(n) + "</p>").join("") + "</div>" : "") +
    "</div></body></html>"
  );
}

/**
 * Open a document in a new tab. Returns false when the popup was blocked, so the caller
 * can say so — a button that silently does nothing is worse than no button.
 */
export function openDocument(doc: PrintDocument): boolean {
  const w = window.open("", "_blank");
  if (!w) return false;
  w.document.write(renderDocument(doc));
  w.document.close();
  return true;
}
