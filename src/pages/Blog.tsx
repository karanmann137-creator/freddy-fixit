import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { getDbPosts, fmtDate, readTime, type DbPost } from "../lib/blogDb";

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
    slug: "basement-development-cost-calgary-2026",
    title: "Basement Development Cost in Calgary: 2026 Price Guide",
    excerpt: "One of the best returns on a Calgary home — but what does it actually cost? Per-square-foot ranges, lifestyle finish vs legal suite, permits, the 2026 suite fee amnesty, and the red flags to avoid.",
    date: "July 1, 2026",
    readTime: "6 min read",
    tag: "Pricing",
  },
  {
    slug: "calgary-windshield-rock-chip-repair-cost-2026",
    title: "Windshield Rock Chip Repair in Calgary: 2026 Cost Guide",
    excerpt: "In Calgary a rock chip is a matter of when, not if. Here's repair vs replacement pricing for 2026, when a chip can still be fixed, how Alberta insurance handles it, and why cold weather means acting fast.",
    date: "July 2, 2026",
    readTime: "5 min read",
    tag: "Vehicle",
  },
  {
    slug: "calgary-winter-tires-guide-2026",
    title: "Winter Tires in Calgary: Costs, Timing & the Insurance Discount",
    excerpt: "Are winter tires worth it, or are all-seasons good enough? The real difference, when to switch, what a 2026 set costs, and the 2–5% Alberta insurance discount most drivers never claim.",
    date: "July 2, 2026",
    readTime: "6 min read",
    tag: "Vehicle",
  },
  {
    slug: "winterize-your-vehicle-calgary",
    title: "How to Winterize Your Vehicle for a Calgary Winter",
    excerpt: "Chinook one day, -30 the next — Calgary's swings are brutal on a vehicle. A 6-point October checklist: battery, block heater, winter fluids, wipers, an emergency kit, and tires.",
    date: "July 3, 2026",
    readTime: "6 min read",
    tag: "Vehicle",
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
  {
    slug: "calgary-electrician-cost-2026",
    title: "How Much Does an Electrician Cost in Calgary? 2026 Pricing Guide",
    excerpt: "Panel upgrades, EV chargers, new circuits, or a dead outlet — here's what Calgary electricians charge in 2026, plus how permits work and the red flags to avoid.",
    date: "June 24, 2026",
    readTime: "5 min read",
    tag: "Pricing",
  },
  {
    slug: "calgary-furnace-repair-replacement-cost-2026",
    title: "Furnace Repair vs Replacement in Calgary: 2026 Cost Guide",
    excerpt: "When your furnace quits on a -30 night, you need answers fast. Here are 2026 repair and replacement costs, when to replace vs repair, permits, and rebates to ask about.",
    date: "June 24, 2026",
    readTime: "6 min read",
    tag: "Pricing",
  },
  {
    slug: "hiring-a-contractor-calgary-questions-permits",
    title: "Hiring a Contractor in Calgary: 7 Questions to Ask (and How Permits Work)",
    excerpt: "Hiring the wrong contractor is expensive and stressful. These 7 questions screen out the bad ones — plus a plain-language guide to how City of Calgary permits actually work.",
    date: "June 24, 2026",
    readTime: "6 min read",
    tag: "Tips",
  },
];

const TAG_COLORS: Record<string, string> = {
  Comparison: "#ea6b14",
  Pricing: "#3b82f6",
  Maintenance: "#22c55e",
  Tips: "#a855f7",
  Vehicle: "#14b8a6",
  Contractor: "#f59e0b",
};
const tagColor = (tag: string) => TAG_COLORS[tag] ?? "#a855f7";

