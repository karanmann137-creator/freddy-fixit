/**
 * The client's referral code, and the box for redeeming a friend's.
 *
 * This used to sit on the ClientDashboard Requests tab, which is the tab a
 * client opens to act on a job already in flight — pick a pro, sign, pay,
 * confirm. A promotion competing with those is a promotion in the wrong place,
 * and it was on screen permanently. It now lives in exactly two moments: here,
 * where somebody has come looking for it, and the completion prompt after a
 * finished job, where the favour is being asked right after one was delivered.
 *
 * It is SELF-CONTAINED on purpose — it does its own `get_my_referral` read and
 * owns both actions — so mounting it costs the host nothing and no second copy
 * of this logic can drift from this one. That matters more than usual here:
 * `SettingsPanel` is rendered both as a ClientDashboard tab and inside
 * `SettingsModal` from TopNav, so this component has two mount points already.
 *
 * It must not assume dark tokens. `SettingsModal` is deliberately rendered
 * OUTSIDE the nav's `.ff-on-dark` wrapper, so everything here resolves through
 * the page's own `--ff-*` values.
 *
 * A FAILED READ IS NOT AN EMPTY RESULT. A read that errors says so and offers a
 * retry rather than rendering nothing, because "nothing" here is
 * indistinguishable from "you have no code" — and every client has a code.
 */

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { Ic } from "@/components/Ic";
import { referralReasonText, takeReferralError } from "@/lib/referralCode";

type Msg = { ok: boolean; text: string } | null;

