import { AGEING, ELECTROCHEMICAL, OPTICAL, PHYSIOLOGY } from "../engine/params.ts";
import { num } from "../lib/format.ts";
import { benchData } from "../store/benchData.ts";
import { useBench } from "../store/bench.ts";
import { ModelTag } from "./ModelTag.tsx";
import { Panel } from "./Panel.tsx";

type Row = {
  label: string;
  value: string;
  unit: string;
  note: string;
  emphasis?: boolean;
};

/** The live instrument readouts, in the units the front ends work in. */
export function Readouts() {
  useBench((s) => s.tick);
  const state = benchData.state;
  if (!state) {
    return (
      <Panel title="Live readouts">
        <p className="text-micro text-muted">Waiting for the first acquisition.</p>
      </Panel>
    );
  }

  const daysSinceImplant = state.tipA.ageDays;
  const daysSinceCal =
    state.lastCalibrationT === null ? null : (state.t - state.lastCalibrationT) / 86_400;
  const bleachPct =
    (1 - Math.exp(-state.tipA.flashes / AGEING.photobleachHalfScaleFlashes)) * 100;

  const rows: Row[] = [
    {
      label: "Fluorescence ratio R",
      value: num(state.readingA.raw, 3),
      unit: "",
      note: `Optical front end. R = ${OPTICAL.ratioZero} + ${OPTICAL.ratioPerMmol} per mmol/L, plus temperature and noise.`,
      emphasis: true,
    },
    {
      label: "Electrode current I",
      value: num(state.readingB.raw, 2),
      unit: "nA",
      note: `Electrochemical front end. ${ELECTROCHEMICAL.currentZeroNa} nA background plus ${ELECTROCHEMICAL.currentPerMmolNa} nA per mmol/L at full enzyme activity.`,
      emphasis: true,
    },
    {
      label: "Impedance at 10 kHz",
      value:
        state.impedanceKohm >= ELECTROCHEMICAL.impedanceOpenCircuitKohm
          ? "open"
          : num(state.impedanceKohm, 2),
      unit: state.impedanceKohm >= ELECTROCHEMICAL.impedanceOpenCircuitKohm ? "" : "kOhm",
      note: "Swept once per simulated hour. Rises with fouling and capsule; a step change means membrane damage or a lead fracture.",
    },
    {
      label: "Tip temperature",
      value: state.thermistorOk ? num(state.tipTemperatureC, 2) : "assumed 37.00",
      unit: "degC",
      note: state.thermistorOk
        ? "Thermistor reading. Both front ends are compensated against it."
        : "The thermistor has failed, so compensation falls back to 37.0 degC and both bands are widened.",
    },
    {
      label: "Capsule, tip A",
      value: num(state.tipA.capsuleMicron, 1),
      unit: "um",
      note: `Fibrous capsule. Adds ${PHYSIOLOGY.tauCapsulePerMicron} min of lag per micrometre. Tip A carries the dexamethasone collar.`,
    },
    {
      label: "Capsule, tip B",
      value: num(state.tipB.capsuleMicron, 1),
      unit: "um",
      note: "Tip B has no steroid collar, so its capsule grows faster than tip A's.",
    },
    {
      label: "Photobleaching",
      value: num(bleachPct, 1),
      unit: "%",
      note: `One flash per acquisition, half-scale ${AGEING.photobleachHalfScaleFlashes.toLocaleString("en-GB")} flashes. Raises noise, not the ratio.`,
    },
    {
      label: "Enzyme activity",
      value: num(state.enzymeActivity * 100, 1),
      unit: "%",
      note: `Glucose oxidase falls to 1/e in ${AGEING.enzymeTauDays} days.`,
    },
    {
      label: "Membrane fouling",
      value: num(state.tipB.fouling * 100, 1),
      unit: "%",
      note: "Lowers sensitivity and raises impedance. Separate from the capsule.",
    },
    {
      label: "Reference drift",
      value: num(state.referenceDriftMv, 2),
      unit: "mV",
      note: `Silver chloride depletion, ${AGEING.chlorideDriftMvPerDay} mV/day, accelerating past day ${AGEING.chlorideKneeDay}.`,
    },
    {
      label: "Peritoneal oxygen",
      value: num(state.oxygenMmHg, 1),
      unit: "mmHg",
      note: "Limits the enzyme reaction in the part of the signal above 12 mmol/L.",
    },
    {
      label: "Days since implant",
      value: num(daysSinceImplant, 2),
      unit: "days",
      note: "Simulated time since tip A went in. A tip exchange resets it for that tip.",
    },
    {
      label: "Days since calibration",
      value: daysSinceCal === null ? "never" : num(daysSinceCal, 2),
      unit: daysSinceCal === null ? "" : "days",
      note: "Widens the reported uncertainty on both channels until a finger-prick resets it.",
    },
    {
      label: "Insulin on board",
      value: num(state.iob, 2),
      unit: "U",
      note: "Insulin delivered above the nominal basal rate, decaying with a 100 min time constant. May go negative after a suspend.",
    },
  ];

  return (
    <Panel title="Live readouts" subtitle="Front-end quantities and ageing state">
      <dl className="grid grid-cols-[1fr_auto] gap-x-3 gap-y-0">
        {rows.map((row) => (
          <div key={row.label} className="contents">
            <dt className="border-t border-edge/60 py-1 text-micro text-muted">
              {row.label}
              <ModelTag note={row.note} />
            </dt>
            <dd
              className={`tabular border-t border-edge/60 py-1 text-right text-small ${
                row.emphasis ? "text-[#e8edf5]" : "text-[#cfd8e6]"
              }`}
            >
              {row.value}
              {row.unit ? <span className="ml-1 text-micro text-muted">{row.unit}</span> : null}
            </dd>
          </div>
        ))}
      </dl>
    </Panel>
  );
}
