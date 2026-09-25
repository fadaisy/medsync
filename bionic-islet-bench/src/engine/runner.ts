/**
 * Headless command line runner.
 *
 *   npm run bench                 all scenarios
 *   npm run bench -- 1 3 4        scenarios by number
 *   npm run bench -- paracetamol  scenarios by id
 *
 * Prints each scenario's scoreboard and whether it met its stated expectation.
 */

import { formatScoreboard } from "./scoreboard.ts";
import { runScenario, SCENARIOS, type Scenario } from "./scenarios.ts";

/* eslint-disable no-console */

function select(args: string[]): readonly Scenario[] {
  if (args.length === 0) return SCENARIOS;
  return SCENARIOS.filter(
    (s) => args.includes(String(s.number)) || args.includes(s.id),
  );
}

function main(): void {
  const chosen = select(process.argv.slice(2));
  if (chosen.length === 0) {
    console.error("No scenario matched. Known scenarios:");
    for (const s of SCENARIOS) console.error(`  ${s.number}  ${s.id}  ${s.title}`);
    process.exitCode = 1;
    return;
  }

  console.log("Bionic islet sensor bench, headless runner");
  console.log("Illustrative simulation of a device that does not yet exist.");
  console.log("Model parameters are engineering estimates, not clinical data. Not a medical device.");
  console.log("");

  let failures = 0;
  for (const scenario of chosen) {
    const startedAt = process.hrtime.bigint();
    const result = runScenario(scenario);
    const elapsedMs = Number(process.hrtime.bigint() - startedAt) / 1e6;

    const board = { ...result.board, alerts: result.state.alertCount };
    const check = scenario.check(result);

    console.log(`Scenario ${scenario.number}: ${scenario.title}  [seed ${scenario.seed}]`);
    console.log(`  ${scenario.teaches}`);
    console.log("");
    console.log(formatScoreboard("  scoreboard, whole run", board).split("\n").slice(1).join("\n"));
    console.log("");
    console.log(`  expectation  ${scenario.expectation}`);
    console.log(`  result       ${check.ok ? "MET" : "NOT MET"}: ${check.detail}`);
    console.log(
      `  wall clock   ${elapsedMs.toFixed(0)} ms for ${(scenario.durationS / 86400).toFixed(2)} simulated days` +
        ` (${((elapsedMs * 1e3) / scenario.durationS).toFixed(2)} us per simulated second)`,
    );
    console.log("");
    if (!check.ok) failures += 1;
  }

  if (failures > 0) {
    console.error(`${failures} scenario(s) did not meet their expectation.`);
    process.exitCode = 1;
  }
}

main();
