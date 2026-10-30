# Clients

- **`ClientOnboarding.tsx`** — **five step IDs, four or five screens** (see *Approximate location* below): describe + postal/area → *confirm (conditional)* → photo → details → account. **Step IDs are append-only and NOT positional** — `FULL_PATH` / `SHORT_PATH` / `visiblePath` carry the order, ids only have to be unique, and the governing invariant is that `step` is always on `visiblePath`. `STEP_TITLES` and `STEP_NAMES` are indexed by `step - 1`, i.e. **by ID, not by position**, which is why `S_PHOTO = 5` sits last in both arrays while appearing third on screen: `STEP_NAMES` are PostHog funnel keys, so a new step **appends** a name and never inserts one, or every historical funnel silently re-labels itself. The 2026-09-09 pass moved the postal code up beside the description (it is the one answer that decides who even sees the job) and gave the photo its own screen (it was competing with the quick questions and losing — the nudge fires on a screen with nothing else on it). Google one-tap is on the **final account step** (2026-08-24 — moved from the top of step 1, so it now sits alongside the email/password fields it's an alternative to, rather than above a job description it has nothing to do with). Phone optional, auto-formatted; **location is a postal code + area chip, never a street address**. Validation scrolls to the first error (`co-err-*` ids). `NewRequest.tsx` is the short returning-client form ("same as last time?"), reached because ClientOnboarding branches logged-in → NewRequest. `?pro=` pre-targets a favourite. `AddressAutocomplete.tsx` (Photon / photon.komoot.io, OpenStreetMap, **no API key**, Calgary-biased, 280ms debounce, silently degrades to plain typing) is still the address input — it just moved to the one place a street address is now collected, `ConfirmAddress`.
- **"What happens next" is ONE renderer mounted on BOTH terminal screens — `NextSteps({email, signedIn})` in `ClientOnboarding` (2026-09-09).** There are two end-of-signup screens and only one of them is the common path: **`verifyEmail`** is what almost everybody sees (with email confirmation on, signup returns no session, so `submit()` returns early there) and **`success`** is the session-exists path. They looked like one screen to whoever wrote them and had been drifting ever since — the `autopayNote` shape, so the promise now lives in one place and the caller passes only what differs. The steps are **ordered by what the client can actually do**: a signed-in client gets "open your dashboard" first; someone waiting on a confirmation link gets the email first, because listing a step they can't do yet reads as an instruction that doesn't work. On `success` it sits **after** the two photo notices and **before** the referral card — a photo that failed is something that went wrong and must be read first, and an ask never goes above instructions. **The spam line is the load-bearing one.** Signup confirmation still travels a different **transport** (SMTP via GoTrue) from everything else we send (the Resend API), and it is the one path nothing in our code can retry into; in Aug 2026 it broke and three accounts were silently locked out, found only because one of them phoned. So the copy names the second email, says plainly they can't sign in until they click it, names `noreply@freddyfixit.ca`, and offers `hello@freddyfixit.ca` — turning silence into a reply. **It deliberately agrees with `client-welcome`**, which already says the same three things; a client who reads both must not find them contradicting each other about which email is which.
- **Base prices** — `service_pricing` table (label PK → base_price / typical_low / typical_high / unit) for all 23 services, public via `get_service_pricing()`; `src/lib/servicePricing.ts` (`useServicePricing()` cached once/session, `rangeText`/`fromText`/`money`). Clients see "from $X" in the picker and a typical range on the lead form; contractors get a base-price box with a one-tap "Use base price" plus optional min–max inputs (`price_low`/`price_high`/`used_base_price` on `bids` and `jobs`).
- **Client dashboard** sidebar: My Requests / Messages / My Pros / Recurring Plans / History / Profile / Settings. **Needs your attention** ordered money-first (contract → balance → price change → schedule → walkthrough → confirm → bids), each row carrying `ownsScroll` and an anchor (`ffc-price`, `ffc-sched`, `ffc-hike`, `ffc-walkthrough`, `ffc-confirm`, `ffc-bids`).
- **My Pros** — `favorites` + `toggle_favorite(uuid)`, `list_my_pros()` (worked-with OR favorited; jobs_together, last_service, rating). Rehire routes to `/client-onboarding`. The same list also renders as a **"Book a pro you've used before"** strip on the Requests (home) tab — first 6, horizontally scrolling, one "Book again" per card, with an "All N pros →" link once there are more than 3. It sits **below Needs-your-attention on purpose** so money-gating rows still come first, and it renders above the empty state too, since a returning client with no open request is exactly who should see it. Rebooking is the cheapest job on the platform to win and it was one tab deep.
- **Self-serve deletion** — `delete-account` edge fn + `DeleteAccount` component (inside SettingsPanel), with re-signup flagging for poorly-rated contractors.
- **Google review popup** — `src/lib/reviewPrompt.ts` fires `ff:google-review`; `GoogleReviewModal.tsx` listens. Three moments only (account created, job posted, job done), localStorage-deduped with a ~21-day cooldown and a "Don't ask again" opt-out. URL `https://g.page/r/CYvpOy2pJh_YEAI/review`.
- **ChatWidget** — AI assistant; the floating bubble hides on dashboards but the panel stays mountable so `ff:open-chat` still works.

## Approximate location (2026-09-09)

**Nobody gets a street address until the client has picked a pro.** A request is
readable by up to seven dispatched contractors, so booking now collects a
**postal code + area chip** and nothing else; the full address is confirmed once,
by the client, immediately before the deposit. This is structural rather than a
policy someone has to remember — **a `jobs` row does not exist until a bid is
accepted**, and `jobs.service_address` is the only column that ever holds a
street address, so there is no row for it to leak from at bid stage.

**`src/lib/calgaryAreas.ts` is the single source of the eight zones** (`AREAS`,
plus `isPostalCode` / `normalizePostal` / `fsaOf` / `areasFromPostal` /
`areasFromText` / `areaToken` / `formatApproxLocation` / `approxLabel` /
`parseApproxLocation`). The client side and the contractor side each held their
own copy of that list before this landed, **and one is matched against the other
by every matcher on the platform** — a drift there surfaces as jobs quietly never
reaching a pro, never as an error.

**⚠️ BOTH halves of the stored string are load-bearing.** `formatApproxLocation`
emits `"T3A 1B2 · NW Calgary"`, and three server-side things that predate it read
that raw text: `mask_location()` pulls a postal code AND a zone out of it,
`list_open_jobs()` regexes the same quadrant/town tokens to rank in-zone jobs
above out-of-zone ones, and `dispatch-job`'s subject line names the area. A
postal code with **no** area token is still a non-empty string, so a bare "is it
blank?" check passes — and the request then ranks out-of-zone for every
contractor, silently, with nothing anywhere saying so. That is the `trade_reach` /
Locksmith failure shape. `NewRequest`'s validator therefore requires the two
halves **separately, with distinct messages**, and only offers "same as last
time" when `parseApproxLocation` returns both. The chosen format is one
`mask_location` maps to **itself**: there is nothing left to hide from a bidding
pro because we never collected it.

The FSA→area table is a **pre-tick convenience only** — it suggests, the client
can always correct it, and an unknown FSA suggests nothing rather than guessing.
It lives in the frontend, correctable without a migration, precisely because a
postal-code map is the kind of data that is 95% right and stays that way.
`parseApproxLocation` is deliberately tolerant rather than an exact inverse,
because a **legacy** `client_requests.location` is a full street address — it
lifts the postal code out and drops everything else, since re-deriving an address
from an address is not the job.

**The deposit gate — `src/components/ConfirmAddress.tsx`.** `jobs.service_address`
/ `service_address_at` plus `confirm_job_address(uuid, text)` (own-row, revoked
from `public`/`anon`, granted to `authenticated`). The component exports
`ADDRESS_ANCHOR` and **`addressMissing(job)`**, which is the one predicate shared
by the renderer, the attention row, `focusAddress` and the `payForJob()` guard —
the `photosMissing` / `canWithdraw` idiom, so those four can never disagree. It
is mounted in both deposit panels through a **single shared `patchJobAddress`
handler**, the `autopayNote` shape, so the two mounts cannot drift.
`AddressAutocomplete.tsx` did not go away; it moved here, to the one place a
street address is now collected.

**"Use my current location" is a shortcut INTO the text field, never a submit
(2026-09-09).** `navigator.geolocation` → Photon's keyless `/reverse` endpoint —
the same OpenStreetMap geocoder the autocomplete already uses, so it adds no
vendor, no API key and no new sub-processor (Komoot GmbH was already disclosed;
the Privacy Policy row and §3.2 were widened to name the coordinates, since
precise device location is a distinct category from an address someone typed).
A frontend API key would sit readable in a PUBLIC repo anyway, which is why a
paid geocoder was rejected.

**It fills the input and stops.** On a desktop the browser has no GPS and
derives the position from IP, which in Calgary lands on the city centroid
remarkably often; reverse geocoding also returns the *nearest addressable
thing*, which on a corner lot or an acreage is the neighbour. So the client
reads it, corrects it, and presses Confirm themselves — one tap before a
deposit is the wrong place to be confidently wrong. It requires a result
carrying a **house number**, because "Tuscany, Calgary, Alberta" in an address
field is worse than an empty one: it looks finished. It reuses the
autocomplete's **structured-field** `inServiceArea` test rather than a regex
over the joined string (the old unanchored `/alberta|AB/i` matched any address
containing the letters "ab"), and the same display-string assembly, so a typed
pick and a located one are stored in the same shape.

Every failure path — denied permission, no API, timeout, network, no match,
out of area — leaves the field exactly as the client left it and says one short
sentence. `locNote` is deliberately **separate from `err`**: `err` is the RPC
refusing to save, which stands between the client and paying; a geolocation miss
is a convenience that didn't work, and dressing them the same would make the
second look like the first.

Two scoping decisions carry the risk:

- **The gate is frontend-only, deliberately NOT a fail-closed check in
  `create-payment-intent`.** A fail-closed payment gate has made every job
  unpayable twice (`fa5e2b5`). The worst case here is a job charged without a
  confirmed address, which is a phone call; the worst case there is the whole
  platform unable to take money, with no error anywhere.
- **It gates the DEPOSIT only. Both Pay-the-balance buttons stay ungated.** A
  legacy job has no `service_address` at all, so gating the balance would stall
  money that is already owed on work already done — the ghost-client stall, which
  card-on-file, `run_reminders()` step 8 and `escalate_unpaid_balances()` all
  exist to prevent.

**MONEY: touches none of the four payout guards.** `confirm_job_address` writes
two non-money columns and nothing else — no charge, no transfer, no status
change, and it cannot affect `funded_amount` or `fully_funded`. `jobDestination(j)`
on the contractor side is a pure display helper returning `{text, exact}`: the
approximate location until the address is confirmed, the real one after.

---

