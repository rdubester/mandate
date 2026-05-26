// Mirrors config.json from the Python prototype. Hand-ported once.
// If you want them to share a file later, wire vite's JSON import to read ../config.json.

export const WHITE = "0";
export const RED = "1";
export type FactionId = typeof WHITE | typeof RED;

export const FACTION_NAME: Record<FactionId, string> = {
  [WHITE]: "White — Assembly",
  [RED]: "Red — Vanguard",
};

export const CONFIG = {
  mandate_target: 60,
  actions_per_turn: 2,
  max_turns: 200,

  white: {
    draw_per_turn: 1,
    starting_hand: 3,
    starting_soldiers: 0,
    starting_supporters: 0,
    shard: ["decree", "research", "deploy"] as const,
  },
  red: {
    draw_per_turn: 0,
    starting_hand: 0,
    starting_soldiers: 3,
    starting_supporters: 0,
    recruit_per_deploy: 2,
    shard: ["strike", "deploy", "research"] as const,
  },

  white_scoring: {
    mandate_per_bite: 2,
  },
  red_scoring: {
    mandate_per_strike: 3,
    soldier_cost_per_strike: 1,
    marker_knockback: 2,
  },
};

export type DecreeType = "positive" | "negative";

export interface Decree {
  id: string;
  name: string;
  type: DecreeType;
  text: string;
}

export const DECREES: Record<string, Decree> = {
  tax_levy: {
    id: "tax_levy",
    name: "Tax Levy",
    type: "negative",
    text: "Bites when opponent has soldiers or Mandate.",
  },
  civic_endowment: {
    id: "civic_endowment",
    name: "Civic Endowment",
    type: "positive",
    text: "White draws +1 per turn. Always bites.",
  },
  martial_restraint: {
    id: "martial_restraint",
    name: "Martial Restraint",
    type: "negative",
    text: "Red strikes cost +1 soldier. Bites if opp has soldiers.",
  },
  writ_of_order: {
    id: "writ_of_order",
    name: "Writ of Order",
    type: "negative",
    text: "Opponent Deploy yields −1. Bites if opp deployed this turn.",
  },
  public_works: {
    id: "public_works",
    name: "Public Works",
    type: "positive",
    text: "+1 Mandate on each decree White plays. Bites if White played a decree.",
  },
  loyalty_oath: {
    id: "loyalty_oath",
    name: "Loyalty Oath",
    type: "negative",
    text: "Opp −1 Mandate on Research. Bites if opp researched.",
  },
};

export const WHITE_DECK_TEMPLATE: string[] = [
  "tax_levy", "tax_levy",
  "civic_endowment", "civic_endowment",
  "martial_restraint", "martial_restraint",
  "writ_of_order",
  "public_works",
  "loyalty_oath",
];

// -----------------------------------------------------------------------------
// Rulebook metadata. The Rules tab renders directly from these — so anything
// here is automatically reflected in-app. Keep the descriptions in sync with
// the actual code in game.ts.

export interface MoveSpec {
  id: string;
  name: string;
  factions: FactionId[];   // who can do it
  primitive: "decree" | "research" | "deploy" | "strike" | "convert";
  scoresFor?: FactionId;   // present if this move advances Mandate
  description: string;     // one-liner
  details?: string;        // longer if non-trivial
}

export const MOVES: MoveSpec[] = [
  {
    id: "playDecree",
    name: "Play Decree",
    factions: [WHITE],
    primitive: "decree",
    description: "White plays a decree from hand into play (permanent, ongoing).",
    details:
      "Decrees stay in play and 'bite' at end of White's turn for +Mandate (see scoring). Some decrees also have immediate effects.",
  },
  {
    id: "deploy",
    name: "Deploy",
    factions: [WHITE, RED],
    primitive: "deploy",
    description:
      "Add units to your board. Red: +N soldiers. White: +1 supporter (no use yet).",
    details: `Red gains ${CONFIG.red.recruit_per_deploy} soldiers per Deploy. Writ of Order (White decree) reduces opponent Deploys by 1.`,
  },
  {
    id: "research",
    name: "Research",
    factions: [WHITE, RED],
    primitive: "research",
    description: "Draw a card from your deck (placeholder — Blue isn't built yet).",
    details:
      "MVP stub. White has a deck of decrees, so Research = draw 1 decree. Red has no deck, so Research is a no-op (but still triggers Loyalty Oath).",
  },
  {
    id: "strikeMandate",
    name: "Strike Mandate",
    factions: [RED],
    primitive: "strike",
    scoresFor: RED,
    description: `Spend soldiers to knock White's Mandate down and score yours up.`,
    details: `Cost: ${CONFIG.red_scoring.soldier_cost_per_strike} soldier (+1 if Martial Restraint in play). Effect: White −${CONFIG.red_scoring.marker_knockback} Mandate, Red +${CONFIG.red_scoring.mandate_per_strike} Mandate.`,
  },
  {
    id: "strikeDecree",
    name: "Strike Decree",
    factions: [RED],
    primitive: "strike",
    scoresFor: RED,
    description: "Spend soldiers to remove a White decree from play and score.",
    details: `Same cost as Strike Mandate. Removes a chosen decree from White's board and gives Red +${CONFIG.red_scoring.mandate_per_strike} Mandate.`,
  },
];

export interface FactionSpec {
  id: FactionId;
  name: string;
  centre: string;
  shard: string;
  archetype: string;
  primitive: string;
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
    archetype: "Slow interaction (cards)",
    primitive: "Decrees — permanent ongoing cards (positive or negative)",
    scoringRule: `Decoupled: each decree in play that "bites" at end of White's turn → +${CONFIG.white_scoring.mandate_per_bite} Mandate. Public Works also fires +1 immediately when White plays a decree.`,
    startingResources: `Hand: ${CONFIG.white.starting_hand} decrees · Soldiers: ${CONFIG.white.starting_soldiers} · Supporters: ${CONFIG.white.starting_supporters}`,
    draw: `${CONFIG.white.draw_per_turn} per turn (+1 while Civic Endowment in play)`,
  },
  {
    id: RED,
    name: "The Vanguard",
    centre: "Red (R)",
    shard: "BRG — black / red / green",
    archetype: "Fast interaction (units)",
    primitive: "Soldiers — flow resource, spent per strike",
    scoringRule: `Welded: each strike scores +${CONFIG.red_scoring.mandate_per_strike} Mandate. Mandate strikes also knock opponent −${CONFIG.red_scoring.marker_knockback}.`,
    startingResources: `Hand: ${CONFIG.red.starting_hand} · Soldiers: ${CONFIG.red.starting_soldiers} · Supporters: ${CONFIG.red.starting_supporters}`,
    draw: `${CONFIG.red.draw_per_turn} per turn (no deck currently)`,
  },
];

// Bite-trigger descriptions for the Rulebook. Must match decreeBites() in game.ts.
export const DECREE_BITE_RULES: Record<string, string> = {
  tax_levy: "Bites whenever opponent has soldiers OR has Mandate to lose.",
  civic_endowment: "Always bites. (Bonus: while in play, White draws +1 per turn.)",
  martial_restraint: "Bites if opponent has soldiers. (Also: Red's strikes cost +1 soldier.)",
  writ_of_order: "Bites if opponent Deployed this turn. (Also: opponent Deploys yield −1.)",
  public_works: "Bites if White played a decree this turn. (Also: +1 Mandate immediately on each White decree play.)",
  loyalty_oath: "Bites if opponent Researched this turn. (Also: opponent loses 1 Mandate when they Research.)",
};
