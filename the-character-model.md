# The Character Model (design v4 increment)

*Supersedes the implicit faction model in the prototype. Written mid-prototyping after
the realization that the build should iterate on the **content axis** (a few abilities per
colour, any matchup playable) rather than the **faction axis** (build each colour to
completion in turn). Read alongside `the-mandate-design-brief.md` and `running-the-wheel.md`.*

---

## The core data model

Every player has one **Character** card (Field Marshal, Archivist, Prime Minister, … — names
TBD). It has **three tiers**, each answering a different question:

1. **Scoring rule — *how you win.*** Unique per character, never shared, never moves. This is
   the brief's centre-colour scoring perk:
   - White / Prime Minister — decrees *bite* (decoupled).
   - Blue / Archivist — research *played* (welded).
   - Red / Field Marshal — strikes *land* (welded).
   - Green / (church) — *procession*: cash units → Mandate (decoupled).
   - Black / Ledger — *circulation*: throughput skimmed (the third mode).

2. **Signature verb — *the one thing only you can do.*** Unique per character,
   **non-shareable even via the wheel.** This is the privileged slot — the substrate you own
   outright. E.g. only the Archivist *banks* a card into the Archive; only the Prime Minister
   *enacts* a decree onto the table. (Note: no one "mints soldiers" — soldiers don't exist; see
   *No soldiers* below.)

3. **Shared verbs — *the wheel.*** The two wing colours' worth of actions, drawn from a
   **common pool**. These overlap with neighbours and form a Venn ring (White∩Blue share some,
   White∩Green others, …). Leaning a wing = leaning into the tier-3 verbs you share with that
   neighbour. **The wheel IS the adjacency structure of this Venn diagram.**

