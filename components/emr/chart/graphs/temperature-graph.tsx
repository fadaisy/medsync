import type { TemperatureBody } from "@/lib/emr/charts/payload";

import { PointsGraph } from "./points-graph";
import { plural, trendWords } from "./words";

/**
 * Temperature over time (MONITORING-CHARTS.md §2): core readings (rectal, oesophageal, bladder) as
 * squares, peripheral ones or an unrecorded site as circles, each named in the legend; a dashed
 * amber line at 35 °C labelled "35 °C, to verify".
 */
export function TemperatureGraph({ body, now }: { body: TemperatureBody; now: string }) {
  const core = body.points.filter((p) => p.site === "core").length;
  const fmt = (n: number) => `${n.toFixed(1)} °C`;
  const label =
    body.points.length === 0
      ? "Temperature: no entries yet."
      : `Temperature: ${trendWords(body.points, fmt)}. ${plural(core, "core reading")}. ` +
        `Reference line at ${fmt(body.reference.value)}, labelled ${body.reference.label}.`;
  return (
    <PointsGraph
      title="Temperature"
      points={body.points.map((p) => ({
        at: p.at,
        value: p.value,
        origin: p.origin,
        shape: p.site === "core" ? "square" : "circle",
      }))}
      reference={body.reference}
      unit="°C"
      now={now}
      label={label}
      legend={[
        { glyph: "core", text: "Core (rectal, oesophageal or bladder)" },
        { glyph: "peripheral", text: "Peripheral, or site not recorded" },
      ]}
    />
  );
}
