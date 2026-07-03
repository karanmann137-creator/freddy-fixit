// MilestonePanel — the full milestone-escrow control surface for a big job
// (agreed price > $2,000). Self-contained: reads job_milestones via the
// get_job_milestones RPC and renders role-specific controls.
//
//  contractor: builds/edits the 2–5 stage plan (propose_milestones) while it's
//              unapproved; once approved, marks each FUNDED stage complete (+photo).
//  client:     approves the plan, funds the current stage (create-milestone-payment
//              → Stripe Checkout), approves & releases each completed stage
//              (approve_milestone → release-payment), or disputes a stage.
//  admin:      read-only oversight + manual release of an approved stage.
//
// Economics per stage mirror the whole-job flow: client pays amount + 3% service
// fee; on release 93% → contractor, 7% platform.
import { useEffect, useState, useCallback } from "react";
import { Ic } from "@/components/Ic";
import { supabase } from "@/lib/supabase";

type Role = "contractor" | "client" | "admin";
type Milestone = {
  id: string; job_id: string; seq: number; title: string;
  amount: number; client_fee: number; contractor_payout: number; platform_fee: number;
  status: "pending" | "funded" | "completed" | "released" | "disputed";
  completion_photo_path: string | null;
  funded_at: string | null; completed_at: string | null;
  client_approved_at: string | null; released_at: string | null; disputed_at: string | null;
};

const FEE_RATE = 0.03;
const money = (n: number) => "$" + (Math.round(n * 100) / 100).toFixed(2);

const STATUS_META: Record<Milestone["status"], { label: string; color: string }> = {
  pending:   { label: "Not funded", color: "#94a3b8" },
  funded:    { label: "Funded — in progress", color: "#3b82f6" },
  completed: { label: "Done — awaiting your OK", color: "#f59e0b" },
  released:  { label: "Paid out", color: "#22c55e" },
  disputed:  { label: "Disputed", color: "#ef4444" },
};

const DEFAULT_SPLIT = [
  { title: "Deposit", pct: 0.20 },
  { title: "Rough-in", pct: 0.30 },
  { title: "Substantial", pct: 0.30 },
  { title: "Final", pct: 0.20 },
];

function suggestStages(total: number) {
  let running = 0;
  return DEFAULT_SPLIT.map((s, i) => {
    let amt: number;
    if (i === DEFAULT_SPLIT.length - 1) amt = Math.round((total - running) * 100) / 100;
    else { amt = Math.round(total * s.pct * 100) / 100; running += amt; }
    return { title: s.title, amount: String(amt) };
  });
}

