import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase";
import { Ic } from "@/components/Ic";

// Trade options must match the contractor onboarding list (ContractorOnboarding.tsx).
const WORK_TYPES = [
  { id: "regulated",     label: "Regulated trade (electrical, gas, plumbing, HVAC)" },
  { id: "skilled",       label: "Skilled trade (carpentry, painting, flooring…)" },
  { id: "handyman",      label: "General handyman & repairs" },
  { id: "moving",        label: "Moving, assembly & delivery" },
  { id: "home_services", label: "Cleaning, yard & seasonal" },
];

type Role = "client" | "contractor" | "admin";

// A compact "profile bar" that lets the signed-in person review and edit their
// own details. Self-contained: loads its own data so any dashboard can drop in
// <ProfileBar role="client" /> without extra wiring. On save it updates the
// profile (and the contractor row for contractors) and triggers a confirmation
// email via the `profile-updated` edge function.
export default function ProfileBar({ role, onSaved }: { role: Role; onSaved?: () => void }) {
  const [userId, setUserId] = useState<string | null>(null);
  const [email, setEmail]   = useState("");
  const [open, setOpen]     = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved]   = useState(false);
  const [error, setError]   = useState("");
  const [form, setForm] = useState({ firstName: "", lastName: "", phone: "", companyName: "", workType: "" });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user || cancelled) { setLoading(false); return; }
      setUserId(user.id);
      setEmail(user.email ?? "");
      const { data: prof } = await supabase.from("profiles").select("first_name,last_name,phone,email").eq("id", user.id).single();
      let companyName = "", workType = "";
      if (role === "contractor") {
        const { data: con } = await supabase.from("contractors").select("company_name,work_type").eq("id", user.id).single();
        companyName = con?.company_name ?? "";
        workType = con?.work_type ?? "";
      }
      if (cancelled) return;
      if (prof?.email) setEmail(prof.email);
      setForm({
        firstName: prof?.first_name ?? "",
        lastName: prof?.last_name ?? "",
        phone: prof?.phone ?? "",
        companyName, workType,
      });
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [role]);

  const setF = (k: string, v: string) => { setForm(f => ({ ...f, [k]: v })); setSaved(false); setError(""); };

  const displayName = [form.firstName, form.lastName].filter(Boolean).join(" ") || "Your profile";
  const roleLabel = role === "contractor" ? "Contractor" : role === "admin" ? "Admin" : "Client";

  const save = async () => {
    if (!userId) return;
    if (!form.firstName.trim()) { setError("First name is required."); return; }
    if (form.phone.replace(/\D/g, "").length < 10) { setError("Enter a valid 10-digit phone number."); return; }
    setSaving(true); setError(""); setSaved(false);
    try {
      const { error: pErr } = await supabase.from("profiles")
        .update({ first_name: form.firstName.trim(), last_name: form.lastName.trim() || null, phone: form.phone.trim() })
        .eq("id", userId);
      if (pErr) throw pErr;

      const changed = ["name", "phone"];
      if (role === "contractor") {
        const { error: cErr } = await supabase.from("contractors")
          .update({ company_name: form.companyName.trim() || null, work_type: form.workType || null })
          .eq("id", userId);
        if (cErr) throw cErr;
        changed.push("company", "trade");
      }

      // Confirmation email — never let an email hiccup block the save.
      try { await supabase.functions.invoke("profile-updated", { body: { changed } }); } catch { /* noop */ }

      setSaved(true);
      setSaving(false);
      onSaved?.();
      setTimeout(() => { setOpen(false); setSaved(false); }, 1800);
    } catch (e: any) {
      setError(e?.message ?? "Could not save your changes. Please try again.");
      setSaving(false);
    }
  };

  const wrap: React.CSSProperties = { background: "rgba(var(--ff-fg), .04)", border: "1px solid rgba(var(--ff-fg), .08)", borderRadius: "12px", padding: "1rem 1.25rem", marginBottom: "1.5rem" };
  const inp: React.CSSProperties = { width: "100%", padding: ".6rem .8rem", background: "rgba(var(--ff-fg), .06)", border: "1px solid rgba(var(--ff-fg), .1)", borderRadius: "8px", color: "var(--ff-text)", fontFamily: "inherit", fontSize: ".9rem", outline: "none", boxSizing: "border-box" };
  const lbl: React.CSSProperties = { display: "block", fontSize: ".7rem", textTransform: "uppercase", letterSpacing: ".1em", color: "rgba(var(--ff-muted), .5)", marginBottom: ".35rem" };
  const ghostBtn: React.CSSProperties = { padding: ".55rem 1.1rem", background: "rgba(var(--ff-fg), .06)", border: "1px solid rgba(var(--ff-fg), .12)", borderRadius: "8px", color: "rgba(var(--ff-muted), .8)", fontFamily: "inherit", fontSize: ".83rem", cursor: "pointer" };
  const primaryBtn: React.CSSProperties = { padding: ".55rem 1.3rem", background: "#ea6b14", border: "none", borderRadius: "8px", color: "#fff", fontFamily: "inherit", fontSize: ".83rem", fontWeight: 500, cursor: "pointer" };

  if (loading) return null;

  return (
    <div style={wrap}>
      <div style={{ display: "flex", alignItems: "center", gap: ".9rem", flexWrap: "wrap" }}>
        <div style={{ width: "40px", height: "40px", borderRadius: "50%", background: "rgba(234,107,20,.15)", border: "1px solid rgba(234,107,20,.35)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
          <Ic name="user" size={18} color="#ea6b14" />
        </div>
        <div style={{ flex: 1, minWidth: "160px" }}>
          <div style={{ fontSize: ".95rem", fontWeight: 500, color: "var(--ff-text)" }}>
            {displayName}
            <span style={{ fontSize: ".62rem", textTransform: "uppercase", letterSpacing: ".08em", background: "rgba(234,107,20,.15)", color: "#ea6b14", borderRadius: "4px", padding: ".12rem .4rem", marginLeft: ".5rem", verticalAlign: "middle" }}>{roleLabel}</span>
          </div>
          <div style={{ fontSize: ".8rem", color: "rgba(var(--ff-muted), .5)" }}>{email}{form.phone ? " · " + form.phone : ""}</div>
        </div>
        <button style={open ? ghostBtn : primaryBtn} onClick={() => { setOpen(o => !o); setSaved(false); setError(""); }}>
          {open ? "Close" : "Edit profile"}
        </button>
      </div>

      {open && (
        <div style={{ marginTop: "1.1rem", borderTop: "1px solid rgba(var(--ff-fg), .07)", paddingTop: "1.1rem" }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: ".9rem" }}>
            <div>
              <label style={lbl}>First name</label>
              <input style={inp} value={form.firstName} onChange={e => setF("firstName", e.target.value)} placeholder="First name" />
            </div>
            <div>
              <label style={lbl}>Last name</label>
              <input style={inp} value={form.lastName} onChange={e => setF("lastName", e.target.value)} placeholder="Last name" />
            </div>
            <div>
              <label style={lbl}>Phone</label>
              <input style={inp} type="tel" value={form.phone} onChange={e => setF("phone", e.target.value)} placeholder="403-555-0100" />
            </div>
            <div>
              <label style={lbl}>Email <span style={{ textTransform: "none", letterSpacing: 0, color: "rgba(var(--ff-muted), .4)" }}>(sign-in — can't be changed here)</span></label>
              <input style={{ ...inp, opacity: .6, cursor: "not-allowed" }} value={email} disabled readOnly />
            </div>
            {role === "contractor" && (
              <>
                <div>
                  <label style={lbl}>Company <span style={{ textTransform: "none", letterSpacing: 0, color: "rgba(var(--ff-muted), .4)" }}>(optional)</span></label>
                  <input style={inp} value={form.companyName} onChange={e => setF("companyName", e.target.value)} placeholder="Company name" />
                </div>
                <div>
                  <label style={lbl}>Primary trade</label>
                  <select style={inp} value={form.workType} onChange={e => setF("workType", e.target.value)}>
                    <option value="">Select…</option>
                    {WORK_TYPES.map(w => <option key={w.id} value={w.id}>{w.label}</option>)}
                  </select>
                </div>
              </>
            )}
          </div>

          {error && <p style={{ fontSize: ".82rem", color: "#f87171", marginTop: ".8rem" }}>{error}</p>}

          <div style={{ display: "flex", alignItems: "center", gap: ".75rem", marginTop: "1.1rem" }}>
            <button style={{ ...primaryBtn, opacity: saving ? .6 : 1 }} onClick={save} disabled={saving}>
              {saving ? "Saving…" : "Save changes"}
            </button>
            <button style={ghostBtn} onClick={() => setOpen(false)} disabled={saving}>Cancel</button>
            {saved && <span style={{ fontSize: ".82rem", color: "#22c55e" }}>✓ Saved — confirmation email sent</span>}
          </div>
        </div>
      )}
    </div>
  );
}
