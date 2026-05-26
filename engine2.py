"""Pure-function engine, v2 — three-tier character model (see the-character-model.md).

State is a plain dict. Turn loop is (state, action) -> state. No per-faction branches:
a player's actions = signature verb ∪ {shared verbs whose colours ⊆ shard}. Adding a
character or verb = editing characters.json / verbs.py, not this file.
"""

from __future__ import annotations

import copy
import json
import random
from pathlib import Path
from typing import Any

import verbs

State = dict[str, Any]
Action = dict[str, Any]
Config = dict[str, Any]


def load_config(path: str | Path = "characters.json") -> Config:
    with open(path) as f:
        return json.load(f)


# ---------------------------------------------------------------- setup ----

def new_game(config: Config, seed: int | None = None, players: tuple[str, str] = ("white", "red")) -> State:
    seed = seed if seed is not None else config.get("rng_seed")
    rng = random.Random(seed)

    state: State = {
        "turn": 1,
        "players": list(players),
        "active": players[0],
        "actions_left": config["actions_per_turn"],
        "mandate": {p: 0 for p in players},
        "log": [f"--- game start, target {config['mandate_target']} ---"],
        "winner": None,
    }

    for p in players:
        ch = config["characters"][p]
        start = ch["start"]
        deck: list[str] = []
        hand: list[str] = []
        if start.get("deck"):
            deck = list(config[start["deck"]])
            rng.shuffle(deck)
            hand = deck[: start["hand"]]
            deck = deck[start["hand"]:]
        state[p] = {
            "character": ch["name"],
            "colour": ch["colour"],
            "shard": config["colours"][p]["shard"],
            "signature": ch["tier2_signature"],
            "hand": hand,
            "deck": deck,
            "decrees_in_play": [],
            "supporters": start["supporters"],
            "zealots": start["zealots"],
            "played_decree_this_turn": False,
            "played_research_this_turn": False,
            "acted_unit_this_turn": False,
        }
    return state


# -------------------------------------------------- available actions ------

def available_verbs(state: State, player: str, config: Config) -> list[str]:
    """signature ∪ {every registered shared verb whose colours intersect the shard}.

    Shared availability is derived purely from the shard and each verb's colour tags —
    NOT a hand-listed allowlist. Tag a verb with colours in characters.json and it
    automatically appears for the right characters (incl. as a borrowable wing tool)."""
    shard = set(state[player]["shard"])
    out = [state[player]["signature"]]
    for vname, vdef in config["verbs"].items():
        if set(vdef["colours"]) & shard:
            out.append(vname)
    return out


def legal_actions(state: State, config: Config) -> list[Action]:
    if state["winner"] is not None or state["actions_left"] <= 0:
        return [{"type": "end_turn"}]
    player = state["active"]
    p = state[player]
    actions: list[Action] = []

    for vname in available_verbs(state, player, config):
        if vname in ("enact_decree",):
            for card in sorted(set(p["hand"])):
                actions.append({"type": vname, "card": card})
        elif vname == "strike":
            cost = verbs._strike_cost(state, config)
            if p["zealots"] >= cost:
                opp = next(x for x in state["players"] if x != player)
                actions.append({"type": "strike", "target": "mandate"})
                for did in sorted(set(state[opp]["decrees_in_play"])):
                    actions.append({"type": "strike", "target": "decree", "decree_id": did})
        else:
            actions.append({"type": vname})

    actions.append({"type": "end_turn"})
    return actions


# -------------------------------------------------------- turn loop --------

def apply(state: State, action: Action, config: Config) -> State:
    s = copy.deepcopy(state)
    if s["winner"] is not None:
        return s
    player = s["active"]

    if action["type"] == "end_turn":
        return _end_turn(s, config)
    if s["actions_left"] <= 0:
        return s

    vname = action["type"]
    if vname not in available_verbs(s, player, config):
        s["log"].append(f"[{player}] illegal verb: {vname}")
        return s

    verbs.REGISTRY[vname](s, player, action, config)
    s["actions_left"] -= 1
    _check_winner(s, config)
    return s


def _opp(player: str, state: State) -> str:
    return next(p for p in state["players"] if p != player)


def _end_turn(s: State, config: Config) -> State:
    """No decree-scoring pass here anymore — decrees score live, via verb hooks
    (see decrees.fire), when players act under the rules. End of turn just hands off."""
    player = s["active"]
    _reset_flags(s)
    _check_winner(s, config)
    if s["winner"] is not None:
        return s
    s["active"] = _opp(player, s)
    if s["active"] == s["players"][0]:
        s["turn"] += 1
    s["actions_left"] = config["actions_per_turn"]
    _upkeep_draw(s, config)
    s["log"].append(f"--- turn {s['turn']}, {s['active']} to act ---")
    return s


def _reset_flags(s: State) -> None:
    for p in s["players"]:
        s[p]["played_decree_this_turn"] = False
        s[p]["played_research_this_turn"] = False
        s[p]["acted_unit_this_turn"] = False


def _upkeep_draw(s: State, config: Config) -> None:
    """Upkeep draw routes through the hook-aware draw so 'when a player draws' decrees
    fire on the upkeep draw too (deck kind 'decree' for White's decree deck)."""
    player = s["active"]
    n = config["characters"][player]["draw_per_turn"]
    if n <= 0 or not s[player]["deck"]:
        return
    deck_kind = "decree" if s[player]["colour"] == "white" else "other"
    drawn = verbs.draw_cards(s, player, config, base=n, deck_kind=deck_kind)
    if drawn:
        s["log"].append(f"  · {player} upkeep draws {drawn}")


def _check_winner(s: State, config: Config) -> None:
    target = config["mandate_target"]
    leaders = [p for p in s["players"] if s["mandate"][p] >= target]
    if leaders:
        s["winner"] = max(s["players"], key=lambda p: s["mandate"][p])
        s["log"].append(f"*** {s['winner']} wins on turn {s['turn']} ***")
    elif s["turn"] >= config["max_turns"]:
        a, b = s["players"]
        if s["mandate"][a] == s["mandate"][b]:
            s["winner"] = "draw"
        else:
            s["winner"] = max(s["players"], key=lambda p: s["mandate"][p])
        s["log"].append(f"*** timeout turn {s['turn']}: {s['winner']} ***")
