// One-off analysis: run MCTS-vs-MCTS games, print a couple of full narratives + aggregate
// stats parsed from the per-game G.log, to see WHAT STRATEGIES the bots actually employ.
//
//   npm run analyze                      # defaults: 30 games @ 40 iters, 2 sample logs
//   npm run analyze -- -n 60 --iters 80 --logs 3
//
// Throwaway/diagnostic — not part of the test suite.

import { runGameMCTS } from "./driver";
import { CONFIG, WHITE, RED, type FactionId } from "../src/config";

function flagInt(argv: string[], flag: string, dflt: number): number {
  const i = argv.indexOf(flag);
  if (i >= 0 && argv[i + 1]) return Math.max(0, parseInt(argv[i + 1], 10) || dflt);
  return dflt;
}

// Per-game features pulled from the log + final state. The log lines are stable strings
// emitted by game.ts (see each move), so we can count behaviours from them.
interface Features {
  winner: FactionId | "draw" | null;
  turns: number;
  whiteMandate: number;
  redMandate: number;
  whiteBiteMandate: number; // Mandate White got from supported-decree bites
  enacts: number;
  supports: number; // allocate_supporters actions
  strikeMandate: number; // Red strikes on the Mandate track
  strikeDecree: number; // Red strikes on a decree (removal/shield-grind)
  musters: number;
  rallies: number;
  deliberates: number;
  decreesRemoved: number; // decrees actually struck off the board
  everSupported: boolean; // did White get at least one decree supported?
}

function extract(log: string[], r: { winner: Features["winner"]; turns: number; mandate: Record<FactionId, number> }): Features {
  const has = (s: string) => (l: string) => l.includes(s);
  const count = (s: string) => log.filter(has(s)).length;
  // Mandate White earned specifically from bites (sum the "+N Mandate" on bite lines).
  const biteMandate = log
    .filter(has("bites"))
    .reduce((sum, l) => sum + (parseInt(l.match(/\+(\d+) Mandate/)?.[1] ?? "0", 10) || 0), 0);
  return {
    winner: r.winner,
    turns: r.turns,
    whiteMandate: r.mandate[WHITE],
    redMandate: r.mandate[RED],
    whiteBiteMandate: biteMandate,
    enacts: count("enacts decree"),
    supports: count("white supports"),
    strikeMandate: count("'s Mandate:"), // "red strikes white's Mandate: ..."
    strikeDecree: log.filter((l) => l.includes("strikes decree")).length,
    musters: count("muster_zealots:"),
    rallies: count("rally_supporters:"),
    deliberates: count("deliberates:"),
    decreesRemoved: count("off white's board"),
    everSupported: log.some(has("white supports")),
  };
}

function mean(xs: number[]): number {
  return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0;
}

async function main() {
  const argv = process.argv.slice(2);
  const n = flagInt(argv, "-n", 30);
  const iters = flagInt(argv, "--iters", 40);
  const nLogs = flagInt(argv, "--logs", 2);

  const feats: Features[] = [];
  const sampleLogs: string[][] = [];

  for (let i = 0; i < n; i++) {
    const r = await runGameMCTS({ iterations: iters });
    feats.push(extract(r.log, r));
    if (sampleLogs.length < nLogs) sampleLogs.push(r.log);
    process.stdout.write(".");
  }
  process.stdout.write("\n");

  // ---- sample narratives ----
  sampleLogs.forEach((log, i) => {
    console.log(`\n========== SAMPLE GAME ${i + 1} ==========`);
    for (const line of log) console.log(line);
  });

  // ---- aggregate stats ----
  const wins = { [WHITE]: 0, [RED]: 0, draw: 0, none: 0 } as Record<string, number>;
  for (const f of feats) wins[f.winner ?? "none"] = (wins[f.winner ?? "none"] ?? 0) + 1;
  const whiteWins = feats.filter((f) => f.winner === WHITE);
  const redWins = feats.filter((f) => f.winner === RED);

  console.log(`\n========== AGGREGATE (${n} MCTS games @ ${iters} iters) ==========`);
  console.log(`  wins: White ${wins[WHITE]} / Red ${wins[RED]} / draw ${wins.draw} / none ${wins.none}`);
  console.log(`  mean turns: ${mean(feats.map((f) => f.turns)).toFixed(1)}`);
  console.log(`  White supported ≥1 decree in ${feats.filter((f) => f.everSupported).length}/${n} games`);
  console.log("\n  per-game averages (all games):");
  const avg = (k: keyof Features) => mean(feats.map((f) => f[k] as number)).toFixed(1);
  console.log(`    White: enact ${avg("enacts")} · support ${avg("supports")} · rally ${avg("rallies")} · deliberate ${avg("deliberates")}`);
  console.log(`    Red:   muster ${avg("musters")} · strike-Mandate ${avg("strikeMandate")} · strike-decree ${avg("strikeDecree")}`);
  console.log(`    decrees removed by Red: ${avg("decreesRemoved")}`);
  console.log(`    White Mandate from bites: ${avg("whiteBiteMandate")} (of ${avg("whiteMandate")} total)`);

  const cmp = (label: string, games: Features[]) => {
    if (!games.length) return;
    const a = (k: keyof Features) => mean(games.map((f) => f[k] as number)).toFixed(1);
    console.log(
      `    [${label}] turns ${a("turns")} · W bites ${a("whiteBiteMandate")} · Red strike-decree ${a("strikeDecree")} · decrees removed ${a("decreesRemoved")}`,
    );
  };
  console.log("\n  split by winner:");
  cmp("White wins", whiteWins);
  cmp("Red wins", redWins);
}

main();
