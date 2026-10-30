# Notifications & email

## Pausing outbound email (2026-08-19)
**There is ONE switch, not two.** `public.outbound_paused()` = `platform_mode() in ('paused','waitlist')` — it owns no flag of its own, it reads the site pause the admin Platform tab already sets. So **`set_platform_mode('open')` turns every emitter back on by itself**; there is nothing to remember to flip back, which is the whole point (a second switch is one somebody forgets, and then the site reopens silently and nobody hears from us).

Gated with an early return: `trg_dispatch_new_request`, `kick_newsletter`, `kick_visit_reminders`, `run_reminders` and the job-thread branch of `notify_new_message`. The two Database Webhook triggers — `"send-notification-email"` on `notifications` and `"notify-admin-client "` on `client_requests` (**trailing space, load-bearing**) — were **recreated with a `WHEN` clause** rather than `ALTER TABLE … DISABLE TRIGGER`, because a WHEN clause is self-re-arming and a disabled trigger needs a manual, forgettable reversal. A trigger WHEN clause may **call a function but may not contain a subquery**, which is why the health-check exemption is keyed on `NEW.type = 'health_alert'` and not on a `profiles` lookup of the admin recipients.

**The in-app 🔔 survives the pause** — the `notifications` ROW is still inserted, only the email fan-out is suppressed. Unread counts, badges and `my_conversations()` are untouched.

**Gate placement is deliberate.** In `notify_new_message` it sits *before* the `message_email_log` upsert so the 15-minute throttle isn't burned on a message nobody was told about. In `run_reminders` it's the very first statement so `reminder_log` and `visit_reminder_sent_at` are never stamped — nothing is permanently skipped, the nudges just resume.

**Not gated, on purpose:** `enqueue_admin_alert` and the `health_alert` type (the owner's only warning system while the site is dark — his call); payment receipts and the money sweeps `reconcile-payouts` / `auto-confirm-stale-jobs` / `release-unconfirmed-visits` (a payout that is owed is owed whether or not we're open — also his call); **GoTrue auth mail**, since silencing signup confirmation and password reset reproduces the Aug 2026 lockout incident exactly; and **both signup welcome emails** (see below).

**Signup welcome mail was un-gated on 2026-08-23 — owner's call, and it belongs with GoTrue.** `send_contractor_welcome` used to return early on `outbound_paused()`, so a pro who signed up during the pause heard *nothing at all* from us. That is the Aug 2026 shape exactly: our welcome was the only mail that reliably reached a new account, so muting it makes a broken GoTrue confirmation completely invisible — no welcome, no confirmation, no error, nothing to reply to. The pause is about not soliciting people, not about refusing to answer someone who just handed us their email address. Instead of a gate, **the copy is mode-aware**: in `waitlist`/`paused` the client email says plainly that we aren't taking jobs yet, rather than promising estimates that can't arrive. Verified with a rolled-back probe under `outbound_paused() = true`: both welcomes still enqueue, and a contractor signup does not enqueue a client email.

Cron stand-down is belt-and-braces — the real guarantee is `outbound_paused()` **inside** each emitter, so hand-re-arming a cron job still can't send mail while the site is paused. While paused, 4 jobs run (`reconcile-payouts`, `auto-confirm-stale-jobs`, `release-unconfirmed-visits`, `platform-health-check`) and 6 are stood down (`daily-reminders`, `visit-reminders`, `newsletter-client`, `newsletter-contractor`, `refire-stale-requests`, `escalate-unbid-requests`).

**`set_platform_mode`'s quiet-list had a gap** — it named only three cron jobs, so `newsletter-contractor` stayed armed for the entire pause and kept firing every Tuesday 16:00 UTC at 25 subscribers with 8 issues queued. It now names all six. If you add an outbound cron job, add it to that list *and* gate its `kick_*` function; the list alone is not the guarantee.

## The duplicate-email rule
A **Database Webhook fires on EVERY `public.notifications` INSERT** → `send-notification`. Some notification types are ALSO emailed by a richer, dedicated function. When that happens the type goes in **`EMAIL_HANDLED_ELSEWHERE`** in `send-notification` — the in-app 🔔 still writes and shows, only the generic email is skipped.

