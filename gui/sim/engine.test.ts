// Regression tests for the engine + model. These pin the invariants that recent
// refactors (two currencies, single-colour availability, decree hooks, shared decks,
// player-owned support) could break. They drive the REAL game via the headless Client,
// same as the GUI. They assert BEHAVIOUR against config, never specific balance numbers
// (those are meant to be tuned freely — pinning them here would break every tuning pass).

import { describe, it, expect, beforeEach } from "vitest";
import { Client } from "boardgame.io/client";
import { MandateGame, supportOn, type GameState } from "../src/game";
import {
  CONFIG,
  FACTIONS,
  DECREES,
  VERBS,
  WHITE_DECK_TEMPLATE,
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

  it("emergent shards reflect the verb tags: White WUG, Red RG", () => {
    // White reaches enact_decree{W,U,G}, so U lights up in its footprint even though
    // no U-character is built — the shard is purely a consequence of the verb tags.
    expect(new Set(shardOf(WHITE))).toEqual(new Set(["W", "U", "G"]));
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

// ---- state shape: decks are shared, decrees are communal --------------------

describe("shared resources", () => {
  it("the decree deck lives on G (shared), not on a player", () => {
    const c = newClient();
    expect(Array.isArray(G(c).decreeDeck)).toBe(true);
    // White's opening hand was dealt from the shared deck; the rest remains shared.
    expect(G(c).decreeDeck.length).toBe(
      WHITE_DECK_TEMPLATE.length - FACTIONS[WHITE].starting_hand,
    );
    expect("deck" in (G(c).players[WHITE] as object)).toBe(false); // no per-player deck
  });

  it("an enacted decree lands on the shared table", () => {
    const c = newClient();
    expect(driveUntilInPlay(c, "open_records")).toBe(true);
    expect(G(c).decreesInPlay).toContain("open_records");
  });
});

// ---- currencies: spend / yield ---------------------------------------------

describe("two-currency economy", () => {
  it("Red starts per config (no supporters); muster adds zealots", () => {
    const c = newClient();
    expect(G(c).players[RED].zealots).toBe(FACTIONS[RED].starting_zealots);
    expect(G(c).players[RED].supporters).toBe(0);
  });

  it("Mandate-strike spends a zealot and scores per config", () => {
    const c = newClient();
    // White takes its 2 moves; then Red musters to afford a strike, ending its turn. Next
    // Red turn it strikes from the stockpile.
    seatTo(c, WHITE);
    c.moves.rallySupporters();
    c.moves.rallySupporters();
    expect(active(c)).toBe(RED);
    seatTo(c, RED);
    c.moves.musterZealots(); // action 1
    c.moves.musterZealots(); // action 2 → turn ends with a stockpile
    // back to Red after White's turn
    seatTo(c, WHITE);
    c.moves.rallySupporters();
    c.moves.rallySupporters();
    expect(active(c)).toBe(RED);
    seatTo(c, RED);
    const z0 = G(c).players[RED].zealots;
    const m0 = G(c).mandate[RED];
    c.moves.strikeMandate();
    expect(G(c).players[RED].zealots).toBe(z0 - CONFIG.scoring.strike_landed.zealot_cost);
    expect(G(c).mandate[RED]).toBe(m0 + CONFIG.scoring.strike_landed.mandate_per_strike);
  });
});

// ---- decrees: shared verb + supporter-scoring ------------------------------

// Advance until it's White's turn with no moves used yet — a clean slate to test a
// 2-action White sequence. White burns time with `deliberate` (no resource side-effects,
// unlike rally which would pollute the supporter stock) when the shared deck has cards,
// else rally as a fallback. Red just musters (scores nothing, can't end the game first).
function freshWhiteTurn(c: ReturnType<typeof newClient>): void {
  for (let guard = 0; guard < 50; guard++) {
    const s = c.getState()!;
    if (s.ctx.gameover) return;
    if (s.ctx.currentPlayer === WHITE && (s.ctx.numMoves ?? 0) === 0) return;
    c.updatePlayerID(s.ctx.currentPlayer);
    if (s.ctx.currentPlayer === WHITE) {
      if (s.G.decreeDeck.length > 0) c.moves.deliberate();
      else c.moves.rallySupporters();
    } else {
      c.moves.musterZealots();
    }
  }
}

function driveUntilInPlay(c: ReturnType<typeof newClient>, decree: string): boolean {
  for (let guard = 0; guard < 300; guard++) {
    const s = c.getState()!;
    if (s.ctx.gameover) return false;
    const seat = s.ctx.currentPlayer as FactionId;
    c.updatePlayerID(seat);
    if (seat === WHITE) {
      if (s.G.decreesInPlay.includes(decree)) return true;
      if (s.G.players[WHITE].hand.includes(decree)) c.moves.enactDecree(decree);
      else if (s.G.decreeDeck.length > 0) c.moves.deliberate();
      else c.moves.rallySupporters();
    } else {
      c.moves.musterZealots();
    }
  }
  return false;
}

describe("enact_decree is SHARED (governance trio), not White's signature", () => {
  it("Red (R) still cannot enact decrees", () => {
    expect(canDo(RED, "enact_decree")).toBe(false);
  });
  it("White (W) can enact and support; Red cannot", () => {
    expect(canDo(WHITE, "enact_decree")).toBe(true);
    expect(canDo(WHITE, "allocate_supporters")).toBe(true);
    expect(canDo(RED, "allocate_supporters")).toBe(false);
    expect(canDo(RED, "enact_decree")).toBe(false);
  });
});

describe("supporter-scoring: only supported decrees bite (markers+shields collapsed)", () => {
  it("UNSUPPORTED open_records does NOT score when a player rallies", () => {
    const c = newClient();
    expect(driveUntilInPlay(c, "open_records")).toBe(true);
    freshWhiteTurn(c);
    seatTo(c, WHITE);
    expect(supportOn(G(c), "open_records")).toBe(0); // confirm unsupported
    const m0 = G(c).mandate[WHITE];
    c.moves.rallySupporters();
    expect(G(c).mandate[WHITE]).toBe(m0); // unsupported = worthless
    c.stop();
  });

  it("SUPPORTED open_records scores its supporter +score on each rally (always clause)", () => {
    const c = newClient();
    expect(driveUntilInPlay(c, "open_records")).toBe(true);
    // Need a supporter in stock to place. Rally once, then support, then rally to bite.
    freshWhiteTurn(c);
    seatTo(c, WHITE);
    c.moves.rallySupporters(); // action 1: +supporter(s) to stock
    c.moves.allocateSupporters(["open_records"]); // action 2: place support (scores it on)
    expect(supportOn(G(c), "open_records")).toBe(1);
    // New White turn: rally → supported open_records bites.
    freshWhiteTurn(c);
    seatTo(c, WHITE);
    const m0 = G(c).mandate[WHITE];
    c.moves.rallySupporters();
    expect(G(c).mandate[WHITE]).toBe(m0 + (DECREES["open_records"].score?.amount ?? 0));
    c.stop();
  });

  it("allocate places no more than the available stock", () => {
    const c = newClient();
    expect(driveUntilInPlay(c, "open_records")).toBe(true);
    freshWhiteTurn(c);
    seatTo(c, WHITE);
    const stock = G(c).players[WHITE].supporters;
    const before = supportOn(G(c), "open_records");
    // Try to place K supporters; engine caps at stock (and K).
    c.moves.allocateSupporters(Array(CONFIG.supporter_allocate_k).fill("open_records"));
    const placed = supportOn(G(c), "open_records") - before;
    expect(placed).toBe(Math.min(stock, CONFIG.supporter_allocate_k));
    c.stop();
  });

  it("striking a decree yields Red NO Mandate (pure removal)", () => {
    const c = newClient();
    expect(driveUntilInPlay(c, "open_records")).toBe(true);
    // It's White's turn; end it so Red can act with a zealot.
    seatTo(c, WHITE);
    c.moves.rallySupporters();
    c.moves.deliberate();
    expect(active(c)).toBe(RED);
    seatTo(c, RED);
    expect(G(c).decreesInPlay).toContain("open_records");
    if (G(c).players[RED].zealots < 1) c.moves.musterZealots(); // ensure affordable
    const m0 = G(c).mandate[RED];
    const z0 = G(c).players[RED].zealots;
    c.moves.strikeDecree("open_records");
    expect(G(c).decreesInPlay).not.toContain("open_records"); // removed (it was unsupported)
    expect(G(c).mandate[RED]).toBe(m0); // but +0 Mandate
    expect(G(c).players[RED].zealots).toBe(
      z0 - CONFIG.scoring.strike_landed.decree_strike_zealot_cost,
    ); // still costs a zealot
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
