import React from "react";
import { upsertMeta } from "@/lib/seo";
import { getTheme, setTheme, type Theme } from "@/lib/theme";
import { Ic } from "@/components/Ic";
import {
  Pass, PassTop, IconButton,
  StateLine,
  Hero, HeroSub, PassMeta, PassMetaItem,
  JobSwitcher,
  Group, Sheet, Row,
  Stepper,
  Pill,
  Button, ButtonRow, Stack,
  AttentionCard, TrustLine,
} from "@/components/ui";

/**
 * /ui-lab — every primitive in src/components/ui, rendered against the REAL
 * tokens, with a live theme flip.
 *
 * ── Why this route exists rather than just shipping the components ──────
 * Two reasons, both practical.
 *
 * 1. The HTML mockup in reference/dashboard-concept-v2.html carries its own
 *    COPY of the token tables. It therefore cannot prove anything about light
 *    mode on the real site: it proves the mockup's light values look right.
 *    This page resolves --ff-* from main.tsx, so what you see here is what the
 *    dashboards will render.
 *
 * 2. CLAUDE.md is explicit that an import-graph walk from main.tsx is the
 *    authority on reachability, and that a dead file a stale doc vouches for is
 *    worse than either alone. Primitives built in one pass and mounted in the
 *    next would be eleven unreachable files in between. This mounts them on
 *    arrival.
 *
 * ── It is unlinked and noindexed ────────────────────────────────────────
 * Nothing in the nav or footer points here; the route is reachable only by
 * typing it. The robots meta is set on mount and REMOVED on unmount — leaving
 * it behind would noindex whatever page the person navigated to next, and
 * upsertMeta mutates the existing head element in place, so a stale robots tag
 * is sticky and silent. A wrong robots tag throws no error; you find out from
 * a ranking drop weeks later.
 *
 * Delete this page when the three dashboards are ported and it stops earning
 * its keep.
 */
