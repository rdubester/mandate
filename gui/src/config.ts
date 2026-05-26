// The model (see the-character-model.md):
//   A character IS ONE COLOUR. A verb is tagged with one or more colours. A character
//   can do a verb iff its colour is among the verb's colours. The shard / wing /
//   signature structure is NOT declared — it EMERGES from how verbs are tagged, and
//   the tags follow the wheel's adjacency (W–U–B–R–G):
//     · a verb tagged with ONE colour is reachable by exactly one character — that is
//       what "signature" means (e.g. allocate_supporters {W} → only White; strike {R} → Red).
//     · a verb tagged with TWO ADJACENT colours is a wing/edge verb shared by both
//       neighbours (e.g. rally_supporters {W,G} → White and Green).
//   A character's "shard" is just the set of colours appearing across the verbs it can
//   reach — it comes out as centre + two wings for free.

export const WHITE = "0";
export const RED = "1";
export type FactionId = typeof WHITE | typeof RED;

export type Colour = "W" | "U" | "B" | "R" | "G";

// The shared decks (resources on the table, not owned by a player). Only "decree" is
// modelled today; "research" lands with Blue. The ONLY per-player deck in the design is
// Blue's Archive — also not modelled yet.
export type DeckKind = "decree" | "research";

// One row per faction — "factions as rows". A player is SEATED as a faction (see
// PlayerState.faction in game.ts); everything a faction can DO derives from its colour
// + the verb tags (canDo), so nothing here branches on identity.
export interface FactionSpec {
  colour: Colour; // the character's single colour — the whole availability key
  name: string; // display label, e.g. "White — Assembly"
  arc: string; // the three-colour arc / institution name, e.g. "The Assembly"
  character: string; // flavour name, e.g. "The Prime Minister"
  scoring: string; // scoring-rule key (display only; the engine never branches on it)
  draw_per_turn: number;
  starting_hand: number;
  starting_supporters: number;
  starting_zealots: number;
  drawsFrom: DeckKind | null; // which SHARED deck this faction draws into hand (null = none)
}

export const FACTIONS: Record<FactionId, FactionSpec> = {
  [WHITE]: {
    colour: "W",
    name: "White — Assembly",
    arc: "The Assembly",
    character: "The Prime Minister",
    scoring: "decree_bite",
    draw_per_turn: 1,
    starting_hand: 1,
    starting_supporters: 0,
    starting_zealots: 0,
    drawsFrom: "decree",
  },
  [RED]: {
    colour: "R",
    name: "Red — Vanguard",
    arc: "The Vanguard",
    character: "The Field Marshal",
    scoring: "strike_landed",
    draw_per_turn: 0,
    starting_hand: 0,
    starting_supporters: 0,
    starting_zealots: 0,
    drawsFrom: null,
  },
};

const FACTION_IDS = Object.keys(FACTIONS) as FactionId[];

// Derived lookups, so the faction registry is the one source of these facts.
export const COLOUR = Object.fromEntries(
  FACTION_IDS.map((f) => [f, FACTIONS[f].colour]),
) as Record<FactionId, Colour>;

export const FACTION_NAME = Object.fromEntries(
  FACTION_IDS.map((f) => [f, FACTIONS[f].name]),
) as Record<FactionId, string>;

