# Open / queued

- **Owner action, cosmetic: remove the four tombstoned edge functions** (`send-reminder`, `send-welcome`, `remind-contractor`, `resend-domains`) in Supabase Dashboard → Edge Functions → Delete. They already send nothing and hold no secrets; the MCP just has no delete tool.
- **Prepaid-contracting licensing** (contractor licence + bond; whether the platform needs its own) — lawyer + Service Alberta. Blocking-risk item.
- **The dispute branch is still production-untested** — the held→release path ran live on 2026-08-30, but no job has ever reached `disputed`, so `resolve-dispute` has never executed against real money.
- **The ghost client is now covered end to end (2026-08-31)** — card-on-file collects the balance automatically, `run_reminders()` step 8 nudges when it can't (24h/3d/7d), and `escalate_unpaid_balances()` hands the job to the owner at 10 days. **Card-on-file has never charged a real card**, only an empty candidate set; treat it as unproven until it has.
- Seed contractors Slone (`a01c49f7-0ba6-4e0a-bc81-aba53baebcb7`) and Justin (`44748517-72d6-440a-ab06-b13e2660cc80`) still have NULL `company_name` + vetting answers — owner to provide.
- `review-contractor` sometimes records `review_status='rejected'` with an empty `review_result={}`.
- **Decide the social bot's fate — finish it or delete it whole.** `social-bot-brain` and `social-bot-harness` are deployed and, by design, can only write a PROPOSAL into `social_actions` and wait for a human. `admin_list_social_actions` / `admin_review_social_action` are that human-approval half — and **no UI was ever built for them**, so they read as dead code. They were deliberately spared in the 2026-08-23 cleanup: cherry-picking the approval half out of a human-in-the-loop safety design is the worst of both worlds, because switching the bot on would then pile up proposals with no way to review them. All of `social_actions` / `social_conversations` / `social_messages` / `social_leads` are at **0 rows** — the bot has never run. Either build the admin tab or drop the two RPCs, the two edge functions and the four tables together.
- **`insurance_on_file` must gain an expiry test** once `insurance_expiry_date` is a real parsed date — showing "insurance on file" for a lapsed policy is worse than showing nothing, because the client relies on it.
- **Two-step sign-in is opt-in and nobody is enrolled yet.** `admin_guard()` therefore behaves exactly like the old `is_admin()` check until the owner enrols. Enrolling is the point; until then the second factor is inert.
- Keep this file + `src/CLAUDE.md` + `supabase/CLAUDE.md` current as features land.

# Privacy / safety
- Repo is PUBLIC → never commit secrets (service-role key, Stripe keys, Resend key) or user PII (real contractor/client emails, phones, names). Reference seed rows by UUID; look up details in the DB when needed.
- Business contacts only: admin `hello@freddyfixit.ca`, from `noreply@freddyfixit.ca`, newsletter `tips@freddyfixit.ca`.
