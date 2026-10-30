# Freddy Fix It — Client Acquisition Flywheel

Written 2026-09-03. Budget: ~$0. Owner time: 5–10 hrs/week.
Every number below came from the live database on the date above.

---

## The one-paragraph diagnosis

The flywheel is not broken. **It has never completed a single revolution.**

There are 22 active contractors, 8 client requests ever posted, 18 bids placed,
and **one real job** — which has been sitting at `assigned` and unpaid since
August 12th. The only "completed, paid, released" job in the database is a $5
test the owner ran on himself. That is why `reviews`, `referrals` and
`favorites` are all at exactly **0 rows**: every one of those tables is fed by a
finished job, and no client-facing job has ever finished.

So the problem is not that the loop leaks. It is that nothing has gone around it
yet. The entire plan below is ordered to force the **first** revolution, then
make it repeatable.

### What the data actually says

| Stage | Number | Read |
|---|---|---|
| Contractors active | 22 | Supply is not the constraint |
| Requests ever posted | 8 | Demand is the whole problem |
| Requests with a photo | **0 of 8** | Pros are bidding blind |
| Bids placed | 18 | Pros show up when there's work |
| Requests still pending with bids on them | **5** | 13 bids nobody picked |
| Oldest stranded request | **34 days** | Free revenue rotting |
| Real completed + paid jobs | **0** | Flywheel has never turned |
| Reviews / referrals / favourites | 0 / 0 / 0 | All downstream of completion |
| Clients who came back a second time | 1 (the owner) | No retention data yet |

Two more facts worth holding onto:

- **Bid speed is fine where you have depth.** Handyman got its first bid in
  1.8 hours, plumbing in 0.0 and 5.7 hours. Electrical took **95 hours** and
  appliance took 23. Speed tracks pro count, and pro count varies wildly by
  trade (`trade_reach`): General Handyman 15, Carpentry 14, Windows & Doors 14,
  Locksmith 14, Garage 14, Painting 13, Appliance 12, Gutters 11, Roofing 11,
  Snow Removal 8, Landscaping 8, Electrical 5, Cleaning 5, Plumbing 4, HVAC 2,
  A/C 1, Solar 0.
- **Clients are being told.** 37 `bid_received` and 7 `bids_waiting`
  notifications went to clients. They opened nothing and picked nobody. Email is
  firing correctly; email is losing.

### Why email is losing

Every one of these leads came off a Facebook post where the homeowner asked for
a recommendation. On those posts they get fifteen to thirty comments within a
day, and they hire from a name and a phone number, usually inside 48 hours.
Freddy's reply sends them to a signup form, then a confirmation email, then a
wait for bids, then another email asking them to log back in and choose. **Four
steps and two mailboxes against a competitor who just left a phone number.**

That is the real competitive loss, and it is fixable without writing any code.

---

## The flywheel

```
   Facebook comment ──► fast personal reply ──► request posted (with a photo)
          ▲                                              │
          │                                              ▼
   inbound Google/SEO                          bids inside 2 hours
   traffic, no work                                      │
          ▲                                              ▼
          │                              OWNER TEXTS THE ONE-TAP PICK LINK
   Google reviews ◄── review ask ◄── JOB COMPLETED ◄──────┘
          │                              │
          │                              ├──► referral code handed over
          │                              ├──► "book them again" saved as a Pro
          └──────────────────────────────┴──► pro gets paid, tells other pros
```

The loop only compounds at the **JOB COMPLETED** node. Everything before it is
cost. So the first job to obsess over is not the next lead — it is finishing the
ones already sitting in the database.

---

## Move 1 — Rescue the stranded clients (this week, ~2 hours)

Five real homeowners asked for help, got real quotes, and are still waiting.
Contact details, situation notes and one-tap pick links are in
`rescue-list.csv` next to this file (that file is gitignored — it holds phone
numbers and must never be committed).

**Start with the one at the top, because it is not a client problem.** A
homeowner in Hotchkiss picked a contractor on **August 12th** for a couple of TV
installs. Twenty-two days later that job is still `assigned` with **no price
proposed, no time proposed and no contract** — the client did everything right
and the contractor went quiet. That is the closest thing to money you have, and
it is our failure. Phone the contractor today and get a price and a time on it,
then phone the client and apologise before you ask for anything. If the pro
won't engage, reopen it to the other bidder rather than letting it sit another
week.

The asset that makes this trivial: **`/pick/<token>` requires no login.** The
token in the URL *is* the authorization. You can text a homeowner a link and
they choose a pro in one tap, from their phone, with no password, no email
confirmation, no app. Nothing else you have converts like this and you have
never once used it.

**Call, don't email.** They have already ignored between three and eleven
emails each. Phone first; if it goes to voicemail, text.

Phone script:

> Hi [name], it's Karan from Freddy Fix It — you asked about [the nightstand
> assembly / the laundry room plumbing / unlatching the washer] a few weeks back.
> I'm not calling to sell you anything, I just noticed [4] local guys quoted you
> between $[79] and $[200] and nobody ever walked you through it, which is on us.
> Do you still need it done? … Great — I'll text you one link right now, you tap
> the guy you like, and that's it. Nothing to sign up for.

Then send the link with nothing else attached:

> Here you go — tap whichever quote you want and he'll message you to book a
> time: [pick link]
> Any trouble, just reply to this text and I'll sort it out.

If they say they already got it done, ask the one question that pays for the
call: *"No problem at all — mind telling me who you went with and what they
charged? It helps me keep our guys honest on price."* That is free competitive
pricing data and it ends the call warm.

**Target: 2 of 5 booked.** Two completed jobs is enough to start Move 3.

---

## Move 2 — Make the Facebook channel repeatable (4 hrs/week, ongoing)

Facebook is the only channel that has ever produced a customer. Do not
diversify away from it. Systematize it.

### Where to be

Join and stay active in the Calgary buy/sell, community and neighbourhood
groups where "can anyone recommend a…" posts appear daily — quadrant community
groups (NW/NE/SW/SE), Calgary Homeowners, new-build community pages (Mahogany,
Sage Hill, Hotchkiss, Livingston, Seton, Cornerstone — your existing requests
came from exactly these), and the buy-and-sell groups. Aim for 12–15 groups.

**Read each group's rules before your first comment.** Most ban self-promotion
outright and will remove you permanently. In those, the play is different — see
"the referral posture" below.

### The daily 30 minutes

Search each morning for the phrases homeowners actually type: *"recommend",
"anyone know a", "looking for a", "handyman", "plumber", "quotes", "who does"*.
Reply to anything posted **in the last 3 hours**. A twelve-hour-old post is
already solved.

### What to write

The comment that loses is a link and a pitch. The comment that wins is a
specific, useful, human answer with a soft close. Compare:

> ❌ Check out freddyfixit.ca — free quotes from vetted Calgary pros!
>
> ✅ For a leaking bathroom faucet you're looking at $100–150 installed if the
> shutoffs under the sink still turn — more if they're seized and need
> replacing. I run a small Calgary outfit that gets you a few quotes from local
> guys so you can compare. Happy to line some up if you want, or just DM me and
> I'll tell you who I'd call.

The second one gives away the answer before asking for anything, and it names a
real number. You have real numbers now — use them (`service_pricing` in the DB;
the "from $X" figures on the site).

### The DM, and the speed rule

When they reply, **do not send the signup link first.** Get the job details in
the DM, then post the request *for* them if you have to, or send the link once
they're warm. The signup form is a wall between you and a customer who is
currently interested; every step you add loses a third of them.

**The rule that matters more than any script: reply within 15 minutes during
9am–9pm.** Turn on notifications for those groups. The single strongest
predictor of winning a "recommend a plumber" post is being the third comment
instead of the twelfth.

### The referral posture (for no-promo groups)

In groups where you can't promote, you can still answer. Give the honest advice,
mention no company, and let people DM you. It's slower and it works, and it
keeps you in groups you'd otherwise be banned from — which is worth more over
six months than any single job.

### Take a photo, every time

**Zero of your eight requests have a photo.** A pro bidding on "laundry room
upstairs" is guessing, which is why bids come back wide ($105 to $450 on the
same plumbing job) and slowly. In the DM, ask for one photo before anything
else: *"Send me a quick photo of it and I'll get you proper numbers instead of
ballparks."* It gets you a better bid, a faster bid, and a more committed lead
— someone who takes a photo has decided to fix the thing.

---

## Move 3 — Turn every completed job into three inputs (built already, 0% used)

This is the actual flywheel and it costs nothing. All three mechanisms exist in
the product and none has ever fired, because no job has ever completed.

**1. The Google review.** You have zero Google reviews. For local home
services, Google Business Profile reviews are the highest-leverage free asset
that exists — they drive the map pack, which is where homeowners who *aren't*
on Facebook look. The prompt is already built: finishing a job opens
`CompletionThanksModal`, which asks for the review and shares the referral code
in one screen (`g.page/r/CYvpOy2pJh_YEAI/review`). A modal is easy to dismiss,
so back it up with a personal text the same day, while the goodwill is fresh:

> Glad that worked out! If you've got 30 seconds, a quick Google review is
> genuinely the only marketing we do — it's what lets me keep finding good local
> guys instead of paying for ads. [link] Either way, thanks for giving us a shot.

**Target: 10 Google reviews.** That is roughly the threshold where a new local
business starts appearing in the map pack for its own service terms. At your job
volume that is achievable in a couple of months — and it converts strangers
forever after, with no ongoing work.