Current set: `job_in_field`, `rehire_request`, `contractor_guide`, `chat_time_proposed`, `chat_time_agreed`, `visit_reminder`, `bid_received`.

**Before adding a type, verify it has exactly one emitter** — suppressing a type with several emitters silently kills legitimate mail. Conversely, a genuinely transactional type (`visit_slot_released`, `contract_signature`) is deliberately left OUT so it does email.

Historical duplicates fixed: the legacy `notify-admin-contractor` trigger duplicated `contractor-welcome` + `admin-alert` (dropped; `notify-admin` v17 reduced to client-confirmation-only — note the sibling trigger name **`"notify-admin-client "` has a trailing space**); `job_in_field` doubled with `dispatch-job`; `rehire_request` doubled with `dispatch-job` inside the 48h reservation window (fixed by making dispatch-job v16 reservation-aware rather than dropping the richer email); `bid_received` doubled with `send-bid-email`, whose copy carries the pro's name, the price and the one-tap `/pick/<token>` link while the generic one only offered a login wall.

**`notify_user` double-sent all thirteen of its types, and it did it in a way the suppression set could never have caught (2026-08-23).** The helper wrote the bell row — firing the webhook, which emails — **and** separately posted the same title and body to the `send-reminder` edge function, which emailed a second, thinner copy from the same address. `EMAIL_HANDLED_ELSEWHERE` was no defence: it suppresses the *webhook's* email in favour of a richer one elsewhere, and here the webhook's copy was the better of the two. **The duplicate emitter has to be found by reading the emitting function, not by reading the type list.** The post is gone, `send-notification` v16 is the sole emitter for those types, and `send-reminder` — the open relay described in the security section — lost its last caller as a result and is now a 410 tombstone.

Two things that were being lost with it, and one that wasn't. `notify_user` carried a per-call CTA the webhook cannot see, because **the `notifications` table does not store one**; eleven of the thirteen pointed at the dashboard `dashboardFor(role)` already resolves, so those lost nothing. `recurring_due` and `seasonal` pointed at `/new-request` — they are re-booking nudges, and sending them to a dashboard with nothing on it would put a click between the nudge and the thing it nudges — so they are preserved explicitly in `CTA_OVERRIDE` in `send-notification`. **Keep that map small and justified**: the dashboard is the right destination for nearly everything, because it is where the thing being notified about actually lives.

The direct post was also **invisible to `outbound_paused()`**. The webhook honours the pause through its trigger `WHEN` clause, but a raw `net.http_post` in a function body answers to nothing — so while the site sat in `waitlist`, the *only* mail going out for those thirteen types was the thin duplicate, and it was going out precisely when the pause said nothing should. A new `net.http_post` in a function body is a pause bypass unless the function calls `outbound_paused()` itself.

## Routing
`src/lib/notificationRoutes.ts` — `noteTarget(type, jobId, dashboardPath)` → `{path, tab?, jobId?}`. `PAGE_BY_TYPE` handles dedicated pages (`contractor_guide → /contractor-guide`); then a per-role map resolves the tab (~42 types enumerated by regexing `pg_proc.prosrc` for `_notify`/`notify_user`). **Unknown types fall back to the dashboard root**, so a new type can never break navigation.

