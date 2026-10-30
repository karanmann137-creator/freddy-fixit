# Automated new-client acquisition — the stack, the repos, and the build order

Written 2026-09-03. Companion to `GROWTH-PLAYBOOK.md`, which was about the
clients you already have. This one is only about **new** ones, and only about
things that keep working when you aren't at the keyboard.

---

## Read this before you buy anything

You asked for automation, free platforms, and GitHub repos. I went looking for
all three. Here is the honest shape of what came back, because it changes what
you should build.

**There is no legal way to automate finding homeowners.** Canada's anti-spam
law (CASL) requires express or implied consent *before* the first commercial
message. Implied consent lasts two years after a purchase and six months after
an inquiry — and a stranger who posted in a Facebook group has given you
neither. Penalties run to $1M for an individual and $10M for a business. The
CRTC has collected over $3.6M in penalties since 2014; recent real examples
include a **$120,000** undertaking from Hudson's Bay, a $50,000 notice of
violation and a $40,000 penalty. There is no general business-to-business
exemption that covers cold prospecting.

That single fact disqualifies almost every tool in this category. I looked at
the popular open-source lead machines — OpenOutreach, SalesGPT, and the Google
Maps scraper family (geoleadscraper, google-maps-scraper-kit) — and **every one
of them is built for B2B**. They scrape business listings and mail business
addresses. They have a narrow legitimate use for you in recruiting contractors
and referral partners, never for finding homeowners, and Machine 3 below sets
out the conditions carefully — because the B2B path is *also* more legally
constrained than it looks.

So "automated new client stream" has to mean one of two things, and you should
build both:

1. **Automation that makes you findable** — pages, content and tools that work
   while you sleep, so people looking for a plumber in Calgary find you instead
   of Jiffy. This is the compounding one. It's slow for six weeks and then it
   never stops.
2. **Automation that makes you first** — alerting, not messaging. A bot watches
   public places where Calgarians post "anyone know a good handyman?", and
   pings *you* within a minute. You reply as a human. That's exactly what has
   already produced every job you've got; you're just doing the watching part
   by hand right now.

The thing that is *not* on the table is a bot that posts or DMs on your behalf.
Meta publishes no specific numeric limits — the "you can only post to 15 groups
a day" figures you'll find online come from the vendors *selling* bulk-posting
tools, so treat them as marketing rather than policy. What is well established
is that automated posting is detected on identical content across groups,
fixed-interval timing, and server-side logins, and that enforcement is account
loss. Your Facebook account is currently the only channel that has ever produced
a job. Risking it to save twenty minutes a day is the worst trade available.

---

## What you already own and have never switched on

Before spending a dollar, look at this. You are sitting on a finished lead
magnet that has been used zero times.

**The AI Repair Scanner.** `analyze-repair` is deployed, ACTIVE, at v3. A visitor
uploads one to four photos of something broken; Claude identifies it, and returns
a diagnosis, materials with Calgary dollar costs, tools, skills, safety warnings,
honest DIY-or-hire-a-pro advice, and one to three recommended services filtered
to your exact 23 service labels so the "get estimates" button always lands
correctly. It's hardened — CORS locked to your domains, six scans per hour per
IP, prompt-injection screening, no photos stored.

I tested it live today. It answered. **The API key is configured and the
function works.** `repair_scans` has **0 rows** for one reason only: there is no
page on the site that calls it. No `/scan` route exists in `App.tsx`. You built
a free, genuinely novel lead magnet and never put a front door on it.

That's the single cheapest new-client machine available to you and it's step 1
below.

**Two more dormant things, now un-blocked.** `newsletter-ai-draft` was documented
as "dormant until `ANTHROPIC_API_KEY` is set" — that key is now set, so it should
run. It drafts a newsletter issue to `draft` status and never auto-sends, and
`newsletter-send` auto-publishes a `blog_posts` row from any issue carrying a
blog title. You have **13 issues already queued** and 11 blog posts live. And
`meta-lead-scout` is written and waiting on two secrets (`META_PAGE_TOKEN`,
`META_PAGE_ID`); it reads comments and DMs on *your own* Facebook page only,
classifies them, drafts replies and emails you a digest. That's ToS-safe by
design.

