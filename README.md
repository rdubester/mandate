# The Mandate — playable MVP

A browser prototype for fast balance iteration on *The Mandate*, a 5-faction colour-wheel
board game. Currently **White (Assembly) vs. Red (Vanguard)**, per the design brief's
recommended build path. Built on [boardgame.io](https://boardgame.io) (React + TypeScript).

The design source of truth is `the-character-model.md`; this app is the only engine.

## Run

```sh
cd gui
npm install        # first time only
npm run dev        # opens http://localhost:5173
npm run build      # typecheck + production build
```

Hotseat in one tab: switch the **seat** toggle (White / Red) to whichever side is "to act,"
then click moves. The boardgame.io debug panel docks on the right — inspect `G`, time-travel,
and call moves directly. The **Rulebook** tab renders live from the config data.

## Files (`gui/src/`)

- `config.ts` — **every balance number, plus the data model**: the two characters, their
  shards, the shared-verb registry (which colours grant each verb), and the decree set. Edit
  this to tune; the Rulebook re-renders from it. This is the single source of balance truth.
- `game.ts` — the engine: the boardgame.io `Game` (setup / moves / turn hooks / win check).
  Pure-ish reducer over state `G`. Contains the decree **hook pipeline** (`fireDecrees`) and
  the two unit verbs (`rallySupporters`, `musterZealots`).
- `Board.tsx` — the play view. Action buttons are gated by `availableVerbs(faction)`.
- `Rulebook.tsx` — renders the rules from `config.ts` (no separate doc to keep in sync).
- `App.tsx` — tab switcher (Board / Rulebook) + seat toggle.

## The model (three tiers)

Each faction is a character with: **(1) a scoring rule** (how it wins, unique), **(2) a
signature verb** (only it can do, unshareable), **(3) shared verbs** (a common pool, granted
when the verb's colours overlap the character's *shard* = centre + two wheel-wings).

Units are two currencies, one per green wheel-edge:
- **supporters** (G–W community, soft *stock*) — White's edict fuel, grown by `rally_supporters`.
- **zealots** (G–R authenticity, hard *flow*) — Red's ammunition, minted by `muster_zealots`,
  spent by `strike`.

White's shard (GWU) has no R, so it is **structurally non-militant** — it can never muster
zealots or strike. **Decrees** are standing rules White installs that hook every player's
verbs; White scores by skimming Mandate when others comply with its rules (legitimacy), not
by acting itself.

## Tuning loop

The brief's "first measurable question" (§10): find a parameter band where neither White nor
Red has a trivially dominant clock. Edit numbers in `config.ts` (e.g.
`scoring.strike_landed.mandate_per_strike`, `scoring.decree_bite`, `mandate_target`), reload,
and play / watch. Currently Red has the dominant clock — White runs out of decrees and has no
standing engine; real tuning starts here.

## What's intentionally minimal

- 6 decrees; cards are id strings, no card objects.
- Research is a placeholder draw (Blue / the Archive isn't built yet, per build path).
- No Green / Blue / Black yet. Adding a faction = a character + verbs in `config.ts`, plumbed
  in `game.ts`.
- Compliance is greedy (every beneficial rider is taken); smarter policies are a hook in
  `game.ts` (`wantsRider`).