export const CONFIG = {
  mandate_target: 20,
  actions_per_turn: 2,
  max_turns: 200,

  // Two currencies, one per green edge (see unit-economy-edges):
  //   supporters = G–W community (soft STOCK, White's edict fuel)
  //   zealots    = G–R authenticity (hard FLOW, spent on direct actions)
  // No soldiers. White (GWU) has no R, so it can NEVER muster zealots.
  unit_yield: {
    rally_supporters: 1,
    muster_zealots: 2,
  },

  // White's signature places up to K supporters from stock onto decrees as SUPPORT. A
  // supported decree (≥1) BOTH scores its supporter(s) when it bites AND is defended — a
  // Red strike strips one supporter before it can remove the decree. (Markers + shields
  // collapsed into this one concept.) K>1 = one White action is "K placements in a
  // trenchcoat" — depth per turn without more actions. Count is durability; ≥1 turns
  // scoring on (flat). K itself is decree-modifiable (path "allocK").
  supporter_allocate_k: 3,

  scoring: {
    strike_landed: {
      // Red scores Mandate ONLY by striking the Mandate track. Striking a decree yields
      // NO Mandate — it's pure removal: a TAX on Red's tempo, not a source of points.
      mandate_per_strike: 4,
      zealot_cost: 1, // cost to strike the Mandate track
      decree_strike_zealot_cost: 1, // cost to remove a decree (yields 0 Mandate)
      // Knockback (deleting the opponent's Mandate) is OFF by default — the fight belongs on
      // the board, not the scoreboard. Kept as a 0 base so a decree could opt into it later.
      marker_knockback: 0,
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
  allocates?: boolean; // places up to K supporters from stock onto decrees (support)
}

export const VERBS: VerbSpec[] = [
  // White's SIGNATURE {W}: place up to K supporters from the loose stock onto decrees as
  // SUPPORT. A supported decree (≥1) scores its supporter(s) when it bites AND is defended
  // (support absorbs Red strikes). One action distributes K — "K placements in a trenchcoat".
  { name: "allocate_supporters", colours: ["W"], allocates: true },
  // Enact a decree (install a standing table rule). SHARED across the governance trio
  // {W,U,G}: White backs platforms, Blue plays tempo bets, Green stabilises the board.
  // Red (R) cannot enact — only strike decrees away. Decrees land on the SHARED table.
  { name: "enact_decree", colours: ["W", "U", "G"] },
  // White draws from the shared decree deck. {W} only for now — when Blue arrives this
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

// ---- decrees: shared RULES on the table that hook the verb pipeline -----------
// A decree may match a verb (+detail), apply an ambient EFFECT (cost/yield delta),
// and OFFER a rider (the 'may' — acting player chooses). Decrees pay NO ONE for
// ownership. The `score` field is what every PLAYER SUPPORTING this decree earns when
// its output "bites":
//   · when "compliance" → bites only when a player TAKES the rider (the output fired).
//   · when "always"     → bites whenever the trigger fires (ambient output always fires).
// A decree with no `score` (a pure tax) can be enacted but is worthless to support.
// Anyone in {W,U,G} can enact decrees; only White can support them (its signature).

export type DecreeType = "positive" | "negative";

// The op DSL (interpreted by game.ts's decree chain). A decree's effect/rider is a LIST of
// ops, each reaching into a field of the verb "event" as it passes through. `path` names a
// VerbEvent field: numeric (cost, yieldN, draws, allocK, mandate, knockback, supportStrip)
// for add/mul, or the boolean `cancelled` for set. This vocabulary is deliberately small —
// its ceiling IS the complexity budget. A new op kind is a rare, deliberate engine edit
// ("the rulebook has a new kind of modifier"); a new EFFECT is just a new data row.
export type NumField =
  | "cost" | "yieldN" | "draws" | "allocK" | "mandate" | "knockback" | "supportStrip";
export type BoolField = "cancelled";
export type EventField = NumField | BoolField;

export type Op =
  | { op: "add"; path: NumField; n: number }
  | { op: "mul"; path: NumField; n: number }
  | { op: "set"; path: NumField; v: number }
  | { op: "set"; path: BoolField; v: boolean };

export interface Decree {
  id: string;
  name: string;
  type: DecreeType;
  text: string;
  trigger: { on: string; detail?: Record<string, string> };
  effect?: Op[]; // applied to every matching verb event (ambient, no choice)
  rider?: { effect: Op[]; describe: string }; // the "may" — applied only if the actor complies
  score?: { when: "compliance" | "always"; amount: number }; // each supporter's, on bite
}

export const DECREES: Record<string, Decree> = {
  civic_endowment: {
    id: "civic_endowment",
    name: "Civic Endowment",
    type: "positive",
    text: "When any player draws a card, they may draw +1. If supported & they do, supporters score 3.",
    trigger: { on: "draw" },
    rider: { effect: [{ op: "add", path: "draws", n: 1 }], describe: "draw +1 card" },
    score: { when: "compliance", amount: 3 },
  },
  // academic_census is COMMENTED OUT: it triggers on drawing a RESEARCH card, but no
  // research deck exists until Blue, so it can never bite — and the bot would still waste
  // tempo enacting/supporting it. Re-enable when the research deck (Blue) lands.
  // academic_census: {
  //   id: "academic_census",
  //   name: "Academic Census",
  //   type: "positive",
  //   text: "When a RESEARCH card is drawn, that player may draw +1. If supported & they do, supporters score 2.",
  //   trigger: { on: "draw", detail: { deck: "research" } },
  //   rider: { effect: [{ op: "add", path: "draws", n: 1 }], describe: "draw +1 research card" },
  //   score: { when: "compliance", amount: 2 },
  // },
  open_records: {
    id: "open_records",
    name: "Open Records",
    type: "positive",
    text: "When any player rallies supporters, they get +1 supporter. If supported, supporters score 3 each time.",
    trigger: { on: "rally_supporters" },
    effect: [{ op: "add", path: "yieldN", n: 1 }],
    score: { when: "always", amount: 3 },
  },
  martial_restraint: {
    id: "martial_restraint",
    name: "Martial Restraint",
    type: "negative",
    text: "Ambient: strikes cost +1 zealot. (A tax on the militant G–R edge — no score to support.)",
    trigger: { on: "strike" },
    effect: [{ op: "add", path: "cost", n: 1 }],
  },
  writ_of_order: {
    id: "writ_of_order",
    name: "Writ of Order",
    type: "negative",
    text: "Ambient: mustering zealots yields −1. (A tax on militarization — no score to support.)",
    trigger: { on: "muster_zealots" },
    effect: [{ op: "add", path: "yieldN", n: -1 }],
  },
  public_works: {
    id: "public_works",
    name: "Public Works",
    type: "positive",
    text: "When any player rallies supporters, if supported supporters score 3 (no effect on the rally itself).",
    trigger: { on: "rally_supporters" },
    score: { when: "always", amount: 3 },
  },
};

export const WHITE_DECK_TEMPLATE: string[] = [
  "civic_endowment", "civic_endowment",
  "open_records", "open_records",
  "public_works",
  "martial_restraint",
  "writ_of_order",
];

// -----------------------------------------------------------------------------
// Per-character facts for the Rulebook — derived from the FACTIONS registry, so there
// is nothing here to drift from the engine. Which verbs a character can do and its
// emergent shard are DERIVED via verbsFor() / VERBS.

export interface CharacterSpec {
  id: FactionId;
  name: string; // the arc / institution name (The Assembly / The Vanguard)
  character: string; // FACTIONS[id].character
  colour: Colour;
  scoring: string; // FACTIONS[id].scoring key
}

export const CHARACTERS: CharacterSpec[] = FACTION_IDS.map((id) => ({
  id,
  name: FACTIONS[id].arc,
  character: FACTIONS[id].character,
  colour: FACTIONS[id].colour,
  scoring: FACTIONS[id].scoring,
}));

// A character's emergent "shard" = the colours appearing across the verbs it can
// reach. Not declared — computed. Comes out as centre + adjacent wings.
export function shardOf(f: FactionId): Colour[] {
  const seen = new Set<Colour>();
  for (const name of verbsFor(f)) {
    for (const c of VERB_BY_NAME[name].colours) seen.add(c);
  }
  return [...seen];
}
