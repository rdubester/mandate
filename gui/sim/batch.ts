// Balance sweep: run N headless bot-vs-bot games, print win-rate + game-length
// distribution. The "find a parameter band where neither has a trivially dominant
// clock" tool (brief §10). Edit numbers in src/config.ts, re-run.
//
//   npm run sim                      # 200 random-bot games (fast)
//   npm run sim -- -n 1000           # more games
//   npm run sim -- --matchup WW      # mirror: both seats play White (default WR)
//   npm run sim -- --matchup RR -n 20
//   npm run sim -- --mcts -n 40      # MCTS-vs-MCTS (slow, measures the GAME not heuristics)
//   npm run sim -- --mcts --iters 300 -n 30
//
// Scripted bots answer "does strategy X beat Y?"; MCTS answers "with strong play, who
// wins?" — i.e. is the GAME balanced, independent of our hand-written heuristics. MCTS is
// much slower (hundreds of playouts per move), so use small N.

import { runGameRandom, runGameMCTS, type GameResult } from "./driver";
import { CONFIG, WHITE, RED, FACTION_NAME, SEATS, type Matchup, type FactionId } from "../src/config";

function flagInt(argv: string[], flag: string, dflt: number): number {
  const i = argv.indexOf(flag);
  if (i >= 0 && argv[i + 1]) return Math.max(1, parseInt(argv[i + 1], 10) || dflt);
  return dflt;
}

function flagStr(argv: string[], flag: string): string | undefined {
  const i = argv.indexOf(flag);
  return i >= 0 && argv[i + 1] ? argv[i + 1] : undefined;
}

// Map a --matchup token (WW | RR | WR) to a seat→faction record. Default WR (historical).
function parseMatchup(token: string | undefined): Matchup {
  const code: Record<string, [FactionId, FactionId]> = {
    WW: [WHITE, WHITE],
    RR: [RED, RED],
    WR: [WHITE, RED],
    RW: [RED, WHITE],
  };
  const [s0, s1] = code[(token ?? "WR").toUpperCase()] ?? code.WR;
  return { "0": s0, "1": s1 };
}

function median(xs: number[]): number {
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

async function main() {
  const argv = process.argv.slice(2);
  const mcts = argv.includes("--mcts");
  const n = flagInt(argv, "-n", mcts ? 40 : 200);
  const iters = flagInt(argv, "--iters", 200);
  const matchup = parseMatchup(flagStr(argv, "--matchup"));

  // Tally is keyed by SEAT (the winner is a seat id), since in a mirror both seats share a
  // faction and a faction-keyed tally would collide.
  const wins: Record<string, number> = { "0": 0, "1": 0, draw: 0, none: 0 };
  const turns: number[] = [];

  for (let i = 0; i < n; i++) {
    const r: GameResult = mcts
      ? await runGameMCTS({ iterations: iters, matchup })
      : await runGameRandom({ matchup });
    const key = r.winner === null ? "none" : r.winner;
    wins[key] = (wins[key] ?? 0) + 1;
    turns.push(r.turns);
    process.stdout.write("."); // progress dot per game
  }
  if (mcts) process.stdout.write("\n");

  const pct = (c: number) => `${((100 * c) / n).toFixed(1)}%`;
  const bots = mcts ? `MCTS bots (${iters} iters)` : "random bots";
  const matchLabel = SEATS.map((s) => FACTION_NAME[matchup[s]].split(" ")[0]).join(" vs ");
  console.log(`\n=== ${n} games · ${matchLabel} · target ${CONFIG.mandate_target} · ${bots} ===`);
  for (const s of SEATS) {
    const fac = FACTION_NAME[matchup[s]].split(" ")[0];
    console.log(`  seat ${s} (${fac})`.padEnd(18) + ` ${String(wins[s]).padStart(5)} (${pct(wins[s])})`);
  }
  if (wins.draw) console.log(`  ${"draw".padEnd(18)} ${String(wins.draw).padStart(5)} (${pct(wins.draw)})`);
  if (wins.none) console.log(`  ${"(no winner)".padEnd(18)} ${String(wins.none).padStart(5)} (${pct(wins.none)})`);
  const mean = turns.reduce((a, b) => a + b, 0) / turns.length;
  console.log(
    `  turns: mean ${mean.toFixed(1)} · median ${median(turns)} · min ${Math.min(...turns)} · max ${Math.max(...turns)}`,
  );
}

main();
