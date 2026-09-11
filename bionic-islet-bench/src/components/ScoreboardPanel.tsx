import { useMemo } from "react";

import { rollingScoreboard } from "../engine/scoreboard.ts";
import type { Scoreboard } from "../engine/types.ts";
import { num, pct } from "../lib/format.ts";
import { benchData } from "../store/benchData.ts";
import { useBench } from "../store/bench.ts";
import { ModelTag } from "./ModelTag.tsx";
import { Panel } from "./Panel.tsx";

const ROWS: Array<{
  label: string;
  note: string;
  read: (b: Scoreboard) => string;
}> = [
  {
    label: "Time in range 3.9 to 10",
    note: "Percentage of samples with plasma glucose inside the range. Measured against the simulated plasma value, which a real device would not have.",
    read: (b) => pct(b.timeInRangePct),
  },
  {
    label: "Time below 3.9",
    note: "Level 1 hypoglycaemia.",
    read: (b) => pct(b.timeBelow39Pct, 2),
  },
  {
    label: "Time below 3.0",
    note: "Level 2 hypoglycaemia.",
    read: (b) => pct(b.timeBelow30Pct, 2),
  },
  {
    label: "Mean absolute relative difference",
    note: "Fused output against simulated plasma glucose. Not a clinical MARD: there is no reference meter and no patient here.",
    read: (b) => pct(b.mardPct, 2),
  },
  {
    label: "Alerts raised",
    note: "Every arbitration change away from valid, every suspend, every fault the device noticed.",
    read: (b) => String(b.alerts),
  },
  {
    label: "Minutes at reduced autonomy",
    note: "Any time below full closed loop.",
    read: (b) => `${b.minutesReducedAutonomy.toLocaleString("en-GB")} min`,
  },
  {
    label: "Minutes suspended",
    note: "Insulin delivery held at zero by the supervisor.",
    read: (b) => `${b.minutesSuspended.toLocaleString("en-GB")} min`,
  },
  {
    label: "Total insulin",
    note: "Basal and boluses together, integrated over the window.",
    read: (b) => `${num(b.totalInsulinU, 2)} U`,
  },
];

export function ScoreboardPanel() {
  const tick = useBench((s) => s.tick);
  const state = benchData.state;

  const rolling = useMemo(
    () => rollingScoreboard(benchData.minutes, state?.t ?? 0, 24),
    // The buffers are mutated in place, so the tick is the dependency that
    // says "something changed", not the array identity.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [tick, state?.t],
  );

  if (!state) {
    return (
      <Panel title="Scoreboard">
        <p className="text-micro text-muted">Nothing scored yet.</p>
      </Panel>
    );
  }

  const wholeRun = benchData.wholeRun;
  const rollingWithAlerts: Scoreboard = { ...rolling, alerts: state.alertCount };

  return (
    <Panel
      title="Scoreboard"
      subtitle={`Rolling 24 h and the whole run, ${num((state.t / 86_400), 2)} days so far`}
    >
      <table className="w-full border-collapse text-micro">
        <caption className="sr-only">
          Scoreboard over the rolling 24 hours and over the whole run
        </caption>
        <thead>
          <tr className="text-muted">
            <th scope="col" className="pb-1 text-left font-normal">
              Measure
            </th>
            <th scope="col" className="whitespace-nowrap pb-1 pl-2 text-right font-normal">
              24 h
            </th>
            <th scope="col" className="whitespace-nowrap pb-1 pl-2 text-right font-normal">
              Whole run
            </th>
          </tr>
        </thead>
        <tbody>
          {ROWS.map((row) => (
            <tr key={row.label} className="border-t border-edge/60">
              <th scope="row" className="py-1 pr-2 text-left font-normal text-muted">
                {row.label}
                <ModelTag note={row.note} />
              </th>
              <td className="tabular whitespace-nowrap py-1 pl-2 text-right text-[#cfd8e6]">
                {row.read(rollingWithAlerts)}
              </td>
              <td className="tabular whitespace-nowrap py-1 pl-2 text-right text-[#e8edf5]">
                {wholeRun ? row.read(wholeRun) : "--"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </Panel>
  );
}
