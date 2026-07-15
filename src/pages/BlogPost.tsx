import { useEffect, useState } from "react";
import { useParams, useLocation } from "wouter";
import { getDbPost, fmtDate, readTime, MdBody, type DbPost } from "../lib/blogDb";

// ── Chart component ──────────────────────────────────────────────────────────

type Bar = { label: string; value: number; color: string };

function BarChart({ title, subtitle, data, unit, lowerBetter }: {
  title: string; subtitle?: string;
  data: Bar[]; unit: string; lowerBetter?: boolean;
}) {
  const max = Math.max(...data.map(d => d.value));
  const labelW = 130; const barMax = 320; const numW = 56;
  const rowH = 44; const svgW = labelW + barMax + numW + 16;
  const svgH = data.length * rowH + 24;

  return (
    <div style={{ background: "rgba(var(--ff-fg), .03)", border: "1px solid rgba(var(--ff-fg), .08)", borderRadius: 10, padding: "1.5rem", margin: "2rem 0" }}>
      <p style={{ fontFamily: "'Bebas Neue',sans-serif", letterSpacing: ".06em", fontSize: "1.1rem", color: "var(--ff-text)", margin: "0 0 .25rem" }}>{title}</p>
      {subtitle && <p style={{ fontSize: ".78rem", color: "rgba(var(--ff-muted), .4)", margin: "0 0 1rem" }}>{subtitle}</p>}
      <svg viewBox={`0 0 ${svgW} ${svgH}`} width="100%" style={{ overflow: "visible" }}>
        {data.map((d, i) => {
          const barW = (d.value / max) * barMax;
          const y = i * rowH;
          return (
            <g key={d.label}>
              <text x={labelW - 10} y={y + rowH / 2 + 5} textAnchor="end" fontSize={12} fill="rgba(var(--ff-muted), .75)" fontFamily="DM Sans,sans-serif">{d.label}</text>
              <rect x={labelW} y={y + 8} width={barW} height={rowH - 18} rx={4} fill={d.color} opacity={.9} />
              <text x={labelW + barW + 8} y={y + rowH / 2 + 5} fontSize={12} fill={d.color} fontFamily="DM Sans,sans-serif" fontWeight="600">{d.value}{unit}</text>
            </g>
          );
        })}
      </svg>
      {lowerBetter && <p style={{ fontSize: ".75rem", color: "rgba(var(--ff-muted), .35)", margin: ".5rem 0 0" }}>Lower is better</p>}
    </div>
  );
}

function FeatureTable({ rows }: { rows: { feature: string; freddy: boolean | string; jiffy: boolean | string; homestars: boolean | string; taskrabbit: boolean | string; housecall: boolean | string; kijiji: boolean | string }[] }) {
  const check = (v: boolean | string) =>
    v === true ? <span style={{ color: "#22c55e", fontWeight: 700 }}>✓</span>
    : v === false ? <span style={{ color: "#ef4444" }}>✗</span>
    : <span style={{ color: "rgba(var(--ff-muted), .6)", fontSize: ".85rem" }}>{v}</span>;

  const cols = ["Feature", "Freddy Fix It", "Jiffy", "HomeStars", "TaskRabbit", "HouseCall Pro", "Kijiji"];
  const colColors = ["", "#ea6b14", "#3b82f6", "#ef4444", "#a855f7", "#10b981", "#6b7280"];

  return (
    <div style={{ overflowX: "auto", margin: "2rem 0" }}>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: ".88rem" }}>
        <thead>
          <tr>{cols.map((c, i) => (
            <th key={c} style={{ padding: ".6rem 1rem", textAlign: i === 0 ? "left" : "center", color: colColors[i] || "rgba(var(--ff-muted), .5)", fontWeight: 600, fontSize: ".78rem", textTransform: "uppercase", letterSpacing: ".06em", borderBottom: "1px solid rgba(var(--ff-fg), .1)" }}>{c}</th>
          ))}</tr>
        </thead>
        <tbody>{rows.map((r, i) => (
          <tr key={r.feature} style={{ background: i % 2 === 0 ? "transparent" : "rgba(var(--ff-fg), .025)" }}>
            <td style={{ padding: ".65rem 1rem", color: "rgba(var(--ff-muted), .8)", borderBottom: "1px solid rgba(var(--ff-fg), .05)" }}>{r.feature}</td>
            {[r.freddy, r.jiffy, r.homestars, r.taskrabbit, r.housecall, r.kijiji].map((v, j) => (
              <td key={j} style={{ padding: ".65rem 1rem", textAlign: "center", borderBottom: "1px solid rgba(var(--ff-fg), .05)" }}>{check(v)}</td>
            ))}
          </tr>
        ))}</tbody>
      </table>
    </div>
  );
}

// ── Article content ──────────────────────────────────────────────────────────

function ArticleComparison() {
  const [, setLocation] = useLocation();
  return (
    <article>
      <p style={{ background: "rgba(var(--ff-fg), .04)", border: "1px solid rgba(var(--ff-fg), .08)", borderRadius: 8, padding: "1rem 1.25rem", fontSize: ".85rem" }}><strong>About this comparison:</strong> This article reflects our general understanding of how different kinds of platforms work, based on publicly available information as of 2026. Features, pricing, and policies change often and can vary by individual contractor. Always confirm the current details directly with each platform before deciding.</p>

      <p>If you're a Calgary homeowner looking to hire a contractor, you've got options — and they work in very different ways. Rather than rank specific companies, here's a plain-language guide to the main <em>types</em> of platforms and what to weigh with each.</p>

      <h2>The Main Types of Platforms</h2>
      <p><strong>Active-dispatch marketplaces</strong> (such as Freddy Fix It and Jiffy) push your job request directly to contractors who match it, instead of asking you to search a directory. The appeal is speed and convenience — you post once and qualified contractors come to you.</p>
      <p><strong>Directory and review platforms</strong> (such as HomeStars) let you browse contractor listings and reviews and reach out yourself. They're useful for research, but how quickly you hear back depends on individual contractors checking their leads.</p>
      <p><strong>General task platforms</strong> (such as TaskRabbit) cover a wide range of errands and tasks across many cities. Coverage and specialization for skilled home trades can vary by market.</p>
      <p><strong>Classified listings</strong> (such as Kijiji) connect you with individuals directly. There's no platform-level vetting, so checking licensing, insurance, and references is entirely up to you.</p>
      <p style={{ background: "rgba(var(--ff-fg), .04)", border: "1px solid rgba(var(--ff-fg), .08)", borderRadius: 8, padding: "1rem 1.25rem", fontSize: ".88rem" }}><strong>A note on HouseCall Pro:</strong> HouseCall Pro is primarily <em>contractor business software</em> — a scheduling and invoicing tool contractors use to run their operations, rather than a marketplace homeowners book through directly. We mention it because some contractors advertise that they "use HouseCall Pro," which can be confusing.</p>

      <h2>What to Compare</h2>
      <p><strong>Speed.</strong> If you need someone quickly, active-dispatch platforms generally connect you faster than browsing a directory and waiting for replies.</p>
      <p><strong>Vetting.</strong> This is where platforms differ most. Some, like Freddy Fix It, require contractors to submit a trade licence and proof of insurance before they can accept work. Others leave verification up to you. Whatever platform you use, confirm a contractor is licensed and insured before they start.</p>
      <p><strong>Pricing transparency.</strong> Look for fixed-price estimates before any work begins, so you aren't surprised by the final invoice.</p>
      <p><strong>Protection if something goes wrong.</strong> Check whether the platform offers any recourse, guarantee, or support if a job doesn't go as planned.</p>

      <h2>How Freddy Fix It Works</h2>
      <p>Freddy Fix It is built specifically for Calgary. Every contractor must submit their trade licence and proof of insurance before they can accept a job. You post once, receive up to seven fixed-price bids from vetted contractors, and reviews are only unlocked after a job is completed and confirmed by both parties. We also offer recurring and seasonal scheduling for ongoing maintenance.</p>
      <p>Whichever platform you choose, the same fundamentals protect you: hire licensed, insured contractors, get the price in writing first, and keep records of the work.</p>

      <div style={{ background: "rgba(234,107,20,.08)", border: "1px solid rgba(234,107,20,.25)", borderRadius: 10, padding: "1.5rem", margin: "2.5rem 0", textAlign: "center" }}>
        <p style={{ fontSize: "1.1rem", fontWeight: 600, color: "var(--ff-text)", margin: "0 0 .75rem" }}>Ready to try a fast way to find a vetted Calgary contractor?</p>
        <button onClick={() => setLocation("/client-onboarding")} style={{ background: "#ea6b14", color: "#fff", border: "none", borderRadius: 8, padding: ".75rem 2rem", fontSize: "1rem", fontWeight: 600, cursor: "pointer" }}>Post a Job — It's Free</button>
      </div>
    </article>
  );
}