**Where you actually are, as of today:** 22 active pros, 8 requests ever, 1 paid
job, 0 reviews, 25 newsletter subscribers, 27 of a possible 152 service-by-area
pages. Supply is not your problem. Being findable is.

---

# Machine 1 — Be findable

Free, compounding, and the only one of the three that gets cheaper over time.
This is where most of your five to ten hours should go for the next month.

### Step 1 — Build `/scan` and put it on the homepage (highest leverage, ~4 hrs)

A single page that takes photos, posts them to `analyze-repair`, and renders the
result. The endpoint contract is already fixed, so there's no design work to do:

```
POST https://kvypmjxbbaaknvddwwai.supabase.co/functions/v1/analyze-repair
{ "images": [{ "data": "<base64, no data: prefix>", "media_type": "image/jpeg" }],
  "description": "optional, max 600 chars" }
```

It returns `{ result: { item, diagnosis, confidence, difficulty, estimated_time,
materials[], tools[], skills[], safety[], diy_advice, recommended_services[],
not_repair } }`. Compress in the browser first with the existing
`compressImage(file, "photo")` — the function caps each image at roughly 2MB of
base64. Handle `429 rate_limited` (it already returns friendly copy) and the 502
busy case.

Two rules for the page, and they're the difference between a lead magnet and a
gimmick:

- **Give the answer away, including the DIY one.** If the scanner says a
  homeowner can fix this themselves in twenty minutes, show that proudly. That
  honesty is the entire reason anyone shares the link, and the people it turns
  away were never going to buy.
- **The CTA is per-recommendation, not generic.** Each recommended service maps
  to `/client-onboarding?service=<exact label>` — the function already
  guarantees the label is valid. "Get free estimates for Plumbing Repair" beats
  "Sign up" every time.

Then link it from the homepage hero as a secondary action, from every service
landing page, and from the footer. Add `/scan` to `public/sitemap.xml`.

**Why this is first:** it is free forever, it costs pennies per scan, it's the
only thing you have that no competitor in Calgary offers, and it is *finished
code sitting idle*. Nothing else on this list has that ratio.

### Step 2 — Fill in the service × area matrix (~6 hrs, then automated)

19 services × 8 areas = 152 possible pages. You have 27. `ServiceLanding.tsx`
and `AreaLanding.tsx` already exist, so this is a data problem, not a build.

**Gate every page on `trade_reach(service) >= 5`.** That function tells you how
many active pros would actually see a job for that service. Building a "Solar
in Airdrie" page when `trade_reach('Solar')` is **0** creates a page that
generates a request nobody answers — worse than no page. Current reach: Handyman
15, Carpentry 14, Garage 14, Locksmith 14, Windows & Doors 14, Drywall/Flooring
13, Painting 13, Appliance 12, Concrete/Masonry 12, Gutters 11, Siding & Roofing
11, Landscaping 8, Snow Removal 8, Cleaning 5, Electrical 5. Everything below
that — Plumbing 4, Battery/Brakes 2, HVAC Maintenance 2, Air Conditioning 1, the
three vehicle labels at 1, Solar 0 — should not get demand pages until you've
recruited into it. That's about 15 services × 8 areas = 120 legitimate pages.

