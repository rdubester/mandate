// The MCTS / RandomBot move generator. Used ONLY by bots (wired into MandateGame.ai.enumerate
// in game.ts). Reads the same rule helpers the moves use, so the bot can only "see" legal,
// affordable actions. Kept out of game.ts so the rules file is an honest rulebook-complexity
// proxy. game.ts imports enumerateMoves at load but only CALLS it at runtime, so this
// game↔ai pair is not a load-time cycle.

import type { AiEnumerate, Game } from "boardgame.io";
import { MCTSBot } from "boardgame.io/ai";
import { CONFIG, DECREES, canDo, type SeatId } from "./config";
import {
  factionOf,
  supportOn,
  strikeCost,
  decreeStrikeCost,
  type GameState,
} from "./game";

// Which stage the active seat is in (boardgame.io tracks it in ctx.activePlayers).
export function stageOf(ctx: { currentPlayer: string; activePlayers?: Record<string, string> | null }): string {
  return ctx.activePlayers?.[ctx.currentPlayer] ?? "main";
}

export function enumerateMoves(
  G: GameState,
  ctx: { currentPlayer: string; activePlayers?: Record<string, string> | null },
): AiEnumerate {
  const out: AiEnumerate = [];
  const seat = ctx.currentPlayer as SeatId;
  const faction = factionOf(G, seat);
  const p = G.players[seat];

  // UPKEEP stage: the only move is drawUpkeep. Fork it over the power set of in-play upkeep
  // decrees that offer a rider — one option per take/decline combination (small: 0-1 such
  // decrees today → 1-2 options). The decline arg lists the ids whose riders to refuse.
  if (stageOf(ctx) === "upkeep") {
    const upkeepRiders = G.decreesInPlay.filter(
      (id) => DECREES[id]?.trigger.on === "upkeep" && DECREES[id]?.rider,
    );
    const uniq = [...new Set(upkeepRiders)];
    const combos = 1 << uniq.length; // power set
    for (let mask = 0; mask < combos; mask++) {
      const declined = uniq.filter((_, i) => mask & (1 << i));
      out.push({ move: "drawUpkeep", args: [declined] });
    }
    return out;
  }

  // MAIN stage: the action moves.
  // enact_decree: one option per distinct card in hand the seat could enact.
  if (canDo(faction, "enact_decree")) {
    for (const id of new Set(p.hand)) out.push({ move: "enactDecree", args: [id] });
  }
  // allocate_supporters: all-K-onto-one-decree, one option per in-play decree that has room
  // under the support cap (else the move would be a rejected no-op). Capped at remaining room.
  if (canDo(faction, "allocate_supporters") && p.supporters > 0) {
    const k = CONFIG.supporter_allocate_k;
    const cap = CONFIG.supporter_cap_per_decree;
    for (const id of G.decreesInPlay) {
      const room = cap - supportOn(G, id);
      if (room > 0) out.push({ move: "allocateSupporters", args: [Array(Math.min(k, room)).fill(id)] });
    }
  }
  if (canDo(faction, "deliberate") && (G.decreeDeck.length > 0 || G.decreeDiscard.length > 0))
    out.push({ move: "deliberate" });
  if (canDo(faction, "rally_supporters")) out.push({ move: "rallySupporters" });
  if (canDo(faction, "muster_zealots")) out.push({ move: "musterZealots" });
  // strike: Mandate, or any decree on the table — each gated by its OWN cost.
  if (canDo(faction, "strike")) {
    if (p.zealots >= strikeCost(G)) out.push({ move: "strikeMandate" });
    if (p.zealots >= decreeStrikeCost(G)) {
      for (const id of new Set(G.decreesInPlay)) out.push({ move: "strikeDecree", args: [id] });
    }
  }
  // Always allow ending the turn (lets a bot pass rather than be forced into a bad move).
  if (out.length === 0) out.push({ event: "endTurn" });
  return out;
}

// ---- the determinizing MCTS bot --------------------------------------------
// The decree deck ORDER is hidden, but MCTSBot searches the real state — so plain MCTSBot
// PEEKS at the true upcoming deck. We determinize: before each search, shuffle the hidden
// zones in a COPY (the chosen move still applies to the true state). PIMC (one sample per
// decision). The single seam for hidden zones — when Blue lands, also shuffle its
// commons/Archive + re-deal hidden hands here. Shared by the sim AND the GUI's vs-AI mode.

function shuffled<T>(arr: T[], rng: () => number): T[] {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function determinize(state: { G: GameState }, rng: () => number): { G: GameState } {
  const G = state.G;
  return { ...state, G: { ...G, decreeDeck: shuffled(G.decreeDeck, rng) } };
}

function makeRng(seed?: number): () => number {
  let s = (seed ?? Date.now()) >>> 0 || 1;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
}

// Build a determinizing MCTSBot class for a given game. Factory (takes `game`) so this module
// has no load-time dependency on game.ts's MandateGame (which imports enumerateMoves from here).
export function makeMCTSBot(
  game: Game<GameState>,
  opts: { iterations?: number; playoutDepth?: number; seed?: number } = {},
) {
  const iterations = opts.iterations ?? 200;
  const playoutDepth = opts.playoutDepth ?? 50;
  return class DeterminizingBot extends MCTSBot {
    private rng = makeRng(opts.seed);
    constructor(botOpts: Record<string, unknown>) {
      super({ ...botOpts, game, enumerate: game.ai!.enumerate, iterations, playoutDepth } as never);
    }
    async play(state: Parameters<MCTSBot["play"]>[0], playerID: string) {
      return super.play(determinize(state as { G: GameState }, this.rng) as typeof state, playerID);
    }
  };
}
