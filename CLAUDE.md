# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Repository status

Pre-code. The repo currently contains only `the-mandate-design-brief.md` (v3 design doc for a 5-faction card/area board game called *The Mandate*). No source, build, test, or tooling exists yet. The brief itself is the spec; read it before writing anything beyond trivial edits.

When asked to "build" or "prototype", the brief prescribes a specific path — follow it (see *Build path* below) rather than improvising an architecture.

## What's being built

A **board-game-simulator-lite** (§10 of the brief) for tuning balance parameters. Text/CLI first, no UI. The dominant activity will be parameter sweeps and headless bot-vs-bot games to read win-rate and game-length distributions — design for that, not for human play.

Hard architectural constraints from §10:
- **Game state is a plain serializable object** (Mandate positions, per-player board, decks/hands, unit counts, turn pointer, turn count).
- **Turn loop is a pure function** `(state, action) -> state`. Deterministic, replayable.
- **Rules are data, not code** — decrees, research cards, and the per-faction action menu live in JSON.
- **Bots are scripted heuristic policies**, one per faction, so games can run headless in bulk.
- **Everything is observable/loggable** — a finished game should replay and explain why/how someone won.
- **Every numeric value is named, editable config from day one** (see *Balance parameters* below). Do not hardcode numbers in rule logic.

## Build path (from §9 — follow in order)

1. **Spine first:** the Mandate track + universal turn loop. All numbers as config.
2. **Two factions only — White (Assembly) and Red (Vanguard).** Enemy colours; exercises both primitives (cards + units) and the two most different scoring shapes (decree-bite vs. strike-landed). The §10 "first measurable question" is: in White-vs-Red, find a parameter band where neither has a trivially dominant clock. Do this before adding a third faction.
3. **Green third, Blue fourth, Black last.** Black's kit is defined by converting the other four's primitives — it is untestable in isolation and must be built last.

## Core architecture you must preserve

These are locked decisions from §2 and §7. Do not "improve" past them without the user explicitly revisiting the brief.

- **Pentagon is the primitive structure.** 5 factions = 5 MTG-style three-colour shards in wheel order **White–Blue–Black–Red–Green**. Each faction has 2 allied neighbours and 2 enemies across the wheel.
- **Two strictly separated layers:** *primitives* (cards, units, black's actions) and the *victory layer* (the Mandate — a single shared track, first past the post, target ~200).
- **Symmetry is broken exactly once, at black.** Do not make a second faction "special." Black owns no primitive; its action menu is built around `Convert`. Black is the fixed point of the {White↔Green, Blue↔Red} reflection — that is the formal license for its unique "circulation" scoring rule.
- **Shard IS the action menu.** Each faction can take exactly **3 of the 5 primitive actions** (the colours of its shard), and **scores Mandate only via its centre colour's action**. The five centre-action scoring perks:
  - White (centre of GWU) — `Decree`: scores when a decree *bites* (decoupled / over-time).
  - Blue (centre of WUB) — `Research`: scores on play (welded / immediate).
  - Red (centre of BRG) — `Strike`: scores on landing (welded / immediate).
  - Green (centre of RGW) — `Procession`: cash N units → Mandate (decoupled / over-time).
  - Black (centre of UBR) — `Convert`: scores on throughput / circulation (the third mode).
- **Turn skeleton is one-size-fits-all:** draw step (volume varies — blue draws most), then **2 actions** from the faction's 3-action shard menu, then pass. **Do not build per-faction turn phases.** Liveliness comes from decrees firing passively and blue/red reacting between turns.
- **Card/unit factoring is forced by the wheel:** cards = {White decrees (permanent, communal), Blue research (one-shot, private deckbuilder fuel)}; units = {Red soldiers (flow, spent for reach), Green supporters (stock, grown and cashed)}; black is the hinge with no primitive.

## Counterplay model (§5) — two principles, kept distinct

1. **Granularity** (along the archetype axis): ramp factions (Blue, Green) hold many small resources — ±1 effects barely register; beat them with **growth denial** (attack acceleration, not stock). Interaction factions (White, Red) rest on few chunky pieces — ±1 is huge; beat them with **stock attrition**.
2. **The wheel**: designed enemy relationships across the pentagon.

Do **not** try to explain every matchup with a single principle — earlier attempts to unify them made matchups murky.

## Balance parameters (must be config from day one)

Per §10, expose at least:
- Mandate target (~200 provisional).
- White: score per decree bite; positive/negative decree ratio.
- Blue: card-velocity increment per upgrade (additive, not multiplicative — §3 "gentle slope"); research acquisition cost; score per research played.
- Red: unit cost per strike; score per strike; marker-knockback amount.
- Green: unit→Mandate conversion rate (procession); actions granted per unit.
- Black: throughput-scoring rate per conversion; conversion exchange rates.
- Turn structure: actions per turn; per-faction draw volume.

## Known-open questions (don't silently resolve)

From §7 and §3 — flag these if the user's request implicitly picks an answer:
- **Player count.** Pentagon is strongest at 5; fewer means standalone tuning. Not yet decided.
- Black's exact conversion set and throughput rate.
- Red combat-resolution detail; green sanctuary rules; blue's research-acquisition shape (MVP: blue improves its deck from its own plays — no separate shared market).

## Naming

"The Ledger" (black faction) is a working name per §3. Treat faction names as stable enough to use in code, but not sacred.
