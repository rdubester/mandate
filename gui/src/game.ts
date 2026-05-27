import type { Game, Move, AiEnumerate } from "boardgame.io";
import { INVALID_MOVE } from "boardgame.io/core";
import {
  CONFIG,
  FACTIONS,
  DECREES,
  WHITE,
  RED,
  WHITE_DECK_TEMPLATE,
  canDo,
  verbsFor,
  type FactionId,
  type DeckKind,
  type Op,
} from "./config";

// G — the shared game state. boardgame.io uses immer; mutate in place.

// A seat at the table. Keyed in G.players by boardgame.io's playerID ("0", "1", …).
// `faction` is which faction this seat plays. Today seat-id === faction-id, so the field
// is redundant — but reading `faction` (never the key) is exactly what makes a White-vs-
// White game a one-line change later: give two seats faction = WHITE. Decks live on G
// (shared), not here — the only per-player deck in the design is Blue's Archive, unbuilt.
export interface PlayerState {
  faction: FactionId;
  hand: string[];
  supporters: number; // loose, unplaced stock (grown by rally_supporters)
  zealots: number;
}

export interface GameState {
  players: Record<FactionId, PlayerState>; // keyed by seat id (=== faction id for now)
  mandate: Record<FactionId, number>; // each seat's score on the shared track
  // SHARED decks (resources on the table). decreeDeck is the only one modelled; the
  // research deck arrives with Blue, also shared. Per the design, decrees and research are
  // communal pools — the sole per-player deck would be Blue's Archive (not built).
  decreeDeck: string[];
  // SHARED table of standing rules (communal — decrees pay no one for ownership). Anyone
  // in {W,U,G} enacts onto it; a strike can remove from it.
  decreesInPlay: string[];
  // support[decreeId][seat] = how many supporters that seat has placed on the decree.
  // A decree BITES for EVERY seat with ≥1 supporter on it (flat each, not proportional —
  // White isn't populism; more base = more entrenched, not more points). Support also
  // DEFENDS: a Red strike strips supporters before the decree can be removed. (Markers +
  // shields collapsed into this one concept.)
  support: Record<string, Partial<Record<FactionId, number>>>;
  log: string[];
}

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

// 2-player only: "the opponent" is well-defined here, but knockback would need an explicit
// target once a third seat exists.
function opponentOf(p: FactionId): FactionId {
  return p === WHITE ? RED : WHITE;
}

// The faction a seat is playing (the indirection that keeps identity out of the engine).
function factionOf(G: GameState, seat: string): FactionId {
  return G.players[seat as FactionId].faction;
}

// Short log label for a seat ("white" / "red"), derived from its faction's name.
function label(G: GameState, seat: string): string {
  return FACTIONS[factionOf(G, seat)].name.split(" ")[0].toLowerCase();
}

// Total supporters on a decree, summed across all seats. Exported for the UI / bots.
export function supportOn(G: GameState, id: string): number {
  const owners = G.support[id];
  if (!owners) return 0;
  let t = 0;
  for (const seat of Object.keys(owners)) t += owners[seat as FactionId] ?? 0;
  return t;
}

// ---- the verb event + decree chain -----------------------------------------
// A verb seeds a flat, MUTABLE event with its base parameters, then passes it through the
// chain of every in-play decree. Each decree reaches in and tinkers (via a tiny op DSL)
// until the final event comes out the other side; the verb then executes the result. A
// decree's behaviour is a list of typed ops on event fields, so a NEW kind of effect is a
// new DATA row, not engine work. The op vocabulary is deliberately small — its ceiling IS
// the complexity budget: if a decree can't be said in a few ops, it's too complex for a card.

// Flat fields a decree may touch. (Add a field here to widen the surface; it's then
// reachable by every op at once.)
export interface VerbEvent {
  verb: string;
  detail: Record<string, string>;
  cost: number; // zealot cost (strikes)
  yieldN: number; // units produced (rally/muster)
  draws: number; // cards drawn
  allocK: number; // supporters placeable this allocate
  mandate: number; // Mandate the actor scores (strike)
  knockback: number; // Mandate knocked off the opponent (Mandate-strike)
  supportStrip: number; // supporters a strike strips before removing a decree
  cancelled: boolean; // a decree may veto the verb's main effect entirely
}

// The op DSL interpreter: each op reaches into a VerbEvent field. add/mul are numeric; set
// assigns (number, or the boolean `cancelled`). The Op type (config.ts) keeps add/mul to
// numeric fields and the boolean to set, so a nonsense op like mul-on-cancelled won't type.
function applyOps(ev: VerbEvent, ops: Op[] | undefined): void {
  if (!ops) return;
  for (const o of ops) {
    if (o.op === "add") ev[o.path] += o.n;
    else if (o.op === "mul") ev[o.path] *= o.n;
    else if (o.path === "cancelled") ev.cancelled = o.v;
    else ev[o.path] = o.v;
  }
}

