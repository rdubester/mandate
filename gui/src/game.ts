import type { Game, Move } from "boardgame.io";
import { INVALID_MOVE } from "boardgame.io/core";
import {
  CONFIG,
  FACTIONS,
  DECREES,
  WHITE_DECK_TEMPLATE,
  DEFAULT_MATCHUP,
  SEATS,
  canDo,
  verbsFor,
  type FactionId,
  type SeatId,
  type Matchup,
  type DeckKind,
} from "./config";
import {
  applyOps,
  matches,
  seededShuffle,
  refillIfEmpty,
  label,
  fireVerb as infraFireVerb,
  previewVerb as infraPreviewVerb,
  type VerbEvent,
} from "./engine-infra";
import { enumerateMoves } from "./ai";

// G — the shared game state. boardgame.io uses immer; mutate in place.

// A seat at the table. Keyed in G.players by boardgame.io's playerID / SeatId ("0", "1", …).
// `faction` is which faction this seat plays. Seat id and faction id are DISTINCT concepts:
// the key is a table position, `faction` is the colour-character it plays. Read `faction`
// (never the key) for any colour logic — that is what makes White-vs-White a setup choice
// (give both seats faction = WHITE) instead of an engine rewrite. Decks live on G (shared),
// not here — the only per-player deck in the design is Blue's Archive, unbuilt.
export interface PlayerState {
  faction: FactionId;
  hand: string[];
  supporters: number; // loose, unplaced stock (grown by rally_supporters)
  zealots: number;
}

export interface GameState {
  players: Record<SeatId, PlayerState>; // keyed by SEAT id (a table position)
  mandate: Record<SeatId, number>; // each seat's score on the shared track
  // SHARED decks (resources on the table). decreeDeck is the only one modelled; the
  // research deck arrives with Blue, also shared. Per the design, decrees and research are
  // communal pools — the sole per-player deck would be Blue's Archive (not built).
  // Deck lifecycle: draw from decreeDeck; a struck/removed decree goes to decreeDiscard;
  // when the draw deck empties, the discard is shuffled back in (the deplete→refill rule the
  // design names for every shared deck — Blue's commons/Archive will reuse drawShared()).
  decreeDeck: string[];
  decreeDiscard: string[];
  // SHARED table of standing rules (communal — decrees pay no one for ownership). Anyone
  // in {W,U,G} enacts onto it; a strike can remove from it.
  decreesInPlay: string[];
  // support[decreeId][seat] = how many supporters that SEAT has placed on the decree.
  // A decree BITES for EVERY seat with ≥1 supporter on it (flat each, not proportional —
  // White isn't populism; more base = more entrenched, not more points). Support also
  // DEFENDS: a Red strike strips supporters before the decree can be removed. (Markers +
  // shields collapsed into this one concept.)
  support: Record<string, Partial<Record<SeatId, number>>>;
  log: string[];
}

// VerbEvent lives in engine-infra.ts (shared by applyOps/freshEvent/fireVerb). Re-export it
// so existing consumers of the rules module keep resolving it from "./game".
export type { VerbEvent };

// ---- helpers ---------------------------------------------------------------

function emptyPlayer(faction: FactionId): PlayerState {
  const spec = FACTIONS[faction];
  return {
    faction,
    hand: [],
    supporters: spec.starting_supporters,
    zealots: spec.starting_zealots,
  };
}

// 2-player only: "the opponent" is the OTHER SEAT — defined on seats, independent of faction
// (so it works in a mirror). Knockback would need an explicit target once a third seat exists.
function opponentOf(seat: SeatId): SeatId {
  return seat === "0" ? "1" : "0";
}

// The faction a seat is playing (the indirection that keeps identity out of the engine).
function factionOf(G: GameState, seat: string): FactionId {
  return G.players[seat as SeatId].faction;
}

// Total supporters on a decree, summed across all seats. Exported for the UI / bots.
export function supportOn(G: GameState, id: string): number {
  const owners = G.support[id];
  if (!owners) return 0;
  let t = 0;
  for (const seat of Object.keys(owners)) t += owners[seat as SeatId] ?? 0;
  return t;
}

