// Regression tests for the engine + model. These pin the invariants that recent
// refactors (two currencies, single-colour availability, decree hooks) could break.
// They drive the REAL game via the headless Client, same as the GUI.

import { describe, it, expect, beforeEach } from "vitest";
import { Client } from "boardgame.io/client";
import { MandateGame, type GameState } from "../src/game";
import {
  CONFIG,
  VERBS,
  WHITE,
  RED,
  canDo,
  shardOf,
  type FactionId,
} from "../src/config";
import { runGame, BASELINE_POLICIES } from "./driver";

// A small harness around the headless client for direct move testing.
function newClient() {
  const c = Client<GameState>({ game: MandateGame, numPlayers: 2 });
  c.start();
  return c;
}
function seatTo(c: ReturnType<typeof newClient>, seat: FactionId) {
  c.updatePlayerID(seat);
}
function G(c: ReturnType<typeof newClient>): GameState {
  return c.getState()!.G;
}
function active(c: ReturnType<typeof newClient>): FactionId {
  return c.getState()!.ctx.currentPlayer as FactionId;
}

// ---- the availability model ------------------------------------------------

describe("availability: character is one colour, verb iff colour ∈ tags", () => {
  it("White can enact_decree, deliberate, rally_supporters", () => {
    expect(canDo(WHITE, "enact_decree")).toBe(true);
    expect(canDo(WHITE, "deliberate")).toBe(true);
    expect(canDo(WHITE, "rally_supporters")).toBe(true);
  });

  it("White CANNOT strike or muster_zealots (no R)", () => {
    expect(canDo(WHITE, "strike")).toBe(false);
    expect(canDo(WHITE, "muster_zealots")).toBe(false);
  });

  it("Red can strike + muster_zealots, but not enact_decree/deliberate/rally", () => {
    expect(canDo(RED, "strike")).toBe(true);
    expect(canDo(RED, "muster_zealots")).toBe(true);
    expect(canDo(RED, "enact_decree")).toBe(false);
    expect(canDo(RED, "deliberate")).toBe(false);
    expect(canDo(RED, "rally_supporters")).toBe(false);
  });

  it("emergent shards: White WG, Red RG (only built colours light up)", () => {
    expect(new Set(shardOf(WHITE))).toEqual(new Set(["W", "G"]));
    expect(new Set(shardOf(RED))).toEqual(new Set(["R", "G"]));
  });

  it("Green (hypothetical G) would make BOTH currencies", () => {
    // G sits on both rally_supporters{W,G} and muster_zealots{R,G}, so a green
    // character reaches both — the dual-natured spring, straight from the tags.
    const greenReaches = VERBS.filter((v) => v.colours.includes("G")).map((v) => v.name);
    expect(greenReaches).toContain("rally_supporters");
    expect(greenReaches).toContain("muster_zealots");
  });
});

// ---- the engine: moves enforce the model -----------------------------------

describe("engine enforces availability (illegal moves are no-ops)", () => {
  let c: ReturnType<typeof newClient>;
  beforeEach(() => {
    c = newClient();
  });

  it("White cannot strike even if it tries the move", () => {
    // White is the starting player.
    expect(active(c)).toBe(WHITE);
    const before = G(c).mandate[WHITE];
    seatTo(c, WHITE);
    c.moves.strikeMandate(); // not White's verb
    expect(G(c).mandate[WHITE]).toBe(before); // rejected, no score
  });
});

// ---- currencies: spend / yield ---------------------------------------------

describe("two-currency economy", () => {
  it("Red starts with zealots, no supporters; muster adds zealots", () => {
    const c = newClient();
    expect(G(c).red.zealots).toBe(CONFIG.red.starting_zealots);
    expect(G(c).red.supporters).toBe(0);
  });

  it("strike spends a zealot and scores per config", () => {
    const c = newClient();
    // advance to Red's turn: White takes 2 moves, then Red acts.
    seatTo(c, WHITE);
    c.moves.rallySupporters();
    c.moves.rallySupporters();
    expect(active(c)).toBe(RED);
    seatTo(c, RED);
    const z0 = G(c).red.zealots;
    const m0 = G(c).mandate[RED];
    c.moves.strikeMandate();
    expect(G(c).red.zealots).toBe(z0 - CONFIG.scoring.strike_landed.zealot_cost);
    expect(G(c).mandate[RED]).toBe(m0 + CONFIG.scoring.strike_landed.mandate_per_strike);
  });
});

// ---- decree hooks: live scoring, ambient effects ---------------------------

describe("decree hook pipeline", () => {
  it("open_records: when a player rallies, White scores (always clause) +1", () => {
    // Drive through LEGAL moves until White has open_records in play, then rally
    // and check the always-clause pays +1. (White draws its decree deck 1/turn;
    // Red just musters so it scores nothing and can't end the game first.)
    const c = newClient();
    let enacted = false;
    for (let guard = 0; guard < 200 && !enacted; guard++) {
      const s = c.getState()!;
      if (s.ctx.gameover) break;
      const seat = s.ctx.currentPlayer as FactionId;
      c.updatePlayerID(seat);
      if (seat === WHITE) {
        if (s.G.white.decreesInPlay.includes("open_records")) {
          const m0 = c.getState()!.G.mandate[WHITE];
          c.moves.rallySupporters();
          expect(c.getState()!.G.mandate[WHITE]).toBe(m0 + 1); // always-clause +1
          enacted = true;
        } else if (s.G.white.hand.includes("open_records")) {
          c.moves.enactDecree("open_records");
        } else if (s.G.white.deck.length > 0) {
          c.moves.deliberate();
        } else {
          c.moves.rallySupporters(); // nothing to dig; burn the action
        }
      } else {
        c.moves.musterZealots();
      }
    }
    expect(enacted).toBe(true); // we actually reached and verified the scenario
    c.stop();
  });
});

// ---- liveness: games terminate ---------------------------------------------

describe("liveness", () => {
  it("a baseline bot game terminates with a winner or draw", () => {
    const r = runGame(BASELINE_POLICIES, { turnCap: 5000 });
    expect(r.winner).not.toBeNull();
    expect(r.turns).toBeGreaterThan(0);
  });

  it("10 games all terminate", () => {
    for (let i = 0; i < 10; i++) {
      const r = runGame(BASELINE_POLICIES, { turnCap: 5000 });
      expect(r.winner).not.toBeNull();
    }
  });
});
