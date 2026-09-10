import type { Line } from "./Chart.tsx";
import type { LabConditions, OpticalResult } from "./labModel.ts";

import { Chart, LayerKey } from "./Chart.tsx";
import { isotherm } from "./labModel.ts";
import { LIGHT, MOLECULE } from "./palette.ts";
import { Est, Figure, Figures } from "./Readout.tsx";

/**
 * The optical probe, as the lab shows it.
 *
 * Three things, in the order the light travels: what the glucose does on its
 * way in, what the receptor does with it, and what comes back out.
 */

type Props = { result: OpticalResult; conditions: LabConditions };

export function OpticalPanel({ result, conditions }: Props) {
  const profile: Line[] = [
    {
      key: "glucose",
      label: "Free glucose",
      colour: MOLECULE.glucose,
      points: Array.from(result.glucose, (value, i) => ({
        x: result.depthsMicron[i] ?? 0,
        y: value,
      })),
    },
  ];

  const curve = isotherm(conditions);
  const binding: Line[] = [
    {
      key: "total",
      label: "Sites occupied by anything",
      colour: LIGHT.indicator,
      points: curve.map((p) => ({ x: p.glucose, y: p.total })),
    },
    {
      key: "glucose-only",
      label: "Sites occupied by glucose",
      colour: MOLECULE.glucose,
      dash: "4 3",
      points: curve.map((p) => ({ x: p.glucose, y: p.glucoseOnly })),
    },
    {
      key: "yield",
      label: "Fluorescence quantum yield",
      colour: LIGHT.reference,
      points: curve.map((p) => ({ x: p.glucose, y: p.quantumYield })),
    },
  ];

  return (
    <div className="grid gap-x-5 gap-y-3 xl:grid-cols-2">
      <section aria-label="Glucose through the optical stack">
        <h4 className="text-heading-s">Getting in</h4>
        <p className="text-micro text-muted">
          Fluid, then whatever protein has stuck to the surface, then the capsule the body grew,
          then the sensing gel. The steps at each boundary are partition coefficients: the same
          chemical potential, a different solubility.
        </p>
        <Chart
          lines={profile}
          bands={result.layers}
          xLabel="Depth from the fluid, micrometres"
          yLabel="mmol/L"
        />
        <LayerKey bands={result.layers} />
      </section>

      <section aria-label="Binding and the switch">
        <h4 className="text-heading-s">The switch</h4>
        <p className="text-micro text-muted">
          The boron holds a diol and stops quenching the fluorophore. It has no way of knowing which
          diol, so the two curves separate exactly as much as there is something else in the fluid.
        </p>
        <Chart lines={binding} xLabel="Glucose outside, mmol/L" yLabel="Fraction" yMax={1} />
      </section>

      <section aria-label="Optical readout">
        <h4 className="text-heading-s">Coming out</h4>
        <Figures>
          <Figure label="Indicator counts" value={result.indicatorCounts.toFixed(0)} />
          <Figure label="Reference counts" value={result.referenceCounts.toFixed(0)} />
          <Figure label="Ratio" value={result.ratio.toFixed(3)} />
          <Figure
            label="Reading"
            value={`${result.readingMmol.toFixed(2)} +/- ${result.uncertaintyMmol.toFixed(2)} mmol/L`}
          />
          <Figure
            label="Sites occupied"
            value={`${(result.totalOccupancy * 100).toFixed(1)} %`}
            note={`glucose alone ${(result.glucoseOccupancy * 100).toFixed(1)} %`}
          />
          <Figure
            label="Quantum yield"
            value={result.quantumYield.toFixed(4)}
            note={`switch contrast ${result.switchContrast.toFixed(2)} to one`}
          />
          <Figure
            label="Dissociation constant"
            value={`${result.dissociationMmol.toFixed(2)} mmol/L`}
            note={<Est>at this pH and temperature</Est>}
          />
          <Figure
            label="Indicator surviving"
            value={`${(result.survival * 100).toFixed(1)} %`}
            note={`${conditions.flashes.toLocaleString("en-GB")} flashes`}
          />
        </Figures>
        <p className="text-micro text-muted mt-2">
          Everything common to both emission bands divides out of the ratio, which is why the dye
          can bleach to half and the reading not move. What does not divide out is a difference
          between the bands, and the switch is steep enough that half a per cent on the ratio
          arrives as about one and a half per cent of glucose.
        </p>
      </section>
    </div>
  );
}