// ---- the decree chain ------------------------------------------------------
// A verb seeds a flat, mutable event (freshEvent, in engine-infra) and passes it through the
// chain of every in-play decree. The chain — the decree bite/score/compliance SEMANTICS — is
// the RULE, so it lives here. fireVerb/previewVerb (engine-infra) are thin arg-plumbing
// combinators that bind this chain; the local wrappers below keep their original signatures.

// Compliance: the acting player chooses whether to take each offered rider. The choice is
// made UP FRONT as part of the move (the `decline` set names the decree ids whose riders to
// refuse this action) — not mid-resolution — so it's a normal move the bot can pick, no
// mid-action interrupt. Default (empty decline set) = greedy accept.
function wantsRider(decreeId: string, decline: Set<string>): boolean {
  return !decline.has(decreeId);
}

// Pass the event through every in-play decree that matches its verb/detail. Each decree may
// apply its `effect` ops (always) and `rider` ops (if the actor complies), and — when
// `scoring` — if its output "bit", pay EVERY seat supporting it (≥1 supporter) its score.
// `scoring=false` makes this a pure preview (no payouts, no log).
function runDecreeChain(
  G: GameState,
  ev: VerbEvent,
  seat: SeatId,
  scoring: boolean,
  decline: Set<string>,
): VerbEvent {
  for (const id of G.decreesInPlay) {
    const spec = DECREES[id];
    if (!spec || !matches(spec.trigger, ev.verb, ev.detail)) continue;

    applyOps(ev, spec.effect); // ambient (no choice)

    // Rider (the 'may'): the actor chose up front (decline set). `complied` = output fired.
    let complied = false;
    if (spec.rider && wantsRider(id, decline)) {
      complied = true;
      applyOps(ev, spec.rider.effect);
    }

    if (!scoring || !spec.score) continue;
    const { when, amount } = spec.score;
    const bit = (when === "compliance" && complied) || when === "always";
    if (!bit || !amount) continue;

    // Every seat that has supported this decree scores (flat each — count is durability,
    // not score). Decoupled: whoever plays the decree, whoever supports it scores off it.
    const owners = G.support[id];
    if (!owners) continue;
    for (const owner of Object.keys(owners) as SeatId[]) {
      if ((owners[owner] ?? 0) <= 0) continue;
      G.mandate[owner] += amount;
      G.log.push(
        `  · supported decree '${id}' bites (${when}): ${label(G, owner)} +${amount} Mandate` +
          (complied ? ` [${label(G, seat)} complied]` : ""),
      );
    }
  }
  return ev;
}

// Bind the (rules) decree chain into the (infra) combinators, preserving the original
// signatures so the moves below read unchanged.
function fireVerb(
  G: GameState,
  verb: string,
  seat: SeatId,
  base: Partial<VerbEvent> = {},
  detail: Record<string, string> = {},
  decline: Set<string> = new Set(),
): VerbEvent {
  return infraFireVerb(runDecreeChain, G, verb, seat, base, detail, decline);
}

function previewVerb(
  G: GameState,
  verb: string,
  base: Partial<VerbEvent> = {},
  detail: Record<string, string> = {},
): VerbEvent {
  return infraPreviewVerb(runDecreeChain, SEATS[0], G, verb, base, detail);
}

// The draw + discard arrays a deck kind resolves to (null = not modelled yet, e.g. research).
// When Blue lands, "research" returns {deck: G.researchDeck, discard: G.researchDiscard}.
function deckFor(G: GameState, kind: DeckKind): { deck: string[]; discard: string[] } | null {
  return kind === "decree" ? { deck: G.decreeDeck, discard: G.decreeDiscard } : null;
}

