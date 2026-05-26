// Headless driver: runs the REAL game (src/game.ts) via boardgame.io's vanilla
// Client — no engine reimplementation, so the sim and the GUI share one source of
// truth. A "policy" is a function that, given the current state for the player to
// act, picks one move to call. The driver alternates seats, lets each policy pick,
// and runs until boardgame.io reports a winner (or a turn cap, as a safety net).

import { Client } from "boardgame.io/client";
import { MandateGame, strikeCost, supportOn } from "../src/game";
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
  // White wins by SUPPORTED decrees biting; support both scores and defends (one concept).
  // Priority: get a scoring decree into play → put support on it (scores + shields it) →
  // pile more support to keep it alive → dig for more decrees.
  const inPlay = G.decreesInPlay;
  const scoringInPlay = inPlay.filter((id) => DECREES[id]?.score);
  const scoringInHand = G.players[WHITE].hand.find((id) => DECREES[id]?.score);

  // Enact a scoring decree if none are in play yet.
  if (canDo(seat, "enact_decree") && scoringInPlay.length === 0 && scoringInHand) {
    return { move: "enactDecree", args: [scoringInHand] };
  }
  // Support a scoring decree (turns scoring on if unsupported; else reinforces the
  // most-exposed one). Pile this turn's K onto a single decree (engine caps at K/stock).
  if (canDo(seat, "allocate_supporters") && G.players[WHITE].supporters > 0 && scoringInPlay.length > 0) {
    const target = [...scoringInPlay].sort(
      (a, b) => supportOn(G, a) - supportOn(G, b),
    )[0];
    return { move: "allocateSupporters", args: [Array(CONFIG.supporter_allocate_k).fill(target)] };
  }
  // Need supporters to support with, or more decrees to support.
  if (scoringInPlay.length > 0 && G.players[WHITE].supporters === 0 && canDo(seat, "rally_supporters")) {
    return { move: "rallySupporters" };
  }
  if (canDo(seat, "enact_decree") && scoringInHand) {
    return { move: "enactDecree", args: [scoringInHand] };
  }
  if (canDo(seat, "deliberate") && G.decreeDeck.length > 0) return { move: "deliberate" };
  if (canDo(seat, "rally_supporters")) return { move: "rallySupporters" };
  return null;
};

const redPolicy: Policy = (G, seat) => {
  // Red's oppressive job: tear down supported scoring decrees — but each strike costs a
  // zealot + action and must grind through support, so it's a real tempo investment, not a
  // free 'no' button. Heuristic: if a supported scoring decree is on the table, dismantle
  // it; else race the Mandate track; else muster.
  const canStrikeNow = canDo(seat, "strike") && G.players[RED].zealots >= strikeCost(G);
  if (canStrikeNow) {
    const threat = G.decreesInPlay.find(
      (id) => supportOn(G, id) > 0 && DECREES[id]?.score,
    );
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

// ---- MCTS games ------------------------------------------------------------
// boardgame.io's MCTSBot plays the position (via the game's ai.enumerate + the real
// reducer) instead of a hand-written script — so its win-rates measure the GAME's
// balance, not our heuristics. Slower (hundreds of playouts per move). Uses Simulate
// to run a full game from the initial state with an MCTSBot per seat.

export async function runGameMCTS(
  opts: { iterations?: number; playoutDepth?: number } = {},
): Promise<GameResult> {
  // Lazy-import the ai + internal entry points (only needed for MCTS runs).
  const { MCTSBot, Simulate } = await import("boardgame.io/ai");
  const { InitializeGame } = await import("boardgame.io/internal");

  const enumerate = MandateGame.ai!.enumerate;
  const iterations = opts.iterations ?? 200;
  const playoutDepth = opts.playoutDepth ?? 50;
  const makeBot = () =>
    new MCTSBot({ game: MandateGame, enumerate, iterations, playoutDepth });

  const state = InitializeGame({ game: MandateGame, numPlayers: 2 });
  const { state: final } = await Simulate({
    game: MandateGame,
    bots: { [WHITE]: makeBot(), [RED]: makeBot() } as Record<string, InstanceType<typeof MCTSBot>>,
    state,
  });

  const G = final.G as GameState;
  const over = final.ctx.gameover;
  return {
    winner: over ? (over.draw ? "draw" : (over.winner as FactionId)) : null,
    turns: final.ctx.turn,
    mandate: { [WHITE]: G.mandate[WHITE], [RED]: G.mandate[RED] } as Record<FactionId, number>,
    log: G.log,
  };
}
