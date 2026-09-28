import type { GlucoseBody } from "@/lib/emr/charts/payload";

import { PointsGraph } from "./points-graph";
import { trendWords } from "./words";

/**
 * Capillary glucose over time (MONITORING-CHARTS.md §2): points joined, against a dashed amber line
 * at the signed hypoglycaemia threshold, labelled "4.0 mmol/L (JBDS 2023)". Nothing is flagged.
 */
export function GlucoseGraph({ body, now }: { body: GlucoseBody; now: string }) {
  const fmt = (n: number) => `${n.toFixed(1)} mmol/L`;
  const label =
    body.points.length === 0
      ? "Capillary glucose: no entries yet."
      : `Capillary glucose: ${trendWords(body.points, fmt)}. Reference line labelled ${body.reference.label}.`;
  return (
    <PointsGraph
      title="Capillary glucose"
      points={body.points}
      reference={body.reference}
      unit="mmol/L"
      now={now}
      label={label}
    />
  );
}
