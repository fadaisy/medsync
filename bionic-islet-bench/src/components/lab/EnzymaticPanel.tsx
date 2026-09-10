import type { Line } from "./Chart.tsx";
import type { EnzymaticResult, LabConditions } from "./labModel.ts";

import { Chart, LayerKey } from "./Chart.tsx";
import { LAB_FACTS } from "./labModel.ts";
import { MOLECULE } from "./palette.ts";
import { Est, Figure, Figures } from "./Readout.tsx";

/**
 * The enzymatic probe, as the lab shows it.
 *
 * Four things: what crosses the membranes, what the enzyme does with it, what
 * the electrode collects, and what the impedance says about the state of the
 * surface.
 */

type Props = { result: EnzymaticResult; conditions: LabConditions; profiles: ProfileSet };

export type ProfileSet = {
  glucose: Float64Array;
  oxygen: Float64Array;
  peroxide: Float64Array;
  paracetamol: Float64Array;
  gluconate: Float64Array;
};

/**
 * The species differ by six orders of magnitude across the stack, so a shared
 * linear axis would draw four flat lines and one curve. A logarithmic axis
 * keeps every one of them readable and does not pretend the differences are
 * smaller than they are.
 */
export function EnzymaticPanel({ result, conditions, profiles }: Props) {
  const at = (values: Float64Array): Array<{ x: number; y: number }> =>
    Array.from(values, (value, i) => ({ x: result.depthsMicron[i] ?? 0, y: value }));

  const lines: Line[] = [
    {
      key: "glucose",
      label: "Glucose, both anomers",
      colour: MOLECULE.glucose,
      points: at(profiles.glucose),
    },
    { key: "oxygen", label: "Oxygen", colour: MOLECULE.oxygen, points: at(profiles.oxygen) },
    {
      key: "peroxide",
      label: "Hydrogen peroxide",
      colour: MOLECULE.peroxide,
      points: at(profiles.peroxide),
    },
    {
      key: "gluconate",
      label: "Gluconate",
      colour: MOLECULE.gluconate,
      points: at(profiles.gluconate),
    },
  ];
  if (conditions.paracetamolMmol > 0) {
    lines.push({
      key: "paracetamol",
      label: "Paracetamol",
      colour: MOLECULE.interferent,
      points: at(profiles.paracetamol),
    });
  }

  const enzyme: Line[] = [
    {
      key: "enzyme",
      label: "Active enzyme",
      colour: MOLECULE.electrons,
      points: Array.from(result.enzymeProfile, (value, i) => ({
        x: result.enzymeFrom + (i / Math.max(result.enzymeProfile.length - 1, 1)) * 8,
        y: value,
      })),
    },
  ];

  const nyquist: Line[] = [
    {
      key: "nyquist",
      label: "Randles cell, 0.1 Hz to 100 kHz",
      colour: MOLECULE.electrons,
      points: result.spectrum.map((p) => ({
        x: p.impedance.real / 1000,
        y: -p.impedance.imaginary / 1000,
      })),
    },
  ];

  return (
    <div className="grid gap-x-5 gap-y-3 xl:grid-cols-2">
      <section aria-label="Species through the enzymatic stack">
        <h4 className="text-heading-s">Crossing six films</h4>
        <p className="text-micro text-muted">
          Glucose falls by four orders of magnitude across the outer membrane and oxygen barely
          notices it. That ratio is the design: the membrane exists to starve the enzyme of glucose
          without starving it of oxygen. The steps at each boundary, including the one back up on
          the way into the enzyme layer, are partition coefficients rather than discontinuities: the
          same chemical potential, a different solubility.
        </p>
        <Chart
          lines={lines}
          bands={result.layers}
          xLabel="Depth from the fluid, micrometres"
          yLabel="mmol/L, log"
          logY
          height={185}
        />
        <LayerKey bands={result.layers} />
      </section>

      <section aria-label="Enzyme through the layer">
        <h4 className="text-heading-s">What the peroxide is doing to the enzyme</h4>
        <p className="text-micro text-muted">
          The enzyme is destroyed by what it makes, so the slices with the most peroxide die first.
          On a fresh probe this line is flat; after months it is not.
        </p>
        <Chart
          lines={enzyme}
          xLabel="Depth through the enzyme layer, micrometres"
          yLabel="mol/m3"
          yMax={LAB_FACTS.enzymeLoading}
          height={120}
        />
      </section>

      <section aria-label="Current and kinetics">
        <h4 className="text-heading-s">What the electrode collects</h4>
        <Figures>
          <Figure label="Total current" value={`${result.currentNa.toFixed(3)} nA`} />
          <Figure
            label="From glucose"
            value={`${result.glucoseCurrentNa.toFixed(3)} nA`}
            note={`${((result.glucoseCurrentNa / Math.max(result.currentNa, 1e-9)) * 100).toFixed(1)} %`}
          />
          <Figure label="From paracetamol" value={`${result.paracetamolCurrentNa.toFixed(4)} nA`} />
          <Figure label="From ascorbate" value={`${result.ascorbateCurrentNa.toFixed(4)} nA`} />
          <Figure
            label="Peroxide reaching the platinum"
            value={`${(result.peroxideCapture * 100).toFixed(2)} %`}
          />
          <Figure
            label="Oxygen returned"
            value={`${(result.oxygenReturned * 100).toFixed(2)} %`}
            note={conditions.recycleOxygen ? undefined : "recycling switched off"}
          />
          <Figure
            label="Oxygen limitation"
            value={result.oxygenLimitation.toFixed(4)}
            note="0 is none"
          />
          <Figure
            label="Beta anomer at the enzyme"
            value={`${(result.betaFraction * 100).toFixed(2)} %`}
            note="0.64 in the bulk"
          />
          <Figure label="Thiele modulus" value={result.thiele.toFixed(2)} />
          <Figure
            label="Effectiveness factor"
            value={result.effectiveness.toFixed(2)}
            note="fraction of the enzyme working"
          />
          <Figure
            label="Damkohler number"
            value={result.damkohler.toExponential(1)}
            note="above 1 the membrane decides"
          />
          <Figure
            label="Local pH in the layer"
            value={result.localPh.toFixed(2)}
            note={<Est>buffer capacity</Est>}
          />
        </Figures>
      </section>

      <section aria-label="Impedance spectrum">
        <h4 className="text-heading-s">The impedance, all of it</h4>
        <p className="text-micro text-muted">
          The bench reads one point on this curve, at{" "}
          {LAB_FACTS.probeFrequency.toLocaleString("en-GB")} Hz, which is high enough that the
          double layer is effectively a short and the cell reads its solution resistance. That is
          where a protein film shows. Lower down the curve the charge transfer and the diffusion
          take over and the film disappears into them.
        </p>
        <Chart
          lines={nyquist}
          xLabel="Real part, kohm"
          yLabel="Minus imaginary, kohm"
          height={160}
          caption={`At the probe frequency: ${(result.impedanceAtProbe.magnitude / 1000).toFixed(3)} kohm, phase ${result.impedanceAtProbe.phase.toFixed(1)} degrees.`}
        />
      </section>
    </div>
  );
}
