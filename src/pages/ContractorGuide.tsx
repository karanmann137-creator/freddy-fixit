// /contractor-guide — the contractor onboarding guide as a real page.
//
// The content itself lives in src/lib/contractorGuide.ts so the page, the
// emailed newsletter copy and the welcome email can never drift apart. This
// file only renders it (via MdBody, the same markdown rules the email uses).
import { useEffect } from "react";
import { useLocation } from "wouter";
import { MdBody } from "@/lib/blogDb";
import {
  CONTRACTOR_GUIDE_MD,
  CONTRACTOR_GUIDE_TITLE,
  CONTRACTOR_GUIDE_PREHEADER,
} from "@/lib/contractorGuide";

export default function ContractorGuide() {
  const [, setLocation] = useLocation();

  useEffect(() => {
    const prev = document.title;
    document.title = CONTRACTOR_GUIDE_TITLE + " | Freddy Fix It";
    return () => { document.title = prev; };
  }, []);

  return (
    <div style={{ fontFamily: "'DM Sans',sans-serif", background: "var(--ff-bg)", color: "var(--ff-text)", minHeight: "100vh", padding: "6rem clamp(1rem, 4vw, 1.5rem) 4rem" }}>
      <link href="https://fonts.googleapis.com/css2?family=Bebas+Neue&family=DM+Sans:wght@300;400;500;600&display=swap" rel="stylesheet" />
      <style>{"h1,h2{font-family:'Bebas Neue',sans-serif;letter-spacing:.06em} .ffguide h2{color:#ea6b14;font-size:1.5rem;margin-top:2.6rem;margin-bottom:.7rem} .ffguide p,.ffguide li{line-height:1.85;color:rgba(var(--ff-muted), .85);font-weight:300} .ffguide p{margin-bottom:1rem} .ffguide strong{color:var(--ff-text);font-weight:500} .ffguide a{color:#ea6b14} .ffguide ul,.ffguide ol{padding-left:1.5rem;margin:.6rem 0 1.2rem} .ffguide li{margin:.45rem 0}"}</style>

      <div style={{ maxWidth: "800px", margin: "0 auto" }}>

        <button
          onClick={() => setLocation("/contractor-dashboard")}
          style={{ background: "transparent", border: "1px solid rgba(var(--ff-fg), .12)", color: "rgba(var(--ff-muted), .6)", padding: ".4rem .9rem", borderRadius: "6px", cursor: "pointer", fontSize: ".82rem", fontFamily: "'DM Sans',sans-serif", marginBottom: "2rem" }}
        >
          ← Back to my dashboard
        </button>

        <p style={{ fontSize: ".75rem", color: "#ea6b14", textTransform: "uppercase", letterSpacing: ".12em", marginBottom: ".5rem" }}>
          For contractors
        </p>
        <h1 style={{ fontSize: "clamp(2.2rem,5.5vw,3.4rem)", color: "var(--ff-text)", marginBottom: ".5rem", lineHeight: 1.1 }}>
          {CONTRACTOR_GUIDE_TITLE}
        </h1>
        <p style={{ fontSize: "1rem", color: "rgba(var(--ff-muted), .6)", fontWeight: 300, marginBottom: "2.5rem" }}>
          {CONTRACTOR_GUIDE_PREHEADER}
        </p>

        <article className="ffguide">
          <MdBody md={CONTRACTOR_GUIDE_MD} />
        </article>

        <div style={{ marginTop: "3rem", padding: "1.25rem 1.4rem", background: "rgba(234,107,20,.08)", border: "1px solid rgba(234,107,20,.25)", borderRadius: "10px" }}>
          <p style={{ margin: 0, fontSize: ".92rem", color: "rgba(var(--ff-muted), .85)", fontWeight: 300, lineHeight: 1.7 }}>
            You can reopen this guide any time from <strong>Settings</strong> in your dashboard.
          </p>
        </div>

      </div>
    </div>
  );
}
