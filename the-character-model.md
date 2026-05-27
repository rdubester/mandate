# The Character Model (design v5 increment)

*Supersedes the implicit faction model in the brief AND the earlier "three-tier / declared
shard" framing of this doc's v4. Written mid-prototyping. Read alongside
`the-mandate-design-brief.md` and `running-the-wheel.md`. The prototype (`gui/`, TypeScript) is
the live engine; this doc is the design intent it implements.*

---

## The core model: one colour per character, colour-tagged verbs

The whole model is two sentences:

> **A character is one colour.** (White = W, Blue = U, Black = B, Red = R, Green = G.)
> **A verb is tagged with one or more colours; a character can do a verb iff its colour is
> among the verb's tags.**

That is the entire availability rule (`canDo` in `config.ts`). Everything the brief called
"shard," "signature," and "wing" is **not declared anywhere** — it *emerges* from how verbs are
tagged, and the tags follow the wheel's adjacency (order **W–U–B–R–G**):

- A **signature** verb is tagged with **one** colour — reachable by exactly one character.
  That's not a flag, it's just being the only holder of that colour. E.g. `allocate_supporters`
  {W} → only White; `strike` {R} → only Red.
- A **primitive** verb is tagged with **three adjacent** colours: a **home** colour plus its two
  wheel neighbours — i.e. the shard centred on the home and the two shards holding it as a wing.
  E.g. `enact_decree` (home W) → {G,W,U}; `rally_supporters` (home G) → {R,G,W}. **There are
  never 2-colour verbs.** With one primitive and one signature per colour, the whole verb
  vocabulary is capped at **10**.
- A character's **shard** is design vocabulary, not an engine concept: by construction it is
  just *its own colour + the two wheel neighbours* (the homes of the primitives it can reach).
  You never write a shard down anywhere — not in the data, not in the code; the engine knows
  nothing but colours-on-verbs and the membership check.

This is strictly simpler than the old three-tier scaffolding (scoring rule / signature / shared,
plus a declared shard) and produces the same structure. The brief's pentagon, wings, and "shard
IS the action menu" all fall out of *colour-tagged verbs + single-colour characters*.

### Why this shape (vs. declaring shards / signatures)
- **It's the rulebook's own vocabulary.** "This card is W and G" is a sentence a player reads
  off a card. "This character has a tier-2 signature slot" is engine jargon.
- **Authoring = adding rows.** Tag a verb's colours and it automatically appears for the right
  1–3 characters, *including* as a borrowable wing tool for the wheel-chase. No per-faction kit
  lists to maintain.
- **It can't drift.** The Rulebook renders the verb tags directly and derives "who can do this"
  the same way the engine gates moves. One source of truth.

### Scoring is still per-character
Each character still has a **scoring rule** (how it wins) — this is the one thing that isn't a
shared verb. It rides on the character's signature/centre verb:
- White — decrees *bite* (decoupled / over-time): White scores when others live under its rules.
- Blue — research *played* (welded / immediate).
- Red — strikes *land* (welded / immediate).
- Green — *procession*: cash units → Mandate (decoupled / over-time).
- Black — *circulation*: throughput skimmed (the third mode).

## "Running the wheel" = strategic lean, not gained access

