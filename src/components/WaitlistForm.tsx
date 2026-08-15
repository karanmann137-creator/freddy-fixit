import { useState } from "react";
import { supabase } from "@/lib/supabase";
import { validateEmail, validatePhone } from "@/lib/emailValidation";
import { usePlatformStatus } from "@/lib/platformStatus";

/**
 * Waitlist capture, shown instead of the job-request form while the platform is
 * in `waitlist` or `paused` mode.
 *
 * Writes straight to `public.waitlist` — the table's INSERT policy is
 * `with check true` for anon + authenticated, so no RPC wrapper is needed. Only
 * an admin can read it back (`admin_list_waitlisted`).
 *
 * Nothing here creates an account, a client_request or a job. That is the whole
 * point of waitlist mode: capture interest without putting work in front of
 * contractors we can't yet serve.
 */

type Props = {
  /** Prefills so someone who already typed their problem doesn't retype it. */
  initialService?: string;
  initialDescription?: string;
  initialEmail?: string;
  initialName?: string;
  /** Where this form was shown — helps the owner see which surface converts. */
  source?: string;
  /** Rendered above the form; defaults to the notice configured in the DB. */
  compact?: boolean;
};

export default function WaitlistForm({
  initialService = "",
  initialDescription = "",
  initialEmail = "",
  initialName = "",
  source = "paused_onboarding",
  compact = false,
}: Props) {
  const { status } = usePlatformStatus();

  const [name, setName] = useState(initialName);
  const [email, setEmail] = useState(initialEmail);
  const [phone, setPhone] = useState("");
  const [service, setService] = useState(initialService);
  const [description, setDescription] = useState(initialDescription);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr("");

    const ec = validateEmail(email);
    if (!ec.ok) {
      setErr(ec.suggestion ? `${ec.error} Did you mean ${ec.suggestion}?` : (ec.error || "Please enter a valid email."));
      return;
    }
    const pc = validatePhone(phone, false);
    if (!pc.ok) { setErr(pc.error || "Please check that phone number."); return; }

    setBusy(true);
    try {
      const { error } = await supabase.from("waitlist").insert({
        name: name.trim() || null,
        email: email.trim().toLowerCase(),
        phone: phone.trim() || null,
        service: service.trim() || null,
        description: description.trim() || null,
        source,
      });
      if (error) throw error;
      setDone(true);
    } catch (e: any) {
      setErr(e?.message || "Something went wrong. Please try again.");
      setBusy(false);
    }
  }

  const card: React.CSSProperties = {
    background: "rgba(var(--ff-fg), .04)",
    border: "1px solid rgba(234,107,20,.3)",
    borderRadius: "16px",
    padding: compact ? "1.2rem 1.1rem" : "1.6rem 1.5rem",
    fontFamily: "'DM Sans', sans-serif",
    color: "var(--ff-text)",
    maxWidth: "560px",
    margin: "0 auto",
  };
  const label: React.CSSProperties = {
    display: "block", fontSize: ".8rem", fontWeight: 600,
    color: "rgb(var(--ff-muted))", margin: "0 0 .35rem",
  };
  const input: React.CSSProperties = {
    width: "100%", padding: ".7rem .8rem", borderRadius: "10px",
    border: "1px solid rgba(var(--ff-fg), .16)", background: "rgba(var(--ff-fg), .04)",
    color: "var(--ff-text)", fontFamily: "inherit", fontSize: ".92rem",
  };
  const field: React.CSSProperties = { marginBottom: ".9rem" };

  if (done) {
    return (
      <div style={{ ...card, textAlign: "center" }}>
        <div style={{ fontSize: "2.2rem", lineHeight: 1, marginBottom: ".6rem" }}>✓</div>
        <h3 style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: "1.6rem", letterSpacing: ".02em", margin: "0 0 .5rem" }}>
          You're on the list
        </h3>
        <p style={{ fontSize: ".92rem", color: "rgb(var(--ff-muted))", lineHeight: 1.55, margin: 0 }}>
          We'll email you at <strong style={{ color: "var(--ff-text)" }}>{email.trim().toLowerCase()}</strong> the
          moment we start taking job requests again. Nothing else will be sent to you in the meantime.
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={submit} style={card}>
      <h3 style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: compact ? "1.5rem" : "1.8rem", letterSpacing: ".02em", margin: "0 0 .5rem" }}>
        {status.notice.headline}
      </h3>
      <p style={{ fontSize: ".9rem", color: "rgb(var(--ff-muted))", lineHeight: 1.6, margin: "0 0 1.2rem" }}>
        {status.notice.body}
      </p>

      <div style={field}>
        <label style={label} htmlFor="wl-name">Your name <span style={{ fontWeight: 400 }}>(optional)</span></label>
        <input id="wl-name" style={input} value={name} onChange={e => setName(e.target.value)} autoComplete="name" placeholder="Alex" />
      </div>

      <div style={field}>
        <label style={label} htmlFor="wl-email">Email</label>
        <input id="wl-email" style={input} type="email" required value={email} onChange={e => setEmail(e.target.value)} autoComplete="email" placeholder="you@example.com" />
      </div>

      <div style={field}>
        <label style={label} htmlFor="wl-phone">Phone <span style={{ fontWeight: 400 }}>(optional)</span></label>
        <input id="wl-phone" style={input} type="tel" value={phone} onChange={e => setPhone(e.target.value)} autoComplete="tel" placeholder="403-555-0100" />
      </div>

      <div style={field}>
        <label style={label} htmlFor="wl-service">What do you need done? <span style={{ fontWeight: 400 }}>(optional)</span></label>
        <input id="wl-service" style={input} value={service} onChange={e => setService(e.target.value)} placeholder="Plumbing, handyman, furnace…" />
      </div>

      <div style={{ ...field, marginBottom: "1.1rem" }}>
        <label style={label} htmlFor="wl-desc">Anything else we should know? <span style={{ fontWeight: 400 }}>(optional)</span></label>
        <textarea id="wl-desc" style={{ ...input, minHeight: "84px", resize: "vertical" }} value={description} onChange={e => setDescription(e.target.value)} placeholder="A short description of the job." />
      </div>

      {err && (
        <p style={{ fontSize: ".85rem", color: "#ef4444", margin: "0 0 .8rem", lineHeight: 1.45 }}>{err}</p>
      )}

      <button
        type="submit"
        disabled={busy}
        style={{
          width: "100%", padding: ".85rem 1rem", background: "#ea6b14", color: "#fff",
          border: "none", borderRadius: "10px", fontFamily: "inherit", fontWeight: 700,
          fontSize: ".95rem", cursor: busy ? "default" : "pointer", opacity: busy ? .7 : 1,
        }}
      >
        {busy ? "Adding you…" : status.notice.cta}
      </button>

      <p style={{ fontSize: ".76rem", color: "rgb(var(--ff-muted))", margin: ".8rem 0 0", lineHeight: 1.5, textAlign: "center" }}>
        We'll only use this to tell you when we reopen. You can ask us to remove
        you any time at hello@freddyfixit.ca.
      </p>
    </form>
  );
}
