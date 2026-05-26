"""Pure-function game engine for The Mandate (MVP: White vs. Red).

State is a plain dict — JSON-serializable, trivially copyable, replayable.
The turn loop is (state, action) -> state. No globals, no I/O.

Design contract (from brief §10):
  - Every numeric value comes from config, never hardcoded here.
  - Rules are data where reasonable (decrees in config.json).
  - Engine never prints; callers (cli.py, bots.py) handle I/O.
"""

from __future__ import annotations

import copy
import json
import random
from pathlib import Path
from typing import Any

State = dict[str, Any]
Action = dict[str, Any]
Config = dict[str, Any]


def load_config(path: str | Path = "config.json") -> Config:
    with open(path) as f:
        return json.load(f)


# ---------------------------------------------------------------- setup ----

def new_game(config: Config, seed: int | None = None) -> State:
    """Build a fresh game state from config."""
    seed = seed if seed is not None else config.get("rng_seed")
    rng_state = random.Random(seed).getstate() if seed is not None else random.Random().getstate()

    white_cfg = config["factions"]["white"]
    red_cfg = config["factions"]["red"]

    deck = list(config["white_deck"]["cards"])
    rng = random.Random(seed)
    rng.shuffle(deck)

    # Draw White's starting hand from top of deck.
    starting_n = white_cfg["starting_hand"]
    white_hand = deck[:starting_n]
    deck = deck[starting_n:]

    return {
        "config_ref": None,  # populated by callers if they want; engine reads via param
        "rng_state": rng.getstate(),
        "turn": 1,
        "active": "white",
        "actions_left": config["turn"]["actions_per_turn"],
        "mandate": {"white": 0, "red": 0},
        "white": {
            "hand": white_hand,
            "deck": deck,
            "decrees_in_play": [],  # list of decree ids
            "soldiers": white_cfg["starting_soldiers"],
            "supporters": white_cfg["starting_supporters"],
            "played_decree_this_turn": False,
            "played_research_this_turn": False,
            "deployed_this_turn": False,
        },
        "red": {
            "hand": [],
            "deck": [],
            "decrees_in_play": [],
            "soldiers": red_cfg["starting_soldiers"],
            "supporters": red_cfg["starting_supporters"],
            "played_decree_this_turn": False,
            "played_research_this_turn": False,
            "deployed_this_turn": False,
        },
        "log": [],
        "winner": None,
    }


# -------------------------------------------------------- action helpers ---

def legal_actions(state: State, config: Config) -> list[Action]:
    """All actions the active player can legally take right now."""
    if state["winner"] is not None or state["actions_left"] <= 0:
        return [{"type": "end_turn"}]

    faction = state["active"]
    fac_cfg = config["factions"][faction]
    shard = fac_cfg["shard"]
    p = state[faction]
    actions: list[Action] = []

    if "decree" in shard and faction == "white":
        for card in set(p["hand"]):
            actions.append({"type": "decree", "card": card})

    if "strike" in shard and faction == "red":
        cost = config["red_scoring"]["soldier_cost_per_strike"]
        if _has_martial_restraint(state):
            cost += 1
        if p["soldiers"] >= cost:
            # Two strike flavours: hit opponent's Mandate, or rip a decree.
            opp = _opponent(faction)
            actions.append({"type": "strike", "target": "mandate", "opponent": opp})
            for did in set(state[opp]["decrees_in_play"]):
                actions.append({"type": "strike", "target": "decree", "opponent": opp, "decree_id": did})

    if "deploy" in shard:
        actions.append({"type": "deploy"})

    if "research" in shard:
        # MVP: research is a placeholder one-shot (no real card pool yet).
        actions.append({"type": "research"})

    actions.append({"type": "end_turn"})
    return actions


def _opponent(faction: str) -> str:
    return "red" if faction == "white" else "white"


def _has_martial_restraint(state: State) -> bool:
    return "martial_restraint" in state["white"]["decrees_in_play"]


# -------------------------------------------------------- the turn loop ---

