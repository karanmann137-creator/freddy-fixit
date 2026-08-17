import { Ic, type IconName } from "@/components/Ic";

/**
 * The client-facing verification markers.
 *
 * WHY THIS EXISTS
 * We deliberately do NOT gate bidding on paperwork — on a platform where supply
 * is the binding constraint, asking a pro to file documents before they have
 * ever seen a client is how you lose the pro. So verification is an INCENTIVE
 * instead of a gate: pros who have done it show markers here, clients pick the
 * ones with markers, pros notice and verify themselves.
 *
 * THE WORDING IS LOAD-BEARING. Only one of these says "verified":
 *   ID verified        — Stripe checked government photo ID. A regulated third
 *                        party actually looked. We can defend this word.
 *   Insurance on file  — we HOLD a certificate. We have not confirmed it is
 *   WCB on file          current or genuine. "On file" is a claim about our
 *                        filing cabinet, not about the document.
 * If someone ever asks what a marker means, the answer has to be true. Never
 * promote an "on file" marker to "verified" without a real check behind it.
 *
 * ABSENCE IS QUIET, NOT SCARLET. There is no red X, no "unverified" badge and
 * no trust score. A pro with nothing on file renders nothing at all, because a
 * brand-new pro still has to be able to win their first job.
 *
 * Trade certificate is deliberately absent from v1 — it is the marker a client
 * is most likely to read as "licensed for compulsory work", and we have no
 * Tradesecrets lookup yet. It ships when there is a real check behind it.
 */

export type VerifyFlags = {
  id_verified?: boolean | null;
  insurance_on_file?: boolean | null;
  wcb_on_file?: boolean | null;
};

export function hasAnyMark(f: VerifyFlags | null | undefined): boolean {
  if (!f) return false;
  return !!(f.id_verified || f.insurance_on_file || f.wcb_on_file);
}

// Green = we checked. Blue = we hold it. The colour split is the honesty
// hierarchy made visible, so the two never read as the same claim.
const CHECKED = "#22c55e";
const ONFILE  = "#60a5fa";

type Mark = { key: string; icon: IconName; label: string; short: string; color: string; title: string };

function marksFor(f: VerifyFlags): Mark[] {
  const out: Mark[] = [];
  if (f.id_verified) out.push({
    key: "id", icon: "user-check", label: "ID verified", short: "ID verified", color: CHECKED,
    title: "Government photo ID was checked by Stripe, our payments provider, when this pro set up their payout account.",
  });
  if (f.insurance_on_file) out.push({
    key: "ins", icon: "check-circle", label: "Insurance on file", short: "Insured", color: ONFILE,
    title: "This pro has given us a certificate of liability insurance and we hold a copy. We have not independently confirmed the policy is still current.",
  });
  if (f.wcb_on_file) out.push({
    key: "wcb", icon: "clipboard-list", label: "WCB on file", short: "WCB", color: ONFILE,
    title: "This pro has given us a WCB Alberta clearance letter and we hold a copy. We have not independently confirmed it is still current.",
  });
  return out;
}

export default function VerifiedMarks({
  flags,
  size = "sm",
  style,
}: {
  flags: VerifyFlags | null | undefined;
  size?: "sm" | "md";
  style?: any;
}) {
  if (!flags) return null;
  const marks = marksFor(flags);
  if (!marks.length) return null;
  const sm = size === "sm";

  return (
    <span style={{ display: "inline-flex", gap: ".3rem", flexWrap: "wrap", alignItems: "center", ...(style ?? {}) }}>
      {marks.map((m) => (
        <span
          key={m.key}
          title={m.title}
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: sm ? ".22rem" : ".3rem",
            padding: sm ? ".13rem .42rem" : ".2rem .55rem",
            borderRadius: "99px",
            background: m.color + "1f",
            border: "1px solid " + m.color + "4d",
            color: m.color,
            fontSize: sm ? ".64rem" : ".72rem",
            fontWeight: 700,
            lineHeight: 1.3,
            whiteSpace: "nowrap",
          }}
        >
          <Ic name={m.icon} size={sm ? 10 : 12} />
          {sm ? m.short : m.label}
        </span>
      ))}
    </span>
  );
}
