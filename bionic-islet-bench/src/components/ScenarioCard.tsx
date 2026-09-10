import { AnimatePresence, m } from "framer-motion";

import { num, pct } from "../lib/format.ts";
import { useBench } from "../store/bench.ts";
import type { ScenarioOutcome } from "../worker/protocol.ts";

/**
 * What the loaded scenario claimed, and whether it happened.
 *
 * The claim and the check are the same object the test suite asserts on, so a
 * scenario that stops being true here fails in the suite as well.
 */
export function ScenarioCard() {
  const scenario = useBench((s) => s.scenario);
  const comparison = useBench((s) => s.comparison);
  const compare = useBench((s) => s.compare);
  const clearComparison = useBench((s) => s.clearComparison);

  if (!scenario && !comparison) return null;

  return (
    <AnimatePresence mode="wait" initial={false}>
      <m.section
        key={comparison ? "comparison" : (scenario?.id ?? "none")}
        aria-label="Scenario result"
        initial={{ opacity: 0, y: -6 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
        className="mx-3 mb-0 rounded-[var(--radius-card)] border border-edge bg-panel px-3 py-2"
      >
        {comparison ? (
          <Comparison outcomes={comparison} onClose={clearComparison} />
        ) : scenario ? (
          <Single outcome={scenario} onCompare={() => compare("paracetamol", "paracetamol-fouled")} />
        ) : null}
      </m.section>
    </AnimatePresence>
  );
}

function Single({ outcome, onCompare }: { outcome: ScenarioOutcome; onCompare: () => void }) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-1">
      <div className="min-w-0 flex-1">
        <h2 className="text-heading-s">
          <span className="tabular mr-1.5 text-muted">Scenario {outcome.number}</span>
          {outcome.title}
        </h2>
        <p className="text-micro leading-snug text-[#cfd8e6]">{outcome.teaches}</p>
        <p className="mt-1 text-micro leading-snug text-muted">
          <span className="font-mono uppercase tracking-wider">expected</span> {outcome.expectation}
        </p>
        <p className="text-micro leading-snug text-muted">
          <span className="font-mono uppercase tracking-wider">observed</span> {outcome.detail}
        </p>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <span
          className={`rounded-[var(--radius-control)] border px-2 py-1 font-mono text-micro ${
            outcome.met
              ? "border-teal-bright/50 bg-teal-bright/10 text-teal-bright"
              : "border-amber/50 bg-amber/10 text-amber"
          }`}
        >
          {outcome.met ? "expectation met" : "expectation not met"}
        </span>
        {outcome.id === "paracetamol" || outcome.id === "paracetamol-fouled" ? (
          <button
            type="button"
            onClick={onCompare}
            className="rounded-[var(--radius-control)] border border-edge px-2 py-1 text-micro text-muted transition-colors duration-[var(--duration-instant)] ease-[var(--ease-medsync)] hover:border-teal-bright hover:text-teal-bright"
          >
            Compare 3 and 4
          </button>
        ) : null}
      </div>
    </div>
  );
}

const COMPARE_ROWS: Array<{ label: string; read: (o: ScenarioOutcome) => string }> = [
  { label: "Supervisor states visited", read: (o) => o.statesVisited.join(", ") },
  {
    label: "Lowest permitted autonomy",
    read: (o) =>
      ["suspended", "safe basal only", "basal modulation only", "full closed loop"][o.lowestAutonomy] ??
      String(o.lowestAutonomy),
  },
  { label: "Time in range 3.9 to 10", read: (o) => pct(o.board.timeInRangePct) },
  { label: "Time below 3.9", read: (o) => pct(o.board.timeBelow39Pct, 2) },
  { label: "Fused difference against plasma", read: (o) => pct(o.board.mardPct, 2) },
  { label: "Alerts raised", read: (o) => String(o.board.alerts) },
  {
    label: "Minutes at reduced autonomy",
    read: (o) => `${o.board.minutesReducedAutonomy.toLocaleString("en-GB")} min`,
  },
  { label: "Minutes suspended", read: (o) => `${o.board.minutesSuspended.toLocaleString("en-GB")} min` },
  { label: "Total insulin", read: (o) => `${num(o.board.totalInsulinU, 2)} U` },
];

function Comparison({ outcomes, onClose }: { outcomes: ScenarioOutcome[]; onClose: () => void }) {
  const [a, b] = outcomes;
  if (!a || !b) return null;
  return (
    <div>
      <div className="mb-1 flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <h2 className="text-heading-s">The same interferent, twice</h2>
          <p className="text-micro leading-snug text-[#cfd8e6]">
            Paracetamol pushes tip B high in both runs. The only difference is whether there is any
            health evidence to blame it. With none, the supervisor refuses to pick a tip and falls
            back; with the impedance accusing tip B, it drops that tip and carries on.
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="rounded-[var(--radius-control)] border border-edge px-2 py-1 text-micro text-muted hover:border-teal-bright hover:text-teal-bright"
        >
          Close
        </button>
      </div>
      <table className="w-full border-collapse text-micro">
        <caption className="sr-only">
          Scoreboards for scenario 3 and scenario 4 side by side
        </caption>
        <thead>
          <tr className="text-muted">
            <th scope="col" className="pb-1 text-left font-normal">
              Measure
            </th>
            {outcomes.map((o) => (
              <th key={o.id} scope="col" className="pb-1 pl-3 text-right font-normal">
                <span className="tabular">{o.number}.</span> {o.title}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {COMPARE_ROWS.map((row) => {
            const values = outcomes.map(row.read);
            const differs = values[0] !== values[1];
            return (
              <tr key={row.label} className="border-t border-edge/60">
                <th scope="row" className="py-1 pr-2 text-left font-normal text-muted">
                  {row.label}
                </th>
                {values.map((value, i) => (
                  <td
                    key={i}
                    className={`tabular py-1 pl-3 text-right ${differs ? "text-[#e8edf5]" : "text-muted"}`}
                  >
                    {value}
                  </td>
                ))}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
