"""CLI for The Mandate prototype.

Modes:
  python3 cli.py play              # human (white) vs bot (red)
  python3 cli.py play --human red  # human plays red instead
  python3 cli.py auto              # bot vs bot, one game, full log
  python3 cli.py batch -n 500      # headless sweep: win-rate + game-length stats
  python3 cli.py batch -n 500 --csv runs.csv   # also dump per-game rows

Verbosity:
  --quiet     suppress per-action log (still prints summary)
"""

from __future__ import annotations

import argparse
import csv
import statistics
import sys
from collections import Counter
from pathlib import Path
from typing import Any

import bots
import engine


def _print_state(state: dict[str, Any]) -> None:
    m = state["mandate"]
    w, r = state["white"], state["red"]
    print(f"\nturn {state['turn']} | active: {state['active']} | actions_left: {state['actions_left']}")
    print(f"  Mandate  white={m['white']:3d}  red={m['red']:3d}")
    print(f"  White    hand={w['hand']}  decrees_in_play={w['decrees_in_play']}  supporters={w['supporters']}")
    print(f"  Red      soldiers={r['soldiers']}  decrees_in_play={r['decrees_in_play']}")


def _print_log_since(state: dict[str, Any], last_len: int) -> None:
    for line in state["log"][last_len:]:
        print(line)


def _format_action(a: dict[str, Any]) -> str:
    t = a["type"]
    if t == "decree":
        return f"decree {a['card']}"
    if t == "strike":
        if a["target"] == "mandate":
            return f"strike {a['opponent']}'s Mandate"
        return f"strike {a['opponent']}'s decree '{a['decree_id']}'"
    if t == "deploy":
        return "deploy"
    if t == "research":
        return "research"
    return t


def human_choose(state: dict[str, Any], legal: list[dict[str, Any]]) -> dict[str, Any]:
    print("\nyour options:")
    for i, a in enumerate(legal):
        print(f"  [{i}] {_format_action(a)}")
    while True:
        raw = input("choose # (or 'q' to quit): ").strip()
        if raw == "q":
            sys.exit(0)
        try:
            i = int(raw)
            if 0 <= i < len(legal):
                return legal[i]
        except ValueError:
            pass
        print("invalid; try again")


# ----------------------------------------------------------------- modes ---

def run_play(config: dict[str, Any], human: str, seed: int | None, quiet: bool) -> None:
    state = engine.new_game(config, seed=seed)
    bot_faction = "red" if human == "white" else "white"
    bot_policy_name = config["bots"][f"{bot_faction}_policy"]
    bot_policy = bots.get_policy(bot_policy_name)
    print(f"You are {human}. Bot ({bot_faction}) policy: {bot_policy_name}. Target: {config['mandate_target']} Mandate.")
    last_log = 0
    while state["winner"] is None:
        legal = engine.legal_actions(state, config)
        if state["active"] == human:
            _print_state(state)
            if not quiet:
                _print_log_since(state, last_log)
                last_log = len(state["log"])
            action = human_choose(state, legal)
        else:
            action = bot_policy(state, legal, config)
        state = engine.apply(state, action, config)
    _print_state(state)
    _print_log_since(state, last_log)
    print(f"\n=== GAME OVER: {state['winner']} ===")


def run_auto(config: dict[str, Any], seed: int | None, quiet: bool) -> None:
    state = engine.new_game(config, seed=seed)
    white_pol = bots.get_policy(config["bots"]["white_policy"])
    red_pol = bots.get_policy(config["bots"]["red_policy"])
    while state["winner"] is None:
        legal = engine.legal_actions(state, config)
        pol = white_pol if state["active"] == "white" else red_pol
        action = pol(state, legal, config)
        state = engine.apply(state, action, config)
    if not quiet:
        for line in state["log"]:
            print(line)
    print(f"\n=== {state['winner']} wins in {state['turn']} turns | mandate: white={state['mandate']['white']} red={state['mandate']['red']} ===")


def run_batch(config: dict[str, Any], n: int, base_seed: int | None, csv_path: str | None) -> None:
    white_pol = bots.get_policy(config["bots"]["white_policy"])
    red_pol = bots.get_policy(config["bots"]["red_policy"])
    winners: Counter[str] = Counter()
    turns: list[int] = []
    rows: list[dict[str, Any]] = []
    for i in range(n):
        seed = (base_seed + i) if base_seed is not None else None
        state = engine.new_game(config, seed=seed)
        while state["winner"] is None:
            legal = engine.legal_actions(state, config)
            pol = white_pol if state["active"] == "white" else red_pol
            state = engine.apply(state, pol(state, legal, config), config)
        winners[state["winner"]] += 1
        turns.append(state["turn"])
        rows.append({
            "game": i,
            "seed": seed if seed is not None else "",
            "winner": state["winner"],
            "turns": state["turn"],
            "white_mandate": state["mandate"]["white"],
            "red_mandate": state["mandate"]["red"],
        })
    total = sum(winners.values())
    print(f"\n=== batch: {n} games, target={config['mandate_target']}, actions/turn={config['turn']['actions_per_turn']} ===")
    for f in ("white", "red", "draw"):
        c = winners.get(f, 0)
        pct = 100.0 * c / total if total else 0.0
        print(f"  {f:5s}  {c:4d}  ({pct:5.1f}%)")
    print(f"  turns: mean={statistics.mean(turns):.1f}  median={statistics.median(turns):.0f}  min={min(turns)}  max={max(turns)}")
    if csv_path:
        with open(csv_path, "w", newline="") as f:
            w = csv.DictWriter(f, fieldnames=list(rows[0].keys()))
            w.writeheader()
            w.writerows(rows)
        print(f"  wrote {csv_path}")


# ----------------------------------------------------------------- main ---

def main(argv: list[str] | None = None) -> int:
    p = argparse.ArgumentParser(prog="mandate")
    p.add_argument("--config", default="config.json")
    p.add_argument("--seed", type=int, default=None)
    p.add_argument("--quiet", action="store_true")
    sub = p.add_subparsers(dest="cmd", required=True)

    pp = sub.add_parser("play", help="human vs bot")
    pp.add_argument("--human", choices=["white", "red"], default="white")

    sub.add_parser("auto", help="bot vs bot, one game")

    pb = sub.add_parser("batch", help="bot vs bot, N games, summary stats")
    pb.add_argument("-n", type=int, default=200)
    pb.add_argument("--csv", default=None)

    args = p.parse_args(argv)
    config = engine.load_config(args.config)

    if args.cmd == "play":
        run_play(config, args.human, args.seed, args.quiet)
    elif args.cmd == "auto":
        run_auto(config, args.seed, args.quiet)
    elif args.cmd == "batch":
        run_batch(config, args.n, args.seed, args.csv)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
