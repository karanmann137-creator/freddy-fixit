import { useEffect } from "react";
import { useParams, useLocation } from "wouter";

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
    <div style={{ background: "rgba(255,255,255,.03)", border: "1px solid rgba(255,255,255,.08)", borderRadius: 10, padding: "1.5rem", margin: "2rem 0" }}>
      <p style={{ fontFamily: "'Bebas Neue',sans-serif", letterSpacing: ".06em", fontSize: "1.1rem", color: "#f0f4ff", margin: "0 0 .25rem" }}>{title}</p>
      {subtitle && <p style={{ fontSize: ".78rem", color: "rgba(190,205,235,.4)", margin: "0 0 1rem" }}>{subtitle}</p>}
      <svg viewBox={`0 0 ${svgW} ${svgH}`} width="100%" style={{ overflow: "visible" }}>
        {data.map((d, i) => {
          const barW = (d.value / max) * barMax;
          const y = i * rowH;
          return (
            <g key={d.label}>
              <text x={labelW - 10} y={y + rowH / 2 + 5} textAnchor="end" fontSize={12} fill="rgba(190,205,235,.75)" fontFamily="DM Sans,sans-serif">{d.label}</text>
              <rect x={labelW} y={y + 8} width={barW} height={rowH - 18} rx={4} fill={d.color} opacity={.9} />
              <text x={labelW + barW + 8} y={y + rowH / 2 + 5} fontSize={12} fill={d.color} fontFamily="DM Sans,sans-serif" fontWeight="600">{d.value}{unit}</text>
            </g>
          );
        })}
      </svg>
      {lowerBetter && <p style={{ fontSize: ".75rem", color: "rgba(190,205,235,.35)", margin: ".5rem 0 0" }}>Lower is better</p>}
    </div>
  );
}

