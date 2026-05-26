# The Mandate — Design Brief (v3)

*Working title. A 5-faction card/area game of court politics. This is v3, incorporating the
2x2/pentagon structural finding, the action-loadout definition of shards, the counterplay
principles, and black's pivot from parasite to broker. It is the handoff document into a rapid
mechanics-prototyping session. Read the Uncertainty Map (§7) and Balance Parameters (§10)
before building anything.*

---

## 1. Premise & Thesis

Five factions contest control of an invented state. Each embodies a different **mode of
political legitimacy** — a different answer to "where does the right to rule actually come
from." Players race a single shared victory track, the Mandate; whoever first proves their
mode supreme claims it.

The thesis: the game is not about *who* sits the throne, it's about *what kind of power*
rules — hence one shared ladder climbed five different ways.

The five factions are the five **power centers of the regime**: the legislature, the academy,
the church, the army, and the financiers. (Adding the financiers — see §3, black — closed the
one conspicuous hole in the setting.)

**Setting:** a baroque, ritual-encrusted, *decaying* autocracy — dark academia fused with a
mid-century authoritarian regime. The touchstone is Gormenghast: a vast crumbling castle-state
strangled by its own ceremony, with law, bureaucracy, intrigue, and gothic mustiness intact.
The regime is fictional, which keeps every faction a villain-protagonist and dark mechanics
satirical rather than grim.

---

## 2. Core Architecture (locked)

**The pentagon is the primitive structure.** The five factions sit at the vertices of a
pentagon — the colour wheel, order White-Blue-Black-Red-Green. Each faction has two allied
neighbours and two enemies across the wheel. Everything below is a *view* of this pentagon.

**Five factions = the five MTG shards.** Each faction is a three-colour allied arc centred on
one colour — its governing *principle*. Across the five, each colour is a centre exactly once
and a wing exactly twice.

**Foregrounding black gives the 2x2.** No vertex is geometrically special; the design
*chooses* to foreground black (it owns no primitive and carries the unique scoring rule — see
§3-4). That holds the other four factions in a balanced 2x2, spanned by two axes:

