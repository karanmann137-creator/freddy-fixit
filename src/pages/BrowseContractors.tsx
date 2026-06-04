import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { motion } from "framer-motion";
import { supabase } from "@/lib/supabase";

// Must match the contractor SPECIALTIES labels from ContractorOnboarding,
// since that's what gets stored in contractors.specialties.
const CATEGORIES = [
  "General Repairs", "Plumbing", "Electrical", "HVAC", "Carpentry", "Painting",
  "Drywall", "Flooring / Tile", "Tire Swap / Rotation", "Oil Change",
  "Battery / Brakes", "Vehicle Maintenance", "Landscaping", "Snow Removal",
  "Gutters", "Windows & Doors",
  "Siding & Roofing", "Garage", "Air Conditioning", "Cleaning Services",
];

interface DirectoryContractor {
  id: string;
  first_name: string | null;
  last_name: string | null;
  specialties: string[] | null;
  service_area: string[] | null;
  years_of_experience: number | null;
  photo_url: string | null;
  rating: number | null;
  total_jobs: number | null;
  rating_price: number | null;
  rating_experience: number | null;
  rating_result: number | null;
  rating_count: number | null;
  google_reviews_url: string | null;
}

export default function BrowseContractors() {
  const [, setLocation] = useLocation();
  const [contractors, setContractors] = useState<DirectoryContractor[]>([]);
  const [category, setCategory] = useState<string>("All");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [portfolioBy, setPortfolioBy] = useState<Record<string, any[]>>({});

  useEffect(() => {
    (async () => {
      setLoading(true);
      // Server-side filter: .contains uses the GIN index on contractors.specialties,
      // so only matching rows come back instead of filtering the whole list client-side.
      let query = supabase.from("contractor_directory").select("*");
      if (category !== "All") query = query.contains("specialties", [category]);
      const { data, error } = await query;
      if (error) setError("Couldn't load contractors right now — please try again shortly.");
      else setError("");
      setContractors(data ?? []);
      const ids = (data ?? []).map((c: any) => c.id);
      if (ids.length) {
        const { data: pf } = await supabase.from("portfolio_items").select("*").in("contractor_id", ids).order("created_at", { ascending: false });
        const map: Record<string, any[]> = {};
        (pf ?? []).forEach((p: any) => { if (!map[p.contractor_id]) map[p.contractor_id] = []; map[p.contractor_id].push(p); });
        setPortfolioBy(map);
      } else {
        setPortfolioBy({});
      }
      setLoading(false);
    })();
  }, [category]);

  const pfUrl = (path: string) => supabase.storage.from("portfolio-photos").getPublicUrl(path).data.publicUrl;

  const visible = contractors;

  const displayName = (c: DirectoryContractor) => {
    const f = (c.first_name ?? "").trim();
    const l = (c.last_name ?? "").trim();
    return l ? `${f} ${l[0]}.` : (f || "Contractor");
  };

  const stars = (rating: number | null) => {
    const r = Math.max(0, Math.min(5, Math.round(rating ?? 0)));
    return "★★★★★".slice(0, r) + "☆☆☆☆☆".slice(0, 5 - r);
  };

  return (
    <div style={st.page}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Bebas+Neue&family=DM+Sans:wght@300;400;500;600&display=swap');
        @keyframes spin { to { transform: rotate(360deg); } }
        .ff-card { transition: transform .15s ease, border-color .15s ease; }
        .ff-card:hover { transform: translateY(-3px); border-color: rgba(234,107,20,.45); }
        .ff-chip { cursor: pointer; transition: background .15s ease, color .15s ease, border-color .15s ease; }
      `}</style>

      <div style={st.inner}>
        <h1 style={st.h1}>Browse Contractors</h1>
        <p style={st.sub}>Find a vetted local pro for exactly the job you need done.</p>

        {/* Category filter */}
        <div style={st.filters}>
          {["All", ...CATEGORIES].map(cat => {
            const active = cat === category;
            return (
              <span
                key={cat}
                className="ff-chip"
                onClick={() => setCategory(cat)}
                style={{
                  ...st.filterChip,
                  background: active ? "#ea6b14" : "rgba(255,255,255,.05)",
                  color: active ? "#fff" : "rgba(240,244,255,.8)",
                  borderColor: active ? "#ea6b14" : "rgba(255,255,255,.12)",
                }}
              >
                {cat}
              </span>
            );
          })}
        </div>

        {/* States */}
        {loading && (
          <div style={st.center}>
            <div style={st.spinner} />
          </div>
        )}
        {!loading && error && <p style={st.empty}>{error}</p>}
        {!loading && !error && visible.length === 0 && (
          <p style={st.empty}>
            No contractors available in {category === "All" ? "this directory" : `“${category}”`} yet. Check back soon.
          </p>
        )}

        {/* Grid */}
        {!loading && !error && visible.length > 0 && (
          <div style={st.grid}>
            {visible.map((c, i) => (
              <motion.div
                key={c.id}
                className="ff-card"
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: Math.min(i * 0.04, 0.4) }}
                style={st.card}
              >
                <div style={st.cardHead}>
                  {c.photo_url
                    ? <img src={c.photo_url} alt={displayName(c)} style={st.avatar} />
                    : <div style={{ ...st.avatar, ...st.avatarFallback }}>{(c.first_name ?? "?")[0]}</div>}
                  <div>
                    <div style={st.name}>{displayName(c)}</div>
                    <div style={st.rating}>
                      <span style={{ color: "#ea6b14" }}>{stars(c.rating)}</span>
                      <span style={st.muted}>
                        {c.total_jobs ? ` · ${c.total_jobs} job${c.total_jobs === 1 ? "" : "s"}` : " · New"}
                      </span>
                    </div>
                  </div>
                </div>

                {typeof c.years_of_experience === "number" && (
                  <div style={st.meta}>{c.years_of_experience} yr{c.years_of_experience === 1 ? "" : "s"} experience</div>
                )}

                <div style={st.chipRow}>
                  {(c.specialties ?? []).slice(0, 4).map(s => (
                    <span key={s} style={st.specChip}>{s}</span>
                  ))}
                </div>

                {(c.service_area ?? []).length > 0 && (
                  <div style={st.meta}>📍 {(c.service_area ?? []).join(", ")}</div>
                )}

                {(c.rating_count ?? 0) > 0 && (
                  <div style={{ display:"flex", gap:".4rem", flexWrap:"wrap", margin:".65rem 0 .2rem" }}>
                    {([["Price", c.rating_price],["Experience", c.rating_experience],["Result", c.rating_result]] as [string, number|null][]).map(([lbl,val]) => (
                      <div key={lbl} style={{ flex:"1 1 64px", background:"rgba(255,255,255,.04)", border:"1px solid rgba(255,255,255,.08)", borderRadius:"8px", padding:".4rem .25rem", textAlign:"center" }}>
                        <div style={{ fontSize:"1rem", fontWeight:700, color:"#ea6b14" }}>{val != null ? Number(val).toFixed(1) : "—"}<span style={{ fontSize:".62rem", color:"rgba(190,205,235,.5)" }}>/10</span></div>
                        <div style={{ fontSize:".6rem", textTransform:"uppercase", letterSpacing:".06em", color:"rgba(190,205,235,.5)" }}>{lbl}</div>
                      </div>
                    ))}
                  </div>
                )}

                {(portfolioBy[c.id] ?? []).length > 0 && (
                  <div style={{ display:"flex", gap:".4rem", overflowX:"auto", margin:".5rem 0" }}>
                    {(portfolioBy[c.id] ?? []).slice(0,6).map((p: any) => (
                      p.photo_path ? <img key={p.id} src={pfUrl(p.photo_path)} alt={p.title || "Past work"} title={p.title || ""} style={{ width:"64px", height:"64px", objectFit:"cover", borderRadius:"8px", flexShrink:0 }} /> : null
                    ))}
                  </div>
                )}

                {c.google_reviews_url && (
                  <a href={c.google_reviews_url} target="_blank" rel="noopener noreferrer" style={{ display:"inline-block", fontSize:".8rem", color:"#ea6b14", textDecoration:"none", margin:".3rem 0 .1rem" }}>★ See Google reviews →</a>
                )}

                <button style={st.cta} onClick={() => setLocation("/client-onboarding")}>
                  Request a Job
                </button>
              </motion.div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

const st: Record<string, React.CSSProperties> = {
  page: { fontFamily: "'DM Sans', sans-serif", background: "#1a2236", color: "#f0f4ff", minHeight: "100vh" },
  nav: { display: "flex", justifyContent: "space-between", alignItems: "center", padding: "1.25rem 1.5rem", borderBottom: "1px solid rgba(255,255,255,.07)" },
  logo: { fontFamily: "'Bebas Neue', sans-serif", fontSize: "1.4rem", letterSpacing: ".05em", color: "#ea6b14", cursor: "pointer" },
  navLink: { fontSize: ".9rem", color: "rgba(240,244,255,.75)", cursor: "pointer" },
  inner: { maxWidth: "1100px", margin: "0 auto", padding: "5.5rem 1.5rem 5rem" },
  h1: { fontFamily: "'Bebas Neue', sans-serif", fontSize: "2.6rem", letterSpacing: ".02em", marginBottom: ".4rem" },
  sub: { color: "rgba(190,205,235,.7)", marginBottom: "2rem", fontSize: "1rem" },
  filters: { display: "flex", flexWrap: "wrap", gap: ".55rem", marginBottom: "2.5rem" },
  filterChip: { padding: ".45rem .9rem", borderRadius: "999px", fontSize: ".82rem", border: "1px solid", userSelect: "none" },
  grid: { display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: "1.25rem" },
  card: { background: "rgba(255,255,255,.04)", border: "1px solid rgba(255,255,255,.08)", borderRadius: "14px", padding: "1.4rem" },
  cardHead: { display: "flex", gap: ".9rem", alignItems: "center", marginBottom: "1rem" },
  avatar: { width: 56, height: 56, borderRadius: "50%", objectFit: "cover", flexShrink: 0 },
  avatarFallback: { background: "rgba(234,107,20,.2)", color: "#ea6b14", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "1.4rem", fontWeight: 600, textTransform: "uppercase" },
  name: { fontSize: "1.1rem", fontWeight: 600 },
  rating: { fontSize: ".85rem", marginTop: ".15rem" },
  muted: { color: "rgba(190,205,235,.55)" },
  meta: { fontSize: ".82rem", color: "rgba(190,205,235,.7)", marginBottom: ".75rem" },
  chipRow: { display: "flex", flexWrap: "wrap", gap: ".4rem", marginBottom: ".9rem" },
  specChip: { fontSize: ".72rem", padding: ".25rem .6rem", borderRadius: "6px", background: "rgba(234,107,20,.12)", color: "#f0a06a", border: "1px solid rgba(234,107,20,.2)" },
  cta: { width: "100%", marginTop: ".4rem", padding: ".7rem", background: "#ea6b14", color: "#fff", border: "none", borderRadius: "8px", fontFamily: "inherit", fontSize: ".9rem", fontWeight: 500, cursor: "pointer" },
  center: { display: "flex", justifyContent: "center", padding: "4rem 0" },
  spinner: { width: 30, height: 30, border: "3px solid rgba(234,107,20,.2)", borderTopColor: "#ea6b14", borderRadius: "50%", animation: "spin .8s linear infinite" },
  empty: { textAlign: "center", color: "rgba(190,205,235,.6)", padding: "3rem 0", fontSize: ".95rem" },
};
