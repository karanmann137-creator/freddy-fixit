// The arithmetic of a mid-job price change — ONE implementation, shared by every
// reader, because four surfaces have to agree on it to the cent:
//
//   1. the client's pending-price panel in ClientDashboard
//   2. the contractor's price-change form in ContractorDashboard (preview)
//   3. the `price_change` branch of `supabase/functions/notify-email`
//   4. the "## If the price changes" clause the client e-signed
//
// Before this existed the client panel showed only "Current: $X → New: $Y" and a
// delta. It never showed the recalculated service fee, the new total, or the new
// balance owed — so a client approving an increase could not see what they were
// about to be charged, and the only surface that spelled it out was the email,
// which (until 2026-11-07) had no `price_change` branch and therefore never sent.
// A number the client reads in an email and cannot find in the dashboard is how a
// dispute starts.
//
// THE FEE RATE IS PRESERVED, NEVER RE-RATED. `client_fee / amount` is the rate the
// client actually agreed to at booking; `platform_fee_rate()` is only the fallback
// for a job that has not been charged yet and so has no `client_fee`. Re-rating a
// live job at the current platform rate would silently move the goalposts mid-job,
// which is the exact thing `jobs.deposit_rate` is stamped to prevent on the other
// half of the split. A waived fee is rate 0 and must stay 0 through a change.
//
// MONEY GUARDS: this module touches NONE of the four payout guards. It is pure
// arithmetic for display — no reads, no writes, no network. `balanceOwed` is a
// browser-side estimate of what `create-balance-payment` will ask for; it is
// deliberately allowed to be no lower than the server's figure (see
// `src/lib/jobFunding.ts` on browser predicates being stricter, never looser),
// which is why it floors at 0 rather than ever reporting a negative balance.

const r2 = (n: number) => Math.round(Number(n) * 100) / 100;

export type PriceChange = {
  /** The price the client agreed to before this change. */
  oldPrice: number;
  /** The price being proposed (or, on the pre-work branch, already applied). */
  newPrice: number;
  /** newPrice - oldPrice. Positive = an increase. */
  delta: number;
  /** The fee rate actually in force on this job (0 when waived). */
  rate: number;
  /** The service fee that applied at the old price. */
  oldFee: number;
  /** The service fee recalculated on the new price, at the same rate. */
  newFee: number;
  /** Old price + old fee. */
  oldTotal: number;
  /** New price + new fee — what the job costs in total if this is approved. */
  newTotal: number;
  /** What the client has already paid in (deposit, balance, top-ups). */
  funded: number;
  /** newTotal - funded, floored at 0. What is left to pay. */
  balanceOwed: number;
  /** True when money has already been collected and is being held. */
  isHeld: boolean;
  /** True when this is an increase (above a half-cent, to dodge float noise). */
  isIncrease: boolean;
  /** True when this is a reduction. */
  isReduction: boolean;
};

/**
 * Compute the full picture of a price change from the job row.
 *
 * Two shapes reach this, and they carry the old and new price in DIFFERENT
 * columns — read the shape off the job, never off a caller's argument:
 *
 *  - HELD (money already collected): `jobs.amount` is still the agreed price and
 *    `jobs.price_change_pending.amount` is the proposal. Nothing is applied until
 *    the client approves, so old = amount, new = pending.amount.
 *  - UNPAID (pre-deposit): `propose_price_change()` applies the new price
 *    immediately and stamps the old one into `price_hike_from`, then clears
 *    `client_approved_at` so the client must re-approve. So old =
 *    price_hike_from, new = amount.
 *
 * @param job         the job row
 * @param fallbackRate `platform_fee_rate()` — used only when the job has no
 *                     `client_fee` to derive the agreed rate from
 * @param feeWaived   true when this job's fee is waived (referral reward)
 */
export function priceChangeMath(job: any, fallbackRate: number, feeWaived = false): PriceChange | null {
  if (!job) return null;
  const isHeld = job.payment_status === "held";
  const pending = job.price_change_pending ?? null;

  const oldPrice = isHeld
    ? Number(job.amount ?? 0)
    : Number(job.price_hike_from ?? job.amount ?? 0);
  const newPrice = isHeld
    ? Number(pending?.amount ?? job.amount ?? 0)
    : Number(job.amount ?? 0);

  if (!Number.isFinite(oldPrice) || !Number.isFinite(newPrice)) return null;

  // The agreed rate, in order of trustworthiness: a waiver beats everything, then
  // the rate the client was actually charged, then the live platform rate.
  const rate = feeWaived
    ? 0
    : (job.client_fee != null && Number(job.amount) > 0
        ? Number(job.client_fee) / Number(job.amount)
        : fallbackRate);

  const oldFee = r2(oldPrice * rate);
  const newFee = r2(newPrice * rate);
  const oldTotal = r2(oldPrice + oldFee);
  const newTotal = r2(newPrice + newFee);
  const funded = Math.max(Number(job.funded_amount) || 0, 0);
  const delta = r2(newPrice - oldPrice);

  return {
    oldPrice, newPrice, delta, rate,
    oldFee, newFee, oldTotal, newTotal,
    funded,
    balanceOwed: Math.max(r2(newTotal - funded), 0),
    isHeld,
    isIncrease: delta > 0.005,
    isReduction: delta < -0.005,
  };
}

/** `$1,234.56` — one money formatter so the four surfaces punctuate alike. */
export function pcMoney(n: number) {
  return "$" + Number(n ?? 0).toLocaleString("en-CA", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/** `3%` / `2.5%` — the agreed rate as the client sees it on their receipt. */
export function pcRateLabel(rate: number) {
  return (Math.round(rate * 1000) / 10) + "%";
}
