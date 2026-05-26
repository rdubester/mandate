# The Mandate — playable MVP

A browser prototype for fast balance iteration on *The Mandate*, a 5-faction colour-wheel
board game. Currently **White (Assembly) vs. Red (Vanguard)**, per the design brief's
recommended build path. Built on [boardgame.io](https://boardgame.io) (React + TypeScript).

The design source of truth is `the-character-model.md`; this app is the only engine.

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

`gui/src/` — the engine + GUI:
- `config.ts` — **every balance number + the data model**: the `FACTIONS` registry (one row per
  faction: colour, draw rates, starting resources), the colour-tagged verb table, and the decree
  set. `canDo` / `verbsFor` / `shardOf` derive availability. Edit this to tune; the Rulebook
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

## The model

**A character is one colour** (White = W, Red = R). **A verb is tagged with one or more
colours; a character can do a verb iff its colour is among the tags** (`canDo`). That single
rule produces everything:
- a **one-colour** verb → only one character reaches it (a de-facto *signature*):
  `allocate_supporters` {W}, `strike` {R};
- a **two-adjacent-colour** (or more) verb → shared by the neighbours on the wheel:
  `rally_supporters` {W,G}, `muster_zealots` {R,G}, `enact_decree` {W,U,G};
- a character's **shard** is *derived* (`shardOf`) — the colours across the verbs it can reach —
  never declared. It comes out as centre + wings because tags follow wheel adjacency.

Units are two currencies, one per green wheel-edge:
- **supporters** (G–W community, soft *stock*) — White's edict fuel; `rally_supporters` {W,G}.
- **zealots** (G–R authenticity, hard *flow*) — Red's ammunition; `muster_zealots` {R,G},
  spent by `strike`.

White is W, and no zealot-making verb is tagged W, so White is **structurally non-militant** — it
can't muster or strike, no special case in code. Green (when built) is G and sits on *both* green
edges, so it makes both currencies.

**Decrees** are standing rules on a **shared table**, enacted by anyone in {W,U,G} (White backs
platforms, Blue plays tempo bets, Green stabilises), that hook every player's verbs. They pay no
one for ownership. **White's signature is `allocate_supporters`** — it places up to K supporters
(from the loose stock grown by `rally_supporters`) onto decrees as *support*. A supported decree
does two things at once: it **scores each of its supporters** when it "bites" (its rider is
complied with, or an always-clause fires), and it **defends** — a strike strips a supporter before
it can remove the decree. Legitimacy: you score when the table acts under a rule you've backed.
(Support is keyed per player, so two White seats could juggle support on the same shared decrees —
the W-vs-W metagame — once seats and factions are split; see `game.ts`.)

See `the-character-model.md` for the full design.

## Tuning loop

The brief's "first measurable question" (§10): find a parameter band where neither faction has a
trivially dominant clock. The loop: edit numbers in `config.ts` → `npm run sim` to read win-rate
and game length → `npm test` to confirm nothing broke. `npm run sim -- --mcts` measures the *game*
under strong play rather than the scripted heuristics.

Balance findings — win-rates, the bands you've tried, which knob moved what — deliberately do
**not** live in these docs or in `config.ts` comments. They change every tuning pass and rot fast;
keep them in a separate balance-notes doc instead.

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
