import type { Game, Move } from "boardgame.io";
import { INVALID_MOVE } from "boardgame.io/core";
import {
  CONFIG,
  DECREES,
  WHITE,
  RED,
  WHITE_DECK_TEMPLATE,
  canDo,
  verbsFor,
  type FactionId,
} from "./config";

// G — the shared game state. boardgame.io uses immer; mutate in place.
export interface PlayerState {
  hand: string[];
  deck: string[];
  decreesInPlay: string[];
  supporters: number;
  zealots: number;
  playedDecreeThisTurn: boolean;
  playedResearchThisTurn: boolean;
  actedUnitThisTurn: boolean;
}

export interface GameState {
  mandate: Record<FactionId, number>;
  white: PlayerState;
  red: PlayerState;
  // White's platform markers. `markers` = tokens still in the pool; `marks` = decree
  // ids (on any player's board) currently carrying a White token. White scores when a
  // marked decree's output bites. A token returns to the pool when its decree leaves play.
  whiteMarkers: number;
  marks: string[];
  log: string[];
}

// ---- helpers ---------------------------------------------------------------

function emptyPlayer(): PlayerState {
  return {
    hand: [],
    deck: [],
    decreesInPlay: [],
    supporters: 0,
    zealots: 0,
    playedDecreeThisTurn: false,
    playedResearchThisTurn: false,
    actedUnitThisTurn: false,
  };
}

function opponentOf(p: FactionId): FactionId {
  return p === WHITE ? RED : WHITE;
}

function playerKey(id: FactionId): "white" | "red" {
  return id === WHITE ? "white" : "red";
}

// ---- decree hook pipeline (port of decrees.fire) ---------------------------
// Run every installed decree against a verb event taken by `player`. Returns the
// modifiers the verb reads, and applies Mandate payouts to decree owners as a
// side effect. detail carries verb-specific data (e.g. {deck: "research"}).

interface DecreeMods {
  cost_delta: number;
  extra_draw: number;
  yield_delta: number;
}

export function allDecreesInPlay(G: GameState): Array<{ owner: FactionId; id: string }> {
  const out: Array<{ owner: FactionId; id: string }> = [];
  for (const owner of [WHITE, RED] as const) {
    for (const id of G[playerKey(owner)].decreesInPlay) out.push({ owner, id });
  }
  return out;
}

function matches(
  trigger: { on: string; detail?: Record<string, string> },
  verb: string,
  detail: Record<string, string>,
): boolean {
  if (trigger.on !== verb) return false;
  if (!trigger.detail) return true;
  return Object.entries(trigger.detail).every(([k, v]) => detail[k] === v);
}

// Compliance policy: the acting player decides whether to take an offered rider.
// Default greedy-accept (matches the Python default), so the choice point exists
// but current play takes every beneficial rider. Hook for smarter policies later.
function wantsRider(): boolean {
  return true;
}

function fireDecrees(
  G: GameState,
  verb: string,
  player: FactionId,
  detail: Record<string, string>,
): DecreeMods {
  const mods: DecreeMods = { cost_delta: 0, extra_draw: 0, yield_delta: 0 };

  for (const { id } of allDecreesInPlay(G)) {
    const spec = DECREES[id];
    if (!spec || !matches(spec.trigger, verb, detail)) continue;

    // Ambient effect (no choice).
    if (spec.effect) {
      for (const [k, v] of Object.entries(spec.effect)) {
        mods[k as keyof DecreeMods] += v as number;
      }
    }

    // Rider (the 'may'): offer to the acting player. `complied` = the output fired.
    let complied = false;
    if (spec.rider && wantsRider()) {
      complied = true;
      for (const [k, v] of Object.entries(spec.rider.effect)) {
        mods[k as keyof DecreeMods] += v;
      }
    }

    // Scoring: decrees pay no one for ownership. White scores ONLY if its marker is on
    // this decree AND the output "bit" (rider complied, or an always-clause fired).
    if (spec.score && G.marks.includes(id)) {
      const { when, amount } = spec.score;
      const bit = (when === "compliance" && complied) || when === "always";
      if (bit && amount) {
        G.mandate[WHITE] += amount;
        G.log.push(
          `  · marked decree '${id}' bites (${when}): white +${amount} Mandate` +
            (complied ? ` [${playerKey(player)} complied]` : ""),
        );
      }
    }
  }
  return mods;
}

// Centralized draw: fires the on-draw hook per card so 'when a player draws...'
// decrees work for both research and the upkeep draw. Returns count drawn.
function drawCards(
  G: GameState,
  player: FactionId,
  base: number,
  deckKind: string,
): number {
  const p = G[playerKey(player)];
  let drawn = 0;
  for (let i = 0; i < base; i++) {
    if (p.deck.length === 0) break;
    const mods = fireDecrees(G, "draw", player, { deck: deckKind });
    p.hand.push(p.deck.shift()!);
    drawn += 1;
    let extra = mods.extra_draw;
    while (extra > 0 && p.deck.length > 0) {
      p.hand.push(p.deck.shift()!);
      drawn += 1;
      extra -= 1;
    }
  }
  return drawn;
}

