import type { Game, Move } from "boardgame.io";
import { INVALID_MOVE } from "boardgame.io/core";
import {
  CONFIG,
  DECREES,
  WHITE,
  RED,
  WHITE_DECK_TEMPLATE,
  availableVerbs,
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

function allDecreesInPlay(G: GameState): Array<{ owner: FactionId; id: string }> {
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

  for (const { owner, id } of allDecreesInPlay(G)) {
    const spec = DECREES[id];
    if (!spec || !matches(spec.trigger, verb, detail)) continue;

    // Ambient effect (no choice).
    if (spec.effect) {
      for (const [k, v] of Object.entries(spec.effect)) {
        mods[k as keyof DecreeMods] += v as number;
      }
    }

    // Rider (the 'may'): offer to the acting player.
    let complied = false;
    if (spec.rider && wantsRider()) {
      complied = true;
      for (const [k, v] of Object.entries(spec.rider.effect)) {
        mods[k as keyof DecreeMods] += v;
      }
    }

    // Scoring: owner skims Mandate.
    if (spec.score) {
      const { when, amount } = spec.score;
      const pay = (when === "compliance" && complied) || when === "always";
      if (pay && amount) {
        G.mandate[owner] += amount;
        G.log.push(
          `  · decree '${id}' (${when}): ${playerKey(owner)} +${amount} Mandate` +
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

function strikeCost(G: GameState): number {
  let delta = 0;
  for (const { id } of allDecreesInPlay(G)) {
    const spec = DECREES[id];
    if (spec?.trigger.on === "strike") delta += spec.effect?.cost_delta ?? 0;
  }
  return CONFIG.scoring.strike_landed.zealot_cost + delta;
}

// Guard shared by every move: right player, their turn, verb in their menu.
function canAct(player: string, ctx: { currentPlayer: string }, verb: string): boolean {
  return (
    player === ctx.currentPlayer &&
    availableVerbs(player as FactionId).includes(verb)
  );
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

const research: Move<GameState> = ({ G, playerID, ctx }) => {
  if (!playerID || !canAct(playerID, ctx, "research")) return INVALID_MOVE;
  const me = playerID as FactionId;
  const p = G[playerKey(me)];
  p.playedResearchThisTurn = true;
  if (p.deck.length === 0) {
    G.log.push(`${playerKey(me)} researches (no deck)`);
    return;
  }
  const n = drawCards(G, me, 1, "research");
  G.log.push(`${playerKey(me)} researches: drew ${n}`);
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

const strikeDecree: Move<GameState> = ({ G, playerID, ctx }, decreeId: string) => {
  if (!playerID || !canAct(playerID, ctx, "strike")) return INVALID_MOVE;
  const me = playerID as FactionId;
  const opp = opponentOf(me);
  const mods = fireDecrees(G, "strike", me, { target: "decree" });
  const cost = Math.max(0, CONFIG.scoring.strike_landed.zealot_cost + mods.cost_delta);
  const p = G[playerKey(me)];
  if (p.zealots < cost) return INVALID_MOVE;
  const idx = G[playerKey(opp)].decreesInPlay.indexOf(decreeId);
  if (idx === -1) return INVALID_MOVE;
  p.zealots -= cost;
  G[playerKey(opp)].decreesInPlay.splice(idx, 1);
  G.mandate[me] += CONFIG.scoring.strike_landed.mandate_per_strike;
  G.log.push(
    `${playerKey(me)} strikes decree '${decreeId}' off ${playerKey(opp)}'s board: +${CONFIG.scoring.strike_landed.mandate_per_strike} Mandate`,
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
    rallySupporters,
    musterZealots,
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

// Re-exported for the board UI (preview strike cost / availability).
export { strikeCost, availableVerbs };
