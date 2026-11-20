import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";

/* ── TrustNumbers ─────────────────────────────────────────────────────────────
   The live traction panel. Two funnels, one component: `side="client"` on
   /client-onboarding, `side="contractor"` on /contractor-onboarding.

   WHY IT LIVES ON THE ONBOARDING FORMS AND NOT ON THE MARKETING PAGES.
   Moved there 2026-11-20 at the owner's instruction, and it reads better where
   it is: the numbers now sit at the moment of commitment rather than the moment
   of browsing, which is where a wavering signup actually needs them.

   IT IS A PANEL, NOT A FULL-BLEED BAND, and that is not a style preference.
   Both onboarding pages are a 580px column over a photo background. A strip
   with top and bottom hairlines across a narrow column reads as a broken
   section rather than as a stat block, so this matches the forms' own card
   (`s.card` in both files: same tint, same hairline width, 14px radius).

   FIRST SCREEN ONLY, which is the rule `OnboardingVideo` already follows on
   both pages, for the reason stated there: somebody three screens deep has
   worked out how this goes. On a later step this is clutter above a form the
   person is already filling in, and on a 380px phone it pushes the first input
   off screen. ⚠️ The two pages spell "first screen" DIFFERENTLY and the mounts
   must each copy their own page's video: the contractor flow's steps are
   positional, so `step === 1`, but the client flow's are append-only IDs over
   two possible `visiblePath`s, so `step === S_DESCRIBE` — a literal 1 there is
   the wrong screen on one of the two paths.

   WHY IT READS THE DATABASE INSTEAD OF HOLDING A NUMBER.
   The ask was for the page to say what the platform has done so far, so that
   each side can see the other side is real. A literal in this file would be a
   claim nobody can audit and it would be stale the next day — and a stale
   traction claim is a Competition Act problem, not a cosmetic one. So the
   figure is `platform_trust_stats()`, computed from the same rows it describes,
   and the copy says "live and counting" because that is now literally true:
   the next quote moves it with no deploy.

   THE WORD IS "QUOTED", NEVER "GENERATED" OR "EARNED".
   `work_quoted` is the highest quote on each request, summed. It is the value
   of work contractors have PRICED here. Total ever charged on this platform is
   $5.15. Anything that implies the money changed hands is false, and the gap is
   four orders of magnitude, so this is not a nuance to round off. Do not
   reword these labels without reading the comment on the migration that
   defines the number (supabase/migrations/20261120_platform_trust_stats.sql).

   ⚠️ A FAILED READ RENDERS NOTHING, AND THAT IS THE WHOLE DESIGN.
   "A failed read is not an empty result" — so there are three outcomes here,
   not two: loading, couldn't-tell, and a number. The first two render `null`.
   Zeros are not a fallback: "$0 of work quoted" on the homepage is a worse
   outcome than silence by a wide margin, and it is exactly what a `?? 0` would
   print on a dropped connection. Same reason `work_quoted <= 0` bails — a real
   zero and a misread zero are indistinguishable from here, and neither is
   worth showing.

   There is deliberately no DeadEnd and no Refresh button: this band is
   decoration on a page whose job is the CTA beneath it. A visitor who cannot
   see the stats has lost nothing and must not be handed an error to read.
   `ui/DeadEnd` is for a surface that cannot answer the question it was ASKED. ── */

type Stats = {
  work_quoted: number;
  quote_rate: number | null;
  requests_total: number;
  contractors_total: number;
};

type Tile = { value: string; label: string };

function money(n: number): string {
  return "$" + Math.floor(n).toLocaleString("en-CA");
}

