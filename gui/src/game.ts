import type { Game, Move } from "boardgame.io";
import { INVALID_MOVE } from "boardgame.io/core";
import { CONFIG, WHITE, RED, WHITE_DECK_TEMPLATE, type FactionId } from "./config";

// G — the shared game state. boardgame.io uses immer; mutate in place.
export interface PlayerState {
  hand: string[];
  deck: string[];
  decreesInPlay: string[];
  soldiers: number;
  supporters: number;
  playedDecreeThisTurn: boolean;
  playedResearchThisTurn: boolean;
  deployedThisTurn: boolean;
}

export interface GameState {
  mandate: Record<FactionId, number>;
  white: PlayerState;
  red: PlayerState;
  log: string[];
}

// ---- helpers ---------------------------------------------------------------

function emptyPlayer(): PlayerState {
  return {
    hand: [],
    deck: [],
    decreesInPlay: [],
    soldiers: 0,
    supporters: 0,
    playedDecreeThisTurn: false,
    playedResearchThisTurn: false,
    deployedThisTurn: false,
  };
}

function opponentOf(p: FactionId): FactionId {
  return p === WHITE ? RED : WHITE;
}

// Decree bite predicates — port of engine._decree_bites.
function decreeBites(id: string, G: GameState, opp: FactionId): boolean {
  const o = G[opp === WHITE ? "white" : "red"];
  const w = G.white;
  switch (id) {
    case "tax_levy":
      return o.soldiers > 0 || G.mandate[opp] > 0;
    case "civic_endowment":
      return true;
    case "martial_restraint":
      return o.soldiers > 0;
    case "writ_of_order":
      return o.deployedThisTurn;
    case "public_works":
      return w.playedDecreeThisTurn;
    case "loyalty_oath":
      return o.playedResearchThisTurn;
    default:
      return false;
  }
}

function playerKey(id: FactionId): "white" | "red" {
  return id === WHITE ? "white" : "red";
}

// ---- moves -----------------------------------------------------------------

const playDecree: Move<GameState> = ({ G, playerID, ctx }, cardId: string) => {
  if (playerID !== WHITE) return INVALID_MOVE;
  if (ctx.currentPlayer !== WHITE) return INVALID_MOVE;
  const p = G.white;
  const idx = p.hand.indexOf(cardId);
  if (idx === -1) return INVALID_MOVE;
  p.hand.splice(idx, 1);
  p.decreesInPlay.push(cardId);
  p.playedDecreeThisTurn = true;
  G.log.push(`white plays decree '${cardId}'`);
  if (p.decreesInPlay.includes("public_works")) {
    G.mandate[WHITE] += 1;
    G.log.push("  └ public_works fires: +1 Mandate");
  }
};

const deploy: Move<GameState> = ({ G, playerID, ctx }) => {
  if (playerID !== ctx.currentPlayer) return INVALID_MOVE;
  const me = playerID as FactionId;
  const key = playerKey(me);
  const p = G[key];
  p.deployedThisTurn = true;
  const oppHasWrit = G.white.decreesInPlay.includes("writ_of_order");
  if (me === RED) {
    let n = CONFIG.red.recruit_per_deploy;
    if (oppHasWrit) n = Math.max(0, n - 1);
    p.soldiers += n;
    G.log.push(`red deploys: +${n} soldier(s)`);
  } else {
    let n = 1;
    // White has writ_of_order itself (if in play), but the bite-rule says
    // "opponents' Deploy yields -1". So White's own deploys are unaffected.
    if (G.red.decreesInPlay.includes("writ_of_order")) n = Math.max(0, n - 1);
    p.supporters += n;
    G.log.push(`white deploys: +${n} supporter(s)`);
  }
};

const research: Move<GameState> = ({ G, playerID, ctx }) => {
  if (playerID !== ctx.currentPlayer) return INVALID_MOVE;
  const me = playerID as FactionId;
  const p = G[playerKey(me)];
  p.playedResearchThisTurn = true;
  if (p.deck.length > 0) {
    const card = p.deck.shift()!;
    p.hand.push(card);
    G.log.push(`${playerKey(me)} researches: draws '${card}'`);
  } else {
    G.log.push(`${playerKey(me)} researches (no deck)`);
  }
};

const strikeMandate: Move<GameState> = ({ G, playerID, ctx }) => {
  if (playerID !== RED) return INVALID_MOVE;
  if (ctx.currentPlayer !== RED) return INVALID_MOVE;
  let cost = CONFIG.red_scoring.soldier_cost_per_strike;
  if (G.white.decreesInPlay.includes("martial_restraint")) cost += 1;
  if (G.red.soldiers < cost) return INVALID_MOVE;
  G.red.soldiers -= cost;
  const kb = CONFIG.red_scoring.marker_knockback;
  G.mandate[WHITE] = Math.max(0, G.mandate[WHITE] - kb);
  G.mandate[RED] += CONFIG.red_scoring.mandate_per_strike;
  G.log.push(
    `red strikes white's Mandate: −${kb} to white, +${CONFIG.red_scoring.mandate_per_strike} to red`,
  );
};