- **Primitive axis** — what you manipulate: **cards** (White, Blue) vs. **units** (Red, Green).
- **Archetype axis** — how you win: **interaction** (White, Red — resources aimed at other
  players' boards) vs. **engine/ramp** (Blue, Green — resources aimed at your own growth).

|              | Interaction        | Engine / Ramp        |
|--------------|--------------------|----------------------|
| **Cards**    | White — Assembly   | Blue — Institute     |
| **Units**    | Red — Vanguard     | Green — Orthodoxy    |

Black sits off the grid, the fifth element.

**The third axis — timing.** The diagonal of the 2x2 yields a third pairing, {White, Green}
and {Blue, Red}, and it is load-bearing (see §3 scoring). Geometrically it is the pentagon's
*reflection through black* — the one that fixes black and swaps White↔Green and Blue↔Red. It
is the only one of the three pairings that is an actual symmetry of the pentagon; the other
two are design overlays. Black being the fixed point of that reflection is the formal license
for its unique, unpaired scoring rule.

**Design consequence:** the symmetry is broken exactly once, at black. Keep it that way —
making a second faction "special" muddies the structure.

**Two layers.** Keep them strictly separate: **primitives** (cards, units, black's actions)
and the **victory layer** (the Mandate).

**The Mandate.** One shared track, first past the post. Target is high — provisionally **~200**
— deliberately, so blue's engine has room to ramp and white's decrees can bite many times
before anyone wins. The exact target is a balance parameter (see §10).

---

## 3. The Five Factions

| Shard (centre) | Faction | Principle / power centre |
|---|---|---|
| GWU (White) | The Assembly | Legitimate procedure — the legislature |
| WUB (Blue) | The Institute | Expertise — the academy |
| UBR (Black) | The Ledger *(working name)* | Brokerage — the financiers |
| BRG (Red) | The Vanguard | Force and conviction — the army |
| RGW (Green) | The Orthodoxy | Divine authority — the church |

### The Assembly — White · GWU · **HIGH confidence**
Reference design; the most concrete faction.

- **Archetype:** slow interaction. **Primitive:** decrees — permanent-type cards with ambient
  ongoing effects, interactable once in play. Two flavours: **positive** (benefits) and
  **negative** (taxes/restrictions).
- **Core play:** assemble a *combination* of decrees — empowering some players, hobbling
  others — that nets favourable for white. Real board agency, not a passive engine.
- **Scoring (decoupled / over-time):** white advances the Mandate whenever any decree's effect
  *bites* — a positive decree's benefit is used, or a negative decree actually restricts
  someone. White's Mandate is "the law having force," in either direction. The scoring event
  is detached in time from the act of playing the decree.
- **Design rule:** negative decrees are taxes and conditionals, never blanket lockouts.

### The Institute — Blue · WUB · **MEDIUM confidence**
- **Archetype:** ramp. **Primitive:** research cards (sorceries) — one-shot effects.
- **Core:** blue is a **deckbuilder embedded in the game**. Its engine is its own deck. The
  symmetry break from white: white's persistence is communal law on the table; blue's is
  private deck quality. White is the rulebook, blue is the workshop.
- **Engine:** blue acquires/upgrades research cards into its deck and thins weak cards. Card
  velocity climbs across the game.
- **Scoring (welded / immediate):** playing a research card advances the Mandate; the action
  *is* the scoring event. Rising velocity converts directly into rising score rate — "behind
  all game, pops off in the final rounds," fully public.
- **Gentle slope:** model engine upgrades as *additive increments* to velocity, not
  multipliers — tunable, non-runaway.
- **Open:** the shape of research-card acquisition. For MVP, blue improves its deck from its
  own plays — no separate shared market.

### The Vanguard — Red · BRG · **MEDIUM-HIGH confidence**
- **Archetype:** fast interaction. **Primitive:** units (soldiers) as **flow** — ammunition
  spent for immediate effect. Red can *consolidate* units into a single elite striker.
- **Core mechanic — reach:** red points at any object — a card in hand, a unit, a decree, a
  Mandate marker — and removes, steals, or hits it. Simple verb, universal target.
- **Why reach matters:** the simplicity makes red the legible, hireable kingmaker — the only
  faction whose help is direct and deliverable on demand. Reach is the wheel's enemy
  relationships made literal (anti-decree = anti-white; anti-card = anti-blue).
- **Scoring (welded / immediate):** advances by landing direct strikes; strikes can also knock
  opponents' markers back.
- **Balance lever:** every strike costs a unit — reach is ammunition-gated.

### The Orthodoxy — Green · RGW · **MEDIUM confidence**
- **Archetype:** ramp. **Primitive:** units (supporters) as **stock** — many, weak,
  persistent, synergistic, protected; the board state is the engine.
- **Engine:** units → actions → units. More units means more actions per turn means more
  units deployed. An action-economy ramp that rhymes with blue's card-velocity ramp.
- **Sanctuary/shelter:** signature defensive mechanic — protects units and resources from
  corruption (black) and removal (blue/red). Only green has it.
- **Scoring (decoupled / over-time — "procession"):** green amasses units, then cashes them
  via a dedicated procession: consume X units, advance the Mandate. The conversion rate is a
  primary tuning dial; cashing out shrinks green's board (natural rubber-band). NB: the
  procession is green's *scoring cash-out* (units → Mandate, vertical), distinct from black's
  Convert action (primitive ↔ primitive, lateral).
- **Stretch (not MVP):** "endurance" — sheltered units that survive long enough mature into
  score.

### The Ledger — Black · UBR · **MEDIUM confidence — build last**
*(Working name. Identity pivoted from parasite to broker — see §8.)*

- **Identity:** the broker / the market / the financiers — the arms-dealer, the war-financier,
  the house that takes a cut of every trade.
- **Primitive:** none. A fixed action menu built around **conversion** — black brokers between
  everyone else's resources (notably soldiers ↔ research, the two non-centre actions of its
  own shard).
- **Scoring (circulation — the unique fixed-point rule):** black scores Mandate on
  *throughput* — value passing through it and changing form. This is the genuine third scoring
  mode: red/blue score on **expenditure** (welded), white/green on **deferral** (decoupled),
  black on **circulation**. It is off the welded/decoupled axis entirely, which is what the
  pentagon's fixed point should be.
- **Mirror with white:** white is the State (scores when the rules are exercised); black is
  the Market (scores when goods change hands). Public institution vs. private market;
  wheel-enemies.
- **Design caution:** a broker that profits from converting its *own* resources is a solitaire
  arbitrage loop. Black must structurally need the table — conversions should pay out most on
  scarce/contested resources or cross-player trades. The arms-dealer needs a war.
- **Build last:** its kit is defined by the other four (it converts their primitives) and it
  needs a functioning market to price against — untestable in isolation.
- **Open:** the exact conversion set and the throughput-scoring rate.

---

## 4. Primitives, Actions & Economy

**Five primitive actions, one per colour:**
- **Research** — draw/play a research card (blue)
- **Decree** — draw/play a decree (white)
- **Deploy** — play units (green)
- **Strike** — spend soldiers to perform direct actions (red)
- **Convert** — exchange one resource type for another (black)

**A faction's shard IS its action menu.** Each faction can take exactly **three of the five**
actions — the three colours of its shard — and **scores Mandate only via its centre colour's
action**, through a scoring perk welded to it. White (GWU) can Deploy, Decree, and Research,
and scores only from Decree (via the "decrees bite" perk). Every action is therefore available
to exactly three factions, so players learn neighbouring subsystems without having to main
them, while VP-from-centre-only keeps strategies focused.

The five centre-action scoring perks: white — decrees bite; blue — research played; red —
strikes landed; green — procession (units cashed); black — circulation (throughput skimmed).

**The card/unit factoring (forced by the wheel).** Wheel order is White-Blue-Black-Red-Green.
Cards are the first pair (White, Blue — allies); units are the last pair (Red, Green —
allies); black sits dead centre. *Cards*: decrees (white — permanent, communal) and research
(blue — one-shot, private deckbuilder fuel). *Units*: soldiers (red — flow, spent for reach)
and supporters (green — stock, grown and cashed). Black owns no primitive — it is the hinge
between the two economies and converts between them.

Card-heaviness: Blue > White > Black > Red ~ Green. Unit-heaviness: Green > Red > White >
Black ~ Blue.

---

## 5. Counterplay & Vulnerability

Two separate structuring principles govern who beats whom. Keep them distinct.

**Granularity (runs along the archetype axis).** A faction's vulnerability to ±1-magnitude
effects is set by how chunky its resources are. Ramp factions are *granular* — blue holds many
cards, green many units, so ±1 barely registers. Interaction factions are *chunky* — white
rests on two or three active decrees, red on a few expensive consolidated soldiers, so ±1 is
proportionally enormous.

**The wheel (designed enemy relationships).** Enemy colours are built to prey on each other.
For white this *coincides* with granularity (its ±1 decrees help its granular allies, its ±1
tax wrecks chunky red) — a coincidence, not a law. Do not try to explain every matchup with
one principle; that is what made earlier matchups feel murky.

**Consequence — counterplay type follows archetype:**
- Interaction factions (chunky) are beaten by **stock attrition** — remove or tax their few
  big pieces (red rips a decree; white taxes a soldier).
- Ramp factions (granular) are beaten by **growth denial** — stock attrition whiffs, so you
  attack the *acceleration*. "Burn the books" hits blue's deck-improvement (trash research,
  block acquisition), not blue's hand. "Sow doubt" hits green's units→actions loop (cap
  actions, tax recruitment, break synergy), not green's units.
