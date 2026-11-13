// Extracted from src/pages/ContractorDashboard.tsx on 2026-11-12 (mechanical move, no behaviour change).
// Props are exactly the parent-component values this tab reads.
import { searchTokens, matchesSearch } from "@/lib/dashSearch";
import { openJobSearchFields, ffInp, QuoteBreakdown } from "./shared";
import { Ic } from "@/components/Ic";
import DashSearch from "@/components/DashSearch";
import { freqLabel } from "@/lib/recurrence";
import { rangeText, benchmarkFor, type Grade, targetBid, money, TARGET_BID_DISCOUNT } from "@/lib/servicePricing";
import PriceGrade from "@/components/PriceGrade";
import JobDescription from "@/components/JobDescription";
import RequestPhotoQuote from "@/components/RequestPhotoQuote";

import type { ServicePrice } from "@/lib/servicePricing";
export default function ContractorAvailableTab(props: {
  search: string;
  availableJobs: any[];
  contractor: any;
  setActiveTab: import("react").Dispatch<import("react").SetStateAction<"jobs" | "available" | "messages" | "calendar" | "profile" | "earnings" | "reviews">>;
  s: { jobCard: { background: string; border: string; borderRadius: string; padding: string; marginBottom: string; cursor: string; }; btn: { minHeight: string; padding: string; background: string; border: string; borderRadius: string; color: string; fontFamily: string; fontSize: string; letterSpacing: string; cursor: string; }; primaryBtn: { minHeight: string; padding: string; background: string; color: string; border: string; borderRadius: string; boxShadow: string; fontFamily: string; fontSize: string; letterSpacing: string; cursor: string; }; earnCard: { background: string; border: string; borderRadius: string; padding: string; textAlign: "center"; }; chip: { padding: string; background: string; border: string; borderRadius: string; fontSize: string; color: string; display: string; margin: string; }; };
  setSearch: import("react").Dispatch<import("react").SetStateAction<string>>;
  priceFor: (svc?: string | null) => ServicePrice | null;
  pricing: Record<string, ServicePrice>;
  bidOpen: Record<string, boolean>;
  setBidOpen: import("react").Dispatch<import("react").SetStateAction<Record<string, boolean>>>;
  bid: { threads: import("@/lib/bidThreads").BidThread[]; started: import("@/lib/bidThreads").BidThread[]; byKey: Record<string, import("@/lib/bidThreads").BidThread>; byRequest: Record<string, import("@/lib/bidThreads").BidThread>; totalUnread: number; loading: boolean; error: boolean; refresh: () => Promise<void>; markRead: (requestId: string, contractorId: string) => Promise<void>; unreadFor: (requestId?: string | null, contractorId?: string | null) => number; };
  setBidChat: import("react").Dispatch<import("react").SetStateAction<{ requestId: string; name: string; title?: string | null; } | null>>;
  bidForm: Record<string, { amount: string; message: string; labour?: string; parts?: string; callout?: string; assumptions?: string; subject?: boolean; price_low?: string; price_high?: string; used_base_price?: boolean; walkthrough?: boolean; }>;
  setBid: (id: string, patch: any) => void;
  busyBid: string | null;
  placeBid: (r: any) => Promise<void>;
  hideJob: (r: any) => Promise<void>;
  hiding: string | null;
}) {
  const { search, availableJobs, contractor, setActiveTab, s, setSearch, priceFor, pricing, bidOpen, setBidOpen, bid, setBidChat, bidForm, setBid, busyBid, placeBid, hideJob, hiding } = props;
  return (
    (() => {
          const openTokens = searchTokens(search);
          const openHits = availableJobs.filter(r => matchesSearch(openTokens, openJobSearchFields(r)));
          return (
          <div>
            {contractor?.status !== "active" ? (
              <div style={{ textAlign:"center", padding:"4rem 2rem" }}>
                <div style={{ marginBottom:"1rem" }}><Ic name="clock" size={48} color="var(--ff-c10)" /></div>
                <h2 style={{ fontFamily:"'Bebas Neue',sans-serif", fontSize:"1.5rem", letterSpacing:".03em", lineHeight:1.1, marginBottom:".5rem" }}>Your Profile Is Under Review</h2>
                <p style={{ color:"rgba(var(--ff-muted), .55)", maxWidth:"420px", margin:"0 auto", lineHeight:1.6 }}>
                  Available jobs open up once our team approves your account. Make sure your profile and documents are complete so we can review you faster — you'll get an email the moment you're approved.
                </p>
                <button onClick={() => setActiveTab("profile")} style={{ ...s.btn, background:"var(--ff-c10)", color:"#fff", border:"none", marginTop:"1.25rem" }}>Complete my profile</button>
              </div>
            ) : (
            <>
            <p style={{ fontSize:".82rem", color:"rgba(var(--ff-muted), .45)", marginBottom:"1rem" }}>Open jobs that match your trades — lowest-competition first.</p>
            {availableJobs.length > 3 && (
              <DashSearch
                value={search}
                onChange={setSearch}
                placeholder="Search open jobs — service or area"
                resultText={openHits.length + " of " + availableJobs.length + " shown"}
              />
            )}
            {availableJobs.length > 0 && openHits.length === 0 ? (
              <div style={{ textAlign:"center" as const, padding:"2.5rem 1.5rem", color:"rgba(var(--ff-muted), .5)", fontSize:".9rem" }}>
                No open jobs match “{search}”. <button type="button" onClick={() => setSearch("")} style={{ background:"none", border:"none", color:"var(--ff-c10)", fontFamily:"inherit", fontSize:".9rem", fontWeight:600, cursor:"pointer", padding:0 }}>Clear search</button>
              </div>
            ) : availableJobs.length === 0 ? (
              <div style={{ textAlign:"center", padding:"4rem 2rem" }}>
                <div style={{ marginBottom:"1rem" }}><Ic name="clipboard-list" size={48} color="var(--ff-c10)" /></div>
                <h2 style={{ fontFamily:"'Bebas Neue',sans-serif", fontSize:"1.5rem", letterSpacing:".03em", lineHeight:1.1, marginBottom:".5rem" }}>No Open Jobs Right Now</h2>
                <p style={{ color:"rgba(var(--ff-muted), .5)" }}>New jobs matching your specialties will show up here. Add more specialties in your profile to see more work.</p>
                <button onClick={() => setActiveTab("profile")} style={{ ...s.btn, background:"var(--ff-c10)", color:"#fff", border:"none", marginTop:"1.25rem" }}>Update your specialties</button>
              </div>
            ) : openHits.map(r => (
              <div key={r.id} style={s.jobCard}>
                {r.my_amount == null && !r.my_walkthrough && (
                  <div style={{ display:"inline-flex", alignItems:"center", gap:".3rem", padding:".22rem .55rem", borderRadius:"99px", background:"rgba(var(--ff-accent-rgb), .16)", color:"var(--ff-c10)", fontSize:".68rem", fontWeight:800, letterSpacing:".04em", textTransform:"uppercase" as const, marginBottom:".6rem", marginRight:".4rem" }}>
                    <Ic name="star" size={11} />New
                  </div>
                )}
                {r.is_preferred && (
                  <div style={{ display:"inline-flex", alignItems:"center", gap:".35rem", padding:".25rem .6rem", borderRadius:"99px", background:"rgba(var(--ff-accent-rgb), .16)", color:"var(--ff-c10)", fontSize:".72rem", fontWeight:700, marginBottom:".6rem" }}>
                    <Ic name="star" size={12} />This client requested you — reserved for 48h
                  </div>
                )}
                {r.is_recurring && (
                  <div style={{ display:"flex", gap:".5rem", alignItems:"flex-start", padding:".6rem .7rem", borderRadius:"10px", background:"rgba(var(--ff-accent-rgb), .10)", border:"1px solid rgba(var(--ff-accent-rgb), .28)", marginBottom:".6rem" }}>
                    <Ic name="repeat" size={15} color="var(--ff-c10)" style={{ marginTop:1, flexShrink:0 }} />
                    <div style={{ fontSize:".78rem", color:"var(--ff-text)", lineHeight:1.5 }}>
                      <strong>Recurring{r.recurring_frequency ? " · " + freqLabel(r.recurring_frequency) : ""}.</strong> Winning this makes you the client's go-to pro — you'll be expected to return at the agreed times each visit.
                    </div>
                  </div>
                )}
                {/* space-between with no gap, no wrap and no minWidth:0 on the
                    left child: on a phone the service name and the preferred
                    schedule fought for one row, and because a flex child can't
                    shrink below its content the schedule text pushed the whole
                    header wider than the card. Wrap + minWidth:0 lets the
                    schedule drop to its own line instead. */}
                <div style={{ display:"flex", flexWrap:"wrap" as const, gap:".4rem .75rem", justifyContent:"space-between", alignItems:"baseline", marginBottom:".5rem" }}>
                  <div style={{ minWidth:0, flex:"1 1 auto" }}>
                    <div style={{ fontSize:"1rem", fontWeight:500 }}>{r.service_needed}</div>
                    {rangeText(priceFor(r.service_needed)) && <div style={{ fontSize:".72rem", color:"rgba(var(--ff-muted), .5)", marginTop:"2px" }}>Typical {rangeText(priceFor(r.service_needed))}</div>}
                  </div>
                  <div style={{ fontSize:".78rem", color:"var(--ff-c10)", flexShrink:0 }}><Ic name="timer" size={12} style={{ marginRight:4 }} />{r.preferred_schedule}</div>
                </div>
                <div style={{ fontSize:".82rem", color:"rgba(var(--ff-muted), .55)", marginBottom:".6rem" }}><Ic name="map-pin" size={13} style={{ marginRight:4 }} />{r.location}</div>

                {/* Money on this job vs the category average. The A+/A/A- grade says
                    how this job's money compares to what the category usually
                    pays, so a good-paying job is obvious without doing math.

                    THE TWO NUMBERS MEAN DIFFERENT THINGS (2026-08-28). Since the
                    budget rework the client no longer types a minimum — they pick
                    a maximum only, and `budget_min` holds OUR platform starting
                    price for the selected services (`floorFor` →
                    `service_pricing.base_price`). So this can't render as one
                    "Client budget $X–$Y" range any more: half of that range is a
                    number we set and half is a number they chose, and telling a
                    pro the client stated a floor they never stated is the kind of
                    quiet misinformation that gets priced into a bid.

                    Requests created before that change do hold a client-typed
                    minimum in the same column and will read as "Base price" here.
                    That's the deliberate trade: the wrong-but-harmless direction
                    is calling an old client floor a base price, not inventing a
                    client floor that doesn't exist. */}
                {(() => {
                  // Server values come from list_open_jobs(); fall back to the
                  // client-side price book if this build is ahead of the RPC.
                  const local = benchmarkFor(r.service_needed, pricing);
                  const bench = r.benchmark != null ? Number(r.benchmark) : (local?.benchmark ?? null);
                  const bLo = r.budget_min != null ? Number(r.budget_min) : null;
                  const bHi = r.budget_max != null ? Number(r.budget_max) : null;
                  const grade = (r.budget_grade ?? null) as Grade | null;
                  // A max the client actually chose is the only thing that counts
                  // as "they told us a budget" — the base price is ours and is
                  // present on essentially every new request. As of 2026-09-11 no
                  // NEW request can carry one; this stays for the legacy rows that do.
                  const hasBudget = !r.budget_flexible && bHi != null;
                  /**
                   * THE TARGET BID — 25% under the category average, and the only
                   * price signal on a request posted after 2026-09-11.
                   *
                   * It is a SUGGESTION, never a cap. Nothing validates against it,
                   * nothing hides or flags a higher bid, and the base-price and
                   * typical-range hints in the bid form below are untouched.
                   * `targetBid` returns null rather than landing beneath the
                   * platform base price, and nothing is shown in that case —
                   * suggesting a number under the cheapest honest version of the
                   * job would be telling a pro to bid at a loss on our authority.
                   */
                  const target = targetBid(bench, bLo);
                  if (!hasBudget && bLo == null && !r.budget_flexible && bench == null) return null;
                  // Lit when there is actually something to aim at.
                  const lit = hasBudget || target != null;

                  return (
                    <div style={{
                      display:"flex", flexWrap:"wrap" as const, alignItems:"center", gap:".5rem",
                      padding:".55rem .7rem", marginBottom:".6rem", borderRadius:"10px",
                      background: lit ? "rgba(var(--ff-accent-rgb), .08)" : "rgba(var(--ff-fg), .04)",
                      border: lit ? "1px solid rgba(var(--ff-accent-rgb), .24)" : "1px solid rgba(var(--ff-fg), .08)",
                    }}>
                      <Ic name="dollar" size={14} color="var(--ff-c10)" style={{ flexShrink:0 }} />
                      {(bLo != null || hasBudget) ? (
                        <span style={{ fontSize:".85rem", color:"var(--ff-text)" }}>
                          {bLo != null && (<>
                            <span style={{ color:"rgba(var(--ff-muted), .6)" }}>Base price </span>
                            <strong>{money(bLo)}</strong>
                          </>)}
                          {bLo != null && (hasBudget || r.budget_flexible) && <span style={{ color:"rgba(var(--ff-muted), .4)" }}>{" · "}</span>}
                          {hasBudget ? (<>
                            <span style={{ color:"rgba(var(--ff-muted), .6)" }}>Client max </span>
                            <strong>{money(bHi)}</strong>
                          </>) : r.budget_flexible ? (
                            <span style={{ color:"rgba(var(--ff-muted), .65)" }}>client is flexible</span>
                          ) : null}
                        </span>
                      ) : (
                        <span style={{ fontSize:".85rem", color:"rgba(var(--ff-muted), .65)" }}>
                          {r.budget_flexible ? "Client is flexible — send your quote" : "No budget set"}
                        </span>
                      )}
                      {/* The grade is computed from the client's own min–max, and
                          with the max field gone `budget_mid` collapses to our own
                          base price — so an ungated chip would stamp EVERY new
                          request "Below market" to every pro who read it, on the
                          strength of a number the client never chose. It is shown
                          only where a client-stated maximum actually exists. */}
                      {hasBudget && grade && <PriceGrade grade={grade} kind="budget" />}
                      {target != null && (
                        <span style={{ fontSize:".82rem", color:"var(--ff-text)", flexBasis:"100%" }}>
                          <span style={{ color:"rgba(var(--ff-muted), .6)" }}>Suggested bid </span>
                          <strong style={{ color:"var(--ff-c10)" }}>{money(target)}</strong>
                          <span style={{ color:"rgba(var(--ff-muted), .5)", display:"block", marginTop:"2px", fontSize:".74rem" }}>
                            {Math.round(TARGET_BID_DISCOUNT * 100)}% under the category average — a guide, not a limit. Bid what the job is worth to you.
                          </span>
                        </span>
                      )}
                      {bench != null && (
                        <span style={{ fontSize:".74rem", color:"rgba(var(--ff-muted), .5)", flexBasis:"100%" }}>
                          Category average {money(Math.round(bench))}
                          {r.benchmark_source === "jobs" ? " (from completed jobs)" : " (Calgary price guide)"}
                        </span>
                      )}
                    </div>
                  );
                })()}

                {/* Was a raw <div>, which collapsed the blank lines
                    `composedDescription()` puts between the client's sentence,
                    the answer summary and the "Details:" list — so all three ran
                    together as one unpunctuated wall. A long one also buried the
                    Bids block below the fold on a phone; it now clamps to 4
                    lines with a measured Read more. */}
                <JobDescription text={r.job_description} />
                <RequestPhotoQuote requestId={r.id} photoPath={r.photo_path} estimatedQuote={r.estimated_quote} quoteNotes={r.quote_notes} />
                <div style={{ margin:".75rem 0", padding:".75rem", borderRadius:"10px", background:"rgba(var(--ff-fg), .03)", border:"var(--ff-hair-w) solid rgba(var(--ff-fg), .08)" }}>
                  <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:".5rem" }}>
                    <span style={{ fontSize:".75rem", textTransform:"uppercase" as const, letterSpacing:".1em", color:"rgba(var(--ff-muted), .5)" }}>Bids</span>
                    <span style={{ fontSize:".78rem", fontWeight:600, color: (r.bid_count ?? 0) >= 7 ? "var(--ff-warn)" : "var(--ff-success)" }}>{r.bid_count ?? 0}/7</span>
                  </div>
                  {(() => {
                    const hasBid = r.my_amount != null || r.my_walkthrough;
                    const isOpen = bidOpen[r.id] ?? false;
                    if (hasBid && !isOpen) {
                      return (
                        <div style={{ display:"flex", alignItems:"flex-start", gap:".55rem", padding:".6rem .7rem", borderRadius:"10px", background:"rgba(var(--ff-success-rgb), .10)", border:"1px solid rgba(var(--ff-success-rgb), .3)" }}>
                          <Ic name="check-circle" size={16} color="var(--ff-success)" style={{ marginTop:1, flexShrink:0 }} />
                          <div style={{ flex:1, minWidth:0 }}>
                            <div style={{ fontSize:".85rem", fontWeight:600, color:"var(--ff-text)" }}>Your bid has been placed</div>
                            <div style={{ fontSize:".78rem", color:"rgba(var(--ff-muted), .7)", marginTop:"1px" }}>Waiting on client confirmation · {r.my_walkthrough
                              ? (r.my_price_low != null && r.my_price_high != null ? ("Walkthrough first · $" + r.my_price_low + "–$" + r.my_price_high) : "Walkthrough-first offer")
                              : ("$" + r.my_amount)}</div>
                          </div>
                          <button onClick={() => setBidOpen(pp => ({ ...pp, [r.id]: true }))} style={{ background:"none", border:"var(--ff-hair-w) solid rgba(var(--ff-fg), .18)", borderRadius:"8px", color:"var(--ff-text)", fontFamily:"inherit", fontSize:".78rem", fontWeight:600, cursor:"pointer", padding:".35rem .7rem", flexShrink:0 }}>Edit bid</button>
                        </div>
                      );
                    }
                    return null;
                  })()}
                  {/* A client can open a private thread with any pro who bid. The pro
                      can only reply, so this button only appears once they've written.
                      This is now a SHORTCUT, not the only route — the same thread also
                      sits in Messages, which is where anyone actually looks for a
                      message and where it survives this card disappearing. */}
                  {bid.byRequest[r.id] && (
                    <button
                      onClick={() => setBidChat({ requestId: r.id, name: bid.byRequest[r.id].other_name ?? "Client", title: r.service_needed })}
                      style={{ ...s.btn, width:"100%", justifyContent:"center", marginTop:".5rem", position:"relative" as const,
                        background: Number(bid.byRequest[r.id].unread ?? 0) > 0 ? "rgba(var(--ff-accent-rgb), .12)" : undefined,
                        border: Number(bid.byRequest[r.id].unread ?? 0) > 0 ? "1px solid rgba(var(--ff-accent-rgb), .45)" : undefined }}
                    >
                      <Ic name="message-square" size={13} style={{ marginRight:5 }} />
                      {Number(bid.byRequest[r.id].unread ?? 0) > 0
                        ? "The client messaged you — reply (" + bid.byRequest[r.id].unread + " new)"
                        : "Message the client"}
                    </button>
                  )}
                  {(() => {
                    const hasBid = r.my_amount != null || r.my_walkthrough;
                    const full = (r.bid_count ?? 0) >= 7;
                    const isOpen = bidOpen[r.id] ?? false;
                    if (hasBid && !isOpen) return null;
                    if (!hasBid && !isOpen && full) {
                      return <div style={{ fontSize:".82rem", color:"var(--ff-warn)" }}>This job already has 7 bids.</div>;
                    }
                    if (!hasBid && !isOpen) {
                      return (
                        <button onClick={() => setBidOpen(pp => ({ ...pp, [r.id]: true }))} style={{ ...s.btn, background:"var(--ff-c10)", color:"#fff", border:"none", width:"100%", justifyContent:"center" }}>Place a bid</button>
                      );
                    }
                    const wtOn = bidForm[r.id]?.walkthrough ?? !!r.my_walkthrough;
                    return (
                    <div style={{ display:"flex", gap:".5rem", flexWrap:"wrap" as const, alignItems:"center" }}>
                      <label style={{ flexBasis:"100%", display:"flex", alignItems:"flex-start", gap:".5rem", cursor:"pointer", padding:".45rem .55rem", borderRadius:"8px", background: wtOn ? "rgba(var(--ff-accent-rgb), .08)" : "transparent", border: wtOn ? "1px solid rgba(var(--ff-accent-rgb), .3)" : "1px solid transparent" }}>
                        <input type="checkbox" checked={wtOn} onChange={e => setBid(r.id, { walkthrough: e.target.checked })} style={{ marginTop:"2px", cursor:"pointer", accentColor:"var(--ff-c10)" }} />
                        <span style={{ fontSize:".8rem", lineHeight:1.45, color:"var(--ff-text)" }}>
                          <strong>I'd like to see the space first.</strong> Bid with a ballpark range instead of a firm price — if the client picks you, you'll book a free walkthrough, then send your exact estimate. Great for bigger or hard-to-price jobs. A range is still required: it's the only number the client can compare you on.
                        </span>
                      </label>
                      {wtOn ? (
                        <>
                          {/* flex-basis, not a fixed 170px each: two 170px inputs
                              exceed the ~276px content column on a phone. */}
                          <input type="number" min="0" placeholder="Ballpark low $" value={bidForm[r.id]?.price_low ?? (r.my_price_low != null ? String(r.my_price_low) : "")} onChange={e => setBid(r.id, { price_low: e.target.value })} style={{ flex:"1 1 130px", minWidth:0, maxWidth:"170px", padding:".5rem .6rem", background:"rgba(var(--ff-fg), .06)", border:"var(--ff-hair-w) solid rgba(var(--ff-fg), .12)", borderRadius:"8px", color:"var(--ff-text)", fontFamily:"inherit", fontSize:".85rem" }} />
                          <input type="number" min="0" placeholder="Ballpark high $" value={bidForm[r.id]?.price_high ?? (r.my_price_high != null ? String(r.my_price_high) : "")} onChange={e => setBid(r.id, { price_high: e.target.value })} style={{ flex:"1 1 130px", minWidth:0, maxWidth:"170px", padding:".5rem .6rem", background:"rgba(var(--ff-fg), .06)", border:"var(--ff-hair-w) solid rgba(var(--ff-fg), .12)", borderRadius:"8px", color:"var(--ff-text)", fontFamily:"inherit", fontSize:".85rem" }} />
                        </>
                      ) : (
                        // Was a flat width:100px. At the 16px minimum every
                        // touch field now carries (see main.tsx), "Price $"
                        // no longer fits in 100px and the caret sat on top of
                        // the placeholder. Matched to the walkthrough pair.
                        <input type="number" min="0" placeholder="Price $" value={bidForm[r.id]?.amount ?? (r.my_amount != null ? String(r.my_amount) : "")} onChange={e => setBid(r.id, { amount: e.target.value, message: bidForm[r.id]?.message ?? (r.my_message ?? ""), used_base_price:false })} style={{ flex:"1 1 130px", minWidth:0, maxWidth:"170px", padding:".5rem .6rem", background:"rgba(var(--ff-fg), .06)", border:"var(--ff-hair-w) solid rgba(var(--ff-fg), .12)", borderRadius:"8px", color:"var(--ff-text)", fontFamily:"inherit", fontSize:".85rem" }} />
                      )}
                      <input placeholder="Short message (optional)" value={bidForm[r.id]?.message ?? (r.my_message ?? "")} onChange={e => setBid(r.id, { message: e.target.value, amount: bidForm[r.id]?.amount ?? (r.my_amount != null ? String(r.my_amount) : "") })} style={{ ...ffInp, flexBasis:"100%" }} />
                      {/* `target` is passed HERE and only here. The bench/floor
                          derivation is character-for-character the one used by
                          the budget box on this same card a few hundred lines
                          above, so the card and the form can never suggest two
                          different numbers. The propose and requote forms are
                          deliberately NOT given a target — both price a job
                          whose scope is already known, and often larger than
                          what was bid. */}
                      {!wtOn && <QuoteBreakdown v={bidForm[r.id] ?? {}} on={patch => setBid(r.id, patch)} calloutHint={contractor?.min_callout ?? null} price={priceFor(r.service_needed)}
                        target={targetBid(
                          r.benchmark != null ? Number(r.benchmark) : (benchmarkFor(r.service_needed, pricing)?.benchmark ?? null),
                          r.budget_min != null ? Number(r.budget_min) : null,
                        )} />}
                      <input placeholder="Assumptions (optional, e.g. price assumes parts are accessible)" value={bidForm[r.id]?.assumptions ?? ""} onChange={e => setBid(r.id, { assumptions: e.target.value })} style={{ ...ffInp, flexBasis:"100%" }} />
                      {/* Submit moved BELOW the breakdown and the assumptions
                          field, and made full-width. It used to sit directly
                          after the message input, so on a phone — where every
                          row wraps — the pro reached the orange button before
                          the two fields underneath it had been seen at all,
                          and bid without them. One primary action, last. */}
                      <button style={{ ...s.btn, background:"var(--ff-c10)", color:"#fff", border:"none", flexBasis:"100%", justifyContent:"center", fontWeight:600 }} disabled={busyBid === r.id} onClick={() => placeBid(r)}>{busyBid === r.id ? "…" : ((r.my_amount != null || r.my_walkthrough) ? "Update bid" : "Place bid")}</button>
                      <button type="button" onClick={() => setBidOpen(pp => ({ ...pp, [r.id]: false }))} style={{ background:"none", border:"none", color:"rgba(var(--ff-muted), .6)", fontFamily:"inherit", fontSize:".78rem", cursor:"pointer", padding:0, flexBasis:"100%", textAlign:"center" as const }}>Cancel</button>
                    </div>
                    );
                  })()}
                </div>
                <button onClick={() => hideJob(r)} disabled={hiding === r.id} style={{ background:"none", border:"none", color:"rgba(var(--ff-muted), .5)", fontFamily:"inherit", fontSize:".78rem", cursor:"pointer", padding:0, marginTop: "var(--ff-s1)" }}>
                  {hiding === r.id ? "Hiding…" : "Not a fit — hide this job"}
                </button>
              </div>
            ))}
            </>
            )}
          </div>
          );
        })()
  );
}