function matches(
  trigger: { on: string; detail?: Record<string, string> },
  verb: string,
  detail: Record<string, string>,
): boolean {
  if (trigger.on !== verb) return false;
  if (!trigger.detail) return true;
  return Object.entries(trigger.detail).every(([k, v]) => detail[k] === v);
}

// Compliance policy: the acting player decides whether to take an offered rider. Default
// greedy-accept, so the choice point exists but current play takes every beneficial rider.
// Hook for smarter policies later.
function wantsRider(): boolean {
  return true;
}

function freshEvent(
  verb: string,
  base: Partial<VerbEvent>,
  detail: Record<string, string>,
): VerbEvent {
  return {
    verb,
    detail,
    cost: 0,
    yieldN: 0,
    draws: 0,
    allocK: 0,
    mandate: 0,
    knockback: 0,
    supportStrip: 0,
    cancelled: false,
    ...base,
  };
}

// Seed an event with its base parameters and run the full decree chain (WITH supporter
// scoring payouts). This is what the actual moves call.
function fireVerb(
  G: GameState,
  verb: string,
  seat: FactionId,
  base: Partial<VerbEvent> = {},
  detail: Record<string, string> = {},
): VerbEvent {
  return runDecreeChain(G, freshEvent(verb, base, detail), seat, true);
}

// Pure preview: run the ops chain to see the resulting event WITHOUT scoring/logging side
// effects (for Board affordability + legal-action gating). Same op pipeline, scoring off.
function previewVerb(
  G: GameState,
  verb: string,
  base: Partial<VerbEvent> = {},
  detail: Record<string, string> = {},
): VerbEvent {
  return runDecreeChain(G, freshEvent(verb, base, detail), WHITE, false);
}