- Mirror matchups: interaction mirrors fight over stock; ramp mirrors fight over growth rate.

---

## 6. Turn Structure (provisional, deliberately minimal)

**One skeleton for every faction.** Per turn: a draw step (volume varies — blue draws most),
then **2 actions** from the player's three-action shard menu, then pass.

Do **not** build per-faction turn phases. One skeleton, five toolkits. Liveliness comes from
decrees firing passively and blue/red reacting *between* turns.

---

## 7. Uncertainty Map

**Locked / high confidence**
- Pentagon as primitive structure; the 2x2 (primitive × archetype) view; the timing axis.
- Five factions = five shards; shard = three-action menu, centre = scoring action.
- The Mandate: single shared track, first past the post, high target (~200 provisional).
- White: positive/negative decrees; scores when a decree bites.
- Blue: deckbuilder; deck-as-engine; research-played scores.
- Red: reach; strikes score.
- Green: procession scoring (cash units → Mandate).
- Black: broker identity; scores on circulation/throughput.
- The two-principle counterplay model (granularity vs. the wheel).

**Provisional / medium confidence**
- Black's exact conversion set and throughput-scoring rate.
- Red combat-resolution detail; green sanctuary rules; blue's research-acquisition shape.

**Open — resolve by playtest and parameter sweeps**
- **Player count.** Still not decided. The pentagon is strongest at 5; fewer players means
  factions need standalone tuning. Decide before building.
