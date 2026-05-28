# The Mandate — core model

*The mechanical source of truth: the model the engine implements and the architecture that
binds it. What the game is about — the thesis, the five colour philosophies, the ten edges,
the lean principle — lives in `philosophy.md`. Per-faction design notes live in `factions/`,
tuning evidence in `balance-notes.md`, and the original brief is archived at
`history/the-mandate-design-brief.md`. The prototype (`gui/`, TypeScript) is the live engine;
this doc is the design intent it implements.*

---

## Locked architecture

- **Two strictly separated layers.** Primitives (cards, units, conversions) vs the victory
  layer: the **Mandate**, a single shared first-past-the-post track (target in `config.ts`).
- **The pentagon.** Five factions on the colour wheel **W–U–B–R–G** (Assembly, Institute,
  Ledger, Vanguard, Orthodoxy); each has two allied neighbours and two enemies across the
  wheel. Substrates: cards = {W decrees, U research}; units = {R zealots, G supporters}.
  Black mints no substrate of its own — its home verb is the exchange.
- **Symmetry is broken exactly once, at Black.** No second "special" faction. Black's menu is
  built around conversion; it is the fixed point of the {W↔G, U↔R} reflection — the formal
  licence for its unique circulation scoring.
- **One turn skeleton for everyone.** Draw step (volume varies by faction), then 2 actions,
  then pass. No per-faction turn phases — liveliness comes from decrees firing passively as
  others act.
- **Scoring rides the centre, and centre perks are never lent out.** White: decree bites.
  Blue: publish. Red: strikes landed. Green: procession. Black: circulation. Shared primitives
  and card-objects circulate; scoring mechanics don't. (How the five scoring shapes relate —
  action vs accumulated state, accelerating vs linear — is the 2×2 in `philosophy.md`.)
- **Counterplay is two distinct principles — never unify them.** *Granularity*: ramp factions
  (U, G) hold many small resources, so ±1 barely registers — beat them with growth denial
  (attack the rate, not the stock); interaction factions (W, R) rest on few chunky pieces —
  beat them with stock attrition. And *the wheel*: designed enemy relationships (the enemy
  edges in `philosophy.md`).
- **Build order.** Spine (Mandate track + turn loop) → White vs Red → Green → Blue → Black
  last (its kit converts the others' primitives, so it's untestable in isolation).
- **Engineering invariants.** Game state is a plain serializable object; the turn loop is a
  reducer (boardgame.io moves) — deterministic, replayable, time-travelable; rules lean on
  data in `config.ts` and every number is named config; everything is observable (`G.log`); a
  headless harness (`npm run sim`, `npm test`) drives the same engine.

## The core model: one colour per character, colour-tagged verbs

The whole model is two sentences:

> **A character is one colour.** (White = W, Blue = U, Black = B, Red = R, Green = G.)
> **A verb is tagged with one or more colours; a character can do a verb iff its colour is
> among the verb's tags.**

That is the entire availability rule (`canDo` in `config.ts`). Shard, signature, and wing are
**not declared anywhere** — they *emerge* from how verbs are tagged, and the tags follow the
wheel's adjacency (order **W–U–B–R–G**):

- A **signature** verb is tagged with **one** colour — reachable by exactly one character.
  E.g. `allocate_supporters` {W} → only White; `strike` {R} → only Red.
- A **primitive** verb is tagged with **three adjacent** colours: a **home** colour plus its
  two wheel neighbours. E.g. `enact_decree` (home W) → {G,W,U}; `rally_supporters` (home G) →
  {R,G,W}. **There are never 2-colour verbs.** With one primitive and one signature per
  colour, the whole verb vocabulary is capped at **10**.
- A character's **shard** is design vocabulary, not an engine concept: its own colour plus the
  two wheel neighbours — the homes of the primitives it can reach. It is never written down in
  data or code; the engine knows nothing but colours-on-verbs and the membership check.

Why this shape:

- **It's the rulebook's own vocabulary.** "This card is W and G" is a sentence a player reads
  off a card.
- **Authoring = adding rows.** Tag a verb's colours and it appears for the right 1–3
  characters, *including* as a borrowable wing tool for off-archetype leans.
- **It can't drift.** The Rulebook renders the verb tags directly and derives "who can do
  this" the same way the engine gates moves. One source of truth.

Each character also has a **scoring rule** (how it wins) — the one thing that isn't a shared
verb. It rides the character's signature/centre verb and is never lent out.

## The verb grid (5 primitives + 5 signatures — the vocabulary ceiling)

| home | primitive (home + wings) | reachable by | signature (1 colour) |
|---|---|---|---|
| W | `enact_decree` {G,W,U} | Green, White, Blue | `allocate_supporters` {W} |
| U | `draw/research` {W,U,B} | White, Blue, Black | `publish` {U} *(design)* |
| B | `procure/convert` (the exchange) {U,B,R} | Blue, Black, Red | circulation *(TBD)* {B} |
| R | `muster_zealots` {B,R,G} | Black, Red, Green | `strike` {R} |
| G | `rally_supporters` {R,G,W} | Red, Green, White | `procession` {G} *(design)* |

