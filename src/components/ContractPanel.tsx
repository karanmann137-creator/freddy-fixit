// ContractPanel — service-agreement e-signature surface for jobs that require a
// signed contract (milestone / recurring / agreed price > $2,000). Two-party:
//   contractor: reviews the auto-generated agreement, adds optional custom
//               clauses OR uploads their own document (with a liability
//               acknowledgment), then types their legal name to sign & send.
//   client:     reviews the sent agreement and types their legal name to accept.
//   admin:      read-only oversight + view the executed copy.
// Legally valid under Alberta's Electronic Transactions Act + PIPEDA
// (intent + consent + identity + tamper-evident timestamp/IP audit trail).
import { useCallback, useEffect, useState } from "react";
import { Ic } from "@/components/Ic";
import { supabase } from "@/lib/supabase";

type Role = "contractor" | "client" | "admin";
type Contract = {
  id: string | null;
  job_id: string;
  status: "draft" | "sent" | "signed" | "void" | null;
  source: "generated" | "uploaded";
  body_md: string | null;
  custom_clauses: string | null;
  uploaded_path: string | null;
  uploaded_ack: boolean;
  contractor_signed_at: string | null;
  contractor_sig_name: string | null;
  client_signed_at: string | null;
  client_sig_name: string | null;
  signed_html: string | null;
  signed_at: string | null;
};

const fmt = (ts: string | null | undefined) =>
  ts ? new Date(ts).toLocaleString("en-CA", { timeZone: "America/Edmonton", dateStyle: "medium", timeStyle: "short" }) : "";

