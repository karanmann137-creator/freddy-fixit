// Site-wide footer — the same footer that used to live only on the home page.
// Styles are inline (not a CSS class) so it renders identically on every page,
// regardless of which page-level <style> blocks are present. Rendered once,
// globally, from App.tsx beneath the router.
import { useState } from "react";
import { useLocation } from "wouter";
import { supabase } from "../lib/supabase";

function NewsletterSignup() {
  const [email, setEmail] = useState("");
  const [audience, setAudience] = useState<"client" | "contractor">("client");
  const [state, setState] = useState<"idle" | "busy" | "done" | "err">("idle");

  const submit = async () => {
    const e = email.trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)) { setState("err"); return; }
    setState("busy");
    try {
      const { error } = await supabase.rpc("newsletter_subscribe", {
        p_email: e, p_audience: audience, p_name: null, p_source: "footer_form",
      });
      setState(error ? "err" : "done");
    } catch {
      setState("err");
    }
  };

  if (state === "done") {
    return (
      <div style={{ maxWidth: "440px", margin: "0 auto 1.5rem", padding: ".9rem 1rem", background: "rgba(34,197,94,.08)", border: "1px solid rgba(34,197,94,.25)", borderRadius: "10px", fontSize: ".82rem", color: "#22c55e" }}>
        ✓ You&rsquo;re on the list — first tips email lands this week. Unsubscribe anytime.
      </div>
    );
  }

  const toggle = (v: "client" | "contractor", label: string) => (
    <button
      type="button"
      onClick={() => setAudience(v)}
      style={{
        flex: 1, padding: ".45rem .6rem", borderRadius: "6px", fontSize: ".75rem", fontWeight: 600, cursor: "pointer",
        fontFamily: "'DM Sans', sans-serif",
        background: audience === v ? "rgba(234,107,20,.15)" : "transparent",
        border: audience === v ? "1px solid rgba(234,107,20,.5)" : "1px solid rgba(var(--ff-fg), .12)",
        color: audience === v ? "#ea6b14" : "rgba(var(--ff-muted), .5)",
      }}
    >
      {label}
    </button>
  );

  return (
    <div style={{ maxWidth: "440px", margin: "0 auto 1.5rem", padding: "1rem 1.1rem", background: "rgba(var(--ff-fg), .03)", border: "1px solid rgba(var(--ff-fg), .08)", borderRadius: "10px", textAlign: "left" }}>
      <div style={{ fontSize: ".85rem", fontWeight: 600, color: "rgba(var(--ff-muted), .75)", marginBottom: ".2rem" }}>
        Free weekly Calgary tips 🛠️
      </div>
      <div style={{ fontSize: ".72rem", color: "rgba(var(--ff-muted), .45)", lineHeight: 1.55, marginBottom: ".65rem" }}>
        One useful email a week — home &amp; vehicle care for homeowners, business tips for pros. Unsubscribe anytime.
      </div>
      <div style={{ display: "flex", gap: ".4rem", marginBottom: ".55rem" }}>
        {toggle("client", "I'm a homeowner")}
        {toggle("contractor", "I'm a pro")}
      </div>
      <div style={{ display: "flex", gap: ".4rem" }}>
        <input
          type="email"
          value={email}
          onChange={e => { setEmail(e.target.value); if (state === "err") setState("idle"); }}
          onKeyDown={e => { if (e.key === "Enter") submit(); }}
          placeholder="you@email.com"
          autoComplete="email"
          style={{ flex: 1, minWidth: 0, padding: ".55rem .7rem", borderRadius: "6px", border: "1px solid rgba(var(--ff-fg), .14)", background: "rgba(var(--ff-fg), .04)", color: "var(--ff-text)", fontSize: ".82rem", fontFamily: "'DM Sans', sans-serif", outline: "none" }}
        />
        <button
          type="button"
          onClick={submit}
          disabled={state === "busy"}
          style={{ background: "#ea6b14", color: "#fff", border: "none", borderRadius: "6px", padding: ".55rem .9rem", fontSize: ".8rem", fontWeight: 600, cursor: "pointer", fontFamily: "'DM Sans', sans-serif", opacity: state === "busy" ? 0.6 : 1, whiteSpace: "nowrap" }}
        >
          {state === "busy" ? "…" : "Sign up"}
        </button>
      </div>
      {state === "err" && (
        <div style={{ fontSize: ".72rem", color: "var(--ff-danger)", marginTop: ".45rem" }}>
          Please enter a valid email address and try again.
        </div>
      )}
    </div>
  );
}

