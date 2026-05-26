// The model (see the-character-model.md):
//   A character IS ONE COLOUR. A verb is tagged with one or more colours. A character
//   can do a verb iff its colour is among the verb's colours. The shard / wing /
//   signature structure is NOT declared — it EMERGES from how verbs are tagged, and
//   the tags follow the wheel's adjacency (W–U–B–R–G):
//     · a verb tagged with ONE colour is reachable by exactly one character — that is
//       what "signature" means (e.g. enact_decree {W} → only White).
//     · a verb tagged with TWO ADJACENT colours is a wing/edge verb shared by both
//       neighbours (e.g. rally_supporters {W,G} → White and Green).
//   A character's "shard" is just the set of colours appearing across the verbs it can
//   reach — it comes out as centre + two wings for free.

export const WHITE = "0";
export const RED = "1";
export type FactionId = typeof WHITE | typeof RED;

export const FACTION_NAME: Record<FactionId, string> = {
  [WHITE]: "White — Assembly",
  [RED]: "Red — Vanguard",
};

export type Colour = "W" | "U" | "B" | "R" | "G";

// Each character is exactly one colour. (Wheel order: W–U–B–R–G.)
export const COLOUR: Record<FactionId, Colour> = {
  [WHITE]: "W",
  [RED]: "R",
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
    scoring: "decree_bite",
  },
  red: {
    name: "The Field Marshal",
    draw_per_turn: 0,
    starting_hand: 0,
    starting_supporters: 0,
    starting_zealots: 3,
    deck: null,
    scoring: "strike_landed",
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

// ---- the verb table: the single source of who-can-do-what --------------------
// Each verb's `colours` are its wheel tags. A character (one colour) can do a verb
// iff its colour is in the verb's `colours`. One-colour verbs are de-facto signatures;
// two-adjacent-colour verbs are shared wing/edge verbs. The effect fields below are
// exactly what the engine (game.ts) mutates.

export interface VerbSpec {
  name: string;
  colours: Colour[];
  yields?: { unit: "supporters" | "zealots"; amount: number };
  spends?: { unit: "zealots"; amount: number }; // base cost (before decree deltas)
  draws?: number;
  scores?: { who: "self"; amount: number; alsoKnocks?: number };
}

export const VERBS: VerbSpec[] = [
  // White's signature: install a standing rule. {W} → White alone.
  { name: "enact_decree", colours: ["W"] },
  // White draws from its own (decree) deck. {W} only for now — when Blue arrives this
  // likely becomes a shared W–U "research" verb (digs both decks); reskin then.
  { name: "deliberate", colours: ["W"], draws: 1 },
  // W–G community edge: shared by White and (later) Green. Grows the soft stock.
  { name: "rally_supporters", colours: ["W", "G"], yields: { unit: "supporters", amount: CONFIG.unit_yield.rally_supporters } },
  // Red's signature + scoring verb: {R} → Red alone. Spends a zealot, scores on landing.
  {
    name: "strike",
    colours: ["R"],
    spends: { unit: "zealots", amount: CONFIG.scoring.strike_landed.zealot_cost },
    scores: {
      who: "self",
      amount: CONFIG.scoring.strike_landed.mandate_per_strike,
      alsoKnocks: CONFIG.scoring.strike_landed.marker_knockback,
    },
  },
  // R–G authenticity edge: shared by Red and (later) Green. Green thus makes BOTH
  // currencies (it sits on rally's W–G and muster's R–G). Mints the hard flow.
  { name: "muster_zealots", colours: ["R", "G"], yields: { unit: "zealots", amount: CONFIG.unit_yield.muster_zealots } },
];

export const VERB_BY_NAME: Record<string, VerbSpec> = Object.fromEntries(
  VERBS.map((v) => [v.name, v]),
);

// The whole availability rule: character's colour is among the verb's colours.
export function canDo(f: FactionId, verbName: string): boolean {
  const v = VERB_BY_NAME[verbName];
  return !!v && v.colours.includes(COLOUR[f]);
}

export function verbsFor(f: FactionId): string[] {
  return VERBS.filter((v) => v.colours.includes(COLOUR[f])).map((v) => v.name);
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
// Per-character facts for the Rulebook. A character is one colour; everything else
// (which verbs it can do, its emergent shard) is DERIVED via verbsFor() / VERBS, so
// there is nothing here to drift from the engine.

export interface CharacterSpec {
  id: FactionId;
  name: string;        // The Assembly / The Vanguard — a display label, not a rule
  character: string;   // CONFIG.{white,red}.name
  colour: Colour;
  scoring: string;     // CONFIG.{white,red}.scoring key
}

export const CHARACTERS: CharacterSpec[] = [
  {
    id: WHITE,
    name: "The Assembly",
    character: CONFIG.white.name,
    colour: COLOUR[WHITE],
    scoring: CONFIG.white.scoring,
  },
  {
    id: RED,
    name: "The Vanguard",
    character: CONFIG.red.name,
    colour: COLOUR[RED],
    scoring: CONFIG.red.scoring,
  },
];

// A character's emergent "shard" = the colours appearing across the verbs it can
// reach. Not declared — computed. Comes out as centre + adjacent wings.
export function shardOf(f: FactionId): Colour[] {
  const seen = new Set<Colour>();
  for (const name of verbsFor(f)) {
    for (const c of VERB_BY_NAME[name].colours) seen.add(c);
  }
  return [...seen];
}
