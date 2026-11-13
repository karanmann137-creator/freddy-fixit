// Extracted from src/pages/AdminDashboard.tsx on 2026-11-12 (mechanical move, no behaviour change).
// Props are exactly the parent-component values this tab reads.
import { Group, Sheet, Row, Button } from "@/components/ui";

export default function AdminActivityTab(props: {
  auditFailed: boolean;
  loadAll: () => Promise<void>;
  audit: any[];
}) {
  const { auditFailed, loadAll, audit } = props;
  return (
    <div>
            <p style={{ color:"rgba(var(--ff-muted), .5)", fontSize:".82rem", marginBottom:"1rem", lineHeight:1.5 }}>
              Every account deletion, job deletion, login-email change, bulk email, platform pause and
              contractor status change — who did it, to what, and when. Read-only; nothing here can be edited or cleared.
            </p>
            {auditFailed && (
              <p style={{ color:"var(--ff-warn)", fontSize:".9rem" }}>
                Couldn&rsquo;t load the activity log. <Button onClick={() => loadAll()}>Retry</Button>
              </p>
            )}
            {!auditFailed && audit.length === 0 && (
              <p style={{ color:"rgba(var(--ff-muted), .45)" }}>
                No admin actions recorded yet. The log starts from 3 Nov 2026 — anything done before that was never recorded.
              </p>
            )}
            {/* The log is the one tab that is unambiguously a list of rows: no
                controls, one record per line, read in scan order. A <Sheet> is
                what that is. Nothing is dropped — every detail key still
                renders, joined onto the sub line rather than stacked in a box,
                because a 24-row log of boxed JSON is unscannable. */}
            {audit.length > 0 && (
              <Group label={"ADMIN ACTIONS (" + audit.length + ")"}>
                <Sheet>
                  {audit.map((a:any) => {
                    const d = a.detail && typeof a.detail === "object" ? a.detail : null;
                    const pairs = d ? Object.entries(d).filter(([, v]) => v !== null && v !== "" && v !== undefined) : [];
                    return (
                      <Row key={a.id} icon="clock" tone="neutral"
                        title={String(a.action || "action").replace(/_/g, " ")}
                        sub={
                          <>
                            {a.actor_email || "(account since removed)"}
                            {a.via === "edge" ? " · via dashboard tool" : ""}
                            {a.target_table ? " · " + String(a.target_table) + (a.target_id ? " " + String(a.target_id) : "") : ""}
                            {pairs.length > 0
                              ? " · " + pairs.map(([k, v]) => k.replace(/_/g, " ") + ": " + (typeof v === "object" ? JSON.stringify(v) : String(v))).join(" · ")
                              : ""}
                          </>
                        }
                        right={<span style={{ fontSize:".76rem", color:"rgba(var(--ff-muted), .45)" }}>{a.at_local || ""}</span>}
                      />
                    );
                  })}
                </Sheet>
              </Group>
            )}
          </div>
  );
}
