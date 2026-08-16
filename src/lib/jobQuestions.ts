// Per-service intake questions for the client onboarding flow.
//
// Rules that make these work on a phone, in a hurry, from someone who is not a
// tradesperson:
//   * At most THREE questions per service. Never more.
//   * Every answer is a button. No typing, no sliders, no dropdowns.
//   * Plain English. No trade jargon a homeowner wouldn't say out loud.
//   * There is almost always a "Not sure" escape — a client who doesn't know
//     must never be stuck on a screen.
//
// The `id` on each question is the key stored in the answers object, so it is a
// stable identifier: rename a prompt freely, but changing an id orphans every
// answer already recorded against it.
//
// Service keys MUST match `SERVICES` in src/pages/ClientOnboarding.tsx. Anything
// missing (including "Other" and custom free-text services) falls back to
// GENERIC_QUESTIONS.

export type JobQuestion = {
  id: string;
  prompt: string;
  options: string[];
  /** Allow more than one answer. Defaults to single-select. */
  multi?: boolean;
};

export const GENERIC_QUESTIONS: JobQuestion[] = [
  { id: "work_type", prompt: "Is this a repair, or something new?", options: ["Repair something", "Install something new", "Replace something", "Regular maintenance", "Not sure"] },
  { id: "urgency", prompt: "How soon do you need it done?", options: ["Urgent — today or tomorrow", "This week", "Within a month", "I'm flexible"] },
  { id: "prior_look", prompt: "Has anyone looked at it yet?", options: ["No, you'd be first", "Yes, and I have a price", "Yes, but no price yet", "Not sure"] },
];