export default function UiLab() {
  const [theme, setT] = React.useState<Theme>(() => getTheme());
  const [job, setJob] = React.useState("a");

  React.useEffect(() => {
    upsertMeta('meta[name="robots"]', "name", "robots", "noindex,nofollow");
    document.title = "UI Lab · Freddy Fix It";
    return () => {
      document.head.querySelector('meta[name="robots"]')?.remove();
    };
  }, []);

  function flip(next: Theme) {
    setTheme(next);
    setT(next);
  }

  const wrap: React.CSSProperties = {
    maxWidth: 420,
    margin: "0 auto",
    padding: "0 clamp(1rem, 4vw, 1.5rem) 4rem",
  };
  const label: React.CSSProperties = {
    fontFamily: "'Bebas Neue', sans-serif",
    fontSize: ".82rem",
    letterSpacing: ".11em",
    color: "rgba(var(--ff-muted), .7)",
    margin: "2.5rem 0 .5rem",
  };

  return (
    <div style={{ background: "var(--ff-bg)", minHeight: "100vh", paddingTop: "1.25rem" }}>
      <div style={wrap}>
        {/* Theme flip. The whole point of the page, so it sits above everything. */}
        <div
          style={{
            display: "flex",
            gap: "var(--ff-s2)",
            padding: "var(--ff-s2)",
            background: "var(--ff-card-bg)",
            border: "1px solid var(--ff-card-border)",
            borderRadius: "var(--ff-r2)",
            marginBottom: "var(--ff-s5)",
          }}
        >
          {(["dark", "light"] as Theme[]).map((t) => (
            <Button
              key={t}
              variant={theme === t ? "primary" : "ghost"}
              full
              onClick={() => flip(t)}
            >
              {t.toUpperCase()}
            </Button>
          ))}
        </div>

        {/* ── The pass, assembled the way a real screen assembles it ───── */}
        <p style={label}>PASS · YOUR TURN</p>
        <div style={{ borderRadius: "var(--ff-r4)", overflow: "hidden", boxShadow: "var(--ff-lift-3)" }}>
          <Pass>
            <PassTop>
              <IconButton label="Notifications" badge={3}>
                <Ic name="bell" size={17} />
              </IconButton>
            </PassTop>

            <JobSwitcher
              jobs={[
                { id: "a", label: "FURNACE", state: "turn" },
                { id: "b", label: "KITCHEN TAP", state: "wait" },
                { id: "c", label: "FENCE", state: "ok" },
              ]}
              activeId={job}
              onSelect={setJob}
              onNew={() => {}}
            />

            <StateLine state="turn" pulse>
              YOUR TURN
            </StateLine>
            <Hero>Three pros have sent you estimates.</Hero>
            <HeroSub>Pick one and we'll get them booked in. Nothing is charged until you do.</HeroSub>

            <PassMeta>
              <PassMetaItem label="PROS BIDDING" value="3" />
              <PassMetaItem label="LOWEST" value="$340" accent />
              <PassMetaItem label="POSTED" value="2 DAYS AGO" />
            </PassMeta>
          </Pass>
        </div>

        {/* ── Waiting: the same pass with ZERO orange on it ─────────────── */}
        <p style={label}>PASS · WAITING (NO ORANGE ANYWHERE — THIS IS THE RULE)</p>
        <div style={{ borderRadius: "var(--ff-r4)", overflow: "hidden", boxShadow: "var(--ff-lift-3)" }}>
          <Pass>
            <PassTop>
              <IconButton label="Notifications">
                <Ic name="bell" size={17} />
              </IconButton>
            </PassTop>
            <StateLine state="wait">WITH YOUR PRO</StateLine>
            <Hero>Dan is coming Thursday at 9am.</Hero>
            <HeroSub>Nothing needed from you until the work is done.</HeroSub>
            <PassMeta>
              <PassMetaItem label="PRO" value="DAN R." />
              <PassMetaItem label="AGREED" value="$420" />
            </PassMeta>
          </Pass>
        </div>

        {/* ── Attention card ──────────────────────────────────────────────── */}
        <p style={label}>ATTENTION CARD · MONEY ROWS FIRST</p>
        <AttentionCard>
          <Row
            icon="dollar"
            title="Pay the deposit to lock in Thursday"
            sub="40% now, the rest when the work is signed off."
            amount="$168"
            chevron
            onClick={() => {}}
          />
          <Row
            icon="camera"
            tone="warn"
            title="Add a photo of the furnace"
            sub="Helps your pro bring the right part."
            chevron
            onClick={() => {}}
          />
          <Row
            icon="message-square"
            tone="neutral"
            title="Dan sent you 2 messages"
            sub="About your furnace"
            chevron
            onClick={() => {}}
          />
        </AttentionCard>

        <TrustLine>
          Your deposit is <b>held securely</b> and only sent to your pro once you've signed off on the
          work.
        </TrustLine>

        {/* ── Sheet of rows ───────────────────────────────────────────────── */}
        <Group label="ALL YOUR JOBS" action={<Pill tone="neutral">3</Pill>}>
          <Sheet>
            <Row
              icon="thermometer"
              title="Furnace not igniting"
              sub="3 estimates in"
              right={<Pill tone="accent">PICK A PRO</Pill>}
              chevron
              onClick={() => {}}
              active
            />
            <Row
              icon="droplet"
              tone="neutral"
              title="Kitchen tap dripping"
              sub="Waiting on Dan to accept"
              right={<Pill tone="neutral">WITH PRO</Pill>}
              chevron
              onClick={() => {}}
            />
            <Row
              icon="hammer"
              tone="good"
              title="Fence post repair"
              sub="Finished 12 Oct · paid"
              amount="$260"
              chevron
              onClick={() => {}}
            />
          </Sheet>
        </Group>

        {/* ── Stepper ─────────────────────────────────────────────────────── */}
        <Group label="WHAT'S LEFT">
          <Sheet>
            <Stepper
              steps={[
                { title: "Request posted", sub: "28 Oct, 4:12pm", state: "done" },
                { title: "Pros sent estimates", sub: "3 of them", state: "done" },
                { title: "Pick your pro", sub: "This is the bit we need from you", state: "now" },
                { title: "Sign the agreement", state: "todo" },
                { title: "Pay the deposit", state: "todo" },
                { title: "Work gets done", state: "todo" },
              ]}
            />
          </Sheet>
        </Group>

        {/* ── Pills ───────────────────────────────────────────────────────── */}
        <p style={label}>PILLS</p>
        <div style={{ display: "flex", flexWrap: "wrap", gap: "var(--ff-s2)" }}>
          <Pill tone="accent">PICK A PRO</Pill>
          <Pill tone="good">PAID</Pill>
          <Pill tone="warn">IN REVIEW</Pill>
          <Pill tone="danger">DECLINED</Pill>
          <Pill tone="neutral">DRAFT</Pill>
        </div>

        {/* ── Buttons ─────────────────────────────────────────────────────── */}
        <p style={label}>BUTTONS · PRIMARY ON THE RIGHT</p>
        <ButtonRow>
          <Button variant="ghost" full>
            NOT NOW
          </Button>
          <Button variant="primary" full>
            PICK DAN
          </Button>
        </ButtonRow>
        <Stack>
          <Button variant="primary" full loading>
            PAYING
          </Button>
          <Button variant="secondary" full>
            MESSAGE YOUR PRO
          </Button>
          <Button variant="secondary" full disabled>
            PAY BALANCE (NOT DUE YET)
          </Button>
          <Button variant="danger" full>
            WITHDRAW THIS REQUEST
          </Button>
        </Stack>

        {/* ── Review state, for the contractor side ───────────────────────── */}
        <p style={label}>REVIEW STATE · CONTRACTOR VETTING</p>
        <div style={{ borderRadius: "var(--ff-r4)", overflow: "hidden", boxShadow: "var(--ff-lift-3)" }}>
          <Pass>
            <PassTop />
            <StateLine state="review" pulse>
              IN REVIEW
            </StateLine>
            <Hero>We're checking your licence and insurance.</Hero>
            <HeroSub>Usually within 24 hours. Two things you can do now:</HeroSub>
          </Pass>
        </div>
        <Sheet style={{ marginTop: "var(--ff-s4)" }}>
          <Row
            icon="dollar"
            title="Connect payouts"
            sub="Until this is done, clients can't be charged for your jobs."
            right={<Pill tone="accent">DO THIS FIRST</Pill>}
            chevron
            onClick={() => {}}
          />
          <Row
            icon="camera"
            tone="neutral"
            title="Add photos of your work"
            sub="Profiles with photos win about twice as many jobs."
            chevron
            onClick={() => {}}
          />
        </Sheet>

        <p style={{ ...label, marginBottom: 0 }}>
          UNLINKED + NOINDEXED · DELETE THIS PAGE ONCE ALL THREE DASHBOARDS ARE PORTED
        </p>
      </div>
    </div>
  );
}
