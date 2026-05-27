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
  type FactionId,
} from "../src/config";
import { runGameRandom } from "./driver";

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
// The turn now opens with an `upkeep` stage (one mandatory drawUpkeep) before the seat can
// take its main-stage actions. Tests that drive moves by hand must clear upkeep first; this
// resolves it (accepting any rider) if the active seat is currently in the upkeep stage.
function upkeep(c: ReturnType<typeof newClient>) {
  const ctx = c.getState()!.ctx as { currentPlayer: string; activePlayers?: Record<string, string> | null };
  if (ctx.activePlayers?.[ctx.currentPlayer] === "upkeep") {
    c.updatePlayerID(ctx.currentPlayer);
    c.moves.drawUpkeep([]);
  }
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

  it("Red can strike, muster, and rally (G-home primitive), but not enact/deliberate", () => {
    expect(canDo(RED, "strike")).toBe(true);
    expect(canDo(RED, "muster_zealots")).toBe(true);
    // rally_supporters is the G-home primitive {G,R,W} — Red reaches it (it has no
    // supporter sink yet, but access is structural, not behavioural).
    expect(canDo(RED, "rally_supporters")).toBe(true);
    expect(canDo(RED, "enact_decree")).toBe(false);
    expect(canDo(RED, "deliberate")).toBe(false);
  });

  it("verbs are signatures (1 colour) or primitives (3 adjacent colours); never 2-colour", () => {
    for (const v of VERBS) {
      expect([1, 3]).toContain(v.colours.length);
    }
  });

  it("Green (hypothetical G) would make BOTH currencies", () => {
    // G is in both rally_supporters {G,R,W} and muster_zealots {R,B,G}, so a green
    // character reaches both unit primitives — straight from the tags.
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

  it("White never permanently starves: drawing past deck end refills from discard", () => {
    // White draws 1/turn from an 8-ish card deck. Drive many White turns deliberating; once
    // it has cards in hand, enact them so they can later recirculate. The deck must never be
    // stuck empty-with-no-recourse: total cards (deck+discard+hand+inPlay) is conserved, and
    // White keeps being able to draw across a span longer than the initial deck.
    const c = newClient();
    let everRefilled = false;
    let drewLate = false;
    for (let t = 0; t < 40; t++) {
      const s = c.getState()!;
      if (s.ctx.gameover) break;
      const seat = s.ctx.currentPlayer as FactionId;
      c.updatePlayerID(seat);
      if (s.ctx.activePlayers?.[seat] === "upkeep") { c.moves.drawUpkeep([]); continue; }
      if (seat === WHITE) {
        const handBefore = s.G.players[WHITE].hand.length;
        // Enact a held decree to feed eventual recirculation; else deliberate to draw.
        if (handBefore > 0) c.moves.enactDecree(s.G.players[WHITE].hand[0]);
        else c.moves.deliberate();
        const after = c.getState()!.G;
        if (after.decreeDiscard.length > 0) everRefilled = true; // discard accrued
        if (t > 16 && after.players[WHITE].hand.length > handBefore) drewLate = true;
      } else {
        // Red strikes White's decrees when it can, sending them to the discard.
        if (c.getState()!.G.players[RED].zealots >= 1 && c.getState()!.G.decreesInPlay.length)
          c.moves.strikeDecree(c.getState()!.G.decreesInPlay[0]);
        else c.moves.musterZealots();
      }
    }
    // Conservation: nothing leaked.
    const g = G(c);
    const total = g.decreeDeck.length + g.decreeDiscard.length +
      g.decreesInPlay.length + g.players[WHITE].hand.length + g.players[RED].hand.length;
    expect(total).toBe(WHITE_DECK_TEMPLATE.length);
    expect(everRefilled || drewLate).toBe(true); // discard cycle is live
    c.stop();
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
    upkeep(c);
    c.moves.rallySupporters();
    c.moves.rallySupporters();
    expect(active(c)).toBe(RED);
    seatTo(c, RED);
    upkeep(c);
    c.moves.musterZealots(); // action 1
    c.moves.musterZealots(); // action 2 → turn ends with a stockpile
    // back to Red after White's turn
    seatTo(c, WHITE);
    upkeep(c);
    c.moves.rallySupporters();
    c.moves.rallySupporters();
    expect(active(c)).toBe(RED);
    seatTo(c, RED);
    upkeep(c);
    const z0 = G(c).players[RED].zealots;
    const m0 = G(c).mandate[RED];
    c.moves.strikeMandate();
    expect(G(c).players[RED].zealots).toBe(z0 - CONFIG.scoring.strike_landed.zealot_cost);
    expect(G(c).mandate[RED]).toBe(m0 + CONFIG.scoring.strike_landed.mandate_per_strike);
  });
});

// ---- decrees: shared verb + supporter-scoring ------------------------------

// Advance until it's White's turn, upkeep just resolved, ready for its main actions — a
// clean slate to test a 2-action White MAIN sequence. White burns time with `deliberate`
// (no resource side-effects, unlike rally which would pollute the supporter stock) when the
// shared deck has cards, else rally. Red just musters. Stops the instant White finishes its
// upkeep (so the caller has White's full 2 main actions to spend).
function freshWhiteTurn(c: ReturnType<typeof newClient>): void {
  for (let guard = 0; guard < 80; guard++) {
    const s = c.getState()!;
    if (s.ctx.gameover) return;
    const seat = s.ctx.currentPlayer as FactionId;
    const stage = (s.ctx.activePlayers as Record<string, string> | null)?.[seat];
    c.updatePlayerID(seat);
    if (seat === WHITE) {
      if (stage === "upkeep") { c.moves.drawUpkeep([]); return; } // upkeep done → main is ready
      // White is mid-main (e.g. we entered on a leftover action) — burn it to hand off.
      if (s.G.decreeDeck.length > 0) c.moves.deliberate();
      else c.moves.rallySupporters();
    } else {
      if (stage === "upkeep") c.moves.drawUpkeep([]);
      else c.moves.musterZealots();
    }
  }
}

function driveUntilInPlay(c: ReturnType<typeof newClient>, decree: string): boolean {
  for (let guard = 0; guard < 400; guard++) {
    const s = c.getState()!;
    if (s.ctx.gameover) return false;
    const seat = s.ctx.currentPlayer as FactionId;
    const stage = (s.ctx.activePlayers as Record<string, string> | null)?.[seat];
    c.updatePlayerID(seat);
    if (stage === "upkeep") { c.moves.drawUpkeep([]); continue; } // resolve upkeep first
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

  it("a SUPPORTED tax decree (martial_restraint) scores White when Red strikes under it", () => {
    const c = newClient();
    expect(driveUntilInPlay(c, "martial_restraint")).toBe(true);
    // Give White a supporter and place it on the tax decree.
    freshWhiteTurn(c);
    seatTo(c, WHITE);
    c.moves.rallySupporters();
    c.moves.allocateSupporters(["martial_restraint"]);
    expect(supportOn(G(c), "martial_restraint")).toBe(1);
    // Advance to a Red turn where Red can afford a strike, then strike the Mandate track.
    for (let g = 0; g < 30; g++) {
      const s = c.getState()!;
      if (
        s.ctx.currentPlayer === RED &&
        s.ctx.activePlayers?.[RED] !== "upkeep" &&
        G(c).players[RED].zealots >= 2
      )
        break;
      c.updatePlayerID(s.ctx.currentPlayer);
      if (s.ctx.activePlayers?.[s.ctx.currentPlayer] === "upkeep") c.moves.drawUpkeep([]);
      else if (s.ctx.currentPlayer === RED) c.moves.musterZealots();
      else c.moves.deliberate();
    }
    seatTo(c, RED);
    upkeep(c);
    expect(active(c)).toBe(RED);
    const wm0 = G(c).mandate[WHITE];
    c.moves.strikeMandate(); // Red strikes; martial_restraint bites for its White supporter
    expect(G(c).mandate[WHITE]).toBe(wm0 + (DECREES["martial_restraint"].score?.amount ?? 0));
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

  it("support on a single decree is capped (no un-removable fortress)", () => {
    const c = newClient();
    expect(driveUntilInPlay(c, "open_records")).toBe(true);
    const cap = CONFIG.supporter_cap_per_decree;
    // Repeatedly rally + dump everything onto open_records over several White turns; total
    // support must never exceed the cap no matter how much White tries to pile on.
    for (let t = 0; t < 6; t++) {
      freshWhiteTurn(c);
      seatTo(c, WHITE);
      c.moves.rallySupporters();
      c.moves.allocateSupporters(Array(CONFIG.supporter_allocate_k * 2).fill("open_records"));
      expect(supportOn(G(c), "open_records")).toBeLessThanOrEqual(cap);
    }
    expect(supportOn(G(c), "open_records")).toBe(cap); // reached, not exceeded
    c.stop();
  });

  it("striking a decree yields Red NO Mandate (pure removal)", () => {
    const c = newClient();
    expect(driveUntilInPlay(c, "open_records")).toBe(true);
    // It's White's turn; end it so Red can act with a zealot.
    seatTo(c, WHITE);
    upkeep(c);
    c.moves.rallySupporters();
    c.moves.deliberate();
    expect(active(c)).toBe(RED);
    seatTo(c, RED);
    upkeep(c);
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
  it("a random-bot game terminates with a winner or draw", async () => {
    const r = await runGameRandom();
    expect(r.winner).not.toBeNull();
    expect(r.turns).toBeGreaterThan(0);
  });

  it("10 random-bot games all terminate", async () => {
    for (let i = 0; i < 10; i++) {
      const r = await runGameRandom();
      expect(r.winner).not.toBeNull();
    }
  });
});
