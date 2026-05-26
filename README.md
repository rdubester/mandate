# The Mandate — playable MVP

Tiny Python CLI prototype for fast balance iteration. White (Assembly) vs. Red (Vanguard), per the design brief's recommended build path. No deps, no UI.

## Run

```sh
python3 cli.py play                # you (white) vs bot (red)
python3 cli.py play --human red    # play red instead
python3 cli.py auto                # bot vs bot, full log
python3 cli.py --quiet auto        # bot vs bot, summary only
python3 cli.py batch -n 500        # 500-game sweep, win-rate + game-length
python3 cli.py batch -n 500 --csv runs.csv   # also dump per-game CSV
python3 cli.py --seed 42 auto      # deterministic replay
```

Flags (`--config`, `--seed`, `--quiet`) go **before** the subcommand.

## Files

- `config.json` — every balance number. Edit, re-run, no code changes.
- `engine.py` — pure `apply(state, action, config) -> state`. Never prints.
- `bots.py` — scripted policies. Add new ones, register in `POLICIES`, name them in `config.bots`.
- `cli.py` — I/O, interactive prompt, batch runner.

## Tuning loop

The brief's "first measurable question" (§10): find a parameter band where neither White nor Red has a trivially dominant clock.

1. `python3 cli.py --quiet --seed 1 batch -n 200` — read win-rate.
2. Edit `config.json` (e.g. lower `red_scoring.mandate_per_strike`, raise `white_scoring.mandate_per_bite`, change `mandate_target`).
3. Repeat.

Current defaults: Red wins ~100% — White runs out of cards and has no engine. Real tuning starts here.

## GUI (boardgame.io + React)

```sh
cd gui
npm install        # first time only
npm run dev        # opens http://localhost:5173
```

Hotseat in one tab: switch the **seat** toggle (White / Red) to whichever side is "to act," then click moves. The boardgame.io debug panel docks on the right of the screen — lets you inspect `G`, time-travel, and call moves directly.

The GUI is a **separate reimplementation** in TypeScript (`gui/src/game.ts`) — boardgame.io can't run Python. Rules and config values are hand-ported from `engine.py` / `config.json`. If you tune balance numbers, edit them in **both** `config.json` (Python CLI sweeps) and `gui/src/config.ts` (GUI). Worth merging later if the prototype sticks.

## What's intentionally minimal

- 6 decree types; cards are id strings, no fancy card objects.
- Research is a placeholder draw (Blue isn't in the prototype yet, per build path).
- No Green/Blue/Black yet. `engine.apply` is the only place to plumb new actions when they arrive.
- Decree trigger logic is inline in `engine._decree_bites` — move to data later if it stays simple, or to per-decree handlers if rules get richer.
