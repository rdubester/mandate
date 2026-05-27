# Blue — The Institute: design notes

Status: **design only — nothing here is implemented yet.** Blue lands fourth in the build
order (after Green). These notes capture where the Blue design has settled so far, so the
eventual implementation and the other docs have one place to point at. Balance numbers stay
out of this doc on principle; they belong in `../balance-notes.md`, read off the sim.

## Core identity

Blue is the private-compounding faction: behind all game while it curates, then pops off.
Its persistent state lives **entirely in its Archive** — no counters, no tableau, no
blue-specific board state. Research cards are **sorceries**: played on your turn, the effect
happens, done. No reactions, no counterspells, no between-turn anything.

## Decks and card flow

- **Shared research deck (the commons)** — a table resource like the decree deck; depletes
  and refills from its discard pile. Anyone with card access draws from here.
- **Blue's Archive** — the only per-player deck in the game. Standard lifecycle: face-down
  draw pile + face-up discard ("the Stacks"); reshuffle the Stacks into the Archive when the
  draw pile runs dry. Same deplete→refill rule the commons already uses, just private. The
  face-up Stacks doubles as information texture: opponents can see what Blue is hoarding,
  not when it comes back.
- **"Draw research" never names a source.** Source is a player property: Blue may choose
  Archive or commons; everyone else only has the commons. This single rule *is* the ramp —
  early Blue draws random commons cards like anyone; late Blue draws from a deep, curated,
  recirculating Archive.
- **Velocity is not a stat** — it's archive composition (cantrips, draw effects, thinness).
  Nothing to track on the board.

## A card in Blue's hand has three exits

1. **Use it** — play for effect, then choose: **archive it** (to the Stacks, fuels the
   engine) or **return it to the commons discard**. The return option is the thinning
   mechanic — junk dilutes your draws, so curation is an ambient decision on every play,
   not a special card effect.
2. **Publish it** — discard it unplayed to the commons for its **burn value** in Mandate.
   This is Blue's scoring.
3. **Hold it.**

No exile zone exists anywhere; everything not archived cycles through the commons.

## Scoring: publish or perish

- Pure discard: points **or** effect, never both. Blue is never paid for interacting, and
  every point is a real sacrifice.
- **Conserved**: each point consumes a card from hand → infinite combos are structurally
  impossible; Blue's ceiling = card flow × burn values.
- Per-card burn value is a data-row knob; together with effect strength it gives a 2-D
  tuning surface where *flexible* cards (good effect AND good burn) are the premiums.
  Interaction cards lean strong-effect / low-burn; pure "Findings" lean weak-effect /
  high-burn; engine cards sit low.
- The macro arc — archive early, publish late, and choosing *when to flip* — is the
  faction's big decision.
- **Leaning (not locked):** publish is an action, "discard up to K, score their values" —
  the same up-to-K shape as White's allocate — so drawing, playing, and publishing all
  fight over the same 2 action slots.
- Forced discards never score. Only Blue's own deliberate publish does.

## What other factions get

Centre perks are never lent out: **score + Archive ride Blue's seat, not the card.**

- **Red** gets blue *cards*, not blue *verbs*: its slice of the B-home market/procure
  primitive {U,B,R} ("raid the lab": spend a zealot, take a research card from the commons)
  puts cards in Red's **hand**. Hand ≠ Archive — a hand is a transient options buffer (the
  agency of choosing which and when); the Archive is a curated cycling deck that compounds.
  Red plays raided cards for the one-shot effect; the card then goes to the commons discard.
  No archive, no publish, ever.
  Zealots doing double duty (strike ammo vs raid fuel) keeps card-dipping a deliberate
  pivot rather than Red's default line.
- **White** reaches research via the shared W–U verb (today's `deliberate`, reskinned when
  Blue lands) — it can draw and dig, same no-archive / no-publish rule.

## Card palette

- **Selection/dig** — "draw 3, keep 1, return the rest": selection value for anyone holding
  a hand, archive-sculpting surplus for Blue.
- **Bounce** ("Tabled for Review") — return a decree from the table to its owner's hand.
  The removal triad: Blue delays, Red destroys, Black trades.
- **Hand disruption** — steal the physical card (Poach) or force a discard (Redact). Never
  copy (physical game). Intellectual theft is Blue's lane; unit theft stays Black's.
- **Burst tempo** — "+2 actions this turn" (nets +1 after the action spent playing it).
  Distinct from Green's sustained action economy: engine vs burst.
- **Engine cards** — draw/cycle/acquire; mostly Blue-valuable, low burn values. These are
  the cards a raider wouldn't bother stealing — by design.
- **Not Blue:** destroying permanents (Red), touching or stealing units (Black/Red),
  anything instant-speed.

## Sim checks for when Blue lands

- Does Blue's win rate actually depend on live compounding (vs. Red just borrowing its
  cards)? If borrowing performs as well as owning, the Archive isn't earning its complexity.
- **The Paper Mill** (draw from commons → publish straight back, never build an engine)
  must lose to engine-Blue.
- Blue's draw volume is its most sensitive knob — it feeds both the engine and score income.
- Sweep Red's raid cost: dipping should be a deliberate pivot, not free and not never-worth-it.
- Long Blue turns are a table-feel risk in multiplayer even if balanced; watch game pace.
- **Does the rider take/decline lever come alive?** The upkeep rider-fork (a player may
  decline a decree's "may draw +1") is inert in W-v-R: Red doesn't draw, and White only ever
  complies with its own supported decree. The tension needs a NON-OWNER drawing under someone
  else's supported decree — which is exactly Blue (it draws constantly; White can support a
  draw-triggered decree that scores White off Blue's draws). Sim-check when Blue lands: does
  MCTS-Blue actually decline a White-supported draw rider when complying would feed White more
  than the extra card helps Blue? If it never declines, the fork isn't earning its keep.

## Open questions

- Exact publish-action shape (the up-to-K leaning above).
- Acquisition: a separate acquire verb/cost, or simply "play a commons card and choose to
  archive it" (which would unify acquisition, scoring, and engine-building into one fork —
  elegant, but removes the explicit acquisition-cost knob the brief wanted).
- Burn-value distribution across the card pool.
- Hidden-information handling for MCTS once two factions hold hands (determinize decks per
  playout; `playerView` alone doesn't fix the bot).