export default function MilestonePanel({ job, role, onUpdated }: { job: any; role: Role; onUpdated?: () => void }) {
  const total = Number(job?.amount ?? 0);
  const [milestones, setMilestones] = useState<Milestone[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [stages, setStages] = useState<{ title: string; amount: string }[]>([]);
  const [showBuilder, setShowBuilder] = useState(false);
  const [photoFor, setPhotoFor] = useState<Record<string, File | null>>({});

  const [schedStatus, setSchedStatus] = useState<string | null>(job?.milestone_schedule_status ?? null);

  const load = useCallback(async () => {
    const { data, error } = await supabase.rpc("get_job_milestones", { p_job_id: job.id });
    if (error) { setErr(error.message); setMilestones([]); return; }
    setMilestones((data ?? []) as Milestone[]);
  }, [job.id]);

  useEffect(() => { void load(); }, [load]);

  // Seed the builder from an existing plan, or from the auto-suggested split.
  useEffect(() => {
    if (!milestones) return;
    if (milestones.length > 0) {
      setStages(milestones.map(m => ({ title: m.title, amount: String(m.amount) })));
    } else {
      setStages(suggestStages(total));
    }
    if (role === "contractor" && schedStatus !== "approved" && milestones.length === 0) setShowBuilder(true);
  }, [milestones, role, schedStatus, total]);

  if (total <= 2000 && !job?.is_milestone) return null;
  if (milestones === null) return null;

  const stageSum = stages.reduce((a, s) => a + (Number(s.amount) || 0), 0);
  const sumOk = Math.round(stageSum * 100) === Math.round(total * 100);
  const canFundIndex = milestones.findIndex(m => m.status === "pending");
  const anyDisputed = milestones.some(m => m.status === "disputed");
  const firstPendingId = canFundIndex >= 0 ? milestones[canFundIndex].id : null;
  const earlierAllReleased = (seq: number) => milestones.filter(m => m.seq < seq).every(m => m.status === "released");

  async function run(fn: () => Promise<void>) {
    setBusy(true); setErr(null); setMsg(null);
    try { await fn(); } catch (e: any) { setErr(e?.message || String(e)); }
    finally { setBusy(false); }
  }

  const setStage = (i: number, patch: Partial<{ title: string; amount: string }>) =>
    setStages(prev => prev.map((s, j) => j === i ? { ...s, ...patch } : s));
  const addStage = () => setStages(prev => prev.length >= 5 ? prev : [...prev, { title: "Stage " + (prev.length + 1), amount: "0" }]);
  const removeStage = (i: number) => setStages(prev => prev.length <= 2 ? prev : prev.filter((_, j) => j !== i));

  const propose = () => run(async () => {
    if (!sumOk) throw new Error("Stage amounts must add up to the quote " + money(total));
    const payload = stages.map(s => ({ title: s.title.trim() || "Stage", amount: Number(s.amount) }));
    const { error } = await supabase.rpc("propose_milestones", { p_job_id: job.id, p_stages: payload });
    if (error) throw error;
    setShowBuilder(false); setSchedStatus("proposed"); setMsg("Plan sent — the client will approve it.");
    await load(); onUpdated?.();
  });

  const approveSchedule = () => run(async () => {
    const { error } = await supabase.rpc("approve_milestone_schedule", { p_job_id: job.id });
    if (error) throw error;
    setSchedStatus("approved"); setMsg("Plan approved — you can fund the first stage.");
    await load(); onUpdated?.();
  });

  const fund = (m: Milestone) => run(async () => {
    const { data, error } = await supabase.functions.invoke("create-milestone-payment", { body: { milestone_id: m.id } });
    if (error) throw error;
    if (data?.url) { window.location.href = data.url; return; }
    throw new Error(data?.error || "Could not start checkout");
  });

  const complete = (m: Milestone) => run(async () => {
    let path: string | null = null;
    const file = photoFor[m.id];
    if (file) {
      const p = job.id + "/milestone-" + m.id + "-" + Date.now() + "." + (file.name.split(".").pop() || "jpg");
      const { error: upErr } = await supabase.storage.from("completion-photos").upload(p, file);
      if (upErr) throw upErr;
      path = p;
    }
    const { error } = await supabase.rpc("complete_milestone", { p_milestone: m.id, p_photo: path });
    if (error) throw error;
    setMsg("Stage marked complete — the client will review and release payment.");
    await load(); onUpdated?.();
  });

  const approveRelease = (m: Milestone) => run(async () => {
    const { error: aErr } = await supabase.rpc("approve_milestone", { p_milestone: m.id });
    if (aErr) throw aErr;
    const { data, error } = await supabase.functions.invoke("release-payment", { body: { milestone_id: m.id } });
    if (error) throw error;
    if (data?.error) throw new Error(data.error);
    setMsg("Approved — payment released for this stage.");
    await load(); onUpdated?.();
  });

  const adminRelease = (m: Milestone) => run(async () => {
    const { data, error } = await supabase.functions.invoke("release-payment", { body: { milestone_id: m.id } });
    if (error) throw error;
    if (data?.error) throw new Error(data.error);
    setMsg("Stage released.");
    await load(); onUpdated?.();
  });

  const dispute = (m: Milestone) => run(async () => {
    const reason = window.prompt("What's wrong with this stage? We'll freeze its payment and review.");
    if (reason == null) return;
    const { error } = await supabase.rpc("dispute_milestone", { p_milestone: m.id, p_reason: reason });
    if (error) throw error;
    setMsg("Stage disputed — its payment is frozen while we review.");
    await load(); onUpdated?.();
  });

  const wrap: React.CSSProperties = { margin: "1rem 0 1.25rem", padding: "1rem 1.1rem", borderRadius: "12px", background: "rgba(234,107,20,.05)", border: "1px solid rgba(234,107,20,.25)" };
  const head: React.CSSProperties = { fontSize: ".72rem", textTransform: "uppercase", letterSpacing: ".1em", color: "#ea6b14", marginBottom: ".75rem", fontWeight: 700, display: "flex", alignItems: "center", gap: 6 };
  const inp: React.CSSProperties = { padding: ".45rem .6rem", background: "rgba(var(--ff-fg), .06)", border: "1px solid rgba(var(--ff-fg), .14)", borderRadius: "8px", color: "var(--ff-text)", fontFamily: "inherit", fontSize: ".85rem", boxSizing: "border-box" };
  const btn: React.CSSProperties = { padding: ".5rem .85rem", borderRadius: "8px", fontFamily: "inherit", fontSize: ".82rem", fontWeight: 600, cursor: "pointer", border: "1px solid rgba(var(--ff-fg), .18)", background: "rgba(var(--ff-fg), .05)", color: "var(--ff-text)" };
  const btnPrimary: React.CSSProperties = { ...btn, background: "#ea6b14", color: "#fff", border: "none" };
  const btnGreen: React.CSSProperties = { ...btn, background: "#22c55e", color: "#06210f", border: "none" };

  const Banner = () => (
    <>
      {err && <div style={{ fontSize: ".8rem", color: "#ef4444", marginBottom: ".5rem" }}>{err}</div>}
      {msg && <div style={{ fontSize: ".8rem", color: "#22c55e", marginBottom: ".5rem" }}>{msg}</div>}
    </>
  );

  const showContractorBuilder = role === "contractor" && schedStatus !== "approved";
  if (showContractorBuilder) {
    const proposed = schedStatus === "proposed";
    return (
      <div style={wrap}>
        <div style={head}><Ic name="clipboard-list" size={13} />Milestone payment plan</div>
        <div style={{ fontSize: ".82rem", color: "rgba(var(--ff-muted), .8)", lineHeight: 1.5, marginBottom: ".8rem" }}>
          This job is over $2,000, so the client can pay in stages. Break the {money(total)} quote into 2–5 stages — they fund each stage as it starts and you're paid as each is approved.
        </div>
        <Banner />
        {(showBuilder || !proposed) ? (
          <>
            <div style={{ display: "flex", flexDirection: "column", gap: ".5rem" }}>
              {stages.map((st, i) => (
                <div key={i} style={{ display: "flex", gap: ".5rem", alignItems: "center" }}>
                  <input value={st.title} onChange={e => setStage(i, { title: e.target.value })} placeholder={"Stage " + (i + 1)} style={{ ...inp, flex: 2 }} />
                  <input type="number" min="0" value={st.amount} onChange={e => setStage(i, { amount: e.target.value })} placeholder="$" style={{ ...inp, flex: 1 }} />
                  {stages.length > 2 && (
                    <button onClick={() => removeStage(i)} title="Remove" style={{ ...btn, padding: ".4rem .55rem", color: "#ef4444", borderColor: "rgba(239,68,68,.3)" }}>×</button>
                  )}
                </div>
              ))}
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", margin: ".7rem 0", fontSize: ".82rem" }}>
              <button onClick={addStage} disabled={stages.length >= 5} style={{ ...btn, opacity: stages.length >= 5 ? .5 : 1 }}>+ Add stage</button>
              <span style={{ color: sumOk ? "#22c55e" : "#f59e0b", fontWeight: 600 }}>
                Stages total {money(stageSum)} / {money(total)}{sumOk ? " ✓" : " — must match"}
              </span>
            </div>
            <div style={{ display: "flex", gap: ".6rem", flexWrap: "wrap" }}>
              <button style={{ ...btnPrimary, opacity: (busy || !sumOk) ? .6 : 1 }} disabled={busy || !sumOk} onClick={propose}>{busy ? "Sending…" : proposed ? "Update plan" : "Send plan to client"}</button>
              <button style={btn} onClick={() => setStages(suggestStages(total))}>Reset to suggested</button>
            </div>
          </>
        ) : (
          <div>
            <div style={{ fontSize: ".82rem", color: "var(--ff-warn)", marginBottom: ".6rem" }}><Ic name="clock" size={13} style={{ marginRight: 4 }} />Plan sent — waiting for the client to approve it.</div>
            {milestones.map(m => (
              <div key={m.id} style={{ display: "flex", justifyContent: "space-between", fontSize: ".84rem", padding: ".3rem 0" }}>
                <span>{m.seq}. {m.title}</span><span style={{ fontWeight: 600 }}>{money(m.amount)}</span>
              </div>
            ))}
            <button style={{ ...btn, marginTop: ".5rem" }} onClick={() => setShowBuilder(true)}><Ic name="pencil" size={12} style={{ marginRight: 4 }} />Edit plan</button>
          </div>
        )}
      </div>
    );
  }

  if (milestones.length === 0) {
    if (role === "client" && schedStatus !== "proposed") {
      return (
        <div style={wrap}>
          <div style={head}><Ic name="clipboard-list" size={13} />Milestone payments</div>
          <div style={{ fontSize: ".82rem", color: "rgba(var(--ff-muted), .8)", lineHeight: 1.5 }}>
            This is a big job ({money(total)}). Your contractor is setting up a stage-by-stage payment plan so you only pay as work gets done. You'll be able to review and approve it here shortly.
          </div>
        </div>
      );
    }
    return null;
  }

  return (
    <div style={wrap}>
      <div style={head}><Ic name="clipboard-list" size={13} />Milestone payments — {money(total)} in {milestones.length} stages</div>
      <Banner />

      {role === "client" && schedStatus === "proposed" && (
        <div style={{ marginBottom: ".9rem", padding: ".7rem .8rem", borderRadius: "10px", background: "rgba(var(--ff-fg), .04)" }}>
          <div style={{ fontSize: ".82rem", color: "rgba(var(--ff-muted), .85)", lineHeight: 1.5, marginBottom: ".6rem" }}>
            Your contractor proposed this plan. You only pay each stage right before it starts — nothing is charged until you approve and fund the first stage.
          </div>
          <button style={{ ...btnPrimary, opacity: busy ? .6 : 1 }} disabled={busy} onClick={approveSchedule}>{busy ? "…" : "Approve this plan"}</button>
        </div>
      )}

      {anyDisputed && (
        <div style={{ fontSize: ".8rem", color: "#ef4444", marginBottom: ".7rem", lineHeight: 1.5 }}>
          <Ic name="alert-triangle" size={13} style={{ marginRight: 4 }} />A stage is under dispute. The rest of the plan is paused until our team resolves it.
        </div>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: ".55rem" }}>
        {milestones.map(m => {
          const meta = STATUS_META[m.status];
          const isNextToFund = m.id === firstPendingId && earlierAllReleased(m.seq) && !anyDisputed;
          return (
            <div key={m.id} style={{ padding: ".7rem .8rem", borderRadius: "10px", background: "rgba(var(--ff-fg), .04)", border: "1px solid rgba(var(--ff-fg), .08)" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: ".5rem" }}>
                <div style={{ fontWeight: 600, fontSize: ".9rem" }}>{m.seq}. {m.title}</div>
                <div style={{ fontWeight: 600, fontSize: ".9rem", color: "#22c55e" }}>{money(m.amount)}</div>
              </div>
              <div style={{ fontSize: ".75rem", color: meta.color, fontWeight: 600, margin: ".2rem 0 .1rem" }}>● {meta.label}</div>

              {role === "client" && (
                <>
                  {m.status === "pending" && isNextToFund && (
                    <div style={{ marginTop: ".5rem" }}>
                      <div style={{ fontSize: ".78rem", color: "rgba(var(--ff-muted), .75)", marginBottom: ".4rem" }}>Pay {money(m.amount)} + 3% service fee ({money(m.amount * FEE_RATE)}) = <strong>{money(m.amount * (1 + FEE_RATE))}</strong>. Held safely until you approve this stage.</div>
                      <button style={{ ...btnPrimary, opacity: busy ? .6 : 1 }} disabled={busy} onClick={() => fund(m)}>{busy ? "Opening checkout…" : "Fund this stage"}</button>
                    </div>
                  )}
                  {m.status === "pending" && !isNextToFund && (
                    <div style={{ fontSize: ".76rem", color: "rgba(var(--ff-muted), .55)", marginTop: ".3rem" }}>Unlocks once the previous stage is released.</div>
                  )}
                  {m.status === "completed" && (
                    <div style={{ marginTop: ".5rem", display: "flex", gap: ".5rem", flexWrap: "wrap" }}>
                      <button style={{ ...btnGreen, opacity: busy ? .6 : 1 }} disabled={busy} onClick={() => approveRelease(m)}>{busy ? "…" : "Approve & release " + money(m.contractor_payout)}</button>
                      <button style={{ ...btn, color: "#ef4444", borderColor: "rgba(239,68,68,.3)" }} disabled={busy} onClick={() => dispute(m)}>Something's wrong</button>
                    </div>
                  )}
                  {m.status === "funded" && (
                    <div style={{ fontSize: ".76rem", color: "rgba(var(--ff-muted), .6)", marginTop: ".3rem" }}>Funded and held. Your contractor is doing the work.</div>
                  )}
                </>
              )}

              {role === "contractor" && (
                <>
                  {m.status === "funded" && (
                    <div style={{ marginTop: ".5rem", display: "flex", flexDirection: "column", gap: ".4rem" }}>
                      <input type="file" accept="image/*" onChange={e => setPhotoFor(p => ({ ...p, [m.id]: e.target.files?.[0] ?? null }))} style={{ fontSize: ".78rem", color: "rgba(var(--ff-muted), .7)" }} />
                      <button style={{ ...btnGreen, alignSelf: "flex-start", opacity: busy ? .6 : 1 }} disabled={busy} onClick={() => complete(m)}>{busy ? "…" : "✓ Mark stage complete"}</button>
                    </div>
                  )}
                  {m.status === "pending" && <div style={{ fontSize: ".76rem", color: "rgba(var(--ff-muted), .55)", marginTop: ".3rem" }}>Waiting for the client to fund this stage.</div>}
                  {m.status === "completed" && <div style={{ fontSize: ".76rem", color: "var(--ff-warn)", marginTop: ".3rem" }}>Awaiting the client's approval to release {money(m.contractor_payout)}.</div>}
                  {m.status === "released" && <div style={{ fontSize: ".76rem", color: "#22c55e", marginTop: ".3rem" }}>{money(m.contractor_payout)} paid to you.</div>}
                </>
              )}

              {role === "admin" && (
                <div style={{ fontSize: ".76rem", color: "rgba(var(--ff-muted), .7)", marginTop: ".3rem" }}>
                  Payout {money(m.contractor_payout)} · fee {money(m.platform_fee)} · client fee {money(m.client_fee)}
                  {m.status === "completed" && (
                    <div style={{ marginTop: ".4rem" }}>
                      <button style={{ ...btn, opacity: busy ? .6 : 1 }} disabled={busy} onClick={() => adminRelease(m)}>Manual release</button>
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
