import { useEffect, useState } from "react";
import { useRoute, useLocation } from "wouter";
import { supabase } from "@/lib/supabase";
import { Ic } from "@/components/Ic";

/**
 * Pick-your-pro, without an account.
 *
 * Four clients received estimates and none of them ever came back to choose one.
 * The old path was: email -> "log in to your dashboard" -> remember a password ->
 * find the request -> pick. Every one of those steps loses people, and the very
 * first one loses the most.
 *
 * This page collapses all of it into a single tap from the email. The token in
 * the URL (client_requests.pick_token, a random uuid) is the authorization: it
 * scopes reads to ONE request via get_bids_by_token, and accept_bid_by_token
 * refuses any bid that doesn't belong to that same request. Nothing here needs
 * a session, and the payload deliberately carries no email, phone or address —
 * only what a person needs to choose between pros.
 */
export default function PickPro() {
  const [, params] = useRoute("/pick/:token");
  const [, setLocation] = useLocation();
  const token = params?.token ?? "";

  const [loading, setLoading] = useState(true);
  const [loadErr, setLoadErr] = useState<string | null>(null);
  const [data, setData] = useState<any>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [picked, setPicked] = useState<any>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    document.title = "Choose your pro · Freddy Fix It";
    let alive = true;
    (async () => {
      if (!token) { setLoadErr("bad-link"); setLoading(false); return; }
      try {
        const { data: d, error } = await supabase.rpc("get_bids_by_token", { p_token: token });
        if (!alive) return;
        // A failed read is not an empty result — say so rather than rendering
        // "no estimates yet" at someone who has three waiting.
        if (error) { setLoadErr(error.message); return; }
        setData(d ?? null);
      } catch (e: any) {
        if (alive) setLoadErr(e?.message ?? "Something went wrong");
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, [token]);

  const pick = async (b: any) => {
    setErr(null);
    setBusy(b.bid_id);
    try {
      const { error } = await supabase.rpc("accept_bid_by_token", { p_token: token, p_bid_id: b.bid_id });
      if (error) { setErr(error.message); return; }
      setPicked(b);
    } catch (e: any) {
      setErr(e?.message ?? "Couldn't confirm your choice. Please try again.");
    } finally {
      setBusy(null);
    }
  };

  const who = (b: any) => b.company || b.name || "Your pro";

  const priceLine = (b: any) => {
    if (b.amount != null) return "$" + b.amount;
    if (b.price_low != null && b.price_high != null) return "$" + b.price_low + "–$" + b.price_high;
    return "Estimate on request";
  };

  return (
    <div className="ff-pick">
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Bebas+Neue&family=DM+Sans:wght@300;400;500;700&display=swap');
        .ff-pick { min-height: 100vh; background: var(--ff-bg);
          background-image: radial-gradient(ellipse 80% 50% at 50% -10%, rgba(234,107,20,0.15) 0%, transparent 70%);
          padding: 2.5rem 1rem 4rem; font-family: 'DM Sans', sans-serif; color: var(--ff-text); }
        .ff-pk-wrap { max-width: 620px; margin: 0 auto; }
        .ff-pk-h1 { font-family: 'Bebas Neue', sans-serif; font-size: clamp(2rem, 7vw, 2.9rem);
          letter-spacing: .05em; line-height: 1; margin: 0 0 .5rem; text-align: center; }
        .ff-pk-h1 span { color: #ea6b14; }
        .ff-pk-sub { text-align: center; color: rgba(var(--ff-muted), .7); font-size: .95rem; margin: 0 0 1.75rem; line-height: 1.5; }
        .ff-pk-job { background: rgba(var(--ff-fg), .04); border: 1px solid rgba(var(--ff-fg), .08);
          border-radius: 14px; padding: 1rem 1.15rem; margin-bottom: 1.5rem; }
        .ff-pk-card { background: var(--ff-card-bg); border: 1px solid var(--ff-card-border);
          border-radius: 14px; padding: 1.1rem; margin-bottom: .9rem; transition: border-color .15s, transform .12s; }
        .ff-pk-card:hover { border-color: rgba(234,107,20,.35); }
        .ff-pk-btn { width: 100%; margin-top: .9rem; padding: .8rem 1rem; border: none; border-radius: 10px;
          background: #22c55e; color: #06210f; font-family: inherit; font-size: .95rem; font-weight: 700;
          cursor: pointer; transition: filter .12s, transform .08s; }
        .ff-pk-btn:hover:not(:disabled) { filter: brightness(1.08); }
        .ff-pk-btn:active:not(:disabled) { transform: translateY(1px); }
        .ff-pk-btn:disabled { opacity: .55; cursor: default; }
        .ff-pk-avatar { width: 48px; height: 48px; border-radius: 50%; overflow: hidden; flex-shrink: 0;
          background: rgba(234,107,20,.14); border: 1px solid rgba(var(--ff-fg), .1);
          display: flex; align-items: center; justify-content: center; }
        .ff-pk-chip { display: inline-flex; align-items: center; gap: .3rem; padding: .18rem .5rem;
          border-radius: 999px; font-size: .7rem; font-weight: 700; }
        .ff-pk-note { text-align: center; font-size: .8rem; color: rgba(var(--ff-muted), .55); margin-top: 1.75rem; line-height: 1.6; }
        .ff-pk-mid { text-align: center; padding: 3rem 1rem; }
        .ff-pk-mid h2 { font-family: 'Bebas Neue', sans-serif; font-size: 1.8rem; letter-spacing: .05em; margin: 1rem 0 .5rem; }
        .ff-pk-mid p { color: rgba(var(--ff-muted), .7); font-size: .92rem; line-height: 1.6; margin: 0 auto; max-width: 400px; }
        .ff-pk-link { background: none; border: none; color: #ea6b14; font-family: inherit; font-size: .9rem;
          font-weight: 600; cursor: pointer; text-decoration: underline; padding: 0; margin-top: 1.25rem; }
        @keyframes ff-pk-spin { to { transform: rotate(360deg); } }
        .ff-pk-spin { width: 30px; height: 30px; border: 3px solid rgba(234,107,20,.2);
          border-top-color: #ea6b14; border-radius: 50%; animation: ff-pk-spin .8s linear infinite; margin: 0 auto; }
      `}</style>

      <div className="ff-pk-wrap">
        {loading && <div className="ff-pk-mid"><div className="ff-pk-spin" /></div>}

        {!loading && loadErr === "bad-link" && (
          <div className="ff-pk-mid">
            <Ic name="x-circle" size={40} color="#ef4444" />
            <h2>This link doesn't look right</h2>
            <p>Check that you copied the whole link from your email, or open your dashboard to see your estimates.</p>
            <button className="ff-pk-link" onClick={() => setLocation("/login")}>Go to my dashboard</button>
          </div>
        )}

        {!loading && loadErr && loadErr !== "bad-link" && (
          <div className="ff-pk-mid">
            <Ic name="alert-triangle" size={40} color="#f59e0b" />
            <h2>We couldn't load your estimates</h2>
            <p>This is on us, not you — your estimates are safe. Please refresh in a moment, or open your dashboard.</p>
            <button className="ff-pk-link" onClick={() => window.location.reload()}>Try again</button>
          </div>
        )}

        {!loading && !loadErr && data?.found === false && (
          <div className="ff-pk-mid">
            <Ic name="x-circle" size={40} color="#ef4444" />
            <h2>This link has expired</h2>
            <p>It may have already been used, or the request was closed. Log in to see where things stand.</p>
            <button className="ff-pk-link" onClick={() => setLocation("/login")}>Go to my dashboard</button>
          </div>
        )}

        {/* Confirmation lives above the already-matched branch: right after a pick,
            the request is no longer 'pending', and stale data would otherwise flip
            this person straight to "already chosen" with no acknowledgement. */}
        {!loading && picked && (
          <div className="ff-pk-mid">
            <Ic name="check-circle" size={44} color="#22c55e" />
            <h2>{who(picked)} is booked in</h2>
            <p>
              We've let them know. They'll message you to confirm a time, and you'll get an email
              as soon as they do. Nothing is charged until you approve the visit and the price.
            </p>
            <button className="ff-pk-link" onClick={() => setLocation("/login")}>Open my dashboard</button>
          </div>
        )}

        {!loading && !picked && data?.found && data?.already_matched && (
          <div className="ff-pk-mid">
            <Ic name="check-circle" size={40} color="#22c55e" />
            <h2>You've already chosen a pro</h2>
            <p>Your job is under way. Log in to message them, see the schedule, or check what's next.</p>
            <button className="ff-pk-link" onClick={() => setLocation("/login")}>Open my dashboard</button>
          </div>
        )}

        {!loading && !picked && data?.found && !data.already_matched && (
          <>
            <h1 className="ff-pk-h1">
              {data.client_first ? data.client_first + ", pick " : "Pick "}<span>your pro</span>
            </h1>
            <p className="ff-pk-sub">
              {(data.bids?.length ?? 0) > 0
                ? "One tap and they're booked in. No password, no forms."
                : "Your request is live with Calgary pros right now."}
            </p>

            <div className="ff-pk-job">
              <div style={{ fontSize: ".72rem", textTransform: "uppercase", letterSpacing: ".1em", color: "rgba(var(--ff-muted), .5)", marginBottom: ".3rem" }}>Your request</div>
              <div style={{ fontSize: "1rem", fontWeight: 700 }}>{data.service}</div>
              {data.description && (
                <div style={{ fontSize: ".85rem", color: "rgba(var(--ff-muted), .7)", marginTop: ".25rem", lineHeight: 1.5 }}>{data.description}</div>
              )}
            </div>

            {err && (
              <div style={{ background: "rgba(239,68,68,.1)", border: "1px solid rgba(239,68,68,.35)", borderRadius: "10px", padding: ".7rem .85rem", marginBottom: "1rem", fontSize: ".85rem", color: "#ef4444" }}>
                {err}
              </div>
            )}

            {(data.bids?.length ?? 0) === 0 && (
              <div className="ff-pk-mid">
                <Ic name="clock" size={38} color="#ea6b14" />
                <h2>Estimates are on their way</h2>
                <p>Pros are reviewing your job now. We'll email you the moment the first estimate lands — keep this link, it'll show them here.</p>
              </div>
            )}

            {(data.bids ?? []).map((b: any) => (
              <div className="ff-pk-card" key={b.bid_id}>
                <div style={{ display: "flex", gap: ".8rem", alignItems: "flex-start" }}>
                  <div className="ff-pk-avatar">
                    {b.photo_url
                      ? <img src={b.photo_url} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                      : <span style={{ fontSize: ".9rem", fontWeight: 700, color: "#ea6b14" }}>
                          {who(b).split(/\s+/).map((w: string) => w[0] ?? "").join("").slice(0, 2).toUpperCase()}
                        </span>}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: ".6rem", flexWrap: "wrap" }}>
                      <span style={{ fontSize: "1rem", fontWeight: 700 }}>{who(b)}</span>
                      <span style={{ fontSize: "1.05rem", fontWeight: 700, color: "#ea6b14", whiteSpace: "nowrap" }}>{priceLine(b)}</span>
                    </div>

                    <div style={{ display: "flex", gap: ".4rem", flexWrap: "wrap", marginTop: ".4rem" }}>
                      {b.rating != null && Number(b.rating_count) > 0 && (
                        <span className="ff-pk-chip" style={{ background: "rgba(234,107,20,.12)", color: "#ea6b14" }}>
                          <Ic name="star" size={10} />{Number(b.rating).toFixed(1)}/10 ({b.rating_count})
                        </span>
                      )}
                      {Number(b.total_jobs) > 0 && (
                        <span className="ff-pk-chip" style={{ background: "rgba(var(--ff-fg), .07)", color: "rgba(var(--ff-muted), .8)" }}>
                          {b.total_jobs} job{Number(b.total_jobs) === 1 ? "" : "s"} done
                        </span>
                      )}
                      {Number(b.years) > 0 && (
                        <span className="ff-pk-chip" style={{ background: "rgba(var(--ff-fg), .07)", color: "rgba(var(--ff-muted), .8)" }}>
                          {b.years} yr{Number(b.years) === 1 ? "" : "s"} experience
                        </span>
                      )}
                      <span className="ff-pk-chip" style={{ background: "rgba(34,197,94,.1)", color: "#22c55e" }}>
                        <Ic name="user-check" size={10} />Vetted
                      </span>
                    </div>

                    {b.walkthrough && (
                      <div style={{ fontSize: ".8rem", color: "rgba(var(--ff-muted), .7)", marginTop: ".5rem", lineHeight: 1.5 }}>
                        Wants to see the space before giving a firm price. The range above is their ballpark —
                        the visit is free, and you approve the exact price afterwards.
                      </div>
                    )}
                    {b.message && (
                      <div style={{ fontSize: ".84rem", color: "rgba(var(--ff-muted), .75)", marginTop: ".5rem", lineHeight: 1.5 }}>“{b.message}”</div>
                    )}
                  </div>
                </div>

                <button className="ff-pk-btn" disabled={busy !== null} onClick={() => pick(b)}>
                  {busy === b.bid_id ? "Booking…" : "Choose " + who(b)}
                </button>
              </div>
            ))}

            {(data.bids?.length ?? 0) > 0 && (
              <p className="ff-pk-note">
                Choosing a pro doesn't charge you anything. You'll approve the time and the final
                price before any payment, and your address is only shared with the pro you pick.
              </p>
            )}
          </>
        )}
      </div>
    </div>
  );
}