// Pass the event through every in-play decree that matches its verb/detail. Each decree may
// apply its `effect` ops (always) and `rider` ops (if the actor complies), and — when
// `scoring` — if its output "bit", pay EVERY seat supporting it (≥1 supporter) its score.
// `scoring=false` makes this a pure preview (no payouts, no log).
function runDecreeChain(
  G: GameState,
  ev: VerbEvent,
  seat: FactionId,
  scoring: boolean,
): VerbEvent {
  for (const id of G.decreesInPlay) {
    const spec = DECREES[id];
    if (!spec || !matches(spec.trigger, ev.verb, ev.detail)) continue;

    applyOps(ev, spec.effect); // ambient (no choice)

    // Rider (the 'may'): the actor chooses. `complied` = the output fired.
    let complied = false;
    if (spec.rider && wantsRider()) {
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
    for (const owner of Object.keys(owners) as FactionId[]) {
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

// The actual shared array a deck kind resolves to (null = not modelled yet, e.g. research).
function deckFor(G: GameState, kind: DeckKind): string[] | null {
  return kind === "decree" ? G.decreeDeck : null;
}

// Centralized draw from a SHARED deck: fires the on-draw hook per base card so 'when a
// player draws…' decrees work for both research and the upkeep draw. Returns count drawn.
function drawCards(
  G: GameState,
  seat: FactionId,
  base: number,
  deckKind: DeckKind,
): number {
  const deck = deckFor(G, deckKind);
  if (!deck) return 0;
  const p = G.players[seat];
  let drawn = 0;
  for (let i = 0; i < base; i++) {
    if (deck.length === 0) break;
    // The draw event seeds draws:1; decrees may bump it (e.g. "may draw +1").
    const ev = fireVerb(G, "draw", seat, { draws: 1 }, { deck: deckKind });
    let extra = Math.max(0, ev.draws);
    while (extra > 0 && deck.length > 0) {
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
  const p = G.players[playerID as FactionId];
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
  const seat = playerID as FactionId;
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
  seat: FactionId,
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
  growUnits(G, playerID as FactionId, "rally_supporters", "supporters");
};

const musterZealots: Move<GameState> = ({ G, playerID, ctx }) => {
  if (!playerID || !canAct(G, playerID, ctx, "muster_zealots")) return INVALID_MOVE;
  growUnits(G, playerID as FactionId, "muster_zealots", "zealots");
};

// White draws from the shared decree deck. Named 'deliberate' (vs 'research') because for
// now it is White-only {W} — drawing decrees, not Blue's research. When Blue arrives this
// likely becomes a shared W–U verb; reskin then.
const deliberate: Move<GameState> = ({ G, playerID, ctx }) => {
  if (!playerID || !canAct(G, playerID, ctx, "deliberate")) return INVALID_MOVE;
  const seat = playerID as FactionId;
  if (G.decreeDeck.length === 0) {
    G.log.push(`${label(G, seat)} deliberates (no deck)`);
    return;
  }
  const n = drawCards(G, seat, 1, "decree");
  G.log.push(`${label(G, seat)} deliberates: drew ${n}`);
};

const strikeMandate: Move<GameState> = ({ G, playerID, ctx }) => {
  if (!playerID || !canAct(G, playerID, ctx, "strike")) return INVALID_MOVE;
  const seat = playerID as FactionId;
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
  const seat = playerID as FactionId;
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
    for (const s of Object.keys(owners) as FactionId[]) {
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

  // No support left → remove the decree from the shared table.
  G.decreesInPlay.splice(idx, 1);
  if (!G.decreesInPlay.includes(decreeId)) delete G.support[decreeId]; // tidy any stray entry
  G.log.push(
    `${label(G, seat)} strikes decree '${decreeId}' off the table (−${cost} zealot, +0 Mandate)`,
  );
};

// ---- turn hooks ------------------------------------------------------------

// Upkeep draw routes through the hook-aware draw so 'when a player draws' decrees fire on
// the upkeep draw too. Draws from whichever SHARED deck the faction reads (drawsFrom).
function upkeepDraw(G: GameState, next: FactionId): void {
  const spec = FACTIONS[factionOf(G, next)];
  if (spec.draw_per_turn <= 0 || !spec.drawsFrom) return;
  const deck = deckFor(G, spec.drawsFrom);
  if (!deck || deck.length === 0) return;
  const drawn = drawCards(G, next, spec.draw_per_turn, spec.drawsFrom);
  if (drawn > 0) G.log.push(`  · ${label(G, next)} draws ${drawn}`);
}

// ---- game ------------------------------------------------------------------

// Tiny seedable PRNG so the deck shuffle is deterministic per match.
function seededShuffle<T>(arr: T[], seed: number): T[] {
  const a = arr.slice();
  let s = seed >>> 0 || 1;
  for (let i = a.length - 1; i > 0; i--) {
    s = (s * 1664525 + 1013904223) >>> 0;
    const j = s % (i + 1);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export const MandateGame: Game<GameState> = {
  name: "the-mandate",

  setup: ({ random }) => {
    const seed = random ? Math.floor(random.Number() * 1e9) : 12345;
    const decreeDeck = seededShuffle(WHITE_DECK_TEMPLATE, seed);

    const players = {
      [WHITE]: emptyPlayer(WHITE),
      [RED]: emptyPlayer(RED),
    } as Record<FactionId, PlayerState>;

    // Deal each faction's opening hand off the SHARED deck it reads.
    for (const seat of [WHITE, RED] as FactionId[]) {
      const spec = FACTIONS[seat];
      if (spec.starting_hand > 0 && spec.drawsFrom === "decree") {
        players[seat].hand = decreeDeck.splice(0, spec.starting_hand);
      }
    }

    return {
      players,
      mandate: { [WHITE]: 0, [RED]: 0 },
      decreeDeck,
      decreesInPlay: [],
      support: {},
      log: [`--- game start, target = ${CONFIG.mandate_target} ---`],
    };
  },

  turn: {
    minMoves: CONFIG.actions_per_turn,
    maxMoves: CONFIG.actions_per_turn,
    onEnd: ({ G, ctx }) => {
      // No decree-scoring pass here — decrees score live, via the verb hooks, when players
      // act under the rules. End of turn just draws for the next seat and hands off.
      const next = opponentOf(ctx.currentPlayer as FactionId);
      upkeepDraw(G, next);
      G.log.push(`--- turn ${ctx.turn + 1}, ${label(G, next)} to act ---`);
    },
  },

  moves: {
    enactDecree,
    allocateSupporters,
    rallySupporters,
    musterZealots,
    deliberate,
    strikeMandate,
    strikeDecree,
  },

  endIf: ({ G, ctx }) => {
    const target = CONFIG.mandate_target;
    const w = G.mandate[WHITE];
    const r = G.mandate[RED];
    if (w >= target && r >= target) {
      if (w === r) return { winner: ctx.currentPlayer };
      return { winner: w > r ? WHITE : RED };
    }
    if (w >= target) return { winner: WHITE };
    if (r >= target) return { winner: RED };
    if (ctx.turn >= CONFIG.max_turns) {
      if (w === r) return { draw: true };
      return { winner: w > r ? WHITE : RED };
    }
  },

  // For boardgame.io's bots (RandomBot / MCTSBot): every concrete legal move from a state.
  // Kept small so MCTS's branching factor stays tractable — notably allocate_supporters is
  // enumerated as "all K onto ONE decree" (one option per in-play decree) rather than every
  // distribution, which is the strategically meaningful choice without combinatorial blowup.
  ai: {
    enumerate: (G, ctx) => enumerateMoves(G, ctx),
  },
};

function enumerateMoves(G: GameState, ctx: { currentPlayer: string }): AiEnumerate {
  const out: AiEnumerate = [];
  const seat = ctx.currentPlayer as FactionId;
  const faction = factionOf(G, seat);
  const p = G.players[seat];

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
  if (canDo(faction, "deliberate") && G.decreeDeck.length > 0) out.push({ move: "deliberate" });
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

// Re-exported for the board UI (preview strike cost / availability / support totals).
export { strikeCost, decreeStrikeCost, canDo, verbsFor };
