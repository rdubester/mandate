"""Verb registry for The Mandate (three-tier character model).

A verb is a pure mutator: verb(state, player, action, config) -> None (mutates a deepcopy
made by the engine). Verbs come in two kinds, distinguished only by how a player GETS them:

  - signature (tier 2): granted to exactly one character, by name. Never shareable.
  - shared    (tier 3): granted if any of the verb's colours is in the player's shard.

The engine computes availability; verbs here only implement effects. This is where the old
`if faction == "white"` branches went to die — each verb is faction-agnostic.

Units: two currencies, one per green edge (see the-character-model.md). `rally_supporters`
(G-W edge, soft stock) and `muster_zealots` (G-R edge, hard flow). There is NO `_home_unit`
colour-switch anymore — the two currencies are two distinct verbs, gated by the shard. White
(GWU) can never reach the G-R edge, so it can never muster zealots: pacifism is a hole, not a
branch. `strike` (R) spends zealots.
"""

from __future__ import annotations

from typing import Any, Callable

import decrees

State = dict[str, Any]
Action = dict[str, Any]
Config = dict[str, Any]
Verb = Callable[[State, str, Action, Config], None]


def draw_cards(state: State, player: str, config: Config, base: int, deck_kind: str) -> int:
    """Centralized draw: fires the on-draw decree hook so 'when a player draws...' works
    for BOTH the research verb and the upkeep draw. deck_kind lets decrees target wording
    like 'when a research card is drawn'. Returns how many were actually drawn."""
    drawn = 0
    p = state[player]
    for _ in range(base):
        if not p["deck"]:
            break
        # Fire the hook per card drawn, passing the deck kind as detail.
        mods = decrees.fire(state, config, "draw", player, {"deck": deck_kind})
        p["hand"].append(p["deck"].pop(0))
        drawn += 1
        extra = mods.get("extra_draw", 0)
        while extra > 0 and p["deck"]:
            p["hand"].append(p["deck"].pop(0))
            drawn += 1
            extra -= 1
    return drawn


def _opp(player: str, state: State) -> str:
    return next(p for p in state["players"] if p != player)


def _strike_cost(state: State, config: Config, player: str | None = None) -> int:
    """Base strike cost (in zealots), plus any ambient cost_delta from decrees hooking
    'strike'. Note: this previews the cost without firing payouts (used by legal_actions).
    The actual fire happens in strike() so compliance/scoring resolve exactly once."""
    base = config["scoring"]["strike_landed"]["zealot_cost"]
    delta = 0
    for owner, did in decrees.all_decrees_in_play(state):
        spec = config["decrees"][did]
        trig = spec.get("trigger")
        if trig and trig.get("on") == "strike":
            delta += spec.get("effect", {}).get("cost_delta", 0)
    return base + delta


# ---- signature verbs (tier 2) ---------------------------------------------

def enact_decree(state: State, player: str, action: Action, config: Config) -> None:
    """White's signature: play a decree from hand into the shared decree-state."""
    p = state[player]
    card = action["card"]
    if card not in p["hand"]:
        state["log"].append(f"[{player}] enact_decree illegal: {card} not in hand")
        return
    p["hand"].remove(card)
    p["decrees_in_play"].append(card)
    p["played_decree_this_turn"] = True
    state["log"].append(f"[{player}] enacts decree '{card}'")


def _grow_units(state: State, player: str, config: Config, verb: str, unit: str) -> None:
    """Shared machinery for the two unit verbs. Fires the verb's decree hook (so taxes/
    boons on rally_supporters or muster_zealots apply + White skims), then adds units."""
    base = config["unit_yield"][verb]
    mods = decrees.fire(state, config, verb, player, {"unit": unit})
    n = max(0, base + mods.get("yield_delta", 0))
    state[player][unit] += n
    state[player]["acted_unit_this_turn"] = True
    state["log"].append(f"[{player}] {verb}: +{n} {unit}")


def muster_zealots(state: State, player: str, action: Action, config: Config) -> None:
    """Red's signature (G-R edge): mint zealots — the hard flow spent on direct actions.
    Unshareable; Black mints nothing. White can never have this (no R in shard)."""
    _grow_units(state, player, config, "muster_zealots", "zealots")


# ---- shared verbs (tier 3) -------------------------------------------------

def rally_supporters(state: State, player: str, action: Action, config: Config) -> None:
    """Shared on the G-W edge: grow supporters — the soft stock / White's legitimacy fuel.
    Available to White and Green (shards touching G or W)."""
    _grow_units(state, player, config, "rally_supporters", "supporters")


def research(state: State, player: str, action: Action, config: Config) -> None:
    """Shared research (MVP stub): draw 1 from own deck, firing the on-draw decree hook
    with deck kind 'research'. Blue's Archive not built yet."""
    state[player]["played_research_this_turn"] = True
    if not state[player]["deck"]:
        state["log"].append(f"[{player}] researches (no deck)")
        return
    n = draw_cards(state, player, config, base=1, deck_kind="research")
    state["log"].append(f"[{player}] researches: drew {n}")


def strike(state: State, player: str, action: Action, config: Config) -> None:
    """Shared strike (R): spend a zealot to hit opponent's Mandate or a decree. Scores actor."""
    mods = decrees.fire(state, config, "strike", player, {"target": action["target"]})
    cost = max(0, config["scoring"]["strike_landed"]["zealot_cost"] + mods.get("cost_delta", 0))
    p = state[player]
    if p["zealots"] < cost:
        state["log"].append(f"[{player}] strike illegal: need {cost} zealot(s)")
        return
    sc = config["scoring"]["strike_landed"]
    opp = _opp(player, state)
    target = action["target"]
    if target == "decree":
        did = action["decree_id"]
        if did not in state[opp]["decrees_in_play"]:
            state["log"].append(f"[{player}] strike fizzled: '{did}' gone")
            return
        p["zealots"] -= cost
        state[opp]["decrees_in_play"].remove(did)
        state["mandate"][player] += sc["mandate_per_strike"]
        state["log"].append(f"[{player}] strikes decree '{did}': +{sc['mandate_per_strike']} Mandate")
    else:  # mandate
        p["zealots"] -= cost
        kb = sc["marker_knockback"]
        state["mandate"][opp] = max(0, state["mandate"][opp] - kb)
        state["mandate"][player] += sc["mandate_per_strike"]
        state["log"].append(
            f"[{player}] strikes {opp}'s Mandate: -{kb} to {opp}, +{sc['mandate_per_strike']} to {player}"
        )


REGISTRY: dict[str, Verb] = {
    # signature
    "enact_decree": enact_decree,
    "muster_zealots": muster_zealots,
    # shared
    "rally_supporters": rally_supporters,
    "research": research,
    "strike": strike,
}
