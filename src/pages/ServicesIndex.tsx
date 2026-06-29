import { useEffect } from "react";
import { useLocation } from "wouter";
import { Ic } from "@/components/Ic";
import { SERVICES, SERVICE_SLUGS } from "@/pages/ServiceLanding";

function upsertMeta(selector: string, attr: "name" | "property" | "rel", key: string, content: string, valueAttr: "content" | "href" = "content") {
  let el = document.head.querySelector(selector) as HTMLElement | null;
  if (!el) {
    el = document.createElement(selector.startsWith("link") ? "link" : "meta");
    el.setAttribute(attr, key);
    document.head.appendChild(el);
  }
  el.setAttribute(valueAttr, content);
}

export default function ServicesIndex() {
  const [, setLocation] = useLocation();
  useEffect(() => {
    const url = "https://freddyfixit.ca/services";
    const desc = "Browse home and vehicle services in Calgary — handyman, plumbing, electrical, HVAC, painting, roofing and more. Post your job and get up to 3 fixed-price quotes from vetted local pros.";
    const title = "Calgary Home & Vehicle Services | Vetted Local Pros — Freddy Fix It";
    const prev = document.title;
    document.title = title;
    upsertMeta('meta[name="description"]', "name", "description", desc);
    upsertMeta('link[rel="canonical"]', "rel", "canonical", url, "href");
    upsertMeta('meta[property="og:title"]', "property", "og:title", title);
    upsertMeta('meta[property="og:description"]', "property", "og:description", desc);
    upsertMeta('meta[property="og:url"]', "property", "og:url", url);
    return () => { document.title = prev; };
  }, []);

  return (
    <div style={{ fontFamily: "'DM Sans',sans-serif", background: "var(--ff-bg)", color: "var(--ff-text)", minHeight: "100vh", padding: "6rem 1.5rem 5rem" }}>
      <link href="https://fonts.googleapis.com/css2?family=Bebas+Neue&family=DM+Sans:wght@300;400;500;600&display=swap" rel="stylesheet" />
      <style>{"h1,h2{font-family:'Bebas Neue',sans-serif;letter-spacing:.05em} .si-card{background:var(--ff-surface);border:1px solid rgba(var(--ff-fg), .07);border-radius:12px;padding:1.1rem;cursor:pointer;transition:transform .15s,border-color .15s;text-decoration:none;display:block} .si-card:hover{transform:translateY(-2px);border-color:rgba(234,107,20,.45)}"}</style>
      <div style={{ maxWidth: 980, margin: "0 auto" }}>
        <h1 style={{ fontSize: "2.6rem", marginBottom: ".4rem" }}>Services in Calgary</h1>
        <p style={{ color: "rgba(var(--ff-muted), .82)", fontWeight: 300, fontSize: "1.05rem", marginBottom: "2.4rem", maxWidth: 640 }}>Vetted, licensed and insured local pros for home repairs and vehicle maintenance. Pick a service to learn more, or post a job and get up to 3 fixed-price quotes.</p>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(240px,1fr))", gap: "1rem" }}>
          {SERVICE_SLUGS.map((slug) => {
            const s = SERVICES[slug];
            return (
              <a key={slug} className="si-card" href={"/services/" + slug}>
                <div style={{ width: 44, height: 44, borderRadius: 11, background: "rgba(234,107,20,.12)", display: "flex", alignItems: "center", justifyContent: "center", marginBottom: ".7rem" }}>
                  <Ic name={s.icon} size={24} color="#ea6b14" />
                </div>
                <div style={{ fontWeight: 600, fontSize: "1.05rem", marginBottom: ".25rem" }}>{s.h1.replace(" in Calgary", "")}</div>
                <div style={{ color: "rgba(var(--ff-muted), .7)", fontSize: ".88rem", fontWeight: 300 }}>{s.name} in Calgary</div>
              </a>
            );
          })}
        </div>
        <div style={{ textAlign: "center", marginTop: "3rem" }}>
          <button onClick={() => setLocation("/client-onboarding")} style={{ background: "#ea6b14", color: "#fff", border: "none", padding: ".9rem 1.8rem", borderRadius: 8, fontSize: "1.05rem", fontWeight: 600, cursor: "pointer", fontFamily: "'DM Sans',sans-serif" }}>Post a job — get 3 free quotes →</button>
        </div>
      </div>
    </div>
  );
}