export default function Blog() {
  const [, setLocation] = useLocation();
  const [dbPosts, setDbPosts] = useState<DbPost[]>([]);
  useEffect(() => {
    let alive = true;
    getDbPosts().then(posts => { if (alive) setDbPosts(posts); });
    return () => { alive = false; };
  }, []);

  const featured = POSTS[0];
  const hardSlugs = new Set(POSTS.map(p => p.slug));
  const dbCards = dbPosts
    .filter(p => !hardSlugs.has(p.slug))
    .map(p => ({
      slug: p.slug,
      title: p.title,
      excerpt: p.description || p.body_md.replace(/[#*\-\[\]]/g, "").slice(0, 160) + "…",
      date: fmtDate(p.published_at),
      readTime: readTime(p.body_md),
      tag: p.tag || "Tips",
      _ts: new Date(p.published_at).getTime(),
    }));
  const rest = [
    ...dbCards.sort((a, b) => b._ts - a._ts).map(({ _ts, ...p }) => p),
    ...POSTS.slice(1),
  ];

  return (
    <div style={{ fontFamily: "'DM Sans',sans-serif", background: "var(--ff-bg)", backgroundImage: "radial-gradient(ellipse 55% 30% at 22% -2%, rgba(234,107,20,0.26) 0%, transparent 66%), radial-gradient(ellipse 50% 34% at 82% -6%, rgba(234,107,20,0.16) 0%, transparent 70%), repeating-linear-gradient(45deg, transparent 0 27px, rgba(var(--ff-fg), 0.02) 27px, rgba(var(--ff-fg), 0.02) 28px), repeating-linear-gradient(-45deg, transparent 0 27px, rgba(var(--ff-fg), 0.016) 27px, rgba(var(--ff-fg), 0.016) 28px)", backgroundAttachment: "fixed", color: "var(--ff-text)", minHeight: "100vh", padding: "6rem 1.5rem 4rem" }}>
      <link href="https://fonts.googleapis.com/css2?family=Bebas+Neue&family=DM+Sans:wght@300;400;500;600&display=swap" rel="stylesheet" />
      <style>{`
        h1,h2,h3{font-family:'Bebas Neue',sans-serif;letter-spacing:.06em}
        .blog-card{background:rgba(var(--ff-fg), .04);border:1px solid rgba(var(--ff-fg), .08);border-radius:12px;padding:2rem;cursor:pointer;transition:border-color .2s,transform .2s}
        .blog-card:hover{border-color:rgba(234,107,20,.4);transform:translateY(-2px)}
        .tag{display:inline-block;font-size:.72rem;font-weight:600;letter-spacing:.1em;text-transform:uppercase;padding:.25rem .6rem;border-radius:4px}
      `}</style>

      <div style={{ maxWidth: "900px", margin: "0 auto" }}>
        <p style={{ fontSize: ".8rem", color: "#ea6b14", textTransform: "uppercase", letterSpacing: ".12em", fontWeight: 600 }}>Freddy Fix It Blog</p>
        <h1 style={{ fontSize: "clamp(2.5rem,6vw,4rem)", color: "var(--ff-text)", marginBottom: ".5rem", marginTop: ".25rem" }}>Home Improvement Insights for Calgary Homeowners</h1>
        <p style={{ color: "rgba(var(--ff-muted), .6)", marginBottom: "3rem", maxWidth: "600px" }}>Tips, guides, and honest comparisons to help you find the right contractor and keep your Calgary home in top shape.</p>

        {/* Featured post */}
        <div
          className="blog-card"
          style={{ marginBottom: "2rem", background: "rgba(234,107,20,.06)", borderColor: "rgba(234,107,20,.2)" }}
          onClick={() => setLocation(`/blog/${featured.slug}`)}
        >
          <div style={{ display: "flex", alignItems: "center", gap: ".75rem", marginBottom: "1rem" }}>
            <span className="tag" style={{ background: tagColor(featured.tag) + "22", color: tagColor(featured.tag) }}>{featured.tag}</span>
            <span style={{ fontSize: ".8rem", color: "rgba(var(--ff-muted), .4)" }}>Featured</span>
          </div>
          <h2 style={{ fontSize: "clamp(1.4rem,3vw,2rem)", color: "var(--ff-text)", marginBottom: ".75rem", lineHeight: 1.25 }}>{featured.title}</h2>
          <p style={{ color: "rgba(var(--ff-muted), .7)", marginBottom: "1.25rem", lineHeight: 1.75 }}>{featured.excerpt}</p>
          <div style={{ display: "flex", alignItems: "center", gap: "1.5rem" }}>
            <span style={{ fontSize: ".8rem", color: "rgba(var(--ff-muted), .4)" }}>{featured.date}</span>
            <span style={{ fontSize: ".8rem", color: "rgba(var(--ff-muted), .4)" }}>{featured.readTime}</span>
            <span style={{ fontSize: ".85rem", color: "#ea6b14", fontWeight: 500, marginLeft: "auto" }}>Read article →</span>
          </div>
        </div>

        {/* Rest of posts */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(260px,1fr))", gap: "1.25rem" }}>
          {rest.map(p => (
            <div key={p.slug} className="blog-card" onClick={() => setLocation(`/blog/${p.slug}`)}>
              <span className="tag" style={{ background: tagColor(p.tag) + "22", color: tagColor(p.tag), marginBottom: ".75rem" }}>{p.tag}</span>
              <h3 style={{ fontSize: "1.05rem", color: "var(--ff-text)", margin: ".75rem 0 .5rem", lineHeight: 1.35 }}>{p.title}</h3>
              <p style={{ fontSize: ".88rem", color: "rgba(var(--ff-muted), .6)", lineHeight: 1.7, marginBottom: "1rem" }}>{p.excerpt}</p>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: ".78rem", color: "rgba(var(--ff-muted), .35)" }}>
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
