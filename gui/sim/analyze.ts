// Diagnostic: run MCTS games and surface not just WHO wins but whether play is HEALTHY —
// i.e. not dominated by one degenerate line. We can't directly see the bots' intent, but the
// log records every move, so per game we measure each faction's MOVE MIX (which verbs it used
// and how concentrated), game LENGTH, and flag outliers (very short = rush, very long = stall)
// and low action-space utilization. Then we dump a few representative + a few outlier logs.
//
//   npm run analyze                       # 30 games @ 50 iters
//   npm run analyze -- -n 60 --iters 80
//
// Not part of the test suite.

import { runGameMCTS } from "./driver";
import { CONFIG, WHITE, RED, verbsFor, type FactionId } from "../src/config";

function flagInt(argv: string[], flag: string, dflt: number): number {
  const i = argv.indexOf(flag);
  if (i >= 0 && argv[i + 1]) return Math.max(0, parseInt(argv[i + 1], 10) || dflt);
  return dflt;
}

// Map a log line to (seat, move-kind), or null if it's not a faction action line. Move-kinds
// are the distinct things a player DOES — the action-space we want to see exercised.
type Kind =
  | "enact" | "support" | "rally" | "muster" | "deliberate"
  | "strikeMandate" | "strikeDecree";
function classify(line: string): { who: FactionId; kind: Kind } | null {
  const who: FactionId | null = line.startsWith("white ") ? WHITE : line.startsWith("red ") ? RED : null;
  if (!who) return null;
  if (line.includes("enacts decree")) return { who, kind: "enact" };
  if (line.includes("supports")) return { who, kind: "support" };
  if (line.includes("rally_supporters:")) return { who, kind: "rally" };
  if (line.includes("muster_zealots:")) return { who, kind: "muster" };
  if (line.includes("deliberates")) return { who, kind: "deliberate" };
  if (line.includes("strikes the Mandate track")) return { who, kind: "strikeMandate" };
  if (line.includes("strikes decree")) return { who, kind: "strikeDecree" };
  return null;
}

// Shannon entropy of a move-kind distribution, normalised 0..1 (1 = perfectly even spread of
// the kinds used, 0 = a single move). A blunt "how varied was this faction's play" gauge.
function normEntropy(counts: number[]): number {
  const total = counts.reduce((a, b) => a + b, 0);
  if (total === 0) return 0;
  const used = counts.filter((c) => c > 0);
  if (used.length <= 1) return 0;
  const h = -used.reduce((s, c) => { const p = c / total; return s + p * Math.log2(p); }, 0);
  return h / Math.log2(used.length); // normalise by max possible for the # of kinds used
}

interface Game {
  winner: FactionId | "draw" | null;
  turns: number;
  log: string[];
  mandate: Record<FactionId, number>; // final scores (for margin / shutout closeness stats)
  mix: Record<FactionId, Partial<Record<Kind, number>>>;
  kindsUsed: Record<FactionId, number>; // how many distinct move-kinds each faction used
  topShare: Record<FactionId, number>; // fraction of a faction's actions that were its #1 move
}

function analyzeGame(
  r: { winner: Game["winner"]; turns: number; log: string[]; mandate: Record<FactionId, number> },
): Game {
  const mix: Game["mix"] = { [WHITE]: {}, [RED]: {} };
  for (const line of r.log) {
    const c = classify(line);
    if (!c) continue;
    mix[c.who][c.kind] = (mix[c.who][c.kind] ?? 0) + 1;
  }
  const kindsUsed = {} as Record<FactionId, number>;
  const topShare = {} as Record<FactionId, number>;
  for (const f of [WHITE, RED] as FactionId[]) {
    const counts = Object.values(mix[f]);
    const total = counts.reduce((a, b) => a + b, 0);
    kindsUsed[f] = counts.filter((c) => c > 0).length;
    topShare[f] = total ? Math.max(...counts, 0) / total : 0;
  }
  return { ...r, mix, kindsUsed, topShare };
}

function mean(xs: number[]): number { return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0; }
function pct(c: number, n: number): string { return `${((100 * c) / n).toFixed(0)}%`; }

// How many move-kinds each faction COULD use (its verb menu, + the two strike targets count
// as two kinds for whoever can strike). For utilization denominators.
function availableKinds(f: FactionId): number {
  const verbs = verbsFor(f);
  let k = 0;
  if (verbs.includes("enact_decree")) k++;
  if (verbs.includes("allocate_supporters")) k++;
  if (verbs.includes("rally_supporters")) k++;
  if (verbs.includes("muster_zealots")) k++;
  if (verbs.includes("deliberate")) k++;
  if (verbs.includes("strike")) k += 2; // strikeMandate + strikeDecree
  return k;
}

