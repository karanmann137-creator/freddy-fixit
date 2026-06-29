import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { supabase } from "@/lib/supabase";

// Lands here after (a) a Google/Apple OAuth round-trip, or (b) an email
// confirmation link. Supabase parses the session out of the URL automatically.
//
// Role handling:
//   - If the user arrived from a form (redirect carried ?role=client|contractor),
//     we set that role and send them on.
//   - If they arrived from the form-less Login (no role) AND the account looks
//     brand new (default 'client', no request / contractor row yet), we ask them
//     to choose Homeowner vs Contractor.
//   - Established accounts skip the chooser and go straight to their dashboard.
export default function AuthCallback() {
  const [, setLocation] = useLocation();
  const [phase, setPhase] = useState<"loading" | "choose" | "error">("loading");
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState("Signing you in…");

  const routeByRole = (role: string | null | undefined) => {
    if (role === "admin") setLocation("/admin-dashboard");
    else if (role === "contractor") setLocation("/contractor-dashboard");
    else setLocation("/client-dashboard");
  };

  useEffect(() => {
    let cancelled = false;
    const params = new URLSearchParams(window.location.search);
    const wantedRole = params.get("role"); // "client" | "contractor" | null

    (async () => {
      // Give Supabase a moment to exchange the URL token for a session.
      let user = null;
      for (let i = 0; i < 10 && !cancelled; i++) {
        const { data } = await supabase.auth.getUser();
        if (data.user) { user = data.user; break; }
        await new Promise(r => setTimeout(r, 250));
      }
      if (cancelled) return;
      if (!user) { setMsg("We couldn't complete sign-in."); setPhase("error"); return; }

      // The trigger creates the profile row; poll briefly in case it's a hair behind.
      let profile: { role: string } | null = null;
      for (let i = 0; i < 8 && !cancelled; i++) {
        const { data } = await supabase.from("profiles").select("role").eq("id", user.id).single();
        if (data) { profile = data as any; break; }
        await new Promise(r => setTimeout(r, 250));
      }
      if (cancelled) return;

      // Form-initiated sign-in: honor the chosen role.
      if (wantedRole === "contractor") {
        await supabase.from("profiles").update({ role: "contractor" }).eq("id", user.id);
        const { data: c } = await supabase.from("contractors").select("id").eq("id", user.id).maybeSingle();
        setLocation(c ? "/contractor-dashboard" : "/contractor-onboarding");
        return;
      }
      if (wantedRole === "client") {
        // role stays/clamps to client; new homeowners can post a request next.
        if (profile?.role === "admin" || profile?.role === "contractor") { routeByRole(profile.role); return; }
        setLocation("/client-dashboard");
        return;
      }

      // No role in the URL (form-less Login). Established accounts skip the chooser.
      if (profile?.role === "admin" || profile?.role === "contractor") { routeByRole(profile.role); return; }
      if (localStorage.getItem("ff_role_chosen")) { routeByRole(profile?.role ?? "client"); return; }

      const [{ data: reqs }, { data: con }] = await Promise.all([
        supabase.from("client_requests").select("id").eq("user_id", user.id).limit(1),
        supabase.from("contractors").select("id").eq("id", user.id).maybeSingle(),
      ]);
      if (cancelled) return;
      if ((reqs && reqs.length > 0) || con) { routeByRole(profile?.role ?? "client"); return; }

      // Brand-new account with no history — ask what they're here for.
      setPhase("choose");
    })();

    return () => { cancelled = true; };
  }, []);

  const choose = async (role: "client" | "contractor") => {
    setSaving(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setLocation("/login"); return; }
    await supabase.from("profiles").update({ role }).eq("id", user.id);
    localStorage.setItem("ff_role_chosen", "1");
    if (role === "contractor") setLocation("/contractor-onboarding");
    else setLocation("/client-dashboard");
  };

  const s: Record<string, React.CSSProperties> = {
    wrap: { minHeight: "100vh", background: "var(--ff-bg)", backgroundImage: "radial-gradient(ellipse 80% 50% at 50% -10%, rgba(234,107,20,0.15) 0%, transparent 70%)", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "2rem 1rem", fontFamily: "'DM Sans',sans-serif", color: "var(--ff-text)" },
    card: { maxWidth: "440px", width: "100%", background: "rgba(var(--ff-fg), .04)", border: "1px solid rgba(var(--ff-fg), .08)", borderRadius: "14px", padding: "2rem", textAlign: "center" },
    h: { fontFamily: "'Bebas Neue',sans-serif", fontSize: "2rem", letterSpacing: ".05em", marginBottom: ".4rem" },
    sub: { fontSize: ".88rem", color: "rgba(var(--ff-muted), .6)", fontWeight: 300, marginBottom: "1.75rem", lineHeight: 1.6 },
    opt: { width: "100%", padding: "1.1rem 1.25rem", borderRadius: "10px", border: "1px solid rgba(var(--ff-fg), .12)", background: "rgba(var(--ff-fg), .04)", color: "var(--ff-text)", cursor: "pointer", fontFamily: "inherit", textAlign: "left", marginBottom: ".75rem", transition: "all .2s" },
    optTitle: { fontSize: "1rem", fontWeight: 500, marginBottom: ".2rem" },
    optSub: { fontSize: ".8rem", color: "rgba(var(--ff-muted), .55)", fontWeight: 300 },
  };

  return (
    <div style={s.wrap}>
      <link href="https://fonts.googleapis.com/css2?family=Bebas+Neue&family=DM+Sans:wght@300;400;500&display=swap" rel="stylesheet" />
      <style>{"@keyframes ff-spin{to{transform:rotate(360deg)}}"}</style>
      <div style={s.card}>
        {phase === "loading" && (
          <>
            <div style={{ width: 36, height: 36, margin: "0 auto 1.25rem", border: "3px solid rgba(234,107,20,0.2)", borderTopColor: "#ea6b14", borderRadius: "50%", animation: "ff-spin .8s linear infinite" }} />
            <p style={{ color: "rgba(var(--ff-muted), .7)", fontWeight: 300 }}>{msg}</p>
          </>
        )}
        {phase === "choose" && (
          <>
            <div style={s.h}>Welcome! One quick thing…</div>
            <p style={s.sub}>How will you be using Freddy Fix It?</p>
            <button style={s.opt} disabled={saving} onClick={() => choose("client")}>
              <div style={s.optTitle}>🏠 I'm a homeowner</div>
              <div style={s.optSub}>I want to hire contractors for jobs around my home.</div>
            </button>
            <button style={s.opt} disabled={saving} onClick={() => choose("contractor")}>
              <div style={s.optTitle}>🔧 I'm a contractor</div>
              <div style={s.optSub}>I want to receive job leads and grow my business.</div>
            </button>
          </>
        )}
        {phase === "error" && (
          <>
            <div style={s.h}>Sign-in didn't finish</div>
            <p style={s.sub}>Something interrupted the sign-in. Please try again.</p>
            <button style={{ ...s.opt, textAlign: "center", background: "#ea6b14", borderColor: "#ea6b14", fontWeight: 500 }} onClick={() => setLocation("/login")}>
              Back to sign in
            </button>
          </>
        )}
      </div>
    </div>
  );
}
