import { useEffect } from "react";
import { useParams, useLocation } from "wouter";
import { Ic } from "@/components/Ic";
import type { IconName } from "@/components/Ic";

// ─────────────────────────────────────────────────────────────────────────────
// Per-trade SEO landing pages. Each entry targets the searches people actually
// type ("handyman calgary", "calgary plumber", etc.). `name` MUST match the
// service label used on Home so the CTA pre-selects the right category.
// ─────────────────────────────────────────────────────────────────────────────
type FAQ = { q: string; a: string };
type Svc = {
  name: string;
  icon: IconName;
  metaTitle: string;
  metaDesc: string;
  h1: string;
  intro: string[];
  cover: string[];
  faqs: FAQ[];
  related: string[]; // other slugs
};

export const SERVICES: Record<string, Svc> = {
  "handyman": {
    name: "General Repairs",
    icon: "wrench",
    metaTitle: "Handyman in Calgary | Vetted, Licensed Local Pros — Freddy Fix It",
    metaDesc: "Need a handyman in Calgary? Post your job free and get up to 3 fixed-price estimates from vetted, insured local pros. Payment held safe until the work is done right.",
    h1: "Handyman Services in Calgary",
    intro: [
      "Looking for a reliable handyman in Calgary? Freddy Fix It connects you with vetted, licensed and insured local tradespeople for everything around the house — the small jobs most contractors won't return your call for, and the bigger ones too.",
      "Post your job in a couple of minutes, get up to three fixed-price estimates, and book the pro you like best. Your payment is held securely and only released once you confirm the work is done right.",
    ],
    cover: [
      "Mounting TVs, shelves, mirrors and artwork",
      "Furniture assembly and installation",
      "Door and lock repairs, weatherproofing",
      "Drywall patches and small paint touch-ups",
      "Fixture swaps — taps, lights, handles",
      "Picture-perfect odd jobs and punch lists",
    ],
    faqs: [
      { q: "How much does a handyman cost in Calgary?", a: "Most Calgary handyman work is estimated by the job rather than the hour, so you see one fixed price before you book. Small jobs typically start in the low hundreds. You get up to three estimates to compare, with no obligation." },
      { q: "Are your handymen vetted?", a: "Yes. Every contractor on Freddy Fix It is reviewed for licensing, insurance and WCB coverage where it applies, and you can read real reviews on their profile before you book." },
      { q: "What if the work isn't done right?", a: "Your payment is held until you confirm the job is complete. If something's wrong, you can file a claim and our team helps resolve it — including a refund where warranted." },
    ],
    related: ["carpentry", "drywall-flooring", "painting", "electrical"],
  },
  "plumbing": {
    name: "Plumbing",
    icon: "pipe",
    metaTitle: "Plumber in Calgary | Licensed & Insured | Up to 3 Estimates — Freddy Fix It",
    metaDesc: "Find a licensed plumber in Calgary fast. Post your leak, install or repair and get up to 3 fixed-price estimates from vetted local plumbers. Payment protected until you're satisfied.",
    h1: "Plumbers in Calgary",
    intro: [
      "From a dripping tap to a burst line, Freddy Fix It matches you with licensed, insured Calgary plumbers who show up and get it fixed. No call-around, no mystery pricing.",
      "Describe the problem, get up to three fixed-price estimates, and choose your plumber. Funds are held safely and released only when you confirm the job's done.",
    ],
    cover: [
      "Leak detection and repair",
      "Faucet, sink and toilet installs",
      "Water heater repair and replacement",
      "Drain clearing and unclogging",
      "Shut-off valve and supply-line work",
      "Fixture upgrades and rough-ins",
    ],
    faqs: [
      { q: "How fast can I get a plumber in Calgary?", a: "Once you post a job, vetted plumbers can estimate quickly. For urgent leaks, flag the job as urgent so nearby pros are notified right away." },
      { q: "Are the plumbers licensed?", a: "Yes — we verify licensing, insurance and WCB coverage. Plumbing in Alberta requires proper certification, and you can see a pro's credentials and reviews before booking." },
      { q: "Do I pay before the work is done?", a: "No. Your payment is held securely and only released to the plumber after you confirm the work is complete and correct." },
    ],
    related: ["electrical", "hvac", "handyman", "appliance-repair"],
  },
  "electrical": {
    name: "Electrical",
    icon: "zap",
    metaTitle: "Electrician in Calgary | Certified & Insured — Freddy Fix It",
    metaDesc: "Hire a certified electrician in Calgary. Post your job and get up to 3 fixed-price estimates from vetted, insured local electricians. Safe, code-compliant work, payment protected.",
    h1: "Electricians in Calgary",
    intro: [
      "Electrical work is no place to cut corners. Freddy Fix It connects you with certified, insured Calgary electricians for safe, code-compliant work — from a flickering light to a panel upgrade.",
      "Post the job, compare up to three fixed-price estimates, and book with confidence. Your money is held until you confirm the work is finished properly.",
    ],
    cover: [
      "Light fixtures, fans and dimmers",
      "Outlet, switch and GFCI installs",
      "Panel upgrades and breaker work",
      "EV charger and 240V circuits",
      "Troubleshooting and safety checks",
      "Pot lights and lighting design",
    ],
    faqs: [
      { q: "Are your electricians certified?", a: "Yes. We verify certification, insurance and WCB coverage. Electrical work in Alberta must be done to code, and qualified trades on Freddy Fix It pull permits where required." },
      { q: "Can I get an estimate for a panel upgrade?", a: "Absolutely. Describe the job (and add photos of your panel if you can) and you'll get up to three fixed-price estimates to compare." },
      { q: "Is my payment safe?", a: "Yes. Funds are held securely and released to the electrician only after you confirm the work is complete." },
    ],
    related: ["plumbing", "hvac", "handyman", "garage"],
  },
  "hvac": {
    name: "HVAC",
    icon: "thermometer",
    metaTitle: "HVAC & Furnace Repair in Calgary | Heating & Cooling — Freddy Fix It",
    metaDesc: "Furnace acting up? Get vetted Calgary HVAC pros for heating, cooling and ventilation. Post your job, get up to 3 fixed-price estimates. Payment held until you're satisfied.",
    h1: "HVAC, Furnace & Heating in Calgary",
    intro: [
      "Calgary winters don't wait. Freddy Fix It connects you with vetted HVAC technicians for furnace repair, maintenance, and cooling — so your home stays comfortable year-round.",
      "Post your job, get up to three fixed-price estimates, and book a pro. Payment is protected and only released when the work is confirmed done.",
    ],
    cover: [
      "Furnace repair and tune-ups",
      "No-heat and short-cycling diagnosis",
      "Thermostat installs and upgrades",
      "Air conditioning service",
      "Ventilation and ductwork",
      "Seasonal maintenance plans",
    ],
    faqs: [
      { q: "My furnace stopped working — how fast can someone come?", a: "Mark the job urgent and nearby HVAC pros are notified right away so you can get estimates and book quickly." },
      { q: "How much is a furnace tune-up in Calgary?", a: "Tune-ups are usually estimated as a flat job price. You'll see up to three estimates to compare before you commit — no surprise charges." },
      { q: "Are the technicians qualified?", a: "Yes — we verify licensing, insurance and WCB coverage, and you can read reviews before booking." },
    ],
    related: ["air-conditioning", "electrical", "plumbing", "handyman"],
  },
  "carpentry": {
    name: "Carpentry",
    icon: "hammer",
    metaTitle: "Carpenter in Calgary | Custom Builds & Repairs — Freddy Fix It",
    metaDesc: "Find a skilled carpenter in Calgary for custom builds, repairs and finishing. Post your job, get up to 3 fixed-price estimates from vetted local pros. Payment protected.",
    h1: "Carpentry in Calgary",
    intro: [
      "Whether it's custom shelving, trim, a deck repair or a built-in, Freddy Fix It matches you with skilled Calgary carpenters who do clean, finished work.",
      "Post your project, compare up to three fixed-price estimates, and book the carpenter whose work you like best — with your payment held until you're happy.",
    ],
    cover: [
      "Custom shelving and built-ins",
      "Trim, baseboards and finishing",
      "Deck and fence repair",
      "Door hanging and adjustments",
      "Framing and structural repairs",
      "Cabinetry and storage solutions",
    ],
    faqs: [
      { q: "Can I get an estimate for custom work?", a: "Yes. Describe what you want (photos and rough dimensions help) and you'll get up to three fixed-price estimates from local carpenters." },
      { q: "Are your carpenters insured?", a: "Every pro is reviewed for insurance and WCB coverage where it applies, with reviews visible on their profile." },
      { q: "When do I pay?", a: "Your payment is held securely and released only after you confirm the work is finished to your satisfaction." },
    ],
    related: ["drywall-flooring", "painting", "handyman", "concrete-masonry"],
  },
  "painting": {
    name: "Painting",
    icon: "paint-roller",
    metaTitle: "Painters in Calgary | Interior & Exterior — Freddy Fix It",
    metaDesc: "Hire vetted painters in Calgary for interior and exterior jobs. Post your project, get up to 3 fixed-price estimates from insured local pros. Payment held until you're satisfied.",
    h1: "Painters in Calgary",
    intro: [
      "A fresh coat changes everything. Freddy Fix It connects you with vetted Calgary painters for interior and exterior work — neat lines, proper prep, and no mess left behind.",
      "Post your job, get up to three fixed-price estimates, and book your painter. Payment is held until the work is confirmed done right.",
    ],
    cover: [
      "Interior walls, ceilings and trim",
      "Exterior and fence painting",
      "Cabinet refinishing",
      "Drywall prep and patching",
      "Accent walls and feature work",
      "Move-in / move-out repaints",
    ],
    faqs: [
      { q: "How much does painting cost in Calgary?", a: "Painting is usually estimated per room or per job. You'll get up to three fixed-price estimates so you can compare before booking." },
      { q: "Do painters supply the paint?", a: "That's up to each estimate — many include materials. Note your preference when you post and the pros will price accordingly." },
      { q: "Is my payment protected?", a: "Yes. Funds are held securely and only released once you confirm the job is complete." },
    ],
    related: ["drywall-flooring", "carpentry", "handyman", "cleaning"],
  },
  "drywall-flooring": {
    name: "Drywall & Flooring",
    icon: "layers",
    metaTitle: "Drywall & Flooring in Calgary | Patch to Full Install — Freddy Fix It",
    metaDesc: "Calgary drywall and flooring pros for patches, repairs and full installs. Post your job, get up to 3 fixed-price estimates from vetted locals. Payment held until you're happy.",
    h1: "Drywall & Flooring in Calgary",
    intro: [
      "From a single drywall patch to a full flooring install, Freddy Fix It connects you with vetted Calgary pros who leave a smooth, finished result.",
      "Post the job, compare up to three fixed-price estimates, and book — with your payment protected until you confirm the work is done.",
    ],
    cover: [
      "Drywall patches and full board",
      "Taping, mudding and texture",
      "Laminate, vinyl and hardwood",
      "Tile and subfloor repair",
      "Water-damage drywall repair",
      "Trim and transition strips",
    ],
    faqs: [
      { q: "Can you patch a small hole in drywall?", a: "Yes — small repairs are some of the most common jobs booked. Post it and you'll get fixed-price estimates fast." },
      { q: "Do you do full flooring installs?", a: "Absolutely. Describe the space and material and you'll get up to three estimates from flooring pros." },
      { q: "When is payment released?", a: "Only after you confirm the work is complete and correct. Funds are held securely until then." },
    ],
    related: ["painting", "carpentry", "handyman", "cleaning"],
  },
  "landscaping": {
    name: "Landscaping",
    icon: "tree",
    metaTitle: "Landscaping in Calgary | Lawn Care & Yard Work — Freddy Fix It",
    metaDesc: "Calgary landscaping, lawn care and yard cleanup from vetted local pros. Post your job, get up to 3 fixed-price estimates. Payment held until the work is done right.",
    h1: "Landscaping & Yard Work in Calgary",
    intro: [
      "Get your yard looking its best with vetted Calgary landscapers. Freddy Fix It covers everything from regular lawn care to seasonal cleanups and bigger yard projects.",
      "Post your job, get up to three fixed-price estimates, and book the crew you like. Payment is held until you confirm the work is finished.",
    ],
    cover: [
      "Lawn mowing and maintenance",
      "Spring and fall cleanups",
      "Sod, mulch and garden beds",
      "Tree and hedge trimming",
      "Yard junk and debris removal",
      "Hardscape and patio prep",
    ],
    faqs: [
      { q: "Do you offer recurring lawn care?", a: "Many landscapers estimate both one-time and recurring service. Note what you want when you post and pros will price accordingly." },
      { q: "How do estimates work?", a: "You get up to three fixed-price estimates to compare — no hourly surprises." },
      { q: "Is payment protected?", a: "Yes. Funds are held securely and released only after you confirm the job is done." },
    ],
    related: ["snow-removal", "concrete-masonry", "gutters", "handyman"],
  },
  "snow-removal": {
    name: "Snow Removal",
    icon: "snowflake",
    metaTitle: "Snow Removal in Calgary | Residential & Commercial — Freddy Fix It",
    metaDesc: "Reliable Calgary snow removal for driveways, walks and lots. Post your job, get up to 3 fixed-price estimates from vetted local crews. Payment held until you're satisfied.",
    h1: "Snow Removal in Calgary",
    intro: [
      "When the snow hits, Freddy Fix It connects you with vetted Calgary crews for driveways, walkways and commercial lots — one-time clears or season-long service.",
      "Post your job, compare up to three fixed-price estimates, and book. Payment is protected until the work is confirmed done.",
    ],
    cover: [
      "Driveway and walkway clearing",
      "Seasonal contracts",
      "Commercial lot clearing",
      "Ice control and salting",
      "Roof and emergency snow removal",
      "Post-storm priority service",
    ],
    faqs: [
      { q: "Can I book seasonal snow removal?", a: "Yes — note that you want a seasonal contract when you post and crews will estimate accordingly." },
      { q: "How fast after a storm?", a: "Mark the job urgent so nearby crews are notified right away and you can book quickly." },
      { q: "When do I pay?", a: "Your payment is held and released only after the clearing is confirmed complete." },
    ],
    related: ["landscaping", "gutters", "concrete-masonry", "handyman"],
  },
  "gutters": {
    name: "Gutters",
    icon: "cloud-rain",
    metaTitle: "Gutter Cleaning & Repair in Calgary — Freddy Fix It",
    metaDesc: "Calgary gutter cleaning, repair and installs from vetted local pros. Post your job, get up to 3 fixed-price estimates. Payment held until the work is done right.",
    h1: "Gutter Cleaning & Repair in Calgary",
    intro: [
      "Clogged or sagging gutters lead to bigger problems. Freddy Fix It connects you with vetted Calgary pros for cleaning, repair and new installs to protect your home.",
      "Post the job, compare up to three fixed-price estimates, and book — with payment held until you confirm it's done.",
    ],
    cover: [
      "Gutter cleaning and flushing",
      "Repair of sagging or leaking runs",
      "Downspout repair and extensions",
      "New gutter installation",
      "Gutter guards and screens",
      "Seasonal maintenance",
    ],
    faqs: [
      { q: "How often should Calgary gutters be cleaned?", a: "Twice a year is typical — spring and fall. Post the job and you'll get fixed-price estimates from local pros." },
      { q: "Can you fix a leaking gutter?", a: "Yes. Add a photo of the problem area when you post and you'll get accurate estimates." },
      { q: "Is payment protected?", a: "Yes — funds are held securely until you confirm the work is complete." },
    ],
    related: ["siding-roofing", "snow-removal", "landscaping", "handyman"],
  },
  "siding-roofing": {
    name: "Siding & Roofing",
    icon: "building",
    metaTitle: "Roofing & Siding in Calgary | Repair & Replace — Freddy Fix It",
    metaDesc: "Calgary roofing and siding repair, replacement and leak protection from vetted pros. Post your job, get up to 3 fixed-price estimates. Payment held until you're satisfied.",
    h1: "Roofing & Siding in Calgary",
    intro: [
      "Calgary's hail and wind are hard on roofs and siding. Freddy Fix It connects you with vetted pros for repairs, replacements and leak protection that hold up.",
      "Post your job, get up to three fixed-price estimates, and book with confidence — payment held until the work is confirmed done.",
    ],
    cover: [
      "Roof leak repair",
      "Shingle replacement",
      "Hail and storm damage",
      "Siding repair and replacement",
      "Flashing and vent work",
      "Roof inspections",
    ],
    faqs: [
      { q: "I had hail damage — can you help?", a: "Yes. Calgary sees serious hail, and storm-damage repair is one of the most common roofing jobs. Add photos when you post for accurate estimates." },
      { q: "Do you do full roof replacements?", a: "Absolutely — describe the roof and you'll get up to three fixed-price estimates from local roofers." },
      { q: "When do I pay?", a: "Funds are held securely and released only after you confirm the work is complete." },
    ],
    related: ["gutters", "concrete-masonry", "handyman", "windows-doors"],
  },
  "concrete-masonry": {
    name: "Concrete / Masonry",
    icon: "trowel",
    metaTitle: "Concrete & Masonry in Calgary | Driveways, Patios — Freddy Fix It",
    metaDesc: "Calgary concrete and masonry pros for driveways, patios, walks and repairs. Post your job, get up to 3 fixed-price estimates from vetted locals. Payment protected.",
    h1: "Concrete & Masonry in Calgary",
    intro: [
      "From a new driveway to a cracked walkway, Freddy Fix It connects you with vetted Calgary concrete and masonry pros who do solid, lasting work.",
      "Post your project, compare up to three fixed-price estimates, and book — with your payment held until you confirm the job's done.",
    ],
    cover: [
      "Driveways and walkways",
      "Patios and pads",
      "Crack and step repair",
      "Foundation and parging",
      "Brick and block masonry",
      "Retaining walls",
    ],
    faqs: [
      { q: "Can you repair cracked concrete?", a: "Yes — repairs are common. Add a photo when you post for accurate fixed-price estimates." },
      { q: "Do you pour new driveways?", a: "Absolutely. Describe the area and you'll get up to three estimates from local pros." },
      { q: "Is my payment safe?", a: "Yes — funds are held until you confirm the work is complete." },
    ],
    related: ["landscaping", "siding-roofing", "carpentry", "handyman"],
  },
  "appliance-repair": {
    name: "Appliance Repair / Install",
    icon: "refrigerator",
    metaTitle: "Appliance Repair in Calgary | Install & Fix — Freddy Fix It",
    metaDesc: "Calgary appliance repair and installation for all major brands. Post your job, get up to 3 fixed-price estimates from vetted local pros. Payment held until you're satisfied.",
    h1: "Appliance Repair & Install in Calgary",
    intro: [
      "When an appliance quits, Freddy Fix It connects you with vetted Calgary pros to repair or install washers, dryers, fridges, dishwashers and more.",
      "Post the make, model and problem, get up to three fixed-price estimates, and book. Payment is held until you confirm the fix.",
    ],
    cover: [
      "Washer and dryer repair",
      "Fridge and freezer service",
      "Dishwasher repair and install",
      "Stove, oven and range",
      "Appliance hookups and installs",
      "Diagnostics and parts",
    ],
    faqs: [
      { q: "Can you tell me if it's worth repairing?", a: "Pros will assess and estimate — often the diagnosis tells you whether repair or replacement makes more sense. Add the make and model when you post." },
      { q: "Do you install new appliances?", a: "Yes — installs and hookups are common jobs. Note what you need and you'll get fixed-price estimates." },
      { q: "When do I pay?", a: "Your payment is held and released only after you confirm the work is done." },
    ],
    related: ["plumbing", "electrical", "handyman", "hvac"],
  },
  "vehicle-maintenance": {
    name: "Vehicle Maintenance",
    icon: "car",
    metaTitle: "Mobile Vehicle Maintenance in Calgary | Oil, Tires, Brakes — Freddy Fix It",
    metaDesc: "Calgary vehicle maintenance — oil changes, tires, brakes and more from vetted local pros. Post your job, get up to 3 fixed-price estimates. Payment held until you're satisfied.",
    h1: "Vehicle Maintenance in Calgary",
    intro: [
      "Freddy Fix It isn't just for your home — get vetted Calgary pros for vehicle maintenance like oil changes, tire swaps, brakes and seasonal service.",
      "Post your vehicle and the service you need, get up to three fixed-price estimates, and book. Payment is held until the work is confirmed done.",
    ],
    cover: [
      "Oil and filter changes",
      "Tire swaps and seasonal changeover",
      "Brake service",
      "Battery and fluids",
      "Inspections and tune-ups",
      "Paint protection and detailing",
    ],
    faqs: [
      { q: "What vehicle services can I book?", a: "Common jobs include oil changes, tire changeovers, brakes and seasonal service. Add your make, model and year when you post." },
      { q: "How do estimates work?", a: "You'll get up to three fixed-price estimates to compare before you book — no hourly surprises." },
      { q: "Is payment protected?", a: "Yes — funds are held securely until you confirm the work is complete." },
    ],
    related: ["handyman", "appliance-repair", "electrical", "hvac"],
  },
  "air-conditioning": {
    name: "Air Conditioning",
    icon: "wind",
    metaTitle: "Air Conditioning in Calgary | AC Install & Repair — Freddy Fix It",
    metaDesc: "Calgary AC installs, tune-ups and repairs from vetted local pros. Post your job, get up to 3 fixed-price estimates. Payment held until the work is done right.",
    h1: "Air Conditioning in Calgary",
    intro: [
      "Calgary summers are getting warmer. Freddy Fix It connects you with vetted pros for AC installs, tune-ups and repairs so your home stays cool.",
      "Post your job, get up to three fixed-price estimates, and book — with payment held until you confirm the work is done.",
    ],
    cover: [
      "AC installation",
      "Tune-ups and maintenance",
      "Repair and diagnostics",
      "Ductless / mini-split systems",
      "Thermostat integration",
      "Seasonal start-up",
    ],
    faqs: [
      { q: "How much is AC install in Calgary?", a: "Installs are estimated as a flat job price. You'll get up to three estimates to compare before booking." },
      { q: "Can you repair an existing unit?", a: "Yes — describe the issue and you'll get fixed-price estimates from local HVAC pros." },
      { q: "Is payment protected?", a: "Yes — funds are held until you confirm the work is complete." },
    ],
    related: ["hvac", "electrical", "handyman", "plumbing"],
  },
  "windows-doors": {
    name: "Windows & Doors",
    icon: "door",
    metaTitle: "Window & Door Repair in Calgary | Install & Weatherproof — Freddy Fix It",
    metaDesc: "Calgary window and door repair, replacement and weatherproofing from vetted pros. Post your job, get up to 3 fixed-price estimates. Payment held until you're satisfied.",
    h1: "Windows & Doors in Calgary",
    intro: [
      "Drafty windows and sticky doors cost you comfort and heat. Freddy Fix It connects you with vetted Calgary pros for repairs, replacements and weatherproofing.",
      "Post your job, compare up to three fixed-price estimates, and book — with your payment held until the work is confirmed done.",
    ],
    cover: [
      "Door repair and adjustment",
      "Window repair and re-sealing",
      "Replacements and installs",
      "Weatherstripping and draft-proofing",
      "Lock and hardware swaps",
      "Screen and glass repair",
    ],
    faqs: [
      { q: "Can you fix a drafty door?", a: "Yes — weatherproofing and adjustments are common jobs. Post it for fixed-price estimates." },
      { q: "Do you install new windows?", a: "Absolutely. Describe the openings and you'll get up to three estimates from local pros." },
      { q: "When do I pay?", a: "Funds are held until you confirm the work is complete." },
    ],
    related: ["carpentry", "handyman", "siding-roofing", "garage"],
  },
  "garage": {
    name: "Garage",
    icon: "garage-door",
    metaTitle: "Garage Door Repair in Calgary | Openers & Builds — Freddy Fix It",
    metaDesc: "Calgary garage door repair, opener installs and builds from vetted local pros. Post your job, get up to 3 fixed-price estimates. Payment held until you're satisfied.",
    h1: "Garage Door & Garage Services in Calgary",
    intro: [
      "A broken garage door is a security and convenience problem. Freddy Fix It connects you with vetted Calgary pros for door repairs, openers, builds and more.",
      "Post your job, get up to three fixed-price estimates, and book — with payment held until you confirm the work is done.",
    ],
    cover: [
      "Garage door repair",
      "Spring and cable replacement",
      "Opener installs and fixes",
      "New door installation",
      "Garage builds and framing",
      "Weather seals and insulation",
    ],
    faqs: [
      { q: "My garage door won't open — can you help?", a: "Yes, and you can mark it urgent so nearby pros are notified quickly. Add a photo for accurate estimates." },
      { q: "Do you install openers?", a: "Absolutely — note the type you want and you'll get fixed-price estimates." },
      { q: "Is payment protected?", a: "Yes — funds are held until you confirm completion." },
    ],
    related: ["carpentry", "electrical", "windows-doors", "handyman"],
  },
  "cleaning": {
    name: "Cleaning Services",
    icon: "sparkles",
    metaTitle: "House Cleaning in Calgary | Deep & Move-Out Cleans — Freddy Fix It",
    metaDesc: "Calgary house cleaning — deep cleans, move-outs and regular upkeep from vetted pros. Post your job, get up to 3 fixed-price estimates. Payment held until you're satisfied.",
    h1: "Cleaning Services in Calgary",
    intro: [
      "Get your place spotless with vetted Calgary cleaners. Freddy Fix It covers deep cleans, move-in/move-out cleans, and regular upkeep.",
      "Post your job, compare up to three fixed-price estimates, and book the cleaner you like. Payment is held until you confirm the job's done.",
    ],
    cover: [
      "Deep cleans",
      "Move-in / move-out cleans",
      "Regular and recurring service",
      "Post-renovation cleanup",
      "Kitchen and bathroom detail",
      "Window and appliance cleaning",
    ],
    faqs: [
      { q: "Can I book a recurring clean?", a: "Yes — note that you want recurring service when you post and cleaners will estimate accordingly." },
      { q: "Do cleaners bring supplies?", a: "Most do — confirm in the estimate. Note any preferences when you post." },
      { q: "Is payment protected?", a: "Yes — funds are held until you confirm the work is complete." },
    ],
    related: ["painting", "drywall-flooring", "landscaping", "handyman"],
  },
};