Per-faction access mix (cards / units / exchange): White 2-1-0, Green 1-2-0, Blue 2-0-1,
Red 0-2-1 (cards only via the exchange — it can't draw), Black 1-1-1. White↔Green and
Blue↔Red are mirror images and Black is the balanced fixed point — the {W↔G, U↔R} reflection
reappearing at the access level. Two further structural facts (allies share their two home
primitives; enemies share exactly one — the primitive homed at their mutual ally) are read
philosophically in the edges section of `philosophy.md`.

The grid is the design target; which rows exist at any moment lives in `config.ts` and the
in-app Rulebook, not here.

## Strategic lean, not gained access

A character's reachable verb set is **static** — fixed by its colour and the verb tags.
"Leaning blue" never means gaining blue verbs; it means putting more of your two actions into
the wing verbs you already hold, as the matchup demands. Access is structural; emphasis is
strategic. When to lean which wing — escape vs confront — is the lean principle in
`philosophy.md`.

## Decrees and support (the White scoring chain)

**Enacting is shared; supporting is White's alone.** Governance has multiple colour-theories,
so `enact_decree` is a primitive {G,W,U}, and the three enactors have genuinely different
reasons to play one: White wants a *platform to back* (it scores by supporting); Blue plays
decrees as a tempo bet (it benefits if everyone is moving faster right now); Green plays
decrees to stabilise the board and buy time. Decrees live on the shared table and **pay no one
for ownership**.

**A decree is a standing rule hooking the verb pipeline.** When any player takes a verb, each
installed decree may:

- **match** the verb (plus an optional detail predicate — wording is how decrees target
  colours without naming factions);
- apply an **ambient effect** to that verb (a tax or boon), with no choice;
- offer the acting player a **rider** — a "may" clause, a genuine accept/decline choice.

The pipeline shape is stable; the vocabulary of triggers and effects is the small,
deliberately-extensible part. Growing the decree set = adding rows, occasionally a new trigger
word, never reshaping the pipeline.

**`allocate_supporters` {W} — "support a decree."** White places up to K supporters per action
(`supporter_allocate_k`; K itself is decree-modifiable) from its loose stock onto decrees on
the table, up to a per-decree cap (`supporter_cap_per_decree`). A **supported** decree (≥1
supporter) does two things at once:

1. **Scores its supporters when it bites** — when its rider is complied with or its
   always-clause fires (the decree row's `score` field). The amount is flat per bite, *not*
   proportional to supporter count: more base means more entrenched, not more points —
   mass-proportional scoring is Green's procession, not White's.
2. **Defends the decree** — a strike strips one supporter before it can remove the decree;
   the decree only falls when struck at zero support. Count = durability.

One investment turns scoring on and makes the platform hard to tear down. Any decree row may
carry a `score` field — a pure tax with no score is worthless to support. A bite may be
triggered by any player's action, including the supporter's own: the legitimacy gate is
**survival**, not whose hand pulled the trigger — enacting and then backing a decree consumes
White's whole turn, so a decree only ever pays after living through everyone else's, and White
profits exactly when the table can't, or won't, tear its order down.

Support is keyed per player (`G.support[decreeId][seat]`), so a decree bites for every seat
with support on it — the hook for a future White-vs-White support-juggling metagame, and the
reason support is state on the decree rather than a property of its owner. (A future variant
could allow free reallocation of support between decrees; the current rule places from stock
and strips on strike.)

## The unit economy: two currencies

Two unit nouns, minted by the two unit primitives — and two is the ceiling; a third unit noun
is the complexity alarm.

- **Supporters** (soft *stock*): numerous, granular — the electorate, the congregation.
  Strength in numbers. White's legitimacy fuel, Green's crop. Minted by the G-home
  `rally_supporters` {R,G,W} — White courts citizens, Green grows the flock, Red does
  propaganda.
- **Zealots** (hard *flow*): the faithful-in-arms, spent as ammunition for direct board
  actions (`strike`, later raids/conversions). Strong individuals. Minted by the R-home
  `muster_zealots` {B,R,G} — Red drafts, Green's faithful take up arms, Black hires muscle.

Zealots are priced dearer than supporters — a strong individual costs more than one more voice
in the crowd — so a decree taxing zealot-spending bites a costlier resource than one taxing
supporter growth.

What falls out of the geometry (not assigned):

- **White is structurally non-militant.** The zealot verb is tagged {B,R,G} — no W. Pacifism
  is a gap in the verb tags, not a rule on White's card.
- **Blue mints and holds no units** — U appears in neither unit primitive. Its play may touch
  the unit economy through the exchange (e.g. converting zealots down into supporters), but it
  never controls units directly; the exchange verb's exact shape is open (see below).
- **Red and Green are the units pair**: both reach both unit primitives. The difference is the
  *sinks* — Red holds the sink that turns flow into damage (`strike`); Green holds the sink
  that turns stock into points (`procession`), plus decree access. Access can overlap; what
  you can do with it is what distinguishes.
- **Sources can be wider than sinks.** A faction with access to a mint but no sink for its
  output simply doesn't bother — a structural fact bots discover on their own, not a special
  case. Sinks — all of them signatures — are what stay scarce.
- **Each cardinal faction self-sources its core input; only Black depends on the table.**
  Black brokers existing resources; its dependence on everyone is its identity, not a
  weakness.

## The access-asymmetry table

Reading each character's eventual reachable colours as which substrates it can touch (this
fills in as verbs are built):

| Character | Colour | Eventually touches | Can't touch |
|---|---|---|---|
| **White** | W | supporters, decrees, research | exchange, zealots |
| **Blue** | U | decrees, research, exchange | units (mint/hold) |
| **Black** | B | research, exchange, zealots | decrees, supporters |
| **Red** | R | zealots, supporters, exchange, research cards (via the exchange — no draw) | decrees, direct draw |
| **Green** | G | zealots, supporters, decrees | exchange, research |

Only White and Green cannot reach the exchange — exactly the two slow-accretion builders, and
the mirror pair across the Black hinge.

## Design doctrine

**North star: positional mechanics.** Prefer mechanics whose strategic meaning is positional —
authored once, valenced by who holds them — over bespoke per-colour abilities. The exemplar is
the exchange's `convert` (one verb, one implementation) whose direction of use flips by
colour: Black converts whichever way pays (the broker skims the spread); Blue only ever wants
zealots → supporters (cooling the table down, without ever holding the units itself); Red
wants the reverse (arm/radicalise the table). Three play-feels, zero extra code. Reach for this shape before
authoring a bespoke per-colour ability. (The verb's exact operationalisation — whose
resources, held where, at what cost — is the highest-priority open design item.)

**Symmetry broken only where play demands it.** A shared verb starts as the *same verb* (same
effect, same numbers) for every character that holds it — authored once, tagged with colours.
Break symmetry into per-character flavoured variants only where actual play (interest or
balance) demands it. Earn each break.

**Complexity budget: data grows, engine stays flat.** The implementation is a proxy for the
rulebook — if the code balloons, the rules ballooned, and rules that don't fit in a player's
head are a failed board game.

- **Data-table size = richness.** Every decree, verb, character is a row; a rulebook can carry
  a big card appendix and stay simple. Supposed to grow.
- **Engine size = conceptual complexity.** Every special case is a rule that isn't expressible
  as data. Must stay ~flat; engine growth is the alarm.
- New content should almost always be a new **row**, occasionally a new **trigger/verb type**,
  rarely a new **engine concept**. Editing the engine to add a single card means that card is
  too bespoke for the rulebook.
- **Colour may appear as data the engine reads, never as a branch it hardcodes.** `colours:
  ["W","G"]` on a verb row is the rulebook's own vocabulary; `if colour == "red"` in engine
  logic is a character property that escaped into code — push it into the data row. (This is
  why `rally_supporters` and `muster_zealots` are separate colour-tagged verbs, not one
  `deploy` with a `unit` field.)
- This catches **rulebook** bloat, not **play** complexity. The simulator (`npm run sim`)
  guards play complexity; the test suite (`npm test`) guards the model itself.

```
COLOUR[character]      = one of W U B R G
VERBS[]: { name, colours[], + effect fields (yields/spends/draws/scores) }
canDo(character, verb) = COLOUR[character] ∈ verb.colours      # the whole rule
DECREES{}: standing rules that hook the verb pipeline (trigger / effect / rider / score)
```

## Open / deliberately deferred

- **`procure/convert` (the exchange):** whose resources it converts, held where, at what
  cost — the highest-priority unresolved verb (it underpins Black's whole kit, Blue's
  zealot-cooling play, and Red's card access).
- **Player count:** five is the design north star; smaller tables are tuning instruments. How
  much standalone tuning sub-5 counts deserve is open.
- **Game length:** the prototype targets short games for search/iteration tractability — an
  accepted compromise (fast clocks tuned down, slow clocks up, at some cost in strategic
  richness). Revisit when the bots can search longer horizons; the eventual target arc is
  open.
- **Black:** exact conversion set, circulation rate, and what it refuses (see
  `philosophy.md`).
- **Green:** procession shape and pacing (Green compounds late but gently — see the
  score-curve targets in `philosophy.md`); sanctuary rules (likely cut).
- **Blue:** publish-action shape, Archive/commons card list, and its counterplay surface (how
  enemy pressure reaches the engine at all).
- **Red:** combat-resolution detail beyond strip-and-remove.
- **White:** how supporters relate to winning beyond legitimacy fuel — avoid an independent
  supporter payoff that blurs into Green's procession.
- **Shared draw:** today's `deliberate` reskins to the shared W–U `research` when Blue lands.
- **Spatial board:** whether the unit currencies ever get zones/regions — decide by sketching
  a concrete matchup; let the abilities dictate the minimum unit model.
- **Cooperation mechanisms and full-table politics:** see `philosophy.md`, Open directions.
