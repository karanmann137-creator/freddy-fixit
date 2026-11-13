// Module-level helpers shared by ContractorDashboard.tsx and its tab components.
// Moved verbatim from src/pages/ContractorDashboard.tsx on 2026-11-12.
import { type ServicePrice, money, TARGET_BID_DISCOUNT } from "@/lib/servicePricing";
import { Ic, type IconName } from "@/components/Ic";
import { GAP_ANCHORS } from "@/components/ContractorProfileCompletion";
import { type RowTone, type PillTone } from "@/components/ui";

/**
 * A review score's colour has to come FROM the score. v1 painted every one of
 * them `#ea6b14`, so a 4/10 arrived in the same celebratory orange as a 10/10 —
 * the one number on the page a pro most needs to notice read as a highlight.
 *
 * Thresholds are deliberately generous at the bottom: 5–7 is "fine, nothing to
 * see", not a warning. Only a genuinely poor score earns the warn tone, because
 * a tone that fires on an average result stops meaning anything.
 */
export function scoreTone(v: number): PillTone {
  return v >= 8 ? "good" : v >= 5 ? "neutral" : "warn";
}

/**
 * Job History's status chip. v1 painted it from `STATUS_COLORS`, an eight-entry
 * map of raw hexes — which is both a light-mode hazard (none of them answer to
 * the theme) and eight colours competing in a single scrolling list.
 *
 * `STATUS_COLORS` is deliberately left in place — the open job cards and the
 * calendar (`statusColors=`) both still read it, and the calendar in particular
 * WANTS a distinct colour per status because its whole job is to tell the
 * stages apart at a glance. A history list wants the opposite: the only
 * question it answers is "did this go fine or not", so the eight statuses
 * collapse onto four tones.
 *
 * `matched` / `assigned` / `scheduled` are neutral on purpose. They are
 * mid-flight states on a FINISHED list; nothing about them is owed to the pro,
 * and a warn tone on a scheduled job would read as a problem.
 */
export function historyTone(status: string): PillTone {
  if (status === "completed") return "good";
  if (status === "cancelled") return "danger";
  if (status === "in_progress") return "accent";
  if (status === "pending" || status === "pending_confirmation") return "warn";
  return "neutral";
}

/**
 * Every history row gets an icon, and the reason is geometric rather than
 * decorative: `<Row>` always renders the icon gutter (`.ffu-ri-wrap`) and a
 * row's hairline starts where its TEXT starts, so a row with no icon leaves an
 * empty column that still reads as a column. Give it a glyph or the list looks
 * like it failed to load one.
 *
 * All three names are in `Ic`'s hand-copied set. A name that isn't renders
 * BLANK rather than erroring, so this must not grow a glyph without checking.
 */
/**
 * `<Row>`'s tones are a SUBSET of `<Pill>`'s — there is no `danger` row tone,
 * because a row tone colours the icon and a red icon on an otherwise ordinary
 * list row reads as an error the pro has to act on. A cancelled job isn't an
 * error; it's just over. So the icon warns and only the pill goes red.
 */
export function historyRowTone(status: string): RowTone {
  const t = historyTone(status);
  return t === "danger" ? "warn" : t;
}

export function historyIcon(status: string): IconName {
  if (status === "completed") return "check-circle";
  if (status === "cancelled") return "x-circle";
  return "briefcase";
}

// Which required pieces of a contractor profile are still missing, and where in
// the profile editor each one lives so we can scroll the contractor straight to it.
export type ProfileGap = { key: string; label: string; anchor: string };

