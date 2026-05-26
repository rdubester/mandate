// Headless driver: runs the REAL game (src/game.ts) via boardgame.io's vanilla
// Client — no engine reimplementation, so the sim and the GUI share one source of
// truth. A "policy" is a function that, given the current state for the player to
// act, picks one move to call. The driver alternates seats, lets each policy pick,
// and runs until boardgame.io reports a winner (or a turn cap, as a safety net).

import { Client } from "boardgame.io/client";
import { MandateGame, strikeCost } from "../src/game";
import type { GameState } from "../src/game";
import { WHITE, RED, DECREES, canDo, type FactionId } from "../src/config";

export interface MoveChoice {
  move: string; // a key of client.moves
  args?: unknown[];
}

// A policy sees the state and the active seat, and returns one move (or null to
// pass the turn early — rarely needed since turns are fixed-length).
export type Policy = (G: GameState, seat: FactionId) => MoveChoice | null;

export interface GameResult {
  winner: FactionId | "draw" | null;
  turns: number;
  mandate: Record<FactionId, number>;
  log: string[];
}

const SEATS: FactionId[] = [WHITE, RED];

export function runGame(
  policies: Record<FactionId, Policy>,
  opts: { turnCap?: number } = {},
): GameResult {
  const client = Client<GameState>({ game: MandateGame, numPlayers: 2 });
  client.start();

  const turnCap = opts.turnCap ?? 5000; // safety net; real end is endIf
  let steps = 0;

  while (steps++ < turnCap) {
    const state = client.getState();
    if (!state) break;
    if (state.ctx.gameover) break;

    const seat = state.ctx.currentPlayer as FactionId;
    client.updatePlayerID(seat);

    const choice = policies[seat](state.G, seat);
    if (!choice) {
      client.events.endTurn();
      continue;
    }
    const fn = client.moves[choice.move];
    if (!fn) throw new Error(`policy returned unknown move '${choice.move}'`);
    fn(...(choice.args ?? []));
  }

  const final = client.getState();
  const over = final?.ctx.gameover;
  client.stop();

  const G = final!.G;
  return {
    winner: over ? (over.draw ? "draw" : (over.winner as FactionId)) : null,
    turns: final!.ctx.turn,
    mandate: { [WHITE]: G.mandate[WHITE], [RED]: G.mandate[RED] } as Record<FactionId, number>,
    log: G.log,
  };
}

// ---- baseline policies -----------------------------------------------------
// Trivial heuristics, one per colour. Deliberately simple — they exist to make
// games TERMINATE and to read clocks, not to play well. canDo() gates everything,
// so a policy can't pick a move its colour isn't allowed (the engine would reject
// it anyway, but this keeps policies honest and self-documenting).

const whitePolicy: Policy = (G, seat) => {
  // White scores via MARKED decrees biting. So: mark an unmarked decree in play if it
  // has a score and we have a free marker; else enact a scoring decree from hand; else
  // dig with deliberate; else rally.
  if (canDo(seat, "mark") && G.whiteMarkers > 0) {
    const markable = [...G.white.decreesInPlay, ...G.red.decreesInPlay].find(
      (id) => !G.marks.includes(id) && DECREES[id]?.score,
    );
    if (markable) return { move: "mark", args: [markable] };
  }
  if (canDo(seat, "enact_decree") && G.white.hand.length > 0) {
    // Prefer enacting a decree that can actually score when marked.
    const scoring = G.white.hand.find((id) => DECREES[id]?.score) ?? G.white.hand[0];
    return { move: "enactDecree", args: [scoring] };
  }
  if (canDo(seat, "deliberate") && G.white.deck.length > 0) {
    return { move: "deliberate" };
  }
  if (canDo(seat, "rally_supporters")) return { move: "rallySupporters" };
  return null;
};

const redPolicy: Policy = (G, seat) => {
  // Decree-strikes no longer score, so the baseline bot races: strike the Mandate track
  // whenever it can afford it, else muster to afford the next one. It does NOT remove
  // decrees (that's pure tempo loss for a dumb policy) — clearing threats is a strategic
  // choice a smarter policy would weigh, and exactly the lever we want the sim to probe.
  const canAffordStrike = canDo(seat, "strike") && G.red.zealots >= strikeCost(G);
  if (canAffordStrike) return { move: "strikeMandate" };
  if (canDo(seat, "muster_zealots")) return { move: "musterZealots" };
  return null;
};

export const BASELINE_POLICIES: Record<FactionId, Policy> = {
  [WHITE]: whitePolicy,
  [RED]: redPolicy,
};

export { SEATS };