def apply(state: State, action: Action, config: Config) -> State:
    """Pure: returns a new state. Never mutates input."""
    s = copy.deepcopy(state)
    if s["winner"] is not None:
        return s

    t = action["type"]
    faction = s["active"]
    p = s[faction]

    if t == "end_turn":
        return _end_turn(s, config)

    if s["actions_left"] <= 0:
        s["log"].append(f"[{faction}] illegal: no actions left")
        return s

    if t == "decree":
        _do_decree(s, action, config)
    elif t == "strike":
        _do_strike(s, action, config)
    elif t == "deploy":
        _do_deploy(s, action, config)
    elif t == "research":
        _do_research(s, action, config)
    else:
        s["log"].append(f"[{faction}] unknown action: {t}")
        return s

    s["actions_left"] -= 1
    _check_winner(s, config)
    return s


def _do_decree(s: State, action: Action, config: Config) -> None:
    faction = s["active"]
    p = s[faction]
    card = action["card"]
    if card not in p["hand"]:
        s["log"].append(f"[{faction}] cannot play {card}: not in hand")
        return
    p["hand"].remove(card)
    p["decrees_in_play"].append(card)
    p["played_decree_this_turn"] = True
    s["log"].append(f"[{faction}] plays decree '{card}'")

    # 'public_works' positive decree: scores 1 immediately when White plays a decree.
    if faction == "white" and "public_works" in p["decrees_in_play"]:
        s["mandate"]["white"] += 1
        s["log"].append("  └ public_works fires: +1 Mandate")


def _do_strike(s: State, action: Action, config: Config) -> None:
    faction = s["active"]
    p = s[faction]
    cost = config["red_scoring"]["soldier_cost_per_strike"]
    if _has_martial_restraint(s):
        cost += 1
    if p["soldiers"] < cost:
        s["log"].append(f"[{faction}] cannot strike: need {cost} soldier(s)")
        return
    p["soldiers"] -= cost

    target = action["target"]
    opp = action["opponent"]
    score = config["red_scoring"]["mandate_per_strike"]

    if target == "mandate":
        knockback = config["red_scoring"]["marker_knockback"]
        s["mandate"][opp] = max(0, s["mandate"][opp] - knockback)
        s["mandate"][faction] += score
        s["log"].append(f"[{faction}] strikes {opp}'s Mandate: -{knockback} to {opp}, +{score} to {faction}")
    elif target == "decree":
        did = action["decree_id"]
        if did in s[opp]["decrees_in_play"]:
            s[opp]["decrees_in_play"].remove(did)
            s["mandate"][faction] += score
            s["log"].append(f"[{faction}] strikes decree '{did}' off {opp}'s board: +{score} Mandate")
        else:
            # decree gone since action was generated — refund nothing, just log
            s["log"].append(f"[{faction}] strike fizzled: decree '{did}' no longer in play")


def _do_deploy(s: State, action: Action, config: Config) -> None:
    faction = s["active"]
    p = s[faction]
    fac_cfg = config["factions"][faction]
    p["deployed_this_turn"] = True

    if faction == "red":
        n = fac_cfg.get("recruit_per_deploy", 1)
        # 'writ_of_order' negative decree: opponents' Deploy yields -1 unit.
        if "writ_of_order" in s["white"]["decrees_in_play"]:
            n = max(0, n - 1)
        p["soldiers"] += n
        s["log"].append(f"[{faction}] deploys: +{n} soldier(s)")
    else:
        # White can deploy too (GWU shard), but MVP doesn't use supporters meaningfully.
        n = 1
        if "writ_of_order" in s["red"]["decrees_in_play"]:
            n = max(0, n - 1)
        p["supporters"] += n
        s["log"].append(f"[{faction}] deploys: +{n} supporter(s)")


def _do_research(s: State, action: Action, config: Config) -> None:
    """Placeholder one-shot research: doesn't score directly (Blue isn't here yet).
    Wired so Loyalty Oath has something to trigger on."""
    faction = s["active"]
    p = s[faction]
    p["played_research_this_turn"] = True
    # Tiny tangible effect so the action isn't a no-op: draw a card if you have a deck.
    if p["deck"]:
        card = p["deck"].pop(0)
        p["hand"].append(card)
        s["log"].append(f"[{faction}] researches: draws '{card}'")
    else:
        s["log"].append(f"[{faction}] researches (no effect — no deck)")


# ---------------------------------------------- end-of-turn bookkeeping ---

