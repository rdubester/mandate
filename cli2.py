"""CLI for engine2 (three-tier character model).

  python3 cli2.py auto                 # bot vs bot, one game, full log
  python3 cli2.py --quiet auto
  python3 cli2.py batch -n 500         # win-rate + game-length
  python3 cli2.py --seed 42 auto       # deterministic

Bots are trivial heuristics keyed by character colour (see policy()).
"""

from __future__ import annotations

import argparse
import statistics
from collections import Counter
from typing import Any

import engine2


def policy(state: dict[str, Any], legal: list[dict[str, Any]], config: dict) -> dict[str, Any]:
    """One generic heuristic: score if you can, else build toward scoring."""
    colour = state[state["active"]]["colour"]
    types = {a["type"] for a in legal}

    if colour == "white":
        # enact decrees (that's how white scores over time), else research to dig,
        # else rally supporters (its only unit verb — no R, so no zealots/strike).
        for a in legal:
            if a["type"] == "enact_decree":
                return a
        for a in legal:
            if a["type"] == "research":
                return a
        for a in legal:
            if a["type"] == "rally_supporters":
                return a
    elif colour == "red":
        # strike a decree if any (denial + score), else strike mandate, else muster zealots
        for a in legal:
            if a["type"] == "strike" and a["target"] == "decree":
                return a
        for a in legal:
            if a["type"] == "strike" and a["target"] == "mandate":
                return a
        for a in legal:
            if a["type"] == "muster_zealots":
                return a
    return {"type": "end_turn"}


def run_auto(config, seed, quiet):
    s = engine2.new_game(config, seed=seed)
    while s["winner"] is None:
        legal = engine2.legal_actions(s, config)
        s = engine2.apply(s, policy(s, legal, config), config)
    if not quiet:
        for line in s["log"]:
            print(line)
    print(f"\n=== {s['winner']} wins in {s['turn']} turns | "
          f"mandate: {dict(s['mandate'])} ===")


def run_batch(config, n, base_seed, quiet):
    winners: Counter = Counter()
    turns = []
    for i in range(n):
        seed = (base_seed + i) if base_seed is not None else None
        s = engine2.new_game(config, seed=seed)
        while s["winner"] is None:
            legal = engine2.legal_actions(s, config)
            s = engine2.apply(s, policy(s, legal, config), config)
        winners[s["winner"]] += 1
        turns.append(s["turn"])
    total = sum(winners.values())
    print(f"\n=== {n} games, target={config['mandate_target']} ===")
    for p in ("white", "red", "draw"):
        c = winners.get(p, 0)
        print(f"  {p:5s} {c:4d} ({100.0*c/total:5.1f}%)")
    print(f"  turns: mean={statistics.mean(turns):.1f} "
          f"median={statistics.median(turns):.0f} min={min(turns)} max={max(turns)}")
    if not quiet and total:
        pass


def main(argv=None):
    p = argparse.ArgumentParser(prog="mandate2")
    p.add_argument("--config", default="characters.json")
    p.add_argument("--seed", type=int, default=None)
    p.add_argument("--quiet", action="store_true")
    sub = p.add_subparsers(dest="cmd", required=True)
    sub.add_parser("auto")
    pb = sub.add_parser("batch")
    pb.add_argument("-n", type=int, default=200)
    args = p.parse_args(argv)
    config = engine2.load_config(args.config)
    if args.cmd == "auto":
        run_auto(config, args.seed, args.quiet)
    else:
        run_batch(config, args.n, args.seed, args.quiet)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
