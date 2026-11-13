// Extracted from src/pages/AdminDashboard.tsx on 2026-11-12 (mechanical move, no behaviour change).
// Props are exactly the parent-component values this tab reads.
import { searchTokens, matchesSearch } from "@/lib/dashSearch";
import DashSearch from "@/components/DashSearch";
import { DashCard, Pill, Button } from "@/components/ui";
import { Ic } from "@/components/Ic";
import RequestPhotoQuote from "@/components/RequestPhotoQuote";
import { adminReqFields } from "./shared";

export default function AdminRequestsTab(props: {
  search: string;
  requests: any[];
  setSearch: import("react").Dispatch<import("react").SetStateAction<string>>;
  counts: { requests: number; jobs: number; };
  s: { title: { fontSize: string; fontWeight: number; color: string; marginBottom: string; }; meta: { fontSize: string; color: string; marginBottom: string; }; };
  bidsBy: Record<string, any[]>;
  nameFor: (id: string) => any;
  busyRefire: string | null;
  refireRequest: (r: any, confirmed?: boolean) => Promise<void>;
  busyDelete: boolean;
  deleteRequest: (r: any, confirmed?: boolean) => Promise<void>;
  pager: (which: "requests" | "jobs") => import("react/jsx-runtime").JSX.Element | null;
}) {
  const { search, requests, setSearch, counts, s, bidsBy, nameFor, busyRefire, refireRequest, busyDelete, deleteRequest, pager } = props;
  return (
    (() => {
          const tokens = searchTokens(search);
          const shown = requests.filter(r => matchesSearch(tokens, adminReqFields(r)));
          return (
          <div>
            {requests.length > 3 && (
              <DashSearch
                value={search}
                onChange={setSearch}
                placeholder="Search this page — service, client, address or status"
                resultText={shown.length + " of " + requests.length + " on this page (searches the page you're on, not all " + counts.requests + ")"}
              />
            )}
            {requests.length === 0 && <p style={{ color:"rgba(var(--ff-muted), .45)" }}>No requests yet.</p>}
            {/* A query that empties the list is a different fact from an empty
                page, and the pager is the fix for one and not the other. */}
            {requests.length > 0 && shown.length === 0 && (
              <p style={{ color:"rgba(var(--ff-muted), .45)", fontSize:".9rem" }}>
                Nothing on this page matches “{search}”. Try the next page, or{" "}
                <button type="button" onClick={() => setSearch("")} style={{ background:"none", border:"none", color:"var(--ff-c10)", fontFamily:"inherit", fontSize:".9rem", fontWeight:600, cursor:"pointer", padding:0 }}>clear the search</button>.
              </p>
            )}
            {shown.map(r => (
              <DashCard key={r.id}>
                <div style={s.title}>{r.service_needed}</div>
                <div style={s.meta}><Ic name="user" size={13} style={{ marginRight:4 }} />{r.first_name} {r.last_name} · <Ic name="phone" size={13} style={{ marginRight:4, marginLeft:4 }} />{r.phone}</div>
                <div style={s.meta}><Ic name="map-pin" size={13} style={{ marginRight:4 }} />{r.location} · <Ic name="timer" size={13} style={{ marginRight:4, marginLeft:4 }} />{r.preferred_schedule}</div>
                <div style={s.meta}>{r.job_description}</div>
                {/* Was `s.badge` — a raw --ff-accent-500 chip on EVERY request
                    row. A request's status is plain metadata with no urgency,
                    which is exactly what "neutral" is for, and neutral is the
                    right answer far more often than it feels like it is. */}
                <div style={{ marginTop:".5rem" }}><Pill tone="neutral">{r.status}</Pill></div>
                {/* Bid history stays visible AFTER the pick — the winner is marked and the
                    others are dimmed, so it's obvious who the client chose and who they passed on. */}
                {(bidsBy[r.id]?.length ?? 0) > 0 && (() => {
                  const bids = bidsBy[r.id];
                  const picked = bids.find((b: any) => b.status === "accepted");
                  return (
                    <div style={{ marginTop:".75rem" }}>
                      <div style={{ fontSize:".72rem", textTransform:"uppercase" as const, letterSpacing:".1em", color:"rgba(var(--ff-muted), .45)", marginBottom:".4rem" }}>
                        {r.status === "pending" ? `Bids (${bids.length}/7)` : `Bids (${bids.length})`}
                      </div>
                      {bids.map((b: any) => {
                        const won  = b.status === "accepted";
                        const lost = b.status === "declined";
                        return (
                          <div key={b.id} style={{
                            padding:".5rem .6rem", marginBottom:".4rem", borderRadius:"8px",
                            background: won ? "rgba(var(--ff-success-rgb), .08)" : "rgba(var(--ff-fg), .04)",
                            border: won ? "1px solid rgba(var(--ff-success-rgb), .4)" : "1px solid rgba(var(--ff-fg), .08)",
                            opacity: lost ? .55 : 1,
                          }}>
                            <div style={{ fontSize:".85rem", color:"var(--ff-text)", display:"flex", alignItems:"center", gap:".4rem", flexWrap:"wrap" as const }}>
                              <span>{nameFor(b.contractor_id)}{b.amount != null ? " — $" + b.amount : (b.walkthrough_requested ? " — walkthrough first" : "")}</span>
                              {won && <span style={{ fontSize:".65rem", background:"rgba(var(--ff-success-rgb), .18)", color:"var(--ff-success)", border:"1px solid rgba(var(--ff-success-rgb), .4)", borderRadius:"4px", padding:".1rem .4rem", letterSpacing:".04em" }}>✓ PICKED</span>}
                              {lost && <span style={{ fontSize:".65rem", color:"rgba(var(--ff-muted), .5)", letterSpacing:".04em" }}>not picked</span>}
                            </div>
                            {b.message && <div style={{ fontSize:".75rem", color:"rgba(var(--ff-muted), .6)" }}>{b.message}</div>}
                          </div>
                        );
                      })}
                      {r.status === "pending"
                        ? <div style={{ fontSize:".72rem", color:"rgba(var(--ff-muted), .4)" }}>The client picks a bid from their dashboard.</div>
                        : picked
                          ? <div style={{ fontSize:".72rem", color:"var(--ff-success)" }}>The client picked {nameFor(picked.contractor_id)}{picked.amount != null ? " at $" + picked.amount : ""}.</div>
                          : null}
                    </div>
                  );
                })()}
                {r.status !== "pending" && r.assigned_contractor_id && (
                  <div style={{ ...s.meta, marginTop:".5rem", color:"var(--ff-success)" }}>
                    Assigned to {nameFor(r.assigned_contractor_id)} ✓
                    {(bidsBy[r.id]?.length ?? 0) === 0 ? " (no bids — assigned directly)" : ""}
                  </div>
                )}
                <RequestPhotoQuote requestId={r.id} photoPath={r.photo_path} estimatedQuote={r.estimated_quote} quoteNotes={r.quote_notes} canQuote />
                <div style={{ marginTop:".75rem", display:"flex", gap:".5rem", flexWrap:"wrap" as const }}>
                  {/* Only for requests still taking bids — dispatch-job refuses anything
                      else, so offering the button there would be a dead control. */}
                  {r.status === "pending" && (
                    // Was an orange-tinted raw button, on every pending request
                    // in the list. `secondary` rather than `primary` on purpose:
                    // there are twenty of these on screen, and twenty primaries
                    // is no primary at all.
                    <Button disabled={busyRefire === r.id} onClick={() => refireRequest(r)}>
                      <Ic name="mail" size={13} style={{ marginRight:4 }} />
                      {busyRefire === r.id ? "Sending…" : "Re-send to contractors"}
                    </Button>
                  )}
                  <Button variant="danger" disabled={busyDelete} onClick={() => deleteRequest(r)}><Ic name="trash" size={13} style={{ marginRight:4 }} />Delete request</Button>
                </div>
                {r.status === "pending" && Number(r.refire_count ?? 0) > 0 && (
                  <div style={{ fontSize:".72rem", color:"rgba(var(--ff-muted), .45)", marginTop:".4rem" }}>
                    Re-sent {r.refire_count} time{Number(r.refire_count) === 1 ? "" : "s"}
                    {Number(r.refire_count) >= 2 ? " — automatic nudges are used up, but you can still re-send by hand." : "."}
                  </div>
                )}
              </DashCard>
            ))}
            {pager("requests")}
          </div>
          );
        })()
  );
}
