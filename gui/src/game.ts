import type { Game, Move, AiEnumerate } from "boardgame.io";
import { INVALID_MOVE } from "boardgame.io/core";
import {
  CONFIG,
  DECREES,
  WHITE,
  RED,
  WHITE_DECK_TEMPLATE,
  canDo,
  verbsFor,
  type FactionId,
  type Op,
  type EventField,
} from "./config";

// G — the shared game state. boardgame.io uses immer; mutate in place.
export interface PlayerState {
  hand: string[];
  deck: string[];
  decreesInPlay: string[];
  supporters: number;
  zealots: number;
  playedDecreeThisTurn: boolean;
  playedResearchThisTurn: boolean;
  actedUnitThisTurn: boolean;
}

export interface GameState {
  mandate: Record<FactionId, number>;
  white: PlayerState;
  red: PlayerState;
  // Supporters White has placed on decrees (keyed by decree id) — its "support" for that
  // platform. One unified concept (markers + shields collapsed): a SUPPORTED decree (≥1
  // supporter) BOTH scores White when it bites AND is defended — a Red strike strips one
  // supporter before it can remove the decree. Count = durability; ≥1 = scores (flat, not
  // proportional — White isn't populism). Cleared when a decree leaves play. White's loose
  // unplaced stock lives on G.white.supporters.
  support: Record<string, number>;
  log: string[];
}

// ---- helpers ---------------------------------------------------------------

function emptyPlayer(): PlayerState {
  return {
    hand: [],
    deck: [],
    decreesInPlay: [],
    supporters: 0,
    zealots: 0,
    playedDecreeThisTurn: false,
    playedResearchThisTurn: false,
    actedUnitThisTurn: false,
  };
}

function opponentOf(p: FactionId): FactionId {
  return p === WHITE ? RED : WHITE;
}

function playerKey(id: FactionId): "white" | "red" {
  return id === WHITE ? "white" : "red";
}

// ---- decree hook pipeline (port of decrees.fire) ---------------------------
// Run every installed decree against a verb event taken by `player`. Returns the
// modifiers the verb reads, and applies Mandate payouts to decree owners as a
// side effect. detail carries verb-specific data (e.g. {deck: "research"}).

// ---- the verb event + decree chain -----------------------------------------
// A verb seeds a flat, MUTABLE event with its base parameters, then passes it through the
// chain of every in-play decree. Each decree reaches in and tinkers (via a tiny op DSL)
// until the final event comes out the other side; the verb then executes the result. This
// replaces the old fixed `DecreeMods` delta-struct: a decree's behaviour is now a list of
// typed ops on event fields, so a NEW kind of effect is a new DATA row, not engine work.
// The op vocabulary is deliberately small — its ceiling IS the complexity budget: if a
// decree can't be said in a few ops, it's too complex to print on a card.

// Flat fields a decree may touch. (Add a field here to widen the surface; it's then
// reachable by every op at once — unlike the old per-delta approach.)
export interface VerbEvent {
  verb: string;
  detail: Record<string, string>;
  cost: number; // zealot cost (strikes)
  yieldN: number; // units produced (rally/muster)
  draws: number; // cards drawn
  allocK: number; // supporters placeable this allocate
  mandate: number; // Mandate the actor scores (strike)
  knockback: number; // Mandate knocked off the opponent (Mandate-strike)
  shieldStrip: number; // supporters a strike strips before removing a decree
  cancelled: boolean; // a decree may veto the verb's main effect entirely
}

// The op DSL is defined as data in config.ts (Op type). The interpreter: each op reaches
// into a VerbEvent field. add/mul are numeric; set assigns (incl. booleans like cancelled).
function applyOps(ev: VerbEvent, ops: Op[] | undefined): void {
  if (!ops) return;
  for (const o of ops) {
    if (o.op === "add") (ev[o.path] as number) += o.n;
    else if (o.op === "mul") (ev[o.path] as number) *= o.n;
    else (ev[o.path] as VerbEvent[EventField]) = o.v as never;
  }
}

export function allDecreesInPlay(G: GameState): Array<{ owner: FactionId; id: string }> {
  const out: Array<{ owner: FactionId; id: string }> = [];
  for (const owner of [WHITE, RED] as const) {
    for (const id of G[playerKey(owner)].decreesInPlay) out.push({ owner, id });
  }
  return out;
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

// Compliance policy: the acting player decides whether to take an offered rider.
// Default greedy-accept (matches the Python default), so the choice point exists
// but current play takes every beneficial rider. Hook for smarter policies later.
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
    shieldStrip: 0,
    cancelled: false,
    ...base,
  };
}

