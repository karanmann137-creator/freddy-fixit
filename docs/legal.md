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

## Terms acceptance — the dated record and the blocking gate (built 2026-11-16)

Before this, **nothing recorded that anyone had ever accepted anything.** The signup checkbox was validated in the browser and then thrown away, so the platform had no answer to "which version did this person agree to, and when" — the one question a PIPA complaint or a disputed job actually turns on. That gap is now closed in two halves, and the halves answer different questions: the **record** is the evidence, the **gate** is how a version change reaches the ~40 accounts that signed up under the old wording.

**The version is a DB value, not a constant in the bundle.** `platform_settings.terms_version` (seeded `"2026-11-16"`), read by `current_terms_version()`. Publishing new terms is one `update` — no deploy — and because `accept_terms()` stamps the version **itself**, server-side, the browser cannot claim an acceptance of a version it made up. `terms_status()` returns `{version, accepted_version, accepted_at, needed}` where `needed` is `(accepted_version is distinct from current)`. Rows live in `public.terms_acceptances` (user_id, version, surface, accepted_at), unique on `(user_id, version)` so a re-tick is idempotent, RLS on with **exactly one policy — SELECT** (`auth.uid() = user_id or is_admin()`): there is no INSERT policy anywhere, so the only way a row appears is through `accept_terms()`, the same append-only shape as `admin_audit_log`. `admin_terms_tail(p_limit)` is the owner-visible read. All four functions test `auth.uid() is null` **first** and pin `search_path to 'public','extensions','pg_temp'`.

**`surface` is the whole point of the record being more than a boolean.** It says *where the person was standing* when they agreed — `signup-client`, `signup-contractor`, `new-request`, `bid`, `pay`, `sign-contract`, `reaccept` — which is what turns a row into evidence rather than a timestamp.

**The gate blocks the ACTION, never the arrival.** Owner decision, and it is a product decision not a technical one: a returning user browses the whole site freely and meets the sheet only when they try to do something consequential. Deliberately **not** a dismissible banner (a banner collects nothing) and deliberately **not** a block on first page load (that is a wall in front of a marketplace).

**`ensureTermsAccepted(surface)` in `src/lib/terms.ts` is the ONE asker, and it FAILS OPEN — twice over.** A failed `terms_status()` read returns `needed:false`, and so does finding **no sheet mounted**. That is the opposite of `askConfirm`, whose promise only settles when `<ConfirmDialog>` closes — "forget to mount it and the button hangs forever with no error." Hanging a bid, a payment or a signature on a consent sheet is a far worse failure than missing one acceptance, so this gate cannot hang by construction. **The price of failing open is that a dropped mount is SILENT** — it does not throw, does not fail the build and shows no blank screen; it just quietly stops asking anyone. That is textbook `tools/check_mounts.py` membership, which is why `<TermsSheet` is a needle there alongside the three call sites.

**Three gated call sites, and `check_mounts.py` is the list that must stay true:**

| surface | file | placed |
|---|---|---|
| `bid` | `src/pages/ContractorDashboard.tsx` | last in `placeBid`, immediately before `setBusyBid` |
| `pay` | `src/pages/ClientDashboard.tsx` | in `payForJob`, after the `contractBlocked` / `addressMissing` gates, before `askConfirm` |
| `sign-contract` | `src/components/ContractPanel.tsx` | **twice** — once in `contractorSign`, once in `clientSign` |

**The gate always goes AFTER the action's own validation.** Nobody should be handed a terms sheet instead of the "enter your bid amount" error they were about to get, and nobody should read "Pay $740?" and then get a second sheet on top of it. A `false` means they saw the sheet and declined, so every call site abandons **quietly** — no `notify()`, no `setErr`.

**⚠️ `ContractPanel` carries two gates rather than one, on purpose, and `MIN_COUNTS` holds it at 2.** `invokeSign` is the obvious single choke point, but in `contractorSign` it runs *after* `save_contract_draft` has already written — a gate there would leave a partial write behind a refusal. Two sibling functions, one gate each, pre-empts the asymmetric-sibling shape that bit `AuthCallback`'s `?role=` clamp, where one branch guarded and its twin did not. A plain `in` test passes while one of two identical needles is gone; `MIN_COUNTS` is what makes losing one visible.

**Four recording surfaces, which RECORD rather than gate.** `NewRequest` calls `acceptTerms("new-request")` directly — the form's own checkbox *is* the acceptance, so gating there would ask for a tick just given. It is fire-and-forget after the insert has already succeeded: the request must not be held up, and a failed write just means the gate catches them later.

**Signup needed a detour, because `accept_terms()` needs `auth.uid()` and both onboarding flows return early with NO SESSION on the email-confirmation path.** So the tick is stashed in `localStorage` (`ff_terms_pending`, 7-day expiry, carrying the surface) by `stashTermsConsent()` and redeemed by `redeemStashedTermsConsent()` — immediately on the session path, otherwise by `AuthCallback` when the person clicks the link. **⚠️ `AuthCallback` redeems the STASH; it must never record unconditionally.** That page also serves Google sign-ins, where no checkbox was ever shown — recording there would be **forging consent nobody gave**. With no stash it does nothing at all. The stash is per-browser, so a confirmation link opened on a different device loses it; that is not a bug, the person then meets the blocking gate at their first consequential action, which is the designed fallback. Redeeming follows the welcome-email rule — **never worth an account** — so it is fire-and-forget, the stash survives a failed write for the next callback to retry, and it is cleared only on success or expiry.

**What this does not have, and the honest limitation:** acceptance has never been recorded before, so every one of the ~40 existing accounts reads as owing one, with no baseline to compare against. The first weeks of `admin_terms_tail` are therefore a record of *this* rollout, not of historical consent — and nothing retroactively evidences the ticks already thrown away.

**When you publish new terms:** update the page text, `update platform_settings set value = '"YYYY-MM-DD"' where key = 'terms_version'`, and send the **UA §12 14-day email notice** — the gate collects acceptance, it does not give notice. **And when you add a new consequential action, add a gate to it and a needle to `check_mounts.py` in the same ship.** The three rows above are the whole list; a fourth consequential action with no gate is invisible from every surface at once.

---

