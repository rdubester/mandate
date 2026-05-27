# Balance notes

The running log of tuning passes — the **only** place win-rates, parameter bands, and sim
findings live. Other docs and `config.ts` comments must not quote numbers from here; they rot
the moment the next pass lands.

Per entry: date, what changed (which `config.ts` knobs / decree rows), the sim command run,
the result (win rate, mean game length), and the takeaway. Append; don't rewrite history.

## Log

### 2026-05-26 — breezy rebalance + knockback cut + tax decrees score + honest MCTS

White-vs-Red two-faction slice. Sequence of changes and `npm run sim` reads:

- **Game length / target.** Games were dragging to ~164 turns (often the 200 cap) — bad for
  MCTS and human play. `mandate_target` 100→20, decree bite amount +1→+3 (the active scoring
  decrees). Result: **~20-turn games** (range 15–24). Sweep finding: bite=3 is what keeps
  White viable in a short game; the residual Red-favoredness was partly White scoring too
  slowly per bite, not just length.
- **Knockback cut.** Mandate-strike was +4 to Red AND −2 to White; the −2 strip-mined
  White's bites (White earned ~8 from bites, netted ~3). `marker_knockback` 2→0 (a
  Mandate-strike is pure scoring now; the field stays at base 0 as an opt-in decree lever).
  Design reason: deleting points off another track is unfun scoreboard-PvP — the fight
  belongs on the board.
- **Every supported decree scores (incl. tax decrees).** `martial_restraint` / `writ_of_order`
  gained a `score`, so a supported tax decree both taxes Red AND pays White when it bites —
  Red can no longer ignore decrees. MCTS logs then showed real board-fight (Red diverts to
  clear decrees; ~4.5 decree-strikes/game vs ~0 before).
- **MCTS determinization (correctness fix).** The decree deck ORDER is hidden, but MCTSBot
  searches the true state — it had been PEEKING at the deck all session. boardgame.io has no
  built-in hidden-info handling for bots (`playerView` is a client/network filter only;
  confirmed via docs + issue #383/#1163). Added PIMC determinization (shuffle hidden zones in
  a copy per decision) in `sim/driver.ts`.

**Win-rate progression (MCTS, the trustworthy read), White %:**
| state | White % |
|---|---|
| baseline (knockback on, tax scoreless) | 0% |
| − knockback | 17% |
| + tax decrees score | 37.5% (but bot was PEEKING the deck) |
| + determinization (honest) | **55%** (n=20, 60 iters) |

Takeaway: honest play shows a **close, interactive matchup (~55/45 White), n=20 so ±**. The
peek was worth ~18pts to Red. Scripted-bot reads run hotter for White (~52/48) and lie about
strong play — trust MCTS. Open: confirm 55/45 with a bigger batch before calling it.

### 2026-05-26 (cont.) — confirmed at n=40 + health metrics + support cap

`npm run analyze -- -n 40 --iters 60` (determinized MCTS). Added per-faction move-mix health
to the analyzer (move-kinds used, top-move share, entropy) to catch degenerate lines, plus
shortest/median/longest log dumps.

- **First n=40 read:** White 48% / Red 53%, mean 16 turns. Move-mix HEALTHY both sides: 3.7-3.8
  of 4 move-kinds used, top move 43%, entropy 0.91. Red's strikes split a real 22% Mandate /
  22% decree — genuine race-vs-tear-down choice, not strike-spam. BUT 1/40 games stalled to 42
  turns: White stacked 10+ support on one decree → un-removable fortress, neither side closing.
- **Fix:** `supporter_cap_per_decree` = 3 — total support on a decree can't exceed it, so Red
  can always strip it in ≤cap strikes. (Required updating 3 consumers: scripted bot, test
  helper, enumerate.)
- **Re-confirmed (n=40):** White 55% / Red 45%, mean 15.4, **max 26 (stall gone)**, 0 illegal
  moves. Move-mix still healthy (entropy 0.90, no move >45%, Red strike split 20/20).

**Status: White-vs-Red is DONE to a trustworthy bar** — balanced (~48-55% White across runs,
i.e. ≈even), breezy (~16-turn games), varied contested play, no stalls/degenerate equilibria.
Next faction can build on this baseline.

**Sim method note (PIMC vs ISMCTS):** current determinization is PIMC — one sample/decision,
the standard baseline; cheap and fine while hidden info is just the small decree deck. Known
literature weakness is *strategy fusion*; the upgrade is ISMCTS (search over information sets),
reserved for when Blue's Archive/commons makes the hidden info large enough that PIMC plays it
incoherently. Don't pre-build ISMCTS.
