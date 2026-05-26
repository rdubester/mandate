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

- A verb tagged with **one** colour is reachable by exactly one character. *That is what
  "signature" means* — it's not a flag, it's just being the only holder of that colour. E.g.
  `enact_decree` {W} → only White; `strike` {R} → only Red.
- A verb tagged with **two adjacent** colours is a shared **wing/edge** verb, reachable by both
  neighbours on the wheel. E.g. `rally_supporters` {W,G} → White and Green; `muster_zealots`
  {R,G} → Red and Green.
- A character's **shard** is then just *the set of colours appearing across the verbs it can
  reach* (`shardOf`). It comes out as centre + two adjacent wings, for free, because the tags
  follow adjacency. You never write a shard down; it's a consequence of the verb table.

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

## The verbs, as currently built (White vs Red prototype)

| verb | colours | reaches | role |
|---|---|---|---|
| `mark` | W | White | White's signature — place a platform marker on a decree (see below) |
| `enact_decree` | W, U, G | White (Blue, Green later) | shared — install a standing table rule |
| `deliberate` | W | White | draw 1 from own deck (decree deck for now) |
| `rally_supporters` | W, G | White, Green | G–W community edge → +supporters |
| `strike` | R | Red | Red's signature + scoring; spend a zealot, score on landing |
| `muster_zealots` | R, G | Red, Green | G–R authenticity edge → +zealots |

`deliberate` is a placeholder name: it's "draw from your own deck," White-only for now. When
**Blue** arrives it likely becomes a shared **W–U** verb ("research" — digs the research pool),
and gets reskinned.

Emergent shards today: White **WUG** (it reaches `enact_decree` {W,U,G}, so U lights up even
though no Blue character exists yet), Red **RG**. B is still dark (no B-tagged verb built). The
shards fill in automatically as verbs are added — they are nothing but the footprint of the
verb tags.

## Enact is shared; White's real signature is `mark`

A key correction over earlier drafts: **`enact_decree` is NOT White's signature.** Governance
has multiple colour-theories, so enacting decrees is **shared across {W,U,G}** — and the three
enactors have genuinely different *reasons* to play a decree (the thing that makes a shared verb
interesting rather than generic):

- **White** plays decrees to have a *platform to back* — it scores off them (via `mark`).
- **Blue** plays decrees as a **tempo bet** — "I benefit if everyone is drawing faster *right
  now*" — a technocratic, governance-as-optimization read.
- **Green** plays decrees to **stabilise the board** — religious dogma that slows the game so
  Green has more time to assemble its win condition.

**White's signature is `mark`:** it places a fixed pool of white tokens (`white.markers`,
currently 3) onto decrees on the table — *detecting where the political winds blow and adopting a
platform to defend.* **White scores only when a *marked* decree "bites."** A decree bites when
its *output fires*: a rider is **complied with** (someone took the "may"), or an always-clause
effect takes hold. If the player declines the rider, nothing fired, so no bite. A token returns
to the pool when its decree leaves play (so destroying a marked decree denies White the score and
frees White's token — which creates real incentives, e.g. White protecting its marked decrees, or
even wanting to re-stake as the board shifts).

This is a textbook **positional mechanic** (the north star below): the decrees are one shared
pool, but White's marking gives a subset a second valence only White sees and scores from. It
also cleanly **decouples who plays decrees (anyone in W,U,G) from who scores off them (White, by
marking)** — making decrees a true shared substrate, as the brief always wanted.

**Decrees pay no one for ownership.** The only Mandate a decree generates is White's, via marks.
(Two framings of the `mark` verb are both interesting and the engine should support both: (a)
*commitment* — a token sticks to its decree until the decree is destroyed; (b) *reallocation* —
the verb moves tokens freely from pool or among decrees. Current build is the simpler (a)-ish
version: place from pool, returns on destruction. Revisit when it matters.)

## The unit economy: two currencies from the two green edges

The wheel isn't just adjacency — **each edge names a shared concept**, and the unit economy is
built from the two green edges:

- **G–W = community** → **supporters** (soft *stock*): numerous, granular — the
  electorate/congregation. White's legitimacy fuel, spent to pass/sustain edicts. Worked by the
  two characters touching the edge: White (W) and Green (G), via `rally_supporters` {W,G}.
- **G–R = authenticity** → **zealots** (hard *flow*): the faithful-in-arms, spent directly as
  ammunition for direct board actions (`strike`). Worked by Red (R) and Green (G), via
  `muster_zealots` {R,G}.

**No soldiers.** An earlier `zealots → convert → soldiers → strike` chain was cut; the refine
step added nothing — zealots ARE the ammunition Red spends. Two unit nouns total, and that's the
ceiling; a third is the complexity alarm.

What falls out of the geometry (not assigned):

- **White is structurally non-militant.** White's colour is W; the only zealot-making verb,
  `muster_zealots`, is tagged {R,G} — no W. White literally cannot reach it. Pacifism is a *gap
  in the verb tags*, not a rule on White's card. (Engine-verified: `canDo(WHITE,"muster_zealots")
  === false`.)
- **Green is the dual-natured spring.** Green is G; G sits on *both* `rally_supporters` {W,G}
  and `muster_zealots` {R,G}, so Green alone makes *both* currencies — the church commands both
  the congregation and the faithful-in-arms. Every unit on the table traces upstream to Green.
  (Engine-verified: a G character reaches both verbs.)
- **White and Red share Green as upstream but draw opposite outputs** — White the soft side
  (supporters), Red the hard side (zealots). Enemies across the wheel, both leaning on the same
  neighbour for different things.
- **Each cardinal faction self-sources its core input; only Black depends on the table.** Black
  mints nothing — it brokers (`convert`) existing resources. Its dependence on everyone is its
  identity (the fixed point), not a weakness. Black's exact conversion set is still open
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

The decree's **`score`** field is what **White** earns *if it has marked that decree* and the
output bites (see "Enact is shared; White's real signature is `mark`" above): on *compliance*
(rider taken) or *always*. White's theory of victory is **legitimacy**: it doesn't act for
points, it skims Mandate when others act under the rules it chose to back. (Engine-verified:
unmarked `open_records` scores nothing on a rally; marked, it pays White +1 each rally — see
`gui/sim/engine.test.ts`.) The rider/compliance choice is modelled but currently auto-accepted
(greedy); smarter policies are a hook (`wantsRider` in `game.ts`).

The decree *pipeline shape* is stable; the *vocabulary* of triggers/effects is the small,
deliberately-extensible part. Growing the decree set = adding rows + occasionally a new trigger
word, never reshaping the pipeline.

## The access-asymmetry thesis (derived from the wheel)

Reading each character's eventual reachable colours as *which substrates it can touch* (this is
the brief's structure; it fills in as verbs are built):

| Character | Colour | Eventually touches | Can't touch |
|---|---|---|---|
| **Red** | R | exchange, zealots, research (via B-wing) | decrees, supporters |
| **Blue** | U | decrees, research, exchange | units (supporters & zealots) |
| **Black** | B | research, exchange, brokers both currencies | decrees |
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
shardOf(character)     = ⋃ colours of verbs the character can reach   # emergent
DECREES{}: standing rules that hook the verb pipeline (trigger / effect / rider / score)
```

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
- **Current balance:** baseline bots give Red ~100% (White's compliance-scoring needs an
  opponent who draws/complies; the Red bot only musters+strikes). A bot-policy and/or
  parameter problem to chase with the sim, not an engine bug.