// Centralized draw from a SHARED deck: fires the on-draw hook per base card so 'when a
// player draws…' decrees work for both research and the upkeep draw. Returns count drawn.
// Refills from discard when the deck runs dry, so a player can't permanently starve.
function drawCards(
  G: GameState,
  seat: SeatId,
  base: number,
  deckKind: DeckKind,
): number {
  const decks = deckFor(G, deckKind);
  if (!decks) return 0;
  const { deck, discard } = decks;
  const p = G.players[seat];
  let drawn = 0;
  for (let i = 0; i < base; i++) {
    refillIfEmpty(deck, discard);
    if (deck.length === 0) break;
    // The draw event seeds draws:1; decrees may bump it (e.g. "may draw +1").
    const ev = fireVerb(G, "draw", seat, { draws: 1 }, { deck: deckKind });
    let extra = Math.max(0, ev.draws);
    while (extra > 0) {
      refillIfEmpty(deck, discard);
      if (deck.length === 0) break;
      p.hand.push(deck.shift()!);
      drawn += 1;
      extra -= 1;
    }
  }
  return drawn;
}

// Zealot cost to strike the Mandate track (base seeded, decrees may adjust via ops).
// Pure preview — used by Board/driver/legal-actions to gate affordability.
function strikeCost(G: GameState): number {
  const ev = previewVerb(G, "strike", { cost: CONFIG.scoring.strike_landed.zealot_cost }, { target: "mandate" });
  return Math.max(0, ev.cost);
}

// Zealot cost to remove a decree (a separate, sweepable lever; yields 0 Mandate).
function decreeStrikeCost(G: GameState): number {
  const ev = previewVerb(G, "strike", { cost: CONFIG.scoring.strike_landed.decree_strike_zealot_cost }, { target: "decree" });
  return Math.max(0, ev.cost);
}

// Guard shared by every move: right player, their turn, and their faction's colour can do
// this verb (the whole availability rule lives in canDo).
function canAct(G: GameState, seat: string, ctx: { currentPlayer: string }, verb: string): boolean {
  return seat === ctx.currentPlayer && canDo(factionOf(G, seat), verb);
}

// ---- moves -----------------------------------------------------------------

const enactDecree: Move<GameState> = ({ G, playerID, ctx }, cardId: string) => {
  if (!playerID || !canAct(G, playerID, ctx, "enact_decree")) return INVALID_MOVE;
  const p = G.players[playerID as SeatId];
  const idx = p.hand.indexOf(cardId);
  if (idx === -1) return INVALID_MOVE;
  p.hand.splice(idx, 1);
  G.decreesInPlay.push(cardId); // communal table
  G.log.push(`${label(G, playerID)} enacts decree '${cardId}'`);
};

// White {W}: one action places up to K supporters from the loose stock onto decrees as
// SUPPORT. A supported decree (≥1) scores its supporter(s) when it bites AND is defended
// (supporters absorb Red's strikes). `placements` is a list of decree ids, one supporter
// each (repeats allowed) — "up to K placements in a single action". Capped at K and at
// available stock; invalid targets skipped; a no-op allocation is rejected.
const allocateSupporters: Move<GameState> = ({ G, playerID, ctx }, placements: string[]) => {
  if (!playerID || !canAct(G, playerID, ctx, "allocate_supporters")) return INVALID_MOVE;
  const seat = playerID as SeatId;
  const p = G.players[seat];
  // K is seeded then run through the decree chain, so "a decree that lets White support +1"
  // is just a data row: effect [{op:'add', path:'allocK', n:1}] on trigger allocate_supporters.
  const ev = fireVerb(G, "allocate_supporters", seat, { allocK: CONFIG.supporter_allocate_k });
  const k = Math.max(0, ev.allocK);
  const inPlay = new Set(G.decreesInPlay);
  const cap = CONFIG.supporter_cap_per_decree;
  let placed = 0;
  for (const id of placements ?? []) {
    if (placed >= k || p.supporters <= 0) break;
    if (!inPlay.has(id)) continue; // can only support a decree on the table
    if (supportOn(G, id) >= cap) continue; // decree at durability cap — can't over-stack
    if (!G.support[id]) G.support[id] = {};
    const owners = G.support[id];
    p.supporters -= 1;
    owners[seat] = (owners[seat] ?? 0) + 1;
    placed += 1;
  }
  if (placed === 0) return INVALID_MOVE; // nothing happened — not a legal action
  G.log.push(`${label(G, seat)} supports ${placed} decree-slot(s)`);
};

