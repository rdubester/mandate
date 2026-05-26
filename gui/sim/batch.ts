// Balance sweep: run N headless bot-vs-bot games, print win-rate + game-length
// distribution. The "find a parameter band where neither has a trivially dominant
// clock" tool (brief §10). Edit numbers in src/config.ts, re-run.
//
//   npm run sim                 # 200 games
//   npm run sim -- -n 1000      # 1000 games
//
// Note: MandateGame.setup seeds its deck shuffle from boardgame.io's RNG, which is
// fresh per Client — so games already vary run-to-run. (A fixed-seed mode would need
// threading a seed through Client setupData; not needed for distribution reads.)

import { runGame, BASELINE_POLICIES } from "./driver";
import { CONFIG, WHITE, RED, FACTION_NAME, type FactionId } from "../src/config";

function parseN(argv: string[]): number {
  const i = argv.indexOf("-n");
  if (i >= 0 && argv[i + 1]) return Math.max(1, parseInt(argv[i + 1], 10) || 200);
  return 200;
}

function median(xs: number[]): number {
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

function main() {
  const n = parseN(process.argv.slice(2));
  const wins: Record<string, number> = { [WHITE]: 0, [RED]: 0, draw: 0, none: 0 };
  const turns: number[] = [];

  for (let i = 0; i < n; i++) {
    const r = runGame(BASELINE_POLICIES);
    const key = r.winner === null ? "none" : r.winner;
    wins[key] = (wins[key] ?? 0) + 1;
    turns.push(r.turns);
  }

  const pct = (c: number) => `${((100 * c) / n).toFixed(1)}%`;
  console.log(`\n=== ${n} games · target ${CONFIG.mandate_target} · baseline bots ===`);
  for (const f of [WHITE, RED] as FactionId[]) {
    console.log(`  ${FACTION_NAME[f].padEnd(18)} ${String(wins[f]).padStart(5)} (${pct(wins[f])})`);
  }
  if (wins.draw) console.log(`  ${"draw".padEnd(18)} ${String(wins.draw).padStart(5)} (${pct(wins.draw)})`);
  if (wins.none) console.log(`  ${"(no winner)".padEnd(18)} ${String(wins.none).padStart(5)} (${pct(wins.none)})`);
  const mean = turns.reduce((a, b) => a + b, 0) / turns.length;
  console.log(
    `  turns: mean ${mean.toFixed(1)} · median ${median(turns)} · min ${Math.min(...turns)} · max ${Math.max(...turns)}`,
  );
}

main();
