# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Repository status

Active prototype. There is **one engine: the TypeScript / boardgame.io app in `gui/`** (the Python prototype that came first has been deleted). The thematic source of truth is `design/philosophy.md` (thesis, five colour philosophies, ten edges, lean principle); the mechanical source of truth is `design/core-model.md`; per-faction notes live in `design/factions/`, tuning results in `design/balance-notes.md`, and the original brief is archived at `design/history/the-mandate-design-brief.md` (historical — don't build from it). When asked to "build" or change rules, edit `gui/src/config.ts` (data) and `gui/src/game.ts` (logic); see `README.md` for the file map.

The locked architecture is summarised below (in full in `design/core-model.md`) — follow it rather than improvising. The current model: **a character is one colour; a verb is tagged with one or more colours; a character can do a verb iff its colour is among the tags** (`canDo` in `config.ts`). Shard / signature / wing / home are design-doc vocabulary only — never declared in code or data. Verbs come in exactly two shapes: **signatures** (one colour) and **primitives** (three adjacent colours: a home colour + its two wheel neighbours) — never 2-colour, so the vocabulary caps at 10. The unit economy is **two currencies minted by the two unit primitives** (supporters via `rally_supporters` {G,R,W}, zealots via `muster_zealots` {R,B,G}; no soldiers). Do NOT reintroduce `if colour == X` branches, declared shards, a "signature" flag, or 2-colour verb rows — those were all removed in favour of plain colour-tagged verb rows.

Decree scoring specifically: **`enact_decree` is SHARED {W,U,G}, not White's signature.** White's signature is **`allocate_supporters`** {W} — it places up to K supporters (from the loose stock grown by `rally_supporters`) onto decrees as *support*. A supported decree (≥1) both **scores each of its supporters** when it "bites" (rider complied with / always-clause fires) and is **defended** (a strike strips a supporter before it can remove the decree) — markers and shields collapsed into this one "support" concept. Support is keyed per player (`G.support[decreeId][seat]`), so a decree bites for *every* seat with support on it (the hook for a White-vs-White juggling metagame). Decrees live on the **shared table** (`G.decreesInPlay`) and pay no one for ownership. Don't revert `enact_decree` to a White-only signature, reattach scoring to the decree owner, or hardcode `WHITE` as the sole scorer in the decree chain.

## The design frame (read before designing anything)

The game is a deliberate attempt to build **the playable version of Duncan Sabien's essay "The MTG Color Wheel"** (linked from `design/philosophy.md`): each faction is one colour's philosophy — peace through order, perfection through knowledge, satisfaction through ruthlessness, freedom through action, harmony through acceptance — given an institution and a claim about what makes governance effective. `design/philosophy.md` carries that frame (the thesis, the five creeds, the ten edges, the overbalance failure modes, the lean principle). When proposing or changing mechanics, derive the justification from those philosophies and edges; don't improvise new theme or hand-wave a flavour rationale. If a proposed mechanic can't be tied to a colour philosophy or an edge, say so explicitly rather than inventing a justification.

## Design-doc discipline

The `design/` docs are **north stars**: present-tense statements of the intended design, held slightly above the day-to-day state of the prototype (no factual drift, but no implementation-status chatter either).

- **Current design only.** Never frame design-doc content as corrections of or arguments against earlier drafts ("previously…", "a key correction over earlier drafts…", "an earlier version did X"). State what is; history lives in git and the archived brief.
- **No balance state in design docs.** Never reference win-rates, who currently beats whom, or "as currently tuned" in `philosophy.md`, `core-model.md`, or `factions/*.md`. That evidence lives only in `design/balance-notes.md`.
- **Rule changes go to their home doc.** When a tuning pass changes a *rule* (not just a number), update the rule's home design doc in the same change; `balance-notes.md` records only the evidence (what was run, what it showed, the takeaway).
- **Don't add new design docs unprompted.** The set is `philosophy.md`, `core-model.md`, `factions/*.md`, `balance-notes.md` (plus the archived brief). Add a faction file only when that faction's design work actually starts.

## What's being built

A **playable prototype + balance sandbox** for *The Mandate*. It is now browser-first (React/boardgame.io hotseat) rather than the CLI/headless-sweep tool the brief's §10 imagined — but the same balance goal drives it: find parameter bands where no faction has a trivially dominant clock.

Hard architectural constraints (from §10, still honoured in the TS engine):
- **Game state is a plain serializable object** (`G`: `players` keyed by seat — each tagged with the `faction` it plays, holding hand + unit counts; plus the shared `decreeDeck`, shared `decreesInPlay`, per-player `support`, and `mandate`). Decks and decrees are **shared table resources**, not per-player — the only per-player deck in the design is Blue's Archive (unbuilt).
- **Turn loop is a reducer** over `G` (boardgame.io moves) — deterministic, replayable, time-travelable via the debug panel.
- **Rules lean on data** — decrees, the colour-tagged verb table, and balance numbers live in `config.ts`, read by the engine; the Rulebook renders from the same data.
- **Everything is observable/loggable** — `G.log` narrates each game; a finished game explains why someone won.
- **Every numeric value is named, editable config** (in `config.ts`). Do not hardcode numbers in rule logic.
- **Headless harness exists** in `gui/sim/`: `npm run sim` (bot-vs-bot win-rate/length sweep) and `npm test` (vitest regression suite pinning model invariants). Both drive the real `game.ts` via boardgame.io's headless `Client` — no reimplementation. Run `npm test` after any engine/model change.

## Build path (from §9 — follow in order)

1. **Spine first:** the Mandate track + universal turn loop. All numbers as config.
2. **Two factions only — White (Assembly) and Red (Vanguard).** Enemy colours; exercises both primitives (cards + units) and the two most different scoring shapes (decree-bite vs. strike-landed). The §10 "first measurable question" is: in White-vs-Red, find a parameter band where neither has a trivially dominant clock. Do this before adding a third faction.
3. **Green third, Blue fourth, Black last.** Black's kit is defined by converting the other four's primitives — it is untestable in isolation and must be built last.

## Core architecture you must preserve

The full locked architecture is the first section of `design/core-model.md` — read it before changing rules. The constraints most often at risk from well-meaning edits:

- **Two layers, one shared Mandate track** (first past the post; the target is config, never quote it in docs).
- **Pentagon, wheel order W–U–B–R–G**; symmetry broken exactly once, at Black — do not make a second faction "special."
- **One turn skeleton for everyone** (draw step, 2 actions, pass). Do NOT build per-faction turn phases.
- **Each faction = 3 primitives + 1 signature; scoring rides the centre and is never lent out** (White decree-bites, Blue publish, Red strikes, Green procession, Black circulation).
- **Counterplay stays two distinct principles** — granularity (ramp factions lose to growth denial, interaction factions to stock attrition) and the wheel (designed enemies). Don't unify them.
- **Every number is named config in `config.ts`** — no constants in rule logic. Tuning results (win-rates, parameter bands) go in `design/balance-notes.md`, never in docs or code comments.

## Known-open questions (don't silently resolve)

Flag these if the user's request implicitly picks an answer:
- **The exchange verb (`procure/convert`).** Whose resources it converts, held where, at what cost — the highest-priority unresolved verb.
- **Player count.** Five is the design north star; smaller tables are tuning instruments. How much standalone tuning sub-5 counts get is open.
- Black's exact conversion set, throughput rate, and what it refuses.
- Red combat-resolution detail; green sanctuary rules (likely cut); Blue's exact card list and publish-action shape. (Blue's mechanics — shared research commons, private Archive, publish-for-points — are sketched in `design/factions/blue.md`.)

## Naming

"The Ledger" (black faction) is a working name per §3. Treat faction names as stable enough to use in code, but not sacred.
