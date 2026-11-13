// Extracted from src/pages/AdminDashboard.tsx on 2026-11-12 (mechanical move, no behaviour change).
// Props are exactly the parent-component values this tab reads.
import { DashCard, Pill, Button } from "@/components/ui";
import { Sk } from "@/components/Skeleton";

export default function AdminAgentsTab(props: {
  agentOverview: any;
  agentActions: any[];
  agentFilter: "pending" | "all";
  actionsFailed: boolean;
  loadAll: () => Promise<void>;
  setAgentFilter: import("react").Dispatch<import("react").SetStateAction<"pending" | "all">>;
  actionEdit: Record<string, string>;
  s: { title: { fontSize: string; fontWeight: number; color: string; marginBottom: string; }; meta: { fontSize: string; color: string; marginBottom: string; }; };
  busyDraft: string | null;
  draftLead: (a: any) => Promise<void>;
  draftErr: Record<string, string>;
  copyText: (key: string, text: string) => Promise<void>;
  copiedKey: string;
  setActionEdit: import("react").Dispatch<import("react").SetStateAction<Record<string, string>>>;
  busyReview: string | null;
  reviewAction: (a: any, approve: boolean, confirmed?: boolean) => Promise<void>;
  agentsFailed: boolean;
}) {
  const { agentOverview, agentActions, agentFilter, actionsFailed, loadAll, setAgentFilter, actionEdit, s, busyDraft, draftLead, draftErr, copyText, copiedKey, setActionEdit, busyReview, reviewAction, agentsFailed } = props;
  return (
    (() => {
          const ov      = agentOverview && typeof agentOverview === "object" ? agentOverview : null;
          const roster  = Array.isArray(ov?.agents) ? ov.agents : [];
          const pending = agentActions.filter((a:any) => a.status === "pending");
          const rows    = agentFilter === "pending" ? pending : agentActions;
          return (
            <div>
              <p style={{ color:"rgba(var(--ff-muted), .5)", fontSize:".82rem", marginBottom:"1rem", lineHeight:1.5 }}>
                Background workers write drafts here and stop. Nothing an agent produces reaches a client,
                a contractor, a social account or the live site until you approve it below.
              </p>

              {/* ---------- the queue ---------- */}
              {actionsFailed && (
                <p style={{ color:"var(--ff-warn)", fontSize:".9rem" }}>
                  Couldn&rsquo;t load the proposal queue, so this list may be incomplete.{" "}
                  <Button onClick={() => loadAll()}>Retry</Button>
                </p>
              )}
              {!actionsFailed && (
                <>
                  {/* Same refusal as the Accounts role chips: these two carry the
                      shared `.ffd-tab` LOOK but not <DashTabs>, because they
                      filter one list rather than switch sections — `role="tab"`
                      plus `aria-selected` would tell a screen reader the page
                      changed. `aria-pressed` says what actually happened. The
                      `.4rem .9rem` padding override is gone with them: it put
                      the chips under the 48px thumb floor the class clears. */}
                  <div className="ffd-tabs" style={{ marginBottom: "var(--ff-s4)" }}>
                    {(["pending","all"] as const).map(f => (
                      <button key={f} type="button" onClick={() => setAgentFilter(f)}
                        aria-pressed={agentFilter === f}
                        className={agentFilter === f ? "ffd-tab ffd-on" : "ffd-tab"}>
                        {f === "pending" ? `Waiting on you (${pending.length})` : `Everything (${agentActions.length})`}
                      </button>
                    ))}
                    {Number(ov?.expiring_soon ?? 0) > 0 && (
                      <span style={{ fontSize:".78rem", color:"var(--ff-warn)" }}>
                        {ov.expiring_soon} expire{Number(ov.expiring_soon) === 1 ? "s" : ""} within 48h
                      </span>
                    )}
                  </div>
                  {rows.length === 0 && (
                    <p style={{ color:"rgba(var(--ff-muted), .45)", fontSize:".9rem", lineHeight:1.6 }}>
                      {agentFilter === "pending"
                        ? "Nothing is waiting on you. Check the roster below — an empty queue can also mean nothing is running."
                        : "No agent has proposed anything yet."}
                    </p>
                  )}
                  {rows.map((a:any) => {
                    const edited  = typeof actionEdit[a.id] === "string";
                    const draft   = edited ? actionEdit[a.id] : JSON.stringify(a.payload ?? {}, null, 2);
                    const isOpen  = a.status === "pending";
                    const expired = !!a.is_expired;
                    // Mirror of what agent_lead_draft_context will accept. Kept
                    // deliberately no wider than the server's own test, so the
                    // button is absent rather than refused.
                    const d = a.payload?.draft || null;
                    const canDraft = a.agent === "lead-response"
                      && ["pending","approved","sent"].includes(String(a.status))
                      && !!a.payload?.client;
                    return (
                      /* A <DashCard>, not a <Row>: every proposal carries an
                         editable textarea of its own payload, optionally a
                         transcript and a generated draft. */
                      <DashCard key={a.id} style={{ borderColor: isOpen && !expired ? "rgba(var(--ff-accent-rgb), .3)" : "rgba(var(--ff-fg), .08)" }}>
                        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"baseline", flexWrap:"wrap" as const, gap:".5rem" }}>
                          <div style={s.title}>
                            {String(a.kind || "action").replace(/_/g, " ")}
                            <span style={{ fontSize:".76rem", color:"rgba(var(--ff-muted), .5)", marginLeft:".5rem", textTransform:"none" as const, letterSpacing:0 }}>
                              {a.agent_label || a.agent}
                            </span>
                          </div>
                          <div style={{ fontSize:".76rem", color:"rgba(var(--ff-muted), .45)" }}>{a.created_local || ""}</div>
                        </div>

                        <div style={s.meta}>
                          Status: {String(a.status)}
                          {a.approved_local ? ` · decided ${a.approved_local}` : ""}
                          {/* Expiry is said in words rather than implied by a greyed button. A
                              control that can never succeed is worse than no control. */}
                          {isOpen && expired && <span style={{ color:"var(--ff-warn)" }}> · expired {a.expires_local || ""} — reject it and the agent will raise a fresh one</span>}
                          {isOpen && !expired && a.expires_local ? ` · expires ${a.expires_local}` : ""}
                        </div>

                        {/* Social proposals carry the conversation they came from. Without it
                            the owner is approving a reply with no idea what it replies to. */}
                        {a.channel && (
                          <div style={{ ...s.meta, color:"rgba(var(--ff-muted), .5)" }}>
                            {String(a.channel)}{a.display_name ? ` · ${a.display_name}` : ""}
                            {a.intent ? ` · ${a.intent}` : ""}{a.turn_count ? ` · ${a.turn_count} turns` : ""}
                          </div>
                        )}
                        {Array.isArray(a.transcript) && a.transcript.length > 0 && (
                          <div style={{ marginTop:".5rem", padding:".55rem .75rem", background:"rgba(var(--ff-fg), .03)", border:"var(--ff-hair-w) solid rgba(var(--ff-fg), .06)", borderRadius:"8px", fontSize:".8rem", color:"rgba(var(--ff-muted), .8)", lineHeight:1.6, maxHeight:"11rem", overflowY:"auto" as const }}>
                            {a.transcript.map((m:any, i:number) => (
                              <div key={i} style={{ marginBottom:".3rem" }}>
                                <strong style={{ color:"rgba(var(--ff-muted), .55)" }}>{m.d === "out" ? "us" : "them"}:</strong> {String(m.b ?? "")}
                              </div>
                            ))}
                          </div>
                        )}

                        {/* The owner is non-technical, so raw JSON is not a readable
                            proposal. Any agent that writes a `summary` into its payload
                            gets rendered in prose here, and the JSON below becomes the
                            detail you only open if you want to edit. An agent with no
                            summary still shows its JSON — this adds a surface, it does
                            not replace one. */}
                        {a.payload?.summary && (
                          <div style={{ marginTop: "var(--ff-s3)", padding:".65rem .8rem", background:"rgba(var(--ff-fg), .04)", border:"var(--ff-hair-w) solid rgba(var(--ff-fg), .08)", borderRadius:"8px" }}>
                            <div style={{ fontSize:".92rem", color:"var(--ff-text)", lineHeight:1.5 }}>
                              {String(a.payload.summary)}
                            </div>
                            {a.payload.detail && (
                              <div style={{ fontSize:".82rem", color:"rgba(var(--ff-muted), .7)", lineHeight:1.6, marginTop:".4rem" }}>
                                {String(a.payload.detail)}
                              </div>
                            )}
                            {(a.payload.client || a.payload.email || a.payload.phone) && (
                              <div style={{ fontSize:".82rem", color:"rgba(var(--ff-muted), .7)", lineHeight:1.6, marginTop:".4rem" }}>
                                {[a.payload.client, a.payload.email, a.payload.phone].filter(Boolean).map(String).join(" · ")}
                              </div>
                            )}
                            {a.payload.link && String(a.payload.link).startsWith("http") && (
                              <a href={String(a.payload.link)} target="_blank" rel="noreferrer"
                                 style={{ display:"inline-block", marginTop:".5rem", fontSize:".82rem", color:"var(--ff-c10)", fontWeight:600 }}>
                                {String(a.payload.action || "Open")} →
                              </a>
                            )}
                            {a.payload.link && !String(a.payload.link).startsWith("http") && a.payload.action && (
                              <div style={{ fontSize:".82rem", color:"rgba(var(--ff-muted), .55)", marginTop:".4rem" }}>
                                {String(a.payload.action)}
                              </div>
                            )}
                          </div>
                        )}

                        {/* ---------- draft on approval ----------
                            Detection is free: `agent_lead_response_run()` is a DB function
                            with no network client, so it cannot spend a token. Writing the
                            message is the only part that needs a model, so it hangs off a
                            button — one Haiku call per lead the owner actually decides to
                            chase, nothing on a quiet day.

                            The button is shown only where the server will accept it
                            (lead-response, a non-terminal status, a client name on the
                            payload), because a control that can never succeed is worse
                            than no control. */}
                        {canDraft && (
                          <div style={{ marginTop: "var(--ff-s3)" }}>
                            {/* ⚠️ Deliberately NOT `primary`, though the old button
                                painted itself orange when no draft existed. The
                                Approve button below is the terminal decision on
                                this card and it now owns the card's one orange;
                                drafting is a tool you reach for on the way
                                there, and it keeps the explanatory note beside
                                it instead of the colour. */}
                            <Button
                              disabled={busyDraft === a.id}
                              onClick={() => draftLead(a)}>
                              {busyDraft === a.id ? "Writing…" : d ? "Rewrite the message" : "Draft a message"}
                            </Button>
                            {!d && busyDraft !== a.id && (
                              <span style={{ fontSize:".76rem", color:"rgba(var(--ff-muted), .45)", marginLeft:".55rem" }}>
                                writes you a text and an email you can edit before sending
                              </span>
                            )}
                            {draftErr[a.id] && (
                              <div style={{ marginTop:".5rem", fontSize:".82rem", color:"var(--ff-warn)", lineHeight:1.5 }}>
                                {draftErr[a.id]}
                              </div>
                            )}
                            {d && (
                              <div style={{ marginTop:".65rem", display:"grid", gap:".6rem" }}>
                                {d.text && (
                                  <div style={{ padding:".6rem .75rem", background:"rgba(var(--ff-fg), .04)", border:"var(--ff-hair-w) solid rgba(var(--ff-fg), .08)", borderRadius:"8px" }}>
                                    <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", gap:".5rem", marginBottom:".35rem" }}>
                                      <span style={{ fontSize:".74rem", letterSpacing:".04em", color:"rgba(var(--ff-muted), .5)", fontFamily:"'Bebas Neue',sans-serif" }}>TEXT MESSAGE</span>
                                      {/* The `.25rem .6rem` / `.74rem` shrink is NOT
                                          carried over — it put a real control at
                                          roughly 26px tall, well under the 48px
                                          floor, on the one surface the owner uses
                                          from a phone. */}
                                      <Button variant="ghost"
                                        onClick={() => copyText(a.id + ":text", String(d.text))}>
                                        {copiedKey === a.id + ":text" ? "Copied" : "Copy"}
                                      </Button>
                                    </div>
                                    <div style={{ fontSize:".88rem", color:"var(--ff-text)", lineHeight:1.55, whiteSpace:"pre-wrap" as const }}>{String(d.text)}</div>
                                  </div>
                                )}
                                {d.email_body && (
                                  <div style={{ padding:".6rem .75rem", background:"rgba(var(--ff-fg), .04)", border:"var(--ff-hair-w) solid rgba(var(--ff-fg), .08)", borderRadius:"8px" }}>
                                    <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", gap:".5rem", marginBottom:".35rem" }}>
                                      <span style={{ fontSize:".74rem", letterSpacing:".04em", color:"rgba(var(--ff-muted), .5)", fontFamily:"'Bebas Neue',sans-serif" }}>EMAIL</span>
                                      <Button variant="ghost"
                                        onClick={() => copyText(a.id + ":email", (d.email_subject ? "Subject: " + d.email_subject + "\n\n" : "") + String(d.email_body))}>
                                        {copiedKey === a.id + ":email" ? "Copied" : "Copy"}
                                      </Button>
                                    </div>
                                    {d.email_subject && (
                                      <div style={{ fontSize:".84rem", color:"rgba(var(--ff-muted), .8)", marginBottom:".3rem" }}>
                                        <strong>Subject:</strong> {String(d.email_subject)}
                                      </div>
                                    )}
                                    <div style={{ fontSize:".88rem", color:"var(--ff-text)", lineHeight:1.55, whiteSpace:"pre-wrap" as const }}>{String(d.email_body)}</div>
                                  </div>
                                )}
                                <div style={{ fontSize:".76rem", color:"rgba(var(--ff-muted), .45)", lineHeight:1.5 }}>
                                  Nothing was sent. Copy it, change anything you like, and send it yourself from your own phone or inbox.
                                </div>
                              </div>
                            )}
                          </div>
                        )}

                        <label style={{ display:"block", fontSize:".76rem", color:"rgba(var(--ff-muted), .5)", marginTop:".75rem", marginBottom:".3rem" }}>
                          {a.payload?.summary ? "The full detail" : "What the agent wants to do"}{edited ? " (edited)" : ""}
                        </label>
                        <textarea
                          value={draft}
                          readOnly={!isOpen}
                          onChange={(e) => setActionEdit(prev => ({ ...prev, [a.id]: e.target.value }))}
                          spellCheck={false}
                          style={{ width:"100%", minHeight:"7rem", padding:".55rem .7rem", background:"rgba(var(--ff-fg), .06)", border:"var(--ff-hair-w) solid rgba(var(--ff-fg), .12)", borderRadius:"8px", color:"var(--ff-text)", boxSizing:"border-box" as const, fontFamily:"ui-monospace, SFMono-Regular, Menlo, monospace", fontSize:".82rem", lineHeight:1.5, resize:"vertical" as const, opacity: isOpen ? 1 : .7 }}
                        />

                        {isOpen && (
                          <div style={{ marginTop:".75rem", display:"flex", gap:".5rem", flexWrap:"wrap" as const }}>
                            {/* Expired proposals lose the button entirely rather than
                                keeping one the server now refuses — `admin_review_agent_action`
                                checks expires_at as of 2026-11-05, which is the day the
                                warning line above stopped being a lie. Reject still works:
                                clearing the inbox must always be possible.

                                "Mark handled" vs "Approve" is not cosmetic. `needs_harness`
                                is false for the kinds no bot will ever act on — a handoff to
                                the owner — and for those the RPC writes `sent`, not
                                `approved`. One predicate decides the label and the status, so
                                the button cannot promise something the DB won't do. */}
                            {!expired && (
                              <Button
                                variant="primary"
                                disabled={busyReview === a.id}
                                onClick={() => reviewAction(a, true)}>
                                {busyReview === a.id ? "…"
                                  : a.needs_harness === false ? (edited ? "Mark handled (edited)" : "Mark handled")
                                  : edited ? "Approve edited" : "Approve"}
                              </Button>
                            )}
                            <Button
                              disabled={busyReview === a.id}
                              onClick={() => reviewAction(a, false)}>
                              Reject
                            </Button>
                            {edited && (
                              <Button variant="ghost" disabled={busyReview === a.id}
                                onClick={() => setActionEdit(prev => { const n = { ...prev }; delete n[a.id]; return n; })}>
                                Reset
                              </Button>
                            )}
                          </div>
                        )}

                        {/* The harness writes back here. An approved action with an empty
                            result and no claim is the shape of "approved, then nothing
                            picked it up" — which is the failure this surface exists to
                            make visible, so it is never hidden behind a chevron. */}
                        {a.result && Object.keys(a.result).length > 0 && (
                          <div style={{ marginTop:".6rem", fontSize:".78rem", color:"rgba(var(--ff-muted), .6)", wordBreak:"break-word" as const }}>
                            Result: {JSON.stringify(a.result)}
                          </div>
                        )}
                      </DashCard>
                    );
                  })}
                </>
              )}

              {/* ---------- the roster ---------- */}
              <div style={{ fontFamily:"'Bebas Neue',sans-serif", fontSize:"1.1rem", letterSpacing:".04em", marginTop:"2rem", marginBottom:".3rem" }}>
                The team
              </div>
              <p style={{ color:"rgba(var(--ff-muted), .5)", fontSize:".8rem", marginBottom: "var(--ff-s4)", lineHeight:1.5 }}>
                Every agent that is supposed to exist, whether or not it has ever run. An agent only shows as
                overdue once it is switched on and has missed its own schedule.
              </p>
              {agentsFailed && (
                <p style={{ color:"var(--ff-warn)", fontSize:".9rem" }}>
                  Couldn&rsquo;t load the roster, so this is not a clean bill of health.{" "}
                  <Button onClick={() => loadAll()}>Retry</Button>
                </p>
              )}
              {!agentsFailed && !ov && (
                <div aria-busy="true" style={{ display:"grid", gap:".75rem" }}>
                  <span className="ff-sr-only">Loading the agent roster</span>
                  <Sk h={54} r={10} /><Sk h={54} r={10} />
                </div>
              )}
              {!agentsFailed && ov && roster.length === 0 && (
                <p style={{ color:"var(--ff-warn)", fontSize:".9rem" }}>
                  No agents are registered at all. That is itself the problem — the roster is a declared list,
                  so an empty one means nothing was ever set up rather than nothing being wrong.
                </p>
              )}
              {!agentsFailed && roster.map((g:any) => (
                <DashCard key={g.agent} style={{ borderColor: g.stale ? "rgba(251,191,36,.3)" : g.last_run_status === "error" ? "rgba(var(--ff-danger-rgb), .3)" : "rgba(var(--ff-fg), .08)" }}>
                  <div style={{ display:"flex", justifyContent:"space-between", alignItems:"baseline", flexWrap:"wrap" as const, gap:".5rem" }}>
                    <div style={s.title}>{g.label || g.agent}</div>
                    <Pill tone={g.enabled ? "good" : "neutral"}>{g.enabled ? "on" : "not set up yet"}</Pill>
                  </div>
                  <div style={{ ...s.meta, color:"rgba(var(--ff-muted), .6)" }}>{g.purpose || ""}</div>
                  <div style={{ ...s.meta, color:"rgba(var(--ff-muted), .45)" }}>
                    {g.autonomy === "propose" ? "Asks you before anything happens"
                      : g.autonomy === "notify" ? "Tells you, doesn't act"
                      : "Acts on its own"}
                    {g.expected_every ? ` · expected every ${g.expected_every}` : " · no schedule"}
                    {Number(g.pending ?? 0) > 0 ? ` · ${g.pending} waiting on you` : ""}
                  </div>
                  <div style={{ ...s.meta, color:"rgba(var(--ff-muted), .45)" }}>
                    {g.last_run_local
                      ? `Last ran ${g.last_run_local} · ${g.last_run_status || "?"}${Number(g.runs_7d ?? 0) ? ` · ${g.runs_7d} runs in 7 days` : ""}${Number(g.errors_7d ?? 0) ? ` · ${g.errors_7d} failed` : ""}`
                      : "Has never run."}
                  </div>
                  {/* The declared cost budget, in plain English. It lives on the roster
                      rather than in a doc because a doc enforces nothing: max_pending
                      and max_proposals_per_run are checked inside
                      agent_propose_action, the only write path into this queue.
                      `model` is the CEILING an agent may reach for, not the only model
                      it may use — a sonnet agent still does its triage on haiku. */}
                  <div style={{ ...s.meta, color:"rgba(var(--ff-muted), .45)" }}>
                    {g.model === "none"
                      ? "Costs nothing to run — reads the database, never asks an AI."
                      : `Uses ${g.model === "haiku" ? "the cheap model" : g.model === "sonnet" ? "the mid model" : "the expensive model"} · up to ${g.max_model_calls_per_run} AI calls a run`}
                    {g.max_proposals_per_run ? ` · at most ${g.max_proposals_per_run} suggestions a run` : ""}
                    {g.max_pending ? `, ${g.max_pending} waiting at once` : ""}
                    {Number(g.model_calls_7d ?? 0) > 0 ? ` · ${g.model_calls_7d} AI calls in 7 days` : ""}
                  </div>
                  {/* Measured, and self-clearing: this can only appear because a run in
                      the last 7 days actually spent more than its declared budget.
                      Raise the budget or fix the agent and it goes away on its own. */}
                  {Number(g.budget_breach_7d ?? 0) > 0 && (
                    <div style={{ marginTop:".5rem", fontSize:".82rem", color:"var(--ff-warn)" }}>
                      Over budget — {g.budget_breach_7d} run{Number(g.budget_breach_7d) === 1 ? "" : "s"} in the
                      last 7 days used more AI calls than this agent is allowed. Either it needs fixing or the
                      allowance is too low.
                    </div>
                  )}
                  {/* A cap firing is not an error, so it must not be silent either: the
                      agent had more to say and was cut off, which is the owner's
                      decision to revisit, not the agent's. */}
                  {g.last_run_capped && (
                    <div style={{ marginTop:".5rem", fontSize:".82rem", color:"rgba(var(--ff-muted), .7)" }}>
                      Hit its limit on the last run ({g.last_run_capped === "max_pending"
                        ? "too many suggestions already waiting on you"
                        : "it reached the per-run suggestion limit"}) — it had more to suggest and stopped.
                    </div>
                  )}
                  {g.stale && (
                    <div style={{ marginTop:".5rem", fontSize:".82rem", color:"var(--ff-warn)" }}>
                      Overdue — this is switched on but hasn&rsquo;t run on schedule.
                    </div>
                  )}
                  {g.last_run_error && (
                    <div style={{ marginTop:".5rem", padding:".5rem .7rem", background:"rgba(var(--ff-danger-rgb), .07)", border:"1px solid rgba(var(--ff-danger-rgb), .2)", borderRadius:"8px", fontSize:".8rem", color:"rgba(var(--ff-muted), .85)", wordBreak:"break-word" as const }}>
                      {String(g.last_run_error)}
                    </div>
                  )}
                  {g.last_run_summary && !g.last_run_error && (
                    <div style={{ marginTop:".5rem", fontSize:".8rem", color:"rgba(var(--ff-muted), .6)" }}>{String(g.last_run_summary)}</div>
                  )}
                </DashCard>
              ))}
              {ov?.generated_at && (
                <p style={{ fontSize:".74rem", color:"rgba(var(--ff-muted), .35)", marginTop:".75rem" }}>Checked {ov.generated_at}</p>
              )}
            </div>
          );
        })()
  );
}