// Ambient zealot-cost delta from decrees hooking 'strike' (e.g. martial_restraint +1).
function strikeCostDelta(G: GameState): number {
  let delta = 0;
  for (const { id } of allDecreesInPlay(G)) {
    const spec = DECREES[id];
    if (spec?.trigger.on === "strike") delta += spec.effect?.cost_delta ?? 0;
  }
  return delta;
}

// Zealot cost to strike the Mandate track (base + ambient delta). Used by Board/driver
// to preview affordability.
function strikeCost(G: GameState): number {
  return CONFIG.scoring.strike_landed.zealot_cost + strikeCostDelta(G);
}

// Zealot cost to remove a decree (a separate, sweepable lever; yields 0 Mandate).
function decreeStrikeCost(G: GameState): number {
  return CONFIG.scoring.strike_landed.decree_strike_zealot_cost + strikeCostDelta(G);
}

// Guard shared by every move: right player, their turn, and their colour can do
// this verb (the whole availability rule lives in canDo).
function canAct(player: string, ctx: { currentPlayer: string }, verb: string): boolean {
  return player === ctx.currentPlayer && canDo(player as FactionId, verb);
}

// ---- moves -----------------------------------------------------------------

const enactDecree: Move<GameState> = ({ G, playerID, ctx }, cardId: string) => {
  if (!playerID || !canAct(playerID, ctx, "enact_decree")) return INVALID_MOVE;
  const p = G[playerKey(playerID as FactionId)];
  const idx = p.hand.indexOf(cardId);
  if (idx === -1) return INVALID_MOVE;
  p.hand.splice(idx, 1);
  p.decreesInPlay.push(cardId);
  p.playedDecreeThisTurn = true;
  G.log.push(`${playerKey(playerID as FactionId)} enacts decree '${cardId}'`);
};

// White's signature: spend a marker from the pool onto a decree in play (any board).
// White then scores when that decree's output bites. Markers are scarce (whiteMarkers).
const mark: Move<GameState> = ({ G, playerID, ctx }, decreeId: string) => {
  if (!playerID || !canAct(playerID, ctx, "mark")) return INVALID_MOVE;
  if (G.whiteMarkers <= 0) return INVALID_MOVE; // pool empty
  if (G.marks.includes(decreeId)) return INVALID_MOVE; // already marked
  const inPlay = allDecreesInPlay(G).some((d) => d.id === decreeId);
  if (!inPlay) return INVALID_MOVE; // can only mark a decree on the table
  G.whiteMarkers -= 1;
  G.marks.push(decreeId);
  G.log.push(`white marks decree '${decreeId}' (${G.whiteMarkers} markers left)`);
};

function growUnits(
  G: GameState,
  player: FactionId,
  verb: "rally_supporters" | "muster_zealots",
  unit: "supporters" | "zealots",
): void {
  const base = CONFIG.unit_yield[verb];
  const mods = fireDecrees(G, verb, player, { unit });
  const n = Math.max(0, base + mods.yield_delta);
  const p = G[playerKey(player)];
  p[unit] += n;
  p.actedUnitThisTurn = true;
  G.log.push(`${playerKey(player)} ${verb}: +${n} ${unit}`);
}

const rallySupporters: Move<GameState> = ({ G, playerID, ctx }) => {
  if (!playerID || !canAct(playerID, ctx, "rally_supporters")) return INVALID_MOVE;
  growUnits(G, playerID as FactionId, "rally_supporters", "supporters");
};

const musterZealots: Move<GameState> = ({ G, playerID, ctx }) => {
  if (!playerID || !canAct(playerID, ctx, "muster_zealots")) return INVALID_MOVE;
  growUnits(G, playerID as FactionId, "muster_zealots", "zealots");
};

// White draws from its own deck. Named 'deliberate' (vs 'research') because for now
// it is White-only {W} — drawing decrees, not Blue's research. When Blue arrives this
// likely becomes a shared W–U verb; reskin then.
const deliberate: Move<GameState> = ({ G, playerID, ctx }) => {
  if (!playerID || !canAct(playerID, ctx, "deliberate")) return INVALID_MOVE;
  const me = playerID as FactionId;
  const p = G[playerKey(me)];
  p.playedResearchThisTurn = true;
  if (p.deck.length === 0) {
    G.log.push(`${playerKey(me)} deliberates (no deck)`);
    return;
  }
  const n = drawCards(G, me, 1, "decree");
  G.log.push(`${playerKey(me)} deliberates: drew ${n}`);
};