export default function Footer() {
  // During onboarding, keep the footer minimal: no newsletter form, no service /
  // blog link grid — just contact + the legal links (the terms checkbox points
  // at User Agreement / Privacy Policy, so those must stay reachable).
  const [loc] = useLocation();
  const onOnboarding = ["/client-onboarding", "/contractor-onboarding"].some(p => loc === p || loc.startsWith(p + "/"));
  const bar: React.CSSProperties = {
    background: "var(--ff-surface-2)",
    borderTop: "1px solid rgba(var(--ff-fg), 0.06)",
    padding: "2rem 1.5rem",
    textAlign: "center",
    fontSize: "0.75rem",
    color: "rgba(var(--ff-muted), 0.25)",
    letterSpacing: "0.05em",
    fontFamily: "'DM Sans', sans-serif",
  };
  const link: React.CSSProperties = { color: "rgba(var(--ff-muted), .45)", textDecoration: "underline" };

  return (
    <div style={bar}>
      <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@300;400;500&display=swap" rel="stylesheet" />
      {!onOnboarding && <NewsletterSignup />}
      <div style={{ fontSize: "1rem", fontWeight: 500, color: "rgba(var(--ff-muted), 0.6)", marginBottom: "0.75rem" }}>
        Contact us: <a href="mailto:hello@freddyfixit.ca" style={{ color: "#ea6b14", textDecoration: "none" }}>hello@freddyfixit.ca</a>
        <span style={{ color: "rgba(var(--ff-muted), 0.35)", margin: "0 .5rem" }}>·</span>
        <a href={"mailto:hello@freddyfixit.ca?subject=" + encodeURIComponent("🐞 Bug report — Freddy Fix It")} style={{ color: "#ea6b14", textDecoration: "none" }}>Report a bug</a>
      </div>
      <div>Home Repairs · Vehicle Maintenance · Trusted Tradespeople</div>
      {!onOnboarding && <div style={{ marginTop: "0.85rem", fontSize: "0.72rem", maxWidth: "760px", margin: "0.85rem auto 0", lineHeight: 1.9 }}>
        {[
          ["Handyman", "handyman"], ["Plumbers", "plumbing"], ["Electricians", "electrical"],
          ["HVAC & Furnace", "hvac"], ["Painters", "painting"], ["Drywall & Flooring", "drywall-flooring"],
          ["Landscaping", "landscaping"], ["Snow Removal", "snow-removal"], ["Roofing & Siding", "siding-roofing"],
          ["Concrete", "concrete-masonry"], ["Appliance Repair", "appliance-repair"], ["Vehicle Maintenance", "vehicle-maintenance"],
        ].map(([label, slug], i) => (
          <span key={slug}>
            {i > 0 ? " · " : ""}
            <a href={"/services/" + slug} style={link}>{label} Calgary</a>
          </span>
        ))}
        {" · "}<a href="/services" style={link}>All services</a>{" · "}<a href="/for-contractors" style={link}>For Contractors</a>{" · "}<a href="/blog" style={link}>Blog</a>
      </div>}
      <div style={{ marginTop: "0.75rem", fontSize: "0.65rem", color: "rgba(var(--ff-muted), 0.2)", maxWidth: "700px", margin: "0.75rem auto 0", lineHeight: 1.6 }}>
        Freddy Fix It is a platform that connects clients with independent contractors. We are not liable for any damages, defects, injury, or loss arising from services booked through this platform. All contractors are independent professionals. Use of this platform constitutes acceptance of our{" "}
        <a href="/user-agreement" target="_blank" rel="noopener noreferrer" style={link}>User Agreement</a>,{" "}
        <a href="/privacy-policy" target="_blank" rel="noopener noreferrer" style={link}>Privacy Policy</a>,{" "}and{" "}
        <a href="/homeowner-protection-promise" target="_blank" rel="noopener noreferrer" style={link}>Homeowner Protection Promise</a>.
      </div>
    </div>
  );
}
