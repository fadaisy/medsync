import type { Scenario } from "../src/engine/scenarios.ts";
import type { Scoreboard } from "../src/engine/types.ts";

import { runScenario, SCENARIOS } from "../src/engine/scenarios.ts";

/**
 * The placeholder front end and the physics front end, side by side.
 *
 * The build brief asks for before-and-after scoreboards on scenarios 1, 3, 4
 * and 5, and this is what produces them. It runs each scenario twice on the
 * same seed and the same events, changing nothing but which front end turns
 * glucose into a signal, and prints both scoreboards next to each other.
 *
 *   npm run compare
 *
 * The point is not that the numbers match. They do not, and where they differ
 * the physics is the one to believe: the placeholder was a straight line with
 * a noise term bolted on. The point is to see exactly where a first-principles
 * front end changes the answer, so that nobody has to take it on trust.
 */

const WANTED = [1, 3, 4, 5];

type Row = { label: string; placeholder: string; physics: string };

function rows(placeholder: Scoreboard, physics: Scoreboard, extra: Row[]): Row[] {
  const pair = (label: string, pick: (b: Scoreboard) => string): Row => ({
    label,
    placeholder: pick(placeholder),
    physics: pick(physics),
  });
  return [
    pair("Time in range 3.9 to 10", (b) => `${b.timeInRangePct.toFixed(1)} %`),
    pair("Time below 3.9", (b) => `${b.timeBelow39Pct.toFixed(2)} %`),
    pair("Time above 10", (b) => `${b.timeAbove10Pct.toFixed(1)} %`),
    pair("Mean glucose", (b) => `${b.meanGlucose.toFixed(2)} mmol/L`),
    pair("Fused against plasma", (b) => `${b.mardPct.toFixed(2)} %`),
    pair("Alerts raised", (b) => `${b.alerts}`),
    pair("Minutes at reduced autonomy", (b) => `${b.minutesReducedAutonomy}`),
    pair("Minutes suspended", (b) => `${b.minutesSuspended}`),
    pair("Total insulin", (b) => `${b.totalInsulinU.toFixed(2)} U`),
    ...extra,
  ];
}

function table(title: string, data: Row[]): void {
  const width = Math.max(...data.map((r) => r.label.length), 26);
  const left = Math.max(...data.map((r) => r.placeholder.length), 11);
  const right = Math.max(...data.map((r) => r.physics.length), 7);
  console.log(`\n${title}`);
  console.log(
    `  ${"Measure".padEnd(width)}  ${"placeholder".padStart(left)}  ${"physics".padStart(right)}`,
  );
  console.log(`  ${"-".repeat(width)}  ${"-".repeat(left)}  ${"-".repeat(right)}`);
  for (const row of data) {
    console.log(
      `  ${row.label.padEnd(width)}  ${row.placeholder.padStart(left)}  ${row.physics.padStart(right)}`,
    );
  }
}

function run(scenario: Scenario, frontEnd: "placeholder" | "physics") {
  // The stride now comes from `runScenario` itself, from the scenario's own
  // duration, so the bench, the tests and this script cannot disagree about it.
  return runScenario(scenario, { frontEnd });
}

for (const number of WANTED) {
  const scenario = SCENARIOS.find((s) => s.number === number);
  if (!scenario) continue;

  const before = run(scenario, "placeholder");
  const after = run(scenario, "physics");

  const extra: Row[] = [
    {
      label: "Supervisor states visited",
      placeholder: before.statesVisited.join(", "),
      physics: after.statesVisited.join(", "),
    },
    {
      label: "Lowest permitted autonomy",
      placeholder: `${before.lowestAutonomy}`,
      physics: `${after.lowestAutonomy}`,
    },
    {
      label: "Scenario check",
      placeholder: scenario.check(before).ok ? "met" : "missed",
      physics: scenario.check(after).ok ? "met" : "missed",
    },
  ];

  if (number === 5) {
    extra.push(
      {
        label: "Photobleaching at six months",
        placeholder: `${(before.state.bleachFraction * 100).toFixed(0)} %`,
        physics: `${(after.state.bleachFraction * 100).toFixed(0)} %`,
      },
      {
        label: "Enzyme remaining",
        placeholder: `${(before.state.enzymeActivity * 100).toFixed(0)} %`,
        physics: `${(after.state.enzymeActivity * 100).toFixed(0)} %`,
      },
      {
        label: "Capsule on tip A",
        placeholder: `${before.state.tipA.capsuleMicron.toFixed(0)} um`,
        physics: `${after.state.tipA.capsuleMicron.toFixed(0)} um`,
      },
    );
  }
  if (number === 3 || number === 4) {
    extra.push({
      label: "Reference drift at the end",
      placeholder: `${before.state.referenceDriftMv.toFixed(1)} mV`,
      physics: `${after.state.referenceDriftMv.toFixed(1)} mV`,
    });
  }

  table(`${scenario.number}. ${scenario.title}`, rows(before.board, after.board, extra));
  console.log(`  ${scenario.teaches}`);
}

console.log(
  "\nThe scenario check is the same assertion in both columns. Where the placeholder now misses it,\nthe expectation has been rewritten around what the physics produces, and DECISIONS.md says why.\n",
);