function ArticlePricing() {
  return (
    <article>
      <p>One of the most common questions Calgary homeowners ask before hiring a contractor: <em>how much should I actually be paying?</em> Pricing varies by trade, job complexity, and contractor experience — but here are some general ranges to give you a rough sense in 2026.</p>
      <p style={{ background: "rgba(var(--ff-fg), .04)", border: "1px solid rgba(var(--ff-fg), .08)", borderRadius: 8, padding: "1rem 1.25rem", fontSize: ".85rem" }}><strong>Please note:</strong> The figures below are general ballpark ranges for illustration only, not firm estimates or guarantees. Actual prices depend on your specific job and the contractor you hire. Always get a written estimate before any work begins.</p>

      <h2>Calgary Contractor Hourly Rates by Trade (2026)</h2>
      <BarChart
        title="Average Hourly Rates — Calgary Contractors"
        subtitle="Estimated 2026 market rates in CAD, before materials"
        unit="$/hr"
        data={[
          { label: "HVAC Technician",  value: 160, color: "#ea6b14" },
          { label: "Electrician",      value: 145, color: "#f59e0b" },
          { label: "Plumber",          value: 130, color: "#3b82f6" },
          { label: "General Handyman", value: 95,  color: "#22c55e" },
          { label: "Painter",          value: 75,  color: "#a855f7" },
          { label: "Cleaner",          value: 55,  color: "#6b7280" },
        ]}
      />

      <h2>Typical Job Costs for Common Requests</h2>
      <p><strong>Minor plumbing (leaky faucet, running toilet):</strong> $150–$300 including labour. Most jobs are done in under 2 hours.</p>
      <p><strong>Electrical outlet or switch replacement:</strong> $100–$200 per outlet for a licensed electrician. Panel work is $500–$2,000+.</p>
      <p><strong>Furnace inspection / tune-up:</strong> $150–$250. A full HVAC service including filter change, cleaning, and efficiency check typically runs $200–$350.</p>
      <p><strong>Drywall patch (small hole):</strong> $150–$400 depending on size. Full room drywall can run $1,500–$4,000+.</p>
      <p><strong>Interior painting (single room):</strong> $400–$900 in labour, depending on room size and prep needed. Materials add $80–$200.</p>
      <p><strong>Concrete / driveway crack repair:</strong> $200–$800 for minor cracks. Full resurfacing is $2,000–$6,000.</p>
      <p><strong>Appliance installation (dishwasher, washer/dryer):</strong> $150–$300 per unit.</p>
      <p><strong>Locksmith (lock change or rekey):</strong> $100–$250 depending on lock type.</p>

      <h2>Why Calgary Prices Are Higher Than the National Average</h2>
      <p>Calgary's strong economy and competitive labour market push contractor rates above national averages. The city also has strict building code enforcement, which means licensed trades command a premium — and you should be wary of bids that seem unusually low. Unlicensed or unpermitted work can create insurance and resale complications down the road, so it's worth confirming a contractor's credentials before hiring.</p>

      <h2>How to Know If You're Getting a Fair Price</h2>
      <p>On Freddy Fix It, you receive up to 7 bids from vetted contractors before committing. This gives you real market data for your specific job — not just estimates pulled from the internet. All bids are fixed-price: no surprise invoices at the end.</p>
    </article>
  );
}

function ArticleWinter() {
  return (
    <article>
      <p>Calgary's climate is unforgiving. With temperatures regularly dropping below -30°C and freeze-thaw cycles that stress every part of your home, preparation isn't optional — it's how you avoid emergency repair calls in January. Here's your complete 2026 winter prep checklist.</p>

      <h2>Heating System</h2>
      <p><strong>1. Schedule a furnace inspection.</strong> Book an HVAC technician to clean and inspect your furnace before the first cold snap. A dirty or failing furnace is the most common source of mid-winter emergency calls. Replace the filter while you're at it.</p>
      <p><strong>2. Test your thermostat.</strong> Set it to heat mode and confirm it kicks on. Smart thermostat users should check that schedules are set for winter hours.</p>
      <p><strong>3. Bleed your radiators</strong> (if you have a hot water heating system). Trapped air reduces efficiency and can leave rooms cold.</p>

      <h2>Plumbing</h2>
      <p><strong>4. Insulate exposed pipes.</strong> Any pipes in unheated spaces — garage, crawlspace, exterior walls — should be insulated with foam pipe wrap before temperatures drop. Burst pipes in Calgary can cause $20,000+ in damage.</p>
      <p><strong>5. Disconnect garden hoses.</strong> A hose left connected can cause the water inside the spigot to freeze and crack the fitting.</p>
      <p><strong>6. Know your main shutoff.</strong> Make sure every adult in the household knows where the main water shutoff is in case of a burst pipe.</p>

      <h2>Exterior</h2>
      <p><strong>7. Clean your gutters.</strong> Clogged gutters cause ice dams — a major source of roof and ceiling damage in Calgary homes. Clear leaves and debris before the first freeze.</p>
      <p><strong>8. Inspect your roof.</strong> Missing or cracked shingles before winter means water infiltration under snow load. A roofing contractor can do a visual inspection for $150–$300.</p>
      <p><strong>9. Seal doors and windows.</strong> Apply weatherstripping or caulk around drafty frames. This alone can reduce your heating bill by 10–15%.</p>
      <p><strong>10. Check your driveway and walkways.</strong> Fill cracks in concrete or asphalt before freeze-thaw cycles expand them into major damage.</p>

      <h2>Safety</h2>
      <p><strong>11. Test smoke and CO detectors.</strong> Carbon monoxide risk increases in winter when homes are sealed tight and furnaces run constantly. Replace batteries and test every detector.</p>
      <p><strong>12. Stock emergency supplies.</strong> Keep a snow shovel, ice melt, and emergency flashlights accessible. If you're on well water, know where your pump shutoff is.</p>

      <h2>When to Call a Pro</h2>
      <p>Furnace inspections, roof checks, insulation work, and gutter cleaning are all jobs that Calgary homeowners commonly hand off to contractors in September and October — before the rush hits. Booking early means better availability and often better prices. Post your job on Freddy Fix It to get 7 vetted estimates.</p>
    </article>
  );
}

function ArticleVetting() {
  return (
    <article>
      <p>Calgary's contractor market is busy and competitive, and not everything is verified at the point of hire. Homeowners who skip vetting may be taking on avoidable risk. Here's why it matters and what to look for.</p>
      <p style={{ background: "rgba(var(--ff-fg), .04)", border: "1px solid rgba(var(--ff-fg), .08)", borderRadius: 8, padding: "1rem 1.25rem", fontSize: ".85rem" }}><strong>Please note:</strong> This article is general information, not legal, insurance, or financial advice. Rules and coverage vary by situation. For your specific circumstances, check with your insurer and consult a qualified professional.</p>

      <h2>1. Unlicensed Work Could Affect Your Home Insurance</h2>
      <p>In Alberta, certain trade work — such as electrical, gas, and plumbing — is generally required to be performed by licensed tradespeople. Depending on your policy, an insurer could question or deny a claim connected to improper or unpermitted work, so it's worth confirming coverage details with your provider. As a sensible precaution, ask a contractor for their trade ticket before they start.</p>

      <h2>2. Uninsured Contractors Can Leave You Exposed</h2>
      <p>If an uninsured contractor is injured on your property or damages your home, you may have limited recourse — and depending on the circumstances, you could face liability questions of your own. If you're unsure where you stand, a quick conversation with your insurer or a lawyer is worthwhile. All contractors on Freddy Fix It are required to carry commercial general liability insurance before their first job.</p>

      <h2>3. Low Bids Often Come with Hidden Costs</h2>
      <p>The contractor who estimates $200 for a job that others estimated $600 for isn't saving you money — he's using inferior materials, cutting corners on code compliance, or planning to upcharge mid-job. Vetting helps you compare apples to apples: all licensed, all insured, all at fair market rates.</p>

      <h2>4. Not All Reviews Are Verified</h2>
      <p>On some platforms, reviews aren't tied to a confirmed transaction, which means they can be harder to trust. It's worth checking how a platform verifies its reviews. On Freddy Fix It, reviews are only unlocked after a job is marked complete by both parties — and tied to real transaction records.</p>

      <h2>5. Your Home Is Your Biggest Asset</h2>
      <p>A typical Calgary home is worth several hundred thousand dollars. Cutting corners on a small repair to save a little upfront rarely makes sense once you weigh the potential exposure. In many cases vetted contractors cost roughly the same as unvetted ones — so you're not necessarily paying a premium, you're reducing risk.</p>

      <h2>What "Vetted" Actually Means on Freddy Fix It</h2>
      <p>Before any contractor can accept work on our platform, they must submit: a valid Alberta trade licence or business registration, proof of commercial general liability insurance, and complete a profile review by our team. Contractors with ratings below 3.5 stars or a pattern of complaints are removed from the platform.</p>
    </article>
  );
}