Because wouter no-ops on same-path navigation, `openNote` dispatches a `ff:dash-nav` CustomEvent when already on the target path, and otherwise navigates to `?tab=…&job=…`. All three dashboards mount `readDashNavFromUrl()` + `clearDashNavFromUrl()` (a `history.replaceState` so a later refresh isn't yanked back) and validate the tab against their own nav array. Contractor also clears `jobFilter` (a stage filter could hide the very job being opened) and scrolls to `#job-<id>`.

**`job_id` is NULL on ~94% of notifications**, so type→tab routing is the workhorse; `?job=` deep-linking is a bonus. Backfilling `p_job` across ~30 notifier functions was deliberately NOT done.

Sidebar badges render on the collapsed/mobile icon rail too (absolutely-positioned orange pill, `9+` cap).

## Edge functions that send
`send-notification` (webhook fan-out) · `notify-email` (v8, `verify_jwt=false`, `contract_copy` — **write-once**, guarded by `contract_copy_sent_at` with an `.is(...,null)` update so the Alberta 10-day clock can't be reset) · `dispatch-job` (v16, subject **"URGENT — new {service} job in {area}, bid now"**, reservation-aware, `BID_CAP = 7`) · `notify-accepted` · `admin-alert` (new_contractor / new_job to hello@, fired by AFTER INSERT triggers via `net.http_post`, wrapped in `enqueue_admin_alert` so a mail hiccup never blocks the insert) · `contractor-welcome` (v2, leads with the guide; fired by the `contractor_welcome_email` AFTER INSERT trigger → `send_contractor_welcome()`; **no expiry** — a leftover campaign guard in that fn would have silently no-opped from Sept 12) · **`client-welcome`** (v1, 2026-08-23 — see below) · `payment-receipt` · `visit-reminder` (**email OFF**) · `support-request` · `admin-message` · `finish-signup-nudge` · `contractor-outreach` (v13) · `newsletter-send` / `newsletter-unsubscribe` / `newsletter-ai-draft` · **`mfa-code`** (v1, two-step sign-in codes, gated on `x-ff-internal`).

**`client-welcome` (2026-08-23) — clients had never had a welcome email at all.** Contractors have had one since launch; a client signed up and the only thing that ever reached them was a GoTrue confirmation from a sender they don't recognise. Fired by the **`client_welcome_email` AFTER INSERT trigger on `public.profiles`, `WHEN (new.role = 'client')`** → `send_client_welcome()`. On `profiles` rather than `auth.users` because the role lives there and a WHEN clause is the cheapest filter — which also means `ensure_profile()`'s orphan repair sends it, the one case where somebody most needs to hear from us. `verify_jwt=false`, `{test:true}` previews to hello@.

**The load-bearing paragraph is the one naming the second email.** It says a separate confirmation is coming, to check spam, that they can't sign in until they click it, and to **reply to this email** if it doesn't arrive — so the Aug 2026 failure produces a reply instead of silence. The rest of the copy is mode-aware (`platform_settings.mode`, defaulting to `open` on any read failure, since the open copy is the superset), and it carries the referral code worded as **one friend**, matching `apply_referral_code` — promising "invite your friends" and then refusing the second one would be our bug showing up as their embarrassment.

**v2 (2026-08-30) dropped the words "different sender".** The paragraph originally told clients the confirmation mail came from a sender other than this one, which was true right up until GoTrue was pointed at Resend over SMTP on the same `noreply@freddyfixit.ca` address. **The paragraph itself stays, and that is the point** — it is still a second *transport*, and still the one nothing in our code can retry, so naming it is what turns a silent lockout into a reply. Only the sender claim changed.

`send_client_welcome()` is wrapped in its own exception block because it runs **inside the signup transaction**; an unguarded raise would roll back the profiles insert and orphan the auth user, which is the exact shape of the bug that killed every signup for a month. **A welcome email is never worth an account.**

**Neither welcome trigger carries an anon JWT any more.** Both target `verify_jwt=false` functions, so the bearer bought nothing — verified by posting to `contractor-welcome` with no `Authorization` header and getting its own `400 {"error":"missing id"}` back, which proves the body ran. `pg_proc.prosrc` is publicly readable and the repo is public.

**CASL:** mailing address `20 Whiteram Mews NE, Calgary`, `List-Unsubscribe` + `List-Unsubscribe-Post` headers (Gmail one-click sends **POST**, per RFC 8058), and unsubscribe handled **before** any auth gate, always returning the same page (no id-existence leak).

**DKIM:** an outage once killed ALL platform email — a second, truncated TXT record at `resend._domainkey.freddyfixit.ca` with no `p=`. Check for stray records first if Resend returns "domain not verified". **Since 2026-08-30 this is worse than it was**: auth mail rides the same key, so a DKIM fault now locks people out of their accounts as well as silencing receipts.

**⚠️ There WERE two email systems; since 2026-08-30 both are Resend — but they are still two different SENDERS with different failure modes.** Everything above — welcome, dispatch, receipts, reminders, newsletter — is ours, sent from edge functions via the Resend **API** as `noreply@freddyfixit.ca`. **Signup confirmation and password reset are sent by Supabase's GoTrue mailer**, which until 2026-08-30 was an unmonitored shared sender on a domain we did not own. It is now pointed at Resend over **SMTP** (`smtp.resend.com:465`) with the same `noreply@freddyfixit.ca` sender — so both paths share a domain, a DKIM key and a quota, but they are still **two different transports**, and GoTrue's is the one nothing in our code can retry. In Aug 2026 that path broke on its own: people signed up, got our Resend welcome, never got the GoTrue confirmation, and were **silently locked out with no error visible to anyone**. Three accounts were stranded — one an already-approved contractor who had been receiving job emails for five days that he could not act on — and we only found out because one of them phoned. Password reset runs through the same mailer, so "just reset your password" fails too and is not a workaround. That specific outage is closed, but the shape can recur any time GoTrue's transport fails, which is why `auth-rescue` exists.

Diagnosing it: **GoTrue returns HTTP 500 on SMTP failure and 200 on a successful handoff**, so triggering a real auth email from Postgres (`net.http_post` → `/auth/v1/recover`, then re-select `net._http_response` after `pg_sleep(12)`) tells you whether the mailer accepted it. A 200 proves handoff, never delivery — only an inbox proves that. The permanent detection net is health check 7 `no_stuck_signups`.

Standing owner instruction: **don't send bulk email without asking.**

## Signup rescue — `auth-rescue` (2026-08-30)

Health check 7 could only ever *tell* us somebody was locked out. `auth-rescue`
is the remedy, and it exists because on 2026-08-30 an account (`auth.users`
`5c597221`) was stuck in exactly the Aug 2026 shape: our Resend welcome arrived, the GoTrue
confirmation did not, no error was visible to anyone.

**This one was a DELIVERY failure, not an outage.** A live `net.http_post` to
`/auth/v1/recover` came back **200**, and `confirmation_sent_at` was stamped —
so GoTrue accepted the handoff and tried. The mail died somewhere past the
sender (spam, recipient filtering, or the reputation of Supabase's shared
free-tier sender), which is a place we have no visibility into and cannot
retry into. **Diagnosing a 200 as "email works" is the trap** — a 200 proves
handoff, never delivery.

**The fix removes GoTrue's mailer from the path while keeping its token
minting.** `admin.auth.admin.generateLink()` returns an action link and **sends
nothing**, so the edge function mints the link and delivers it over Resend, on
the DKIM-verified `freddyfixit.ca` domain that already carries every receipt,
dispatch and reminder we send — the one sender we monitor and whose failures
we would notice.

**A magic link is not a force-confirm, and the distinction is the whole
safety argument.** The recipient still has to receive the mail to use it, so it
proves address ownership exactly as the confirmation email did — it is a change
of *carrier*, not a weakening of verification. `admin.updateUserById({
email_confirm: true })` would unlock an account with no proof at all and was
deliberately rejected. Clicking the link both signs them in and confirms the
address, which is what finally clears health check 7.

**`auth-rescue` v1, `verify_jwt=false`, gated in code two ways.** Either an
`x-ff-internal` single-use token redeemed through `consume_internal_token`
(proving the caller is Postgres) or a real admin JWT resolved via
`admin.auth.getUser()` → `profiles.role`. `verify_jwt` buys nothing here, as
always — the anon key is a valid project-signed JWT and ships publicly.
Verified: a valid anon bearer with **no** internal token gets **403**.
**Identity comes from `auth_rescue_target(p_user)`, never from the request
body** — the body carries a uuid and nothing else, so it cannot name an email
to mail.

Two copy variants. **`apology`** says plainly that this was our fault, that
they did nothing wrong, that the link expires in 24h, and to reply for a fresh
one; **`stuck`** is the gentler automated nudge that suggests checking spam.
Both reply to hello@, so a failure produces a human reply instead of silence —
the same reasoning as the paragraph in `client-welcome` that names the second
email.

The sweep `rescue_stuck_signups()` runs hourly (pg_cron `rescue-stuck-signups`,
`37 * * * *`) over accounts **6h–7d old** with no confirmation and no sign-in,
**max 2 successful rescues ever and none within 24h**, 25 per pass, **each row
in its own exception block** so one bad row can't strand everyone behind it.
`admin_rescue_signup(user, kind)` is the `is_admin()`-gated one-shot and ignores
the cap on purpose. Every send lands in `signup_rescue_log` (RLS on, no policy).

**It is deliberately NOT in `set_platform_mode`'s quiet list.** Silencing signup
rescue during a pause reproduces the Aug 2026 lockout exactly. The pause is
about not soliciting people, not about refusing to answer someone who already
handed us their email address — same call as the two welcome emails and GoTrue
itself.

**The failure class was closed the same day: custom SMTP is now configured
(2026-08-30).** Dashboard → Authentication → Emails → Enable custom SMTP, host
`smtp.resend.com`, port 465, user `resend`, sender `noreply@freddyfixit.ca`,
min interval 10s. GoTrue no longer sends anything itself — confirmation and
password-reset mail now leave over the same DKIM-verified domain, from the same
provider, as every receipt and dispatch we send. A live `/auth/v1/recover`
probe returned **200** afterwards, which now means more than it used to: bad
credentials or a bad host would fail the SMTP connection and return **500**, so
a 200 proves Resend accepted the message. It still does not prove delivery —
only an inbox does that.

**This trades an invisible failure for a correlated one, deliberately.** Auth
mail and transactional mail now share one provider, one domain and one quota,
so a Resend outage or a blown sending limit takes down **both** at once, where
before they failed independently. `auth-rescue` rides Resend too, so it is no
help in that scenario. The trade is worth it because the old independence was
worthless: the second sender was one we did not own, did not monitor, and could
not retry into — an outage there was silent, and silence is what stranded three
accounts in Aug 2026 and one more on 2026-08-30. A shared failure we would
notice within minutes beats a separate one we would learn about by phone.
**Watch the Resend quota as a platform-wide dependency now, not just a
marketing one.**

`auth-rescue` stays as the net underneath: it is what recovers accounts that
were stranded *before* SMTP was fixed, and what catches any future delivery
failure that a 200 hides.

## Newsletter
Sender **tips@freddyfixit.ca** (reply-to hello@). Two audiences: client (home & vehicle tips) and contractor (business tips).

`newsletter_subscribers` (email, audience, first_name, source, `unsub_token`, unsubscribed_at) + `newsletter_content` (audience, seq, subject, preheader, body_md, blog_title, blog_tag, status draft|queued|sent) pre-loaded with a **24-issue bank**. `newsletter_subscribe(...)` RPC (anon+authenticated). pg_cron `newsletter-contractor` (Tue 16:00 UTC) + `newsletter-client` (Thu 16:00 UTC) via `kick_newsletter(audience)`.

**Cadence is biweekly, not weekly (2026-09-24).** The two cron schedules above are unchanged and still fire every Tue/Thu — pg_cron has no native "every N weeks" — so `kick_newsletter()` gates internally instead: `v_weeks := (date_trunc('week', now())::date - '2000-01-03'::date) / 7`, and it returns early on odd `v_weeks` (same early-return shape as the `outbound_paused()` check right above it). Anchoring both audiences to the same fixed Monday epoch is what keeps them synchronized — contractor (Tue) and client (Thu) always fall in the same calendar week, so they can never drift onto opposite weeks. Verified by exhaustive `generate_series` over Sept–Nov 2026: clean 14-day alternation, both audiences always agree on which week is "on."

`newsletter-send` picks the **lowest-seq queued** issue, renders md → branded HTML, and **auto-publishes a `blog_posts` row** when `blog_title` is set. `{test:true}` previews to hello@ only. 5-day per-audience rate guard (it's anon-callable). `newsletter-ai-draft` is admin-gated and **`ANTHROPIC_API_KEY` IS now set** (confirmed 2026-09-03 — this line used to say it was dormant for want of the key, which was stale). It drafts to status `draft` and never auto-sends, so it still cannot mail anyone by itself.

Subscribe surfaces: footer form, and an un-prechecked CASL opt-in on both onboarding flows.

---