function growUnits(
  G: GameState,
  seat: SeatId,
  verb: "rally_supporters" | "muster_zealots",
  unit: "supporters" | "zealots",
): void {
  const ev = fireVerb(G, verb, seat, { yieldN: CONFIG.unit_yield[verb] }, { unit });
  const n = Math.max(0, ev.yieldN);
  G.players[seat][unit] += n;
  G.log.push(`${label(G, seat)} ${verb}: +${n} ${unit}`);
}

const rallySupporters: Move<GameState> = ({ G, playerID, ctx }) => {
  if (!playerID || !canAct(G, playerID, ctx, "rally_supporters")) return INVALID_MOVE;
  growUnits(G, playerID as SeatId, "rally_supporters", "supporters");
};

const musterZealots: Move<GameState> = ({ G, playerID, ctx }) => {
  if (!playerID || !canAct(G, playerID, ctx, "muster_zealots")) return INVALID_MOVE;
  growUnits(G, playerID as SeatId, "muster_zealots", "zealots");
};

// White draws from the shared decree deck. Named 'deliberate' (vs 'research') because for
// now it is White-only {W} — drawing decrees, not Blue's research. When Blue arrives this
// likely becomes a shared W–U verb; reskin then.
const deliberate: Move<GameState> = ({ G, playerID, ctx }) => {
  if (!playerID || !canAct(G, playerID, ctx, "deliberate")) return INVALID_MOVE;
  const seat = playerID as SeatId;
  if (G.decreeDeck.length === 0 && G.decreeDiscard.length === 0) {
    G.log.push(`${label(G, seat)} deliberates (deck + discard empty)`);
    return;
  }
  const n = drawCards(G, seat, 1, "decree"); // refills from discard if the deck is dry
  G.log.push(`${label(G, seat)} deliberates: drew ${n}`);
};

const strikeMandate: Move<GameState> = ({ G, playerID, ctx }) => {
  if (!playerID || !canAct(G, playerID, ctx, "strike")) return INVALID_MOVE;
  const seat = playerID as SeatId;
  const opp = opponentOf(seat);
  const sc = CONFIG.scoring.strike_landed;
  // A Mandate-strike is PURE SCORING — Red advances its own clock, it does NOT delete the
  // opponent's Mandate. (Knockback was cut: deleting points off another player's track is
  // unfun, swingy PvP — the fight belongs on the board, not the scoreboard.) The knockback
  // event field survives at base 0 so a future decree COULD opt into it via an op if ever
  // wanted, but no default strike knocks anything back.
  const ev = fireVerb(
    G,
    "strike",
    seat,
    { cost: sc.zealot_cost, mandate: sc.mandate_per_strike, knockback: sc.marker_knockback },
    { target: "mandate" },
  );
  const cost = Math.max(0, ev.cost);
  const p = G.players[seat];
  if (p.zealots < cost) return INVALID_MOVE;
  p.zealots -= cost;
  const knockback = Math.max(0, ev.knockback);
  const gain = Math.max(0, ev.mandate);
  if (knockback > 0) G.mandate[opp] = Math.max(0, G.mandate[opp] - knockback);
  G.mandate[seat] += gain;
  G.log.push(
    `${label(G, seat)} strikes the Mandate track: +${gain}` +
      (knockback > 0 ? ` (−${knockback} to ${label(G, opp)})` : ""),
  );
};