function ArticlePlumberCost() {
  const [, setLocation] = useLocation();
  return (
    <article>
      <p>Plumbing problems don't wait for a convenient time — and neither should you. Whether it's a leaky faucet, a burst pipe, or a water heater replacement, having a rough sense of what Calgary plumbers charge in 2026 can help you spot a fair deal.</p>
      <p style={{ background: "rgba(var(--ff-fg), .04)", border: "1px solid rgba(var(--ff-fg), .08)", borderRadius: 8, padding: "1rem 1.25rem", fontSize: ".85rem" }}><strong>Please note:</strong> The figures below are general ballpark ranges for illustration only, not firm estimates or guarantees. Actual costs depend on your specific job and the contractor you hire. Always get a written estimate before work begins.</p>

      <h2>Calgary Plumber Rates by Job Type (2026)</h2>
      <BarChart
        title="Typical Plumbing Job Costs — Calgary 2026"
        subtitle="All-in cost estimates in CAD including labour; materials extra where noted"
        unit="$"
        data={[
          { label: "Water heater replacement", value: 1800, color: "#ea6b14" },
          { label: "Main shutoff valve",        value: 650,  color: "#f59e0b" },
          { label: "Toilet install/replace",    value: 350,  color: "#3b82f6" },
          { label: "Sump pump replacement",     value: 900,  color: "#22c55e" },
          { label: "Leaky faucet repair",       value: 200,  color: "#a855f7" },
          { label: "Drain clog clearing",       value: 175,  color: "#6b7280" },
        ]}
      />

      <h2>Hourly Rate vs Flat-Fee Jobs</h2>
      <p>Most Calgary plumbers charge <strong>$120–$160/hour</strong> with a 1-hour minimum. Simple jobs like clearing a slow drain or replacing a toilet fill valve are often estimated at a flat fee — usually $150–$250 all-in. Bigger jobs (water heater, main line repair) are typically flat-fee or time-and-materials.</p>
      <p><strong>Emergency / after-hours calls</strong> add a $75–$150 surcharge on top of the standard rate. If you can wait until Monday morning, you'll pay significantly less.</p>

      <h2>What Affects the Final Price?</h2>
      <p><strong>Access difficulty</strong> is the biggest variable. A toilet in a finished basement with tight clearances costs more to replace than one in an open main-floor bathroom. <strong>Pipe age and material</strong> matters too — old galvanized pipes are harder to work with than modern PEX.</p>
      <p><strong>Permit requirements</strong>: In Calgary, any work on the main water line or water heater requires a permit through the City. Licensed plumbers handle this automatically; unlicensed ones skip it — putting you at risk when you sell.</p>

      <h2>Red Flags to Watch For</h2>
      <p>Be cautious of any plumber who gives you a rock-bottom estimate over the phone without seeing the job, asks for full payment upfront, or can't provide a trade licence number. All plumbers on Freddy Fix It are licensed and insured — you get a fixed-price estimate before anyone touches your pipes.</p>

      <div style={{ background: "rgba(234,107,20,.08)", border: "1px solid rgba(234,107,20,.25)", borderRadius: 10, padding: "1.5rem", margin: "2.5rem 0", textAlign: "center" }}>
        <p style={{ fontSize: "1.1rem", fontWeight: 600, color: "var(--ff-text)", margin: "0 0 .75rem" }}>Need a plumber in Calgary? Get 7 fixed-price estimates from licensed pros.</p>
        <button onClick={() => setLocation("/client-onboarding")} style={{ background: "#ea6b14", color: "#fff", border: "none", borderRadius: 8, padding: ".75rem 2rem", fontSize: "1rem", fontWeight: 600, cursor: "pointer" }}>Post a Job — It's Free</button>
      </div>
    </article>
  );
}

function ArticleRoofCost() {
  const [, setLocation] = useLocation();
  return (
    <article>
      <p>Replacing a roof is one of the largest home maintenance expenses a Calgary homeowner will face. Hail seasons, heavy snow loads, and UV exposure mean Calgary roofs work harder than most. Here's a general sense of what a replacement can cost in 2026 — and what drives the price up or down.</p>
      <p style={{ background: "rgba(var(--ff-fg), .04)", border: "1px solid rgba(var(--ff-fg), .08)", borderRadius: 8, padding: "1rem 1.25rem", fontSize: ".85rem" }}><strong>Please note:</strong> The figures below are general ballpark ranges for illustration only, not firm estimates or guarantees. Roofing costs vary widely with materials, roof size, and condition. Always get a written estimate and an on-site assessment before committing.</p>

      <h2>Calgary Roof Replacement Cost by Size</h2>
      <BarChart
        title="Roof Replacement Cost — Calgary 2026"
        subtitle="Full removal and replace with standard 30-year asphalt shingles, labour + materials"
        unit="k$"
        data={[
          { label: "Small bungalow (1,000 sq ft)", value: 8,  color: "#ea6b14" },
          { label: "Average home (1,500 sq ft)",   value: 12, color: "#3b82f6" },
          { label: "Large home (2,200 sq ft)",     value: 17, color: "#22c55e" },
          { label: "Two-storey (2,800 sq ft)",     value: 22, color: "#a855f7" },
        ]}
      />

      <h2>What Drives the Price?</h2>
      <p><strong>Shingle type</strong> is the biggest lever. Standard 3-tab shingles cost $80–$100 per square (100 sq ft). Architectural/dimensional shingles run $110–$140 per square. Impact-resistant shingles (which can qualify for insurance discounts after Calgary hailstorms) cost $140–$180 per square.</p>
      <p><strong>Pitch and complexity</strong>: Steep roofs and those with multiple valleys, dormers, or skylights require more labour and safety equipment — adding 15–30% to the base cost.</p>
      <p><strong>Decking replacement</strong>: If the plywood sheathing underneath is rotted or damaged, it needs to be replaced at $3–$5 per sq ft. This is only discoverable once shingles are removed — a reputable contractor will show you the damage before proceeding.</p>

      <h2>Insurance Claims After Hail</h2>
      <p>Calgary is one of Canada's most hail-prone cities. If your roof was damaged in a storm, file an insurance claim before getting estimates — most policies cover replacement minus your deductible. Hire a contractor <em>after</em> the adjuster's visit, not before. Legitimate roofers will work with your insurer; those who pressure you to sign contracts first are a red flag.</p>

      <h2>Repair vs. Replace</h2>
      <p>If your roof is under 15 years old and damage is isolated (a few cracked shingles, one flashing failure), repair may be the right call — typically $300–$800. Over 20 years old or more than 30% damaged, replacement is almost always more cost-effective than patching.</p>

      <div style={{ background: "rgba(234,107,20,.08)", border: "1px solid rgba(234,107,20,.25)", borderRadius: 10, padding: "1.5rem", margin: "2.5rem 0", textAlign: "center" }}>
        <p style={{ fontSize: "1.1rem", fontWeight: 600, color: "var(--ff-text)", margin: "0 0 .75rem" }}>Get estimates from vetted Calgary roofers — no obligation.</p>
        <button onClick={() => setLocation("/client-onboarding")} style={{ background: "#ea6b14", color: "#fff", border: "none", borderRadius: 8, padding: ".75rem 2rem", fontSize: "1rem", fontWeight: 600, cursor: "pointer" }}>Post a Roofing Job</button>
      </div>
    </article>
  );
}

function ArticleSpring() {
  const [, setLocation] = useLocation();
  return (
    <article>
      <p>When Calgary's snow finally melts — usually late March through May — your home has been through months of freeze-thaw cycles, heavy snow loads, and sub-zero temperatures. Spring is the best time to assess the damage and get ahead of repairs before the summer rush drives up contractor wait times.</p>

      <h2>Start Outside: Exterior Inspection</h2>
      <p><strong>1. Walk your roof line.</strong> Look for missing, curled, or cracked shingles. Check that flashing around chimneys and vents is still sealed. Binoculars work fine — you don't need to climb up.</p>
      <p><strong>2. Clean your gutters and downspouts.</strong> Winter debris and ice can leave gutters packed solid. Clogged gutters cause foundation water infiltration and basement flooding — one of the most expensive problems Calgary homeowners face.</p>
      <p><strong>3. Inspect your foundation.</strong> Walk the perimeter and look for new cracks, heaving, or areas where soil has pulled away from the foundation wall. Spring is when freeze-thaw damage becomes visible.</p>
      <p><strong>4. Check your driveway and walkways.</strong> Fill asphalt and concrete cracks now, before summer heat cycles expand them further.</p>

      <h2>Inside: What Winter Reveals</h2>
      <p><strong>5. Look for water stains on ceilings.</strong> Ice dams and roof damage often leave staining that only becomes visible after spring melt. Light brown rings on drywall mean water got in — find the source before it happens again next winter.</p>
      <p><strong>6. Test your sump pump.</strong> Pour a bucket of water into the sump pit to confirm the pump kicks on. Spring is peak season for basement flooding in Calgary.</p>
      <p><strong>7. Switch your furnace filter.</strong> It's been running hard all winter. Replace the filter and consider an HVAC tune-up to restore efficiency before the A/C season begins.</p>

      <h2>Landscaping and Drainage</h2>
      <p><strong>8. Check your yard grading.</strong> The ground around your foundation should slope away from the house. Settled soil that now slopes toward the foundation is a common cause of basement water issues.</p>
      <p><strong>9. Reconnect and inspect hose bibs.</strong> Confirm your outdoor taps weren't damaged by winter freeze. A cracked fitting can leak inside the wall undetected for weeks.</p>

      <h2>Book Contractors Early</h2>
      <p>May and June are the busiest months for Calgary contractors — roofers, painters, and landscapers are booked solid by mid-April. If you identified issues this spring, post your job on Freddy Fix It now to get in the queue before wait times stretch to July.</p>

      <div style={{ background: "rgba(234,107,20,.08)", border: "1px solid rgba(234,107,20,.25)", borderRadius: 10, padding: "1.5rem", margin: "2.5rem 0", textAlign: "center" }}>
        <p style={{ fontSize: "1.1rem", fontWeight: 600, color: "var(--ff-text)", margin: "0 0 .75rem" }}>Book spring maintenance contractors before the rush — post a job today.</p>
        <button onClick={() => setLocation("/client-onboarding")} style={{ background: "#ea6b14", color: "#fff", border: "none", borderRadius: 8, padding: ".75rem 2rem", fontSize: "1rem", fontWeight: 600, cursor: "pointer" }}>Post a Job — It's Free</button>
      </div>
    </article>
  );
}

