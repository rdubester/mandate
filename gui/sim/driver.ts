// Headless driver: runs the REAL game (src/game.ts) via boardgame.io's vanilla
// Client — no engine reimplementation, so the sim and the GUI share one source of
// truth. A "policy" is a function that, given the current state for the player to
// act, picks one move to call. The driver alternates seats, lets each policy pick,
// and runs until boardgame.io reports a winner (or a turn cap, as a safety net).

import { Client } from "boardgame.io/client";
import { MandateGame, strikeCost } from "../src/game";
import type { GameState } from "../src/game";
import { CONFIG, WHITE, RED, DECREES, canDo, type FactionId } from "../src/config";

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
  // White wins by MARKED decrees biting, and defends them with shields so Red can't
  // cheaply remove them. Priority: enact a scoring decree → mark it → shield marked
  // decrees (especially threatened ones) → dig/rally for fuel.
  const scoringInHand = G.white.hand.find((id) => DECREES[id]?.score);
  if (canDo(seat, "enact_decree") && scoringInHand) {
    return { move: "enactDecree", args: [scoringInHand] };
  }
  // Mark an in-play scoring decree we haven't marked yet.
  if (canDo(seat, "mark") && G.whiteMarkers > 0) {
    const markable = G.white.decreesInPlay.find(
      (id) => !G.marks.includes(id) && DECREES[id]?.score,
    );
    if (markable) return { move: "mark", args: [markable] };
  }
  // Shield marked decrees (defend the scoring engine): pile this turn's K onto the
  // marked decree with the fewest shields. allocate_supporters caps internally at K/stock.
  if (canDo(seat, "allocate_supporters") && G.white.supporters > 0) {
    const targets = G.marks.filter((id) => G.white.decreesInPlay.includes(id));
    if (targets.length > 0) {
      targets.sort((a, b) => (G.shields[a] ?? 0) - (G.shields[b] ?? 0));
      // Stage K shields on the most-exposed marked decree (driver picks one; engine caps).
      const k = CONFIG.supporter_allocate_k;
      return { move: "allocateSupporters", args: [Array(k).fill(targets[0])] };
    }
  }
  // Fuel: rally if we have marked decrees to defend but no supporters; else dig.
  const needSupporters = G.marks.length > 0 && G.white.supporters === 0;
  if (needSupporters && canDo(seat, "rally_supporters")) return { move: "rallySupporters" };
  if (canDo(seat, "enact_decree") && G.white.hand.length > 0) {
    return { move: "enactDecree", args: [G.white.hand[0]] };
  }
  if (canDo(seat, "deliberate") && G.white.deck.length > 0) return { move: "deliberate" };
  if (canDo(seat, "rally_supporters")) return { move: "rallySupporters" };
  return null;
};

const redPolicy: Policy = (G, seat) => {
  // Red's oppressive job: tear down White's SCORING decrees (marked ones) — but each strike
  // costs a zealot + action and must grind through shields, so it's a real tempo investment,
  // not a free 'no' button. Heuristic: if White has a marked scoring decree, dismantle it
  // (strike it down); else race the Mandate track; else muster.
  const canStrikeNow = canDo(seat, "strike") && G.red.zealots >= strikeCost(G);
  if (canStrikeNow) {
    const threat = G.marks.find((id) => G.white.decreesInPlay.includes(id));
    if (threat) return { move: "strikeDecree", args: [threat] };
    return { move: "strikeMandate" };
  }
  if (canDo(seat, "muster_zealots")) return { move: "musterZealots" };
  return null;
};

export const BASELINE_POLICIES: Record<FactionId, Policy> = {
  [WHITE]: whitePolicy,
  [RED]: redPolicy,
};

export { SEATS };
