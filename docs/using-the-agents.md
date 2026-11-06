# Using the agents — a plain-English guide

This is written for you, not for a developer. It explains what the agents are, what you do
with them each day, what they cost, and what the business actually gets out of them.

## What an "agent" is here

An agent is a small worker that looks at your platform on a schedule, notices something that
needs a human, and **puts a note in a queue for you**. It does not act. It does not email
your clients. It does not move money. It writes down what it found and waits for you.

That restraint is the whole design. The one thing that has gone wrong on this platform over
and over is not a robot doing something rash — it is **nobody noticing something quietly
broken**. Five of the six client requests that ever got a real quote sat stranded and
invisible for two to three months. No error appeared anywhere. You found it by looking.
The agents exist so that the looking happens every morning whether or not you remember.

So the mental model is: **an agent is a very attentive assistant who leaves notes on your
desk.** You read the notes, you decide, you act. Nothing happens behind your back.

## Where you find them

Admin dashboard → **Agents** tab. Two things are on that page.

**The queue, at the top.** Everything waiting on you. It opens on "Waiting on you", and
there is an "Everything" toggle if you want to see decided items too. Each card tells you in
a sentence what was found, who it concerns, and their phone and email so you don't have to
go looking.

**The team, below it.** Every agent that is *supposed* to exist, whether or not it has ever
run — so an agent that silently died is visible, instead of just being absent. For each one
you see when it last ran, whether it is overdue, how many notes it has waiting, and what it
is allowed to spend.

## Your day with it, in practice

You open the Agents tab. The queue has a handful of notes. For each one:

**Read the sentence at the top of the card.** That is the whole finding in plain English.
The grey box underneath is the technical detail — you can ignore it unless you want it.

**If it is a lead, press "Draft a message."** You get a text message and an email, written
in Freddy's voice, specific to that client's situation. Nothing is sent. You copy it, change
whatever you want, and send it yourself from your own phone or inbox. If you don't like the
draft, press "Rewrite the message" and you get another one.

**Then press "Mark handled"** once you have made the call or sent the message. That closes
the note. It does not mean a robot will pick it up — these are handoffs to you, and the
button says "Mark handled" rather than "Approve" precisely so it never implies otherwise.

**Or press "Reject"** if the note is not worth acting on. Rejecting always works, including
on expired notes. Clearing your inbox has to be possible.

An expired note loses its approve button entirely and tells you so in words. The agent will
raise a fresh one next time it runs. A button that cannot succeed is worse than no button.

## What it costs you

Almost nothing, by design, and the design is the reason rather than a promise.

**Finding things is free.** Six of the eight agents never call an AI model at all — they
read your database and do arithmetic. The lead agent in particular is a database function
with **no way to reach the internet**, so it cannot spend money even by mistake. That is a
stronger guarantee than a rule in a document.

**Writing a message costs one cheap AI call, and only when you press the button.** So a
quiet week costs you nothing, and a busy week costs exactly as much as the work you chose to
do. Spend follows your decisions instead of running on a timer.

**Every agent has a written budget and the platform enforces it.** Each one declares the
most expensive model it is allowed to reach for and how many calls and how many notes it may
produce per run. Those limits are checked in the one place notes get written, so an agent
cannot talk its way past them. The Agents tab shows each budget in plain English next to
what was actually used, so an agent drifting over budget is a number you can see.

If a draft is ever too thin and you want better writing on one specific agent, the fix is to
raise that one agent's budget — not to loosen the policy for all of them.

## The eight agents

One is running. The other seven are declared but switched off, which is deliberate: an agent
shows as overdue only once you have said it is supposed to be running. Lighting them all up
on day one would have made the page red immediately, and a page that is always red is a page
you learn to scroll past.

| Agent | What it watches | Status |
|---|---|---|
| **lead-response** | Leads falling through the cracks: a request whose job vanished, quotes nobody chose in 30 days, a trade no contractor can even see, a request that got no bids after two re-sends | **Running daily, 7am** |
| **ops-watchdog** | The nine platform health checks, the two build checks, deploy state, real visitors' errors | Off — needs its worker |
| **contractor-supply** | Trades where clients are asking and you have nobody who could take the job | Off — needs its worker |
| **outreach** | Finding and qualifying contractors worth inviting | Off — **also needs a CASL review before it may contact anyone** |
| **social-bot** | Replies to social mentions and questions, for you to approve | Off — built, never switched on |
| **customer-care** | Drafting replies to client and contractor messages | Off — needs its worker |
| **marketing** | Blog and page copy | Off — needs its worker |
| **dev-test** | Running the test suite and proposing fixes | Off — needs its worker |

**On `outreach` specifically:** it shares an email domain and sending quota with your sign-in
emails. An outreach agent burning through that quota would lock real people out of signing
up. That is a harder limit than any budget, and it is why that one stays list-only until the
anti-spam review clears.

## What the business actually gets

**Revenue that was already yours and leaking out.** The lead agent's first run surfaced nine
requests with quotes sitting on them that nobody ever chased. Those are people who asked for
work, got a price, and were never followed up — the most likely customers you will ever
have, already past the hardest part of the funnel. One recovered job pays for the entire
agent system for years.

**Faults found in hours instead of months.** The stranded-request bug was invisible from
every screen at once and sat for three months. It is now the first thing the lead agent looks
for, every morning, before your health check email goes out. The pattern generalises: every
outage this platform has had was something *missing*, and missing things do not raise errors.
An agent that checks for absence is the only thing that catches them.

**Speed of response, which is the thing you compete on.** A client who gets a text the day
their quote stalls is a different client from one who hears nothing for a month. You now get
the lead and the message written for you in the same place, in under a minute.

**Your attention spent on deciding, not on looking.** You still make every call. What you no
longer do is go hunting through dashboards to find out whether anything needs a call.

**A shape you can extend cheaply.** The hard parts — the queue, the approval gate, the
budgets, the roster, the audit trail — are built and proven by a working agent. Each new
agent is now just the worker that fills it, and the ceiling is whichever one is worth the
most to you next. `ops-watchdog` and `contractor-supply` are the cheapest to add, because
like the lead agent they are answerable with a database query and would cost nothing to run.

## Two things to do

**Set `ANTHROPIC_API_KEY` in Supabase** (Edge Functions → Secrets) or the "Draft a message"
button will tell you it cannot write anything. It is the one piece the drafting step needs
and it is not in place yet. If the first click reports a problem with the model name instead,
that is a one-setting fix — say so and it gets corrected.

**The nine recovered leads need you personally.** They are two to three months old, which is
too old for an automated nudge — a cron job is the wrong sender for "your estimates are
waiting" on a request from August. They are in the queue with names, phones and emails, and
a draft is one click away on each.
