// Extracted from src/pages/ClientDashboard.tsx on 2026-11-12 (mechanical move, no behaviour change).
// Props are exactly the parent-component values this tab reads.
import { Group, Sheet, Row, Pill, Button } from "@/components/ui";
import { searchTokens, matchesSearch } from "@/lib/dashSearch";
import { reqSearchFields, STATUS_META, canRemoveRequest } from "./shared";
import DashSearch from "@/components/DashSearch";
import { type IconName, Ic } from "@/components/Ic";

import type { ClientTab } from "./shared";
export default function ClientHistoryTab(props: {
  requests: any[];
  histFilter: "all" | "active" | "completed" | "cancelled";
  search: string;
  histLimit: number;
  setHistFilter: import("react").Dispatch<import("react").SetStateAction<"all" | "active" | "completed" | "cancelled">>;
  setHistLimit: import("react").Dispatch<import("react").SetStateAction<number>>;
  setSearch: import("react").Dispatch<import("react").SetStateAction<string>>;
  setSelectedReqId: import("react").Dispatch<import("react").SetStateAction<string | null>>;
  setActiveTab: import("react").Dispatch<import("react").SetStateAction<ClientTab>>;
  busyReq: boolean;
  removeRequest: (r: any) => Promise<void>;
}) {
  const { requests, histFilter, search, histLimit, setHistFilter, setHistLimit, setSearch, setSelectedReqId, setActiveTab, busyReq, removeRequest } = props;
  return (
    (() => {
                  // Include every request (the active one too) so History is the complete record.
                  const histAll = requests;
                  if (histAll.length === 0) return (
                    <Group label="Request history">
                      <Sheet style={{ padding:"var(--ff-s5)" }}>
                        <p style={{ fontSize:".88rem", color:"rgba(var(--ff-muted), .55)", margin:0 }}>Nothing here yet — your past requests will show up once you&rsquo;ve posted one.</p>
                      </Sheet>
                    </Group>
                  );
                  const matches = (r: any) =>
                    histFilter === "all" ? true :
                    histFilter === "completed" ? r.status === "completed" :
                    histFilter === "cancelled" ? r.status === "cancelled" :
                    (r.status !== "completed" && r.status !== "cancelled");
                  // Search narrows WITHIN the chosen status filter rather than
                  // replacing it, so the two controls compose instead of one
                  // silently overriding the other.
                  const histTokens = searchTokens(search);
                  const filtered = histAll.filter(r => matches(r) && matchesSearch(histTokens, reqSearchFields(r)));
                  const shown = filtered.slice(0, histLimit);
                  const FILTERS: { key: typeof histFilter; label: string }[] = [
                    { key: "all", label: "All" },
                    { key: "active", label: "Active" },
                    { key: "completed", label: "Completed" },
                    { key: "cancelled", label: "Cancelled" },
                  ];
                  return (
                    /* <Group> rather than a card: the caption is the Bebas label
                       above an inset sheet, so History stops being "a box with a
                       title inside it" and starts matching every other grouped
                       list on the redesigned dashboards. The count moves into the
                       caption's `action` slot, which is what that slot is for —
                       it used to be absent, so you had to count the rows.

                       The filter chips and the search box sit BETWEEN the caption
                       and the sheet, outside both, because they act on the sheet
                       rather than belonging to it. */
                    <Group
                      label="Request history"
                      action={<span style={{ opacity:.7 }}>{filtered.length} of {histAll.length}</span>}
                    >
                      {/* ⚠️ The shared `.ffd-tab` LOOK but NOT <DashTabs>, and
                          the refusal is semantic rather than cosmetic — same
                          call Admin made for its Accounts role chips and its
                          Agents filter. DashTabs renders role="tablist" with
                          aria-selected, which claims these switch between
                          SECTIONS of the page. These FILTER one list: the tab is
                          still "history" whichever chip is lit, so announcing
                          them as a tablist would tell a screen reader the page
                          changed when it did not. `aria-pressed` says what
                          actually happened.

                          The `.4rem .85rem` / `.8rem` override is gone with
                          `s.tab`: it was shrinking these chips below the 48px
                          thumb floor that the pointer:coarse block in main.tsx
                          promises, and `.ffd-tab` reads --ff-h-ctl so it clears
                          the floor by construction. That was invisible on a Mac. */}
                      <div className="ffd-tabs" style={{ marginBottom:"var(--ff-s3)" }}>
                        {FILTERS.map(f => (
                          <button key={f.key} type="button" onClick={() => { setHistFilter(f.key); setHistLimit(5); }} aria-pressed={histFilter === f.key} className={histFilter === f.key ? "ffd-tab ffd-on" : "ffd-tab"}>{f.label}</button>
                        ))}
                      </div>
                      {histAll.length > 3 && (
                        <DashSearch
                          value={search}
                          onChange={v => { setSearch(v); setHistLimit(5); }}
                          placeholder="Search your history"
                          resultText={filtered.length + " of " + histAll.filter(matches).length + " shown"}
                        />
                      )}
                      {shown.length === 0 ? (
                        <div style={{ fontSize:".85rem", color:"rgba(var(--ff-muted), .5)", padding:".5rem 0" }}>
                          {searchTokens(search).length > 0
                            ? "Nothing matches that."
                            : "No " + (histFilter === "all" ? "" : histFilter + " ") + "requests to show."}
                        </div>
                      ) : (
                        /* One <Sheet> with hairline-separated <Row>s, replacing the
                           hand-rolled flex row with its own padding and its own
                           borderBottom. The win is not that it looks nicer in
                           isolation — it is that the row's icon column and the
                           hairline under it both read --ff-gut, so the separator
                           starts exactly where the text does and can never drift
                           from the column above it. The old markup had no icon
                           column at all, so the status was carried entirely by a
                           chip at the far right of the row, which on a phone wrapped
                           onto its own line about half the time. */
                        <Sheet>
                          {shown.map(r => (
                            <Row
                              key={r.id}
                              icon={(STATUS_META[r.status]?.icon as IconName) ?? "clipboard-list"}
                              tone={STATUS_META[r.status]?.rowTone ?? "neutral"}
                              title={r.service_needed}
                              sub={new Date(r.created_at).toLocaleDateString()}
                              right={
                                <>
                                  {/* No icon inside the pill any more — the Row's own
                                      icon column already carries it, and the same
                                      glyph twice on one row is noise. */}
                                  <Pill tone={STATUS_META[r.status]?.tone ?? "neutral"}>
                                    {STATUS_META[r.status]?.label ?? r.status}
                                  </Pill>
                                  {/* ⚠️ `completed` is deliberately INCLUDED here, and
                                      the exclusion it replaces is why zero reviews
                                      exist. The rating form renders only when the
                                      completed job is the ACTIVE job, but `openReqs`
                                      filters completed out, `activeReq` falls back to
                                      `requests[0]` only when there are no open
                                      requests at all, and the switcher lists
                                      `openReqs` alone — so this button was the one
                                      and only thing on the platform that could make a
                                      finished job active, and it was hidden on
                                      exactly the status that needs it. The review ask
                                      then survived solely as the one-shot completion
                                      modal: miss or dismiss it and the rating was
                                      unreachable forever. `cancelled` stays hidden —
                                      there is nothing to do on it. The job read at
                                      `activeReq.id` already excludes only cancelled
                                      jobs, so a completed request loads its job
                                      normally, and the form self-gates on
                                      `activeJob.status === "completed"` and
                                      `hasReviewed`. The label says so, because "View"
                                      gives a client no reason to press it. */}
                                  {r.status !== "cancelled" && (
                                    <Button onClick={() => { setSelectedReqId(r.id); setActiveTab("requests"); window.scrollTo({ top: 0 }); }}>
                                      {r.status === "completed" ? "View & rate" : "View"}
                                    </Button>
                                  )}
                                  {canRemoveRequest(r, null) && (
                                    <Button variant="danger" aria-label="Delete this request" disabled={busyReq} onClick={() => removeRequest(r)}>
                                      <Ic name="trash" size={13} />
                                    </Button>
                                  )}
                                </>
                              }
                            />
                          ))}
                        </Sheet>
                      )}
                      {filtered.length > histLimit && (
                        <Button full style={{ marginTop:"var(--ff-s3)" }} onClick={() => setHistLimit(l => l + 5)}>
                          Show more ({filtered.length - histLimit})
                        </Button>
                      )}
                    </Group>
                  );
                })()
  );
}