- The full balance-parameter set (see §10) — every value is currently a guess.

---

## 8. Decisions Made / Paths Not Taken

- **Dropped:** the "verb taxonomy"; any public/private resource split; five symmetric resource
  currencies.
- **Dropped — black as parasite.** Replaced with **black as broker**. Reasons: broker gives
  black its own game rather than a purely derivative one; it collapses the "score-from-
  converting vs. siphon" seam (the Convert action simply *is* the identity); it completes the
  setting's missing market; and it avoids the feel-bad and debt-counter bookkeeping of
  parasitism. Menace is recovered through market power (set the rate, refuse to trade, profit
  on desperation), not theft.
- **Settled:** fictional regime, dark academia × authoritarian (Gormenghast register).
- **Settled:** the Mandate as a single shared track, high target.
- **Settled:** the pentagon/2x2 structure; symmetry broken once, at black.
- **Settled:** shard = three-action menu; centre colour = scoring action.
- **Settled:** white scores when decrees bite; blue is a deckbuilder; green scores by
  procession (MVP), endurance is a stretch.
- **Side effect:** with black no longer paramilitary, red is the sole military power — the old
  "make the secret police and the army feel distinct" problem disappears.

---

## 9. Recommended Build Path

1. **Spine first:** the Mandate track and the universal turn loop. Build every numeric value
   as named, editable config from day one.
2. **Two factions only: White (Assembly) and Red (Vanguard).** Enemy colours, instant
   conflict; between them they exercise both primitives and the two most different scoring
   shapes (decree-bite vs. strike); both self-sufficient 1v1.
3. **Not the Ledger in prototype 1** — it owns no primitive and needs a functioning market to
   price against; untestable in isolation.
4. **Green third, Blue fourth, Black last** (its kit is defined by the other four).

---

## 10. Simulator Notes & Balance Parameters

A board-game-simulator-lite for rapid iteration — text/CLI first, no UI. The dominant activity
is **tuning balance parameters**, so build for that.

- **Game state:** a plain serializable object — Mandate marker positions; per-player board
  (decrees in play, deck/hand, soldier and supporter counts, black's conversion state); turn
  pointer; turn count.
- **Turn loop as a pure function:** `(state, action) -> state`. Deterministic, replayable.
- **Data-driven rules:** decrees, research cards, and the action menu as data (JSON), not
  code.
- **Scripted faction policies (bots):** a simple heuristic per faction, so you can run many
  headless games and read win-rate and game-length distributions — that distribution is the
  tuning signal.
- **Everything observable/loggable:** replay a game and see why and how fast someone won.

**Balance parameters to expose as config from day one:**
- Mandate target (provisional ~200).
- White: Mandate score per decree bite; positive vs. negative decree ratio.
- Blue: card-velocity increment per upgrade (additive); research acquisition cost; Mandate
  score per research card played.
- Red: unit cost per strike; Mandate score per strike; marker-knockback amount.
- Green: unit-to-Mandate conversion rate (procession); actions granted per unit.
- Black: throughput-scoring rate per conversion; conversion exchange rates.
- Turn structure: actions per turn; per-faction draw volume.

**First measurable question:** in White vs. Red, is there a set of parameter values (and a
Mandate target) where neither faction has a trivially dominant clock? Find that band before
adding a third faction.