**Differentiate every page with real first-party data or Google will treat the
set as thin content.** The rules that bite here are Google's spam policies on
**doorway abuse** (pages built mainly to funnel people somewhere else, varied
only by city name) and **scaled content abuse** (mass-generating near-duplicate
pages). The old "Helpful Content System" was folded into core ranking in March
2024, so it isn't a separate thing to satisfy — but the substance is unchanged
and this is the one way to fail this step badly. You have three sources of genuinely unique data nobody else can copy: the
`service_pricing` table (real typical low/high ranges per service), the live pro
count per service from `trade_reach`, and real reviews once you have them. A
page that says "14 vetted Calgary NW carpenters, typical job $180–$450, here's
what three of them actually charged last month" is not a template. A page that
says "Looking for carpentry in Calgary NW? We can help!" is, and it will drag
down the 27 pages you already have.

Generate them from the DB rather than hand-writing 120 files, and regenerate the
sitemap in the same script.

### Step 3 — Switch the content engine back on (~1 hr)

You have 13 newsletter issues queued and `newsletter-ai-draft` is no longer
blocked. Run one draft, read it, and confirm the auto-publish path still lands a
`blog_posts` row. Every issue with a `blog_title` becomes a public blog post for
free, which means your newsletter cadence and your SEO content are the same
work done once.

Set a review habit, not a send habit: the crons already run Tuesday and Thursday
16:00 UTC. Your job is to read the draft, not to write it.

---

# Machine 2 — Be first

Alerting only. Nothing here posts, comments or messages on your behalf.

### Step 4 — Facebook group keyword alerts (~1 hr setup)

This automates the *only* thing that has ever worked for you. You currently find
posts by scrolling; a monitor finds them in under a minute and emails or webhooks
you, and you reply as yourself from your own account.

Watch for the phrases Calgarians actually type: "anyone know a good", "looking
for a handyman", "need a plumber", "recommendations for", "ISO contractor",
"quote for", plus the trades where your reach is healthy.

Options, verified as of September 2026, cheapest first:

| Tool | Cost | Notes |
|---|---|---|
| **F5Bot** | **free** | Reddit + Hacker News + Lobsters only — **no Facebook**. ~5 keywords, ~20 alerts/day, up to 2h delivery delay, ads |
| **Pinchr** | free tier, then ~$4.99/mo | cheapest paid option for Facebook groups |
| **Devi AI** | $19/mo, 25 groups | $1 ten-day trial; AI-drafted reply suggestions |
| **OneStopSocial** | $29/mo flat, 25 groups | webhooks (can hit a Supabase function), 7-day trial. **It's a Chrome extension** — see below |
| **KWatch** | free tier is Reddit/HN only | Facebook needs the **$19/mo Essential** plan, and that's 1 keyword |

**Do F5Bot today** for r/Calgary — free, ten minutes, no downside. For Facebook,
start with **Devi's $1 trial** rather than OneStopSocial's $29: same group count,
$10/mo cheaper, and you'll know inside ten days whether group monitoring produces
anything at all in your market.

**One caveat that matters for your stated goal.** OneStopSocial is a Chrome
extension, not a cloud service — Chrome has to be open on your Mac for it to
scan, and the default interval is two hours (15 minutes minimum). So it does
*not* "work while you sleep" the way the pages in Machine 1 do. Its webhook is
still the one genuinely valuable feature in this category, because it can post
into a Supabase function and land alerts in your admin dashboard instead of
another inbox. Pay the $29 only if the cheaper trials prove the channel first.

**Deliberately not recommended: Groups Watcher.** Its paid tier auto-comments on
posts on your behalf and monitors server-side — both of which are precisely the
ban triggers described above — and it's $75 the first month, then $149/mo. It
breaks the one rule this whole section rests on.

**The hard rule:** these tools *watch*. You reply, as yourself, from your own
account. Your Facebook account is your best-performing channel; don't gamble it.

### Step 5 — Claim the free local surfaces (~2 hrs, one time)

**Nextdoor.** Free business page, active in Calgary. Nextdoor's own published
numbers: 62% of members have discovered a small business through it and 78%
patronize a local business monthly. You get two free posts a month — use them on
the neighbourhoods where you have the most pros, not on all of them. This is the
closest thing to a free Facebook-group audience that actually permits business
participation.

