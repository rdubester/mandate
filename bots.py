"""Scripted faction policies. Each is a pure function (state, legal, config) -> action.

Trivial heuristics by design — enough to read win-rate distributions for parameter sweeps.
Add cleverer policies here; register them in `POLICIES` and reference by name from config.
"""

from __future__ import annotations

import random
from typing import Any, Callable

State = dict[str, Any]
Action = dict[str, Any]
Config = dict[str, Any]
Policy = Callable[[State, list[Action], Config], Action]


def _pick(actions: list[Action], pred: Callable[[Action], bool]) -> Action | None:
    for a in actions:
        if pred(a):
            return a
    return None


def play_decree_then_draw(state: State, legal: list[Action], config: Config) -> Action:
    """White: play any decree if possible, else research to draw, else end."""
    a = _pick(legal, lambda x: x["type"] == "decree")
    if a:
        return a
    a = _pick(legal, lambda x: x["type"] == "research")
    if a:
        return a
    return {"type": "end_turn"}


def strike_when_possible_else_recruit(state: State, legal: list[Action], config: Config) -> Action:
    """Red: strike a decree if any (cheap denial), else strike mandate, else deploy."""
    # Prefer hitting a decree (removes ongoing pressure, scores same).
    a = _pick(legal, lambda x: x["type"] == "strike" and x["target"] == "decree")
    if a:
        return a
    a = _pick(legal, lambda x: x["type"] == "strike" and x["target"] == "mandate")
    if a:
        return a
    a = _pick(legal, lambda x: x["type"] == "deploy")
    if a:
        return a
    return {"type": "end_turn"}


def random_policy(state: State, legal: list[Action], config: Config) -> Action:
    """Picks uniformly from legal actions (excluding end_turn unless it's the only option)."""
    non_end = [a for a in legal if a["type"] != "end_turn"]
    pool = non_end or legal
    return random.choice(pool)


POLICIES: dict[str, Policy] = {
    "play_decree_then_draw": play_decree_then_draw,
    "strike_when_possible_else_recruit": strike_when_possible_else_recruit,
    "random": random_policy,
}


def get_policy(name: str) -> Policy:
    if name not in POLICIES:
        raise KeyError(f"unknown policy '{name}'. available: {list(POLICIES)}")
    return POLICIES[name]
