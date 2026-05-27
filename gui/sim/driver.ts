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
// balance, not our heuristics. Slower (hundreds of playouts per move).
//
// DETERMINIZATION: the decree deck ORDER is hidden information, but MCTSBot searches the
// real state — so without intervention it would PEEK at the true upcoming deck order and
// plan against it (cheating). boardgame.io has no built-in hidden-info handling for bots
// (its playerView is a UI/network filter, not a search-time sampler). So we determinize at
// each decision: shuffle the undrawn deck in a COPY of the state the bot searches, so it
// plans against a plausible-random future, not the real one. The chosen move is applied to
// the real state by Step. (Standard "determinize at the root" — one sample/decision, which
// is cheap and de-biases the peek; full IS-MCTS with many samples/decision can come later.)

// Fisher–Yates shuffle on a fresh copy.
function shuffled<T>(arr: T[], rng: () => number): T[] {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// Re-randomize every hidden zone in a state for one playout. Today that's only the undrawn
// decree deck's order (counts preserved; what's already drawn into hands stays). When Blue
// lands, also shuffle the research commons + Blue's Archive, and re-deal hidden hands here.
function determinize(state: { G: GameState }, rng: () => number): { G: GameState } {
  const G = state.G;
  return { ...state, G: { ...G, decreeDeck: shuffled(G.decreeDeck, rng) } };
}

export async function runGameMCTS(
  opts: { iterations?: number; playoutDepth?: number; seed?: number } = {},
): Promise<GameResult> {
  const { MCTSBot, Step } = await import("boardgame.io/ai");
  const { InitializeGame, CreateGameReducer } = await import("boardgame.io/internal");

  const enumerate = MandateGame.ai!.enumerate;
  const iterations = opts.iterations ?? 200;
  const playoutDepth = opts.playoutDepth ?? 50;

  // A determinizing MCTSBot: before searching, swap in a freshly-shuffled view of the
  // hidden zones so the search can't exploit the true deck order.
  class DeterminizingBot extends MCTSBot {
    private rng = (() => {
      let s = (opts.seed ?? Date.now()) >>> 0 || 1;
      return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
    })();
    async play(state: Parameters<MCTSBot["play"]>[0], playerID: string) {
      return super.play(determinize(state as { G: GameState }, this.rng) as typeof state, playerID);
    }
  }

  const makeBot = () => new DeterminizingBot({ game: MandateGame, enumerate, iterations, playoutDepth });
  const bots = { [WHITE]: makeBot(), [RED]: makeBot() } as Record<string, MCTSBot>;

  // Drive the game one move at a time on the REAL state (Step), letting each seat's bot
  // choose. We own the loop so the bot only ever ACTS on the true state, but SEARCHES on a
  // determinized copy (in play()).
  const reducer = CreateGameReducer({ game: MandateGame });
  const client = { store: createMiniStore(InitializeGame({ game: MandateGame, numPlayers: 2 }), reducer) };

  for (let guard = 0; guard < 5000; guard++) {
    const st = client.store.getState();
    if (st.ctx.gameover) break;
    const seat = st.ctx.currentPlayer as FactionId;
    await Step(client, bots[seat]); // Step calls bot.play() then dispatches the action
  }

  const final = client.store.getState();
  const G = final.G as GameState;
  const over = final.ctx.gameover;
  return {
    winner: over ? (over.draw ? "draw" : (over.winner as FactionId)) : null,
    turns: final.ctx.turn,
    mandate: { [WHITE]: G.mandate[WHITE], [RED]: G.mandate[RED] } as Record<FactionId, number>,
    log: G.log,
  };
}

// Minimal redux-like store so Step has the { store } it expects without spinning up a full
// Client (we don't need transport/multiplayer for a headless self-play loop).
function createMiniStore(initial: unknown, reducer: (s: unknown, a: { type: string }) => unknown) {
  let state = initial;
  return {
    getState: () => state as { G: GameState; ctx: { currentPlayer: string; gameover?: unknown; turn: number } },
    dispatch: (action: { type: string }) => {
      state = reducer(state, action);
      return action;
    },
  };
}