// ── Post manifest ────────────────────────────────────────────────────────────

function ArticleElectricianCost() {
  const [, setLocation] = useLocation();
  return (
    <article>
      <p>Whether you're adding a circuit for a hot tub, upgrading an aging panel, or finally fixing that dead outlet, electrical work is one area where cutting corners isn't worth it. Here's a rough sense of what Calgary electricians charge in 2026 so you can budget and spot a fair estimate.</p>
      <p style={{ background: "rgba(var(--ff-fg), .04)", border: "1px solid rgba(var(--ff-fg), .08)", borderRadius: 8, padding: "1rem 1.25rem", fontSize: ".85rem" }}><strong>Please note:</strong> The figures below are general ballpark ranges for illustration only, not firm estimates or guarantees. Actual costs depend on your specific job and the contractor you hire. Always get a written estimate before work begins.</p>

      <h2>Calgary Electrician Costs by Job Type (2026)</h2>
      <BarChart
        title="Typical Electrical Job Costs — Calgary 2026"
        subtitle="All-in cost estimates in CAD including labour; materials extra where noted"
        unit="$"
        data={[
          { label: "200A panel upgrade",      value: 2600, color: "#ea6b14" },
          { label: "EV charger install",      value: 1300, color: "#f59e0b" },
          { label: "Add a dedicated circuit", value: 450,  color: "#3b82f6" },
          { label: "Hot tub hookup",          value: 1100, color: "#22c55e" },
          { label: "Replace outlet/switch",   value: 150,  color: "#a855f7" },
          { label: "Install ceiling fan",     value: 250,  color: "#6b7280" },
        ]}
      />

      <h2>Hourly Rate vs Flat-Fee Jobs</h2>
      <p>Most Calgary electricians charge <strong>$110–$150/hour</strong> with a one-hour minimum and a service-call fee. Small, well-defined jobs — swapping a light fixture, adding an outlet — are usually estimated flat. Larger jobs like a panel upgrade or a sub-panel are almost always flat-fee after an on-site assessment.</p>
      <p><strong>Emergency / after-hours calls</strong> typically add a $90–$175 surcharge. A flickering light can usually wait for a regular weekday appointment; a burning smell or sparking outlet cannot — shut the breaker off and call right away.</p>

      <h2>What Affects the Final Price?</h2>
      <p><strong>Panel and wiring age</strong> is the biggest factor. Many older Calgary homes still have 60–100A panels or aluminum wiring, which can turn a "simple" addition into a larger upgrade. <strong>Wall access</strong> matters too — fishing wire through a finished, insulated wall costs more than open framing in a reno.</p>
      <p><strong>Permits and inspection</strong>: In Alberta, most electrical work requires a permit and an inspection by a Safety Codes Officer. Licensed electricians pull the permit and book the inspection as part of the job. Skipping it can void your home insurance and create problems when you sell.</p>

      <h2>Red Flags to Watch For</h2>
      <p>Be wary of anyone who offers to do panel or service work "without a permit to save you money," can't provide a Master Electrician or journeyman certification, or estimates a major job sight-unseen. Electrical mistakes cause fires — this is the wrong place to gamble. Every electrician on Freddy Fix It is licensed and insured, and you get a fixed-price estimate before any work starts.</p>

      <div style={{ background: "rgba(234,107,20,.08)", border: "1px solid rgba(234,107,20,.25)", borderRadius: 10, padding: "1.5rem", margin: "2.5rem 0", textAlign: "center" }}>
        <p style={{ fontSize: "1.1rem", fontWeight: 600, color: "var(--ff-text)", margin: "0 0 .75rem" }}>Need an electrician in Calgary? Get fixed-price estimates from licensed pros.</p>
        <button onClick={() => setLocation("/client-onboarding")} style={{ background: "#ea6b14", color: "#fff", border: "none", borderRadius: 8, padding: ".75rem 2rem", fontSize: "1rem", fontWeight: 600, cursor: "pointer" }}>Post a Job — It's Free</button>
      </div>
    </article>
  );
}

function ArticleFurnaceCost() {
  const [, setLocation] = useLocation();
  return (
    <article>
      <p>In Calgary, your furnace isn't a luxury — it's survival gear for seven months of the year. When it starts making noise, short-cycling, or quits on a -30°C night, you need to know whether you're looking at a cheap repair or a full replacement. Here's what to expect in 2026.</p>
      <p style={{ background: "rgba(var(--ff-fg), .04)", border: "1px solid rgba(var(--ff-fg), .08)", borderRadius: 8, padding: "1rem 1.25rem", fontSize: ".85rem" }}><strong>Please note:</strong> The figures below are general ballpark ranges for illustration only, not firm estimates or guarantees. Actual costs depend on your specific equipment, home, and the contractor you hire. Always get a written estimate before work begins.</p>

      <h2>Repair vs Replacement Costs (2026)</h2>
      <BarChart
        title="Typical Furnace Costs — Calgary 2026"
        subtitle="All-in cost estimates in CAD including labour"
        unit="$"
        data={[
          { label: "High-eff. replacement", value: 6000, color: "#ea6b14" },
          { label: "Mid-range replacement", value: 4500, color: "#f59e0b" },
          { label: "Blower motor repair",   value: 650,  color: "#3b82f6" },
          { label: "Ignitor / flame sensor", value: 300, color: "#22c55e" },
          { label: "Annual tune-up",        value: 150,  color: "#a855f7" },
          { label: "Diagnostic service call", value: 120, color: "#6b7280" },
        ]}
      />

      <h2>When to Repair vs Replace</h2>
      <p>A good rule of thumb: if your furnace is <strong>under 12 years old</strong> and the repair costs less than a third of a new unit, repair it. Most furnaces last 15–20 years with maintenance. Once you're past 15 years and facing a major repair like a cracked heat exchanger, replacement usually makes more financial sense — newer high-efficiency units (95–98% AFUE) also cut your gas bill meaningfully through a Calgary winter.</p>

      <h2>What Drives the Price of a Replacement</h2>
      <p><strong>Efficiency rating</strong> is the main lever — a 96%+ high-efficiency furnace costs more upfront but lowers monthly heating bills. <strong>Sizing and ductwork</strong> matter too: an oversized furnace short-cycles and wears out faster, so a proper heat-loss calculation is worth paying for. <strong>Venting changes</strong> (converting an old mid-efficiency unit to a high-efficiency one needs new PVC venting) add cost.</p>
      <p><strong>Permits</strong>: Furnace replacement requires a mechanical permit through the City of Calgary, and the install must be done by a licensed gas fitter. Reputable HVAC contractors handle this automatically.</p>

      <h2>Watch for Rebates</h2>
      <p>Federal and provincial efficiency rebate programs change year to year. Before you replace, ask your contractor whether your chosen unit qualifies for any current rebate — it can offset hundreds of dollars. Confirm any rebate directly with the program, as eligibility and amounts change often.</p>

      <h2>Red Flags to Watch For</h2>
      <p>Be cautious of a technician who pushes a full replacement on the first visit without showing you the failed part, or who can't provide a gas fitter licence. A cracked heat exchanger is a legitimate reason to replace — but ask to see it. Every HVAC pro on Freddy Fix It is licensed and insured, and you get a fixed-price estimate before any work begins.</p>

      <div style={{ background: "rgba(234,107,20,.08)", border: "1px solid rgba(234,107,20,.25)", borderRadius: 10, padding: "1.5rem", margin: "2.5rem 0", textAlign: "center" }}>
        <p style={{ fontSize: "1.1rem", fontWeight: 600, color: "var(--ff-text)", margin: "0 0 .75rem" }}>Furnace trouble? Get fixed-price estimates from licensed Calgary HVAC pros.</p>
        <button onClick={() => setLocation("/client-onboarding")} style={{ background: "#ea6b14", color: "#fff", border: "none", borderRadius: 8, padding: ".75rem 2rem", fontSize: "1rem", fontWeight: 600, cursor: "pointer" }}>Post a Job — It's Free</button>
      </div>
    </article>
  );
}

