# Legal & compliance

Company entity **Freddy FixIt Contractors Inc.** Pages: `/user-agreement` (incl. Contractor Terms), `/privacy-policy`, `/homeowner-protection-promise` — linked in the footer and gated behind an acceptance checkbox in every signup flow. Onboarding chrome hides most nav but **keeps the legal links reachable**.

**User Agreement** — §6.3 payment reality (charged at approval, held, released on confirmation; now the 40/60 split), §6.7 fees, §6.8 milestone payments, §6.9 concerns/cancellations/refunds, **§6.10 Alberta cancellation rights**, §6.11 e-signature, §7.5 truthful information, **§8 Prohibited Conduct** (one account, no fake requests, no off-platform payment or poaching, no harassment, no unlawful services, no scraping), Contractor Terms §1.e prepaid-contracting licence, §9.4 staged jobs, §9.5 e-signature liability. "Vetted/verified/approved" is explicitly defined as *our review process was completed*, not a guarantee. Amendments require **14-day email notice** (Jiffy's no-notice clause and arbitration clause were deliberately not copied).

**Alberta prepaid contracting.** Money collected **before work is complete** for services performed away from a fixed storefront can make a job a *prepaid contract* — this applies to the single-charge, deposit and milestone flows alike. Owner decision: keep collecting pre-completion payment and add safeguards. Shipped: a **written contract copy emailed at approval** (`notify-email` `contract_copy`, stamping `jobs.contract_copy_sent_at`, which is the audit timestamp the 10-day clock runs from — **write-once**), a 15-day refund path for every held state, and the disclosure clauses above.

**⚠️ STILL OPEN, not resolvable by wording:** prepaid contracting is a **licensing** obligation. Contractors may each need a Service Alberta licence + ~$10k bond, and **the platform itself may qualify as a prepaid contracting business needing its own licence.** Needs a lawyer + Service Alberta.

**Privacy Policy** — Alberta PIPA + PIPEDA; GA4 cookies + opt-out; 7-year payment retention; job media kept with transaction records up to 7 years, profile media best-effort 90 days; OIPC Alberta rights.

## Third-party processors — §6.2 is the ONE list (widened 2026-11-16)

**UA §16.1 points at Privacy Policy §6.2 rather than copying it**: two copies of a processor list drift, and §6.2 is the document a regulator reads. Widened **7 → 11 rows** after an inventory of every external host in `src/` and `supabase/functions/` — added **Anthropic PBC**, **Cloudflare, Inc.**, **Have I Been Pwned (Pwned Passwords)** and **Unsplash**, and folded Google Fonts into the existing Google LLC row (fonts load from `fonts.googleapis.com` on *every* page, so the visitor's IP reaches Google **before and regardless of analytics consent** — that is the part worth saying out loud). New **§6.5** covers the Facebook/Reddit lead scouts as a one-way *read* of public posts; old 6.5 Business Transfers → **6.6**, safe only because nothing cross-references it by number (checked). §7's country list gained Australia and "global network".

New: UA **§16** (Third-Party Services and Automated Processing) and Contractor Terms **§1.f** (How Your Documents Are Verified). **§16 is numbered 16 deliberately — §§5, 6.4, 6.9, 6.10 and 13 are cross-referenced by number from both Parts and from the Privacy Policy, so an inserted mid-document section would silently break every one of them.** §16 uses `className="sec"` against two new rules in the page's injected `<style>` instead of inline `marginBottom`, because `check_ux.py`'s raw-spacing ratchet is at 1467 and two more inline rem literals would have raised it.

**⚠️ The gap that mattered was Anthropic, and its SHAPE generalises: `review-contractor` posts business licences, certificates of insurance, WCB clearances, trade certs and GOVERNMENT PHOTO ID to `api.anthropic.com`, and no legal page said so.** Six more edge functions send user content there too (`scan-image`, `analyze-repair`, `chat`, `newsletter-ai-draft`, `agent-draft-lead`, `social-bot-brain`). **A processor added by writing an edge function is invisible to the legal pages — nothing in the ship path asks "did this add a third party?".** When you add an outbound call to a new host, add the §6.2 row in the same ship. Both new clauses promise the AI is **advisory only, never an automated decision**, which is now a promise the code must keep: `review-contractor` is already ADVISORY ONLY and never touches `contractors.status`. Keep it that way or the policy becomes false.

**Two entity names are unverified** and should be confirmed before a lawyer reviews this: the legal operator of Pwned Passwords (listed as "Have I Been Pwned (Pwned Passwords)", Australia) and Unsplash's post-Getty corporate name (listed bare as "Unsplash", United States). Both are accurate by *function*; only the corporate name is soft.

**⚠️ UA §12 requires 14 days' email notice before an amendment takes effect.** Both pages now read "Last Updated: November 16, 2026", which is a *publication* date, not notice. **Shipping these pages does not send the notice** — that is an owner action.

Consumer-facing wording: say **"held securely"**, never "escrow" — the Stripe held balance is not a trust account.

---