export const JOB_QUESTIONS: Record<string, JobQuestion[]> = {
  "General Handyman": [
    { id: "count", prompt: "How many separate things need doing?", options: ["Just one", "Two or three", "A whole list", "Not sure"] },
    { id: "materials", prompt: "Do you already have the parts or materials?", options: ["Yes, I have them", "No, please bring them", "Some of them", "Not sure"] },
    { id: "size", prompt: "Roughly how long do you think it'll take?", options: ["Under an hour", "Half a day", "A full day", "More than a day", "Not sure"] },
  ],

  "Plumbing Repair": [
    { id: "problem", prompt: "What's the problem?", options: ["A leak", "Clogged or slow drain", "No hot water", "Installing or replacing a fixture", "Something else"] },
    { id: "active", prompt: "Is water leaking or running right now?", options: ["Yes, right now", "It comes and goes", "No, it's stopped", "Not sure"] },
    { id: "where", prompt: "Where in the home?", options: ["Kitchen", "Bathroom", "Basement", "Laundry room", "Outside", "More than one spot"] },
  ],

  "Electrical Work": [
    { id: "problem", prompt: "What's happening?", options: ["No power to something", "Breaker keeps tripping", "Adding or moving a light or outlet", "Lights flickering or dimming", "Something else"] },
    { id: "scope", prompt: "How much of the home is affected?", options: ["One outlet or fixture", "One room", "The whole home", "Not sure"] },
    { id: "safety", prompt: "Any burning smell, sparks, or scorch marks?", options: ["Yes", "No", "Not sure"] },
  ],

  "HVAC Maintenance": [
    { id: "need", prompt: "What do you need?", options: ["Furnace isn't heating", "Routine tune-up", "Thermostat problem", "Replace the system", "Something else"] },
    { id: "age", prompt: "Roughly how old is the system?", options: ["Under 5 years", "5–15 years", "Over 15 years", "Not sure"] },
    { id: "no_heat", prompt: "Is the home without heat right now?", options: ["Yes", "Only part of it", "No"] },
  ],

  "Carpentry": [
    { id: "kind", prompt: "What kind of work?", options: ["Trim or baseboards", "Cabinets or built-ins", "Stairs or railings", "Framing", "Rotten wood repair", "Something else"] },
    { id: "new_or_repair", prompt: "Is this a repair, or building something new?", options: ["Repair what's there", "Build something new", "Both", "Not sure"] },
    { id: "plan", prompt: "Do you have a design or materials picked out?", options: ["Yes", "Roughly", "No — I'd like advice"] },
  ],

  "Painting": [
    { id: "where", prompt: "Inside or outside?", options: ["Inside", "Outside", "Both"] },
    { id: "scope", prompt: "How much are we painting?", options: ["One room", "Two or three rooms", "The whole home", "Just one surface (a door, a wall)", "Not sure"] },
    { id: "prep", prompt: "Does anything need prep first?", options: ["Patching or filling", "Wallpaper removal", "Nothing — just paint", "Not sure"] },
  ],

  "Drywall / Flooring": [
    { id: "which", prompt: "Which is it?", options: ["Drywall", "Flooring", "Tile", "Both drywall and flooring"] },
    { id: "area", prompt: "How big is the area?", options: ["A small patch", "One room", "Several rooms", "The whole home", "Not sure"] },
    { id: "water", prompt: "Is anything water-damaged?", options: ["Yes", "No", "Not sure"] },
  ],

  "Oil Change": [
    { id: "oil", prompt: "What kind of oil?", options: ["Conventional", "Synthetic blend", "Full synthetic", "Whatever's recommended"] },
    { id: "where", prompt: "Where should the work happen?", options: ["At my home", "At my workplace", "A shop is fine", "Either works"] },
    { id: "extras", prompt: "Anything else while they're at it?", options: ["Just the oil", "Add a tire rotation", "Add a full check-over", "Not sure"] },
  ],

  "Tire Swap / Rotation": [
    { id: "need", prompt: "What do you need?", options: ["Seasonal swap", "Rotation", "New tires", "Flat repair", "Not sure"] },
    { id: "rims", prompt: "Are the tires already on rims?", options: ["Yes, on rims", "No, tires only", "Not sure"] },
    { id: "where", prompt: "Where should the work happen?", options: ["At my home", "At my workplace", "A shop is fine", "Either works"] },
  ],

  "Battery / Brakes": [
    { id: "which", prompt: "Which is it?", options: ["Battery", "Brakes", "Both", "Not sure"] },
    { id: "drivable", prompt: "Can the vehicle be driven right now?", options: ["Yes", "Short distances only", "No — it won't start or move"] },
    { id: "where", prompt: "Where is the vehicle?", options: ["At home", "At work", "On the roadside", "Somewhere else"] },
  ],

  "Vehicle Maintenance": [
    { id: "problem", prompt: "What's going on?", options: ["A warning light is on", "Routine service", "A strange noise", "It won't start", "Something else"] },
    { id: "drivable", prompt: "Can the vehicle be driven?", options: ["Yes", "Short distances only", "No"] },
    { id: "where", prompt: "Where should the work happen?", options: ["At my home", "At my workplace", "A shop is fine", "Either works"] },
  ],

  "Landscaping": [
    { id: "kind", prompt: "What do you need?", options: ["Lawn care", "Garden or flower beds", "Trees or shrubs", "Rock, walls or hardscaping", "Full yard cleanup", "Something else"], multi: true },
    { id: "size", prompt: "How big is the yard?", options: ["Small", "Average city lot", "Large", "Acreage", "Not sure"] },
    { id: "cadence", prompt: "One-time, or ongoing?", options: ["One-time", "Ongoing through the season", "Not sure"] },
  ],

  "Snow Removal": [
    { id: "area", prompt: "What needs clearing?", options: ["Driveway", "Sidewalks", "Both", "Parking lot", "Roof"] },
    { id: "cadence", prompt: "One-time, or all season?", options: ["This snowfall only", "All season", "Not sure"] },
    { id: "deadline", prompt: "Is there a deadline?", options: ["Before I leave in the morning", "Same day is fine", "I'm flexible"] },
  ],

  "Gutters": [
    { id: "need", prompt: "What's needed?", options: ["Repair", "Replace what's there", "New install", "Guards or covers", "Not sure"] },
    { id: "storeys", prompt: "How many storeys?", options: ["One", "Two", "Three or more", "Not sure"] },
    { id: "water", prompt: "Is water getting somewhere it shouldn't?", options: ["Yes, into the house", "Yes, pooling outside", "No", "Not sure"] },
  ],

  "Windows & Doors": [
    { id: "which", prompt: "Windows or doors?", options: ["Windows", "Doors", "Both"] },
    { id: "work", prompt: "Repair or replace?", options: ["Repair", "Replace", "Not sure"] },
    { id: "count", prompt: "How many?", options: ["One", "Two to five", "Six or more", "The whole home"] },
  ],

  "Siding & Roofing": [
    { id: "which", prompt: "Which is it?", options: ["Roof", "Siding", "Both", "Not sure"] },
    { id: "situation", prompt: "What's the situation?", options: ["Active leak", "Storm or hail damage", "Aging — needs replacing", "New build or addition", "Just want it assessed"] },
    { id: "insurance", prompt: "Is this an insurance claim?", options: ["Yes", "Maybe", "No"] },
  ],

  "Garage": [
    { id: "problem", prompt: "What's the issue?", options: ["Door won't open or close", "Opener problem", "Broken spring", "New door install", "Something else"] },
    { id: "stuck", prompt: "Is the door stuck right now?", options: ["Yes, stuck open", "Yes, stuck closed", "No — it works, just badly"] },
    { id: "age", prompt: "Roughly how old is the door?", options: ["Under 5 years", "5–15 years", "Over 15 years", "Not sure"] },
  ],

  "Air Conditioning": [
    { id: "need", prompt: "What do you need?", options: ["It isn't cooling", "Routine service", "New install", "Replace what's there", "Not sure"] },
    { id: "system", prompt: "What kind of system?", options: ["Central air", "Mini-split", "Window or portable unit", "None yet", "Not sure"] },
    { id: "urgency", prompt: "How urgent?", options: ["The home is too hot right now", "This week", "Before summer", "I'm flexible"] },
  ],

  "Cleaning Services": [
    { id: "kind", prompt: "What kind of clean?", options: ["Regular clean", "Deep clean", "Move-in or move-out", "After construction", "Not sure"] },
    { id: "size", prompt: "How big is the space?", options: ["1 bedroom", "2–3 bedrooms", "4 or more bedrooms", "Office or commercial"] },
    { id: "cadence", prompt: "One-time, or ongoing?", options: ["One-time", "Weekly", "Every two weeks", "Monthly"] },
  ],

  "Concrete / Masonry": [
    { id: "project", prompt: "What's the project?", options: ["Driveway", "Sidewalk or walkway", "Steps", "Patio slab", "Brick or stone work", "Fixing a crack"] },
    { id: "work", prompt: "New, or repairing what's there?", options: ["New pour or build", "Repair existing", "Remove and replace", "Not sure"] },
    { id: "size", prompt: "Roughly what size?", options: ["Small (under 100 sq ft)", "Medium", "Large", "Not sure"] },
  ],

  "Locksmith": [
    { id: "need", prompt: "What do you need?", options: ["I'm locked out", "Rekey the locks", "New locks installed", "Broken lock or key", "Not sure"] },
    { id: "urgent", prompt: "Is anyone locked out right now?", options: ["Yes, right now", "No", "Not sure"] },
    { id: "count", prompt: "How many locks?", options: ["One", "Two or three", "Four or more", "Not sure"] },
  ],

  "Appliance Repair / Install": [
    { id: "appliance", prompt: "Which appliance?", options: ["Fridge or freezer", "Stove or oven", "Dishwasher", "Washer or dryer", "Something else"] },
    { id: "work", prompt: "Repair or install?", options: ["Repair", "Install a new one", "Remove the old and install new", "Not sure"] },
    { id: "fuel", prompt: "Is it gas or electric?", options: ["Gas", "Electric", "Not sure"] },
  ],

  "Solar": [
    { id: "need", prompt: "What are you after?", options: ["A price for a new system", "Adding panels", "Repair or service", "Cleaning", "Just researching"] },
    { id: "property", prompt: "What kind of property?", options: ["House", "Acreage", "Condo or townhouse", "Commercial"] },
    { id: "roof_age", prompt: "Roughly how old is the roof?", options: ["Under 5 years", "5–15 years", "Over 15 years", "Not sure"] },
  ],

  "Moving & Storage": [
    { id: "kind", prompt: "What kind of move?", options: ["A whole home", "A few large items", "Just one item", "Into or out of storage"] },
    { id: "size", prompt: "How many bedrooms?", options: ["Studio or 1", "2–3", "4 or more", "Not a home move"] },
    { id: "packing", prompt: "Do you need packing help?", options: ["Yes, pack for me", "Just the heavy lifting", "I'll pack — just move it"] },
  ],

  "Junk Removal": [
    { id: "volume", prompt: "How much is there?", options: ["A few items", "About a pickup truck's worth", "A full trailer", "More than that", "Not sure"] },
    { id: "where", prompt: "Where is it?", options: ["At the curb", "Inside the home", "Basement or upstairs", "Garage or yard"] },
    { id: "heavy", prompt: "Anything heavy or awkward?", options: ["Yes — appliances or furniture", "Yes — construction debris", "No, normal household stuff", "Not sure"] },
  ],

  "Pest Control": [
    { id: "pest", prompt: "What are you dealing with?", options: ["Mice or rats", "Wasps or bees", "Ants", "Spiders", "Bed bugs", "Something else"] },
    { id: "duration", prompt: "How long has it been going on?", options: ["Just noticed it", "A few weeks", "Months", "Not sure"] },
    { id: "where", prompt: "Where are you seeing them?", options: ["Inside the home", "Outside only", "Both", "Not sure"] },
  ],

  "Duct Cleaning": [
    { id: "what", prompt: "What needs cleaning?", options: ["Furnace ducts", "Dryer vent", "Both", "Not sure"] },
    { id: "storeys", prompt: "How many storeys?", options: ["One", "Two", "Three or more", "Not sure"] },
    { id: "last_done", prompt: "When was it last done?", options: ["Never", "Over 5 years ago", "Within the last 5 years", "Not sure"] },
  ],

  "Fencing": [
    { id: "need", prompt: "What's needed?", options: ["Repair", "Replace a section", "A whole new fence", "Just a gate", "Not sure"] },
    { id: "length", prompt: "Roughly how long a run?", options: ["Under 20 ft", "20–50 ft", "50–100 ft", "Over 100 ft", "Not sure"] },
    { id: "material", prompt: "What material?", options: ["Wood", "Chain link", "Vinyl or composite", "Metal", "Not sure"] },
  ],

  "Decks & Patios": [
    { id: "project", prompt: "What's the project?", options: ["Build new", "Repair what's there", "Stain or refinish", "Tear out and replace", "Not sure"] },
    { id: "size", prompt: "Roughly what size?", options: ["Small (under 100 sq ft)", "Medium", "Large", "Not sure"] },
    { id: "extras", prompt: "Any railings or stairs?", options: ["Both", "Railings only", "Stairs only", "Neither"] },
  ],

  "Window Cleaning": [
    { id: "sides", prompt: "Inside, outside, or both?", options: ["Outside only", "Inside only", "Both"] },
    { id: "count", prompt: "Roughly how many windows?", options: ["Under 10", "10–20", "Over 20", "Not sure"] },
    { id: "storeys", prompt: "How many storeys?", options: ["One", "Two", "Three or more"] },
  ],

  "Home Renovations": [
    { id: "area", prompt: "What are you renovating?", options: ["Kitchen", "Bathroom", "Basement", "The whole home", "An addition", "Something else"] },
    { id: "stage", prompt: "How far along are you?", options: ["Just an idea", "I have a rough plan", "I have drawings", "Ready to start"] },
    { id: "timeline", prompt: "What's your timeline?", options: ["As soon as possible", "Within 3 months", "3–6 months", "Later than that", "I'm flexible"] },
  ],

  "Insulation": [
    { id: "where", prompt: "Where does it need insulating?", options: ["Attic", "Basement or crawl space", "Walls", "Garage", "Not sure"] },
    { id: "why", prompt: "What's prompting it?", options: ["Cold rooms or drafts", "High energy bills", "A renovation", "Noise", "Not sure"] },
    { id: "existing", prompt: "Is there insulation there now?", options: ["Yes — adding to it", "No, it's bare", "Yes, but it needs removing first", "Not sure"] },
  ],

  "Eavestrough Cleaning": [
    { id: "storeys", prompt: "How many storeys?", options: ["One", "Two", "Three or more", "Not sure"] },
    { id: "condition", prompt: "Are they overflowing or blocked?", options: ["Yes, overflowing", "Draining slowly", "No — just routine", "Not sure"] },
    { id: "cadence", prompt: "How often would you like this done?", options: ["One-time", "Twice a year", "Once a year", "Not sure"] },
  ],

  "Basement / Waterproofing": [
    { id: "problem", prompt: "What's happening?", options: ["Water is coming in", "Damp or musty", "A crack in the foundation", "Preventative work", "Not sure"] },
    { id: "trigger", prompt: "Does it happen after rain or snowmelt?", options: ["Yes", "No — it's constant", "Not sure"] },
    { id: "finished", prompt: "Is the basement finished?", options: ["Finished", "Unfinished", "Partly finished"] },
  ],

  "Pressure Washing": [
    { id: "what", prompt: "What needs washing?", options: ["Driveway or walkway", "Siding", "Deck or fence", "Garage floor", "Several of these"], multi: true },
    { id: "size", prompt: "Roughly what area?", options: ["Small", "Medium", "Large", "Not sure"] },
    { id: "water", prompt: "Is there an outdoor water tap on site?", options: ["Yes", "No", "Not sure"] },
  ],
};

/** The question set for a service label. Anything unknown gets the generic set. */
export function questionsFor(service?: string | null): JobQuestion[] {
  if (!service) return GENERIC_QUESTIONS;
  return JOB_QUESTIONS[service] || GENERIC_QUESTIONS;
}

/** True when we have questions written specifically for this service. */
export function hasSpecificQuestions(service?: string | null): boolean {
  return !!service && !!JOB_QUESTIONS[service];
}

export type JobAnswers = Record<string, string | string[]>;

/**
 * Flatten answers into plain lines a contractor can read at a glance. Used to
 * enrich the job description, so the pro sees the structured detail without
 * needing a special UI to render it.
 */
export function answerSummary(service: string | null | undefined, answers: JobAnswers): string {
  const qs = questionsFor(service);
  const lines: string[] = [];
  for (const q of qs) {
    const a = answers[q.id];
    if (a == null) continue;
    const text = Array.isArray(a) ? a.join(", ") : String(a);
    if (!text.trim()) continue;
    lines.push(q.prompt + " " + text);
  }
  return lines.join("\n");
}
