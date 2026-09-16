# Activating meta-lead-scout

**What this turns on:** every 2 hours, Freddy checks your own Facebook Page
comments, your Page inbox (Messenger), and your Instagram comments. Anyone
asking about price, booking, or a broken thing gets flagged as a **client
lead**. Anyone asking to join or looking for work gets flagged as a
**contractor lead**. You get one email with each one, a draft reply, and an
"Open →" button.

**Nothing is ever posted automatically.** You reply by hand, from your own
Page, in your own words. The draft is a starting point.

**Why this and not a Facebook group scraper:** Meta deleted the Groups API on
22 April 2024, so no tool can legally read group posts from a server. This
reads *your own* Page over Meta's official API, which is explicitly allowed.
Zero ban risk.

---

## Verified before writing this (2026-09-03)

| Check | Result |
|---|---|
| Function deployed and reachable | ✅ `meta-lead-scout` v1, ACTIVE, returns HTTP 200 |
| Current state | ✅ `{"ok":true,"configured":false}` — dormant, waiting on secrets only |
| Graph API v23.0 still supported | ✅ live probe returned a normal auth error, not a version error |
| `social_leads` table has every column the function writes | ✅ all 13 present |
| `status` CHECK allows `'emailed'` | ✅ (`new`, `emailed`, `posted`, `skipped`) |
| `lead_type` CHECK allows `client` / `contractor` | ✅ |
| Duplicate protection | ✅ `UNIQUE (platform, external_id)` — the same comment can never be emailed twice |
| Rows in `social_leads` today | 0 — nothing has ever run |

---

## Step 1 — Make a Meta app (5 min)

1. Go to **https://developers.facebook.com/apps** and log in with the Facebook
   account that **administers the Freddy Fix It Page**. This matters — the
   token inherits your admin rights.
2. **Create app** → use case **"Other"** → type **"Business"** → name it
   `Freddy Lead Scout`.
3. Leave it in **Development mode**. You do not need App Review and you do not
   need to submit anything, because you're only ever reading a Page you
   already administer.

## Step 2 — Get a Page token (5 min)

1. Go to **https://developers.facebook.com/tools/explorer**
2. Top right: **Meta App** = `Freddy Lead Scout`.
3. **User or Page** dropdown → **Get Page Access Token** → pick the Freddy Fix
   It Page.
4. In **Permissions**, add all of these:

   ```
   pages_show_list
   pages_read_engagement
   pages_read_user_content
   pages_manage_metadata
   pages_messaging
   ```

   Add these two as well **only if you want Instagram covered**:

   ```
   instagram_basic
   instagram_manage_comments
   ```

   > `pages_read_user_content` is the one people miss. `pages_read_engagement`
   > lets you read your Page; `pages_read_user_content` is what lets you read
   > **other people's comments** on it — which is the entire point here.

5. Click **Generate Access Token** and approve the popup.
6. Copy the token.

## Step 3 — Make the token long-lived (3 min)

The token from Step 2 dies in about an hour. Fix that:

1. Go to **https://developers.facebook.com/tools/debug/accesstoken**
2. Paste the token → **Debug** → **Extend Access Token** at the bottom.
3. Copy the extended token.
4. Paste that extended one back into the Graph API Explorer, then use **Get
   Page Access Token** again to pull a Page token derived from it. **That**
   final token has no expiry date.

⚠️ It still dies if you change your Facebook password, revoke the app, or lose
admin on the Page. If leads stop arriving, this is the first thing to re-do.

## Step 4 — Find your two IDs (2 min)

In the Graph API Explorer, run each of these (button is a right-arrow ▶):

- `me?fields=id,name` while the dropdown is set to your **Page** → the `id` is
  your **META_PAGE_ID**.
- `me?fields=instagram_business_account` → the nested `id` is your
  **META_IG_ID**. Skip if you're not doing Instagram.

## Step 5 — Set the secrets in Supabase (2 min)

1. **https://supabase.com/dashboard/project/kvypmjxbbaaknvddwwai/settings/functions**
2. Under **Edge Function Secrets**, **Add new secret**, three times:

   | Name | Value |
   |---|---|
   | `META_PAGE_TOKEN` | the long-lived Page token from Step 3 |
   | `META_PAGE_ID` | the number from Step 4 |
   | `META_IG_ID` | the Instagram number (skip if not using IG) |

Secrets are project-wide and apply immediately. No redeploy needed.

## Step 6 — Test it (1 min)

Paste this into Terminal:

```
curl -s -X POST https://kvypmjxbbaaknvddwwai.supabase.co/functions/v1/meta-lead-scout \
  -H "Content-Type: application/json" \
  -d '{"test":true}'
```

**Before the secrets are set** you'll get:

```
{"ok":true,"configured":false,"note":"Set META_PAGE_TOKEN + META_PAGE_ID ..."}
```

**After**, you'll get something like:

```
{"ok":true,"configured":true,"scanned":3,"new":3,"emailed":true,
 "scanStatus":{"feed":"HTTP 200","conversations":"HTTP 200","media":"HTTP 200"},
 "resend":"HTTP 200 ..."}
```

`scanStatus` is the part to read. Each line is one of the three sources:

- `feed` = your Page's post comments
- `conversations` = your Page inbox (Messenger)
- `media` = your Instagram comments

`HTTP 200` means that source works. Anything else prints Meta's own error
message next to it — usually a missing permission, and it names which one. A
failure on one source does **not** stop the other two.

In test mode you always get an email even when there's nothing to report, so
you can confirm delivery. Check **hello@freddyfixit.ca**.

## Step 7 — Tell me it worked

Once Step 6 returns `configured: true`, say so and I'll arm the schedule
(a `pg_cron` job every 2 hours). That part is a database change, so I'll do it
properly rather than have you paste SQL. Until then it only runs when you run
that curl by hand.

---

## What to expect once it's live

**It looks back 48 hours** on the first run, then only catches new things. Cap
of 12 leads per run so a busy day can't spam you.

**It will over-flag slightly.** The client filter catches words like *broke*,
*leak*, *not working*, *how much*, *available*. On your own Page that's usually
right, but you'll get the occasional false positive. Since nothing posts
automatically, a false positive costs you three seconds of reading — the trade
is deliberate, because a missed real lead costs a job.

**It skips your own replies**, so it won't flag Freddy talking to itself.

**The same comment is never emailed twice**, enforced in the database, not in
the code — so even if the schedule double-fires you won't get duplicates.

**Reply fast.** The whole reason this exists is that every job you've won so
far came from replying to someone on Facebook. The tool doesn't win the job;
being first does.
