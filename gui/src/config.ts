// Mirrors characters.json from the Python prototype (three-tier character model,
// two-currency unit economy). Hand-ported. The Python engine is the design source of
// truth; if this drifts, re-sync against characters.json / the-character-model.md.

export const WHITE = "0";
export const RED = "1";
export type FactionId = typeof WHITE | typeof RED;

export const FACTION_NAME: Record<FactionId, string> = {
  [WHITE]: "White — Assembly",
  [RED]: "Red — Vanguard",
};

// Colour tags used by the wheel. A character can take a shared verb if any of the
// verb's colours is in the character's shard (centre + two wings).
export type Colour = "W" | "U" | "B" | "R" | "G";

export const SHARD: Record<FactionId, Colour[]> = {
  [WHITE]: ["G", "W", "U"], // centre W
  [RED]: ["B", "R", "G"], //   centre R
};

export const CONFIG = {
  mandate_target: 100,
  actions_per_turn: 2,
  max_turns: 200,

  white: {
    name: "The Prime Minister",
    draw_per_turn: 1,
    starting_hand: 1,
    starting_supporters: 0,
    starting_zealots: 0,
    deck: "decree" as const,
    tier1_scoring: "decree_bite",
    tier2_signature: "enact_decree",
  },
  red: {
    name: "The Field Marshal",
    draw_per_turn: 0,
    starting_hand: 0,
    starting_supporters: 0,
    starting_zealots: 3,
    deck: null,
    tier1_scoring: "strike_landed",
    tier2_signature: "muster_zealots",
  },

  // Two currencies, one per green edge (see unit-economy-edges):
  //   supporters = G–W community (soft STOCK, White's edict fuel)
  //   zealots    = G–R authenticity (hard FLOW, spent on direct actions)
  // No soldiers. White (GWU) has no R, so it can NEVER muster zealots.
  unit_yield: {
    rally_supporters: 1,
    muster_zealots: 2,
  },

  scoring: {
    decree_bite: { mandate_per_bite: 1 },
    strike_landed: {
      mandate_per_strike: 3,
      zealot_cost: 1,
      marker_knockback: 2,
    },
  },
};

// ---- shared (tier-3) verb registry: which colours grant each verb -----------
// Signature verbs (enact_decree, muster_zealots) are NOT here — granted to their
// owner only. Availability of a shared verb = (verb.colours ∩ shard) ≠ ∅.
export const SHARED_VERBS: Record<string, { colours: Colour[] }> = {
  rally_supporters: { colours: ["G", "W"] },
  research: { colours: ["U", "B"] },
  strike: { colours: ["R", "B"] },
};

export function availableVerbs(f: FactionId): string[] {
  const shard = new Set(SHARD[f]);
  const sig = f === WHITE ? CONFIG.white.tier2_signature : CONFIG.red.tier2_signature;
  const out = [sig];
  for (const [name, def] of Object.entries(SHARED_VERBS)) {
    if (def.colours.some((c) => shard.has(c))) out.push(name);
  }
  return out;
}

// ---- decrees: RULES that hook the verb pipeline (port of decrees.py) ---------
// A decree may match a verb (+detail), apply an ambient EFFECT (cost/yield delta),
// OFFER a rider (the 'may' — acting player chooses), and SCORE its owner on
// compliance (rider taken) or always.

export type DecreeType = "positive" | "negative";

export interface Decree {
  id: string;
  name: string;
  type: DecreeType;
  text: string;
  trigger: { on: string; detail?: Record<string, string> };
  effect?: { cost_delta?: number; yield_delta?: number; extra_draw?: number };
  rider?: { effect: Record<string, number>; describe: string };
  score?: { when: "compliance" | "always"; amount: number };
}