export const contractorGaps = (c: any): ProfileGap[] => {
  const g: ProfileGap[] = [];
  if (!c?.photo_url)                                     g.push({ key: "photo",       label: "profile photo",          anchor: GAP_ANCHORS.photo });
  if (!(c?.service_area?.length))                        g.push({ key: "area",        label: "service area",           anchor: GAP_ANCHORS.area });
  if (!c?.work_type)                                     g.push({ key: "work_type",   label: "your trade",             anchor: GAP_ANCHORS.work_type });
  if (!c?.has_liability_insurance && !c?.licensed)       g.push({ key: "credentials", label: "licence or insurance",   anchor: GAP_ANCHORS.credentials });
  if (!(c?.doc_urls && Object.keys(c.doc_urls).length))  g.push({ key: "docs",        label: "verification documents", anchor: GAP_ANCHORS.docs });
  return g;
};

// Label-only view, kept for the existing callers (nudge copy + the
// profile-complete celebration trigger).
export const contractorMissing = (c: any): string[] => contractorGaps(c).map(g => g.label);

export const openJobSearchFields = (r: any): (string | number | null | undefined)[] => [
  r?.service_needed, r?.location, r?.preferred_schedule, r?.description,
  r?.recurring_frequency,
];

export const ffInp = { width:"100%", padding:".5rem .6rem", background:"rgba(var(--ff-fg), .06)", border:"var(--ff-hair-w) solid rgba(var(--ff-fg), .12)", borderRadius:"8px", color:"var(--ff-text)", fontFamily:"inherit", fontSize:".85rem", boxSizing:"border-box" as const };

export const ffLbl = { fontSize:".66rem", textTransform:"uppercase" as const, letterSpacing:".08em", color:"rgba(var(--ff-muted), .45)", marginBottom: "var(--ff-s1)" };

/**
 * `target` is the suggested bid — 25% under the category average, computed by
 * `targetBid()` (2026-09-11). It is passed at the BID call site only.
 *
 * Deliberately NOT passed to the propose or requote forms: both of those price
 * a job whose scope is already known and often larger than what was bid, and
 * suggesting a discount off a category average there would be actively wrong.
 *
 * It is a suggestion in the strict sense — it prefills the amount when tapped
 * and does nothing otherwise. Nothing validates against it, no bid is flagged
 * or hidden for exceeding it, and the platform base price and typical range
 * below it are unchanged.
 */
