// Extracted from src/pages/AdminDashboard.tsx on 2026-11-12 (mechanical move, no behaviour change).
// Props are exactly the parent-component values this tab reads.
import { DashCard, Button } from "@/components/ui";
import { type PlatformMode, type PlatformNotice } from "@/lib/platformStatus";
import { Ic } from "@/components/Ic";

export default function AdminPlatformTab(props: {
  platFailed: boolean;
  loadAll: () => Promise<void>;
  platMode: PlatformMode;
  changeMode: (mode: PlatformMode, confirmed?: boolean) => Promise<void>;
  busyPlatform: boolean;
  s: { title: { fontSize: string; fontWeight: number; color: string; marginBottom: string; }; meta: { fontSize: string; color: string; marginBottom: string; }; };
  noticeDraft: PlatformNotice;
  setNoticeDraft: import("react").Dispatch<import("react").SetStateAction<PlatformNotice>>;
  saveNotice: () => Promise<void>;
  heldReqs: any[];
  setHeldSel: import("react").Dispatch<import("react").SetStateAction<Set<string>>>;
  heldSel: Set<string>;
  releaseHeld: (ids: string[], confirmed?: boolean) => Promise<void>;
  busyRelease: boolean;
  waitlistRows: any[];
}) {
  const { platFailed, loadAll, platMode, changeMode, busyPlatform, s, noticeDraft, setNoticeDraft, saveNotice, heldReqs, setHeldSel, heldSel, releaseHeld, busyRelease, waitlistRows } = props;
  return (
    <div>
            <h2 style={{ fontFamily:"'Bebas Neue',sans-serif", fontSize:"1.3rem", letterSpacing:".05em", marginBottom:".3rem" }}>Platform mode</h2>
            <p style={{ fontSize:".84rem", color:"rgba(var(--ff-muted), .6)", marginBottom:"1.25rem", maxWidth:"58ch" }}>
              This is the master switch for whether the site takes new client jobs.
              Contractors can always sign up and look around, whichever mode you pick.
            </p>

            {/* The one failure line on this page that is about safety rather
                than tidiness. platMode defaults to "open", so a failed
                platform_status read used to render "Open — currently on" — the
                dashboard telling the owner the site is taking jobs on the
                strength of a value it never received. The picker itself stays
                live: pressing a mode re-reads the mode from set_platform_mode's
                own response, so the control both works and repairs the display. */}
            {platFailed && (
              <p style={{ color:"var(--ff-warn)", fontSize:".9rem", marginBottom:"var(--ff-s5)" }}>
                Couldn&rsquo;t read the current site mode, so none is shown as on below — don&rsquo;t assume the site is open.
                {" "}<Button onClick={() => loadAll()}>Retry</Button>
              </p>
            )}

            {/* ── Mode picker ─────────────────────────────────────────────── */}
            {([
              { key:"open"     as PlatformMode, label:"Open",     tone:"var(--ff-success)",
                desc:"Normal. New client requests go straight out to matching contractors." },
              { key:"waitlist" as PlatformMode, label:"Waitlist", tone:"var(--ff-c10)",
                desc:"Clients can still describe their job and leave their details, but nothing is sent to contractors. You release the jobs by hand when you're ready." },
              { key:"paused"   as PlatformMode, label:"Paused",   tone:"var(--ff-warn)",
                desc:"New client requests stop completely. The overhaul notice shows across the site." },
            ]).map(m => {
              // `!platFailed` so an unread mode highlights nothing at all. An
              // unselected picker says "I don't know"; the default-coloured
              // "Open — currently on" said something false.
              const on = !platFailed && platMode === m.key;
              return (
                /* ⚠️ NOT a <DashCard>: this is a <button>, and DashCard renders a
                   div. It wears the card's LOOK by borrowing the class, which is
                   the documented way to get the sheet's values onto an element
                   the primitive cannot be. The accent ring on the selected mode
                   stays a SIGNAL, so its border is left at the class's own
                   width via a borderColor longhand rather than a shorthand. */
                <button
                  key={m.key}
                  onClick={() => changeMode(m.key)}
                  disabled={busyPlatform}
                  className="ffd-card"
                  style={{
                    display:"flex", alignItems:"flex-start", gap:".75rem", width:"100%",
                    textAlign:"left" as const, cursor: busyPlatform ? "default" : "pointer",
                    fontFamily:"inherit", color:"var(--ff-text)",
                    background: on ? "rgba(var(--ff-accent-rgb), .08)" : "rgba(var(--ff-fg), .04)",
                    borderColor: on ? "rgba(var(--ff-accent-rgb), .4)" : "rgba(var(--ff-fg), .08)",
                  }}
                >
                  <Ic name={on ? "radio-on" : "radio-off"} size={20} style={{ color: on ? m.tone : "rgba(var(--ff-muted), .4)", flexShrink:0, marginTop:2 }} />
                  <span style={{ minWidth:0 }}>
                    <span style={{ display:"block", fontSize:".95rem", fontWeight:600, color: on ? m.tone : "var(--ff-text)" }}>
                      {m.label}{on ? " — currently on" : ""}
                    </span>
                    <span style={{ display:"block", fontSize:".8rem", color:"rgba(var(--ff-muted), .6)", marginTop: "var(--ff-s1)" }}>{m.desc}</span>
                  </span>
                </button>
              );
            })}

            {/* ── Notice wording ──────────────────────────────────────────── */}
            <DashCard style={{ marginTop:"1.5rem" }}>
              <div style={{ ...s.title, marginBottom: "var(--ff-s1)" }}>What clients see while you're paused</div>
              <div style={{ fontSize:".78rem", color:"rgba(var(--ff-muted), .55)", marginBottom: "var(--ff-s4)" }}>
                Used on the site-wide banner and on the waitlist form. Editing this takes effect on the next page load — no deploy needed.
              </div>
              {([
                { key:"headline" as const, label:"Headline",    ph:"We're rebuilding Freddy Fix It" },
                { key:"cta"      as const, label:"Button text", ph:"Join the waitlist" },
              ]).map(f => (
                <label key={f.key} style={{ display:"block", marginBottom:".8rem" }}>
                  <span style={{ display:"block", fontSize:".76rem", color:"rgba(var(--ff-muted), .6)", marginBottom:".3rem" }}>{f.label}</span>
                  <input
                    value={noticeDraft[f.key]}
                    onChange={e => setNoticeDraft(d => ({ ...d, [f.key]: e.target.value }))}
                    placeholder={f.ph}
                    style={{ width:"100%", padding:".55rem .7rem", background:"rgba(var(--ff-fg), .05)", border:"var(--ff-hair-w) solid rgba(var(--ff-fg), .12)", borderRadius:"6px", color:"var(--ff-text)", fontFamily:"inherit", fontSize:".85rem" }}
                  />
                </label>
              ))}
              <label style={{ display:"block", marginBottom: "var(--ff-s4)" }}>
                <span style={{ display:"block", fontSize:".76rem", color:"rgba(var(--ff-muted), .6)", marginBottom:".3rem" }}>Message</span>
                <textarea
                  value={noticeDraft.body}
                  onChange={e => setNoticeDraft(d => ({ ...d, body: e.target.value }))}
                  rows={3}
                  style={{ width:"100%", padding:".55rem .7rem", background:"rgba(var(--ff-fg), .05)", border:"var(--ff-hair-w) solid rgba(var(--ff-fg), .12)", borderRadius:"6px", color:"var(--ff-text)", fontFamily:"inherit", fontSize:".85rem", resize:"vertical" as const }}
                />
              </label>

              {/* ── "Why are you paused?" panel ───────────────────────────── */}
              <label style={{ display:"block", marginBottom: "var(--ff-s4)" }}>
                <span style={{ display:"block", fontSize:".76rem", color:"rgba(var(--ff-muted), .6)", marginBottom:".3rem" }}>
                  The &ldquo;why?&rdquo; panel — what people see when they press the banner
                </span>
                <span style={{ display:"block", fontSize:".74rem", color:"rgba(var(--ff-muted), .45)", marginBottom:".35rem", lineHeight:1.5 }}>
                  Same formatting as the newsletter: <code>## </code>starts a heading, <code>- </code>starts a bullet,
                  and <code>**text**</code> makes it bold. Leave this empty to switch the panel off — the banner
                  goes back to being a plain strip nobody can press.
                </span>
                <textarea
                  value={noticeDraft.details}
                  onChange={e => setNoticeDraft(d => ({ ...d, details: e.target.value }))}
                  rows={12}
                  placeholder={"## Why we're paused\nWe'd rather fix things before you feel them.\n\n## What we're improving\n- **Your money, held safely.** Released only when you confirm the work is done."}
                  style={{ width:"100%", padding:".55rem .7rem", background:"rgba(var(--ff-fg), .05)", border:"var(--ff-hair-w) solid rgba(var(--ff-fg), .12)", borderRadius:"6px", color:"var(--ff-text)", fontFamily:"ui-monospace, SFMono-Regular, Menlo, monospace", fontSize:".78rem", lineHeight:1.6, resize:"vertical" as const }}
                />
              </label>

              <Button variant="primary" onClick={saveNotice} disabled={busyPlatform}>
                {busyPlatform ? "Saving…" : "Save wording"}
              </Button>
            </DashCard>

            {/* ── Held requests ───────────────────────────────────────────── */}
            <h2 style={{ fontFamily:"'Bebas Neue',sans-serif", fontSize:"1.2rem", letterSpacing:".05em", marginTop:"2rem", marginBottom:".3rem" }}>
              Jobs held by the pause ({heldReqs.length})
            </h2>
            <p style={{ fontSize:".82rem", color:"rgba(var(--ff-muted), .6)", marginBottom: "var(--ff-s4)", maxWidth:"58ch" }}>
              Real job requests from signed-in clients that were captured instead of sent out. Releasing one emails every matching contractor immediately.
            </p>
            {heldReqs.length === 0 ? (
              <DashCard style={{ color:"rgba(var(--ff-muted), .55)", fontSize:".85rem" }}>
                Nothing is being held right now.
              </DashCard>
            ) : (
              <>
                <div style={{ display:"flex", gap:".5rem", flexWrap:"wrap" as const, marginBottom: "var(--ff-s4)", alignItems:"center" }}>
                  <Button variant="ghost"
                    onClick={() => setHeldSel(prev => prev.size === heldReqs.length ? new Set() : new Set(heldReqs.map(r => r.id)))}
                  >
                    {heldSel.size === heldReqs.length ? "Clear selection" : "Select all"}
                  </Button>
                  {/* The old button hand-painted its own enabled AND disabled
                      look — three literals keyed on `heldSel.size`, duplicating
                      what the primitive's `:disabled` rule already says. The
                      `disabled` expression is untouched; only the paint is gone. */}
                  <Button variant="primary"
                    onClick={() => releaseHeld(Array.from(heldSel))}
                    disabled={busyRelease || heldSel.size === 0}
                  >
                    {busyRelease ? "Releasing…" : `Release selected (${heldSel.size})`}
                  </Button>
                </div>
                {heldReqs.map(r => {
                  const picked = heldSel.has(r.id);
                  return (
                    /* A <DashCard>, not a <Row>: each held request carries a
                       selection checkbox, up to 400 characters of the client's
                       own description and its own release button. */
                    <DashCard key={r.id} style={{ borderColor: picked ? "rgba(var(--ff-accent-rgb), .4)" : "rgba(var(--ff-fg), .08)" }}>
                      <div style={{ display:"flex", gap: "var(--ff-s3)", alignItems:"flex-start" }}>
                        <input
                          type="checkbox"
                          checked={picked}
                          onChange={() => setHeldSel(prev => { const n = new Set(prev); if (n.has(r.id)) n.delete(r.id); else n.add(r.id); return n; })}
                          aria-label={`Select ${r.service_needed || "request"}`}
                          style={{ marginTop:4, flexShrink:0, accentColor:"var(--ff-c10)" }}
                        />
                        <div style={{ minWidth:0, flex:1 }}>
                          <div style={s.title}>{r.service_needed || "Job request"}</div>
                          {r.client_name && <div style={s.meta}><Ic name="user" size={13} style={{ marginRight:4 }} />{r.client_name}{r.client_email ? ` · ${r.client_email}` : ""}</div>}
                          {r.location && <div style={s.meta}><Ic name="map-pin" size={13} style={{ marginRight:4 }} />{r.location}</div>}
                          <div style={{ ...s.meta, color:"rgba(var(--ff-muted), .45)" }}>
                            Waiting {Number(r.days_waiting ?? 0)} day{Number(r.days_waiting ?? 0) === 1 ? "" : "s"}
                            {r.created_at ? ` · posted ${new Date(r.created_at).toLocaleDateString("en-CA", { dateStyle:"medium" })}` : ""}
                          </div>
                          {r.job_description && (
                            <div style={{ fontSize:".82rem", color:"rgba(var(--ff-muted), .65)", marginTop:".5rem", whiteSpace:"pre-wrap" as const }}>
                              {String(r.job_description).slice(0, 400)}{String(r.job_description).length > 400 ? "…" : ""}
                            </div>
                          )}
                          <Button
                            onClick={() => releaseHeld([r.id])}
                            disabled={busyRelease}
                            style={{ marginTop: "var(--ff-s3)" }}
                          >
                            {busyRelease ? "Working…" : "Release just this one"}
                          </Button>
                        </div>
                      </div>
                    </DashCard>
                  );
                })}
              </>
            )}

            {/* ── Waitlist signups ────────────────────────────────────────── */}
            <h2 style={{ fontFamily:"'Bebas Neue',sans-serif", fontSize:"1.2rem", letterSpacing:".05em", marginTop:"2rem", marginBottom:".3rem" }}>
              Waitlist signups ({waitlistRows.length})
            </h2>
            <p style={{ fontSize:".82rem", color:"rgba(var(--ff-muted), .6)", marginBottom: "var(--ff-s4)", maxWidth:"58ch" }}>
              People who left their details while the site was paused. Nobody here has an account or a job request yet — email them when you reopen.
            </p>
            {waitlistRows.length === 0 ? (
              <DashCard style={{ color:"rgba(var(--ff-muted), .55)", fontSize:".85rem" }}>
                No signups yet.
              </DashCard>
            ) : waitlistRows.map(w => (
              <DashCard key={w.id}>
                <div style={s.title}>{w.name || w.email}</div>
                <div style={s.meta}><Ic name="mail" size={13} style={{ marginRight:4 }} />{w.email}{w.phone ? ` · ${w.phone}` : ""}</div>
                {w.service && <div style={s.meta}><Ic name="wrench" size={13} style={{ marginRight:4 }} />{w.service}</div>}
                <div style={{ ...s.meta, color:"rgba(var(--ff-muted), .45)" }}>
                  {new Date(w.created_at).toLocaleString("en-CA", { dateStyle:"medium", timeStyle:"short" })}
                  {w.source ? ` · from ${String(w.source).replace(/_/g, " ")}` : ""}
                  {w.notified_at ? " · already emailed" : ""}
                </div>
                {w.description && (
                  <div style={{ fontSize:".82rem", color:"rgba(var(--ff-muted), .65)", marginTop:".5rem", whiteSpace:"pre-wrap" as const }}>
                    {String(w.description).slice(0, 400)}{String(w.description).length > 400 ? "…" : ""}
                  </div>
                )}
              </DashCard>
            ))}
          </div>
  );
}