async function main() {
  const argv = process.argv.slice(2);
  const n = flagInt(argv, "-n", 30);
  const iters = flagInt(argv, "--iters", 50);

  const games: Game[] = [];
  for (let i = 0; i < n; i++) {
    const r = await runGameMCTS({ iterations: iters });
    games.push(analyzeGame(r));
    process.stdout.write(".");
  }
  process.stdout.write("\n");

  // ---- win rate + length ----
  const wins = { [WHITE]: 0, [RED]: 0, draw: 0, none: 0 } as Record<string, number>;
  for (const g of games) wins[g.winner ?? "none"]++;
  const turns = games.map((g) => g.turns).sort((a, b) => a - b);
  console.log(`\n===== ${n} determinized MCTS games @ ${iters} iters · target ${CONFIG.mandate_target} =====`);
  console.log(`  White ${wins[WHITE]} (${pct(wins[WHITE], n)}) · Red ${wins[RED]} (${pct(wins[RED], n)})` +
    (wins.draw ? ` · draw ${wins.draw}` : "") + (wins.none ? ` · none ${wins.none}` : ""));
  console.log(`  turns: mean ${mean(turns).toFixed(1)} · median ${turns[Math.floor(n / 2)]} · min ${turns[0]} · max ${turns[n - 1]}`);
  // cap-hitters = potential stalls
  const capped = games.filter((g) => g.turns >= CONFIG.max_turns).length;
  if (capped) console.log(`  ⚠ ${capped} game(s) hit the turn cap (${CONFIG.max_turns}) — possible stall`);

  // ---- closeness: are games CONTESTED or blowouts? (the thing win-rate hides) ----
  // For each decided game: the loser's final score, and the margin. A healthy interactive
  // game has the loser scoring a decent fraction of target; a blowout/RPS matchup has the
  // loser near 0. "Shutout" = loser under 25% of target (got stomped).
  const decided = games.filter((g) => g.winner === WHITE || g.winner === RED);
  const target = CONFIG.mandate_target;
  const loserScores = decided.map((g) => {
    const w = g.mandate[WHITE], r = g.mandate[RED];
    return Math.min(w, r); // the loser scored the smaller total
  });
  const margins = decided.map((g) => Math.abs(g.mandate[WHITE] - g.mandate[RED]));
  const shutouts = loserScores.filter((s) => s < target * 0.25).length;
  const close = margins.filter((m) => m <= target * 0.25).length; // within a quarter-target
  console.log(`\n  closeness (contested vs blowout — win-rate hides this):`);
  console.log(`    loser's final score: mean ${mean(loserScores).toFixed(1)} of ${target}` +
    ` (higher = more contested)`);
  console.log(`    margin: mean ${mean(margins).toFixed(1)}` +
    ` · shutouts (loser <${(target * 0.25).toFixed(0)}): ${shutouts}/${decided.length}` +
    ` · close games (margin ≤${(target * 0.25).toFixed(0)}): ${close}/${decided.length}`);

  // ---- health: move-mix per faction ----
  console.log(`\n  move-mix health (are both sides using their action space?):`);
  for (const f of [WHITE, RED] as FactionId[]) {
    const avail = availableKinds(f);
    const usedAvg = mean(games.map((g) => g.kindsUsed[f]));
    const topAvg = mean(games.map((g) => g.topShare[f]));
    const entAvg = mean(games.map((g) => normEntropy(Object.values(g.mix[f]))));
    const name = f === WHITE ? "White" : "Red";
    console.log(`    ${name}: uses ${usedAvg.toFixed(1)}/${avail} move-kinds/game · top move = ${(100 * topAvg).toFixed(0)}% of its actions · variety(entropy) ${entAvg.toFixed(2)}`);
    // aggregate which kinds, how often
    const totals: Record<string, number> = {};
    for (const g of games) for (const [k, c] of Object.entries(g.mix[f])) totals[k] = (totals[k] ?? 0) + c;
    const grand = Object.values(totals).reduce((a, b) => a + b, 0) || 1;
    const breakdown = Object.entries(totals).sort((a, b) => b[1] - a[1])
      .map(([k, c]) => `${k} ${((100 * c) / grand).toFixed(0)}%`).join(" · ");
    console.log(`      ${breakdown}`);
  }
  console.log(`  (low move-kinds used, or top-move >~70%, or entropy <~0.5 = a faction leaning on one degenerate line.)`);

  // ---- sample logs: shortest, longest, and a median game ----
  const byLen = [...games].sort((a, b) => a.turns - b.turns);
  const picks: [string, Game][] = [
    ["SHORTEST (rush check)", byLen[0]],
    ["MEDIAN", byLen[Math.floor(byLen.length / 2)]],
    ["LONGEST (stall check)", byLen[byLen.length - 1]],
  ];
  for (const [tag, g] of picks) {
    console.log(`\n========== ${tag} — ${g.turns} turns, ${g.winner} won ==========`);
    for (const line of g.log) console.log(line);
  }
}

main();