export function QuoteBreakdown({ v, on, calloutHint, price, target }: { v: any; on: (patch: any) => void; calloutHint?: number | null; price?: ServicePrice | null; target?: number | null }) {
  const keys: [string,string,string][] = [["labour","Labour",""],["parts","Parts",""],["callout","Call-out", calloutHint != null ? String(calloutHint) : ""]];
  const any = ["labour","parts","callout"].some(k => v?.[k] !== "" && v?.[k] != null);
  const sum = ["labour","parts","callout"].reduce((t,k) => t + (v?.[k] ? Number(v[k]) : 0), 0);
  const hasRef = !!price && (price.base_price != null || (price.typical_low != null && price.typical_high != null));
  const tgt = target != null && isFinite(Number(target)) && Number(target) > 0 ? Math.round(Number(target)) : null;
  return (
    <div style={{ display:"flex", flexDirection:"column", gap:".55rem", flexBasis:"100%", width:"100%" }}>
      {tgt != null && (
        <div style={{ display:"flex", flexWrap:"wrap" as const, alignItems:"center", gap:".5rem", padding:".5rem .6rem", background:"rgba(var(--ff-accent-rgb), .12)", border:"1px solid rgba(var(--ff-accent-rgb), .35)", borderRadius:"8px" }}>
          <span style={{ fontSize:".8rem", color:"var(--ff-text)" }}>
            <span style={{ color:"rgba(var(--ff-muted), .7)" }}>Suggested bid </span>
            <strong style={{ color:"var(--ff-c10)" }}>{money(tgt)}</strong>
            <span style={{ display:"block", marginTop:"2px", fontSize:".72rem", color:"rgba(var(--ff-muted), .6)" }}>
              {Math.round(TARGET_BID_DISCOUNT * 100)}% under the category average — a guide, not a limit.
            </span>
          </span>
          <button type="button" onClick={() => on({ amount: String(tgt), labour:"", parts:"", callout:"", used_base_price: false })}
            style={{ marginLeft:"auto", padding:".3rem .6rem", background:"var(--ff-c10)", color:"#fff", border:"none", borderRadius:"6px", fontSize:".74rem", fontWeight:600, cursor:"pointer", fontFamily:"inherit" }}>
            Use suggested
          </button>
        </div>
      )}
      {hasRef && (
        <div style={{ display:"flex", flexWrap:"wrap" as const, alignItems:"center", gap:".5rem", padding:".5rem .6rem", background:"rgba(var(--ff-accent-rgb), .08)", border:"1px solid rgba(var(--ff-accent-rgb), .25)", borderRadius:"8px" }}>
          <span style={{ fontSize:".74rem", color:"rgba(var(--ff-muted), .8)" }}>
            {price!.base_price != null && <>Platform base <b style={{ color:"var(--ff-text)" }}>{money(price!.base_price)}</b></>}
            {price!.typical_low != null && price!.typical_high != null && <> · Typical {money(price!.typical_low)}–{money(price!.typical_high)}</>}
            {price!.unit && <span style={{ opacity:.7 }}> ({price!.unit})</span>}
          </span>
          {price!.base_price != null && (
            <button type="button" onClick={() => on({ amount: String(price!.base_price), labour:"", parts:"", callout:"", used_base_price: true })}
              style={{ marginLeft:"auto", padding:".3rem .6rem", background:"var(--ff-c10)", color:"#fff", border:"none", borderRadius:"6px", fontSize:".74rem", fontWeight:600, cursor:"pointer", fontFamily:"inherit" }}>
              Use base price
            </button>
          )}
        </div>
      )}
      {v?.used_base_price && <div style={{ fontSize:".74rem", color:"var(--ff-success)", fontWeight:600 }}><Ic name="check-circle" size={12} style={{ marginRight:4 }} />Using platform base price</div>}
      <div style={{ fontSize:".72rem", color:"rgba(var(--ff-muted), .5)", lineHeight:1.4 }}>Itemise your price (optional) — clients trust and approve detailed estimates faster.</div>
      <div style={{ display:"flex", gap:".5rem", flexWrap:"wrap" as const }}>
        {keys.map(([key,label,ph]) => (
          <div key={key} style={{ flex:"1 1 80px" }}>
            <div style={ffLbl}>{label}</div>
            <input type="number" min="0" value={v?.[key] ?? ""} placeholder={ph ? ("$" + ph) : "$"} onChange={e => on({ [key]: e.target.value, used_base_price:false })} style={ffInp} />
          </div>
        ))}
      </div>
      {any && <div style={{ fontSize:".82rem", color:"var(--ff-success)", fontWeight:600 }}>Itemised total: ${sum.toFixed(2)}</div>}
      <div>
        <div style={ffLbl}>Price range (optional) — show the client a low–high estimate</div>
        <div style={{ display:"flex", gap:".5rem", alignItems:"center" }}>
          <input type="number" min="0" value={v?.price_low ?? ""} placeholder={price?.typical_low != null ? ("$" + price.typical_low) : "Low $"} onChange={e => on({ price_low: e.target.value })} style={ffInp} />
          <span style={{ color:"rgba(var(--ff-muted), .5)" }}>–</span>
          <input type="number" min="0" value={v?.price_high ?? ""} placeholder={price?.typical_high != null ? ("$" + price.typical_high) : "High $"} onChange={e => on({ price_high: e.target.value })} style={ffInp} />
        </div>
      </div>
      <label style={{ display:"flex", alignItems:"center", gap:".5rem", fontSize:".8rem", color:"rgba(var(--ff-muted), .75)", cursor:"pointer" }}>
        <input type="checkbox" checked={!!v?.subject} onChange={e => on({ subject: e.target.checked })} />
        Final price subject to on-site inspection
      </label>
    </div>
  );
}
