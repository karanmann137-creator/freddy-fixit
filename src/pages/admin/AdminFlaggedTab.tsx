// Extracted from src/pages/AdminDashboard.tsx on 2026-11-12 (mechanical move, no behaviour change).
// Props are exactly the parent-component values this tab reads.
import { DashCard, Pill, Button } from "@/components/ui";
import { jobCode } from "@/lib/jobCode";

export default function AdminFlaggedTab(props: {
  tabNote: (key: string, text: string) => import("react/jsx-runtime").JSX.Element | null;
  chatFlagsFailed: boolean;
  loadAll: () => Promise<void>;
  chatFlags: any[];
  s: { title: { fontSize: string; fontWeight: number; color: string; marginBottom: string; }; meta: { fontSize: string; color: string; marginBottom: string; }; };
}) {
  const { tabNote, chatFlagsFailed, loadAll, chatFlags, s } = props;
  return (
    <div>
            {tabNote("flagged", "Messages the chat guard stopped before they reached the other person. The sender saw a note explaining why and could rewrite it. Nothing here was delivered — this is the record, kept so you can spot anyone who keeps trying to take a job off the platform.")}
            {/* The 🎉 below is why this one needed the flag most: on a failed
                read it congratulated the owner for a clean record the dashboard
                had never actually looked at. */}
            {chatFlagsFailed && (
              <p style={{ color:"var(--ff-warn)", fontSize:".9rem" }}>
                Couldn&rsquo;t load the blocked messages, so this list may be missing some. <Button onClick={() => loadAll()}>Retry</Button>
              </p>
            )}
            {!chatFlagsFailed && chatFlags.length === 0 && (
              <p style={{ color:"rgba(var(--ff-muted), .45)" }}>Nothing has been blocked. 🎉</p>
            )}
            {chatFlags.map(f => (
              /* A <DashCard> and NOT a <Row>: the payload is a quoted block of
                 the blocked message, which is the whole reason this record
                 exists. A Row has nowhere to put a pre-wrapped paragraph. The
                 only surviving style override is the red `borderColor` — a
                 LONGHAND, so `.ffd-card`'s own `var(--ff-hair-w)` width and
                 `solid` style survive it. Writing the `border` shorthand here
                 would silently take the edge back to 1px. */
              <DashCard key={f.message_id} style={{ borderColor:"rgba(var(--ff-danger-rgb), .3)" }}>
                <div style={{ display:"flex", justifyContent:"space-between", gap:".75rem", flexWrap:"wrap", alignItems:"baseline" }}>
                  <div style={{ fontWeight:600, color:"var(--ff-text)" }}>
                    {f.sender_name || "Someone"}
                    <span style={{ fontSize:".72rem", fontWeight:600, color:"rgba(var(--ff-muted), .55)", marginLeft: "var(--ff-s2)", textTransform:"capitalize" as const }}>
                      {f.sender_role || "user"}
                    </span>
                  </div>
                  <div style={{ ...s.meta, color:"rgba(var(--ff-muted), .45)" }}>
                    {new Date(f.created_at).toLocaleString("en-CA", { dateStyle:"medium", timeStyle:"short" })}
                  </div>
                </div>
                <div style={{ display:"flex", gap:".35rem", flexWrap:"wrap", margin:".5rem 0" }}>
                  {(f.flag_reasons ?? []).map((r: string) => (
                    <Pill key={r} tone="danger">{String(r).replace(/_/g, " ")}</Pill>
                  ))}
                </div>
                <div style={{
                  fontSize:".85rem", lineHeight:1.6, color:"var(--ff-text)", whiteSpace:"pre-wrap",
                  background:"rgba(var(--ff-fg), .05)", borderLeft:"3px solid rgba(var(--ff-danger-rgb), .5)",
                  borderRadius:6, padding:".6rem .75rem",
                }}>{f.content}</div>
                <div style={{ ...s.meta, marginTop:".55rem" }}>
                  {f.service || "Job"}
                  {f.client_name ? " · client " + f.client_name : ""}
                  {f.contractor_name ? " · pro " + f.contractor_name : ""}
                  {f.job_id ? " · " + jobCode(f.job_id) : ""}
                </div>
              </DashCard>
            ))}
          </div>
  );
}
