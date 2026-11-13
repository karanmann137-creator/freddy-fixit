// Extracted from src/pages/ContractorDashboard.tsx on 2026-11-12 (mechanical move, no behaviour change).
// Props are exactly the parent-component values this tab reads.
import { DashCard, Group, Button, Sheet, Row, Pill } from "@/components/ui";
import { Ic } from "@/components/Ic";
import { ffInp, historyIcon, historyRowTone, historyTone } from "./shared";
import { respShort } from "@/lib/respTime";
import { needsFor, pendingText, disabledText } from "@/lib/stripeRequirements";

import type { JobExpense } from "@/components/JobExpenses";
export default function ContractorEarningsTab(props: {
  earn: any;
  s: { jobCard: { background: string; border: string; borderRadius: string; padding: string; marginBottom: string; cursor: string; }; btn: { minHeight: string; padding: string; background: string; border: string; borderRadius: string; color: string; fontFamily: string; fontSize: string; letterSpacing: string; cursor: string; }; primaryBtn: { minHeight: string; padding: string; background: string; color: string; border: string; borderRadius: string; boxShadow: string; fontFamily: string; fontSize: string; letterSpacing: string; cursor: string; }; earnCard: { background: string; border: string; borderRadius: string; padding: string; textAlign: "center"; }; chip: { padding: string; background: string; border: string; borderRadius: string; fontSize: string; color: string; display: string; margin: string; }; };
  setRewindOpen: import("react").Dispatch<import("react").SetStateAction<boolean>>;
  goalInput: string;
  setGoalInput: import("react").Dispatch<import("react").SetStateAction<string>>;
  savingGoal: boolean;
  saveGoal: () => Promise<void>;
  totalEarned: number;
  contractor: any;
  myJobs: any[];
  streak: number;
  respMins: number | null;
  expensesFailed: boolean;
  expenses: JobExpense[];
  awaitingTotal: any;
  awaitingJobs: any[];
  stripeNeeds: { requirements: string[]; pending: string[]; disabled_reason: string | null; };
  busyStripe: boolean;
  setupPayouts: () => Promise<void>;
  exportPayoutsCsv: () => void;
  netPayout: (job: any) => number | null;
}) {
  const { earn, s, setRewindOpen, goalInput, setGoalInput, savingGoal, saveGoal, totalEarned, contractor, myJobs, streak, respMins, expensesFailed, expenses, awaitingTotal, awaitingJobs, stripeNeeds, busyStripe, setupPayouts, exportPayoutsCsv, netPayout } = props;
  return (
    (
          <div>
            {earn && (() => {
              const week = Number(earn.this_week || 0);
              const goal = Number(earn.weekly_goal || 0);
              const pct = goal > 0 ? Math.min(100, Math.round((week / goal) * 100)) : 0;
              const trend = Array.isArray(earn.trend) ? earn.trend : [];
              const peak = Math.max(1, ...trend.map((t: any) => Number(t.amount || 0)));
              return (
                <DashCard style={{ marginBottom:"1.5rem", background:"linear-gradient(135deg, rgba(var(--ff-accent-rgb), .10), rgba(var(--ff-fg),.03))", borderColor:"rgba(var(--ff-accent-rgb), .3)" }}>
                  <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", gap:".75rem", flexWrap:"wrap" as const }}>
                    <div>
                      <div style={{ fontSize:".72rem", textTransform:"uppercase", letterSpacing:".1em", color:"rgba(var(--ff-muted), .5)" }}>This week</div>
                      <div style={{ fontFamily:"'Bebas Neue',sans-serif", fontSize:"clamp(2rem,8vw,2.6rem)", letterSpacing:".02em", color:"var(--ff-c10)", lineHeight:1.05 }}>${week.toFixed(0)}</div>
                      <div style={{ fontSize:".78rem", color:"rgba(var(--ff-muted), .6)" }}>{earn.jobs_this_week || 0} job{(earn.jobs_this_week===1)?"":"s"} paid out this week</div>
                    </div>
                    <button style={{ ...s.btn, display:"inline-flex", alignItems:"center", gap:".4rem", background:"rgba(var(--ff-accent-rgb), .9)", color:"#fff", border:"none" }} onClick={() => setRewindOpen(true)}>
                      <Ic name="star" size={13} />My Rewind
                    </button>
                  </div>

                  <div style={{ marginTop:"1.1rem" }}>
                    <div style={{ display:"flex", justifyContent:"space-between", fontSize:".74rem", color:"rgba(var(--ff-muted), .6)", marginBottom:".35rem" }}>
                      <span>Weekly goal</span>
                      <span>{goal > 0 ? `$${week.toFixed(0)} / $${goal.toFixed(0)} · ${pct}%` : "Set a goal to track your week"}</span>
                    </div>
                    {goal > 0 && (
                      <div style={{ height:"10px", borderRadius:"999px", background:"rgba(var(--ff-fg),.1)", overflow:"hidden" }}>
                        <div style={{ width:`${pct}%`, height:"100%", background: pct>=100 ? "var(--ff-success)" : "var(--ff-c10)", borderRadius:"999px", transition:"width .4s" }} />
                      </div>
                    )}
                    <div style={{ display:"flex", gap:".5rem", marginTop:".6rem", alignItems:"center" }}>
                      <input type="number" inputMode="numeric" placeholder="e.g. 1500" value={goalInput} onChange={e=>setGoalInput(e.target.value)} style={{ ...ffInp, maxWidth:"140px" }} />
                      <button style={{ ...s.btn }} disabled={savingGoal} onClick={saveGoal}>{savingGoal ? "Saving…" : (goal>0 ? "Update goal" : "Set goal")}</button>
                    </div>
                  </div>

                  {trend.length > 0 && (
                    <div style={{ marginTop:"1.3rem" }}>
                      <div style={{ fontSize:".72rem", textTransform:"uppercase", letterSpacing:".1em", color:"rgba(var(--ff-muted), .5)", marginBottom:".5rem" }}>Last 8 weeks</div>
                      <div style={{ display:"flex", alignItems:"flex-end", gap:".35rem", height:"70px" }}>
                        {trend.map((t: any, i: number) => {
                          const h = Math.round((Number(t.amount || 0) / peak) * 100);
                          const isNow = i === trend.length - 1;
                          return (
                            <div key={i} style={{ flex:1, display:"flex", flexDirection:"column", alignItems:"center", gap: "var(--ff-s1)" }} title={`${t.week}: $${Number(t.amount||0).toFixed(0)}`}>
                              <div style={{ width:"100%", height:`${Math.max(3,h)}%`, minHeight:"3px", background: isNow ? "var(--ff-c10)" : "rgba(var(--ff-accent-rgb), .4)", borderRadius:"4px 4px 0 0" }} />
                              <div style={{ fontSize:".58rem", color:"rgba(var(--ff-muted), .4)", whiteSpace:"nowrap" }}>{String(t.week).split(" ")[1]}</div>
                            </div>
                          );
                        })}
                      </div>
                      {(() => {
                        // Insight next to the chart — say what the numbers mean.
                        const nums = trend.map((t: any) => Number(t.amount || 0));
                        if (nums.length < 2) return null;
                        const cur = nums[nums.length - 1], prev = nums[nums.length - 2];
                        const best = Math.max(...nums);
                        if (best <= 0) return null;
                        let msg: string;
                        if (cur > 0 && cur >= best) msg = prev > 0 ? "Best week in 2 months — $" + cur.toFixed(0) + ", up " + Math.round(((cur - prev) / prev) * 100) + "% from last week." : "Best week in 2 months — $" + cur.toFixed(0) + ".";
                        else if (prev > 0 && cur > prev) msg = "Up " + Math.round(((cur - prev) / prev) * 100) + "% from last week — keep it rolling.";
                        else if (prev > 0 && cur < prev) msg = "$" + (prev - cur).toFixed(0) + " behind last week — one more job closes the gap.";
                        else msg = "Your best week was $" + best.toFixed(0) + " — that's the bar to beat.";
                        return (
                          <div style={{ marginTop:".65rem", display:"flex", alignItems:"center", gap:".4rem", fontSize:".8rem", color:"var(--ff-c10)", fontWeight:500 }}>
                            <Ic name="star" size={12} />{msg}
                          </div>
                        );
                      })()}
                    </div>
                  )}

                  <div style={{ display:"flex", gap:"1.5rem", marginTop:"1.3rem", flexWrap:"wrap" as const, fontSize:".82rem" }}>
                    <div><span style={{ color:"rgba(var(--ff-muted),.5)" }}>This month </span><strong style={{ color:"var(--ff-text)" }}>${Number(earn.this_month||0).toFixed(0)}</strong></div>
                    <div><span style={{ color:"rgba(var(--ff-muted),.5)" }}>Last month </span><strong style={{ color:"var(--ff-text)" }}>${Number(earn.last_month||0).toFixed(0)}</strong></div>
                    <div><span style={{ color:"rgba(var(--ff-muted),.5)" }}>This year </span><strong style={{ color:"var(--ff-text)" }}>${Number(earn.this_year||0).toFixed(0)}</strong></div>
                  </div>
                </DashCard>
              );
            })()}
            <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit,minmax(min(130px, 100%), 1fr))", gap:"1rem", marginBottom:"1.5rem" }}>
              {[["$" + totalEarned.toFixed(2), "Total Earned"], [contractor?.total_jobs ?? 0, "Jobs Completed"], [myJobs.filter(j=>j.status==="assigned"||j.status==="in_progress").length, "Active Jobs"], [contractor?.rating ? `⭐ ${contractor.rating}` : "—", "Avg Rating"], [streak > 0 ? "🔥 " + streak : "—", "Reliability Streak"], [respMins != null ? "⚡ " + respShort(respMins) : "—", "Response Time"]].map(([v,l]) => (
                <div key={String(l)} style={s.earnCard} title={l === "Reliability Streak" ? "Jobs in a row completed and confirmed with no claims — clients see pros they can count on." : l === "Response Time" ? "Your typical time from a job being posted to your bid (last 120 days). Clients see a 'usually responds in' badge on your bids — faster responses win more jobs." : undefined}>
                  <div style={{ fontFamily:"'Bebas Neue',sans-serif", fontSize:"clamp(1.4rem,5vw,1.7rem)", letterSpacing:".04em", lineHeight:1.1, color:"var(--ff-c10)", marginBottom: "var(--ff-s1)" }}>{v}</div>
                  <div style={{ fontSize:".72rem", textTransform:"uppercase", letterSpacing:".1em", color:"rgba(var(--ff-muted), .45)" }}>{l}</div>
                </div>
              ))}
            </div>
            {expensesFailed && (
              <div style={{ ...s.earnCard, marginBottom:"1.5rem", textAlign:"left" as const, borderColor:"rgba(var(--ff-danger-rgb), .3)" }}>
                <div style={{ fontSize:".85rem", color:"rgba(var(--ff-muted), .8)", lineHeight:1.5 }}>
                  We couldn't load your logged job costs just now, so your real-profit total isn't shown. Nothing has been lost — refresh the page to try again.
                </div>
              </div>
            )}
            {expenses.length > 0 && (() => {
              const totalCosts = expenses.reduce((sum, e) => sum + Number(e.amount || 0), 0);
              const profit = totalEarned - totalCosts;
              const margin = totalEarned > 0 ? Math.round((profit / totalEarned) * 100) : null;
              return (
                <div style={{ ...s.earnCard, marginBottom:"1.5rem", textAlign:"left" as const }}>
                  <div style={{ fontSize:".72rem", textTransform:"uppercase" as const, letterSpacing:".1em", color:"rgba(var(--ff-muted), .45)", marginBottom:".4rem" }}>Real profit (after your job costs)</div>
                  <div style={{ display:"flex", gap:"1.4rem", flexWrap:"wrap" as const, fontSize:".85rem", color:"rgba(var(--ff-muted), .7)" }}>
                    <div>Earned <strong style={{ color:"var(--ff-text)" }}>{"$" + totalEarned.toFixed(2)}</strong></div>
                    <div>Job costs <strong style={{ color:"var(--ff-text)" }}>{"−$" + totalCosts.toFixed(2)}</strong></div>
                    <div>Est. profit <strong style={{ color: profit >= 0 ? "var(--ff-success)" : "var(--ff-danger)" }}>{"$" + profit.toFixed(2)}</strong>{margin != null && <span style={{ color:"rgba(var(--ff-muted), .5)" }}> ({margin}% margin)</span>}</div>
                  </div>
                  <div style={{ fontSize:".7rem", color:"rgba(var(--ff-muted), .4)", marginTop:".4rem" }}>Based on the costs you've logged on your jobs — private to you.</div>
                </div>
              );
            })()}
            {awaitingTotal > 0 && (
              <DashCard style={{ marginBottom:"1.5rem", borderColor:"rgba(var(--ff-accent-rgb), .35)", background:"rgba(var(--ff-accent-rgb), .06)" }}>
                <div style={{ display:"flex", alignItems:"center", gap:".6rem" }}>
                  <Ic name="key" size={16} color="var(--ff-c10)" />
                  <div>
                    <div style={{ fontSize:"1rem", fontWeight:600, color:"var(--ff-text)" }}>${awaitingTotal.toFixed(2)} coming your way</div>
                    {/* A job is collected in two charges now — a deposit to book you and
                        the balance when the work is done — so this total isn't all held
                        yet on every job. Say so plainly rather than promising "held". */}
                    <div style={{ fontSize:".8rem", color:"rgba(var(--ff-muted), .65)", lineHeight:1.45, marginTop:".1rem" }}>Your 93% payout across {awaitingJobs.length} active job{awaitingJobs.length === 1 ? "" : "s"}, after the 7% platform fee. Clients pay a deposit up front to book you and the balance once the work is done — every payment is held safely and released to you after the client confirms (or automatically after 3 days).</div>
                  </div>
                </div>
              </DashCard>
            )}
            <Group label="PAYOUTS">
              <DashCard style={{ marginBottom:0 }}>
              {contractor?.stripe_payouts_enabled ? (
                <div style={{ display:"flex", alignItems:"center", gap:".6rem", color:"var(--ff-success)", fontSize:".9rem" }}>
                  <Ic name="check" size={16} color="var(--ff-success)" />
                  <span>Connected — you're set up to receive payouts.</span>
                </div>
              ) : (
                <div>
                  <p style={{ color:"rgba(var(--ff-muted), .7)", fontSize:".88rem", marginBottom: "var(--ff-s4)", lineHeight:1.5 }}>
                    {contractor?.stripe_account_id
                      ? "Your payout account needs a few more details before you can be paid. Finish setup with Stripe below."
                      : "Connect a bank account through Stripe to get paid for completed jobs. Funds for each job are released to you after the client confirms the work is done."}
                  </p>
                  {needsFor(stripeNeeds.requirements).length > 0 && (
                    <div style={{ margin:"0 0 .9rem", padding:".75rem .85rem", borderRadius:"10px", background:"rgba(var(--ff-accent-rgb), .08)", border:"1px solid rgba(var(--ff-accent-rgb), .18)" }}>
                      <div style={{ fontSize:".78rem", fontWeight:600, color:"var(--ff-c10)", marginBottom: "var(--ff-s2)" }}>Stripe still needs:</div>
                      <ul style={{ margin:0, padding:0, listStyle:"none", display:"flex", flexDirection:"column" as const, gap: "var(--ff-s2)" }}>
                        {needsFor(stripeNeeds.requirements).map((n, i) => (
                          <li key={i}>
                            <span style={{ display:"block", fontSize:".82rem", fontWeight:600, color:"var(--ff-text)" }}>{n.label}</span>
                            <span style={{ display:"block", fontSize:".78rem", color:"rgba(var(--ff-muted), .75)", lineHeight:1.45 }}>{n.detail}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                  {pendingText(stripeNeeds.pending) && (
                    <p style={{ color:"rgba(var(--ff-muted), .7)", fontSize:".82rem", marginBottom: "var(--ff-s4)", lineHeight:1.5 }}>{pendingText(stripeNeeds.pending)}</p>
                  )}
                  {disabledText(stripeNeeds.disabled_reason) && (
                    <p style={{ color:"rgba(var(--ff-muted), .7)", fontSize:".82rem", marginBottom: "var(--ff-s4)", lineHeight:1.5 }}>{disabledText(stripeNeeds.disabled_reason)}</p>
                  )}
                  <button style={{ ...s.btn, background:"var(--ff-c10)", color:"#fff", border:"none" }} disabled={busyStripe} onClick={setupPayouts}>
                    {busyStripe ? "Opening Stripe…" : (contractor?.stripe_account_id ? "Finish payout setup" : "Set up payouts")}
                  </button>
                </div>
              )}
            </DashCard>
            </Group>
            {/* JOB HISTORY — the caption moves OUT of the card.
                v1 put a 1.2rem orange Bebas title inside the card; a <Group>
                label sits above it at .78rem in muted ink, which is the same
                geometry every list on the client side now uses. The CSV button
                goes in Group's `action` slot rather than a bespoke flex header,
                so the caption row can't drift out of alignment with the others.

                ── Why the payout keeps its own ink ────────────────────────
                `netPayout` is the one number on this screen that is money the
                pro ALREADY HAS. It is passed as `amount`, which `<Row>` renders
                in the brighter `.ffu-amt` ink, and the estimate it was derived
                from drops into `sub` beside the date — v1 stacked three
                differently-sized lines in a right-aligned column, which read as
                three separate facts rather than one number with its provenance. */}
            <Group label="JOB HISTORY" action={myJobs.length > 0 ? (
              <Button variant="ghost" onClick={exportPayoutsCsv}>
                <Ic name="download" size={13} style={{ marginRight:".3rem" }} />CSV
              </Button>
            ) : undefined}>
              <Sheet>
                {myJobs.length === 0 ? (
                  <Row icon="clipboard-list" tone="neutral" title="NO JOBS YET" sub="Jobs you win show up here once they're underway." />
                ) : myJobs.map(job => {
                  const net = netPayout(job);
                  const detail = new Date(job.created_at).toLocaleDateString()
                    + (job.amount ? (net != null ? " · $" + job.amount + " estimate" : "") : " · price TBD");
                  return (
                    <Row
                      key={job.id}
                      icon={historyIcon(job.status)}
                      tone={historyRowTone(job.status)}
                      title={job.request?.service_needed ?? "Job"}
                      sub={detail}
                      amount={net != null ? "$" + net.toFixed(2) : (job.amount ? "$" + job.amount : undefined)}
                      right={<Pill tone={historyTone(job.status)}>{job.status.replace("_"," ")}</Pill>}
                    />
                  );
                })}
              </Sheet>
            </Group>
          </div>
        )
  );
}
