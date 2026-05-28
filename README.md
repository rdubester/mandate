# The Mandate — playable MVP

A browser prototype for fast balance iteration on *The Mandate*, a 5-faction colour-wheel
board game. Currently **White (Assembly) vs. Red (Vanguard)**, per the build order in the
design docs. Built on [boardgame.io](https://boardgame.io) (React + TypeScript).

The design is a deliberate attempt at a playable rendering of the MTG colour wheel's
philosophies. The thematic source of truth is [`design/philosophy.md`](design/philosophy.md);
the mechanical source of truth is [`design/core-model.md`](design/core-model.md); this app is
the only engine.

## Run

```sh
cd gui
npm install        # first time only
npm run dev        # GUI hotseat — opens http://localhost:5173
npm test           # engine/regression test suite (vitest)
npm run sim        # headless bot-vs-bot balance sweep (200 games)
npm run sim -- -n 1000   # more games
npm run build      # typecheck + production build
```

GUI hotseat: switch the **seat** toggle (White / Red) to whichever side is "to act," then click
moves. The boardgame.io debug panel docks on the right — inspect `G`, time-travel, call moves.
The **Rulebook** tab renders live from the config data.

## Files

`design/` — the design docs (every design fact has exactly one home; other docs link to it):
- `philosophy.md` — the thematic source of truth: the thesis, the five colour philosophies,
  the ten edges, the lean principle.
- `core-model.md` — the mechanical source of truth: the verb model + locked architecture.
- `factions/` — per-faction design notes as they firm up (`blue.md` so far).
- `balance-notes.md` — the tuning log; the only place sim numbers live.
- `history/the-mandate-design-brief.md` — the original v3 brief, archived.

`gui/src/` — the engine + GUI:
- `config.ts` — **every balance number + the data model**: the `FACTIONS` registry (one row per
  faction: colour, draw rates, starting resources), the colour-tagged verb table, and the decree
  set. `canDo` / `verbsFor` derive availability. Edit this to tune; the Rulebook
  re-renders from it. Single source of truth.
- `game.ts` — the engine: the boardgame.io `Game` (setup / moves / turn hooks / win check), a
  reducer over state `G`. Holds the shared decks + decree table, the decree **hook pipeline**
  (`fireVerb` / `runDecreeChain`), and the unit verbs (`rallySupporters`, `musterZealots`).
- `Board.tsx` — the play view. Action buttons gated by `canDo(faction, verb)`.
- `Rulebook.tsx` — renders the rules **directly from the engine data** (no parallel prose).
- `App.tsx` — tab switcher (Board / Rulebook) + seat toggle.

`gui/sim/` — the headless harness (drives the real `game.ts`, no reimplementation):
- `driver.ts` — runs a game via boardgame.io's headless `Client` + scripted bot policies.
- `batch.ts` — N-game sweep → win-rate + game-length distribution (`npm run sim`).
- `engine.test.ts` — regression tests pinning the model invariants (`npm test`).

## The model (short version)

**A character is one colour; a verb is tagged with colours; a character can do a verb iff its
colour is among the tags** (`canDo`). Verbs are either **signatures** (1 colour, one holder) or
**primitives** (3 adjacent colours: a home + its wheel neighbours) — never 2-colour, so the
vocabulary caps at 10. Two unit currencies: **supporters** (soft stock) and **zealots** (hard
flow). **Decrees** are standing rules on a shared table that hook every player's verbs; whoever
has *supported* a decree (White's signature, which also defends it) scores when it bites.

Full design: [`design/core-model.md`](design/core-model.md).

## Tuning loop

The brief's "first measurable question" (§10): find a parameter band where neither faction has a
trivially dominant clock. The loop: edit numbers in `config.ts` → `npm run sim` to read win-rate
and game length → `npm test` to confirm nothing broke. `npm run sim -- --mcts` measures the *game*
under strong play rather than the scripted heuristics.

Balance findings — win-rates, bands tried, which knob moved what — live only in
[`design/balance-notes.md`](design/balance-notes.md), never in the design docs or `config.ts`
comments.

## What's intentionally minimal

- A handful of decrees; cards are id strings, no card objects. (`academic_census` is parked —
  commented out in `config.ts` — until a research deck exists for it to trigger on.)
- The decree deck is **shared** (a table resource), as is research once Blue lands; the only
  per-player deck in the design is Blue's Archive, unbuilt.
- `deliberate` is a placeholder "draw from the shared decree deck" (becomes shared W–U `research`
  once Blue lands).
- No Green / Blue / Black yet. Adding one = a row in the `FACTIONS` registry + colour-tagged verb
  rows in `config.ts`, plumbed in `game.ts`.
- Compliance is greedy (every beneficial rider taken); smarter policies are a hook in `game.ts`
  (`wantsRider`).
- Bot policies are deliberately dumb (`sim/driver.ts`) — they exist to make games terminate and
  read clocks, not to play well.