function ArticleHiringContractor() {
  const [, setLocation] = useLocation();
  return (
    <article>
      <p>Hiring the wrong contractor is expensive, stressful, and sometimes dangerous. The good news: a handful of questions up front will screen out most of the bad ones. Here's exactly what to ask before you let anyone start work on your Calgary home — plus how permits work in this city.</p>

      <h2>7 Questions to Ask Before You Hire</h2>
      <p><strong>1. Are you licensed for this trade, and can I see it?</strong> In Alberta, trades like electrical, plumbing, and gas fitting require certification. Ask for the number and don't be shy about it — legitimate contractors expect this.</p>
      <p><strong>2. Do you carry liability insurance and WCB coverage?</strong> Liability insurance protects your property if something goes wrong; WCB (Workers' Compensation) protects you if a worker is injured on your job. Without it, you could be on the hook.</p>
      <p><strong>3. Will you pull the required permits?</strong> A contractor who suggests skipping permits "to save money" is shifting risk onto you. More on permits below.</p>
      <p><strong>4. Can I get the estimate in writing, with a fixed price?</strong> A written, itemized estimate prevents the classic "the job grew" surprise on the final invoice.</p>
      <p><strong>5. What's the payment schedule?</strong> Be wary of anyone demanding full payment upfront. A deposit plus payment on completion (or staged for big jobs) is normal.</p>
      <p><strong>6. Do you offer a warranty on the work?</strong> Good contractors stand behind their labour. Ask what's covered and for how long.</p>
      <p><strong>7. Can you share references or recent reviews?</strong> Recent, verifiable feedback from other Calgary homeowners tells you more than a polished sales pitch.</p>

      <h2>How Permits Work in Calgary</h2>
      <p>Many homeowners don't realize how much work legally requires a permit. In Calgary, permits are generally required for structural changes, new or altered electrical circuits, plumbing and gas work, furnace and water heater replacement, decks above a certain height, and basement developments. Cosmetic work — painting, flooring, trim, simple fixture swaps — usually does not.</p>
      <p><strong>Why it matters to you:</strong> Permitted work is inspected by a Safety Codes Officer, which protects your safety and your insurance coverage. Unpermitted work can stall a home sale, fail an inspection, and void claims if something fails later. The contractor pulls the permit, but the responsibility ultimately attaches to your property — so confirm it's being done.</p>
      <p style={{ background: "rgba(var(--ff-fg), .04)", border: "1px solid rgba(var(--ff-fg), .08)", borderRadius: 8, padding: "1rem 1.25rem", fontSize: ".85rem" }}><strong>Tip:</strong> Permit rules and fees change. Confirm current requirements for your specific project directly with the City of Calgary before work begins.</p>

      <h2>Red Flags That Should End the Conversation</h2>
      <p>Walk away from anyone who pressures you to decide on the spot, only takes cash, won't put anything in writing, can't show a licence or insurance, or estimates a complex job without seeing it. These aren't quirks — they're how the costliest contractor horror stories start.</p>

      <h2>How Freddy Fix It Helps</h2>
      <p>Every contractor on Freddy Fix It submits a trade licence and proof of insurance before they can accept work, you get fixed-price estimates before anyone starts, and there's a built-in process if a job doesn't go as planned. It takes the screening work off your plate.</p>

      <div style={{ background: "rgba(234,107,20,.08)", border: "1px solid rgba(234,107,20,.25)", borderRadius: 10, padding: "1.5rem", margin: "2.5rem 0", textAlign: "center" }}>
        <p style={{ fontSize: "1.1rem", fontWeight: 600, color: "var(--ff-text)", margin: "0 0 .75rem" }}>Skip the screening — get estimates from licensed, insured Calgary contractors.</p>
        <button onClick={() => setLocation("/client-onboarding")} style={{ background: "#ea6b14", color: "#fff", border: "none", borderRadius: 8, padding: ".75rem 2rem", fontSize: "1rem", fontWeight: 600, cursor: "pointer" }}>Post a Job — It's Free</button>
      </div>
    </article>
  );
}

function ArticleBasementCost() {
  const [, setLocation] = useLocation();
  return (
    <article>
      <p>A finished basement is one of the best returns on a Calgary home — extra living space, a rental suite, or a place for the kids to disappear during a long winter. But "how much does it cost?" is the first question, and the honest answer is: it depends on what you build. Here's a plain-language 2026 breakdown.</p>
      <p style={{ background: "rgba(var(--ff-fg), .04)", border: "1px solid rgba(var(--ff-fg), .08)", borderRadius: 8, padding: "1rem 1.25rem", fontSize: ".85rem" }}><strong>Please note:</strong> The figures below are general 2026 ballpark ranges for illustration only, not firm estimates. Actual costs depend on your layout, finishes, and the contractor you hire. Always get a written estimate before work begins.</p>

      <h2>Cost Per Square Foot (2026)</h2>
      <BarChart
        title="Basement Development — Cost Per Sq Ft, Calgary 2026"
        subtitle="All-in estimates in CAD; finishes and suite requirements drive the range"
        unit=""
        data={[
          { label: "Legal suite (per sq ft)",   value: 95, color: "#ea6b14" },
          { label: "Full finish + bath",        value: 75, color: "#f59e0b" },
          { label: "Standard lifestyle finish", value: 60, color: "#3b82f6" },
          { label: "Basic / open rec room",     value: 45, color: "#22c55e" },
        ]}
      />
      <p>For a typical 800–1,000 sq ft Calgary basement, that works out to roughly <strong>$45,000–$65,000</strong> for a standard lifestyle finish and <strong>$65,000–$90,000+</strong> for a legal secondary suite with a kitchen, separate entrance, and egress windows.</p>

      <h2>Where the Money Goes</h2>
      <p><strong>Framing, insulation, and drywall</strong> form the base cost. On top of that, a <strong>bathroom</strong> is the single biggest line item — expect $8,000–$15,000 once plumbing, tile, and fixtures are in. A <strong>wet bar or suite kitchen</strong> adds several thousand more. Flooring, lighting, and trim finish out the budget, and higher-end materials can push the per-square-foot number well past the ranges above.</p>

      <h2>Permits and the 2026 Suite Amnesty</h2>
      <p>Basement development in Calgary requires a <strong>building permit</strong>, and electrical, plumbing, and gas work each require their own trade permits. Permit fees typically run <strong>$500–$1,500</strong> depending on scope, plus $1,500–$3,500 for the professional drawings the City needs and $800–$2,000 in engineering fees if you're touching anything structural.</p>
      <p>Worth knowing: the City of Calgary is <strong>waiving development permit and registry fees for secondary suites until December 31, 2026</strong> under its suite incentive program. If a legal rental suite is on your radar, 2026 is a cheaper year to make it official.</p>

      <h2>Lifestyle Finish vs Legal Suite</h2>
      <p>The gap between the two comes down to code. A <strong>legal suite</strong> needs a separate entrance, egress (escape) windows sized to code, a compliant kitchen, sound and fire separation, and its own heating and ventilation considerations. Those requirements are what push a suite $20,000–$30,000 above a comparable lifestyle finish — but they're also what let you legally rent it out and recover the cost.</p>

      <h2>Red Flags to Watch For</h2>
      <p>Be cautious of any estimate that skips permits to "save you money," lumps everything into one vague number with no breakdown, or asks for a large deposit before drawings exist. Unpermitted basement work is the classic problem that surfaces at resale — a home inspector flags it, and you pay to fix it twice. Every contractor on Freddy Fix It is licensed and insured, and pulls the permits the job needs.</p>

      <div style={{ background: "rgba(234,107,20,.08)", border: "1px solid rgba(234,107,20,.25)", borderRadius: 10, padding: "1.5rem", margin: "2.5rem 0", textAlign: "center" }}>
        <p style={{ fontSize: "1.1rem", fontWeight: 600, color: "var(--ff-text)", margin: "0 0 .75rem" }}>Planning a basement? Get fixed-price estimates from licensed Calgary contractors.</p>
        <button onClick={() => setLocation("/client-onboarding")} style={{ background: "#ea6b14", color: "#fff", border: "none", borderRadius: 8, padding: ".75rem 2rem", fontSize: "1rem", fontWeight: 600, cursor: "pointer" }}>Post a Job — It's Free</button>
      </div>
    </article>
  );
}

function ArticleWindshieldChip() {
  const [, setLocation] = useLocation();
  return (
    <article>
      <p>If you drive in Calgary, a rock chip is a matter of when, not if. Gravel on winter roads, construction on Deerfoot, and highway trips to the mountains all take a toll on your windshield. The good news: a small chip caught early is one of the cheapest fixes your vehicle will ever need. Ignore it, and it can spread into a crack that costs ten times as much.</p>
      <p style={{ background: "rgba(var(--ff-fg), .04)", border: "1px solid rgba(var(--ff-fg), .08)", borderRadius: 8, padding: "1rem 1.25rem", fontSize: ".85rem" }}><strong>Please note:</strong> Figures below are general 2026 Calgary ballpark ranges, not firm estimates, and are not insurance advice. Coverage varies by policy — confirm the details with your own insurer.</p>

      <h2>Repair vs Replace: The 2026 Cost Gap</h2>
      <BarChart
        title="Chip Repair vs Windshield Replacement — Calgary 2026"
        subtitle="Typical all-in cost in CAD; replacement varies by vehicle and sensors"
        unit="$"
        data={[
          { label: "Replace w/ ADAS calibration", value: 1000, color: "#ef4444" },
          { label: "Replace (SUV / heated glass)", value: 600,  color: "#f59e0b" },
          { label: "Replace (standard sedan)",      value: 375,  color: "#3b82f6" },
          { label: "Single chip repair",            value: 90,   color: "#22c55e" },
        ]}
      />
      <p>Chip repair in Calgary commonly runs <strong>$30–$150</strong> — many shops advertise a first chip around $30 and a small discount for a second. A full <strong>windshield replacement</strong> starts near $300–$400 for a basic sedan and climbs to <strong>$800–$1,000+</strong> for newer vehicles that need ADAS (driver-assist camera) recalibration after the glass is swapped.</p>

      <h2>When a Chip Can Still Be Repaired</h2>
      <p>As a rule of thumb, a chip smaller than a <strong>toonie</strong> and a crack shorter than about <strong>15 cm</strong> can usually be repaired — as long as it's not directly in the driver's line of sight and hasn't reached the edge of the glass. Repairs work by injecting resin into the damage to stop it spreading and restore strength. They won't leave the glass perfectly invisible, but they halt the problem.</p>
      <p><strong>Why speed matters in Calgary:</strong> our temperature swings are the enemy. A chip that's stable on a mild afternoon can run into a full crack overnight when it drops to -25°C, or when you blast the defroster onto cold glass. The sooner you get resin in it, the more likely repair beats replacement.</p>

      <h2>How Insurance Usually Treats It</h2>
      <p>Most comprehensive auto policies in Alberta cover chip repair with <strong>no deductible</strong> — insurers would much rather pay $90 now than $900 later, so many actively encourage it. A full replacement, by contrast, is typically subject to your <strong>comprehensive deductible</strong> (often $300–$500), which can mean you pay much of the cost out of pocket anyway. Check your policy, but for most drivers a no-deductible repair is close to a free fix.</p>

      <h2>Don't Wait — Calgary Reasons</h2>
      <p>Beyond cost, a cracked windshield in the driver's sightline can fail a commercial or out-of-province inspection and is a safety issue in low winter light. Catching chips early is the cheapest vehicle maintenance habit you can build living here.</p>

      <div style={{ background: "rgba(234,107,20,.08)", border: "1px solid rgba(234,107,20,.25)", borderRadius: 10, padding: "1.5rem", margin: "2.5rem 0", textAlign: "center" }}>
        <p style={{ fontSize: "1.1rem", fontWeight: 600, color: "var(--ff-text)", margin: "0 0 .75rem" }}>Need mobile auto glass or vehicle maintenance in Calgary? Get an estimate.</p>
        <button onClick={() => setLocation("/client-onboarding?service=Vehicle Maintenance")} style={{ background: "#ea6b14", color: "#fff", border: "none", borderRadius: 8, padding: ".75rem 2rem", fontSize: "1rem", fontWeight: 600, cursor: "pointer" }}>Post a Job — It's Free</button>
      </div>
    </article>
  );
}

function ArticleWinterTires() {
  const [, setLocation] = useLocation();
  return (
    <article>
      <p>Every Calgary fall, the same debate comes up: are winter tires actually worth it, or are all-seasons "good enough"? Having driven through a few -30 cold snaps and the first icy Crowchild commute of the season, most locals land in the same place. Here's the plain-language case, the 2026 costs, and when to make the swap.</p>
      <p style={{ background: "rgba(var(--ff-fg), .04)", border: "1px solid rgba(var(--ff-fg), .08)", borderRadius: 8, padding: "1rem 1.25rem", fontSize: ".85rem" }}><strong>Please note:</strong> General 2026 information for Calgary drivers, not insurance or safety advice. Discounts, laws, and prices change — confirm specifics with your insurer and installer.</p>

      <h2>Winter Tires vs All-Seasons: The Real Difference</h2>
      <p>It isn't just about snow — it's about <strong>temperature</strong>. All-season rubber stiffens once it drops below about <strong>7°C</strong>, which means less grip even on bare, dry pavement. Winter tires use a softer compound and aggressive siping that stays pliable in the cold. Modern winter tires can offer up to 50% more traction than all-seasons and cut braking distance on ice by up to about 25% — often the difference between stopping and sliding through an intersection.</p>

      <h2>When to Switch in Calgary</h2>
      <p>The trigger is that <strong>7°C</strong> mark, not the first snowfall. In Calgary that's usually <strong>mid-October</strong>. Swap back in April once overnight lows stay above freezing. A useful local tip: book your install appointment in September — shops fill up fast the week after the first surprise snow.</p>

      <h2>What a Set Costs in 2026</h2>
      <BarChart
        title="Winter Tire Setup — Typical Calgary Costs 2026"
        subtitle="Estimates in CAD; varies by tire size and vehicle"
        unit="$"
        data={[
          { label: "4 tires + rims (mounted)", value: 1400, color: "#ea6b14" },
          { label: "Set of 4 quality tires",   value: 1000, color: "#3b82f6" },
          { label: "Seasonal swap-over",        value: 90,   color: "#22c55e" },
          { label: "Seasonal storage",          value: 80,   color: "#a855f7" },
        ]}
      />
      <p>A quality set of four runs close to <strong>$1,000</strong>, and buying them on their own set of <strong>rims</strong> costs more up front but makes every seasonal swap faster and cheaper. Budget a <strong>$70–$100</strong> swap-over twice a year, plus optional storage if you don't have garage space.</p>

      <h2>The Insurance Discount Most People Miss</h2>
      <p>Alberta doesn't legally require winter tires on most roads (Banff and Jasper parks are the notable exception from November 1 to March 31), but many insurers offer a <strong>2–5% discount</strong> just for running a certified winter set. On a typical Calgary premium that quietly offsets a chunk of the swap-and-storage cost every year — call your broker and ask.</p>
      <p>One more money angle: rotating between two sets means each set lasts far longer, so you're not really buying "extra" tires — you're splitting the wear. Over a few winters, they largely pay for themselves.</p>

      <h2>Getting the Most From Them</h2>
      <p>Run all four (never just two — a mismatched set can make handling worse), keep them properly inflated since cold air drops pressure, and pair them with the rest of your cold-weather prep. For the full battery, block-heater, and fluids rundown, see our guide to <strong>winterizing your vehicle in Calgary</strong>.</p>

      <div style={{ background: "rgba(234,107,20,.08)", border: "1px solid rgba(234,107,20,.25)", borderRadius: 10, padding: "1.5rem", margin: "2.5rem 0", textAlign: "center" }}>
        <p style={{ fontSize: "1.1rem", fontWeight: 600, color: "var(--ff-text)", margin: "0 0 .75rem" }}>Need tires swapped or vehicle maintenance in Calgary? Get an estimate.</p>
        <button onClick={() => setLocation("/client-onboarding?service=Vehicle Maintenance")} style={{ background: "#ea6b14", color: "#fff", border: "none", borderRadius: 8, padding: ".75rem 2rem", fontSize: "1rem", fontWeight: 600, cursor: "pointer" }}>Post a Job — It's Free</button>
      </div>
    </article>
  );
}

function ArticleWinterizeVehicle() {
  const [, setLocation] = useLocation();
  return (
    <article>
      <p>Calgary winters test a vehicle harder than almost anywhere in Canada — not because of constant deep cold, but because of the swings. A +5°C chinook one day and -30°C the next is brutal on batteries, fluids, and anything rubber. A little prep in October saves you from a no-start morning in January. Here's the checklist that actually matters here.</p>
      <p style={{ background: "rgba(var(--ff-fg), .04)", border: "1px solid rgba(var(--ff-fg), .08)", borderRadius: 8, padding: "1rem 1.25rem", fontSize: ".85rem" }}><strong>Please note:</strong> General cold-weather guidance for Calgary drivers, not manufacturer-specific advice. Always follow your owner's manual for grades and intervals.</p>

      <h2>1. Test Your Battery Before It Fails</h2>
      <p>Cold is a battery killer: output can drop by <strong>up to 50%</strong> at sub-zero temperatures, and a battery that cranked fine in October can die on the first -25°C morning. Have it <strong>load-tested</strong> before winter — most shops do it free — and replace anything weak or older than about four years rather than gambling. If your car sits for days at a time, a battery maintainer keeps it topped up.</p>

      <h2>2. Know How to Use Your Block Heater</h2>
      <p>A block heater warms the coolant and, in turn, the oil, so the engine turns over easily and wears less on a cold start. The rule of thumb for Calgary: plug in once it's colder than about <strong>-15°C</strong>. You don't need it running all night — <strong>about 2 hours at -15°C, and closer to 4 hours below -30°C</strong> — so a simple outdoor timer set to switch on a few hours before you leave saves electricity and does the same job.</p>

      <h2>3. Switch to Winter-Grade Fluids</h2>
      <p>Two fluids matter most. First, <strong>washer fluid</strong>: use one rated to <strong>-40°C</strong>. Summer fluid freezes in the reservoir and lines exactly when Calgary slush is coating your windshield. Second, <strong>engine oil</strong>: a lower winter viscosity (the "W" grade in your manual) flows better on cold starts. Check your coolant's freeze protection too.</p>

      <h2>4. Wipers, Lights, and Glass</h2>
      <p>Swap tired wiper blades — winter or beam-style blades resist icing — and keep the glass clear; short winter days mean you're often driving in the dark. A cracked or chipped windshield is more likely to spread in the cold, so get chips fixed before the deep freeze (see our Calgary rock-chip guide).</p>

      <h2>5. Build a Winter Emergency Kit</h2>
      <p>Keep it in the vehicle, not the garage: a booster pack or cables, a small shovel and traction aid (sand, cat litter, or traction mats), an ice scraper and brush, a blanket, gloves, a flashlight, and some snacks and water. If you slide into a ditch on a rural road outside the city, this kit is what keeps you comfortable until help arrives.</p>

      <h2>6. Don't Forget the Tires</h2>
      <p>All the prep above matters less if you're still on all-seasons in January. Winter tires are the single biggest safety upgrade for Calgary driving — we cover timing, cost, and the insurance discount in our dedicated <strong>Calgary winter tires guide</strong>.</p>

      <div style={{ background: "rgba(234,107,20,.08)", border: "1px solid rgba(234,107,20,.25)", borderRadius: 10, padding: "1.5rem", margin: "2.5rem 0", textAlign: "center" }}>
        <p style={{ fontSize: "1.1rem", fontWeight: 600, color: "var(--ff-text)", margin: "0 0 .75rem" }}>Want your vehicle winter-ready? Get a maintenance estimate from a Calgary pro.</p>
        <button onClick={() => setLocation("/client-onboarding?service=Vehicle Maintenance")} style={{ background: "#ea6b14", color: "#fff", border: "none", borderRadius: 8, padding: ".75rem 2rem", fontSize: "1rem", fontWeight: 600, cursor: "pointer" }}>Post a Job — It's Free</button>
      </div>
    </article>
  );
}

const POSTS: Record<string, {
  title: string; date: string; readTime: string; tag: string;
  content: React.ComponentType;
}> = {
  "freddy-fix-it-vs-homestars-vs-jiffy-calgary": {
    title: "Freddy Fix It vs HomeStars vs Jiffy vs TaskRabbit: The Best Way to Find a Calgary Contractor in 2026",
    date: "June 10, 2026", readTime: "8 min read", tag: "Comparison",
    content: ArticleComparison,
  },
  "handyman-costs-calgary-2026": {
    title: "How Much Does a Handyman Cost in Calgary? 2026 Pricing Guide",
    date: "June 5, 2026", readTime: "5 min read", tag: "Pricing",
    content: ArticlePricing,
  },
  "calgary-home-winter-checklist": {
    title: "Calgary Home Winter Prep Checklist: 12 Things to Do Before the Cold Hits",
    date: "May 28, 2026", readTime: "6 min read", tag: "Maintenance",
    content: ArticleWinter,
  },
  "why-vet-contractors-calgary": {
    title: "5 Reasons to Always Use a Vetted Contractor in Calgary",
    date: "May 20, 2026", readTime: "4 min read", tag: "Tips",
    content: ArticleVetting,
  },
  "calgary-plumber-cost-2026": {
    title: "How Much Does a Plumber Cost in Calgary? 2026 Pricing Guide",
    date: "June 14, 2026", readTime: "5 min read", tag: "Pricing",
    content: ArticlePlumberCost,
  },
  "calgary-roof-replacement-cost-2026": {
    title: "Calgary Roof Replacement Cost: What You'll Actually Pay in 2026",
    date: "June 14, 2026", readTime: "6 min read", tag: "Pricing",
    content: ArticleRoofCost,
  },
  "calgary-spring-home-maintenance-checklist": {
    title: "Calgary Spring Home Maintenance Checklist: What to Do When the Snow Melts",
    date: "June 14, 2026", readTime: "5 min read", tag: "Maintenance",
    content: ArticleSpring,
  },
  "calgary-electrician-cost-2026": {
    title: "How Much Does an Electrician Cost in Calgary? 2026 Pricing Guide",
    date: "June 24, 2026", readTime: "5 min read", tag: "Pricing",
    content: ArticleElectricianCost,
  },
  "calgary-furnace-repair-replacement-cost-2026": {
    title: "Furnace Repair vs Replacement in Calgary: 2026 Cost Guide",
    date: "June 24, 2026", readTime: "6 min read", tag: "Pricing",
    content: ArticleFurnaceCost,
  },
  "hiring-a-contractor-calgary-questions-permits": {
    title: "Hiring a Contractor in Calgary: 7 Questions to Ask (and How Permits Work)",
    date: "June 24, 2026", readTime: "6 min read", tag: "Tips",
    content: ArticleHiringContractor,
  },
  "basement-development-cost-calgary-2026": {
    title: "Basement Development Cost in Calgary: 2026 Price Guide",
    date: "July 1, 2026", readTime: "6 min read", tag: "Pricing",
    content: ArticleBasementCost,
  },
  "calgary-windshield-rock-chip-repair-cost-2026": {
    title: "Windshield Rock Chip Repair in Calgary: 2026 Cost Guide (Repair vs Replace)",
    date: "July 2, 2026", readTime: "5 min read", tag: "Vehicle",
    content: ArticleWindshieldChip,
  },
  "calgary-winter-tires-guide-2026": {
    title: "Winter Tires in Calgary: Costs, Timing & the Insurance Discount (2026)",
    date: "July 2, 2026", readTime: "6 min read", tag: "Vehicle",
    content: ArticleWinterTires,
  },
  "winterize-your-vehicle-calgary": {
    title: "How to Winterize Your Vehicle for a Calgary Winter: 6-Point Checklist",
    date: "July 3, 2026", readTime: "6 min read", tag: "Vehicle",
    content: ArticleWinterizeVehicle,
  },
};

const TAG_COLORS: Record<string, string> = {
  Comparison: "#ea6b14", Pricing: "#3b82f6", Maintenance: "#22c55e", Tips: "#a855f7", Vehicle: "#14b8a6", Contractor: "#f59e0b",
};
const tagColor = (tag: string) => TAG_COLORS[tag] ?? "#a855f7";

// Short, search-friendly summaries used for each post's <meta description> and
// Open Graph tags (set client-side in BlogPost's effect).
const POST_DESCRIPTIONS: Record<string, string> = {
  "freddy-fix-it-vs-homestars-vs-jiffy-calgary": "A plain-language guide to the main types of contractor platforms in Calgary — active-dispatch marketplaces, directories, task platforms and classifieds — and how to weigh speed, vetting, pricing and protection.",
  "handyman-costs-calgary-2026": "2026 pricing guide for Calgary handyman and contractor work: hourly rates by trade plus typical costs for plumbing, electrical, drywall, painting, concrete and more.",
  "calgary-home-winter-checklist": "A 12-point Calgary winter home prep checklist covering heating, plumbing, exterior and safety — what to do before the cold hits to avoid emergency repairs.",
  "why-vet-contractors-calgary": "Five reasons Calgary homeowners should always hire vetted, licensed and insured contractors — and what 'vetted' actually means for your insurance and your home.",
  "calgary-plumber-cost-2026": "What Calgary plumbers charge in 2026: typical costs by job type, hourly vs flat-fee work, what drives the final price, and red flags to watch for.",
  "calgary-roof-replacement-cost-2026": "Calgary roof replacement costs in 2026 by home size, what drives the price, hail insurance claims, and when to repair vs replace.",
  "calgary-spring-home-maintenance-checklist": "A Calgary spring home maintenance checklist for when the snow melts — exterior, interior, landscaping and drainage tasks to tackle before the summer contractor rush.",
  "calgary-electrician-cost-2026": "What Calgary electricians charge in 2026: typical costs for panel upgrades, EV chargers, new circuits and outlet work, plus permits, hourly rates and red flags.",
  "calgary-furnace-repair-replacement-cost-2026": "Calgary furnace repair vs replacement costs in 2026: repair prices, replacement ranges by efficiency, when to replace, permits, rebates and red flags.",
  "hiring-a-contractor-calgary-questions-permits": "The 7 questions every Calgary homeowner should ask before hiring a contractor, plus how City of Calgary permits work and the red flags that should end the conversation.",
  "basement-development-cost-calgary-2026": "What it costs to develop a basement in Calgary in 2026: per-square-foot ranges, lifestyle finish vs legal suite, permits, the 2026 suite fee amnesty, and red flags to avoid.",
  "calgary-windshield-rock-chip-repair-cost-2026": "Windshield rock chip repair costs in Calgary for 2026: repair vs replacement pricing, when a chip is repairable, how Alberta insurance handles it, and why cold weather means acting fast.",
  "calgary-winter-tires-guide-2026": "Winter tires for Calgary drivers in 2026: winter vs all-season performance, when to switch, what a set costs, and the 2-5% Alberta insurance discount most people miss.",
  "winterize-your-vehicle-calgary": "A 6-point checklist to winterize your vehicle for a Calgary winter: battery testing, block heater use, winter-grade fluids, wipers, an emergency kit, and winter tires.",
};

// Create or update a meta/link tag in <head> so each article has its own
// title, description and Open Graph data when shared or crawled.
function upsertMeta(selector: string, attr: "name" | "property" | "rel", key: string, content: string, valueAttr: "content" | "href" = "content") {
  let el = document.head.querySelector(selector) as HTMLElement | null;
  if (!el) {
    el = document.createElement(selector.startsWith("link") ? "link" : "meta");
    el.setAttribute(attr, key);
    document.head.appendChild(el);
  }
  el.setAttribute(valueAttr, content);
}

// Free stock photos (Unsplash License) keyed by tag — used as a darkened hero image
// behind each article header. Photos: workbench tools by Sparsh Paliwal, suburban
// house by Jeff James. Swap in a Higgsfield/custom image by editing the URL.
const TAG_IMAGES: Record<string, string> = {
  Comparison: "https://images.unsplash.com/photo-1685320198649-781e83a61de4?auto=format&fit=crop&w=1600&q=70",
  Pricing:    "https://images.unsplash.com/photo-1685320198649-781e83a61de4?auto=format&fit=crop&w=1600&q=70",
  Tips:       "https://images.unsplash.com/photo-1685320198649-781e83a61de4?auto=format&fit=crop&w=1600&q=70",
  Maintenance:"https://images.unsplash.com/photo-1750128973550-750f796f431b?auto=format&fit=crop&w=1600&q=70",
  Vehicle:    "https://images.unsplash.com/photo-1502877338535-766e1452684a?auto=format&fit=crop&w=1600&q=70",
  Contractor: "https://images.unsplash.com/photo-1750128973550-750f796f431b?auto=format&fit=crop&w=1600&q=70",
};

// ── Page ─────────────────────────────────────────────────────────────────────

export default function BlogPost() {
  const params = useParams<{ slug: string }>();
  const [, setLocation] = useLocation();
  const post = POSTS[params.slug ?? ""];

  // DB fallback — weekly newsletter issues auto-published to blog_posts.
  const [dbPost, setDbPost] = useState<DbPost | null>(null);
  const [dbChecked, setDbChecked] = useState(false);
  useEffect(() => {
    if (post) return;
    let alive = true;
    setDbChecked(false);
    getDbPost(params.slug ?? "").then(p => {
      if (!alive) return;
      setDbPost(p);
      setDbChecked(true);
      if (!p) setLocation("/blog");
    });
    return () => { alive = false; };
  }, [post, params.slug, setLocation]);

  // Unified display fields (hardcoded article or DB post).
  const view = post
    ? { title: post.title, tag: post.tag, date: post.date, readTime: post.readTime,
        desc: POST_DESCRIPTIONS[params.slug ?? ""] ?? "Calgary home repair and contractor advice from Freddy Fix It." }
    : dbPost
      ? { title: dbPost.title, tag: dbPost.tag || "Tips", date: fmtDate(dbPost.published_at), readTime: readTime(dbPost.body_md),
          desc: dbPost.description || "Calgary home repair and contractor advice from Freddy Fix It." }
      : null;

  useEffect(() => {
    if (!view) return;

    const url = "https://freddyfixit.ca/blog/" + (params.slug ?? "");
    const fullTitle = view.title + " | Freddy Fix It";
    const prevTitle = document.title;
    document.title = fullTitle;

    upsertMeta('meta[name="description"]', "name", "description", view.desc);
    upsertMeta('link[rel="canonical"]', "rel", "canonical", url, "href");
    upsertMeta('meta[property="og:type"]', "property", "og:type", "article");
    upsertMeta('meta[property="og:title"]', "property", "og:title", view.title);
    upsertMeta('meta[property="og:description"]', "property", "og:description", view.desc);
    upsertMeta('meta[property="og:url"]', "property", "og:url", url);
    upsertMeta('meta[name="twitter:title"]', "name", "twitter:title", view.title);
    upsertMeta('meta[name="twitter:description"]', "name", "twitter:description", view.desc);

    return () => { document.title = prevTitle; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view?.title, params.slug]);

  if (!view) {
    // Waiting on the DB lookup (or about to redirect).
    if (!post && !dbChecked) {
      return (
        <div style={{ fontFamily: "'DM Sans',sans-serif", background: "var(--ff-bg)", color: "rgba(var(--ff-muted), .6)", minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center" }}>
          Loading article…
        </div>
      );
    }
    return null;
  }

  const Content = post ? post.content : () => <MdBody md={dbPost!.body_md} />;

  return (
    <div style={{ fontFamily: "'DM Sans',sans-serif", background: "var(--ff-bg)", backgroundImage: "radial-gradient(ellipse 55% 30% at 22% -2%, rgba(234,107,20,0.26) 0%, transparent 66%), radial-gradient(ellipse 50% 34% at 82% -6%, rgba(234,107,20,0.16) 0%, transparent 70%), repeating-linear-gradient(45deg, transparent 0 27px, rgba(var(--ff-fg), 0.02) 27px, rgba(var(--ff-fg), 0.02) 28px), repeating-linear-gradient(-45deg, transparent 0 27px, rgba(var(--ff-fg), 0.016) 27px, rgba(var(--ff-fg), 0.016) 28px)", backgroundAttachment: "fixed", color: "var(--ff-text)", minHeight: "100vh", padding: "6rem 1.5rem 5rem" }}>
      <link href="https://fonts.googleapis.com/css2?family=Bebas+Neue&family=DM+Sans:wght@300;400;500;600&display=swap" rel="stylesheet" />
      <style>{`
        h1,h2,h3{font-family:'Bebas Neue',sans-serif;letter-spacing:.06em}
        h2{color:#ea6b14;font-size:1.5rem;margin-top:2.5rem;margin-bottom:.6rem}
        h3{color:var(--ff-text);font-size:1.1rem;margin-top:1.4rem;margin-bottom:.3rem}
        article p{line-height:1.85;color:rgba(var(--ff-muted), .82);font-weight:300;margin-bottom:1rem}
        article strong{color:var(--ff-text);font-weight:500}
        article em{color:rgba(var(--ff-muted), .65)}
        .back-btn{background:transparent;border:1px solid rgba(var(--ff-fg), .12);color:rgba(var(--ff-muted), .6);padding:.4rem .9rem;border-radius:6px;cursor:pointer;font-size:.82rem;font-family:'DM Sans',sans-serif;transition:border-color .2s}
        .back-btn:hover{border-color:rgba(234,107,20,.4);color:var(--ff-text)}
      `}</style>

      <div style={{ maxWidth: "740px", margin: "0 auto" }}>
        <button className="back-btn" onClick={() => setLocation("/blog")}>← All Articles</button>

        {/* Header band — darkened stock photo (by tag) behind a tinted gradient.
            If the photo fails to load, the gradients still render the band gracefully. */}
        <div style={{
          position: "relative", overflow: "hidden", borderRadius: 16,
          border: "1px solid rgba(var(--ff-fg), .08)", margin: "2rem 0 3rem",
          padding: "2.75rem 1.75rem",
          background: "var(--ff-surface-141)",
          backgroundImage: `linear-gradient(rgba(var(--ff-bg-rgb), 0.80), rgba(var(--ff-bg-rgb), 0.90)), radial-gradient(ellipse 70% 90% at 12% 0%, ${tagColor(view.tag)}55 0%, transparent 60%), radial-gradient(ellipse 60% 80% at 95% 110%, rgba(234,107,20,.28) 0%, transparent 60%), url("${TAG_IMAGES[view.tag] ?? ""}")`,
          backgroundSize: "cover, cover, cover, cover",
          backgroundPosition: "center, center, center, center",
        }}>
          <span style={{ display: "inline-block", fontSize: ".72rem", fontWeight: 600, letterSpacing: ".1em", textTransform: "uppercase", color: tagColor(view.tag), background: tagColor(view.tag) + "22", padding: ".25rem .6rem", borderRadius: 4, marginBottom: ".9rem" }}>{view.tag}</span>

          <h1 style={{ fontSize: "clamp(1.8rem,4vw,2.8rem)", color: "var(--ff-text)", lineHeight: 1.2, marginBottom: "1rem" }}>{view.title}</h1>

          <div style={{ display: "flex", gap: "1.5rem", fontSize: ".8rem", color: "rgba(var(--ff-muted), .5)", flexWrap: "wrap" }}>
            <span>{view.date}</span>
            <span>{view.readTime}</span>
            <span>By Freddy Fix It Team</span>
          </div>
        </div>

        <Content />

        <div style={{ borderTop: "1px solid rgba(var(--ff-fg), .07)", marginTop: "3rem", paddingTop: "2rem", display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "1rem" }}>
          <button className="back-btn" onClick={() => setLocation("/blog")}>← Back to Blog</button>
          <button onClick={() => setLocation("/client-onboarding")} style={{ background: "#ea6b14", color: "#fff", border: "none", borderRadius: 8, padding: ".6rem 1.5rem", fontSize: ".9rem", fontWeight: 600, cursor: "pointer" }}>Post a Job</button>
        </div>
      </div>
    </div>
  );
}