export default function TrustNumbers({ side }: { side: "client" | "contractor" }) {
  const [stats, setStats] = useState<Stats | null>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const { data, error } = await supabase.rpc("platform_trust_stats");
        if (!alive) return;
        // An error, a null, or a shape we don't recognise are all the same
        // outcome: we don't know. Leave `stats` null and render nothing.
        if (error || !data || typeof data !== "object") return;
        const d = data as Record<string, unknown>;
        const work = Number(d.work_quoted);
        if (!Number.isFinite(work) || work <= 0) return;
        setStats({
          work_quoted: work,
          quote_rate: Number.isFinite(Number(d.quote_rate)) ? Number(d.quote_rate) : null,
          requests_total: Number(d.requests_total) || 0,
          contractors_total: Number(d.contractors_total) || 0,
        });
      } catch {
        // Network or parse failure — same outcome as above. Nothing renders, so
        // there is nothing to log for the visitor's benefit.
      }
    })();
    return () => { alive = false; };
  }, []);

  if (!stats) return null;

  const rate = stats.quote_rate;

  /* Three tiles max — Miller. The third tile differs by side on purpose: a
     homeowner wants to know how many pros are waiting; a contractor wants to
     know how much work is coming through, and "25 other pros" would read as
     competition on the page whose job is to recruit him. */
  const tiles: Tile[] = side === "client"
    ? [
        { value: money(stats.work_quoted), label: "of work quoted by local pros" },
        ...(rate !== null ? [{ value: rate + "%", label: "of requests got a quote" }] : []),
        { value: String(stats.contractors_total), label: "Calgary pros signed up" },
      ]
    : [
        { value: money(stats.work_quoted), label: "of work quoted through Freddy" },
        ...(rate !== null ? [{ value: rate + "%", label: "of requests reached a pro" }] : []),
        { value: String(stats.requests_total), label: "homeowner requests posted" },
      ];

  return (
    <div
      className="ff-tn"
      style={{
        /* Neutral ground, accent hairline, accent numerals. The ground is
           deliberately NOT an orange tint: both pages can render the orange
           restored-draft notice a line or two above this panel, and two
           adjacent washes read as mud. The numerals are the one orange thing
           here — Von Restorff only pays out once per view.

           The tint and hairline width match `s.card` on both onboarding pages
           so this sits in the column as a sibling of the form rather than as
           a foreign object. The hairline is the accent at low alpha, not the
           card's neutral, which is the one thing that separates the two. */
        background: "rgba(var(--ff-fg), .05)",
        border: "var(--ff-hair-w) solid rgba(var(--ff-accent-rgb), .22)",
        borderRadius: "14px",
        padding: "1.5rem 1.25rem",
        marginBottom: "var(--ff-s6)",
      }}
    >
      {/* Bebas on the numerals and the eyebrow: that is the rule everywhere,
          including inside the display-face pages. The labels stay body copy. */}
      {/* Three fixed columns, collapsing to one stacked list under 480px —
          NOT auto-fit. In a 580px column auto-fit would fit two of the three
          tiles per row and leave the third alone on a second row, and the
          ragged 2+1 reads as a layout bug rather than as three stats. Below
          480px three columns are ~100px wide, and the labels cannot shrink to
          suit: the coarse-pointer font floor in main.tsx forces every label to
          16px no matter what size is declared here, so a narrow column wraps
          "of work quoted by local pros" into four lines. One stat per row is
          the honest answer on a phone. */}
      <style>{".ff-tn-num{font-family:'Bebas Neue',sans-serif;letter-spacing:.01em;line-height:1;color:var(--ff-c10);font-size:clamp(1.6rem,5.2vw,2.1rem)} .ff-tn-eyebrow{font-family:'Bebas Neue',sans-serif;letter-spacing:.14em;font-size:.95rem;color:rgba(var(--ff-fg), .6);text-transform:uppercase} .ff-tn-label{font-size:.95rem;line-height:1.35;color:rgba(var(--ff-fg), .82);font-weight:500} .ff-tn-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:1rem} @media (max-width:479px){.ff-tn-grid{grid-template-columns:minmax(0,1fr);gap:.9rem}}"}</style>

      {/* No max-width wrapper: the onboarding column is already 580px, and a
          56.8rem cap inside it was a leftover from the full-bleed band, where
          it was the only thing stopping the tiles spanning a 1440px screen. */}
      <div>
        <p className="ff-tn-eyebrow" style={{ textAlign: "center", marginBottom: "var(--ff-s4)" }}>
          Live and counting
        </p>

        <div className="ff-tn-grid">
          {tiles.map((t) => (
            <div key={t.label} style={{ textAlign: "center" as const }}>
              <div className="ff-tn-num">{t.value}</div>
              <div className="ff-tn-label" style={{ marginTop: "var(--ff-s2)" }}>{t.label}</div>
            </div>
          ))}
        </div>

        <p
          style={{
            margin: "var(--ff-s4) 0 0",
            textAlign: "center" as const,
            fontSize: ".92rem",
            lineHeight: 1.55,
            color: "var(--ff-ink-3)",
          }}
        >
          {/* Shorter than the band's version was. In a panel above a form,
              every line here is a line between the person and the first input,
              so the sentence keeps only the two claims that have to be made:
              what the number IS (quoted, not collected — the Competition Act
              point) and that it moves on its own. */}
          {side === "client"
            ? "Quoted work, counted from real requests on this platform. We're young, local, and growing."
            : "Quoted work, counted from real requests here — it moves every time you price a job. No lead fees, ever."}
        </p>
      </div>
    </div>
  );
}