// Strike a decree = pure removal. Costs decree_strike_zealot_cost (+ ambient delta) and an
// action, and yields NO Mandate. Red spends tempo/ammo dealing with threats instead of
// racing the Mandate track — that is how decrees slow Red, not how Red scores.
const strikeDecree: Move<GameState> = ({ G, playerID, ctx }, decreeId: string) => {
  if (!playerID || !canAct(G, playerID, ctx, "strike")) return INVALID_MOVE;
  const seat = playerID as SeatId;
  const sc = CONFIG.scoring.strike_landed;
  // Seed cost + base supportStrip (1); decrees may adjust either via ops.
  const ev = fireVerb(
    G,
    "strike",
    seat,
    { cost: sc.decree_strike_zealot_cost, supportStrip: 1 },
    { target: "decree" },
  );
  const cost = Math.max(0, ev.cost);
  const p = G.players[seat];
  if (p.zealots < cost) return INVALID_MOVE;
  const idx = G.decreesInPlay.indexOf(decreeId);
  if (idx === -1) return INVALID_MOVE;
  p.zealots -= cost;

  // Support absorbs the strike: if the decree has supporters on it, strip `strip` of them
  // (across seats) and the decree survives. Red must grind total support to 0 before a
  // strike can remove it. strip = base 1 + decree ops — so a Red decree could make strikes
  // hit harder (+), or a White "resilience" decree could blunt them (−).
  const owners = G.support[decreeId];
  const total = supportOn(G, decreeId);
  if (owners && total > 0) {
    let toStrip = Math.max(0, ev.supportStrip);
    let removed = 0;
    for (const s of Object.keys(owners) as SeatId[]) {
      if (toStrip <= 0) break;
      const have = owners[s] ?? 0;
      const take = Math.min(have, toStrip);
      owners[s] = have - take;
      if (owners[s] === 0) delete owners[s];
      removed += take;
      toStrip -= take;
    }
    if (supportOn(G, decreeId) === 0) delete G.support[decreeId];
    const left = total - removed;
    G.log.push(
      `${label(G, seat)} strikes decree '${decreeId}': −${removed} support (${left} left), decree holds (−${cost} zealot)`,
    );
    return;
  }

  // No support left → remove the decree from the shared table → to the discard (recirculates).
  G.decreesInPlay.splice(idx, 1);
  G.decreeDiscard.push(decreeId);
  if (!G.decreesInPlay.includes(decreeId)) delete G.support[decreeId]; // tidy any stray entry
  G.log.push(
    `${label(G, seat)} strikes decree '${decreeId}' off the table (−${cost} zealot, +0 Mandate)`,
  );
};

// ---- upkeep ----------------------------------------------------------------

// drawUpkeep is the mandatory first move of every turn (the `upkeep` stage). It fires the
// once-per-turn 'upkeep' decree hook — which is where a rider like civic_endowment's "may
// draw +1" lives — then draws the resolved number of cards, then advances to the `main`
// stage. `decline` names the upkeep-decree ids whose riders this player refuses (so the
// take/decline of an upkeep rider is a normal up-front move choice, forkable in enumerate).
const drawUpkeep: Move<GameState> = ({ G, playerID, events }, decline: string[] = []) => {
  if (!playerID) return INVALID_MOVE;
  const seat = playerID as SeatId;
  const spec = FACTIONS[factionOf(G, seat)];
  let drew = 0;
  if (spec.draw_per_turn > 0 && spec.drawsFrom) {
    // Fire the upkeep hook once; civic_endowment-style riders may bump draws (or be declined).
    const ev = fireVerb(G, "upkeep", seat, { draws: spec.draw_per_turn }, {}, new Set(decline));
    drew = drawCards(G, seat, Math.max(0, ev.draws), spec.drawsFrom);
  }
  G.log.push(`${label(G, seat)} upkeep${drew ? `: draws ${drew}` : ""}`);
  events.endStage(); // → main stage
};

// ---- game ------------------------------------------------------------------

