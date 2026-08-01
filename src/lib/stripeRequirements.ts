// Turns Stripe Connect requirement codes into plain English a contractor can act on.
//
// Why this lives in the frontend: `refresh-connect-status` returns the raw codes
// (external_account, individual.verification.document, ...) and nothing else, so
// the wording below can be reworded any time WITHOUT redeploying an edge function.
//
// Codes come from account.requirements.currently_due / past_due. We deliberately
// ignore eventually_due — it isn't blocking payouts yet and nagging about it just
// makes the banner noisy.
//
// Stripe namespaces the same field under individual.* / company.* / representative.*
// / owners.* / directors.* / executives.*, and person requirements arrive prefixed
// with a person id (person_1Abc.verification.document). We strip the prefix and
// match on the tail so one entry covers every shape.

export type StripeNeed = {
  /** Short label, e.g. "Add your bank account" */
  label: string;
  /** One sentence telling them exactly what to have ready. */
  detail: string;
};

/** Match on the part after the last namespace segment we care about. */
const RULES: { test: RegExp; need: StripeNeed }[] = [
  {
    test: /(^|\.)external_account$|bank_account|^external_accounts?$/i,
    need: {
      label: "Add the bank account you want to be paid into",
      detail:
        "You'll need your transit number, institution number and account number — they're on a cheque or in your online banking under 'direct deposit info'.",
    },
  },
  {
    test: /verification\.document$/i,
    need: {
      label: "Upload a photo of your government ID",
      detail:
        "A driver's licence or passport. Take the photo in good light with all four corners showing — blurry or cropped photos get rejected.",
    },
  },
  {
    test: /verification\.additional_document$/i,
    need: {
      label: "Upload a proof of address",
      detail:
        "A utility bill, bank statement or government letter from the last 3 months showing your name and address.",
    },
  },
  {
    test: /id_number(_secondary)?$/i,
    need: {
      label: "Enter your SIN",
      detail:
        "Stripe uses it to confirm your identity with the government. It's required for payouts in Canada and Freddy never sees it.",
    },
  },
  {
    test: /(^|\.)dob(\.|$)/i,
    need: { label: "Enter your date of birth", detail: "Enter it exactly as it appears on your ID." },
  },
  {
    test: /address(_kana|_kanji)?\./i,
    need: {
      label: "Enter your home address",
      detail: "Your personal address, not a PO box — it has to match the one on your ID.",
    },
  },
  {
    test: /(^|\.)phone$/i,
    need: { label: "Add a phone number", detail: "A number Stripe can reach you at if they need to confirm something." },
  },
  {
    test: /(^|\.)email$/i,
    need: { label: "Add an email address", detail: "Where Stripe sends payout notices and receipts." },
  },
  {
    test: /(first_name|last_name)(_kana|_kanji)?$/i,
    need: { label: "Enter your legal name", detail: "Spelled exactly as it appears on your ID." },
  },
  {
    test: /business_profile\.(url|product_description)$/i,
    need: {
      label: "Describe your business",
      detail:
        "A website or a one-line description of the work you do. If you don't have a website, use your Freddy profile link or write something like 'residential plumbing repairs'.",
    },
  },
  {
    test: /business_profile\.mcc$/i,
    need: { label: "Pick your business category", detail: "Choose the trade that best matches the work you do." },
  },
  {
    test: /(company\.)?tax_id$|business_number/i,
    need: {
      label: "Enter your business number",
      detail: "Your CRA business number (BN). Sole proprietors without one can usually register as an individual instead.",
    },
  },
  {
    test: /(company\.)?name$/i,
    need: { label: "Enter your registered business name", detail: "Exactly as it's registered with the government." },
  },
  {
    test: /owners?(hip)?(_declaration|_provided|_exemption_reason)/i,
    need: {
      label: "Confirm who owns the business",
      detail: "Stripe asks you to confirm the list of owners is complete. It's a checkbox, not paperwork.",
    },
  },
  {
    test: /(directors|executives|relationship)/i,
    need: {
      label: "Add the people who run the business",
      detail: "Stripe needs a name and date of birth for each director or officer.",
    },
  },
  {
    test: /tos_acceptance/i,
    need: { label: "Accept Stripe's terms", detail: "One checkbox at the end of the Stripe form." },
  },
];

const FALLBACK: StripeNeed = {
  label: "Finish the remaining details on Stripe",
  detail: "Stripe will show you exactly which field is missing when you open the form.",
};

/** Map one raw Stripe requirement code to plain English. */
export function needFor(code: string): StripeNeed {
  const c = String(code || "");
  for (const r of RULES) if (r.test.test(c)) return r.need;
  return FALLBACK;
}

/**
 * Map a list of raw codes to a de-duplicated list of plain-English steps.
 * Stripe often lists several codes that resolve to the same real-world action
 * (individual.address.line1 + .city + .postal_code = "enter your address"),
 * so collapsing by label keeps the banner to 2–3 lines instead of 9.
 */
export function needsFor(codes: string[] | null | undefined): StripeNeed[] {
  if (!Array.isArray(codes) || codes.length === 0) return [];
  const out: StripeNeed[] = [];
  const seen = new Set<string>();
  for (const c of codes) {
    const n = needFor(c);
    if (seen.has(n.label)) continue;
    seen.add(n.label);
    out.push(n);
  }
  return out;
}

/** One-line summary for tight spots (admin lists, toasts). */
export function needsSummary(codes: string[] | null | undefined): string {
  const n = needsFor(codes);
  if (n.length === 0) return "";
  if (n.length === 1) return n[0].label;
  return n[0].label + " + " + (n.length - 1) + " more";
}

/**
 * Stripe is reviewing something — the contractor has nothing to do but wait.
 * Worth saying out loud, otherwise "not connected yet" reads like a failure.
 */
export function pendingText(pending: string[] | null | undefined): string {
  if (!Array.isArray(pending) || pending.length === 0) return "";
  return pending.some((p) => /document/i.test(String(p)))
    ? "Stripe is reviewing the ID you uploaded. This usually takes a few minutes, sometimes up to a business day — you don't need to do anything."
    : "Stripe is verifying the details you submitted. You don't need to do anything — this usually clears within a business day.";
}

/** Rare, but if Stripe blocked the account outright, say why in plain terms. */
export function disabledText(reason: string | null | undefined): string {
  const r = String(reason || "");
  if (!r) return "";
  if (/requirements\.past_due/i.test(r))
    return "Stripe is holding your payouts until the details below are provided.";
  if (/requirements\.pending_verification/i.test(r))
    return "Stripe is still verifying your details before payouts can start.";
  if (/rejected/i.test(r))
    return "Stripe couldn't approve this payout account. Contact us at hello@freddyfixit.ca and we'll help sort it out.";
  if (/under_review/i.test(r)) return "Stripe is reviewing your account before payouts can start.";
  if (/listed/i.test(r))
    return "Stripe needs to review this account before payouts can start. Contact us at hello@freddyfixit.ca if it doesn't clear.";
  return "";
}
