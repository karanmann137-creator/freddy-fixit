// contractorGuide — the single source of truth for the contractor onboarding guide.
//
// The same markdown is used in three places, so it must only ever be edited here:
//   * the in-app page at /contractor-guide (rendered with MdBody from lib/blogDb)
//   * the emailed copy (newsletter_content row, rendered by the newsletter-send edge fn)
//   * the welcome email new contractors receive
//
// Only the markdown both renderers understand is allowed: **bold**, [text](url),
// "## " headings, "- " bullets, "1. " numbered lists, and blank-line-separated
// paragraphs. Links must be absolute so they work inside an email.
//
// Deliberately plain-English about money — no percentages or dollar thresholds —
// because the exact figures are always shown in the dashboard before anything is
// charged, and the payment model may change.

export const CONTRACTOR_GUIDE_TITLE = "The Freddy Fix It Contractor Guide";

export const CONTRACTOR_GUIDE_PREHEADER =
  "How bidding works, how you get paid, and the one step that releases your money.";

export const CONTRACTOR_GUIDE_URL = "https://freddyfixit.ca/contractor-guide";

export const CONTRACTOR_GUIDE_MD = `Welcome to Freddy Fix It. This guide covers everything worth knowing before your first job — how work reaches you, how bidding works, how and when you get paid, and the one step that a lot of new pros miss.

It takes about five minutes to read. It is worth the five minutes. You can come back to it any time from **Settings** in your dashboard.

## The short version

- Jobs in your trade and your area are emailed to you the moment a client posts one. Bid fast — the early bids get read.
- You set your own price. We never take a cut of a lead and we never sell you leads.
- The client pays a deposit to book you, and the rest when the work is done. Both are held. Neither is paid to you yet.
- **Your money is released when the client confirms the work is done.** Ask them to do it while you are still standing there.
- Set up your payout details before your first job, or there is nowhere for us to send the money.

## How jobs reach you

When a client posts a request, we match it against your trade and your service area and send it straight to you — an email, plus a notification bell in your dashboard. You will also find everything waiting for you under **Available Jobs**.

A few things worth knowing:

- We only send you work you can actually do. If you are getting the wrong kind of job, or not enough of it, fix your specialties and service area in your profile — that is the list we match against.
- If a client asks for you by name (a repeat customer, or someone you have worked for before), the job is held just for you for the first two days before anyone else sees it. Those are the easiest jobs you will ever win.
- If a job is not for you, hide it. That keeps your list clean. Hiding is permanent, so read before you tap.

Speed matters more than anything else here. Clients are comparing pros side by side, and the ones who reply first tend to win. We show clients how quickly you usually respond, so a fast habit compounds.

## How bidding works

You are not buying leads and you are not paying for placement. You look at the job, you decide what it is worth, and you send a price.

1. Open the job and read the description and any photos the client attached.
2. Send your price. You can break it into labour, parts and a call-out fee, and you can add an optional range if the final number depends on what you find.
3. If you would rather see the space before committing to a number, tick **I'd like to see the space first**. You can still give a ballpark. Plenty of clients prefer this — it reads as honest, not evasive.
4. The client compares the bids and picks one. It is entirely their choice; nobody at Freddy Fix It picks for them.

A job stops accepting new bids once it has seven, so there is a real reason to be early. You can bid on as many different jobs as you like — that has never been limited.

Other pros cannot see your price. Nobody can see your number except the client who posted the job.

If the client picks you, you propose a time. They approve the time, and the job is booked.

## Before the work starts: the service agreement

Every job needs a signed service agreement before the client can pay. You write it — we generate one from the job details automatically, and you can add your own clauses or upload your own contract instead.

You sign first, then the client signs to accept, and both of you get an emailed copy with the date, time and a record of the signatures. It is a legally valid electronic signature under Alberta law.

The agreement is between you and your client. Freddy Fix It is not a party to it. That also means anything you add or upload is yours to stand behind.

The client's payment button stays locked until that agreement is signed, so do not skip it.

## How you get paid

Here is the whole flow, in order:

1. The client approves your price and pays a **deposit** to book you. That is what dispatches the job to you and locks in the time.
2. **The money is held. It has not been paid to you yet.** This protects both of you — the client knows the funds are committed, and you know you are not chasing an invoice after the fact.
3. You do the work and mark the job complete in your dashboard, with a photo.
4. The client pays the **remaining balance**. Your dashboard tells you if a balance is still outstanding on a finished job, and we chase the client for it.
5. **The client confirms the work is done.**
6. Your payout is released — the full amount, deposit and balance together — and lands in your account.

Why a deposit rather than the whole price up front: asking a stranger to hand over the full cost of a job before anyone has picked up a tool loses bookings. A deposit is enough to commit a serious client and hold your time, and you are still paid the full amount. Your payout never changes.

Freddy Fix It keeps a commission out of each job, and the client pays a small service fee on top of your price. You will always see your exact payout on the job before you accept anything, and again on the payout statement we email you when the money is released. There are no other fees — no monthly charge, no lead fees, nothing taken for showing up in search.

**Set up your payouts before your first job.** It is a one-time step in your dashboard and it is the only thing standing between finished work and money in your account. It is also the one setup step you cannot skip.

## The step most pros miss: ask the client to confirm

This is the part to remember, so it gets its own section.

**Nothing is released to you until the client confirms the job is done.** Marking it complete on your side is not enough. The client has to tap confirm on theirs.

So before you pack up and drive away:

- Walk the client through the finished work.
- Ask them, out loud, to open Freddy Fix It and tap **Confirm** while you are standing there.
- It takes them about ten seconds, and your payout starts moving immediately.

If they forget, the system confirms it automatically after three days so you are never left stranded. But three days is three days. Asking on the spot is the difference between getting paid today and getting paid Thursday.

The pros who make this part of their sign-off routine almost never think about payment again.

## If the price changes

Jobs change once you open a wall. You can adjust your price at any point right up until the money is released — from the moment you are assigned through to after you have marked the job complete.

Send the new price with a short reason. If the client has not paid yet, they simply re-approve. If they have already paid, they see the old price, the new price and the difference, and they approve or decline it. Nothing extra is ever charged without them agreeing.

If you are billing by the hour, use the timer on the job. It tracks your time across multiple visits and will fill in the new price for you at your hourly rate.

## Bigger jobs and repeat work

**Large jobs** can be split into stages. The client funds one stage at a time, you finish it, they approve it, and you get paid for that stage before the next one starts. You are never carrying the whole job on your own float, and the client is never handing over everything up front.

**Recurring work** — seasonal, monthly, whatever the cadence — books itself. When a job is marked recurring, the next visit is created automatically and reserved for you. Show up reliably on those and they become the most predictable income on the platform.

## Getting approved and staying approved

Your profile gets reviewed before you can take work. Finish it early so you are not waiting when a good job lands:

- Your service area and your trade
- Your licence and insurance details
- Your verification documents — photo ID, plus insurance, WCB clearance and trade certification where your work needs them

Uploaded documents are checked automatically and then reviewed by a person. Automated checks are advisory only; a human makes the call.

Keep your insurance and WCB current. If something lapses, your profile flags it and the reminder comes back on its own.

Depending on the work you do, Alberta may also require you to hold a prepaid contracting licence and a security bond, since payment is collected before the work is finished. That obligation is yours, not ours — check with Service Alberta if you are unsure whether it applies to you.

## Showing up

Reliability is most of the job on a marketplace.

- The day before a booked visit, the client is asked to confirm or change the time. If they move it, you will see it in your dashboard and you can accept the new time or propose a different one.
- Tap **On my way** when you head out. Clients notice.
- Use the on-site checklist. You can load a suggested one for your trade in a single tap, and clients can see the progress.
- Message and send photos or video through the job chat, so everything about a job lives in one place if a question comes up later.

If a client raises a formal claim, you get the details and three days to respond in writing. The payment on that job is frozen while it is reviewed — not lost. Answer it properly and promptly; that is your best defence.

## Your weekly Pro Tips email

Every **Tuesday morning** we send a short Pro Tips email — pricing benchmarks, seasonal demand, and practical ways to win more of the jobs you bid on. One email, once a week, and you can unsubscribe from the bottom of any of them.

## Where to get help

- **Request help** in your dashboard sidebar opens a form that reaches us directly.
- **Report a bug** if something in the app is not working.
- Or email **hello@freddyfixit.ca** any time.

We read everything. If a part of the platform is costing you work, tell us — a lot of what is in this guide exists because a contractor pointed something out.

Welcome aboard. Go bid on something.`;
