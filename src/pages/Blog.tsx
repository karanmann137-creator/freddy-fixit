import { useLocation } from "wouter";

const POSTS = [
  {
    slug: "freddy-fix-it-vs-homestars-vs-jiffy-calgary",
    title: "Freddy Fix It vs HomeStars vs Jiffy vs TaskRabbit: The Best Way to Find a Calgary Contractor in 2026",
    excerpt: "A plain-language guide to the different kinds of contractor platforms available in Calgary — how they work, what to compare, and how to choose the right fit.",
    date: "June 10, 2026",
    readTime: "8 min read",
    tag: "Comparison",
  },
  {
    slug: "handyman-costs-calgary-2026",
    title: "How Much Does a Handyman Cost in Calgary? 2026 Pricing Guide",
    excerpt: "From minor repairs to full-day jobs — here's what Calgary homeowners actually pay for handyman and contractor services, broken down by trade.",
    date: "June 5, 2026",
    readTime: "5 min read",
    tag: "Pricing",
  },
  {
    slug: "calgary-home-winter-checklist",
    title: "Calgary Home Winter Prep Checklist: 12 Things to Do Before the Cold Hits",
    excerpt: "Calgary winters are brutal. Here's the complete checklist to make sure your home is ready — from furnace checks to pipe insulation and everything in between.",
    date: "May 28, 2026",
    readTime: "6 min read",
    tag: "Maintenance",
  },
  {
    slug: "why-vet-contractors-calgary",
    title: "5 Reasons to Always Use a Vetted Contractor in Calgary",
    excerpt: "Not all contractors are equal. Here's why vetting matters — and what to look for before letting anyone work on your home.",
    date: "May 20, 2026",
    readTime: "4 min read",
    tag: "Tips",
  },
  {
    slug: "calgary-plumber-cost-2026",
    title: "How Much Does a Plumber Cost in Calgary? 2026 Pricing Guide",
    excerpt: "Leaky faucet or full water heater replacement — here are general 2026 cost ranges for common Calgary plumbing jobs, plus red flags to watch for.",
    date: "June 14, 2026",
    readTime: "5 min read",
    tag: "Pricing",
  },
  {
    slug: "calgary-roof-replacement-cost-2026",
    title: "Calgary Roof Replacement Cost: What You'll Actually Pay in 2026",
    excerpt: "Hail damage, age, or just time — a new roof is one of Calgary's biggest home expenses. Here's a full cost breakdown by home size, shingle type, and what to know about insurance claims.",
    date: "June 14, 2026",
    readTime: "6 min read",
    tag: "Pricing",
  },
  {
    slug: "calgary-spring-home-maintenance-checklist",
    title: "Calgary Spring Home Maintenance Checklist: What to Do When the Snow Melts",
    excerpt: "After a Calgary winter, your home needs attention. This spring checklist covers roof inspection, gutters, foundation checks, sump pumps, and why you should book contractors now before the summer rush.",
    date: "June 14, 2026",
    readTime: "5 min read",
    tag: "Maintenance",
  },
];

const TAG_COLORS: Record<string, string> = {
  Comparison: "#ea6b14",
  Pricing: "#3b82f6",
  Maintenance: "#22c55e",
  Tips: "#a855f7",
};

export default function Blog() {
  const [, setLocation] = useLocation();
  const featured = POSTS[0];
  const rest = POSTS.slice(1);

  return (
    <div style={{ fontFamily: "'DM Sans',sans-serif", background: "#1a2236", color: "#f0f4ff", minHeight: "100vh", padding: "6rem 1.5rem 4rem" }}>
      <link href="https://fonts.googleapis.com/css2?family=Bebas+Neue&family=DM+Sans:wght@300;400;500;600&display=swap" rel="stylesheet" />
      <style>{`
        h1,h2,h3{font-family:'Bebas Neue',sans-serif;letter-spacing:.06em}
        .blog-card{background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.08);border-radius:12px;padding:2rem;cursor:pointer;transition:border-color .2s,transform .2s}
        .blog-card:hover{border-color:rgba(234,107,20,.4);transform:translateY(-2px)}
        .tag{display:inline-block;font-size:.72rem;font-weight:600;letter-spacing:.1em;text-transform:uppercase;padding:.25rem .6rem;border-radius:4px}
      `}</style>

      <div style={{ maxWidth: "900px", margin: "0 auto" }}>
        <p style={{ fontSize: ".8rem", color: "#ea6b14", textTransform: "uppercase", letterSpacing: ".12em", fontWeight: 600 }}>Freddy Fix It Blog</p>
        <h1 style={{ fontSize: "clamp(2.5rem,6vw,4rem)", color: "#f0f4ff", marginBottom: ".5rem", marginTop: ".25rem" }}>Home Improvement Insights for Calgary Homeowners</h1>
        <p style={{ color: "rgba(190,205,235,.6)", marginBottom: "3rem", maxWidth: "600px" }}>Tips, guides, and honest comparisons to help you find the right contractor and keep your Calgary home in top shape.</p>

        {/* Featured post */}
        <div
          className="blog-card"
          style={{ marginBottom: "2rem", background: "rgba(234,107,20,.06)", borderColor: "rgba(234,107,20,.2)" }}
          onClick={() => setLocation(`/blog/${featured.slug}`)}
        >
          <div style={{ display: "flex", alignItems: "center", gap: ".75rem", marginBottom: "1rem" }}>
            <span className="tag" style={{ background: TAG_COLORS[featured.tag] + "22", color: TAG_COLORS[featured.tag] }}>{featured.tag}</span>
            <span style={{ fontSize: ".8rem", color: "rgba(190,205,235,.4)" }}>Featured</span>
          </div>
          <h2 style={{ fontSize: "clamp(1.4rem,3vw,2rem)", color: "#f0f4ff", marginBottom: ".75rem", lineHeight: 1.25 }}>{featured.title}</h2>
          <p style={{ color: "rgba(190,205,235,.7)", marginBottom: "1.25rem", lineHeight: 1.75 }}>{featured.excerpt}</p>
          <div style={{ display: "flex", alignItems: "center", gap: "1.5rem" }}>
            <span style={{ fontSize: ".8rem", color: "rgba(190,205,235,.4)" }}>{featured.date}</span>
            <span style={{ fontSize: ".8rem", color: "rgba(190,205,235,.4)" }}>{featured.readTime}</span>
            <span style={{ fontSize: ".85rem", color: "#ea6b14", fontWeight: 500, marginLeft: "auto" }}>Read article →</span>
          </div>
        </div>

        {/* Rest of posts */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(260px,1fr))", gap: "1.25rem" }}>
          {rest.map(p => (
            <div key={p.slug} className="blog-card" onClick={() => setLocation(`/blog/${p.slug}`)}>
              <span className="tag" style={{ background: TAG_COLORS[p.tag] + "22", color: TAG_COLORS[p.tag], marginBottom: ".75rem" }}>{p.tag}</span>
              <h3 style={{ fontSize: "1.05rem", color: "#f0f4ff", margin: ".75rem 0 .5rem", lineHeight: 1.35 }}>{p.title}</h3>
              <p style={{ fontSize: ".88rem", color: "rgba(190,205,235,.6)", lineHeight: 1.7, marginBottom: "1rem" }}>{p.excerpt}</p>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: ".78rem", color: "rgba(190,205,235,.35)" }}>
                <span>{p.date}</span>
                <span>{p.readTime}</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
