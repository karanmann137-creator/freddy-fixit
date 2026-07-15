// Job costing — contractor-private expense log per job (materials, rentals, dump
// fees, etc.). Clients NEVER see this; rows live in job_expenses (RLS: contractor-
// own + admin read). Parent (ContractorDashboard) owns the list so the earnings
// tab can total profit across jobs.
import { useState } from "react";
import { supabase } from "../lib/supabase";

export type JobExpense = { id: string; job_id: string; label: string; amount: number; created_at: string };

const inp = { padding: ".45rem .6rem", background: "rgba(var(--ff-fg), .06)", border: "1px solid rgba(var(--ff-fg), .12)", borderRadius: "8px", color: "var(--ff-text)", fontFamily: "inherit", fontSize: ".82rem", boxSizing: "border-box" as const };

export default function JobExpenses({ jobId, items, jobAmount, onAdd, onDelete, onError }: {
  jobId: string;
  items: JobExpense[];
  jobAmount?: number | null; // agreed job price -> shows estimated profit for this job
  onAdd: (row: JobExpense) => void;
  onDelete: (id: string) => void;
  onError: (msg: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [label, setLabel] = useState("");
  const [amount, setAmount] = useState("");
  const [busy, setBusy] = useState(false);

  const total = items.reduce((s, e) => s + Number(e.amount || 0), 0);
  const payout = jobAmount != null && Number(jobAmount) > 0 ? Math.round(Number(jobAmount) * 93) / 100 : null;

  const add = async () => {
    const amt = Number(amount);
    if (!label.trim()) { onError('Give the expense a name (e.g. "Paint + supplies").'); return; }
    if (!(amt > 0)) { onError("Enter the amount you spent."); return; }
    setBusy(true);
    const { data: { user } } = await supabase.auth.getUser();
    const { data, error } = await supabase.from("job_expenses")
      .insert({ job_id: jobId, contractor_id: user?.id, label: label.trim(), amount: amt })
      .select().single();
    setBusy(false);
    if (error || !data) { onError("Couldn't save the expense: " + (error?.message ?? "unknown error")); return; }
    onAdd(data as JobExpense);
    setLabel(""); setAmount("");
  };

  const remove = async (id: string) => {
    const { error } = await supabase.from("job_expenses").delete().eq("id", id);
    if (error) { onError("Couldn't remove the expense: " + error.message); return; }
    onDelete(id);
  };

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)}
        style={{ background: "none", border: "none", padding: 0, alignSelf: "flex-start", cursor: "pointer", fontFamily: "inherit", fontSize: ".78rem", color: "rgba(var(--ff-muted), .55)", textDecoration: "underline" }}>
        {items.length > 0 ? `Job costs: $${total.toFixed(2)} (${items.length}) — view / add` : "+ Log job costs (materials, rentals…)"}
      </button>
    );
  }

  return (
    <div style={{ padding: ".8rem .9rem", borderRadius: "10px", background: "rgba(var(--ff-fg), .03)", border: "1px dashed rgba(var(--ff-fg), .15)" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: ".4rem" }}>
        <div style={{ fontSize: ".8rem", fontWeight: 600, color: "var(--ff-text)" }}>Job costs</div>
        <button type="button" onClick={() => setOpen(false)} style={{ background: "none", border: "none", color: "rgba(var(--ff-muted), .5)", cursor: "pointer", fontSize: ".9rem", padding: 0 }}>×</button>
      </div>
      <div style={{ fontSize: ".7rem", color: "rgba(var(--ff-muted), .45)", lineHeight: 1.5, marginBottom: ".55rem" }}>
        Private to you — the client never sees this. Log materials, rentals and other costs to track your real profit.
      </div>
      {items.map(e => (
        <div key={e.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: ".5rem", padding: ".3rem 0", borderBottom: "1px solid rgba(var(--ff-fg), .06)", fontSize: ".8rem" }}>
          <span style={{ color: "var(--ff-text)", flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{e.label}</span>
          <span style={{ color: "rgba(var(--ff-muted), .75)" }}>{"$" + Number(e.amount).toFixed(2)}</span>
          <button type="button" onClick={() => remove(e.id)} title="Remove"
            style={{ background: "none", border: "none", color: "rgba(239,68,68,.6)", cursor: "pointer", fontSize: ".85rem", padding: "0 .1rem" }}>×</button>
        </div>
      ))}
      <div style={{ display: "flex", gap: ".4rem", marginTop: ".55rem", flexWrap: "wrap" as const }}>
        <input value={label} onChange={e => setLabel(e.target.value)} placeholder="What was it? (e.g. Paint + supplies)" maxLength={120} style={{ ...inp, flex: "2 1 150px", minWidth: 0 }} />
        <input value={amount} onChange={e => setAmount(e.target.value.replace(/[^0-9.]/g, ""))} placeholder="$" inputMode="decimal" style={{ ...inp, flex: "1 1 70px", minWidth: 0, maxWidth: "110px" }} />
        <button type="button" disabled={busy} onClick={add}
          style={{ padding: ".45rem .8rem", borderRadius: "8px", border: "none", background: "#ea6b14", color: "#fff", fontFamily: "inherit", fontSize: ".8rem", fontWeight: 600, cursor: "pointer", opacity: busy ? 0.6 : 1 }}>
          {busy ? "…" : "Add"}
        </button>
      </div>
      {(items.length > 0 || payout != null) && (
        <div style={{ marginTop: ".6rem", fontSize: ".78rem", color: "rgba(var(--ff-muted), .7)", lineHeight: 1.55 }}>
          Costs so far: <strong style={{ color: "var(--ff-text)" }}>{"$" + total.toFixed(2)}</strong>
          {payout != null && (
            <> · Your payout (93%): <strong style={{ color: "var(--ff-text)" }}>{"$" + payout.toFixed(2)}</strong> · Est. profit:{" "}
              <strong style={{ color: payout - total >= 0 ? "#22c55e" : "#ef4444" }}>{"$" + (payout - total).toFixed(2)}</strong></>
          )}
        </div>
      )}
    </div>
  );
}