const strikeMandate: Move<GameState> = ({ G, playerID, ctx }) => {
  if (!playerID || !canAct(playerID, ctx, "strike")) return INVALID_MOVE;
  const me = playerID as FactionId;
  const opp = opponentOf(me);
  const mods = fireDecrees(G, "strike", me, { target: "mandate" });
  const cost = Math.max(0, CONFIG.scoring.strike_landed.zealot_cost + mods.cost_delta);
  const p = G[playerKey(me)];
  if (p.zealots < cost) return INVALID_MOVE;
  p.zealots -= cost;
  const sc = CONFIG.scoring.strike_landed;
  G.mandate[opp] = Math.max(0, G.mandate[opp] - sc.marker_knockback);
  G.mandate[me] += sc.mandate_per_strike;
  G.log.push(
    `${playerKey(me)} strikes ${playerKey(opp)}'s Mandate: −${sc.marker_knockback} to ${playerKey(opp)}, +${sc.mandate_per_strike} to ${playerKey(me)}`,
  );
};

// Strike a decree = pure removal. Costs decree_strike_zealot_cost (+ ambient delta) and
// an action, and yields NO Mandate. Red spends tempo/ammo dealing with threats instead
// of racing the Mandate track — that is how decrees slow Red, not how Red scores.
const strikeDecree: Move<GameState> = ({ G, playerID, ctx }, decreeId: string) => {
  if (!playerID || !canAct(playerID, ctx, "strike")) return INVALID_MOVE;
  const me = playerID as FactionId;
  const opp = opponentOf(me);
  const mods = fireDecrees(G, "strike", me, { target: "decree" });
  const cost = Math.max(
    0,
    CONFIG.scoring.strike_landed.decree_strike_zealot_cost + mods.cost_delta,
  );
  const p = G[playerKey(me)];
  if (p.zealots < cost) return INVALID_MOVE;
  const idx = G[playerKey(opp)].decreesInPlay.indexOf(decreeId);
  if (idx === -1) return INVALID_MOVE;
  p.zealots -= cost;
  G[playerKey(opp)].decreesInPlay.splice(idx, 1);
  // If no copy of this decree id remains in play, any White marker on it returns to the
  // pool (the platform White was defending is gone).
  const stillInPlay = allDecreesInPlay(G).some((d) => d.id === decreeId);
  if (!stillInPlay) {
    const mi = G.marks.indexOf(decreeId);
    if (mi >= 0) {
      G.marks.splice(mi, 1);
      G.whiteMarkers += 1;
      G.log.push(`  · white's marker on '${decreeId}' returns to pool`);
    }
  }
  G.log.push(
    `${playerKey(me)} strikes decree '${decreeId}' off ${playerKey(opp)}'s board (−${cost} zealot, +0 Mandate)`,
  );
};

// ---- turn hooks ------------------------------------------------------------

function resetTurnFlags(G: GameState): void {
  for (const k of ["white", "red"] as const) {
    G[k].playedDecreeThisTurn = false;
    G[k].playedResearchThisTurn = false;
    G[k].actedUnitThisTurn = false;
  }
}

// Upkeep draw routes through the hook-aware draw so 'when a player draws' decrees
// fire on the upkeep draw too. White's deck is decrees (deck kind 'decree').
function upkeepDraw(G: GameState, next: FactionId): void {
  const n = next === WHITE ? CONFIG.white.draw_per_turn : CONFIG.red.draw_per_turn;
  if (n <= 0 || G[playerKey(next)].deck.length === 0) return;
  const deckKind = next === WHITE ? "decree" : "other";
  const drawn = drawCards(G, next, n, deckKind);
  if (drawn > 0) G.log.push(`  · ${playerKey(next)} draws ${drawn}`);
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

  setup: ({ random }) => {
    const seed = random ? Math.floor(random.Number() * 1e9) : 12345;
    const deck = seededShuffle(WHITE_DECK_TEMPLATE, seed);
    const starting = CONFIG.white.starting_hand;

    const white = emptyPlayer();
    white.hand = deck.slice(0, starting);
    white.deck = deck.slice(starting);
    white.supporters = CONFIG.white.starting_supporters;
    white.zealots = CONFIG.white.starting_zealots;

    const red = emptyPlayer();
    red.supporters = CONFIG.red.starting_supporters;
    red.zealots = CONFIG.red.starting_zealots;

    return {
      mandate: { [WHITE]: 0, [RED]: 0 },
      white,
      red,
      whiteMarkers: CONFIG.white.markers,
      marks: [],
      log: [`--- game start, target = ${CONFIG.mandate_target} ---`],
    };
  },

  turn: {
    minMoves: CONFIG.actions_per_turn,
    maxMoves: CONFIG.actions_per_turn,
    onEnd: ({ G, ctx }) => {
      // No decree-scoring pass here — decrees score live, via the verb hooks,
      // when players act under the rules. End of turn just resets and hands off.
      resetTurnFlags(G);
      const next = opponentOf(ctx.currentPlayer as FactionId);
      upkeepDraw(G, next);
      G.log.push(`--- turn ${ctx.turn + 1}, ${playerKey(next)} to act ---`);
    },
  },

  moves: {
    enactDecree,
    mark,
    rallySupporters,
    musterZealots,
    deliberate,
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

// Re-exported for the board UI (preview strike cost / availability).
export { strikeCost, decreeStrikeCost, canDo, verbsFor };