Important clarification (it tripped up an earlier draft): **a character's reachable verb set is
static** — fixed by its colour and the verb tags. "Running the wheel into blue" does **not** mean
White gains blue verbs. It means White *leans harder into the wing-colour verbs it already has*,
depending on the matchup. Example: White can always `research` (once that's a shared W–U verb);
against Red it chooses to research *more* than it would against Black. Access is structural;
emphasis is strategic. (See `running-the-wheel.md`.)

## The full verb grid (5 primitives + 5 signatures — the vocabulary ceiling)

| home | primitive (home + wings) | reachable by | signature (1 colour) |
|---|---|---|---|
| W | `enact_decree` {G,W,U} | Green, White, Blue | `allocate_supporters` {W} |
| U | `draw/research` {W,U,B} | White, Blue, Black | `publish` / Archive {U} *(design)* |
| B | `procure/convert` (market) {U,B,R} | Blue, Black, Red | circulation *(TBD)* {B} |
| R | `muster_zealots` {B,R,G} | Black, Red, Green | `strike` {R} |
| G | `rally_supporters` {R,G,W} | Red, Green, White | `procession` {G} *(design)* |

Per-faction access mix (cards / units / market): White 2-1-0, Green 1-2-0, Blue 2-0-1,
Red 0-2-1 (cards only via the market — it can't draw), Black 1-1-1. White↔Green and Blue↔Red are
mirror images and Black is the balanced fixed point — the brief's reflection-through-Black
symmetry, reappearing at the access level.

### As currently built (White vs Red prototype)

| verb | home | colours | reaches today | role |
|---|---|---|---|---|
| `allocate_supporters` | W | W | White | White's signature — place up to K supporters on decrees as *support* (see below) |
| `enact_decree` | W | W, U, G | White | the W-home primitive — install a standing table rule |
| `deliberate` | U | W | White | the U-home draw primitive in embryo — draw from a shared deck (decree deck for now); widens to {W,U,B} and reskins as `research` when Blue lands |
| `rally_supporters` | G | G, R, W | White, Red | the G-home primitive → +supporters (Red has no supporter sink yet, so it simply doesn't bother) |
| `strike` | R | R | Red | Red's signature + scoring; spend a zealot, score on landing |
| `muster_zealots` | R | R, B, G | Red | the R-home primitive → +zealots |

In shard vocabulary: White plays as **GWU** and Red as **BRG** — but that's commentary on the
table above, not a thing the engine (or the data) represents anywhere. As more primitives are
built, each character's menu fills in toward its full shard automatically.

## Enact is shared; White's signature is `support` (one concept: scores AND defends)

A key correction over earlier drafts: **`enact_decree` is NOT White's signature.** Governance
has multiple colour-theories, so enacting decrees is **shared across {W,U,G}** — and the three
enactors have genuinely different *reasons* to play a decree (the thing that makes a shared verb
interesting rather than generic):

- **White** plays decrees to have a *platform to back* — it scores off them (by supporting).
- **Blue** plays decrees as a **tempo bet** — "I benefit if everyone is drawing faster *right
  now*" — a technocratic, governance-as-optimization read.
- **Green** plays decrees to **stabilise the board** — religious dogma that slows the game so
  Green has more time to assemble its win condition.

**White's signature is `allocate_supporters` — "support a decree":** it places up to **K** of its
supporters (from the loose stock grown by `rally_supporters`) onto decrees on the table. A
**supported** decree (≥1 supporter) does *two* things at once — this single concept replaces the
earlier separate "markers" (scoring) and "shields" (defense):

1. **Scores White** when it *bites* — i.e. when its output fires: a rider **complied with**
   (someone took the "may"), or an always-clause effect takes hold. Flat amount, *not*
   proportional to supporter count — White isn't populism; more base = more entrenched, not more
   points.
2. **Defends the decree** — a Red strike strips one supporter before it can remove the decree;
   the decree only falls when struck at 0 support. So count = durability.

One investment (where White puts its legitimacy) simultaneously turns scoring *on* and makes the
platform hard to tear down. *Detecting where the winds blow and committing your base to a
platform.* The K-per-action ("K placements in a trenchcoat") gives White's two actions/turn real
strategic weight without more actions; K itself is decree-modifiable (`alloc_delta`).

This is a textbook **positional mechanic** (the north star below): the decrees are one shared
pool, but White's support gives a subset a second valence only White sees and scores from. It
**decouples who plays decrees (anyone in W,U,G) from who scores off them (White, by supporting)**
— making decrees a true shared substrate, as the brief always wanted.

**Decrees pay no one for ownership.** The only Mandate a decree generates goes to whoever has
*supported* it — and support is keyed per player (`G.support[decreeId][seat]`), so a decree bites
for *every* seat with support on it. Only White can support today, so in practice that's White;
the per-player keying is what lets two White seats juggle support on the shared decrees later.
(Markers and shields were two parallel abstractions; collapsing them into one "support" concept
is a complexity cut — one verb, one state field, one token type. A future `support` variant could
allow free reallocation between decrees; current build places from stock, strips on strike.)

## The unit economy: two currencies from the two unit primitives

The unit economy is built from the two unit-minting primitives (one G-home, one R-home):

- **Community** → **supporters** (soft *stock*): numerous, granular — the
  electorate/congregation. White's legitimacy fuel, Green's crop. Minted by the **G-home**
  `rally_supporters` {R,G,W} — White courts citizens, Green grows the flock, Red does propaganda.
- **Authenticity** → **zealots** (hard *flow*): the faithful-in-arms, spent directly as
  ammunition for direct board actions (`strike`, later raids/conversions). Minted by the
  **R-home** `muster_zealots` {B,R,G} — Red drafts, Green's faithful take up arms, Black hires
  muscle.

**No soldiers.** An earlier `zealots → convert → soldiers → strike` chain was cut; the refine
step added nothing — zealots ARE the ammunition Red spends. Two unit nouns total, and that's the
ceiling; a third is the complexity alarm.

What falls out of the geometry (not assigned):

- **White is structurally non-militant.** White's colour is W; the zealot-making verb is tagged
  {B,R,G} — no W. White literally cannot reach it. Pacifism is a *gap in the verb tags*, not a
  rule on White's card. (Engine-verified: `canDo(WHITE,"muster_zealots") === false`.)
- **Blue never touches units at all** — U appears in neither unit primitive. The Institute's
  weightlessness is also just a gap in the tags.
- **Red and Green are the units pair** (the brief's primitive axis): both reach both unit
  primitives. The difference is the *sinks*, not the sources — Red holds the sink that turns
  flow into damage (`strike`); Green holds the sink that turns stock into points (`procession`)
  plus decree access. Access can overlap; what you can *do with it* is what distinguishes.
- **Sources can be wider than sinks.** Red can rally supporters today but has no supporter sink
  (no allocate, no procession), so it simply doesn't bother — a structural fact bots discover on
  their own, not a special case. Sinks, all of them signatures, are what stay scarce.
- **Each cardinal faction self-sources its core input; only Black depends on the table.** Black
  mints only muscle — it brokers (`convert`) existing resources. Its dependence on everyone is
  its identity (the fixed point), not a weakness. Black's exact conversion set is still open
  (build-last).

The zealot scarcity that the old "Red's currency is expensive" multiplier encoded survives for
free: zealots are dearer than supporters (conviction > broad assent), so a White decree taxing
Red's *actions* (+1 zealot per strike) bites a costlier resource than one taxing supporter
growth. (This is `martial_restraint` in the deck.)

## Decrees: the hook pipeline (mechanics)

A decree is a standing rule that hooks the verb pipeline: when ANY player takes a verb, each
installed decree may

- **match** the verb (+ an optional detail predicate, e.g. "when a *research* card is drawn" —
  hits Blue often, Green never, which is wheel-targeting via wording);
- apply an **ambient effect** to that verb (a tax/boon: `strike costs +1 zealot`,
  `rally yields +1`), with no choice;
- offer the acting player a **rider** — the "may" (e.g. "you *may* draw +1") — a genuine choice.

The decree's **`score`** field is what **White** earns *if it has supported that decree* (≥1
supporter on it) and the output bites (see "Enact is shared; White's signature is `support`"
above): on *compliance* (rider taken) or *always*. White's theory of victory is **legitimacy**:
it doesn't act for points, it skims Mandate when others act under the rules it chose to back.
(Engine-verified: unsupported `open_records` scores nothing on a rally; supported, it pays White
+1 each rally — see `gui/sim/engine.test.ts`.) The rider/compliance choice is modelled but
currently auto-accepted (greedy); smarter policies are a hook (`wantsRider` in `game.ts`).

The decree *pipeline shape* is stable; the *vocabulary* of triggers/effects is the small,
deliberately-extensible part. Growing the decree set = adding rows + occasionally a new trigger
word, never reshaping the pipeline.

## The access-asymmetry thesis (derived from the wheel)

Reading each character's eventual reachable colours as *which substrates it can touch* (this is
the brief's structure; it fills in as verbs are built):

| Character | Colour | Eventually touches | Can't touch |
|---|---|---|---|
| **Red** | R | zealots, supporters, exchange, research cards (via the market — no draw) | decrees, direct draw |
| **Blue** | U | decrees, research, exchange | units (supporters & zealots) |
| **Black** | B | research, exchange, zealots | decrees, supporters |
| **White** | W | supporters, decrees, research | exchange, zealots |
| **Green** | G | zealots, supporters, decrees | exchange, research |

Results that fall out of the geometry:

- **Only White and Green cannot reach the market (exchange)** — exactly the two slow-accretion
  builders, and the mirror pair across the black hinge ({W↔G, U↔R}).
- **The timing axis = distance from the market.** Closer to Black ⇒ faster/liquid (R, B, Black);
  farther ⇒ slower/inevitable (W, G). The brief's timing axis is literally market-distance.
- **Red is structurally White's antagonist** — its centre verb, `strike`, points at White's
  centre substrate, decrees — distinct from being Blue's cross-wheel enemy. Both true, different
  layers.
- **Blue never gets its hands dirty** — no unit substrate; pure information; compounds privately
  via the Archive while the research deck stays shared.

## North star: positional mechanics (author once, meaning flips by position)

**Prefer mechanics whose strategic meaning is positional — authored once, valenced by who holds
them** — over bespoke per-colour abilities. The exemplar is Black's `convert` (one verb, one
implementation) whose *direction of use* flips by colour:

- **Black** (broker): converts whichever way pays; neutral; skims the spread; profits from the
  war merely existing.
- **Blue** (via B-wing): only ever wants **zealots → supporters** — *disarm the table*. Blue
  fears Red more than White, and zealots arm Red. Flavour: *"drag people into the
  enlightenment."* The most-blue sentence imaginable, and the only direction Blue pushes it.
- **Red** (via B-wing): the opposite — **supporters → zealots** — *arm/radicalize the table*.

Three play-feels, zero extra code. This is the dream against the complexity budget: **richness
emergent from position, not authored per-faction.** Reach for this shape before authoring a
bespoke per-colour ability.

## Prediction the model makes (a simulator-check)

The wheel-chase "weaker to enemies than allies" implies **Blue prefers the table's unit-mass to
be supporters, not zealots** (zealots arm Red, whom Blue fears most). For that to be
load-bearing rather than narrative, the threat asymmetry must be real in the numbers:

- **White attacks Blue's *rate*** (granular-ramp counterplay = growth denial): edicts taxing
  card-draw, making the engine slower. Annoying, survivable.
- **Red attacks Blue's *structure*** (the Archive itself): steal, shuffle, muck in cards, raid.
  Far more disruptive — it corrupts the ordered state Blue's compounding depends on.

Same victim, two enemies, two *kinds* of harm (rate vs. structure) — a clean instance of the
brief's two-principle counterplay. **Simulator check (when Blue + Red exist):** does a Blue
policy that converts zealots→supporters outperform one that doesn't, *specifically when Red is
strong*? Yes ⇒ the geometry does real work. No ⇒ the threat asymmetry is mistuned (likely Red's
reach can't hit the Archive hard enough). This is what the bot-sweep harness (`npm run sim`) is
for.

## Build philosophy: symmetry broken only where play demands it

**Start fully symmetric in the shared (wing) verbs.** A shared verb is the *same verb* (same
effect, same numbers) for every character that holds it — authored once, tagged with colours,
auto-available. Prefer something quickly simple and playable over maximal richness. Only **break
symmetry later**, where actual play (interest or balance) demands a per-character flavoured
variant. This extends the brief's "symmetry broken exactly once, at black" discipline: earn each
break.

## Config + engine shape this implies

```
COLOUR[character]      = one of W U B R G
VERBS[]: { name, colours[], + effect fields (yields/spends/draws/scores) }
canDo(character, verb) = COLOUR[character] ∈ verb.colours      # the whole rule
DECREES{}: standing rules that hook the verb pipeline (trigger / effect / rider / score)
```

(Shard / wing / home never appear in the engine — they're vocabulary for talking about the
verb table, fully determined by the wheel order.)

**Authoring content = adding rows.** Tag a verb with colours → it appears for the right
characters, including as a borrowable wing tool.

## Complexity budget: data grows, engine stays flat

The implementation is a proxy for the rulebook — if the code balloons, the rules ballooned, and
rules that don't fit in a player's head are a failed board game. Two *different* sizes:

- **Data-table size = richness. Supposed to grow.** Every decree, verb, character is a row. A
  rulebook can carry a big card appendix and stay simple (MTG, Dominion, Root). More rows = more
  game. Fine.
- **Engine size = conceptual complexity. Must stay ~flat.** Every `if colour == X` / special
  case is a rule that *isn't* expressible as data. **Engine growth is the alarm.**

Rules of thumb:
- New content should almost always be a new **row**, occasionally a new **trigger/verb type**,
  rarely a new **engine concept**. Editing the engine to add a *single* card means that card is
  too bespoke for the rulebook.
- **Colour may appear as data the engine reads, never as a branch it hardcodes.** `colours:
  ["W","G"]` on a verb row = fine (the rulebook's own wheel vocabulary). `if colour == "red"` in
  engine logic = a character property that escaped into code; push it into the data row. (This is
  why `rally_supporters` and `muster_zealots` are *separate colour-tagged verbs*, not one
  `deploy` with a `unit` field.)
- This catches **rulebook** bloat, not **play** complexity — 20 simple cards can still combine
  into an unreadable board. The **simulator** (`npm run sim` — game-length / win-rate
  distributions) guards that. So: *code size guards rulebook size; the simulator guards play
  complexity; the test suite (`npm test`) guards against the model silently breaking.*

## Open / deliberately deferred
- Same-verb vs. flavoured-variant in the shared verbs — **decided: same to start**, break later.
- Whether the unit currencies get a spatial board (counters → zones → regions): **decide by
  sketching a concrete matchup**; let the abilities dictate the minimum unit model.
- Exact verb pool and the Venn overlaps beyond the two green edges (the U-, B-side edges are
  un-authored).
- Black's exact conversion set + throughput rate (build-last).
- **How White's supporters convert to winning.** Leaning: supporters are *legitimacy fuel* —
  spent to pass/sustain edicts; White still scores only via decrees (compliance). Avoid an
  independent supporter payoff that blurs into Green's procession.
- `deliberate` → shared W–U `research` reskin when Blue lands.

*(Balance figures — win-rates, the parameter bands tried, which knob moved what — are deliberately
kept out of this doc and out of `config.ts` comments: they change every tuning pass and rot fast.
Keep them in a separate balance-notes doc, read off `npm run sim`.)*