**Kijiji.** Free classifieds, still where a lot of Calgary trade searching
happens. One listing per healthy service, refreshed monthly.

**HomeStars.** Free to sign up and be listed. Do it for the directory presence,
but don't expect SEO value — directory links like this are typically nofollow.
Their leads are paid and real spend runs $200–600/month once you're using them,
which your economics don't support yet (see the warning at the end).

### ⚠️ Google Business Profile — do not do what the last playbook said

`GROWTH-PLAYBOOK.md` Move 6 tells you to build out a Google Business Profile.
**That advice is wrong and I'm correcting it here.** Google's guidelines
explicitly exclude lead-generation companies that route leads to other
businesses — the profile has to belong to the business that actually serves the
customer. You already have a GBP (its review URL is in the codebase). Enforcement
here is complaint-driven rather than automatic, so nothing is going to happen
tomorrow — but you're building on ground that a competitor could pull out from
under you with one report, which is a bad foundation for a growth channel.

What is safe and is arguably better: help each of your **22 contractors** claim
and optimise *their own* profiles, and get your review link into their
post-job flow. Their profiles are legitimate, they rank locally, and every one
of them becomes a door into Freddy. That's 22 local-SEO footprints instead of
one that could vanish.

---

# Machine 3 — Be multiplied

This is where the GitHub repos finally earn their place, because everything here
is B2B and the consent rules are different.

### Step 6 — Your contractors' own customer books (~2 hrs, free, biggest number)

22 active pros. Each has customers who already trust them. A pro asking their
own past customer to book the next job through Freddy is warm, consented and
free — and it's the fastest realistic path to a second and third paid job.

You already have the compliant machinery: `contractor-outreach` v14 is
queue-driven, admin-JWT gated, requires `confirm:"SEND"`, carries the CASL
mailing address and RFC 8058 one-click unsubscribe, and paces at 600ms for
Resend's limit. Rows land at status `'new'` and cannot send until an admin
promotes them to `'pending'`, so importing a list can never mail anyone by
accident.

Make it worth their while: the pro keeps their customer, gets paid through the
platform, and the customer gets the agreement and the held-payment protection.
Frame it as a tool for them, not a favour to you.

### Step 7 — Referral partners, and where the scrapers go (~3 hrs)

Property managers, realtors, restoration companies and cleaning companies all
field "do you know someone who can fix this?" constantly. This is a real
channel — but the legal basis is narrower than it first looks, and I got it
wrong in my first draft, so read this part carefully.

**There is no general "B2B exemption" in CASL.** The provision people mean is
**s.10(9)(b), conspicuous publication**, and it has three conditions that all
have to hold: the recipient **themselves** published the address, no statement
accompanies it saying they don't want unsolicited mail, and your message is
relevant to their business role. Critically, the Federal Court of Appeal in the
**CompuFinder** case held this is *not* "a broad licence to contact any
electronic address found online" — and **the burden of proving consent sits on
you, the sender**, not on the complainant.

**A Google Maps listing is a third-party directory, not something the business
published itself.** So scraping Maps and mailing the results does not satisfy
s.10(9)(b). What does: an address the business publishes on **its own website**,
with no "no unsolicited email" notice, contacted about something genuinely
relevant to their work.

That changes how you use the tooling:

- **Use the scrapers to build a research list, not a mailing list.**
  `google-maps-scraper-kit` and `geoleadscraper` will give you Calgary property
  managers and realtors to *look into* (note: Maps scraping is itself against
  Google's terms, which that kit's own README warns about, and you'll hit IP
  blocks). Then visit each company's own site for a published contact address —
  that's the one you may legitimately use.
- **Or skip the email entirely.** At the volume you need, phoning twenty property
  managers or meeting them in person is faster than building a compliant list,
  and it converts far better. This is genuinely the recommendation.
- **Send through `contractor-outreach`**, which already carries the CASL mailing
  address and one-click unsubscribe, never through a scraper repo.

