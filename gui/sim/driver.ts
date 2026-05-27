// Headless driver: runs the REAL game (src/game.ts) via boardgame.io bots, one move at a
// time over a minimal store — no engine reimplementation, so the sim and the GUI share one
// source of truth.
//
// Two bot kinds, both driving the SAME Step loop:
//   - RandomBot      — picks uniformly from the game's ai.enumerate. Zero strategy to
//                      maintain (it just reads legal moves), so a mechanic change touches
//                      enumerate ONLY. Used for the fast liveness/smoke pass and `npm run sim`.
//   - MCTSBot (det.) — searches the position; measures the GAME's balance, not a heuristic.
//                      Determinized (see below). Slow; the trustworthy read.
//
// We deliberately do NOT keep hand-tuned strategy bots: their win-rates only ever misled
// (they paper over exploits MCTS finds) and they were a per-mechanic maintenance tax.

import type { Ctx } from "boardgame.io";
import { MandateGame } from "../src/game";
import type { GameState } from "../src/game";
import { SEATS, type SeatId, type Matchup } from "../src/config";

export interface GameResult {
  winner: SeatId | "draw" | null; // the winning SEAT (a table position), not a faction
  turns: number;
  mandate: Record<SeatId, number>;
  log: string[];
}

// ---- determinization (hidden info) -----------------------------------------
// The decree deck ORDER is hidden, but a bot searching the real state would PEEK at the true
// upcoming deck and plan against it. boardgame.io has no built-in hidden-info handling for
// bots (playerView is a UI/network filter, not a search-time sampler), so we determinize at
// each decision: shuffle the undrawn deck in a COPY the bot searches; the chosen move applies
// to the real state. This is PIMC (one sample/decision); ISMCTS is the upgrade if Blue's
// Archive ever makes the hidden info large enough that PIMC plays it incoherently.

function shuffled<T>(arr: T[], rng: () => number): T[] {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// Re-randomize every hidden zone in a state for one playout. Today that's only the undrawn
// decree deck order. When Blue lands, also shuffle the research commons + Blue's Archive and
// re-deal hidden hands here — this is the single seam for it.
function determinize(state: { G: GameState }, rng: () => number): { G: GameState } {
  const G = state.G;
  return { ...state, G: { ...G, decreeDeck: shuffled(G.decreeDeck, rng) } };
}

function makeRng(seed?: number): () => number {
  let s = (seed ?? Date.now()) >>> 0 || 1;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
}

// ---- the shared bot-driven game loop ---------------------------------------

interface MiniState {
  G: GameState;
  ctx: Ctx & { gameover?: { winner?: string; draw?: boolean } };
}

// Minimal redux-like store so Step has the { store } it expects without a full Client (we
// don't need transport/multiplayer for headless self-play).
function createMiniStore(initial: MiniState, reducer: (s: MiniState, a: { type: string }) => MiniState) {
  let state = initial;
  return {
    getState: () => state,
    dispatch: (action: { type: string }) => ((state = reducer(state, action)), action),
  };
}

// Drive a game to completion with one bot per seat. `bots` is keyed by seat id. `matchup`
// (which faction each seat plays) is forwarded to setup via setupData — the InitializeGame
// path DOES forward it (unlike the local Client), so this is where mirrors get configured.
async function runWithBots(
  bots: Record<string, { play: Function }>,
  matchup?: Matchup,
): Promise<GameResult> {
  const { Step } = await import("boardgame.io/ai");
  const { InitializeGame, CreateGameReducer } = await import("boardgame.io/internal");

  const reducer = CreateGameReducer({ game: MandateGame }) as unknown as (s: MiniState, a: { type: string }) => MiniState;
  const initial = InitializeGame({
    game: MandateGame,
    numPlayers: 2,
    setupData: matchup ? { matchup } : undefined,
  }) as unknown as MiniState;
  const store = createMiniStore(initial, reducer);
  const client = { store };

  for (let guard = 0; guard < 5000; guard++) {
    const st = store.getState();
    if (st.ctx.gameover) break;
    const seat = st.ctx.currentPlayer as string;
    await Step(client, bots[seat] as never); // Step calls bot.play() then dispatches the action
  }

  const final = store.getState();
  const over = final.ctx.gameover;
  const G = final.G;
  const mandate = {} as Record<SeatId, number>;
  for (const seat of SEATS) mandate[seat] = G.mandate[seat];
  return {
    winner: over ? (over.draw ? "draw" : (over.winner as SeatId)) : null,
    turns: final.ctx.turn,
    mandate,
    log: G.log,
  };
}

// ---- RandomBot games (fast: liveness + quick distribution reads) -----------

export async function runGameRandom(
  opts: { seed?: number; matchup?: Matchup } = {},
): Promise<GameResult> {
  const { RandomBot } = await import("boardgame.io/ai");
  const enumerate = MandateGame.ai!.enumerate;
  const seed = opts.seed;
  const [a, b] = SEATS;
  const bots = {
    [a]: new RandomBot({ enumerate, seed: seed === undefined ? undefined : String(seed) }),
    [b]: new RandomBot({ enumerate, seed: seed === undefined ? undefined : String(seed + 1) }),
  } as Record<string, { play: Function }>;
  return runWithBots(bots, opts.matchup);
}

// ---- MCTS games (slow: trustworthy balance reads) --------------------------

export async function runGameMCTS(
  opts: { iterations?: number; playoutDepth?: number; seed?: number; matchup?: Matchup } = {},
): Promise<GameResult> {
  const { MCTSBot } = await import("boardgame.io/ai");
  const enumerate = MandateGame.ai!.enumerate;
  const iterations = opts.iterations ?? 200;
  const playoutDepth = opts.playoutDepth ?? 50;

  // A determinizing MCTSBot: before searching, swap in a freshly-shuffled view of the hidden
  // zones so the search can't exploit the true deck order.
  class DeterminizingBot extends MCTSBot {
    private rng = makeRng(opts.seed);
    async play(state: Parameters<MCTSBot["play"]>[0], playerID: string) {
      return super.play(determinize(state as { G: GameState }, this.rng) as typeof state, playerID);
    }
  }
  const makeBot = () => new DeterminizingBot({ game: MandateGame, enumerate, iterations, playoutDepth });
  const [a, b] = SEATS;
  const bots = { [a]: makeBot(), [b]: makeBot() } as Record<string, { play: Function }>;
  return runWithBots(bots, opts.matchup);
}
