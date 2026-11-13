// Extracted from src/pages/ClientDashboard.tsx on 2026-11-12 (mechanical move, no behaviour change).
// Props are exactly the parent-component values this tab reads.
import { Group, Sheet, Row, Button } from "@/components/ui";
import { Ic } from "@/components/Ic";

export default function ClientProsTab(props: {
  pros: any[];
  toggleFav: (contractorId: string) => Promise<void>;
  rehire: (pro: any) => void;
}) {
  const { pros, toggleFav, rehire } = props;
  return (
    (pros.length > 0 ? (
          /* ── My Pros, ported off the horizontal card rail ──────────────────
             This was a `overflowX:"auto"` strip of fixed 210px cards. Two
             things were wrong with that and neither was cosmetic:

             1. A horizontal scroller inside a vertically-scrolling page hides
                its own contents. With four pros, pro #3 onward was off-screen
                with no affordance saying so — the same "no way to reach the
                rest" defect the owner reported about multi-job access, just
                on a different axis.
             2. 210px could not hold a company name, so the card needed its own
                minWidth:0 + ellipsis dance (the comment that used to live here
                existed only to explain that workaround). A full-width row has
                room, so the clipping question stops existing.

             The favourite heart is the ONE orange thing on this tab, and it
             earns it: there is no "turn" state on My Pros at all, so the
             accent budget is unspent, and a filled heart means "mine" — which
             is the only thing on the tab the client themselves set. It reads
             `--ff-accent-500`, not the literal, so it re-themes in light mode.

             `♥`/`♡` stay as text glyphs rather than becoming an <Ic>: there is
             no heart in Ic's hand-copied Lucide set, and a missing glyph
             renders BLANK with no error rather than failing loudly. */
          <Group
            label="Your pros"
            action={<span style={{ opacity:.7 }}>{pros.length}</span>}
          >
            <div style={{ fontSize:".8rem", color:"rgba(var(--ff-muted), .55)", marginBottom:"var(--ff-s3)" }}>Rebook someone you trust — they&rsquo;ll be requested directly.</div>
            <Sheet>
              {pros.map(pro => (
                <Row
                  key={pro.contractor_id}
                  icon="user-check"
                  tone="neutral"
                  title={pro.company_name || pro.name || "Your pro"}
                  sub={
                    (pro.rating ? `⭐ ${Number(pro.rating).toFixed(1)}` : "New")
                    + (pro.jobs_together ? ` · ${pro.jobs_together} job${pro.jobs_together===1?"":"s"} together` : "")
                    + (pro.last_service ? ` · last: ${pro.last_service}` : "")
                  }
                  right={
                    <>
                      <Button
                        variant="ghost"
                        aria-label={pro.is_favorite ? "Remove favourite" : "Add favourite"}
                        onClick={() => toggleFav(pro.contractor_id)}
                        style={{ fontSize:"1.05rem", lineHeight:1, padding:".25rem .4rem", color: pro.is_favorite ? "var(--ff-accent-500)" : "rgba(var(--ff-muted), .4)" }}
                      >
                        {pro.is_favorite ? "♥" : "♡"}
                      </Button>
                      <Button variant="primary" onClick={() => rehire(pro)}>Book again</Button>
                    </>
                  }
                />
              ))}
            </Sheet>
          </Group>
        ) : (
          <div style={{ textAlign:"center", padding:"3.5rem 2rem" }}>
            <div style={{ marginBottom:"1rem" }}><Ic name="user-check" size={44} color="var(--ff-c10)" /></div>
            <h2 style={{ fontFamily:"'Bebas Neue',sans-serif", fontSize:"1.5rem", letterSpacing:".03em", lineHeight:1.1, marginBottom:".4rem" }}>No pros yet</h2>
            <p style={{ color:"rgba(var(--ff-muted), .5)", fontSize:".9rem" }}>Once you've worked with a contractor, they'll show up here so you can rebook them in one tap.</p>
          </div>
        ))
  );
}