function FeatureTable({ rows }: { rows: { feature: string; freddy: boolean | string; jiffy: boolean | string; homestars: boolean | string; taskrabbit: boolean | string; housecall: boolean | string; kijiji: boolean | string }[] }) {
  const check = (v: boolean | string) =>
    v === true ? <span style={{ color: "#22c55e", fontWeight: 700 }}>✓</span>
    : v === false ? <span style={{ color: "#ef4444" }}>✗</span>
    : <span style={{ color: "rgba(190,205,235,.6)", fontSize: ".85rem" }}>{v}</span>;

  const cols = ["Feature", "Freddy Fix It", "Jiffy", "HomeStars", "TaskRabbit", "HouseCall Pro", "Kijiji"];
  const colColors = ["", "#ea6b14", "#3b82f6", "#ef4444", "#a855f7", "#10b981", "#6b7280"];

  return (
    <div style={{ overflowX: "auto", margin: "2rem 0" }}>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: ".88rem" }}>
        <thead>
          <tr>{cols.map((c, i) => (
            <th key={c} style={{ padding: ".6rem 1rem", textAlign: i === 0 ? "left" : "center", color: colColors[i] || "rgba(190,205,235,.5)", fontWeight: 600, fontSize: ".78rem", textTransform: "uppercase", letterSpacing: ".06em", borderBottom: "1px solid rgba(255,255,255,.1)" }}>{c}</th>
          ))}</tr>
        </thead>
        <tbody>{rows.map((r, i) => (
          <tr key={r.feature} style={{ background: i % 2 === 0 ? "transparent" : "rgba(255,255,255,.025)" }}>
            <td style={{ padding: ".65rem 1rem", color: "rgba(190,205,235,.8)", borderBottom: "1px solid rgba(255,255,255,.05)" }}>{r.feature}</td>
            {[r.freddy, r.jiffy, r.homestars, r.taskrabbit, r.housecall, r.kijiji].map((v, j) => (
              <td key={j} style={{ padding: ".65rem 1rem", textAlign: "center", borderBottom: "1px solid rgba(255,255,255,.05)" }}>{check(v)}</td>
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
      <p style={{ background: "rgba(255,255,255,.04)", border: "1px solid rgba(255,255,255,.08)", borderRadius: 8, padding: "1rem 1.25rem", fontSize: ".85rem" }}><strong>About this comparison:</strong> This article reflects our general understanding of how different kinds of platforms work, based on publicly available information as of 2026. Features, pricing, and policies change often and can vary by individual contractor. Always confirm the current details directly with each platform before deciding.</p>

      <p>If you're a Calgary homeowner looking to hire a contractor, you've got options — and they work in very different ways. Rather than rank specific companies, here's a plain-language guide to the main <em>types</em> of platforms and what to weigh with each.</p>

      <h2>The Main Types of Platforms</h2>
      <p><strong>Active-dispatch marketplaces</strong> (such as Freddy Fix It and Jiffy) push your job request directly to contractors who match it, instead of asking you to search a directory. The appeal is speed and convenience — you post once and qualified contractors come to you.</p>
      <p><strong>Directory and review platforms</strong> (such as HomeStars) let you browse contractor listings and reviews and reach out yourself. They're useful for research, but how quickly you hear back depends on individual contractors checking their leads.</p>
      <p><strong>General task platforms</strong> (such as TaskRabbit) cover a wide range of errands and tasks across many cities. Coverage and specialization for skilled home trades can vary by market.</p>
      <p><strong>Classified listings</strong> (such as Kijiji) connect you with individuals directly. There's no platform-level vetting, so checking licensing, insurance, and references is entirely up to you.</p>
      <p style={{ background: "rgba(255,255,255,.04)", border: "1px solid rgba(255,255,255,.08)", borderRadius: 8, padding: "1rem 1.25rem", fontSize: ".88rem" }}><strong>A note on HouseCall Pro:</strong> HouseCall Pro is primarily <em>contractor business software</em> — a scheduling and invoicing tool contractors use to run their operations, rather than a marketplace homeowners book through directly. We mention it because some contractors advertise that they "use HouseCall Pro," which can be confusing.</p>

      <h2>What to Compare</h2>
      <p><strong>Speed.</strong> If you need someone quickly, active-dispatch platforms generally connect you faster than browsing a directory and waiting for replies.</p>
      <p><strong>Vetting.</strong> This is where platforms differ most. Some, like Freddy Fix It, require contractors to submit a trade licence and proof of insurance before they can accept work. Others leave verification up to you. Whatever platform you use, confirm a contractor is licensed and insured before they start.</p>
      <p><strong>Pricing transparency.</strong> Look for fixed-price quotes before any work begins, so you aren't surprised by the final invoice.</p>
      <p><strong>Protection if something goes wrong.</strong> Check whether the platform offers any recourse, guarantee, or support if a job doesn't go as planned.</p>

      <h2>How Freddy Fix It Works</h2>
      <p>Freddy Fix It is built specifically for Calgary. Every contractor must submit their trade licence and proof of insurance before they can accept a job. You post once, receive up to three fixed-price bids from vetted contractors, and reviews are only unlocked after a job is completed and confirmed by both parties. We also offer recurring and seasonal scheduling for ongoing maintenance.</p>
      <p>Whichever platform you choose, the same fundamentals protect you: hire licensed, insured contractors, get the price in writing first, and keep records of the work.</p>

      <div style={{ background: "rgba(234,107,20,.08)", border: "1px solid rgba(234,107,20,.25)", borderRadius: 10, padding: "1.5rem", margin: "2.5rem 0", textAlign: "center" }}>
        <p style={{ fontSize: "1.1rem", fontWeight: 600, color: "#f0f4ff", margin: "0 0 .75rem" }}>Ready to try a fast way to find a vetted Calgary contractor?</p>
        <button onClick={() => setLocation("/client-onboarding")} style={{ background: "#ea6b14", color: "#fff", border: "none", borderRadius: 8, padding: ".75rem 2rem", fontSize: "1rem", fontWeight: 600, cursor: "pointer" }}>Post a Job — It's Free</button>
      </div>
    </article>
  );
}

function ArticlePricing() {
  return (
    <article>
      <p>One of the most common questions Calgary homeowners ask before hiring a contractor: <em>how much should I actually be paying?</em> Pricing varies by trade, job complexity, and contractor experience — but here are some general ranges to give you a rough sense in 2026.</p>
      <p style={{ background: "rgba(255,255,255,.04)", border: "1px solid rgba(255,255,255,.08)", borderRadius: 8, padding: "1rem 1.25rem", fontSize: ".85rem" }}><strong>Please note:</strong> The figures below are general estimates for illustration only, not quotes or guarantees. Actual prices depend on your specific job and the contractor you hire. Always get a written quote before any work begins.</p>

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
      <p>On Freddy Fix It, you receive up to 3 bids from vetted contractors before committing. This gives you real market data for your specific job — not just estimates pulled from the internet. All bids are fixed-price: no surprise invoices at the end.</p>
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
      <p>Furnace inspections, roof checks, insulation work, and gutter cleaning are all jobs that Calgary homeowners commonly hand off to contractors in September and October — before the rush hits. Booking early means better availability and often better prices. Post your job on Freddy Fix It to get 3 vetted quotes.</p>
    </article>
  );
}

function ArticleVetting() {
  return (
    <article>
      <p>Calgary's contractor market is busy and competitive, and not everything is verified at the point of hire. Homeowners who skip vetting may be taking on avoidable risk. Here's why it matters and what to look for.</p>
      <p style={{ background: "rgba(255,255,255,.04)", border: "1px solid rgba(255,255,255,.08)", borderRadius: 8, padding: "1rem 1.25rem", fontSize: ".85rem" }}><strong>Please note:</strong> This article is general information, not legal, insurance, or financial advice. Rules and coverage vary by situation. For your specific circumstances, check with your insurer and consult a qualified professional.</p>

      <h2>1. Unlicensed Work Could Affect Your Home Insurance</h2>
      <p>In Alberta, certain trade work — such as electrical, gas, and plumbing — is generally required to be performed by licensed tradespeople. Depending on your policy, an insurer could question or deny a claim connected to improper or unpermitted work, so it's worth confirming coverage details with your provider. As a sensible precaution, ask a contractor for their trade ticket before they start.</p>

      <h2>2. Uninsured Contractors Can Leave You Exposed</h2>
      <p>If an uninsured contractor is injured on your property or damages your home, you may have limited recourse — and depending on the circumstances, you could face liability questions of your own. If you're unsure where you stand, a quick conversation with your insurer or a lawyer is worthwhile. All contractors on Freddy Fix It are required to carry commercial general liability insurance before their first job.</p>

      <h2>3. Low Bids Often Come with Hidden Costs</h2>
      <p>The contractor who quotes $200 for a job that others quoted $600 for isn't saving you money — he's using inferior materials, cutting corners on code compliance, or planning to upcharge mid-job. Vetting helps you compare apples to apples: all licensed, all insured, all at fair market rates.</p>

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
      <p style={{ background: "rgba(255,255,255,.04)", border: "1px solid rgba(255,255,255,.08)", borderRadius: 8, padding: "1rem 1.25rem", fontSize: ".85rem" }}><strong>Please note:</strong> The figures below are general estimates for illustration only, not quotes or guarantees. Actual costs depend on your specific job and the contractor you hire. Always get a written quote before work begins.</p>

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
      <p>Most Calgary plumbers charge <strong>$120–$160/hour</strong> with a 1-hour minimum. Simple jobs like clearing a slow drain or replacing a toilet fill valve are often quoted at a flat fee — usually $150–$250 all-in. Bigger jobs (water heater, main line repair) are typically flat-fee or time-and-materials.</p>
      <p><strong>Emergency / after-hours calls</strong> add a $75–$150 surcharge on top of the standard rate. If you can wait until Monday morning, you'll pay significantly less.</p>

      <h2>What Affects the Final Price?</h2>
      <p><strong>Access difficulty</strong> is the biggest variable. A toilet in a finished basement with tight clearances costs more to replace than one in an open main-floor bathroom. <strong>Pipe age and material</strong> matters too — old galvanized pipes are harder to work with than modern PEX.</p>
      <p><strong>Permit requirements</strong>: In Calgary, any work on the main water line or water heater requires a permit through the City. Licensed plumbers handle this automatically; unlicensed ones skip it — putting you at risk when you sell.</p>

      <h2>Red Flags to Watch For</h2>
      <p>Be cautious of any plumber who gives you a rock-bottom quote over the phone without seeing the job, asks for full payment upfront, or can't provide a trade licence number. All plumbers on Freddy Fix It are licensed and insured — you get a fixed-price quote before anyone touches your pipes.</p>

      <div style={{ background: "rgba(234,107,20,.08)", border: "1px solid rgba(234,107,20,.25)", borderRadius: 10, padding: "1.5rem", margin: "2.5rem 0", textAlign: "center" }}>
        <p style={{ fontSize: "1.1rem", fontWeight: 600, color: "#f0f4ff", margin: "0 0 .75rem" }}>Need a plumber in Calgary? Get 3 fixed-price quotes from licensed pros.</p>
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
      <p style={{ background: "rgba(255,255,255,.04)", border: "1px solid rgba(255,255,255,.08)", borderRadius: 8, padding: "1rem 1.25rem", fontSize: ".85rem" }}><strong>Please note:</strong> The figures below are general estimates for illustration only, not quotes or guarantees. Roofing costs vary widely with materials, roof size, and condition. Always get a written quote and an on-site assessment before committing.</p>

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
      <p>Calgary is one of Canada's most hail-prone cities. If your roof was damaged in a storm, file an insurance claim before getting quotes — most policies cover replacement minus your deductible. Hire a contractor <em>after</em> the adjuster's visit, not before. Legitimate roofers will work with your insurer; those who pressure you to sign contracts first are a red flag.</p>

      <h2>Repair vs. Replace</h2>
      <p>If your roof is under 15 years old and damage is isolated (a few cracked shingles, one flashing failure), repair may be the right call — typically $300–$800. Over 20 years old or more than 30% damaged, replacement is almost always more cost-effective than patching.</p>

      <div style={{ background: "rgba(234,107,20,.08)", border: "1px solid rgba(234,107,20,.25)", borderRadius: 10, padding: "1.5rem", margin: "2.5rem 0", textAlign: "center" }}>
        <p style={{ fontSize: "1.1rem", fontWeight: 600, color: "#f0f4ff", margin: "0 0 .75rem" }}>Get quotes from vetted Calgary roofers — no obligation.</p>
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
        <p style={{ fontSize: "1.1rem", fontWeight: 600, color: "#f0f4ff", margin: "0 0 .75rem" }}>Book spring maintenance contractors before the rush — post a job today.</p>
        <button onClick={() => setLocation("/client-onboarding")} style={{ background: "#ea6b14", color: "#fff", border: "none", borderRadius: 8, padding: ".75rem 2rem", fontSize: "1rem", fontWeight: 600, cursor: "pointer" }}>Post a Job — It's Free</button>
      </div>
    </article>
  );
}

// ── Post manifest ────────────────────────────────────────────────────────────

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
};

const TAG_COLORS: Record<string, string> = {
  Comparison: "#ea6b14", Pricing: "#3b82f6", Maintenance: "#22c55e", Tips: "#a855f7",
};

// ── Page ─────────────────────────────────────────────────────────────────────

export default function BlogPost() {
  const params = useParams<{ slug: string }>();
  const [, setLocation] = useLocation();
  const post = POSTS[params.slug ?? ""];

  useEffect(() => {
    if (!post) setLocation("/blog");
  }, [post, setLocation]);

  if (!post) return null;

  const Content = post.content;

  return (
    <div style={{ fontFamily: "'DM Sans',sans-serif", background: "#1a2236", backgroundImage: "radial-gradient(ellipse 55% 30% at 22% -2%, rgba(234,107,20,0.26) 0%, transparent 66%), radial-gradient(ellipse 50% 34% at 82% -6%, rgba(234,107,20,0.16) 0%, transparent 70%), repeating-linear-gradient(45deg, transparent 0 27px, rgba(255,255,255,0.02) 27px, rgba(255,255,255,0.02) 28px), repeating-linear-gradient(-45deg, transparent 0 27px, rgba(255,255,255,0.016) 27px, rgba(255,255,255,0.016) 28px)", backgroundAttachment: "fixed", color: "#f0f4ff", minHeight: "100vh", padding: "6rem 1.5rem 5rem" }}>
      <link href="https://fonts.googleapis.com/css2?family=Bebas+Neue&family=DM+Sans:wght@300;400;500;600&display=swap" rel="stylesheet" />
      <style>{`
        h1,h2,h3{font-family:'Bebas Neue',sans-serif;letter-spacing:.06em}
        h2{color:#ea6b14;font-size:1.5rem;margin-top:2.5rem;margin-bottom:.6rem}
        h3{color:#f0f4ff;font-size:1.1rem;margin-top:1.4rem;margin-bottom:.3rem}
        article p{line-height:1.85;color:rgba(190,205,235,.82);font-weight:300;margin-bottom:1rem}
        article strong{color:#f0f4ff;font-weight:500}
        article em{color:rgba(190,205,235,.65)}
        .back-btn{background:transparent;border:1px solid rgba(255,255,255,.12);color:rgba(190,205,235,.6);padding:.4rem .9rem;border-radius:6px;cursor:pointer;font-size:.82rem;font-family:'DM Sans',sans-serif;transition:border-color .2s}
        .back-btn:hover{border-color:rgba(234,107,20,.4);color:#f0f4ff}
      `}</style>

      <div style={{ maxWidth: "740px", margin: "0 auto" }}>
        <button className="back-btn" onClick={() => setLocation("/blog")}>← All Articles</button>

        {/* Header band — textured for now; drop a `url(...)` photo into backgroundImage later for a per-post hero image */}
        <div style={{
          position: "relative", overflow: "hidden", borderRadius: 16,
          border: "1px solid rgba(255,255,255,.08)", margin: "2rem 0 3rem",
          padding: "2rem 1.75rem",
          background: "#141d2e",
          backgroundImage: `radial-gradient(ellipse 70% 90% at 12% 0%, ${TAG_COLORS[post.tag]}33 0%, transparent 60%), radial-gradient(ellipse 60% 80% at 95% 110%, rgba(234,107,20,.18) 0%, transparent 60%), repeating-linear-gradient(45deg, transparent 0 24px, rgba(255,255,255,.025) 24px, rgba(255,255,255,.025) 25px), repeating-linear-gradient(-45deg, transparent 0 24px, rgba(255,255,255,.02) 24px, rgba(255,255,255,.02) 25px)`,
        }}>
          <span style={{ display: "inline-block", fontSize: ".72rem", fontWeight: 600, letterSpacing: ".1em", textTransform: "uppercase", color: TAG_COLORS[post.tag], background: TAG_COLORS[post.tag] + "22", padding: ".25rem .6rem", borderRadius: 4, marginBottom: ".9rem" }}>{post.tag}</span>

          <h1 style={{ fontSize: "clamp(1.8rem,4vw,2.8rem)", color: "#f0f4ff", lineHeight: 1.2, marginBottom: "1rem" }}>{post.title}</h1>

          <div style={{ display: "flex", gap: "1.5rem", fontSize: ".8rem", color: "rgba(190,205,235,.5)", flexWrap: "wrap" }}>
            <span>{post.date}</span>
            <span>{post.readTime}</span>
            <span>By Freddy Fix It Team</span>
          </div>
        </div>

        <Content />

        <div style={{ borderTop: "1px solid rgba(255,255,255,.07)", marginTop: "3rem", paddingTop: "2rem", display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "1rem" }}>
          <button className="back-btn" onClick={() => setLocation("/blog")}>← Back to Blog</button>
          <button onClick={() => setLocation("/client-onboarding")} style={{ background: "#ea6b14", color: "#fff", border: "none", borderRadius: 8, padding: ".6rem 1.5rem", fontSize: ".9rem", fontWeight: 600, cursor: "pointer" }}>Post a Job</button>
        </div>
      </div>
    </div>
  );
}