def _end_turn(s: State, config: Config) -> State:
    faction = s["active"]
    _resolve_white_decrees(s, config)
    _resolve_loyalty_oath(s, config)
    _reset_turn_flags(s)
    _check_winner(s, config)
    if s["winner"] is not None:
        return s

    # Hand off.
    s["active"] = _opponent(faction)
    s["turn"] += 1 if s["active"] == "white" else 0
    s["actions_left"] = config["turn"]["actions_per_turn"]
    _upkeep_draw(s, config)
    s["log"].append(f"--- turn {s['turn']}, {s['active']} to act ---")
    return s


def _resolve_white_decrees(s: State, config: Config) -> None:
    """At end of White's turn, each White decree 'bites' once if its trigger is met."""
    if s["active"] != "white":
        return
    score_per_bite = config["white_scoring"]["mandate_per_bite"]
    opp = "red"
    bites = 0
    for did in s["white"]["decrees_in_play"]:
        if _decree_bites(did, s, opp):
            bites += 1
            s["log"].append(f"  · decree '{did}' bites: +{score_per_bite} Mandate to white")
    s["mandate"]["white"] += bites * score_per_bite


def _decree_bites(did: str, s: State, opp: str) -> bool:
    """Cheap inline rules. Add new decrees here when extending config."""
    if did == "tax_levy":
        # Bites if opponent has a soldier (pays) or has Mandate to lose.
        return s[opp]["soldiers"] > 0 or s["mandate"][opp] > 0
    if did == "civic_endowment":
        return True  # white drew at upkeep; always bites
    if did == "martial_restraint":
        return s[opp]["soldiers"] > 0  # bites if opp could've struck
    if did == "writ_of_order":
        return s[opp]["deployed_this_turn"]
    if did == "public_works":
        return s["white"]["played_decree_this_turn"]
    if did == "loyalty_oath":
        return s[opp]["played_research_this_turn"]
    return False


def _resolve_loyalty_oath(s: State, config: Config) -> None:
    """If White's loyalty_oath is in play and opponent researched this turn, opp -1 Mandate."""
    opp = _opponent(s["active"])
    if "loyalty_oath" in s["white"]["decrees_in_play"] and s[opp]["played_research_this_turn"] and s["active"] != "white":
        s["mandate"][opp] = max(0, s["mandate"][opp] - 1)
        s["log"].append(f"  · loyalty_oath punishes {opp}: -1 Mandate")


def _reset_turn_flags(s: State) -> None:
    for fac in ("white", "red"):
        s[fac]["played_decree_this_turn"] = False
        s[fac]["played_research_this_turn"] = False
        s[fac]["deployed_this_turn"] = False


def _upkeep_draw(s: State, config: Config) -> None:
    """Active player's draw step. White draws config + civic_endowment bonus."""
    faction = s["active"]
    fac_cfg = config["factions"][faction]
    n = fac_cfg["draw_per_turn"]
    if faction == "white" and "civic_endowment" in s["white"]["decrees_in_play"]:
        n += 1
    drawn = 0
    while drawn < n and s[faction]["deck"]:
        s[faction]["hand"].append(s[faction]["deck"].pop(0))
        drawn += 1
    if drawn:
        s["log"].append(f"  · {faction} draws {drawn}")


def _check_winner(s: State, config: Config) -> None:
    target = config["mandate_target"]
    leaders = [f for f in ("white", "red") if s["mandate"][f] >= target]
    if leaders:
        # Tiebreak: higher Mandate wins; if exact tie, active player wins (just played).
        if len(leaders) == 1:
            s["winner"] = leaders[0]
        else:
            if s["mandate"]["white"] == s["mandate"]["red"]:
                s["winner"] = s["active"]
            else:
                s["winner"] = max(leaders, key=lambda f: s["mandate"][f])
        s["log"].append(f"*** {s['winner']} wins on turn {s['turn']}! ***")
    elif s["turn"] >= config["turn"]["max_turns"]:
        # Timeout: highest Mandate wins; tie => draw.
        if s["mandate"]["white"] > s["mandate"]["red"]:
            s["winner"] = "white"
        elif s["mandate"]["red"] > s["mandate"]["white"]:
            s["winner"] = "red"
        else:
            s["winner"] = "draw"
        s["log"].append(f"*** timeout at turn {s['turn']}: winner = {s['winner']} ***")
