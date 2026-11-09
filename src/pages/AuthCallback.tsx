import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { supabase } from "@/lib/supabase";
import { clearMyProfile } from "@/lib/myProfile";
import { stashedReferralCode, applyReferralAtSignup } from "@/lib/referralCode";
import { mfaOwed } from "@/lib/mfa";
import VerifyCodeModal from "@/components/VerifyCodeModal";

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
  const [phase, setPhase] = useState<"loading" | "choose" | "error" | "verify">("loading");
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState("Signing you in…");
  // The rest of the sign-in, parked while a two-step code is entered.
  //
  // Until 2026-11-04 this page had no MFA handling at all, so Google sign-in
  // walked straight past the second factor that /login enforces — the prompt
  // lived only in the password handler. That was two bugs in one: an enrolled
  // account was never challenged on the OAuth route, and because nothing here
  // refreshed `last_verified_at`, an admin who only ever signs in with Google
  // could never clear `admin_guard()` at all. He sat locked out of his own
  // dashboard with the fix on a screen he had no reason to visit.
  const [afterVerify, setAfterVerify] = useState<null | (() => void)>(null);

  const routeByRole = (role: string | null | undefined) => {
    if (role === "admin") setLocation("/admin-dashboard");
    else if (role === "contractor") setLocation("/contractor-dashboard");
    else setLocation("/client-dashboard");
  };

  useEffect(() => {
    let cancelled = false;
    const params = new URLSearchParams(window.location.search);
    const wantedRole = params.get("role"); // "client" | "contractor" | null

    // Everything that happens once we know who signed in. Split out of the IIFE
    // so the two-step prompt can park it and resume it verbatim — the routing
    // below must not run twice, and must not be skipped when it does run.
    const proceed = async (user: any) => {
      // The trigger creates the profile row; poll briefly in case it's a hair behind.
      let profile: { role: string } | null = null;
      for (let i = 0; i < 8 && !cancelled; i++) {
        // maybeSingle(), not single(): on the polls where the trigger hasn't landed
        // yet there is genuinely no row, and single() turns that expected case into
        // a logged error on every iteration.
        const { data } = await supabase.from("profiles").select("role").eq("id", user.id).maybeSingle();
        if (data) { profile = data as any; break; }
        await new Promise(r => setTimeout(r, 250));
      }
      if (cancelled) return;

      // Form-initiated sign-in: honor the chosen role.
      if (wantedRole === "contractor") {
        await supabase.from("profiles").update({ role: "contractor" }).eq("id", user.id);
        clearMyProfile();  // role just changed — the shared cache must not answer with the old one
        const { data: c } = await supabase.from("contractors").select("id").eq("id", user.id).maybeSingle();
        setLocation(c ? "/contractor-dashboard" : "/contractor-onboarding");
        return;
      }
      if (wantedRole === "client") {
        // role stays/clamps to client; new homeowners can post a request next.
        if (profile?.role === "admin" || profile?.role === "contractor") { routeByRole(profile.role); return; }
        // Apply a referral code stashed before the email-confirm hop. A refusal
        // is stashed, not shown: this is a redirect page with nowhere to put a
        // message, and holding up a sign-in over a referral code would be absurd.
        // The dashboard we're about to send them to reads it.
        await applyReferralAtSignup(stashedReferralCode());
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
    };

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

      // Second factor, on the OAuth route as well as the password one. The
      // session already exists by the time we get here — exactly as it does on
      // /login — so this prompt gates the UI, and `admin_guard()` / RLS remain
      // the gates that actually hold. mfaOwed() fails OPEN on a read error so a
      // network blip can never strand someone on this page.
      if (await mfaOwed()) {
        if (cancelled) return;
        // setState with a function argument would CALL it; the extra arrow is
        // what stores the continuation instead of invoking it.
        setAfterVerify(() => () => { setPhase("loading"); void proceed(user); });
        setPhase("verify");
        return;
      }
      if (cancelled) return;
      await proceed(user);
    })();

    return () => { cancelled = true; };
  }, []);

  const choose = async (role: "client" | "contractor") => {
    setSaving(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setLocation("/login"); return; }
    await supabase.from("profiles").update({ role }).eq("id", user.id);
    clearMyProfile();  // role just changed — the shared cache must not answer with the old one
    localStorage.setItem("ff_role_chosen", "1");
    if (role === "contractor") setLocation("/contractor-onboarding");
    else setLocation("/client-dashboard");
  };

  const s: Record<string, React.CSSProperties> = {
    wrap: { minHeight: "100vh", background: "var(--ff-bg)", backgroundImage: "radial-gradient(ellipse 80% 50% at 50% -10%, rgba(var(--ff-accent-rgb), 0.15) 0%, transparent 70%)", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "2rem 1rem", fontFamily: "'DM Sans',sans-serif", color: "var(--ff-text)" },
    card: { maxWidth: "440px", width: "100%", background: "rgba(var(--ff-fg), .04)", border: "var(--ff-hair-w) solid rgba(var(--ff-fg), .08)", borderRadius: "14px", padding: "2rem", textAlign: "center" },
    h: { fontFamily: "'Bebas Neue',sans-serif", fontSize: "2rem", letterSpacing: ".05em", marginBottom: ".4rem" },
    sub: { fontSize: ".88rem", color: "rgba(var(--ff-muted), .6)", fontWeight: 300, marginBottom: "1.75rem", lineHeight: 1.6 },
    opt: { width: "100%", padding: "1.1rem 1.25rem", borderRadius: "10px", border: "var(--ff-hair-w) solid rgba(var(--ff-fg), .12)", background: "rgba(var(--ff-fg), .04)", color: "var(--ff-text)", cursor: "pointer", fontFamily: "inherit", textAlign: "left", marginBottom: ".75rem", transition: "background .2s var(--ff-ease-out), border-color .2s var(--ff-ease-out)" },
    optTitle: { fontSize: "1rem", fontWeight: 500, marginBottom: "var(--ff-s1)" },
    optSub: { fontSize: ".8rem", color: "rgba(var(--ff-muted), .55)", fontWeight: 300 },
  };

  // Backing out of the code leaves a half-finished sign-in, so send them back to
  // /login rather than to a dashboard they haven't cleared the factor for.
  const cancelVerify = async () => {
    await supabase.auth.signOut();
    clearMyProfile();
    setLocation("/login");
  };

  return (
    <div style={s.wrap}>
      <link href="https://fonts.googleapis.com/css2?family=Bebas+Neue&family=DM+Sans:wght@300;400;500&display=swap" rel="stylesheet" />
      <style>{"@keyframes ff-spin{to{transform:rotate(360deg)}}"}</style>
      {phase === "verify" && (
        <VerifyCodeModal
          what="finishing your sign-in"
          onDone={() => { const go = afterVerify; setAfterVerify(null); if (go) go(); }}
          onCancel={cancelVerify}
        />
      )}
      <div style={s.card}>
        {/* The card stays behind the verify modal so the page isn't a blank
            rectangle if the modal is dismissed by the browser. */}
        {(phase === "loading" || phase === "verify") && (
          <>
            <div style={{ width: 36, height: 36, margin: "0 auto 1.25rem", border: "3px solid rgba(var(--ff-accent-rgb), 0.2)", borderTopColor: "var(--ff-c10)", borderRadius: "50%", animation: "ff-spin .8s linear infinite" }} />
            <p style={{ color: "rgba(var(--ff-muted), .7)", fontWeight: 300 }}>
              {phase === "verify" ? "Waiting on your sign-in code…" : msg}
            </p>
          </>
        )}
        {phase === "choose" && (
          <>
            <div style={s.h}>Welcome! One quick thing…</div>
            <p style={s.sub}>How will you be using Freddy Fix It?</p>
            {/* No scoped stylesheet on this page, so the busy state is inline. */}
            <button style={{ ...s.opt, opacity: saving ? .6 : 1, cursor: saving ? "not-allowed" : "pointer" }} disabled={saving} onClick={() => choose("client")}>
              <div style={s.optTitle}>🏠 I'm a homeowner</div>
              <div style={s.optSub}>I want to hire contractors for jobs around my home.</div>
            </button>
            <button style={{ ...s.opt, opacity: saving ? .6 : 1, cursor: saving ? "not-allowed" : "pointer" }} disabled={saving} onClick={() => choose("contractor")}>
              <div style={s.optTitle}>🔧 I'm a contractor</div>
              <div style={s.optSub}>I want to receive job leads and grow my business.</div>
            </button>
          </>
        )}
        {phase === "error" && (
          <>
            <div style={s.h}>Sign-in didn't finish</div>
            <p style={s.sub}>Something interrupted the sign-in. Please try again.</p>
            <button style={{ ...s.opt, textAlign: "center", background: "var(--ff-c10)", borderColor: "var(--ff-c10)", fontWeight: 500 }} onClick={() => setLocation("/login")}>
              Back to sign in
            </button>
          </>
        )}
      </div>
    </div>
  );
}