A player's available actions = `signature_verb` ∪ `{verbs whose colours ⊆ this character's shard}`.

## Why the three tiers matter

- **Tier 1 + Tier 2 = the asymmetry** (Root / Vast / Coup-style — every character plays
  differently).
- **Tier 3 = the shared language** that makes the asymmetry legible and chase-able (you can
  read an opponent because half their verbs are verbs you also hold).

### No soldiers — two unit currencies, not three
Earlier drafts had `zealots → convert → soldiers → strike`. **Soldiers are cut** — the refine
step added nothing; zealots ARE the ammunition Red spends directly. The unit economy is two
nouns:
- **Supporters** (soft *stock*, G–W edge) — White's legitimacy fuel; spent to pass/sustain edicts.
- **Zealots** (hard *flow*, G–R edge) — Red's ammunition; spent on direct board actions (strike/reach).

The old "Red's currency is expensive" multiplier survives without the extra noun: zealots are
scarcer/dearer than supporters (conviction > broad assent), so a White decree taxing Red's
*actions* (+1 zealot) bites a costlier resource than one taxing supporter growth.

**Black still mints nothing** — it brokers existing resources. With soldiers gone, Black's
`convert` brokers between the two green-edge currencies (supporters ↔ zealots) and likely skims
edicts↔actions / resource↔Mandate. Exact set still open (build-last).

## Edges: each wheel edge is a commonality, and edges produce resources

The wheel isn't just adjacency — **each edge between two colours names a shared concept**, and
the unit economy is built from the two green edges. This is the layer below shards.

- **G–W = community** (the broad, soft collective): produces **supporters** — soft *stock*,
  numerous, granular, the electorate/congregation. White and Green both work this edge. (White
  legitimizes them; Green grows them.)
- **G–R = authenticity** (conviction, grassroots militancy): produces **zealots** — hard
  *flow*, the faithful-in-arms, spent directly as ammunition for Red's direct actions. Green
  and Red both work this edge.

Consequences that fall out of the geometry (not assigned):

- **White is structurally non-militant.** White's shard is GWU — no R — so White can touch the
  G–W community edge but *never* the G–R authenticity edge. The democrat rallies the electorate
  and cannot raise an army. White's pacifism is a *hole in its shard*, not a rule on its card.
- **Green is the dual-natured spring of the whole unit economy.** Green's shard is RGW — it has
  both W and R — so Green is the *only* faction touching *both* green edges. It produces both
  soft civic supporters (G–W) and militant zealots (G–R): the church commands both the
  congregation and the faithful-in-arms. Every unit on the table traces upstream to Green —
  classic green = the token/swarm spring that feeds everyone downstream.
- **White and Red share Green as common upstream but draw opposite outputs.** White pulls the
  soft side (supporters), Red pulls the hard side (zealots). Enemies across the wheel, both
  dependent on the same neighbour for different things.
- **Each cardinal faction must source its own core input; only Black may depend on the table.**
  Self-sufficiency is required of W/U/R/G; Black's *dependence on everyone* is its identity
  (the fixed point), not a weakness. So Red must have a native path to zealots (G–R), which it
  does via its R+G shard — it does NOT rally community (G–W) because it has no W.

### The unit economy is two nouns — and that's the ceiling
supporters (soft stock, G–W, fuels edicts) · zealots (hard flow, G–R, fuels direct actions).
Each is the output of a distinct edge. A *third* unit noun is the complexity alarm (see the
data-grows / engine-stays-flat rule below). Verbs, not a unit field, carry the distinction:
`rally_supporters` (G–W) and `muster_zealots` (G–R) / `strike` are **different verbs**, each
colour-tagged — never one parameterized "deploy."

## Substrates (shared table infrastructure, NOT colour-owned)

Colour is **not a tag on a card.** A card lives in a deck; there are only two card decks. The
substrates are shared objects on the table; characters have differently-shaped *access* to them
via their verbs:

| Substrate | Owned/minted by (signature) | Others' access (via shared/borrowed verbs) |
|---|---|---|
| **Decree-state** (ambient table rules) | Prime Minister enacts | others can disrupt/remove |
| **Research pool + Archive** | Archivist *banks*/recycles (Archive) | anyone granted access may *draw* from the pool; Red "raids" the Archive, Black "espionage" redirects a draw |
| **Supporter-stock** (soft, G–W) | grown via `rally_supporters` (White, Green) | Black brokers; fuels White's edicts |
| **Zealot-flow** (hard, G–R) | mustered via `muster_zealots` (Red, Green) | Black brokers; spent by Red's direct actions |
| **Exchange** | Ledger (Black) — the set of legal conversions between the other four | Blue & Red touch it; White & Green cannot |

**Draw = open to all (with access); bank/reuse = Archivist only.** The research deck and the
Archive are two distinct objects: the deck is a shared draw pile; the Archive is Blue's private
recycle/compounding loop.

## The access-asymmetry thesis (derived from the wheel, not assigned)

Read each shard as *which substrates it can touch*:

| Faction | Shard | Touches | Can't touch |
|---|---|---|---|
| **Red** | BRG | exchange, zealots, research(via B) | decrees, supporters |
| **Blue** | WUB | decrees, research, exchange | units (supporters & zealots) |
| **Black** | UBR | research, exchange, brokers both unit currencies | decrees |
| **White** | GWU | supporters, decrees, research | exchange, zealots |
| **Green** | RGW | zealots, supporters, decrees | exchange, research |

Key results that fall out of the geometry:

- **Only White and Green cannot reach the market (exchange)** — and they are exactly the two
  slow-accretion / inevitability builders. The brief's reflection-through-black symmetry
  ({W↔G, U↔R}, black fixed) means the two factions locked out of the market are the mirror pair
  across the hinge.
- **The timing axis = distance from the market.** Closer to Black ⇒ faster/liquid (R, B,
  Black). Farther ⇒ slower/inevitable (W, G). The brief's timing axis isn't a label; it's
  literally market-distance.
- **Red is structurally White's antagonist** (its centre verb, strike, points at White's centre
  substrate, decrees), distinct from being Blue's cross-wheel enemy in the 2×2. Both true,
  different layers.
- **Red is the maximalist** ("watch me do anything") — touches everything but decrees.
- **Blue never gets its hands dirty** — no unit substrate at all; pure information; compounds
  privately via the Archive while the deck stays shared.

## North star: positional mechanics (author once, meaning flips by position)

**Prefer mechanics whose strategic meaning is positional — authored once, valenced by who holds
them.** The exemplar is Black's `convert` (one verb, one implementation), whose *direction of
use* flips by colour because each colour fears a different enemy and the two unit currencies
feed different enemies:

- **Black** (centre broker): converts whichever way pays; neutral; skims the spread; profits
  from the war merely existing.
- **Blue** (borrows it via B-wing): only ever wants **zealots → supporters** — *disarm the
  table*. Blue fears Red more than White (see below), and zealots are Red's ammunition.
  Flavour: *"drag people into the enlightenment"* — launder fervent true-believers into a soft,
  pacified, educated populace. The most-blue sentence imaginable, and it's the *only* direction
  Blue would push the converter.
- **Red** (borrows it via B-wing): wants the opposite — **supporters → zealots** — *arm the
  table*; conscript/radicalize the soft populace into the cause.

Three distinct play-feels from one mechanic, zero extra code. This is the dream against the
complexity heuristic: **richness emergent from position, not authored per-faction.** Reach for
this shape before authoring a bespoke per-colour ability.

## Prediction the model makes (a simulator-check, not just a story)

The wheel-chase "weaker to enemies than allies" implies **Blue prefers the table's unit-mass to
be supporters, not zealots** — because zealots arm Red, and Blue fears Red more than White. For
this to be a *load-bearing* property rather than a nice narrative, the threat asymmetry must be
real in the numbers:

- **White attacks Blue's *rate*** (granular-ramp counterplay = growth denial): edicts that tax
  card-draw / make the engine slower/painful. Annoying, survivable.
- **Red attacks Blue's *structure*** (the Archive itself): steal, shuffle, muck extra cards in,
  raid. Far more disruptive — it corrupts the ordered state Blue's compounding depends on.

Same victim, two enemies, two different *kinds* of harm (rate vs. structure) — a clean instance
of the brief's two-principle counterplay. **Simulator check (when Blue + Red exist):** does a
Blue policy that converts zealots→supporters outperform one that doesn't, *specifically when Red
is strong*? Yes ⇒ the geometry is doing real work. No ⇒ we've mis-tuned the threat asymmetry
(likely: Red's reach can't actually hit the Archive hard enough). This is what the bot-sweep
harness is for.

## Build philosophy: symmetry broken only where play demands it

**Start fully symmetric in tier 3.** A shared verb is the *same verb* (same effect, same
numbers) for every character that holds it — authored once, tagged with colours, auto-available
to the right characters. Prefer something quickly simple and playable over maximal richness.

Only **break symmetry later**, where actual play (interest or balance) demands it — e.g.
per-character flavoured variants of a shared verb. This extends the brief's "symmetry broken
exactly once, at black" discipline to tier-3: earn each break, don't sprinkle them.

## Config shape this implies (the content-axis firehose)

```
CHARACTERS:  id, name, scoring_rule, signature_verb, wing_colours[2]
VERBS:       id, colours[]      # which shards include it — drives the Venn ring
SUBSTRATES:  decree-state, research-pool+archive, supporter-stock (G–W), zealot-flow (G–R), exchange
```

Available actions = signature ∪ {verbs whose colours ⊆ shard}. **Authoring content = adding
rows.** Tag a verb with colours and it automatically appears for the right 1–3 characters,
including as a borrowable wing tool for the wheel-chase.

### Refactor note
The current `engine.py` hardcodes `if faction == "white"` branches that mix **tier-2 logic**
(signature verbs) with **tier-3 logic** (shared actions). The refactor is precisely:
**split tier-2 from tier-3**, and make tier-3 a colour-tagged verb pool. (`engine2.py` +
`verbs.py` + `decrees.py` are this refactor in progress; they still carry `soldiers` /
`deploy_soldier` and the old decree set, which the model above supersedes.)

## Complexity budget: data grows, engine stays flat

The implementation is a proxy for the rulebook — if the code balloons, the rules ballooned, and
rules that don't fit in a player's head are a failed board game. Two *different* sizes, meaning
opposite things:

- **Data-table size = richness. Supposed to grow.** Every decree, verb, character is a row. A
  rulebook can carry a big card appendix and stay simple (MTG, Dominion, Root): learn the system
  once, read cards as needed. More rows = more game. Fine.
- **Engine size = conceptual complexity. Must stay ~flat.** Every `if colour == X` / special
  case is a rule that *isn't* expressible as data — a rulebook sentence that doesn't follow from
  the system. **Engine growth is the alarm.**

Rules of thumb:
- A new piece of content should almost always be a new **row**, occasionally a new **trigger /
  verb type**, and only rarely a new **engine concept**. Editing `decrees.py`/`engine` to add a
  *single* card means that card is too bespoke for the rulebook.
- **Colour may appear as data the engine reads, never as a branch the engine hardcodes.**
  `colours: ["R","B"]` on a verb row = fine (it's the rulebook's own "wheel" vocabulary).
  `if colour == "red"` in engine logic = a character property that escaped into code; push it
  down into the data row. (This is why `rally_supporters` and `muster_zealots` are *separate
  colour-tagged verbs*, not one `deploy` with a `unit` field.)
- This heuristic catches **rulebook** bloat, not **play** complexity — 20 simple cards can still
  combine into an unreadable board. The **simulator** (game-length / win-rate distributions)
  guards that. So: *code size guards rulebook size; the simulator guards play complexity.*

## Open / deliberately deferred
- Same-verb vs. flavoured-variant in tier 3 — **decided: same to start**, break later if play
  demands.
- Whether the unit currencies (supporters, zealots) get a spatial board (Coup-ish
  counters+states → zones → Root-ish regions): **decide by sketching a concrete matchup**, let
  the abilities dictate the minimum unit model.
- Exact tier-3 verb pool and the Venn overlaps.
- Black's exact conversion set + throughput rate (still open from the brief).
- **How White's supporters convert to winning.** Leaning toward: supporters are *legitimacy
  fuel* — spent to pass/sustain edicts; White still scores only via decrees biting (compliance).
  Avoid giving supporters an independent payoff that blurs into Green's procession.
- Tier-1 scoring names still say "research played / strikes land" etc.; reconcile with the
  edict/zealot vocabulary when wiring.