const strikeDecree: Move<GameState> = ({ G, playerID, ctx }, decreeId: string) => {
  if (playerID !== RED) return INVALID_MOVE;
  if (ctx.currentPlayer !== RED) return INVALID_MOVE;
  let cost = CONFIG.red_scoring.soldier_cost_per_strike;
  if (G.white.decreesInPlay.includes("martial_restraint")) cost += 1;
  if (G.red.soldiers < cost) return INVALID_MOVE;
  const idx = G.white.decreesInPlay.indexOf(decreeId);
  if (idx === -1) return INVALID_MOVE;
  G.red.soldiers -= cost;
  G.white.decreesInPlay.splice(idx, 1);
  G.mandate[RED] += CONFIG.red_scoring.mandate_per_strike;
  G.log.push(
    `red strikes decree '${decreeId}' off white's board: +${CONFIG.red_scoring.mandate_per_strike} Mandate`,
  );
};

// ---- turn hooks ------------------------------------------------------------

function resetTurnFlags(G: GameState): void {
  for (const k of ["white", "red"] as const) {
    G[k].playedDecreeThisTurn = false;
    G[k].playedResearchThisTurn = false;
    G[k].deployedThisTurn = false;
  }
}

function resolveWhiteEndOfTurn(G: GameState): void {
  // Decree bites — only at end of White's turn (mirrors engine.py).
  const opp = RED;
  const score = CONFIG.white_scoring.mandate_per_bite;
  let bites = 0;
  for (const did of G.white.decreesInPlay) {
    if (decreeBites(did, G, opp)) {
      bites += 1;
      G.log.push(`  · decree '${did}' bites: +${score} Mandate to white`);
    }
  }
  G.mandate[WHITE] += bites * score;
}

function resolveRedEndOfTurn(G: GameState): void {
  // loyalty_oath punishes opponent (red) for researching during red's turn.
  if (
    G.white.decreesInPlay.includes("loyalty_oath") &&
    G.red.playedResearchThisTurn
  ) {
    G.mandate[RED] = Math.max(0, G.mandate[RED] - 1);
    G.log.push("  · loyalty_oath punishes red: −1 Mandate");
  }
}

function upkeepDraw(G: GameState, next: FactionId): void {
  const key = playerKey(next);
  const p = G[key];
  let n = next === WHITE ? CONFIG.white.draw_per_turn : CONFIG.red.draw_per_turn;
  if (next === WHITE && G.white.decreesInPlay.includes("civic_endowment")) n += 1;
  let drawn = 0;
  while (drawn < n && p.deck.length > 0) {
    p.hand.push(p.deck.shift()!);
    drawn += 1;
  }
  if (drawn > 0) G.log.push(`  · ${key} draws ${drawn}`);
}

// ---- game ------------------------------------------------------------------

// Tiny seedable PRNG so the JSON-deck shuffle is deterministic per match.
function seededShuffle<T>(arr: T[], seed: number): T[] {
  const a = arr.slice();
  let s = seed >>> 0 || 1;
  for (let i = a.length - 1; i > 0; i--) {
    s = (s * 1664525 + 1013904223) >>> 0;
    const j = s % (i + 1);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export const MandateGame: Game<GameState> = {
  name: "the-mandate",

  setup: ({ ctx, random }) => {
    // boardgame.io provides `random` for replayable RNG; fall back to a stable
    // seed if it isn't available (shouldn't happen in normal Client setup).
    const seed = random ? Math.floor(random.Number() * 1e9) : 12345;
    const deck = seededShuffle(WHITE_DECK_TEMPLATE, seed);
    const starting = CONFIG.white.starting_hand;
    const whiteHand = deck.slice(0, starting);
    const whiteDeck = deck.slice(starting);

    const white = emptyPlayer();
    white.hand = whiteHand;
    white.deck = whiteDeck;
    white.soldiers = CONFIG.white.starting_soldiers;
    white.supporters = CONFIG.white.starting_supporters;

    const red = emptyPlayer();
    red.soldiers = CONFIG.red.starting_soldiers;
    red.supporters = CONFIG.red.starting_supporters;

    void ctx; // unused
    return {
      mandate: { [WHITE]: 0, [RED]: 0 },
      white,
      red,
      log: [`--- game start, target = ${CONFIG.mandate_target} ---`],
    };
  },

  turn: {
    minMoves: CONFIG.actions_per_turn,
    maxMoves: CONFIG.actions_per_turn,
    onEnd: ({ G, ctx }) => {
      const ending = ctx.currentPlayer as FactionId;
      if (ending === WHITE) resolveWhiteEndOfTurn(G);
      else resolveRedEndOfTurn(G);
      resetTurnFlags(G);
      const next = opponentOf(ending);
      upkeepDraw(G, next);
      G.log.push(`--- turn ${ctx.turn + 1}, ${playerKey(next)} to act ---`);
    },
  },

  moves: {
    playDecree,
    deploy,
    research,
    strikeMandate,
    strikeDecree,
  },

  endIf: ({ G, ctx }) => {
    const target = CONFIG.mandate_target;
    const w = G.mandate[WHITE];
    const r = G.mandate[RED];
    if (w >= target && r >= target) {
      if (w === r) return { winner: ctx.currentPlayer };
      return { winner: w > r ? WHITE : RED };
    }
    if (w >= target) return { winner: WHITE };
    if (r >= target) return { winner: RED };
    if (ctx.turn >= CONFIG.max_turns) {
      if (w === r) return { draw: true };
      return { winner: w > r ? WHITE : RED };
    }
  },
};