On the repos themselves, correcting my draft: **SalesGPT** (MIT, ~2.4k stars) is
real but it's a conversational/voice agent, not the sequencing tool I implied.
**OpenOutreach** depends on BetterContact, a paid lookup provider, so it isn't
free. **AI-SDR-Agent** and **Map-Lead-Scraper** I should not have listed at all —
the first is a two-star personal demo with no licence, the second isn't a
scraper at all, just an HTML page advertising a commercial product. Ignore all
four. At your volume, `contractor-outreach` plus a spreadsheet beats every one of
them with less to break.

### Step 8 — Fix the `?pro=` bug before any of this lands (~1 hr)

Preferred-contractor reservation is broken for new signups. Every partner and
past-customer referral relies on it landing the person with the right pro. Fix
it before you drive traffic through it, or the whole of Machine 3 leaks.

---

## Orchestration: skip n8n

I looked hard at it because it's the obvious answer and it's free. **Don't.**

n8n Community Edition is genuinely free and self-hostable, but it needs a
$5–20/month VPS plus Docker and Linux competence to keep alive. You already have
the exact same capability in tools you're paying for and that someone else
operates: **Supabase edge functions plus pg_cron**. You're running 13 cron jobs
today. Every workflow in this document — scan-to-lead, alert intake, outreach
queueing, newsletter drafting — is a function you already know how to deploy.

Adding n8n means adding a server that can go down at 2am, on a stack you can't
debug. The right call is to add functions to the thing that's already running.

---

## The schedule

**Week 1 (~8 hrs).** Build `/scan` and link it everywhere. Set up F5Bot free.
Start the OneStopSocial trial. Claim Nextdoor.

**Week 2 (~7 hrs).** Generate the service × area matrix gated on
`trade_reach >= 5`, differentiated by `service_pricing` and live pro counts.
Regenerate the sitemap. Fix `?pro=`.

**Week 3 (~6 hrs).** Contractor customer-book campaign through
`contractor-outreach`. Run a `newsletter-ai-draft` issue and confirm blog
auto-publish. Get your review link into the 22 pros' post-job flow.

**Week 4 (~5 hrs).** Partner list — research only, then phone or visit twenty
Calgary property managers rather than emailing them. Kijiji and HomeStars
listings. Decide on paid Facebook alerting based on whether the trial produced
anything.

**Then weekly, ~4 hrs.** Reply to alerts as a human. Review the newsletter
draft. Add pages for any service whose reach crossed 5. Read `repair_scans` and
see which services people are actually scanning — that's free demand research
nobody else in Calgary has.

## What it costs

| | |
|---|---|
| `/scan`, the page matrix, the newsletter engine | **$0** (already deployed) |
| F5Bot, Nextdoor, Kijiji, HomeStars listing | **$0** |
| Facebook group alerting | $1 for Devi's 10-day trial, then $19/mo if it earns it |
| Claude API for scans and drafts | pennies per call, already configured |
| **Total to run everything above** | **$0–19/month** |

## What I'd ignore for now

**Paid ads.** At a ~$150 average job you gross about 10% — a 3% client fee plus
7% of the contractor's side, so roughly $15, and closer to $10 when a referral
waives the fee. A $20 Google click can never pay that back. Ads become possible
once reviews and repeat rate carry the economics, not before. Same logic
disqualifies HomeStars' paid leads.

**Any bot that posts or messages.** Covered above, and it's the one mistake here
that's genuinely hard to undo.

**n8n, Zapier, Make.** You have pg_cron.

**Groups Watcher** ($149/mo, auto-comments, server-side) and **HomeStars paid
leads** ($200–600/mo). Both fail on cost or on the ban rule, or both.

---

The order matters more than the list. `/scan` first, because it's built and
free and unique. The page matrix second, because it compounds. Alerts third,
because they automate the only thing that has already worked. Everything else
after you have reviews to point at.
