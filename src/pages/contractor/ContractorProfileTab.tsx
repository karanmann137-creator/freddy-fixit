// Extracted from src/pages/ContractorDashboard.tsx on 2026-11-12 (mechanical move, no behaviour change).
// Props are exactly the parent-component values this tab reads.
import ProfileBar from "@/components/ProfileBar";
import { contractorMissing, ffLbl, ffInp } from "./shared";
import { DashCard, Group, Pill } from "@/components/ui";
import { Ic } from "@/components/Ic";
import ContractorProfileCompletion from "@/components/ContractorProfileCompletion";
import FadeImg from "@/components/FadeImg";
import { AVAIL_DAYS, WEEKDAYS, TIME_OPTIONS } from "@/lib/availability";
import DeleteAccount from "@/components/DeleteAccount";

export default function ContractorProfileTab(props: {
  contractor: any;
  profile: any;
  pulseAnchor: string | null;
  setShowProfileCongrats: import("react").Dispatch<import("react").SetStateAction<boolean>>;
  setContractor: import("react").Dispatch<any>;
  setOpenToOther: (on: boolean) => Promise<void>;
  pricingForm: { hourly: string; callout: string; };
  setPricingForm: import("react").Dispatch<import("react").SetStateAction<{ hourly: string; callout: string; }>>;
  s: { jobCard: { background: string; border: string; borderRadius: string; padding: string; marginBottom: string; cursor: string; }; btn: { minHeight: string; padding: string; background: string; border: string; borderRadius: string; color: string; fontFamily: string; fontSize: string; letterSpacing: string; cursor: string; }; primaryBtn: { minHeight: string; padding: string; background: string; color: string; border: string; borderRadius: string; boxShadow: string; fontFamily: string; fontSize: string; letterSpacing: string; cursor: string; }; earnCard: { background: string; border: string; borderRadius: string; padding: string; textAlign: "center"; }; chip: { padding: string; background: string; border: string; borderRadius: string; fontSize: string; color: string; display: string; margin: string; }; };
  busyPricing: boolean;
  savePricing: () => Promise<void>;
  googleUrl: string;
  setGoogleUrl: import("react").Dispatch<import("react").SetStateAction<string>>;
  busyPf: boolean;
  saveGoogleUrl: () => Promise<void>;
  portfolio: any[];
  pfUrl: (path: string) => string;
  deletePortfolioItem: (item: any) => Promise<void>;
  pfForm: { title: string; description: string; file: File | null; };
  setPfForm: import("react").Dispatch<import("react").SetStateAction<{ title: string; description: string; file: File | null; }>>;
  addPortfolioItem: () => Promise<void>;
  avail: { days: string[]; start: string; end: string; };
  showCustomAvail: boolean;
  setShowCustomAvail: import("react").Dispatch<import("react").SetStateAction<boolean>>;
  setAvailDays: (days: string[]) => Promise<void>;
  dayIsOn: (day: string) => boolean;
  toggleDay: (day: string) => Promise<void>;
  setAvailStart: (start: string) => Promise<void>;
  setAvailEnd: (end: string) => Promise<void>;
}) {
  const { contractor, profile, pulseAnchor, setShowProfileCongrats, setContractor, setOpenToOther, pricingForm, setPricingForm, s, busyPricing, savePricing, googleUrl, setGoogleUrl, busyPf, saveGoogleUrl, portfolio, pfUrl, deletePortfolioItem, pfForm, setPfForm, addPortfolioItem, avail, showCustomAvail, setShowCustomAvail, setAvailDays, dayIsOn, toggleDay, setAvailStart, setAvailEnd } = props;
  return (
    (
          <div>
            <ProfileBar role="contractor" />
            {(() => {
              const missing = contractorMissing(contractor);
              // Rendered whether or not anything is missing. It used to disappear
              // the moment the profile was complete, which left a finished
              // contractor with no way to change their photo or their area again.
              const done = missing.length === 0;
              return (
                <DashCard style={done ? undefined : { border:"1px solid rgba(var(--ff-accent-rgb), .35)", background:"rgba(var(--ff-accent-rgb), .06)" }}>
                  <div className="ffd-cardtitle" style={{ display:"flex", alignItems:"center", gap:".5rem" }}>
                    <Ic name="info" size={18} color="var(--ff-c10)" /> {done ? "Your profile details" : "Finish setting up your profile"}
                  </div>
                  <p style={{ fontSize:".85rem", color:"rgba(var(--ff-muted), .7)", lineHeight:1.55, marginBottom:"1.25rem" }}>
                    {done
                      ? <>Everything's filled in. You can change your photo, service area or credentials here any time.</>
                      : <>You still need to add: <strong style={{ color:"var(--ff-text)" }}>{missing.join(", ")}</strong>. Complete these so admin can approve you and clients can see who they're hiring.</>}
                  </p>
                  <ContractorProfileCompletion
                    profile={profile}
                    contractor={contractor}
                    highlight={pulseAnchor}
                    onSaved={(patch: any) => {
                      const merged = { ...contractor, ...patch };
                      if (contractorMissing(contractor).length > 0 && contractorMissing(merged).length === 0) setShowProfileCongrats(true);
                      setContractor((c: any) => ({ ...c, ...patch }));
                    }}
                  />
                </DashCard>
              );
            })()}
            <Group label="YOUR PROFILE">
              {/* marginBottom:0 — `<Group>` already carries a --ff-s6 top margin,
                  so leaving the card's own bottom margin in place stacked two
                  gaps between every pair of cards. The gap has exactly one
                  owner now, which is the whole point of the spacing scale. */}
              <DashCard style={{ marginBottom:0 }}>
              {/* auto-fit + min(): collapses to one column on a phone instead of
                  forcing two columns that an email address then overflows. */}
              <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit, minmax(min(180px, 100%), 1fr))", gap:".75rem", marginBottom:"1.25rem" }}>
                {[["Name", `${profile?.first_name} ${profile?.last_name}`], ["Email", profile?.email], ["Phone", profile?.phone], ["Experience", `${contractor?.years_of_experience ?? 0} years`], ["Rating", contractor?.rating ? `⭐ ${contractor.rating}` : "No ratings"], ["Status", contractor?.status]].map(([l,v]) => (
                  <div key={l} style={{ minWidth:0 }}>
                    <div style={{ fontSize:".7rem", textTransform:"uppercase", letterSpacing:".1em", color:"rgba(var(--ff-muted), .4)" }}>{l}</div>
                    <div style={{ fontSize:".9rem", color:"var(--ff-text)", overflowWrap:"anywhere" as const }}>{v}</div>
                  </div>
                ))}
              </div>
              {(contractor?.specialties?.length ?? 0) > 0 && (
                <div style={{ marginBottom:"1rem" }}>
                  <div style={{ fontSize:".7rem", textTransform:"uppercase", letterSpacing:".1em", color:"rgba(var(--ff-muted), .4)", marginBottom:".5rem" }}>Specialties</div>
                  {/* `neutral`, not accent. `s.chip` tinted every one of these
                      orange, so a pro with eight specialties got eight calls to
                      action and the real one — whatever the state line is
                      saying — had to compete with them. A specialty is plain
                      metadata; see Pill's docblock on the accent budget. */}
                  {contractor.specialties.filter((sp: string) => sp !== "Other").map((sp: string) => <Pill key={sp} tone="neutral">{sp}</Pill>)}
                  {/* Opt-in to jobs outside the listed trades. Stored as the
                      "Other" specialty, which service_specialty_map maps
                      "Other" requests to — so matching needs no special case. */}
                  <label style={{ display:"flex", alignItems:"center", gap:"var(--ff-s2)", marginTop:"var(--ff-s3)", minHeight:"var(--ff-h-ctl)", fontSize:".88rem", color:"var(--ff-text)", cursor:"pointer" }}>
                    <input type="checkbox" checked={contractor.specialties.includes("Other")} onChange={e => setOpenToOther(e.target.checked)} />
                    Also send me jobs outside my specialties
                  </label>
                </div>
              )}
              {(contractor?.service_area?.length ?? 0) > 0 && (
                <div>
                  <div style={{ fontSize:".7rem", textTransform:"uppercase", letterSpacing:".1em", color:"rgba(var(--ff-muted), .4)", marginBottom:".5rem" }}>Service Area</div>
                  {contractor.service_area.map((z: string) => <Pill key={z} tone="neutral"><Ic name="map-pin" size={11} style={{ marginRight:3 }} />{z}</Pill>)}
                </div>
              )}
            </DashCard>
            </Group>
            <Group label="YOUR DEFAULT PRICING">
              <DashCard style={{ marginBottom:0 }}>
              <p style={{ fontSize:".82rem", color:"rgba(var(--ff-muted), .55)", marginBottom:"1rem", lineHeight:1.5 }}>
                Set these once and they'll pre-fill your call-out fee when you send an estimate, so you bid faster and more consistently. Clients don't see these numbers.
              </p>
              <div style={{ display:"flex", gap:".75rem", flexWrap:"wrap" as const }}>
                <div style={{ flex:"1 1 130px" }}>
                  <div style={ffLbl}>Hourly rate ($)</div>
                  <input type="number" min="0" value={pricingForm.hourly} placeholder="e.g. 85" onChange={e => setPricingForm(f => ({ ...f, hourly: e.target.value }))} style={ffInp} />
                </div>
                <div style={{ flex:"1 1 130px" }}>
                  <div style={ffLbl}>Minimum call-out ($)</div>
                  <input type="number" min="0" value={pricingForm.callout} placeholder="e.g. 120" onChange={e => setPricingForm(f => ({ ...f, callout: e.target.value }))} style={ffInp} />
                </div>
              </div>
              <button style={{ ...s.btn, background:"var(--ff-c10)", color:"#fff", border:"none", marginTop:"1rem" }} disabled={busyPricing} onClick={savePricing}>{busyPricing ? "Saving…" : "Save pricing"}</button>
            </DashCard>
            </Group>
            <Group label="PORTFOLIO & REVIEWS">
              <DashCard style={{ marginBottom:0 }}>
              <div style={{ marginBottom:"1.25rem" }}>
                <div style={{ fontSize:".7rem", textTransform:"uppercase" as const, letterSpacing:".1em", color:"rgba(var(--ff-muted), .4)", marginBottom:".35rem" }}>Google reviews link</div>
                <div style={{ display:"flex", gap:".5rem", flexWrap:"wrap" as const }}>
                  <input value={googleUrl} placeholder="https://g.page/your-business/review" onChange={e => setGoogleUrl(e.target.value)} style={{ flex:"1 1 220px", padding:".55rem .7rem", background:"rgba(var(--ff-fg), .06)", border:"var(--ff-hair-w) solid rgba(var(--ff-fg), .12)", borderRadius:"8px", color:"var(--ff-text)", fontFamily:"inherit", fontSize:".85rem" }} />
                  <button style={{ ...s.btn, background:"var(--ff-c10)", color:"#fff", border:"none" }} disabled={busyPf} onClick={saveGoogleUrl}>Save link</button>
                </div>
              </div>
              <div style={{ fontSize:".7rem", textTransform:"uppercase" as const, letterSpacing:".1em", color:"rgba(var(--ff-muted), .4)", marginBottom:".35rem" }}>Past work photos</div>
              {portfolio.length === 0 && <p style={{ fontSize:".82rem", color:"rgba(var(--ff-muted), .45)", marginBottom:".75rem" }}>No portfolio items yet. Add your best past jobs below.</p>}
              {portfolio.length > 0 && (
                <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill,minmax(min(140px, 100%), 1fr))", gap:".75rem", marginBottom:"1rem" }}>
                  {portfolio.map(item => (
                    <div key={item.id} style={{ background:"rgba(var(--ff-fg), .04)", border:"var(--ff-hair-w) solid rgba(var(--ff-fg), .08)", borderRadius:"10px", overflow:"hidden" }}>
                      {item.photo_path && <FadeImg src={pfUrl(item.photo_path)} alt={item.title || "Past job"} style={{ width:"100%", height:"100px", objectFit:"cover" as const, display:"block" }} />}
                      <div style={{ padding:".5rem .6rem" }}>
                        {item.title && <div style={{ fontSize:".8rem", fontWeight:600, color:"var(--ff-text)" }}>{item.title}</div>}
                        {item.description && <div style={{ fontSize:".72rem", color:"rgba(var(--ff-muted), .6)", marginTop:".15rem" }}>{item.description}</div>}
                        <button onClick={() => deletePortfolioItem(item)} style={{ marginTop:".4rem", fontSize:".7rem", color:"var(--ff-danger)", background:"none", border:"none", cursor:"pointer", padding:0 }}>Remove</button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
              <div style={{ display:"flex", flexDirection:"column", gap:".5rem", borderTop:"var(--ff-hair-w) solid rgba(var(--ff-fg), .07)", paddingTop: "var(--ff-s4)" }}>
                <input value={pfForm.title} placeholder="Title (e.g. Kitchen sink replacement)" onChange={e => setPfForm(f => ({ ...f, title: e.target.value }))} style={{ padding:".55rem .7rem", background:"rgba(var(--ff-fg), .06)", border:"var(--ff-hair-w) solid rgba(var(--ff-fg), .12)", borderRadius:"8px", color:"var(--ff-text)", fontFamily:"inherit", fontSize:".85rem", boxSizing:"border-box" as const }} />
                <textarea value={pfForm.description} rows={2} placeholder="Short description (optional)" onChange={e => setPfForm(f => ({ ...f, description: e.target.value }))} style={{ padding:".55rem .7rem", background:"rgba(var(--ff-fg), .06)", border:"var(--ff-hair-w) solid rgba(var(--ff-fg), .12)", borderRadius:"8px", color:"var(--ff-text)", fontFamily:"inherit", fontSize:".85rem", boxSizing:"border-box" as const, resize:"vertical" as const }} />
                <input type="file" accept="image/*" onChange={e => { const nf = e.target.files?.[0]; if (!nf) return; setPfForm(f => ({ ...f, file: nf })); }} style={{ fontSize:".8rem", color:"rgba(var(--ff-muted), .7)" }} />
                <button style={{ ...s.btn, background:"var(--ff-c10)", color:"#fff", border:"none", alignSelf:"flex-start" as const }} disabled={busyPf} onClick={addPortfolioItem}>{busyPf ? "Adding…" : "+ Add portfolio item"}</button>
              </div>
            </DashCard>
            </Group>
            <Group label="AVAILABILITY">
              <DashCard style={{ marginBottom:0 }}>
              <p style={{ fontSize:".82rem", color:"rgba(var(--ff-muted), .5)", marginBottom:"1.1rem", lineHeight:1.5 }}>
                Pick a typical week. You can fine-tune any day. Changes save automatically.
              </p>
              {(() => {
                const eq = (a: string[]) => a.length === avail.days.length && a.every(d => avail.days.includes(d));
                const active = eq(AVAIL_DAYS) ? "every" : eq(WEEKDAYS) ? "weekdays" : (avail.days.length ? "custom" : "none");
                const presets: [string,string,string[]][] = [
                  ["weekdays","Weekdays", WEEKDAYS],
                  ["every","Every day", AVAIL_DAYS],
                ];
                const presetBtn = (selected: boolean) => ({
                  padding:".5rem .9rem", borderRadius:"99px", cursor:"pointer", fontFamily:"inherit", fontSize:".82rem", fontWeight:600,
                  border: selected ? "1px solid var(--ff-c10)" : "1px solid rgba(var(--ff-fg), .14)",
                  background: selected ? "var(--ff-c10)" : "rgba(var(--ff-fg), .05)",
                  color: selected ? "#fff" : "var(--ff-text)",
                });
                const showChips = showCustomAvail || active === "custom";
                const sel = {
                  padding:".55rem .7rem", background:"rgba(var(--ff-fg), .06)", border:"var(--ff-hair-w) solid rgba(var(--ff-fg), .12)",
                  borderRadius:"8px", color:"var(--ff-text)", fontFamily:"inherit", fontSize:".85rem", cursor:"pointer",
                };
                return (
                  <div>
                    <div style={{ display:"flex", gap:".5rem", flexWrap:"wrap" as const }}>
                      {presets.map(([key,label,days]) => (
                        <button key={key} onClick={() => { setShowCustomAvail(false); setAvailDays(days); }} style={presetBtn(active === key)}>
                          {label}
                        </button>
                      ))}
                      <button onClick={() => setShowCustomAvail(v => !v || active !== "custom" ? true : false)} style={presetBtn(active === "custom")}>
                        Custom
                      </button>
                    </div>
                    {showChips && (
                      <div style={{ marginTop:"1.1rem", paddingTop:"1.1rem", borderTop:"var(--ff-hair-w) solid rgba(var(--ff-fg), .07)" }}>
                        <div style={{ fontSize:".72rem", textTransform:"uppercase" as const, letterSpacing:".08em", color:"rgba(var(--ff-muted), .55)", marginBottom: "var(--ff-s3)" }}>
                          Tap the days you usually work
                        </div>
                        <div style={{ display:"flex", gap:".5rem", flexWrap:"wrap" as const }}>
                          {AVAIL_DAYS.map(day => {
                            const on = dayIsOn(day);
                            return (
                              <button key={day} onClick={() => toggleDay(day)} aria-label={day}
                                style={{ display:"flex", alignItems:"center", gap:".35rem", padding:".5rem .85rem", borderRadius:"99px", cursor:"pointer", fontFamily:"inherit", fontSize:".82rem", fontWeight:600,
                                  border: on ? "1px solid var(--ff-c10)" : "1px solid rgba(var(--ff-fg), .14)",
                                  background: on ? "rgba(var(--ff-accent-rgb), .16)" : "rgba(var(--ff-fg), .05)",
                                  color: on ? "var(--ff-c10)" : "rgba(var(--ff-muted), .6)" }}>
                                {on && <span style={{ fontSize:".78rem" }}>✓</span>}{day.slice(0,3)}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    )}
                    {avail.days.length > 0 && (
                      <div style={{ marginTop:"1.1rem", paddingTop:"1.1rem", borderTop:"var(--ff-hair-w) solid rgba(var(--ff-fg), .07)" }}>
                        <div style={{ fontSize:".72rem", textTransform:"uppercase" as const, letterSpacing:".08em", color:"rgba(var(--ff-muted), .55)", marginBottom: "var(--ff-s3)" }}>
                          Hours you're usually available
                        </div>
                        <div style={{ display:"flex", gap:".6rem", alignItems:"center", flexWrap:"wrap" as const }}>
                          <select value={avail.start} onChange={e => setAvailStart(e.target.value)} style={sel}>
                            {TIME_OPTIONS.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                          </select>
                          <span style={{ fontSize:".82rem", color:"rgba(var(--ff-muted), .6)" }}>to</span>
                          <select value={avail.end} onChange={e => setAvailEnd(e.target.value)} style={sel}>
                            {TIME_OPTIONS.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                          </select>
                        </div>
                        {avail.end <= avail.start && (
                          <p style={{ fontSize:".78rem", color:"var(--ff-warn)", marginTop: "var(--ff-s3)", marginBottom:0 }}>
                            End time should be after the start time.
                          </p>
                        )}
                      </div>
                    )}
                    {avail.days.length === 0 && !showChips && (
                      <p style={{ fontSize:".78rem", color:"var(--ff-warn)", marginTop: "var(--ff-s4)", marginBottom:0 }}>
                        No availability set yet — pick a preset or Custom so clients know when to reach you.
                      </p>
                    )}
                  </div>
                );
              })()}
            </DashCard>
            </Group>
            <DeleteAccount />
          </div>
        )
  );
}
