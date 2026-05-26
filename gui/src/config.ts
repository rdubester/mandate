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
// Rulebook metadata. The Rules tab renders directly from these.

export interface MoveSpec {
  id: string;
  name: string;
  factions: FactionId[];
  tier: "signature" | "shared";
  colours: string;
  scoresFor?: FactionId;
  description: string;
  details?: string;
}

export const MOVES: MoveSpec[] = [
  {
    id: "enactDecree",
    name: "Enact Decree",
    factions: [WHITE],
    tier: "signature",
    colours: "W (signature)",
    description: "White plays a decree from hand into the shared table state (a standing rule).",
    details:
      "Decrees hook every player's verbs. White scores not by acting, but by skimming Mandate when others live under its rules (comply with a rider, or by an 'always' clause).",
  },
  {
    id: "musterZealots",
    name: "Muster Zealots",
    factions: [RED],
    tier: "signature",
    colours: "R (signature, G–R edge)",
    description: `Red mints zealots (hard flow) — +${CONFIG.unit_yield.muster_zealots} per action.`,
    details:
      "Red's unshareable signature. White can never do this: its shard (GWU) has no R, so it cannot touch the G–R edge. Writ of Order taxes this −1.",
  },
  {
    id: "rallySupporters",
    name: "Rally Supporters",
    factions: [WHITE],
    tier: "shared",
    colours: "G / W edge",
    description: `Grow supporters (soft stock) — +${CONFIG.unit_yield.rally_supporters} per action.`,
    details:
      "Shared on the G–W community edge (White + Green). Open Records boosts it +1 and pays White; Public Works pays White on each rally.",
  },
  {
    id: "research",
    name: "Research",
    factions: [WHITE, RED],
    tier: "shared",
    colours: "U / B edge",
    description: "Draw a card from your deck (placeholder — Blue isn't built yet).",
    details:
      "MVP stub. White has a decree deck so Research draws 1 decree (and can trigger draw-decrees). Red has no deck, so Research is a no-op.",
  },
  {
    id: "strike",
    name: "Strike",
    factions: [RED],
    tier: "shared",
    colours: "R / B edge",
    scoresFor: RED,
    description: "Spend a zealot to hit White's Mandate or remove a decree, and score.",
    details: `Cost: ${CONFIG.scoring.strike_landed.zealot_cost} zealot (+1 if Martial Restraint in play). Mandate strike: White −${CONFIG.scoring.strike_landed.marker_knockback}, Red +${CONFIG.scoring.strike_landed.mandate_per_strike}. Decree strike: remove a White decree, Red +${CONFIG.scoring.strike_landed.mandate_per_strike}.`,
  },
];

export interface FactionSpec {
  id: FactionId;
  name: string;
  centre: string;
  shard: string;
  archetype: string;
  signature: string;
  scoringRule: string;
  startingResources: string;
  draw: string;
}

export const FACTION_SPECS: FactionSpec[] = [
  {
    id: WHITE,
    name: "The Assembly",
    centre: "White (W)",
    shard: "GWU — green / white / blue",
    archetype: "Slow interaction · structurally non-militant",
    signature: "Enact Decree — install standing rules on the table",
    scoringRule: `Decoupled: White scores when others live under its decrees — +1 (or +2) Mandate on compliance / 'always' clauses. It never strikes (no R in shard).`,
    startingResources: `Hand: ${CONFIG.white.starting_hand} decree · Supporters: ${CONFIG.white.starting_supporters} · Zealots: ${CONFIG.white.starting_zealots} (can't make any)`,
    draw: `${CONFIG.white.draw_per_turn} per turn (decree deck)`,
  },
  {
    id: RED,
    name: "The Vanguard",
    centre: "Red (R)",
    shard: "BRG — black / red / green",
    archetype: "Fast interaction · militant",
    signature: "Muster Zealots — mint the hard flow it spends on strikes",
    scoringRule: `Welded: each strike scores +${CONFIG.scoring.strike_landed.mandate_per_strike} Mandate immediately. Mandate strikes also knock White −${CONFIG.scoring.strike_landed.marker_knockback}.`,
    startingResources: `Hand: ${CONFIG.red.starting_hand} · Supporters: ${CONFIG.red.starting_supporters} · Zealots: ${CONFIG.red.starting_zealots}`,
    draw: `${CONFIG.red.draw_per_turn} per turn (no deck currently)`,
  },
];