// Seed an event with its base parameters and run the full decree chain (WITH White's
// scoring payouts). This is what the actual moves call.
function fireVerb(
  G: GameState,
  verb: string,
  player: FactionId,
  base: Partial<VerbEvent> = {},
  detail: Record<string, string> = {},
): VerbEvent {
  return runDecreeChain(G, freshEvent(verb, base, detail), player, true);
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
// `scoring` — if it is SUPPORTED (≥1 of White's supporters on it) and its output "bit",
// pays White its score. `scoring=false` makes this a pure preview.
function runDecreeChain(
  G: GameState,
  ev: VerbEvent,
  player: FactionId,
  scoring: boolean,
): VerbEvent {
  for (const { id } of allDecreesInPlay(G)) {
    const spec = DECREES[id];
    if (!spec || !matches(spec.trigger, ev.verb, ev.detail)) continue;

    applyOps(ev, spec.effect); // ambient (no choice)

    // Rider (the 'may'): the actor chooses. `complied` = the output fired.
    let complied = false;
    if (spec.rider && wantsRider()) {
      complied = true;
      applyOps(ev, spec.rider.effect);
    }

    // White scores iff this decree is SUPPORTED and the output bit (flat — count is
    // durability, not score; White isn't populism).
    if (scoring && spec.score && (G.support[id] ?? 0) > 0) {
      const { when, amount } = spec.score;
      const bit = (when === "compliance" && complied) || when === "always";
      if (bit && amount) {
        G.mandate[WHITE] += amount;
        G.log.push(
          `  · supported decree '${id}' bites (${when}): white +${amount} Mandate` +
            (complied ? ` [${playerKey(player)} complied]` : ""),
        );
      }
    }
  }
  return ev;
}

// Centralized draw: fires the on-draw hook per card so 'when a player draws...'
// decrees work for both research and the upkeep draw. Returns count drawn.
function drawCards(
  G: GameState,
  player: FactionId,
  base: number,
  deckKind: string,
): number {
  const p = G[playerKey(player)];
  let drawn = 0;
  for (let i = 0; i < base; i++) {
    if (p.deck.length === 0) break;
    // The draw event seeds draws:1; decrees may bump it (e.g. "may draw +1").
    const ev = fireVerb(G, "draw", player, { draws: 1 }, { deck: deckKind });
    let extra = Math.max(0, ev.draws);
    while (extra > 0 && p.deck.length > 0) {
      p.hand.push(p.deck.shift()!);
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

// Guard shared by every move: right player, their turn, and their colour can do
// this verb (the whole availability rule lives in canDo).
function canAct(player: string, ctx: { currentPlayer: string }, verb: string): boolean {
  return player === ctx.currentPlayer && canDo(player as FactionId, verb);
}

// ---- moves -----------------------------------------------------------------

const enactDecree: Move<GameState> = ({ G, playerID, ctx }, cardId: string) => {
  if (!playerID || !canAct(playerID, ctx, "enact_decree")) return INVALID_MOVE;
  const p = G[playerKey(playerID as FactionId)];
  const idx = p.hand.indexOf(cardId);
  if (idx === -1) return INVALID_MOVE;
  p.hand.splice(idx, 1);
  p.decreesInPlay.push(cardId);
  p.playedDecreeThisTurn = true;
  G.log.push(`${playerKey(playerID as FactionId)} enacts decree '${cardId}'`);
};

// White {W}: one action places up to K supporters from the loose stock onto decrees as
// SUPPORT. A supported decree (≥1) scores White when it bites AND is defended (supporters
// absorb Red's strikes). `placements` is a list of decree ids, one supporter each (repeats
// allowed) — "up to K placements in a single action". Capped at K and at available stock;
// invalid targets skipped; a no-op allocation is rejected.
const allocateSupporters: Move<GameState> = ({ G, playerID, ctx }, placements: string[]) => {
  if (!playerID || !canAct(playerID, ctx, "allocate_supporters")) return INVALID_MOVE;
  const w = G.white;
  // K is seeded then run through the decree chain, so "a decree that lets White support +1"
  // is just a data row: effect [{op:'add', path:'allocK', n:1}] on trigger allocate_supporters.
  const ev = fireVerb(G, "allocate_supporters", playerID as FactionId, { allocK: CONFIG.supporter_allocate_k });
  const k = Math.max(0, ev.allocK);
  const inPlay = new Set(allDecreesInPlay(G).map((d) => d.id));
  let placed = 0;
  for (const id of placements ?? []) {
    if (placed >= k || w.supporters <= 0) break;
    if (!inPlay.has(id)) continue; // can only support a decree on the table
    w.supporters -= 1;
    G.support[id] = (G.support[id] ?? 0) + 1;
    placed += 1;
  }
  if (placed === 0) return INVALID_MOVE; // nothing happened — not a legal action
  G.log.push(`white supports ${placed} decree-slot(s)`);
};

function growUnits(
  G: GameState,
  player: FactionId,
  verb: "rally_supporters" | "muster_zealots",
  unit: "supporters" | "zealots",
): void {
  const ev = fireVerb(G, verb, player, { yieldN: CONFIG.unit_yield[verb] }, { unit });
  const n = Math.max(0, ev.yieldN);
  const p = G[playerKey(player)];
  p[unit] += n;
  p.actedUnitThisTurn = true;
  G.log.push(`${playerKey(player)} ${verb}: +${n} ${unit}`);
}

const rallySupporters: Move<GameState> = ({ G, playerID, ctx }) => {
  if (!playerID || !canAct(playerID, ctx, "rally_supporters")) return INVALID_MOVE;
  growUnits(G, playerID as FactionId, "rally_supporters", "supporters");
};

const musterZealots: Move<GameState> = ({ G, playerID, ctx }) => {
  if (!playerID || !canAct(playerID, ctx, "muster_zealots")) return INVALID_MOVE;
  growUnits(G, playerID as FactionId, "muster_zealots", "zealots");
};

// White draws from its own deck. Named 'deliberate' (vs 'research') because for now
// it is White-only {W} — drawing decrees, not Blue's research. When Blue arrives this
// likely becomes a shared W–U verb; reskin then.
const deliberate: Move<GameState> = ({ G, playerID, ctx }) => {
  if (!playerID || !canAct(playerID, ctx, "deliberate")) return INVALID_MOVE;
  const me = playerID as FactionId;
  const p = G[playerKey(me)];
  p.playedResearchThisTurn = true;
  if (p.deck.length === 0) {
    G.log.push(`${playerKey(me)} deliberates (no deck)`);
    return;
  }
  const n = drawCards(G, me, 1, "decree");
  G.log.push(`${playerKey(me)} deliberates: drew ${n}`);
};

const strikeMandate: Move<GameState> = ({ G, playerID, ctx }) => {
  if (!playerID || !canAct(playerID, ctx, "strike")) return INVALID_MOVE;
  const me = playerID as FactionId;
  const opp = opponentOf(me);
  const sc = CONFIG.scoring.strike_landed;
  // Seed the strike event with its base params; decrees in the chain may tinker with any of
  // them (cost, mandate gained, knockback) before it resolves.
  const ev = fireVerb(
    G,
    "strike",
    me,
    { cost: sc.zealot_cost, mandate: sc.mandate_per_strike, knockback: sc.marker_knockback },
    { target: "mandate" },
  );
  const cost = Math.max(0, ev.cost);
  const p = G[playerKey(me)];
  if (p.zealots < cost) return INVALID_MOVE;
  p.zealots -= cost;
  const knockback = Math.max(0, ev.knockback);
  const gain = Math.max(0, ev.mandate);
  G.mandate[opp] = Math.max(0, G.mandate[opp] - knockback);
  G.mandate[me] += gain;
  G.log.push(
    `${playerKey(me)} strikes ${playerKey(opp)}'s Mandate: −${knockback} to ${playerKey(opp)}, +${gain} to ${playerKey(me)}`,
  );
};

// Strike a decree = pure removal. Costs decree_strike_zealot_cost (+ ambient delta) and
// an action, and yields NO Mandate. Red spends tempo/ammo dealing with threats instead
// of racing the Mandate track — that is how decrees slow Red, not how Red scores.
const strikeDecree: Move<GameState> = ({ G, playerID, ctx }, decreeId: string) => {
  if (!playerID || !canAct(playerID, ctx, "strike")) return INVALID_MOVE;
  const me = playerID as FactionId;
  const opp = opponentOf(me);
  const sc = CONFIG.scoring.strike_landed;
  // Seed cost + base shieldStrip (1); decrees may adjust either via ops.
  const ev = fireVerb(
    G,
    "strike",
    me,
    { cost: sc.decree_strike_zealot_cost, shieldStrip: 1 },
    { target: "decree" },
  );
  const cost = Math.max(0, ev.cost);
  const p = G[playerKey(me)];
  if (p.zealots < cost) return INVALID_MOVE;
  const idx = G[playerKey(opp)].decreesInPlay.indexOf(decreeId);
  if (idx === -1) return INVALID_MOVE;
  p.zealots -= cost;

  // Support absorbs the strike: if the decree has supporters on it, strip `strip` of them
  // and the decree survives. Red must grind support to 0 before a strike can remove it.
  // strip = base 1 + decree ops — so a Red decree could make strikes hit harder (+), or a
  // White "resilience" decree could blunt them (−), e.g. "a strike removes one fewer".
  const support = G.support[decreeId] ?? 0;
  if (support > 0) {
    const strip = Math.max(0, ev.shieldStrip);
    const left = Math.max(0, support - strip);
    if (left === 0) delete G.support[decreeId];
    else G.support[decreeId] = left;
    G.log.push(
      `${playerKey(me)} strikes decree '${decreeId}': −${support - left} support (${left} left), decree holds (−${cost} zealot)`,
    );
    return;
  }

  // No support left → remove the decree.
  G[playerKey(opp)].decreesInPlay.splice(idx, 1);
  const stillInPlay = allDecreesInPlay(G).some((d) => d.id === decreeId);
  if (!stillInPlay) delete G.support[decreeId]; // tidy any stray entry
  G.log.push(
    `${playerKey(me)} strikes decree '${decreeId}' off ${playerKey(opp)}'s board (−${cost} zealot, +0 Mandate)`,
  );
};

// ---- turn hooks ------------------------------------------------------------

function resetTurnFlags(G: GameState): void {
  for (const k of ["white", "red"] as const) {
    G[k].playedDecreeThisTurn = false;
    G[k].playedResearchThisTurn = false;
    G[k].actedUnitThisTurn = false;
  }
}

// Upkeep draw routes through the hook-aware draw so 'when a player draws' decrees
// fire on the upkeep draw too. White's deck is decrees (deck kind 'decree').
function upkeepDraw(G: GameState, next: FactionId): void {
  const n = next === WHITE ? CONFIG.white.draw_per_turn : CONFIG.red.draw_per_turn;
  if (n <= 0 || G[playerKey(next)].deck.length === 0) return;
  const deckKind = next === WHITE ? "decree" : "other";
  const drawn = drawCards(G, next, n, deckKind);
  if (drawn > 0) G.log.push(`  · ${playerKey(next)} draws ${drawn}`);
}

// ---- game ------------------------------------------------------------------

// Tiny seedable PRNG so the JSON-deck shuffle is deterministic per match.
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
    const deck = seededShuffle(WHITE_DECK_TEMPLATE, seed);
    const starting = CONFIG.white.starting_hand;

    const white = emptyPlayer();
    white.hand = deck.slice(0, starting);
    white.deck = deck.slice(starting);
    white.supporters = CONFIG.white.starting_supporters;
    white.zealots = CONFIG.white.starting_zealots;

    const red = emptyPlayer();
    red.supporters = CONFIG.red.starting_supporters;
    red.zealots = CONFIG.red.starting_zealots;

    return {
      mandate: { [WHITE]: 0, [RED]: 0 },
      white,
      red,
      support: {},
      log: [`--- game start, target = ${CONFIG.mandate_target} ---`],
    };
  },

  turn: {
    minMoves: CONFIG.actions_per_turn,
    maxMoves: CONFIG.actions_per_turn,
    onEnd: ({ G, ctx }) => {
      // No decree-scoring pass here — decrees score live, via the verb hooks,
      // when players act under the rules. End of turn just resets and hands off.
      resetTurnFlags(G);
      const next = opponentOf(ctx.currentPlayer as FactionId);
      upkeepDraw(G, next);
      G.log.push(`--- turn ${ctx.turn + 1}, ${playerKey(next)} to act ---`);
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
  const inPlay = allDecreesInPlay(G).map((d) => d.id);

  // enact_decree: one option per distinct card in hand the seat could enact.
  if (canDo(seat, "enact_decree")) {
    for (const id of new Set(G[playerKey(seat)].hand)) out.push({ move: "enactDecree", args: [id] });
  }
  // allocate_supporters: all-K-onto-one-decree, one option per in-play decree (if stock>0).
  if (canDo(seat, "allocate_supporters") && G.white.supporters > 0) {
    const k = CONFIG.supporter_allocate_k;
    for (const id of inPlay) out.push({ move: "allocateSupporters", args: [Array(k).fill(id)] });
  }
  if (canDo(seat, "deliberate") && G[playerKey(seat)].deck.length > 0) out.push({ move: "deliberate" });
  if (canDo(seat, "rally_supporters")) out.push({ move: "rallySupporters" });
  if (canDo(seat, "muster_zealots")) out.push({ move: "musterZealots" });
  // strike: Mandate, or any opponent decree, if affordable.
  if (canDo(seat, "strike") && G[playerKey(seat)].zealots >= strikeCost(G)) {
    out.push({ move: "strikeMandate" });
    const opp = opponentOf(seat);
    for (const id of new Set(G[playerKey(opp)].decreesInPlay)) {
      out.push({ move: "strikeDecree", args: [id] });
    }
  }
  // Always allow ending the turn (lets a bot pass rather than be forced into a bad move).
  if (out.length === 0) out.push({ event: "endTurn" });
  return out;
}

// Re-exported for the board UI (preview strike cost / availability).
export { strikeCost, decreeStrikeCost, canDo, verbsFor };
