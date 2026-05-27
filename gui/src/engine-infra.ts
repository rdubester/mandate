// Generic boardgame.io plumbing / combinators / mechanical ops. Nothing here is
// Mandate-specific RULES — it is the engine machinery that would look the same in any
// card/area game built on this op-DSL skeleton. The Mandate rules (decree chain, moves,
// scoring) live in game.ts; the AI move-enumerator lives in ai.ts.

import { FACTIONS, type SeatId, type Op } from "./config";

// ---- the verb event --------------------------------------------------------
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
export function applyOps(ev: VerbEvent, ops: Op[] | undefined): void {
  if (!ops) return;
  for (const o of ops) {
    if (o.op === "add") ev[o.path] += o.n;
    else if (o.op === "mul") ev[o.path] *= o.n;
    else if (o.path === "cancelled") ev.cancelled = o.v;
    else ev[o.path] = o.v;
  }
}

// Generic trigger predicate: does this decree trigger fire for this verb + detail?
export function matches(
  trigger: { on: string; detail?: Record<string, string> },
  verb: string,
  detail: Record<string, string>,
): boolean {
  if (trigger.on !== verb) return false;
  if (!trigger.detail) return true;
  return Object.entries(trigger.detail).every(([k, v]) => detail[k] === v);
}

// Construct a fresh VerbEvent: all numeric fields at 0, then overlay the verb's `base` seed.
export function freshEvent(
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

// ---- combinators over the decree chain -------------------------------------
// fireVerb / previewVerb are pure arg-plumbing around the rules' runDecreeChain (which stays
// in game.ts). To keep the dependency direction clean (infra never imports game.ts), the
// chain runner is PASSED IN. game.ts binds it once and re-exports thin wrappers.

export type DecreeChain<G> = (
  G: G,
  ev: VerbEvent,
  seat: SeatId,
  scoring: boolean,
  decline: Set<string>,
) => VerbEvent;

// Seed an event with its base parameters and run the full decree chain (WITH supporter
// scoring payouts). This is what the actual moves call. `decline` = decree ids whose riders
// the acting player refuses this action (default: accept all).
export function fireVerb<G>(
  chain: DecreeChain<G>,
  G: G,
  verb: string,
  seat: SeatId,
  base: Partial<VerbEvent> = {},
  detail: Record<string, string> = {},
  decline: Set<string> = new Set(),
): VerbEvent {
  return chain(G, freshEvent(verb, base, detail), seat, true, decline);
}

// Pure preview: run the ops chain to see the resulting event WITHOUT scoring/logging side
// effects (for Board affordability + legal-action gating). Same op pipeline, scoring off.
export function previewVerb<G>(
  chain: DecreeChain<G>,
  firstSeat: SeatId,
  G: G,
  verb: string,
  base: Partial<VerbEvent> = {},
  detail: Record<string, string> = {},
): VerbEvent {
  // Seat is irrelevant in preview (scoring=false → no payouts, no log); pass the first seat.
  return chain(G, freshEvent(verb, base, detail), firstSeat, false, new Set());
}

// ---- mechanical deck ops ---------------------------------------------------

// Tiny seedable PRNG so the deck shuffle is deterministic per match.
export function seededShuffle<T>(arr: T[], seed: number): T[] {
  const a = arr.slice();
  let s = seed >>> 0 || 1;
  for (let i = a.length - 1; i > 0; i--) {
    s = (s * 1664525 + 1013904223) >>> 0;
    const j = s % (i + 1);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// deplete→refill: if the draw deck is empty, shuffle the discard back into it (in place, so
// the change sticks on G). Shared by every shared deck. Uses boardgame.io's RNG via the move
// context? No — we shuffle with a local PRNG seeded off current contents for determinism in
// replay; order is hidden info anyway (the sim re-determinizes it for bots).
export function refillIfEmpty(deck: string[], discard: string[]): void {
  if (deck.length > 0 || discard.length === 0) return;
  // Fisher–Yates on the discard, then move it into the deck (both in place).
  for (let i = discard.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [discard[i], discard[j]] = [discard[j], discard[i]];
  }
  deck.push(...discard);
  discard.length = 0;
}

// ---- log cosmetics ---------------------------------------------------------

// Short log label for a seat ("white#0" / "red#1"), derived from its faction's name. When two
// seats share a faction (a mirror) the seat id disambiguates the two same-coloured players.
// Structurally typed on `players` so this stays free of any game.ts import.
export function label(
  G: { players: Record<SeatId, { faction: keyof typeof FACTIONS }> },
  seat: string,
): string {
  const faction = G.players[seat as SeatId].faction;
  const name = FACTIONS[faction].name.split(" ")[0].toLowerCase();
  return `${name}#${seat}`;
}