// Minimal, safe markdown → React (headings, bold, bullet lists, paragraphs).
function renderMd(md: string) {
  const lines = (md || "").replace(/\r/g, "").split("\n");
  const out: React.ReactNode[] = [];
  let list: string[] = [];
  const flush = () => {
    if (list.length) {
      out.push(
        <ul key={"ul" + out.length} style={{ margin: ".3rem 0 .6rem 1.1rem", padding: 0 }}>
          {list.map((li, i) => <li key={i} style={{ fontSize: ".84rem", lineHeight: 1.55, marginBottom: ".2rem" }}>{inline(li)}</li>)}
        </ul>
      );
      list = [];
    }
  };
  const inline = (t: string): React.ReactNode => {
    const parts = t.split(/(\*\*[^*]+\*\*)/g);
    return parts.map((p, i) =>
      p.startsWith("**") && p.endsWith("**")
        ? <strong key={i}>{p.slice(2, -2)}</strong>
        : <span key={i}>{p}</span>
    );
  };
  for (const raw of lines) {
    const line = raw.trimEnd();
    if (/^#\s+/.test(line)) { flush(); out.push(<div key={out.length} style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: "1.15rem", letterSpacing: ".02em", margin: ".6rem 0 .35rem", color: "var(--ff-text)" }}>{line.replace(/^#\s+/, "")}</div>); }
    else if (/^##\s+/.test(line)) { flush(); out.push(<div key={out.length} style={{ fontSize: ".82rem", fontWeight: 700, textTransform: "uppercase" as const, letterSpacing: ".06em", color: "#ea6b14", margin: ".7rem 0 .3rem" }}>{line.replace(/^##\s+/, "")}</div>); }
    else if (/^[-*]\s+/.test(line)) { list.push(line.replace(/^[-*]\s+/, "")); }
    else if (line === "") { flush(); }
    else { flush(); out.push(<p key={out.length} style={{ fontSize: ".84rem", lineHeight: 1.6, margin: ".25rem 0", color: "rgba(var(--ff-text-rgb, 240,244,255), .92)" }}>{inline(line)}</p>); }
  }
  flush();
  return out;
}

const card: React.CSSProperties = { margin: "1rem 0 1.25rem", padding: "1.1rem 1.2rem", borderRadius: "12px", background: "rgba(var(--ff-fg), .04)", border: "1px solid rgba(var(--ff-fg), .08)" };
const label: React.CSSProperties = { fontSize: ".72rem", textTransform: "uppercase" as const, letterSpacing: ".1em", color: "rgba(var(--ff-muted), .5)", marginBottom: ".6rem", display: "flex", alignItems: "center", gap: 6 };
const btn: React.CSSProperties = { padding: ".55rem 1.1rem", borderRadius: "9px", border: "none", fontFamily: "inherit", fontSize: ".85rem", fontWeight: 600, cursor: "pointer" };
const input: React.CSSProperties = { width: "100%", padding: ".55rem .7rem", borderRadius: "8px", border: "1px solid rgba(var(--ff-fg), .18)", background: "rgba(var(--ff-fg), .03)", color: "var(--ff-text)", fontFamily: "inherit", fontSize: ".9rem", boxSizing: "border-box" };

export default function ContractPanel({ job, role, onUpdated }: { job: any; role: Role; onUpdated?: () => void }) {
  const [contract, setContract] = useState<Contract | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  // contractor compose state
  const [preview, setPreview] = useState<string>("");
  const [clauses, setClauses] = useState("");
  const [source, setSource] = useState<"generated" | "uploaded">("generated");
  const [file, setFile] = useState<File | null>(null);
  const [uploadAck, setUploadAck] = useState(false);

  // shared sign state
  const [sigName, setSigName] = useState("");
  const [consent, setConsent] = useState(false);

  const load = useCallback(async () => {
    setErr(null);
    const { data, error } = await supabase.rpc("get_job_contract", { p_job_id: job.id });
    if (error) { setErr("Could not load the agreement. Please retry."); setLoading(false); return; }
    const row: Contract | null = data && (data as any).id ? (data as any) : null;
    setContract(row);
    if (row) {
      setClauses(row.custom_clauses || "");
      setSource(row.source || "generated");
      setUploadAck(!!row.uploaded_ack);
    }
    setLoading(false);
  }, [job.id]);

  useEffect(() => { setLoading(true); load(); }, [load]);

  // Load a live preview of the generated body for the contractor before they sign.
  useEffect(() => {
    if (role !== "contractor") return;
    if (contract?.status === "signed" || contract?.status === "sent") return;
    let alive = true;
    supabase.rpc("build_contract_body", { p_job_id: job.id }).then(({ data }) => {
      if (alive && typeof data === "string") setPreview(data);
    });
    return () => { alive = false; };
  }, [role, job.id, contract?.status]);

  const invokeSign = async (action: "contractor_sign" | "client_sign") => {
    const { data, error } = await supabase.functions.invoke("contract-sign", {
      body: { action, job_id: job.id, signer_name: sigName.trim() },
    });
    if (error) {
      let m = "Could not sign right now. Please try again.";
      try { const j = await (error as any).context?.json?.(); if (j?.error) m = j.error; } catch { /* ignore */ }
      throw new Error(m);
    }
    if ((data as any)?.error) throw new Error((data as any).error);
  };

  const contractorSign = async () => {
    if (sigName.trim().length < 2) { setErr("Type your full legal name to sign."); return; }
    if (!consent) { setErr("Please confirm you agree to sign electronically."); return; }
    if (source === "uploaded" && !file && !contract?.uploaded_path) { setErr("Choose the document you want to send, or switch to the standard agreement."); return; }
    if (source === "uploaded" && !uploadAck) { setErr("Please confirm your uploaded document doesn't shift liability onto Freddy Fix It."); return; }
    setBusy(true); setErr(null); setMsg(null);
    try {
      let uploadedPath = contract?.uploaded_path || null;
      if (source === "uploaded" && file) {
        const safe = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
        const path = `${job.id}/${Date.now()}-${safe}`;
        const { error: upErr } = await supabase.storage.from("contracts").upload(path, file, { upsert: false });
        if (upErr) throw new Error("Upload failed: " + upErr.message);
        uploadedPath = path;
      }
      const { error: sErr } = await supabase.rpc("save_contract_draft", {
        p_job_id: job.id,
        p_custom_clauses: clauses.trim() || null,
        p_source: source,
        p_uploaded_path: uploadedPath,
        p_uploaded_ack: source === "uploaded" ? uploadAck : false,
      });
      if (sErr) throw new Error(sErr.message);
      await invokeSign("contractor_sign");
      setMsg("Signed and sent to your client. They'll be asked to review and sign before any payment is collected.");
      setConsent(false);
      await load();
      onUpdated?.();
    } catch (e: any) {
      setErr(e?.message || "Something went wrong. Please try again.");
    } finally { setBusy(false); }
  };

  const clientSign = async () => {
    if (sigName.trim().length < 2) { setErr("Type your full legal name to sign."); return; }
    if (!consent) { setErr("Please confirm you agree to sign electronically."); return; }
    setBusy(true); setErr(null); setMsg(null);
    try {
      await invokeSign("client_sign");
      setMsg("Signed. A copy of the fully-signed agreement has been emailed to you.");
      setConsent(false);
      await load();
      onUpdated?.();
    } catch (e: any) {
      setErr(e?.message || "Something went wrong. Please try again.");
    } finally { setBusy(false); }
  };

  const viewSigned = () => {
    if (!contract?.signed_html) return;
    const w = window.open("", "_blank");
    if (w) { w.document.write(contract.signed_html); w.document.close(); }
  };

  const viewUpload = async () => {
    if (!contract?.uploaded_path) return;
    const { data, error } = await supabase.storage.from("contracts").createSignedUrl(contract.uploaded_path, 3600);
    if (error || !data?.signedUrl) { setErr("Could not open the document."); return; }
    window.open(data.signedUrl, "_blank");
  };

  if (loading) return <div style={{ ...card, fontSize: ".85rem", color: "rgba(var(--ff-muted), .7)" }}>Loading the agreement…</div>;

  const status = contract?.status ?? null;
  const bodyForView = contract?.body_md || preview;

  // ---------- SIGNED (everyone) ----------
  if (status === "signed") {
    return (
      <div style={{ ...card, borderColor: "rgba(34,197,94,.35)", background: "rgba(34,197,94,.06)" }}>
        <div style={label}><Ic name="check-circle" size={14} color="#22c55e" />Service agreement — signed</div>
        <div style={{ fontSize: ".85rem", lineHeight: 1.6, color: "rgba(var(--ff-muted), .9)", marginBottom: ".7rem" }}>
          Signed by both parties{contract?.signed_at ? ` on ${fmt(contract.signed_at)}` : ""}. This agreement is now in effect.
        </div>
        <div style={{ display: "flex", gap: ".5rem", flexWrap: "wrap" }}>
          <button style={{ ...btn, background: "#22c55e", color: "#06210f" }} onClick={viewSigned}><Ic name="download" size={13} style={{ marginRight: 5 }} />View signed copy</button>
          {contract?.source === "uploaded" && contract?.uploaded_path && (
            <button style={{ ...btn, background: "rgba(var(--ff-fg), .08)", color: "var(--ff-text)" }} onClick={viewUpload}>View attached document</button>
          )}
        </div>
      </div>
    );
  }

  // ---------- CONTRACTOR ----------
  if (role === "contractor") {
    if (status === "sent") {
      return (
        <div style={{ ...card, borderColor: "rgba(59,130,246,.3)" }}>
          <div style={label}><Ic name="clock" size={14} color="#3b82f6" />Agreement sent — waiting for your client</div>
          <div style={{ fontSize: ".85rem", lineHeight: 1.6, color: "rgba(var(--ff-muted), .9)" }}>
            You signed on {fmt(contract?.contractor_signed_at)}. Your client has been emailed to review and sign. Payment can't be collected until they do.
          </div>
        </div>
      );
    }
    // draft / none → compose
    return (
      <div style={card}>
        <div style={label}><Ic name="clipboard-list" size={14} color="#ea6b14" />Service agreement — required before payment</div>
        <div style={{ fontSize: ".82rem", lineHeight: 1.6, color: "rgba(var(--ff-muted), .85)", marginBottom: ".9rem" }}>
          This job needs a signed agreement before any money is collected. Review the agreement below, add anything you like, then sign to send it to your client for their signature.
        </div>

        {/* source toggle */}
        <div style={{ display: "flex", gap: ".5rem", marginBottom: ".9rem", flexWrap: "wrap" }}>
          {(["generated", "uploaded"] as const).map(sv => (
            <button key={sv} onClick={() => { setSource(sv); setErr(null); }} style={{ ...btn, background: source === sv ? "#ea6b14" : "rgba(var(--ff-fg), .06)", color: source === sv ? "#fff" : "var(--ff-text)", fontWeight: source === sv ? 700 : 500 }}>
              {sv === "generated" ? "Use the standard agreement" : "Upload my own document"}
            </button>
          ))}
        </div>

        {source === "generated" ? (
          <div style={{ maxHeight: 300, overflowY: "auto", padding: ".8rem 1rem", borderRadius: "10px", background: "rgba(var(--ff-fg), .03)", border: "1px solid rgba(var(--ff-fg), .1)", marginBottom: ".9rem" }}>
            {bodyForView ? renderMd(bodyForView) : <div style={{ fontSize: ".82rem", color: "rgba(var(--ff-muted), .6)" }}>Preparing your agreement…</div>}
          </div>
        ) : (
          <div style={{ marginBottom: ".9rem" }}>
            <input type="file" accept="application/pdf,image/*,.doc,.docx" onChange={e => { const f = e.target.files?.[0]; if (!f) return; if (f.size > 15 * 1024 * 1024) { setErr("That file is over 15 MB — please attach a smaller copy."); e.target.value = ""; return; } setErr(null); setFile(f); }} style={{ fontSize: ".85rem", color: "var(--ff-text)" }} />
            {(file || contract?.uploaded_path) && <div style={{ fontSize: ".8rem", color: "#22c55e", marginTop: ".4rem" }}><Ic name="check" size={12} style={{ marginRight: 4 }} />{file ? file.name : "Document attached"}</div>}
            <label style={{ display: "flex", gap: ".5rem", alignItems: "flex-start", marginTop: ".7rem", fontSize: ".8rem", lineHeight: 1.5, color: "rgba(var(--ff-muted), .9)", cursor: "pointer" }}>
              <input type="checkbox" checked={uploadAck} onChange={e => setUploadAck(e.target.checked)} style={{ marginTop: 3 }} />
              <span>I confirm this document is between me and my client only. It does not place any liability, obligation, or warranty on Freddy Fix It, and Freddy Fix It's standard terms and Alberta cancellation rights still apply.</span>
            </label>
          </div>
        )}

        {/* custom clauses */}
        <div style={{ marginBottom: ".9rem" }}>
          <div style={{ fontSize: ".8rem", fontWeight: 600, marginBottom: ".35rem", color: "var(--ff-text)" }}>Additional terms (optional)</div>
          <textarea value={clauses} onChange={e => setClauses(e.target.value)} rows={3} placeholder="e.g. warranty details, materials not included, access notes…" style={{ ...input, resize: "vertical" as const }} />
        </div>

        {/* sign */}
        <div style={{ borderTop: "1px solid rgba(var(--ff-fg), .1)", paddingTop: ".9rem" }}>
          <div style={{ fontSize: ".8rem", fontWeight: 600, marginBottom: ".35rem", color: "var(--ff-text)" }}>Sign as the contractor</div>
          <input value={sigName} onChange={e => setSigName(e.target.value)} placeholder="Type your full legal name" style={{ ...input, marginBottom: ".6rem" }} autoComplete="name" />
          <label style={{ display: "flex", gap: ".5rem", alignItems: "flex-start", fontSize: ".8rem", lineHeight: 1.5, color: "rgba(var(--ff-muted), .9)", cursor: "pointer", marginBottom: ".8rem" }}>
            <input type="checkbox" checked={consent} onChange={e => setConsent(e.target.checked)} style={{ marginTop: 3 }} />
            <span>I agree that typing my name is my legal electronic signature, and I consent to signing this agreement electronically.</span>
          </label>
          {err && <div style={{ fontSize: ".82rem", color: "#ef4444", marginBottom: ".6rem" }}>{err}</div>}
          {msg && <div style={{ fontSize: ".82rem", color: "#22c55e", marginBottom: ".6rem" }}>{msg}</div>}
          <button disabled={busy} onClick={contractorSign} style={{ ...btn, background: "#ea6b14", color: "#fff", opacity: busy ? .6 : 1 }}>
            {busy ? "Sending…" : "Sign & send to client"}
          </button>
        </div>
      </div>
    );
  }

  // ---------- CLIENT ----------
  if (role === "client") {
    if (status !== "sent") {
      return (
        <div style={card}>
          <div style={label}><Ic name="clipboard-list" size={14} color="#ea6b14" />Service agreement</div>
          <div style={{ fontSize: ".85rem", lineHeight: 1.6, color: "rgba(var(--ff-muted), .9)" }}>
            Your contractor is preparing the agreement for this job. You'll be asked to review and sign it here before any payment is collected — we'll email you when it's ready.
          </div>
        </div>
      );
    }
    return (
      <div style={{ ...card, borderColor: "rgba(234,107,20,.35)" }}>
        <div style={label}><Ic name="clipboard-list" size={14} color="#ea6b14" />Review & sign your agreement</div>
        <div style={{ fontSize: ".82rem", lineHeight: 1.6, color: "rgba(var(--ff-muted), .85)", marginBottom: ".8rem" }}>
          Your contractor signed on {fmt(contract?.contractor_signed_at)}. Please read the agreement, then add your signature. This is required before any payment.
        </div>

        {contract?.source === "uploaded" && (
          <div style={{ marginBottom: ".8rem" }}>
            <button style={{ ...btn, background: "rgba(var(--ff-fg), .08)", color: "var(--ff-text)" }} onClick={viewUpload}><Ic name="download" size={13} style={{ marginRight: 5 }} />View the contractor's document</button>
            <div style={{ fontSize: ".78rem", color: "rgba(var(--ff-muted), .7)", marginTop: ".4rem" }}>Freddy Fix It's standard terms and your Alberta cancellation rights (below) also apply.</div>
          </div>
        )}

        <div style={{ maxHeight: 320, overflowY: "auto", padding: ".8rem 1rem", borderRadius: "10px", background: "rgba(var(--ff-fg), .03)", border: "1px solid rgba(var(--ff-fg), .1)", marginBottom: ".9rem" }}>
          {bodyForView ? renderMd(bodyForView) : <div style={{ fontSize: ".82rem", color: "rgba(var(--ff-muted), .6)" }}>Agreement unavailable — please refresh.</div>}
          {contract?.custom_clauses && (
            <>
              <div style={{ fontSize: ".82rem", fontWeight: 700, textTransform: "uppercase" as const, letterSpacing: ".06em", color: "#ea6b14", margin: ".8rem 0 .3rem" }}>Additional terms (from the contractor)</div>
              {renderMd(contract.custom_clauses)}
            </>
          )}
        </div>

        <input value={sigName} onChange={e => setSigName(e.target.value)} placeholder="Type your full legal name" style={{ ...input, marginBottom: ".6rem" }} autoComplete="name" />
        <label style={{ display: "flex", gap: ".5rem", alignItems: "flex-start", fontSize: ".8rem", lineHeight: 1.5, color: "rgba(var(--ff-muted), .9)", cursor: "pointer", marginBottom: ".8rem" }}>
          <input type="checkbox" checked={consent} onChange={e => setConsent(e.target.checked)} style={{ marginTop: 3 }} />
          <span>I agree that typing my name is my legal electronic signature, and I consent to signing this agreement electronically.</span>
        </label>
        {err && <div style={{ fontSize: ".82rem", color: "#ef4444", marginBottom: ".6rem" }}>{err}</div>}
        {msg && <div style={{ fontSize: ".82rem", color: "#22c55e", marginBottom: ".6rem" }}>{msg}</div>}
        <button disabled={busy} onClick={clientSign} style={{ ...btn, background: "#22c55e", color: "#06210f", opacity: busy ? .6 : 1 }}>
          {busy ? "Signing…" : "Sign & accept agreement"}
        </button>
      </div>
    );
  }

  // ---------- ADMIN (read-only) ----------
  return (
    <div style={card}>
      <div style={label}><Ic name="clipboard-list" size={14} color="#ea6b14" />Service agreement — {status ?? "not started"}</div>
      {!contract && <div style={{ fontSize: ".85rem", color: "rgba(var(--ff-muted), .8)" }}>No agreement prepared yet.</div>}
      {contract && (
        <div style={{ fontSize: ".82rem", lineHeight: 1.7, color: "rgba(var(--ff-muted), .9)" }}>
          <div>Source: {contract.source === "uploaded" ? "contractor-supplied document" : "standard agreement"}</div>
          <div>Contractor: {contract.contractor_signed_at ? `signed ${fmt(contract.contractor_signed_at)}` : "not signed"}</div>
          <div>Client: {contract.client_signed_at ? `signed ${fmt(contract.client_signed_at)}` : "not signed"}</div>
          {contract.source === "uploaded" && contract.uploaded_path && (
            <button style={{ ...btn, background: "rgba(var(--ff-fg), .08)", color: "var(--ff-text)", marginTop: ".6rem" }} onClick={viewUpload}>View attached document</button>
          )}
        </div>
      )}
    </div>
  );
}