export const DECREES: Record<string, Decree> = {
  civic_endowment: {
    id: "civic_endowment",
    name: "Civic Endowment",
    type: "positive",
    text: "When any player draws a card, they may draw +1. If they do, White scores 1.",
    trigger: { on: "draw" },
    rider: { effect: { extra_draw: 1 }, describe: "draw +1 card" },
    score: { when: "compliance", amount: 1 },
  },
  academic_census: {
    id: "academic_census",
    name: "Academic Census",
    type: "positive",
    text: "When a RESEARCH card is drawn, that player may draw +1. If they do, White scores 2.",
    trigger: { on: "draw", detail: { deck: "research" } },
    rider: { effect: { extra_draw: 1 }, describe: "draw +1 research card" },
    score: { when: "compliance", amount: 2 },
  },
  open_records: {
    id: "open_records",
    name: "Open Records",
    type: "positive",
    text: "When any player rallies supporters, they get +1 supporter. White scores 1 each time.",
    trigger: { on: "rally_supporters" },
    effect: { yield_delta: 1 },
    score: { when: "always", amount: 1 },
  },
  martial_restraint: {
    id: "martial_restraint",
    name: "Martial Restraint",
    type: "negative",
    text: "Ambient: strikes cost +1 zealot. (A tax on the militant G–R edge.)",
    trigger: { on: "strike" },
    effect: { cost_delta: 1 },
  },
  writ_of_order: {
    id: "writ_of_order",
    name: "Writ of Order",
    type: "negative",
    text: "Ambient: mustering zealots yields −1. (A tax on militarization.)",
    trigger: { on: "muster_zealots" },
    effect: { yield_delta: -1 },
  },
  public_works: {
    id: "public_works",
    name: "Public Works",
    type: "positive",
    text: "When any player rallies supporters, White scores 1 (no effect on the rally itself).",
    trigger: { on: "rally_supporters" },
    score: { when: "always", amount: 1 },
  },
};

export const WHITE_DECK_TEMPLATE: string[] = [
  "civic_endowment", "civic_endowment",
  "academic_census",
  "open_records", "open_records",
  "public_works",
  "martial_restraint",
  "writ_of_order",
];

// -----------------------------------------------------------------------------
// Verb registry for the Rulebook's 1-1 data view. This is STRUCTURAL, not prose:
// each field below maps to something the engine (game.ts) literally does, so the
// Rulebook can't drift from the rules. No description strings — the Rulebook
// renders these fields directly.

export interface VerbSpec {
  name: string;          // engine move name (also the verb id used in availableVerbs)
  tier: "signature" | "shared";
  colours: Colour[];     // [] for signature (granted by name, not colour)
  signatureOf?: FactionId;
  // structural effect — what the move mutates, in field form:
  yields?: { unit: "supporters" | "zealots"; amount: number };
  spends?: { unit: "zealots"; amount: number };  // base cost (before decree deltas)
  draws?: number;
  scores?: { who: "self"; amount: number; alsoKnocks?: number };
}

export const VERBS: VerbSpec[] = [
  {
    name: "enact_decree",
    tier: "signature",
    colours: [],
    signatureOf: WHITE,
  },
  {
    name: "muster_zealots",
    tier: "signature",
    colours: [],
    signatureOf: RED,
    yields: { unit: "zealots", amount: CONFIG.unit_yield.muster_zealots },
  },
  {
    name: "rally_supporters",
    tier: "shared",
    colours: SHARED_VERBS.rally_supporters.colours,
    yields: { unit: "supporters", amount: CONFIG.unit_yield.rally_supporters },
  },
  {
    name: "research",
    tier: "shared",
    colours: SHARED_VERBS.research.colours,
    draws: 1,
  },
  {
    name: "strike",
    tier: "shared",
    colours: SHARED_VERBS.strike.colours,
    spends: { unit: "zealots", amount: CONFIG.scoring.strike_landed.zealot_cost },
    scores: {
      who: "self",
      amount: CONFIG.scoring.strike_landed.mandate_per_strike,
      alsoKnocks: CONFIG.scoring.strike_landed.marker_knockback,
    },
  },
];

// Per-character structural facts (everything else the Rulebook shows is derived
// from SHARD / VERBS / CONFIG, so there is nothing prose-y to drift).
export interface CharacterSpec {
  id: FactionId;
  name: string;          // The Assembly / The Vanguard — a label, not a rule
  character: string;     // CONFIG.{white,red}.name
  centre: Colour;
  signature: string;     // verb name
  scoring: string;       // CONFIG tier1 key
}

export const CHARACTERS: CharacterSpec[] = [
  {
    id: WHITE,
    name: "The Assembly",
    character: CONFIG.white.name,
    centre: "W",
    signature: CONFIG.white.tier2_signature,
    scoring: CONFIG.white.tier1_scoring,
  },
  {
    id: RED,
    name: "The Vanguard",
    character: CONFIG.red.name,
    centre: "R",
    signature: CONFIG.red.tier2_signature,
    scoring: CONFIG.red.tier1_scoring,
  },
];
