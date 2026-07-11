import { useState } from "react";
import { Ic } from "@/components/Ic";
import { supabase } from "@/lib/supabase";
import { suggestedChecklist } from "@/lib/checklistTemplates";

type Item = { text: string; done: boolean };

// On-site checklist attached to a job. Contractor mode = full editor (add /
// check off / remove, plus a one-tap trade-suggested starter list built from
// the job's service). Client mode = read-only progress so they can see the
// pro working through it. Saves via the set_job_checklist RPC on every change
// (small lists — no debounce needed); optimistic with rollback on failure.
export default function JobChecklist({ job, role, onError }: {
  job: any;
  role: "contractor" | "client";
  onError?: (msg: string) => void;
}) {
  const [items, setItems] = useState<Item[]>(() =>
    Array.isArray(job.checklist) ? job.checklist.map((i: any) => ({ text: String(i.text ?? ""), done: !!i.done })) : []);
  const [newText, setNewText] = useState("");
  const [open, setOpen] = useState(items.length > 0);

  const save = async (next: Item[]) => {
    const prev = items;
    setItems(next);
    const { error } = await supabase.rpc("set_job_checklist", {
      p_job_id: job.id,
      p_checklist: next.length ? next : null,
    });
    if (error) {
      setItems(prev);
      onError?.("Couldn't save the checklist: " + error.message);
    }
  };

  const addItem = () => {
    const t = newText.trim();
    if (!t) return;
    if (items.length >= 40) { onError?.("Checklists are capped at 40 items."); return; }
    setNewText("");
    save([...items, { text: t, done: false }]);
  };
  const toggle = (idx: number) => save(items.map((it, i) => i === idx ? { ...it, done: !it.done } : it));
  const remove = (idx: number) => save(items.filter((_, i) => i !== idx));
  const loadSuggested = () => {
    const sug = suggestedChecklist(job.request?.service_needed);
    save(sug.map(text => ({ text, done: false })));
    setOpen(true);
  };

  const doneCount = items.filter(i => i.done).length;
  const readOnly = role === "client";
  const inp = { flex: 1, padding: ".45rem .6rem", background: "rgba(var(--ff-fg), .06)", border: "1px solid rgba(var(--ff-fg), .12)", borderRadius: "8px", color: "var(--ff-text)", fontFamily: "inherit", fontSize: ".82rem", boxSizing: "border-box" as const };

  // Client with no checklist: show nothing at all.
  if (readOnly && items.length === 0) return null;

  return (
    <div style={{ padding: ".85rem .95rem", borderRadius: "12px", background: "rgba(var(--ff-fg), .03)", border: "1px solid rgba(var(--ff-fg), .08)" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: ".6rem", flexWrap: "wrap" as const }}>
        <div style={{ display: "flex", alignItems: "center", gap: ".45rem", fontSize: ".72rem", textTransform: "uppercase" as const, letterSpacing: ".1em", color: "rgba(var(--ff-muted), .5)", fontWeight: 700 }}>
          <Ic name="clipboard-list" size={14} color="#ea6b14" />On-site checklist
          {items.length > 0 && (
            <span style={{ fontSize: ".72rem", fontWeight: 600, letterSpacing: 0, textTransform: "none" as const, color: doneCount === items.length ? "#22c55e" : "rgba(var(--ff-muted), .65)" }}>
              — {doneCount}/{items.length} done
            </span>
          )}
        </div>
        {items.length > 0 && (
          <button onClick={() => setOpen(o => !o)} style={{ background: "none", border: "none", color: "#ea6b14", fontFamily: "inherit", fontSize: ".76rem", fontWeight: 600, cursor: "pointer", padding: 0 }}>
            {open ? "Hide" : "Show"}
          </button>
        )}
      </div>

      {/* Progress bar */}
      {items.length > 0 && (
        <div style={{ height: "5px", borderRadius: "99px", background: "rgba(var(--ff-fg), .07)", margin: ".55rem 0", overflow: "hidden" }}>
          <div style={{ height: "100%", width: (items.length ? (doneCount / items.length) * 100 : 0) + "%", background: doneCount === items.length ? "#22c55e" : "#ea6b14", borderRadius: "99px", transition: "width .25s ease" }} />
        </div>
      )}

      {items.length === 0 && !readOnly && (
        <div style={{ marginTop: ".55rem" }}>
          <div style={{ fontSize: ".78rem", color: "rgba(var(--ff-muted), .55)", lineHeight: 1.5, marginBottom: ".55rem" }}>
            Work through a checklist on site so nothing gets missed — fewer callbacks, fewer disputes. Start from a list curated for your trade, then make it yours.
          </div>
          <button onClick={loadSuggested} style={{ padding: ".45rem .85rem", background: "rgba(234,107,20,.12)", border: "1px solid rgba(234,107,20,.4)", borderRadius: "8px", color: "#ea6b14", fontFamily: "inherit", fontSize: ".8rem", fontWeight: 600, cursor: "pointer" }}>
            <Ic name="sparkles" size={13} style={{ marginRight: 5 }} />Load suggested checklist
          </button>
        </div>
      )}

      {open && items.map((it, i) => (
        <div key={i} style={{ display: "flex", alignItems: "flex-start", gap: ".55rem", padding: ".4rem 0", borderTop: i === 0 ? "none" : "1px solid rgba(var(--ff-fg), .05)" }}>
          {readOnly ? (
            <span style={{ width: "16px", height: "16px", flexShrink: 0, marginTop: "1px", borderRadius: "5px", display: "inline-flex", alignItems: "center", justifyContent: "center", background: it.done ? "rgba(34,197,94,.18)" : "rgba(var(--ff-fg), .07)", border: "1px solid " + (it.done ? "rgba(34,197,94,.5)" : "rgba(var(--ff-fg), .14)") }}>
              {it.done && <Ic name="check" size={10} color="#22c55e" />}
            </span>
          ) : (
            <input type="checkbox" checked={it.done} onChange={() => toggle(i)} style={{ marginTop: "2px", cursor: "pointer", accentColor: "#ea6b14" }} />
          )}
          <span style={{ flex: 1, fontSize: ".84rem", lineHeight: 1.45, color: it.done ? "rgba(var(--ff-muted), .5)" : "var(--ff-text)", textDecoration: it.done ? "line-through" : "none" }}>{it.text}</span>
          {!readOnly && (
            <button onClick={() => remove(i)} aria-label="Remove item" style={{ background: "none", border: "none", color: "rgba(var(--ff-muted), .4)", fontFamily: "inherit", fontSize: ".9rem", cursor: "pointer", padding: "0 .2rem", lineHeight: 1 }}>×</button>
          )}
        </div>
      ))}

      {open && !readOnly && (
        <div style={{ display: "flex", gap: ".5rem", marginTop: ".55rem" }}>
          <input value={newText} placeholder="Add an item…" onChange={e => setNewText(e.target.value)} onKeyDown={e => { if (e.key === "Enter") addItem(); }} style={inp} />
          <button onClick={addItem} style={{ padding: ".45rem .8rem", background: "rgba(var(--ff-fg), .06)", border: "1px solid rgba(var(--ff-fg), .12)", borderRadius: "8px", color: "var(--ff-text)", fontFamily: "inherit", fontSize: ".8rem", cursor: "pointer", flexShrink: 0 }}>+ Add</button>
        </div>
      )}
    </div>
  );
}
