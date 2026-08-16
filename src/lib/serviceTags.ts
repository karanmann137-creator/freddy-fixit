// Keyword map: turns a client's plain-English description into (a) the service
// label(s) our matcher understands and (b) a few descriptive tags they can see
// and remove. Deliberately dumb and deterministic — no AI, no network, no cost,
// and the client always gets the final say by tapping a tag off.
//
// The service labels here MUST match `SERVICES` in src/pages/ClientOnboarding.tsx,
// because that vocabulary is what `service_specialty_map` bridges to contractor
// specialties. An unmapped label passes through to every contractor, so a miss
// is never fatal — it just casts a wider net.

// ---------------------------------------------------------------------------
// Normalisation
// ---------------------------------------------------------------------------

// Lowercase, strip punctuation, collapse whitespace, and pad with spaces so a
// plain substring test behaves like a word-boundary match. Avoids per-keyword
// regex escaping ("a/c", "24/7", "3/4 inch") entirely.
function norm(text: string): string {
  return " " + String(text || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").replace(/\s+/g, " ").trim() + " ";
}

// Match the keyword plus its cheap inflections, because people write "painted"
// and "windows washed", not "paint" and "wash".
//
// The +"d" rule is gated on length >= 5 on purpose: without it "tire" would
// match "tired" and quietly turn "I'm tired of this leak" into a tire job.
// Returns the exact text it matched, or null. Returning the matched TEXT rather
// than a boolean is what stops double-counting: "leak" and "leaking" are both in
// the plumbing list, and both fire on the single word "leaking" — scoring that
// twice used to send "the roof is leaking" to a plumber.
function matchWord(padded: string, kw: string): string | null {
  const k = kw.toLowerCase().replace(/[^a-z0-9]+/g, " ").replace(/\s+/g, " ").trim();
  if (!k) return null;
  const forms = [k, k + "s", k + "es", k + "ed", k + "ing"];
  if (k.length >= 5 && k.endsWith("e")) {
    forms.push(k + "d", k.slice(0, -1) + "ing");
  }
  for (const f of forms) {
    if (padded.includes(" " + f + " ")) return f;
  }
  return null;
}

function hasWord(padded: string, kw: string): boolean {
  return matchWord(padded, kw) !== null;
}

// Symptom and action words describe what's wrong, not what the thing IS, so
// they show up in several service lists at once. They score half, which lets a
// subject noun win: "roof is leaking" is roofing, not plumbing, because "roof"
// names the thing and "leaking" only describes it.
const WEAK_WORDS = new Set([
  "leak", "leaking", "leaky", "drip", "dripping", "clog", "clogged", "crack", "cracked",
  "broken", "break", "noise", "noisy", "stuck", "jammed", "smell", "smelly", "wet", "damp",
  "flooded", "mold", "mould", "dead", "hole", "repair", "fix", "install", "replace",
  "clean", "cleaning", "service", "maintenance", "damage", "damaged", "old", "new",
  // Shared outdoor surfaces — a driveway can mean concrete, snow or pressure
  // washing, so the surface alone must never outrank the actual subject.
  "driveway", "sidewalk", "walkway", "curb",
  // Landmarks people use to say WHERE something is: "a bees nest by the front
  // door" is a pest job, not a door job.
  "front door", "back door", "front yard", "back yard", "backyard",
  // Rooms that are also services. On their own they only say WHERE the work is
  // — "paint the basement" is painting, "gutters on the garage" is gutters —
  // so the bare room name must lose to the actual subject. Both services keep
  // their full weight through phrases ("flooded basement", "garage door").
  "basement", "garage",
  // "move" is a verb before it's a service — "move in", "move out", "move a
  // switch", "moving a couch scraped the wall". Moving & Storage still wins on
  // "movers", "packing", "storage" and the "help me move" phrases.
  "move", "moving",
]);

// ---------------------------------------------------------------------------
// Service keywords
// ---------------------------------------------------------------------------

// Longer phrases score higher than single words, so "hot water tank" wins for
// Plumbing Repair even though "water" alone is nearly meaningless.
export const SERVICE_KEYWORDS: Record<string, string[]> = {
  "General Handyman": [
    "handyman", "odd job", "small job", "small repair", "general repair", "fix a few things",
    "honey do", "to do list", "mount", "mounting", "hang a shelf", "hang shelves", "shelf",
    "shelves", "picture", "mirror", "tv mount", "wall mount", "curtain rod", "blinds",
    "towel bar", "assemble", "assembly", "flat pack", "ikea", "childproof", "baby proof",
    "grab bar", "weather strip", "caulk", "caulking", "squeaky", "squeak", "wobbly", "loose",
  ],
  "Plumbing Repair": [
    "plumber", "plumbing", "toilet", "sink", "faucet", "tap", "drain", "clogged", "clog",
    "blocked drain", "leak", "leaking", "leaky", "dripping", "drip", "burst pipe", "pipe",
    "pipes", "water line", "shut off valve", "valve", "shower", "bathtub", "tub", "bath",
    "hot water tank", "water heater", "hot water", "no hot water", "sump pump", "garburator",
    "garbage disposal", "sewer", "sewer backup", "backflow", "p trap", "water pressure",
    "low water pressure", "running toilet", "toilet wont flush", "unclog", "rooter", "snake the drain",
  ],
  "Electrical Work": [
    "electrician", "electrical", "outlet", "receptacle", "plug in", "switch", "light switch",
    "breaker", "breaker panel", "electrical panel", "fuse", "fuse box", "tripping", "trips",
    "short circuit", "sparking", "spark", "wiring", "wire", "rewire", "gfci", "pot light",
    "pot lights", "potlight", "light fixture", "chandelier", "ceiling fan", "no power",
    "power out", "flickering", "flicker", "dimmer", "smoke detector", "carbon monoxide detector",
    "doorbell", "ev charger", "electric vehicle charger", "sub panel", "220v", "240v", "amp service",
  ],
  "HVAC Maintenance": [
    "hvac", "furnace", "no heat", "not heating", "heating", "heater", "boiler", "thermostat",
    "nest thermostat", "heat pump", "hrv", "air exchanger", "pilot light", "ignitor",
    "furnace filter", "furnace tune up", "furnace not working", "blowing cold", "radiant heat",
    "in floor heat", "baseboard heater", "gas fitter", "gas line", "gas leak",
  ],
  "Carpentry": [
    "carpenter", "carpentry", "trim", "baseboard", "moulding", "molding", "casing", "crown moulding",
    "built ins", "built in shelving", "built in cabinet", "bookshelf", "cabinet", "cabinets", "cabinetry", "countertop",
    "counter top", "stair", "stairs", "staircase", "railing", "handrail", "banister",
    "framing", "frame a wall", "wood rot", "rotten wood", "custom shelving", "closet organizer",
    "custom shelves", "build shelves", "build a shelf", "shelving", "floating shelf", "floating shelves",
    "door frame", "wood work", "woodwork", "finish carpentry",
  ],
  "Painting": [
    "paint", "painter", "painting", "repaint", "touch up paint", "primer", "prime",
    "interior paint", "exterior paint", "wall colour", "wall color", "peeling paint",
    "stain", "staining", "varnish", "lacquer", "spray paint", "ceiling paint", "accent wall",
    "wallpaper", "wall paper", "strip wallpaper",
    // Almost everything you can paint is ALSO a service here — fence, deck, siding,
    // cabinets, garage door. So a bare "paint" (1 pt) always lost to the object noun
    // and "repaint the fence" routed to Fencing. These verb+article phrases carry
    // multi-word weight so the ACTION wins over the thing being acted on.
    "paint the", "paint my", "paint our", "painting the", "painting my", "painting our",
    "repaint the", "repaint my", "repainting the", "get painted", "getting painted",
    // "garage door" is itself a 2-word phrase, so it needs a 3-word phrase to beat it.
    "paint the garage", "paint my garage", "painting the garage", "repaint the garage",
    // Same problem in the passive voice ("want the kitchen cabinets painted"), where
    // the object noun leads. Only compound objects need this — a one-word object
    // already loses to the 2-word verb phrases above.
    "cabinets painted", "cabinet painting", "cabinets repainted", "kitchen cabinets painted",
    "garage door painted", "front door painted",
    // Stain is a painter's job on a deck or fence, but "deck"/"fence" would tie it
    // and win alphabetically.
    "stain the deck", "staining the deck", "deck stained", "stain the fence", "fence stained",
  ],
  "Drywall / Flooring": [
    "drywall", "sheetrock", "gyproc", "mud and tape", "taping", "patch", "hole in the wall",
    "hole in wall", "crack in the wall", "wall crack", "texture", "stipple", "popcorn ceiling",
    "floor", "flooring", "hardwood", "laminate", "vinyl plank", "lvp", "tile", "tiles", "tiling",
    "grout", "subfloor", "underlay", "carpet", "carpet install", "baseboard trim", "squeaky floor",
    "floor squeak", "lino", "linoleum",
  ],
  "Oil Change": [
    "oil change", "engine oil", "oil filter", "synthetic oil", "lube oil filter", "lof", "oil service",
  ],
  "Tire Swap / Rotation": [
    "tire", "tires", "tyre", "winter tire", "summer tire", "all season tire", "tire swap",
    "tire change", "tire rotation", "rotate tires", "flat tire", "tire pressure", "balance tires",
    "wheel balance", "rim", "rims", "wheel swap", "seasonal tire",
  ],
  "Battery / Brakes": [
    "battery", "car battery", "dead battery", "wont start", "boost", "jump start", "alternator",
    "starter", "brake", "brakes", "brake pad", "brake pads", "rotor", "rotors", "brake fluid",
    "squealing brakes", "grinding brakes", "brake job", "caliper",
  ],
  "Vehicle Maintenance": [
    "vehicle", "car", "truck", "suv", "van", "auto", "automotive", "mechanic", "tune up",
    "check engine", "check engine light", "engine light", "transmission", "coolant", "radiator",
    "spark plug", "spark plugs", "serpentine belt", "timing belt", "muffler", "exhaust",
    "suspension", "shocks", "struts", "alignment", "wiper", "wipers", "windshield",
    "out of province inspection", "inspection", "detailing", "car detail", "ppf", "paint protection film",
    "window tint", "block heater",
  ],
  "Landscaping": [
    "landscaping", "landscape", "lawn", "lawn care", "grass", "mow", "mowing", "sod", "seeding",
    "aerate", "aeration", "power rake", "dethatch", "garden", "gardening", "flower bed", "mulch",
    "tree", "trees", "tree trim", "tree removal", "stump", "shrub", "hedge", "hedge trim", "pruning",
    "prune", "weed", "weeds", "weeding", "irrigation", "sprinkler", "sprinklers", "retaining wall",
    "rock", "gravel", "topsoil", "yard clean up", "yard cleanup", "spring cleanup", "fall cleanup",
    "artificial turf", "xeriscape",
  ],
  "Snow Removal": [
    "snow", "snow removal", "snow shovel", "shovel", "shovelling", "shoveling", "plow", "plough",
    "snow blow", "snowblower", "snowfall", "snow fall", "shovelled", "ice", "icy", "de ice", "deice", "ice melt", "salt the walk",
    "driveway snow", "sidewalk snow", "roof snow", "seasonal snow contract",
  ],
  "Gutters": [
    "gutter", "gutters", "downspout", "down spout", "gutter repair", "gutter install",
    "gutter guard", "leaf guard", "gutter leaking", "gutter pulling away", "fascia", "soffit",
  ],
  "Windows & Doors": [
    "window", "windows", "door", "doors", "front door", "back door", "patio door", "sliding door",
    "screen door", "storm door", "window seal", "foggy window", "broken window", "window replacement",
    "door install", "door wont close", "door sticking", "door handle", "hinge", "hinges",
    "weather stripping", "threshold", "casement", "egress window", "skylight",
  ],
  "Siding & Roofing": [
    "roof", "roofing", "roofer", "shingle", "shingles", "roof leak", "leaking roof", "flashing",
    "hail damage", "roof replacement", "re roof", "siding", "vinyl siding", "hardie", "stucco",
    "soffit and fascia", "chimney", "vent boot", "ice dam", "attic leak",
  ],
  "Garage": [
    "garage", "garage door", "overhead door", "garage door opener", "opener", "garage spring",
    "torsion spring", "garage door off track", "garage remote", "garage keypad", "garage floor",
    "detached garage", "garage build",
  ],
  "Air Conditioning": [
    "air conditioning", "air conditioner", "ac unit", "a c", "central air", "cooling",
    "not cooling", "ac not working", "ac install", "mini split", "ductless", "condenser",
    "evaporator coil", "refrigerant", "freon", "recharge ac", "window ac", "portable ac",
  ],
  "Cleaning Services": [
    "clean", "cleaning", "cleaner", "housekeeping", "deep clean", "move out clean",
    "move in clean", "post construction clean", "airbnb clean", "maid", "vacuum", "mop",
    "bathroom clean", "kitchen clean", "carpet clean", "carpet shampoo", "upholstery clean",
    "steam clean", "declutter", "organize", "organizing", "tidy",
  ],
  "Concrete / Masonry": [
    "concrete", "cement", "mason", "masonry", "brick", "bricks", "brick work", "mortar",
    "tuckpointing", "repoint", "stone", "stonework", "paver", "pavers", "flagstone",
    "sidewalk", "walkway", "driveway", "driveway repair", "concrete crack", "slab", "footing",
    "curb", "parging", "concrete pour", "stamped concrete",
  ],
  "Locksmith": [
    "lock", "locks", "locksmith", "locked out", "lockout", "rekey", "re key", "key", "keys",
    "deadbolt", "smart lock", "keypad lock", "door lock", "broken key", "key stuck",
    "change the locks", "mailbox lock", "safe",
  ],
  "Appliance Repair / Install": [
    "appliance", "appliances", "fridge", "refrigerator", "freezer", "stove", "oven", "range",
    "cooktop", "microwave", "hood fan", "range hood", "dishwasher", "washer", "washing machine",
    "dryer", "laundry", "dryer vent", "ice maker", "not draining", "not spinning",
    "appliance install", "hook up the fridge", "gas stove",
  ],
  "Solar": [
    "solar", "solar panel", "solar panels", "photovoltaic", "pv", "solar install",
    "solar quote", "net metering", "micro inverter", "inverter", "solar cleaning", "battery storage",
  ],
  "Moving & Storage": [
    "move", "moving", "movers", "mover", "relocate", "relocation", "packing", "pack up",
    "load the truck", "unload", "furniture move", "piano move", "storage", "storage unit",
    "heavy lifting", "move a couch", "move a fridge",
    // "move" and "moving" alone are WEAK (they're verbs before they're a service),
    // so a real moving job needs these phrases to out-score whatever room or object
    // is mentioned beside it — "help me move an old couch up the stairs" was landing
    // on Carpentry because of the word "stairs".
    "help me move", "help moving", "moving help", "move furniture", "moving furniture",
    "moving truck", "move my stuff", "move house", "moving day",
    // Deliberately NOT "move in" / "move out" — those are almost always time markers
    // for some OTHER job ("painted before we move in"), not a request for movers.
  ],
  "Junk Removal": [
    "junk", "junk removal", "haul", "haul away", "hauled away", "hauling", "dump run", "garbage removal", "trash removal",
    "debris", "old furniture", "furniture removal", "couch removal", "sofa removal", "mattress",
    "mattress removal", "appliance removal", "clear out", "cleanout",
    "estate cleanout", "bin rental", "dumpster",
  ],
  "Pest Control": [
    "pest", "pests", "pest control", "exterminator", "mice", "mouse", "rat", "rats", "rodent",
    "wasp", "wasps", "hornet", "bee", "bees", "wasp nest", "bee nest", "bees nest", "nest",
    "hive", "ant", "ants", "spider", "spiders",
    "cockroach", "roach", "bed bug", "bed bugs", "flea", "silverfish", "squirrel", "skunk",
    "bat", "infestation", "traps",
  ],
  "Duct Cleaning": [
    "duct", "ducts", "duct cleaning", "air duct", "vent cleaning", "furnace duct", "dryer vent clean",
    "dusty vent", "hvac cleaning", "ductwork",
  ],
  "Fencing": [
    "fence", "fences", "fencing", "fence post", "fence panel", "fence repair", "fence build",
    "chain link", "privacy fence", "gate", "gates", "gate wont close", "leaning fence", "picket",
  ],
  "Decks & Patios": [
    "deck", "decks", "deck build", "deck repair", "deck stain", "patio", "pergola", "gazebo",
    "railing on the deck", "composite deck", "trex", "deck board", "porch", "veranda",
  ],
  "Window Cleaning": [
    "window cleaning", "wash windows", "window wash", "windows washed", "washing windows",
    "clean the windows", "clean my windows", "clean windows", "window washer",
    "streaky windows", "exterior window cleaning", "high windows", "screen cleaning",
  ],
  "Home Renovations": [
    "renovation", "renovate", "reno", "remodel", "remodelling", "remodeling", "kitchen reno",
    "bathroom reno", "basement development", "develop the basement", "finish the basement",
    "addition", "gut", "tear out", "open concept", "load bearing", "permit", "general contractor",
    "full remodel", "legal suite", "secondary suite", "basement suite",
  ],
  "Insulation": [
    "insulation", "insulate", "attic insulation", "blown in", "batt", "batts", "spray foam",
    "vapour barrier", "vapor barrier", "cold room", "cold floor", "drafty", "draft", "drafts",
    "r value", "sound proof", "soundproofing", "rim joist",
  ],
  "Eavestrough Cleaning": [
    "eavestrough", "eaves trough", "eaves", "eavestrough cleaning", "clean the gutters",
    "gutter cleaning", "clogged gutter", "leaves in the gutter", "overflowing gutter",
  ],
  "Basement / Waterproofing": [
    "basement", "waterproofing", "waterproof", "water in the basement", "flooded basement",
    "flooding", "flood", "damp basement", "wet basement", "weeping tile", "foundation",
    "foundation crack", "crack in the foundation", "seepage", "moisture", "mold", "mould",
    "dehumidifier", "window well", "grading",
  ],
  "Pressure Washing": [
    "pressure wash", "pressure washing", "power wash", "power washing", "wash the driveway",
    "wash the siding", "wash the deck", "grimy", "algae", "moss", "oil stain on driveway",
  ],
};

// ---------------------------------------------------------------------------
// Descriptive tags
// ---------------------------------------------------------------------------

// These are the chips the client sees and can remove. They're grouped so the UI
// can show at most one or two per group instead of a wall of near-duplicates.
type TagRule = { tag: string; group: string; words: string[] };

const TAG_RULES: TagRule[] = [
  // --- symptom -------------------------------------------------------------
  { tag: "Leaking", group: "symptom", words: ["leak", "leaking", "leaky", "drip", "dripping", "seepage", "water coming"] },
  { tag: "Clogged", group: "symptom", words: ["clog", "clogged", "blocked", "backed up", "backing up", "wont drain", "slow drain", "plugged"] },
  { tag: "Not working", group: "symptom", words: ["not working", "wont work", "doesnt work", "stopped working", "no power", "no heat", "not heating", "not cooling", "dead", "broken down", "quit"] },
  { tag: "Broken", group: "symptom", words: ["broke", "broken", "smashed", "shattered", "snapped", "busted"] },
  { tag: "Cracked", group: "symptom", words: ["crack", "cracked", "cracking", "split", "hole"] },
  { tag: "Noisy", group: "symptom", words: ["noise", "noisy", "loud", "banging", "rattling", "squeak", "squeaking", "squealing", "grinding", "humming", "buzzing"] },
  { tag: "Smell", group: "symptom", words: ["smell", "smells", "smelly", "odour", "odor", "stink", "musty"] },
  { tag: "Water damage", group: "symptom", words: ["water damage", "flooded", "flooding", "soaked", "wet", "damp", "mold", "mould", "stain on the ceiling"] },
  { tag: "Stuck", group: "symptom", words: ["stuck", "jammed", "wont open", "wont close", "seized", "off track"] },

  // --- work type -----------------------------------------------------------
  { tag: "New install", group: "work", words: ["install", "installation", "put in", "add a", "brand new", "hook up", "set up"] },
  { tag: "Replacement", group: "work", words: ["replace", "replacement", "swap", "change out", "new one"] },
  { tag: "Repair", group: "work", words: ["repair", "fix", "fixing", "patch", "mend"] },
  { tag: "Maintenance", group: "work", words: ["maintenance", "service", "tune up", "annual", "inspect", "inspection", "check up", "seasonal"] },
  { tag: "Removal", group: "work", words: ["remove", "removal", "tear out", "haul away", "get rid of", "demo", "demolition"] },
  { tag: "Quote only", group: "work", words: ["just a quote", "ballpark", "how much would", "pricing", "estimate only", "curious"] },

  // --- location ------------------------------------------------------------
  { tag: "Kitchen", group: "where", words: ["kitchen"] },
  { tag: "Bathroom", group: "where", words: ["bathroom", "washroom", "ensuite", "powder room"] },
  { tag: "Basement", group: "where", words: ["basement", "cellar", "lower level"] },
  { tag: "Garage", group: "where", words: ["garage"] },
  { tag: "Attic", group: "where", words: ["attic", "crawl space"] },
  { tag: "Bedroom", group: "where", words: ["bedroom", "master"] },
  { tag: "Laundry room", group: "where", words: ["laundry", "laundry room", "utility room"] },
  { tag: "Outside", group: "where", words: ["outside", "outdoor", "exterior", "backyard", "back yard", "front yard", "yard", "driveway", "deck", "patio", "roof", "curb"] },

  // --- urgency -------------------------------------------------------------
  { tag: "Urgent", group: "urgency", words: ["urgent", "emergency", "asap", "right away", "today", "tonight", "immediately", "cant wait", "as soon as possible"] },
  { tag: "Flexible timing", group: "urgency", words: ["no rush", "whenever", "flexible", "not urgent", "next month", "sometime"] },

  // --- property ------------------------------------------------------------
  { tag: "Rental property", group: "property", words: ["rental", "tenant", "tenants", "landlord", "airbnb", "investment property"] },
  { tag: "Condo", group: "property", words: ["condo", "apartment", "townhouse", "town house", "strata"] },
  { tag: "Commercial", group: "property", words: ["office", "shop", "store", "restaurant", "commercial", "business", "warehouse"] },

  // --- access / constraints ------------------------------------------------
  { tag: "Second storey", group: "access", words: ["second floor", "second storey", "second story", "upstairs", "two storey", "high up", "ladder"] },
  { tag: "Pets on site", group: "access", words: ["dog", "dogs", "cat", "cats", "pet", "pets"] },
  { tag: "Older home", group: "access", words: ["old house", "older home", "1950", "1960", "1970", "character home", "heritage"] },
];

// ---------------------------------------------------------------------------
// Detection
// ---------------------------------------------------------------------------

export type Detection = {
  /** Matched service labels, best match first. May be empty. */
  services: string[];
  /** Descriptive chips the client can remove. May be empty. */
  tags: string[];
};

/** Score every service label against the text; return the strongest matches. */
export function detectServices(text: string, limit = 3): string[] {
  const padded = norm(text);
  if (padded.trim().length < 3) return [];

  const scored: { label: string; score: number }[] = [];
  for (const label of Object.keys(SERVICE_KEYWORDS)) {
    // Keyed by the matched TEXT, not the keyword, so two keywords that fire on
    // the same word ("leak" and "leaking") count once — at the better of the
    // two scores.
    const hits = new Map<string, number>();
    for (const kw of SERVICE_KEYWORDS[label]) {
      const found = matchWord(padded, kw);
      if (!found) continue;
      // A multi-word phrase is far more telling than a single common word —
      // unless it's just saying where the problem is ("front door").
      const wordCount = kw.trim().split(/\s+/).length;
      const weak = WEAK_WORDS.has(kw.toLowerCase());
      const value = wordCount > 1 ? wordCount * (weak ? 1 : 2) : (weak ? 0.5 : 1);
      hits.set(found, Math.max(hits.get(found) ?? 0, value));
    }
    let score = 0;
    for (const v of hits.values()) score += v;
    if (score > 0) scored.push({ label, score });
  }

  scored.sort((a, b) => (b.score - a.score) || a.label.localeCompare(b.label));

  // The best match always survives — a single decisive word like "furnace" or
  // "eavestrough" scores 1, and dropping it would leave the client with nothing.
  // The floor applies only to runners-up, so one strong signal can't drag in
  // three weak ones.
  const top = scored[0];
  if (!top) return [];
  const cutoff = Math.max(2, top.score * 0.5);
  const rest = scored.slice(1).filter(s => s.score >= cutoff);
  return [top, ...rest].slice(0, limit).map(s => s.label);
}

/** Pull descriptive chips out of the text, at most two per group. */
export function detectTags(text: string, limit = 6): string[] {
  const padded = norm(text);
  if (padded.trim().length < 3) return [];

  const perGroup: Record<string, number> = {};
  const out: string[] = [];
  for (const rule of TAG_RULES) {
    if (out.length >= limit) break;
    if ((perGroup[rule.group] || 0) >= 2) continue;
    if (!rule.words.some(w => hasWord(padded, w))) continue;
    perGroup[rule.group] = (perGroup[rule.group] || 0) + 1;
    out.push(rule.tag);
  }
  return out;
}

/** One call for the onboarding screen: services + tags from a free-text description. */
export function detectFromText(text: string): Detection {
  return { services: detectServices(text), tags: detectTags(text) };
}
