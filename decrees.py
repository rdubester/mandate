"""Decree hook system — decrees are RULES installed on the shared table that wrap every
player's verbs, not White's private scoring timers.

The conceptual model (see the-character-model.md / user's governance thesis):
  A decree hooks the verb pipeline. When ANY player takes a verb, each installed decree may:
    - match on the verb + its detail (e.g. 'when a RESEARCH card is drawn' — hits Blue, never
      Green, because Green has no deck — this is wheel-targeting via wording);
    - OFFER the acting player a *rider* (the 'may') — a genuine, usually-beneficial choice;
    - MODIFY the verb's effect (ambient tax: 'unit verbs cost +1', with no rider);
    - PAY Mandate to the decree's OWNER when the player COMPLIES (takes the rider), or always,
      or on a condition.
  White's legitimacy = it skims Mandate off other players choosing to live under its rules.

ARCHITECTURE NOTE (the open part, flagged deliberately): the *shape* of a hook below is meant
to be stable. The *vocabulary* of triggers/effects is intentionally small and obviously
extensible — this is NOT the final decree language. When designing the full decree set, grow
TRIGGER_MATCHERS and EFFECT/RIDER handling; the pipeline shape should not need to change.
"""

from __future__ import annotations

from typing import Any, Callable

State = dict[str, Any]
Config = dict[str, Any]


# --- compliance policy: who decides whether to take an offered rider -----------
# Default is greedy-accept (take any rider whose direct benefit is positive), so current
# bot games run unchanged. A character may override via state[player]["compliance"].

def _greedy_accept(rider: dict, state: State, player: str) -> bool:
    return True


COMPLIANCE_POLICIES: dict[str, Callable[[dict, State, str], bool]] = {
    "greedy": _greedy_accept,
    # later: "cautious" (refuse if it pays the owner more than it helps me), etc.
}


def _wants_rider(decree_owner: str, rider: dict, state: State, player: str) -> bool:
    policy_name = state[player].get("compliance", "greedy")
    policy = COMPLIANCE_POLICIES.get(policy_name, _greedy_accept)
    # A player never benefits from feeding an opponent and may want to refuse, but the
    # default greedy policy ignores that — the choice point exists for smarter policies.
    return policy(rider, state, player)


# --- trigger matching: does this decree fire on this verb event? ---------------
# A trigger is data: {"on": <verb>, optional "detail": {...predicate...}}.

def _matches(trigger: dict, verb: str, detail: dict) -> bool:
    if trigger.get("on") != verb:
        return False
    want = trigger.get("detail")
    if not want:
        return True
    for k, v in want.items():
        if detail.get(k) != v:
            return False
    return True


# --- the pipeline: run every installed decree against a verb event -------------

def all_decrees_in_play(state: State) -> list[tuple[str, str]]:
    """[(owner, decree_id), ...] across all players, in play order."""
    out = []
    for p in state["players"]:
        for did in state[p]["decrees_in_play"]:
            out.append((p, did))
    return out


def fire(state: State, config: Config, verb: str, player: str, detail: dict) -> dict:
    """Run all installed decrees against a verb event taken by `player`.

    Returns a `modifiers` dict the verb can read (e.g. {"extra_draw": 1, "cost_delta": 1}).
    Applies Mandate payouts and logs as a side effect (mutates state).
    """
    mods: dict[str, Any] = {"cost_delta": 0, "extra_draw": 0, "yield_delta": 0}

    for owner, did in all_decrees_in_play(state):
        spec = config["decrees"][did]
        trig = spec.get("trigger")
        if not trig or not _matches(trig, verb, detail):
            continue

        # Ambient effect (no choice): apply unconditionally.
        eff = spec.get("effect")
        if eff:
            for k, v in eff.items():
                mods[k] = mods.get(k, 0) + v

        # Rider (the 'may'): offer to the acting player.
        rider = spec.get("rider")
        complied = False
        if rider:
            if _wants_rider(owner, rider, state, player):
                complied = True
                for k, v in rider.get("effect", {}).items():
                    mods[k] = mods.get(k, 0) + v

        # Scoring: owner skims Mandate.
        score = spec.get("score", {})
        amt = 0
        when = score.get("when")
        if when == "compliance" and complied:
            amt = score.get("amount", 0)
        elif when == "always":
            amt = score.get("amount", 0)
        if amt:
            state["mandate"][owner] += amt
            tag = "compliance" if when == "compliance" else "always"
            state["log"].append(
                f"  · decree '{did}' ({tag}): {owner} +{amt} Mandate"
                + (f" [{player} complied]" if complied else "")
            )

    return mods