export const SERVICE_SLUGS = Object.keys(SERVICES);

function upsertMeta(selector: string, attr: "name" | "property" | "rel", key: string, content: string, valueAttr: "content" | "href" = "content") {
  let el = document.head.querySelector(selector) as HTMLElement | null;
  if (!el) {
    el = document.createElement(selector.startsWith("link") ? "link" : "meta");
    el.setAttribute(attr, key);
    document.head.appendChild(el);
  }
  el.setAttribute(valueAttr, content);
}

const NAVY = "var(--ff-bg)";
const ORANGE = "#ea6b14";
const TEXT = "var(--ff-text)";
const MUTED = "rgba(var(--ff-muted), .82)";

export default function ServiceLanding() {
  const params = useParams<{ slug: string }>();
  const [, setLocation] = useLocation();
  const slug = params.slug ?? "";
  const svc = SERVICES[slug];

  useEffect(() => {
    if (!svc) { setLocation("/services"); return; }
    const url = "https://freddyfixit.ca/services/" + slug;
    const prevTitle = document.title;
    document.title = svc.metaTitle;
    upsertMeta('meta[name="description"]', "name", "description", svc.metaDesc);
    upsertMeta('link[rel="canonical"]', "rel", "canonical", url, "href");
    upsertMeta('meta[property="og:type"]', "property", "og:type", "website");
    upsertMeta('meta[property="og:title"]', "property", "og:title", svc.metaTitle);
    upsertMeta('meta[property="og:description"]', "property", "og:description", svc.metaDesc);
    upsertMeta('meta[property="og:url"]', "property", "og:url", url);
    upsertMeta('meta[name="twitter:title"]', "name", "twitter:title", svc.metaTitle);
    upsertMeta('meta[name="twitter:description"]', "name", "twitter:description", svc.metaDesc);

    // JSON-LD: Service + FAQPage so Google can show rich results.
    const ld = {
      "@context": "https://schema.org",
      "@graph": [
        {
          "@type": "Service",
          "name": svc.h1,
          "serviceType": svc.name,
          "areaServed": { "@type": "City", "name": "Calgary", "addressRegion": "AB", "addressCountry": "CA" },
          "provider": {
            "@type": "LocalBusiness",
            "name": "Freddy Fix It",
            "url": "https://freddyfixit.ca/",
            "email": "hello@freddyfixit.ca",
            "areaServed": "Calgary, AB",
            "priceRange": "$$",
          },
          "url": url,
          "description": svc.metaDesc,
        },
        {
          "@type": "FAQPage",
          "mainEntity": svc.faqs.map((f) => ({
            "@type": "Question",
            "name": f.q,
            "acceptedAnswer": { "@type": "Answer", "text": f.a },
          })),
        },
      ],
    };
    const script = document.createElement("script");
    script.type = "application/ld+json";
    script.setAttribute("data-svc-ld", "1");
    script.textContent = JSON.stringify(ld);
    document.head.appendChild(script);

    return () => {
      document.title = prevTitle;
      const ex = document.head.querySelector('script[data-svc-ld="1"]');
      if (ex) ex.remove();
    };
  }, [svc, slug, setLocation]);

  if (!svc) return null;

  const book = () => { window.location.href = "/client-onboarding?service=" + encodeURIComponent(svc.name); };

  return (
    <div style={{ fontFamily: "'DM Sans',sans-serif", background: NAVY, color: TEXT, minHeight: "100vh", padding: "6rem 1.5rem 5rem" }}>
      <link href="https://fonts.googleapis.com/css2?family=Bebas+Neue&family=DM+Sans:wght@300;400;500;600&display=swap" rel="stylesheet" />
      <style>{"h1,h2,h3{font-family:'Bebas Neue',sans-serif;letter-spacing:.05em} .sl-btn{background:#ea6b14;color:#fff;border:none;padding:.85rem 1.6rem;border-radius:8px;font-size:1.02rem;font-weight:600;cursor:pointer;font-family:'DM Sans',sans-serif;transition:transform .15s,box-shadow .15s} .sl-btn:hover{transform:translateY(-1px);box-shadow:0 8px 24px rgba(234,107,20,.32)} .sl-link{color:#ea6b14;text-decoration:none} .sl-link:hover{text-decoration:underline} .sl-card{background:var(--ff-surface);border:1px solid rgba(var(--ff-fg), .07);border-radius:12px;padding:1.1rem 1.2rem}"}</style>

      <div style={{ maxWidth: 820, margin: "0 auto" }}>
        <button onClick={() => setLocation("/services")} style={{ background: "transparent", border: "1px solid rgba(var(--ff-fg), .12)", color: "rgba(var(--ff-muted), .6)", padding: ".4rem .9rem", borderRadius: 6, cursor: "pointer", fontSize: ".82rem", fontFamily: "'DM Sans',sans-serif" }}>← All services</button>

        <div style={{ display: "flex", alignItems: "center", gap: "1rem", marginTop: "1.4rem" }}>
          <div style={{ width: 56, height: 56, borderRadius: 14, background: "rgba(234,107,20,.12)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
            <Ic name={svc.icon} size={30} color={ORANGE} />
          </div>
          <h1 style={{ fontSize: "2.4rem", margin: 0, lineHeight: 1.05 }}>{svc.h1}</h1>
        </div>

        {svc.intro.map((p, i) => (
          <p key={i} style={{ lineHeight: 1.8, color: MUTED, fontWeight: 300, marginTop: i === 0 ? "1.4rem" : "1rem", fontSize: "1.05rem" }}>{p}</p>
        ))}

        <div style={{ display: "flex", gap: ".8rem", flexWrap: "wrap", margin: "1.8rem 0 2.4rem" }}>
          <button className="sl-btn" onClick={book}>Get up to 3 free estimates →</button>
          <button className="sl-btn" style={{ background: "transparent", border: "1px solid rgba(234,107,20,.5)", color: TEXT }} onClick={() => setLocation("/get-a-quote")}>Get an estimate first</button>
        </div>

        <div style={{ display: "flex", gap: ".6rem", flexWrap: "wrap", marginBottom: "2.6rem" }}>
          {[
            { icon: "user-check", t: "Vetted, licensed & insured" },
            { icon: "dollar", t: "Payment held until you confirm" },
            { icon: "map-pin", t: "Calgary local" },
          ].map((b) => (
            <div key={b.t} style={{ display: "flex", alignItems: "center", gap: ".45rem", background: "var(--ff-surface)", border: "1px solid rgba(var(--ff-fg), .07)", borderRadius: 999, padding: ".4rem .9rem", fontSize: ".86rem", color: MUTED }}>
              <Ic name={b.icon as any} size={15} color={ORANGE} />{b.t}
            </div>
          ))}
        </div>

        <h2 style={{ color: ORANGE, fontSize: "1.5rem", marginBottom: "1rem" }}>What we cover</h2>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(240px,1fr))", gap: ".7rem", marginBottom: "2.6rem" }}>
          {svc.cover.map((c) => (
            <div key={c} style={{ display: "flex", alignItems: "flex-start", gap: ".5rem", color: MUTED, fontSize: ".98rem" }}>
              <span style={{ marginTop: 2 }}><Ic name="check-circle" size={16} color={ORANGE} /></span>{c}
            </div>
          ))}
        </div>

        <h2 style={{ color: ORANGE, fontSize: "1.5rem", marginBottom: "1rem" }}>How it works</h2>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(160px,1fr))", gap: ".8rem", marginBottom: "2.6rem" }}>
          {[
            { n: "1", t: "Post your job", d: "Tell us what you need — it takes a couple of minutes." },
            { n: "2", t: "Compare estimates", d: "Get up to 3 fixed-price estimates from vetted local pros." },
            { n: "3", t: "Book & relax", d: "Payment is held until you confirm the work is done right." },
          ].map((s) => (
            <div key={s.n} className="sl-card">
              <div style={{ color: ORANGE, fontFamily: "'Bebas Neue',sans-serif", fontSize: "1.6rem" }}>{s.n}</div>
              <div style={{ fontWeight: 600, margin: ".2rem 0 .3rem" }}>{s.t}</div>
              <div style={{ color: MUTED, fontSize: ".9rem", fontWeight: 300 }}>{s.d}</div>
            </div>
          ))}
        </div>

        <h2 style={{ color: ORANGE, fontSize: "1.5rem", marginBottom: "1rem" }}>Frequently asked</h2>
        <div style={{ marginBottom: "2.6rem" }}>
          {svc.faqs.map((f) => (
            <div key={f.q} style={{ marginBottom: "1.3rem" }}>
              <div style={{ fontWeight: 600, color: TEXT, marginBottom: ".35rem" }}>{f.q}</div>
              <div style={{ color: MUTED, fontWeight: 300, lineHeight: 1.7 }}>{f.a}</div>
            </div>
          ))}
        </div>

        <h2 style={{ color: ORANGE, fontSize: "1.3rem", marginBottom: "1rem" }}>Related services</h2>
        <div style={{ display: "flex", gap: ".6rem", flexWrap: "wrap", marginBottom: "3rem" }}>
          {svc.related.filter((r) => SERVICES[r]).map((r) => (
            <a key={r} className="sl-link" href={"/services/" + r} style={{ background: "var(--ff-surface)", border: "1px solid rgba(var(--ff-fg), .07)", borderRadius: 999, padding: ".4rem .9rem", fontSize: ".88rem" }}>{SERVICES[r].name}</a>
          ))}
        </div>

        <div style={{ background: "linear-gradient(135deg,rgba(234,107,20,.16),rgba(234,107,20,.04))", border: "1px solid rgba(234,107,20,.25)", borderRadius: 16, padding: "1.8rem", textAlign: "center" }}>
          <h2 style={{ fontSize: "1.7rem", marginBottom: ".5rem" }}>Ready to get started?</h2>
          <p style={{ color: MUTED, fontWeight: 300, marginBottom: "1.2rem" }}>Post your job free and get up to 3 fixed-price estimates from vetted Calgary pros.</p>
          <button className="sl-btn" onClick={book}>Get my free estimates →</button>
        </div>
      </div>
    </div>
  );
}