**2. The on-site review.** Separate from Google, and it feeds
`get_homepage_reviews` — the review strip inside the "Built On Trust" section of
your homepage. With zero reviews that strip isn't rendered at all, so the
section runs on vetted-pro cards and trust claims alone. Real quotes from real
Calgary homeowners is the missing half, and it's the half that converts the
traffic Facebook sends there.

**3. The rebook.** `list_my_pros` (anyone you've worked with, or favourited)
powers the "Book a pro you've used before" strip on the new-request form.
Rebooking is the cheapest job you will ever sell. It's empty because nobody has
finished a first job.

### Fix the referral reward before you promote it

Referrals are at **0 out of 29 profiles that all have codes**, and part of that
is mechanical (nobody had a finished job to be happy about). But part of it is
that the reward is too small to mention out loud: the current offer waives the
3% service fee on the referred friend's first job. **On a $150 job that is
$4.50.** Nobody tells a neighbour about a company for $4.50, and printing that
number in an email makes the offer look cheap rather than generous.

You have three options, in order of how much I'd recommend them:

- **$25 off the referred friend's first job, and $25 credit to the referrer.**
  Costs you real money only when a job actually completes, and it's a number
  people repeat to each other.
- **A free add-on** — a free 30-minute add-on task on the first job. Costs the
  platform nothing (the contractor absorbs a small task in exchange for a
  customer they didn't pay to acquire) and sounds bigger than $25.
- **Leave the 3%, but stop describing it as a percentage.** "Your friend's
  service fee is on us" is honest and doesn't invite arithmetic.

Whichever you pick, the completion modal is not enough on its own — a modal
gets dismissed in half a second. The ask has to also land **the day the job is
finished**, in a text, from you.

---

## Move 4 — The September wedge: snow, gutters, leaves (2 hrs/week, next 6 weeks)

It is September 3rd in Calgary. Three things are about to be searched for
heavily, and you happen to have depth in all three:

- **Snow Removal — 8 pros.** Seasonal contracts get locked in September and
  October. This is the highest-value play you have because it is **recurring by
  nature**, and your product already supports recurring plans and prepaid
  pools. One snow customer is 15–20 visits, not one job.
- **Gutters — 11 pros.** Post-leaf-drop cleaning is an October job that people
  start asking about now.
- **Landscaping / fall yard cleanup — 8 pros.** Same window.

Run these three as your Facebook angle for the next six weeks instead of
generic handyman. Seasonal posts are the one kind of self-promotion community
groups tolerate, because they read as a heads-up rather than an ad:

> Heads up for anyone on this street — snow contracts for the season are getting
> booked now and the good guys are usually full by mid-October. I run a small
> Calgary outfit that gets you a few quotes from local operators so you can
> compare rates before the first dump. Comment or DM me your quadrant and I'll
> line some up. No charge to get quotes.

Do **not** push A/C (1 pro), HVAC (2), Plumbing (4) or Electrical (5) hard until
you've recruited more there. You can already see what happens: electrical took
95 hours to get its first bid. Generating demand you cannot serve within a day
burns the lead and the client's trust at the same time.

**Solar has zero matching pros — it should not be on the site as a bookable
service until it does.** A request there reaches nobody, silently.

---

## Move 5 — Your 22 contractors are an unused acquisition channel (1 hr, once)

Every one of those 22 pros has a phone full of past customers. They are the
cheapest demand you will ever get, and right now they are getting almost nothing
from you — 8 requests across 22 pros in three months is roughly one bid
opportunity each per month, which is how a marketplace quietly loses its supply
side.

Send them one honest email — not a blast, and not a promise:

> Subject: Straight talk, and one ask
>
> Hi [name] — being upfront with you: we're early, and job volume is thinner
> than I want it to be. I'm working on that daily and it's getting better.
>
> One thing that would help both of us right now. If you've got customers you
> already look after, send them to Freddy Fix It for their next job. Takes you
> 30 seconds and the job is reserved for you for 48 hours before anyone else can
> even see it. The client pays a 40% deposit up front and the rest on
> completion, both held by Stripe, so you're never chasing an invoice or eating
> a bounced cheque. **No lead fees and no monthly fee** — we only take a cut
> when you actually get paid, and you keep 93% of the job.
>
> Reply with the customer's name and I'll set the job up reserved to you.
>
> — Karan

The 48-hour reservation is real (`preferred_contractor_id`, enforced in both
`list_open_jobs` and `place_bid`). **Be precise about the money or a pro will
catch you**: it is a 40% deposit at booking and the balance on completion, not
the whole amount up front, and the platform keeps 7% of the contractor's side.
"No lead fees" is the true and genuinely strong claim — it is what separates you
from HomeStars and Jiffy, where a pro pays for the lead whether or not they win
it. Don't dress it up as "costs you nothing."

The argument that makes this work: **you are not asking a contractor to give you
their customer.** You're offering free invoicing, guaranteed funds and
scheduling on a customer they already own, in exchange for 7%. The platform gets
a real transaction, a review, and a homeowner who now has an account.

⚠️ **One thing to handle manually.** The `?pro=` link only applies the
reservation for a client who is *already signed in* — it's read on the
new-request form, not on signup. So a contractor's brand-new customer who
follows that link makes an account and the reservation is silently lost, and the
job goes out to everyone. Until that's fixed, take the customer's details by
reply and set the job up yourself, or have the pro tell them to name him in the
job description. (Worth fixing in the product — it's a small change to
`ClientOnboarding` and it makes this whole move self-serve.)

The pro who takes you up on it also becomes your reference story for recruiting
the next twenty.

---

## Move 6 — Google Business Profile — ⚠️ CORRECTED 2026-09-03

**The original version of this Move told you to build out a Google Business
Profile for Freddy Fix It. That was wrong, and following it puts you at risk of
a suspension.** Google's guidelines explicitly exclude lead-generation companies
that route leads to other businesses — the profile has to belong to the business
that actually serves the customer. Freddy is a marketplace, so it doesn't
qualify. You already have a profile (its review URL is in the codebase), which
means the account is currently exposed rather than merely unbuilt.

Do this instead, and it's arguably the better asset anyway: help each of your
**22 active contractors** claim and fully complete *their own* profiles, and get
your review link into their post-job flow. Their profiles are legitimate, they
rank in the local map pack, and each one becomes a door into Freddy. That's 22
local-SEO footprints instead of one that could disappear overnight.

The sequencing from the original still holds — a profile without reviews doesn't
rank — so Move 1 → Move 3 → this is the order. Get jobs finished, get reviews,
then your pros' profiles have something to rank on.

Full reasoning and the rest of the automated-acquisition build is in
`AUTOMATION-STACK.md`.

---

## Your week, concretely (7 hrs)

| When | What | Time |
|---|---|---|
| Mon–Fri, mornings | Facebook group sweep + reply to fresh posts | 30 min/day |
| Mon–Fri, throughout | Answer DMs within 15 min, 9am–9pm | in the gaps |
| Tue | Call any stranded/unpicked request older than 48h, text the pick link | 45 min |
| Thu | Seasonal post (snow/gutters/leaves) into 3–4 groups | 30 min |
| Fri | Review + referral texts to anyone whose job finished this week | 30 min |
| Fri | GBP post, check numbers below | 30 min |

---

## The five numbers to watch

Ignore traffic. Watch these, weekly:

1. **Requests posted** — the only true top-of-funnel number. Baseline: 8 total, ~2/month.
2. **Pick rate** — of requests with ≥1 bid, how many chose a pro. Baseline: **3 of 8**, and 5 sitting unpicked.
3. **Jobs completed and paid** — the flywheel's only compounding node. Baseline: **0** real.
4. **Google reviews.** Baseline: 0. First target: 10.
5. **Repeat + referred clients.** Baseline: 0 and 0. This is the number that tells you the flywheel is finally spinning on its own.

A warning on measurement: GA4 and PostHog are both installed but **gated behind
cookie consent**, so a low analytics number can mean low consent rather than low
traffic. Read the consent rate before concluding the site is quiet.

---

## What I would not do yet

- **Paid ads.** At a ~$150 average job the platform grosses about **10%** — a 3%
  client fee plus a 7% cut of the contractor's side, so roughly $15, and closer
  to $10 when a referral waives the fee. A $20 Google click can never pay back.
  Ads work once reviews and repeat rate carry the economics, not before.
- **New channels** (TikTok, flyers, door hangers, Nextdoor blasts). You have one
  channel that provably works and you have not yet run it properly.
- **Recruiting more contractors in trades you already cover.** Fifteen handyman
  pros are competing over roughly one job a month. Adding a sixteenth makes the
  supply side unhappier, not the marketplace better. Recruit only into Plumbing,
  Electrical, HVAC and A/C, and only when demand there is real.
- **Automated Facebook tooling.** Meta's terms forbid scanning other people's
  posts and groups, and a ban costs you the only channel you have. Manual only.

---

## If you only do one thing this week

Work `rescue-list.csv` top to bottom. Chase the contractor on the 22-day-old
Hotchkiss job, then call the other four and text them their pick links. Five
homeowners asked you for help, thirteen contractor quotes are sitting on their
requests, and every one of them is still waiting.
That is one phone call away from your first three real completed jobs — which is
one review, one referral code and one rebook away from the flywheel turning for
the first time.