export default function ReferralCard() {
  const [referral, setReferral] = useState<any>(null);
  const [state, setState]       = useState<"loading" | "ok" | "failed">("loading");
  const [copied, setCopied]     = useState(false);
  const [input, setInput]       = useState("");
  const [busy, setBusy]         = useState(false);
  const [msg, setMsg]           = useState<Msg>(null);

  const load = async () => {
    setState("loading");
    try {
      const { data, error } = await supabase.rpc("get_my_referral");
      if (error) throw error;
      setReferral(data ?? null);
      setState("ok");
    } catch { setState("failed"); }
  };

  useEffect(() => {
    void load();
    // A code refused during signup was stashed rather than shown, because
    // neither signup call site has anywhere to show it. This is that box, so
    // this is where the explanation belongs — read-and-clear, so it appears
    // once and doesn't re-fire on every visit to Settings.
    const stashed = takeReferralError();
    if (stashed) setMsg({ ok: false, text: stashed });
  }, []);

  const card: React.CSSProperties = {
    background: "rgba(234,107,20,.06)", border: "1px solid rgba(234,107,20,.22)",
    borderRadius: "12px", padding: "1rem 1.05rem", marginBottom: "1.1rem",
  };
  const title: React.CSSProperties = {
    fontFamily: "'DM Sans',sans-serif", fontSize: ".72rem", letterSpacing: ".08em",
    textTransform: "uppercase", color: "rgb(var(--ff-muted))", margin: "0 0 .6rem", fontWeight: 600,
  };
  const body: React.CSSProperties = {
    fontSize: ".85rem", color: "rgb(var(--ff-muted))", margin: 0, lineHeight: 1.5,
  };
  const pill: React.CSSProperties = {
    padding: ".5rem .85rem", borderRadius: "10px", border: "1px solid rgba(var(--ff-fg), .16)",
    background: "rgba(var(--ff-fg), .05)", color: "var(--ff-text)",
    fontFamily: "inherit", fontSize: ".82rem", fontWeight: 600, cursor: "pointer",
  };

  if (state === "loading") return null;

  if (state === "failed") {
    return (
      <div style={{ ...card, background: "rgba(var(--ff-fg), .04)", border: "1px solid rgba(var(--ff-fg), .1)" }}>
        <p style={title}>Invite a friend</p>
        <p style={body}>We couldn't load your referral code just now.</p>
        <button type="button" onClick={() => void load()} style={{ ...pill, marginTop: ".7rem" }}>Try again</button>
      </div>
    );
  }

  if (!referral?.code) return null;

  const codeStatus = String(referral.code_status ?? "active");
  const retired    = codeStatus === "retired";
  const inUse      = codeStatus === "in_use";
  let rewardedOn = "";
  try {
    if (referral.rewarded_at) {
      rewardedOn = new Date(referral.rewarded_at).toLocaleDateString("en-CA", { month: "long", day: "numeric", year: "numeric" });
    }
  } catch { /* the sentence just omits the date */ }

  const copy = async () => {
    const code = referral.code;
    try {
      await navigator.clipboard.writeText(
        "Get your first Freddy Fix It service fee waived with my code " + code + ": https://freddyfixit.ca/?ref=" + code
      );
      setCopied(true); setTimeout(() => setCopied(false), 2000);
    } catch {
      setMsg({ ok: false, text: "Couldn't copy automatically — your code is " + code + ", shown above." });
    }
  };

  // Every rule (unknown code, your own code, already referred, retired, in use)
  // is enforced in apply_referral_code, which is SECURITY DEFINER and keyed on
  // auth.uid(). This only turns its reason codes into English — nothing here
  // decides eligibility, so a client cannot talk their way into a waived fee.
  const apply = async () => {
    const code = input.trim().toUpperCase();
    if (!code || busy) return;
    setBusy(true); setMsg(null);
    try {
      const { data, error } = await supabase.rpc("apply_referral_code", { p_code: code });
      if (error) throw error;
      const res = data as any;
      if (res?.ok === true) {
        setInput("");
        setMsg({ ok: true, text: "Code applied — your 3% service fee is waived on your first job." });
        // Re-read so the entry box disappears. The live fee line on an unpaid
        // job is NOT refreshed from here: that panel is on another tab and may
        // not be mounted, and it re-derives the waiver on its next load anyway.
        void load();
      } else {
        // The same wording the signup path stashes, from the same map — a code
        // refused at signup and the same code refused here must not be
        // explained two different ways.
        setMsg({ ok: false, text: referralReasonText(String(res?.reason ?? "")) });
      }
    } catch {
      setMsg({ ok: false, text: "Couldn't apply that code just now. Please try again." });
    } finally { setBusy(false); }
  };

  return (
    <div style={card}>
      <p style={title}>{retired ? "Friend referred" : "Invite a friend, they save"}</p>

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: ".9rem", flexWrap: "wrap" }}>
        <div style={{ minWidth: 0, flex: "1 1 12rem" }}>
          <p style={body}>
            {retired ? (
              <>You referred a friend and they booked their first job{rewardedOn ? " on " + rewardedOn : ""} — we covered their <strong style={{ color: "var(--ff-text)" }}>3% service fee</strong>. Your code has done its job, so it's retired. Thanks for the introduction.</>
            ) : inUse ? (
              <>A friend has your code right now. Each code is good for <strong style={{ color: "var(--ff-text)" }}>one friend</strong>, so it's on hold until they book — and if they haven't within 30 days it frees up on its own.</>
            ) : (
              <>Your code waives the <strong style={{ color: "var(--ff-text)" }}>3% service fee on a friend's first job</strong>. It's good for <strong style={{ color: "var(--ff-text)" }}>one friend</strong> — once they book, the code retires and you keep the badge.</>
            )}
          </p>
        </div>

        {/* The copy button is hidden in the last two states on purpose: sharing
            a code that will be refused is a dead end the sharer can't see. */}
        {retired ? (
          <div style={{ textAlign: "center", padding: ".6rem 1.1rem", border: "1px solid rgba(34,197,94,.42)", background: "rgba(34,197,94,.12)", borderRadius: "12px" }}>
            <div style={{ marginBottom: ".2rem" }}><Ic name="user-check" size={26} color="#22c55e" /></div>
            <div style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: "1.05rem", letterSpacing: ".08em", color: "#22c55e", lineHeight: 1.1 }}>Friend Referred</div>
          </div>
        ) : (
          <div style={{ textAlign: "center" }}>
            <div style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: "1.8rem", letterSpacing: ".12em", color: "#ea6b14", border: "1px dashed rgba(234,107,20,.5)", borderRadius: "10px", padding: ".35rem .9rem", ...(inUse ? { opacity: .45 } : {}) }}>{referral.code}</div>
            {inUse ? (
              <div style={{ marginTop: ".5rem", fontSize: ".74rem", color: "rgb(var(--ff-muted))" }}>On hold with a friend</div>
            ) : (
              <button
                type="button"
                onClick={() => void copy()}
                style={{ ...pill, marginTop: ".45rem", fontSize: ".78rem", ...(copied ? { color: "#22c55e", borderColor: "rgba(34,197,94,.4)", background: "rgba(34,197,94,.1)" } : {}) }}
              >{copied ? "Copied ✓" : "Copy invite link"}</button>
            )}
          </div>
        )}
      </div>

      {/* Only offered to someone who hasn't been referred yet. Once
          apply_referral_code succeeds it refuses a second code, so leaving the
          box up would just be a button that always fails. */}
      {!referral.i_was_referred && (
        <div style={{ marginTop: ".9rem", paddingTop: ".85rem", borderTop: "1px solid rgba(var(--ff-fg), .1)" }}>
          <p style={{ ...body, marginBottom: ".5rem" }}>
            Got a code from a friend? Enter it before your first job and we'll waive your 3% service fee.
          </p>
          <div style={{ display: "flex", gap: ".5rem", flexWrap: "wrap" }}>
            {/* .95rem, NOT the codebase's habitual .85rem — with --ff-font-scale
                at 1.1 that computes to ~15px, one pixel under the size at which
                iOS Safari zooms the viewport on focus and never zooms back. */}
            <input
              value={input}
              onChange={e => { setInput(e.target.value.toUpperCase()); setMsg(null); }}
              onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); void apply(); } }}
              placeholder="Friend's code"
              aria-label="Friend's referral code"
              autoCapitalize="characters" autoCorrect="off" spellCheck={false} maxLength={24}
              style={{ flex: "1 1 9rem", minWidth: 0, padding: ".55rem .7rem", background: "rgba(var(--ff-fg), .06)", border: "1px solid rgba(var(--ff-fg), .12)", borderRadius: "8px", color: "var(--ff-text)", fontFamily: "inherit", fontSize: ".95rem", letterSpacing: ".08em", boxSizing: "border-box" }}
            />
            <button
              type="button"
              onClick={() => void apply()}
              disabled={busy || !input.trim()}
              style={{ ...pill, fontSize: ".82rem", ...(busy || !input.trim() ? { opacity: .5, cursor: "not-allowed" } : {}) }}
            >{busy ? "Applying…" : "Apply"}</button>
          </div>
        </div>
      )}

      {msg && (
        <div style={{ marginTop: ".6rem", fontSize: ".82rem", lineHeight: 1.5, color: msg.ok ? "#22c55e" : "#f87171" }}>{msg.text}</div>
      )}
    </div>
  );
}