export const MandateGame: Game<GameState> = {
  name: "the-mandate",

  // setupData carries the matchup (which faction each SEAT plays). boardgame.io's
  // InitializeGame path (used by the sim) forwards setupData here. NOTE: the local
  // client (`Client` / the `Step` debug path) does NOT forward setupData to setup — so the
  // hotseat GUI always gets the DEFAULT matchup. Mirrors are exercised via the sim, which
  // does pass setupData. The plumbing below is correct for any caller that supplies it.
  setup: ({ random }, setupData?: { matchup?: Matchup }) => {
    const seed = random ? Math.floor(random.Number() * 1e9) : 12345;
    const decreeDeck = seededShuffle(WHITE_DECK_TEMPLATE, seed);

    const matchup: Matchup = setupData?.matchup ?? DEFAULT_MATCHUP;

    // Each seat's starting state (faction, hand size, supporters/zealots, drawsFrom) comes
    // from FACTIONS[matchup[seat]] — never from the seat id itself.
    const players = {} as Record<SeatId, PlayerState>;
    const mandate = {} as Record<SeatId, number>;
    for (const seat of SEATS) {
      players[seat] = emptyPlayer(matchup[seat]);
      mandate[seat] = 0;
    }

    // Deal each seat's opening hand off the SHARED deck the seat's faction reads.
    for (const seat of SEATS) {
      const spec = FACTIONS[matchup[seat]];
      if (spec.starting_hand > 0 && spec.drawsFrom === "decree") {
        players[seat].hand = decreeDeck.splice(0, spec.starting_hand);
      }
    }

    return {
      players,
      mandate,
      decreeDeck,
      decreeDiscard: [],
      decreesInPlay: [],
      support: {},
      log: [`--- game start, target = ${CONFIG.mandate_target} ---`],
    };
  },

  // Each turn runs two STAGES: `upkeep` (the player resolves its once-per-turn draw + any
  // upkeep-decree riders, via exactly one drawUpkeep move) → `main` (its actions_per_turn
  // actions). Stages reset every turn automatically. The upkeep draw used to live in onEnd
  // (automatic, unchoosable); making it a move lets the player CHOOSE rider take/decline and
  // lets MCTS see it. No onEnd hook needed — decrees score live via verb hooks.
  // Total moves per turn = 1 upkeep + actions_per_turn main. The upkeep stage's activePlayers
  // limit (min/max 1) forces exactly one drawUpkeep, then `next: "main"` auto-advances; the
  // turn-level min/max ends the turn once the main actions are spent.
  turn: {
    minMoves: CONFIG.actions_per_turn + 1,
    maxMoves: CONFIG.actions_per_turn + 1,
    // Start the seat in `upkeep`; drawUpkeep calls events.endStage() to follow next:"main".
    // (No maxMoves on the stage — that would exit to a NULL stage, where the main moves,
    // being stage-scoped, are disallowed. endStage() transitions cleanly into `main`.)
    activePlayers: { currentPlayer: "upkeep" },
    stages: {
      upkeep: {
        moves: { drawUpkeep },
        next: "main",
      },
      main: {
        moves: {
          enactDecree,
          allocateSupporters,
          rallySupporters,
          musterZealots,
          deliberate,
          strikeMandate,
          strikeDecree,
        },
      },
    },
  },

  // First past the post on the shared track — decided on SEATS (winner is a seat id), so a
  // mirror (both seats same faction) resolves correctly. [a, b] are the two seats' scores.
  endIf: ({ G, ctx }) => {
    const target = CONFIG.mandate_target;
    const [a, b] = SEATS;
    const sa = G.mandate[a];
    const sb = G.mandate[b];
    if (sa >= target && sb >= target) {
      if (sa === sb) return { winner: ctx.currentPlayer };
      return { winner: sa > sb ? a : b };
    }
    if (sa >= target) return { winner: a };
    if (sb >= target) return { winner: b };
    if (ctx.turn >= CONFIG.max_turns) {
      if (sa === sb) return { draw: true };
      return { winner: sa > sb ? a : b };
    }
  },

  // For boardgame.io's bots (RandomBot / MCTSBot): every concrete legal move from a state.
  // The enumerator lives in ai.ts (used only by bots); wired here as a runtime call.
  ai: {
    enumerate: (G, ctx) => enumerateMoves(G, ctx),
  },
};

// Re-exported for the board UI (preview strike cost / availability / support totals) and for
// ai.ts (the move enumerator reads strikeCost/decreeStrikeCost/factionOf rule helpers).
export { strikeCost, decreeStrikeCost, factionOf, canDo, verbsFor };
