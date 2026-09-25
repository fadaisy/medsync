/**
 * Focus: the probe under a lens.
 *
 * The device stage zooms four times, from the body down to a tip, and stops
 * at the layer stack. This is the level below that. A lens sits on one film of
 * the real stack, drawn at its real thickness, and underneath it that film is
 * blown up until the mechanism inside it is visible: the molecules that arrive,
 * what happens to them, and what leaves.
 *
 * Three rules hold it together.
 *
 * The strip is to scale and the detail is not. The stack really is a hundred
 * and fourteen microns of which one is the permselective film, and the strip
 * says so; the detail then shows that one micron at a hundred and fourteen
 * times the strip's scale, and states the factor rather than leaving the
 * reader to assume the drawing is proportionate. Molecule sizes inside the
 * detail are not to scale either, and could not be: a glucose is under a
 * nanometre. What carries the concentration is how many are drawn.
 *
 * Nothing here is an illustration of the model. Every figure quoted, and every
 * count of molecules on the drawing, came out of the same solver the bench
 * runs, on conditions set below the drawing. Change the oxygen and the enzyme
 * station changes.
 *
 * Each station shows only the conditions it actually responds to. The whole
 * set of dials on every view invites the reader to hunt for an effect; three
 * dials that all do something invites them to try each one.
 */

import type { Experiment } from "./experiments.ts";
import type { Station } from "./stations.ts";
import { useMemo, useState } from "react";

import { useReducedMotion } from "../stage/useLiveState.ts";
import { EXPERIMENTS } from "./experiments.ts";
import { DEFAULT_CONDITIONS, solve, type LabConditions, type LabSolution } from "./labModel.ts";
import { Magnified } from "./Magnified.tsx";
import { LIGHT, MOLECULE } from "./palette.ts";
import { Est, Figure, Figures } from "./Readout.tsx";
import { stationsFor, type ProbeId } from "./stations.ts";

const STRIP_W = 900;
const STRIP_H = 112;
/** The part of the strip that is drawn to scale. */
const SCALE_X0 = 2;
const SCALE_X1 = 890;
/** The face at the end of the stack, which has no thickness to draw. */
const FACE_X0 = 890;
const FACE_X1 = 898;

/** Band tops and bottoms, so the lens and the flare cannot drift from them. */
const BAND_TOP = 18;
const BAND_BOTTOM = 54;
const LENS_TOP = 12;
const LENS_BOTTOM = 60;

/** The same fills the magnified view uses, so the strip and the detail agree. */
const LAYER_FILL: Readonly<Record<string, string>> = {
  boundary: "#0f1c33",
  fouling: "#3b2f22",
  capsule: "#152238",
  "outer membrane": "#1b1f30",
  "enzyme layer": "#182a20",
  "inner membrane": "#241d33",
  gel: "#182a20",
};

const LAYER_NAME: Readonly<Record<string, string>> = {
  boundary: "Unstirred fluid",
  fouling: "Fouling",
  capsule: "Capsule",
  "outer membrane": "Glucose-limiting membrane",
  "enzyme layer": "Enzyme",
  "inner membrane": "Permselective film",
  gel: "Sensing gel",
};

export function Focus() {
  const [probe, setProbe] = useState<ProbeId>("enzymatic");
  const [stationId, setStationId] = useState("e-outer");
  const [conditions, setConditions] = useState<LabConditions>(DEFAULT_CONDITIONS);
  // A preset is remembered only so its claim can stay on screen while the
  // reader looks at it. Touching any dial drops it, because the claim was made
  // about particular conditions and no longer holds once they move.
  const [preset, setPreset] = useState<{ experiment: Experiment; side: "left" | "right" } | null>(
    null,
  );
  const reduced = useReducedMotion();

  const solution = useMemo(() => solve(conditions), [conditions]);
  const stations = stationsFor(probe);
  const station = stations.find((s) => s.id === stationId) ?? stations[0]!;
  const lens = lensFor(station, solution, probe);

  const pickProbe = (next: ProbeId): void => {
    setProbe(next);
    setStationId(stationsFor(next)[1]?.id ?? stationsFor(next)[0]!.id);
  };

  const runPreset = (experiment: Experiment, side: "left" | "right"): void => {
    setPreset({ experiment, side });
    setConditions(experiment[side].conditions);
    setProbe(experiment.panel);
    setStationId(experiment.station);
  };

  const change = (next: LabConditions): void => {
    setPreset(null);
    setConditions(next);
  };

  const step = (delta: number): void => {
    const index = stations.findIndex((s) => s.id === station.id);
    const next = stations[Math.min(stations.length - 1, Math.max(0, index + delta))];
    if (next) setStationId(next.id);
  };

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="border-edge flex flex-wrap items-center justify-between gap-2 border-b pb-2">
        <div role="group" aria-label="Probe" className="flex gap-1">
          {(["enzymatic", "optical"] as const).map((id) => (
            <Chip key={id} on={probe === id} onClick={() => pickProbe(id)}>
              {id === "enzymatic" ? "Tip B, enzymatic" : "Tip A, optical"}
            </Chip>
          ))}
        </div>
        <p className="text-micro text-muted">
          Simulation from first principles with literature-derived constants. Not calibrated against
          this device, which does not yet exist.
        </p>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto pt-2 pr-1">
        <section
          aria-label={station.title}
          className="border-edge bg-panel-raised rounded-[var(--radius-card)] border p-2"
        >
          <div
            role="group"
            aria-label="Station"
            className="mb-1.5 flex flex-wrap gap-1"
            onKeyDown={(event) => {
              if (event.key === "ArrowRight") {
                event.preventDefault();
                step(1);
              } else if (event.key === "ArrowLeft") {
                event.preventDefault();
                step(-1);
              }
            }}
          >
            {stations.map((item) => (
              <Chip key={item.id} on={item.id === station.id} onClick={() => setStationId(item.id)}>
                {item.short}
              </Chip>
            ))}
          </div>

          <h3 className="text-heading-s mt-1">{station.question}</h3>
          <p className="text-micro text-muted">{station.title}</p>

          {/*
            The strip and the drawing are one diagram and share one box.
            Sharing it is what lets the flare from the lens land exactly on the
            corners of the drawing: both are 900 units wide rendered at the same
            width, so their coordinates agree without anything being measured.
            It is also why they scroll together, and why they never scroll below
            the width at which the drawing's own labels stop being readable.
          */}
          <div className="mt-1 overflow-x-auto">
            <div key={station.id} className="focus-in min-w-[620px]">
              <Strip solution={solution} probe={probe} lens={lens} />
              <Magnified station={station} solution={solution} reduced={reduced} />
            </div>
          </div>

          <p className="text-micro text-muted mt-1">
            {lens.width > 0 ? (
              <>
                The lens is on {formatMicron(lens.width)} of a {formatMicron(lens.total)} stack, and
                the drawing shows it{" "}
                <span className="font-mono">{(lens.total / lens.width).toFixed(1)}</span> times
                closer than the strip.
              </>
            ) : (
              <>
                The lens is on the face where the stack ends, which is a surface rather than a
                thickness. Everything drawn happens within a few nanometres of it.
              </>
            )}{" "}
            The strip is to scale; the molecules are not, and could not be, so what carries a
            concentration is how many are drawn. That count is logarithmic, because the species in
            one stack differ by six orders of magnitude: a band with twice as many molecules in it
            holds far more than twice as much.
          </p>

          <p className="text-body-s mt-2 max-w-[68ch]">{station.mechanism}</p>

          <Figures>
            {readingsFor(station, solution, conditions).map((reading) => (
              <Figure
                key={reading.label}
                label={reading.label}
                value={reading.value}
                note={reading.est ? <Est /> : undefined}
              />
            ))}
          </Figures>
        </section>

        <Controls station={station} conditions={conditions} onChange={change} />

        <Presets preset={preset} onRun={runPreset} onClear={() => setPreset(null)} />
      </div>
    </div>
  );
}

function Chip({
  on,
  onClick,
  children,
}: {
  on: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={on}
      className={`text-micro rounded-[var(--radius-control)] border px-2 py-1 transition-colors duration-[var(--duration-instant)] ease-[var(--ease-medsync)] ${
        on
          ? "border-teal-bright bg-teal-bright/15 text-teal-bright"
          : "border-edge text-muted hover:border-teal-bright hover:text-teal-bright"
      }`}
    >
      {children}
    </button>
  );
}

// ---------------------------------------------------------------------------
// The strip, and where the lens sits on it
// ---------------------------------------------------------------------------

type Lens = {
  /** Pixel span on the strip. */
  x0: number;
  x1: number;
  /** Real thickness under the lens, microns. Zero for a face. */
  width: number;
  total: number;
  name: string;
};

function lensFor(station: Station, solution: LabSolution, probe: ProbeId): Lens {
  const layers = probe === "enzymatic" ? solution.enzymatic.layers : solution.optical.layers;
  const total = layers[layers.length - 1]?.toMicron ?? 1;
  const toX = (micron: number): number =>
    SCALE_X0 + (micron / total) * (SCALE_X1 - SCALE_X0);

  // Pulled out of the station so the narrowing survives into the callback
  // below, which it would not for a mutable property.
  const site = station.site;
  if (site.kind === "face") {
    return {
      x0: FACE_X1 - 26,
      x1: FACE_X1,
      width: 0,
      total,
      name: probe === "enzymatic" ? "Platinum" : "Fibre face",
    };
  }
  const band = layers.find((l) => l.name === site.layer);
  const name = LAYER_NAME[site.layer] ?? site.layer;
  if (!band) return { x0: SCALE_X0, x1: SCALE_X1, width: total, total, name };

  // A film a micron thick is a fraction of a pixel on a strip this wide, which
  // is exactly the point being made, so the lens is widened to stay visible
  // rather than the band being widened to flatter it.
  const centre = (toX(band.fromMicron) + toX(band.toMicron)) / 2;
  const half = Math.max(13, (toX(band.toMicron) - toX(band.fromMicron)) / 2);
  return {
    x0: Math.max(SCALE_X0, centre - half),
    x1: Math.min(FACE_X1, centre + half),
    width: band.toMicron - band.fromMicron,
    total,
    name,
  };
}

function Strip({
  solution,
  probe,
  lens,
}: {
  solution: LabSolution;
  probe: ProbeId;
  lens: Lens;
}) {
  const layers = probe === "enzymatic" ? solution.enzymatic.layers : solution.optical.layers;
  const total = layers[layers.length - 1]?.toMicron ?? 1;
  const toX = (micron: number): number =>
    SCALE_X0 + (micron / total) * (SCALE_X1 - SCALE_X0);

  // The lens names what it is on, on the same line as the band names, so a
  // band whose name would run into it goes unnamed for as long as the lens is
  // there. The chips above name every band whatever the lens is doing.
  const lensLabel = lens.name + (lens.width > 0 ? ` · ${formatMicron(lens.width)}` : "");
  const lensLabelHalf = textWidth(lensLabel, 10.5) / 2;
  const lensLabelX = Math.min(
    STRIP_W - lensLabelHalf - 5,
    Math.max(lensLabelHalf + 5, (lens.x0 + lens.x1) / 2),
  );
  const clearOfLens = (x: number, width: number): boolean =>
    x + width / 2 < lensLabelX - lensLabelHalf - 6 ||
    x - width / 2 > lensLabelX + lensLabelHalf + 6;

  return (
    <svg
      viewBox={`0 0 ${STRIP_W} ${STRIP_H}`}
      className="w-full"
      role="img"
      aria-label={`The whole ${probe} stack, ${formatMicron(total)} of it, with the lens on one film.`}
    >
      {layers.map((band) => {
        const x = toX(band.fromMicron);
        const width = toX(band.toMicron) - x;
        const name = LAYER_NAME[band.name] ?? band.name;
        return (
          <g key={band.name}>
            <rect
              x={x}
              y={BAND_TOP}
              width={Math.max(width, 0.4)}
              height={BAND_BOTTOM - BAND_TOP}
              fill={LAYER_FILL[band.name] ?? "#151b28"}
              stroke="#2b3550"
              strokeWidth={0.6}
            />
            {/*
              A name only where its own band has room for it. The thin films are
              the point of the strip, so they are left unlabelled here rather
              than given a label that would run over their neighbours; the lens
              names whichever one it is on, and the chips above name them all.
            */}
            {fits(name, width) && clearOfLens(x + width / 2, textWidth(name)) ? (
              <text
                x={x + width / 2}
                y={11}
                textAnchor="middle"
                fontSize={10}
                fill="var(--color-muted)"
              >
                {name}
              </text>
            ) : null}
          </g>
        );
      })}

      {/* The face. A surface, so it is drawn as an edge rather than a band. */}
      <rect
        x={FACE_X0}
        y={BAND_TOP - 3}
        width={FACE_X1 - FACE_X0}
        height={BAND_BOTTOM - BAND_TOP + 6}
        fill={probe === "enzymatic" ? "#39404f" : "#3a4a63"}
      />

      {/* The lens, and the flare that says the drawing below is what is under it. */}
      <polygon
        points={`${lens.x0},${LENS_BOTTOM} ${lens.x1},${LENS_BOTTOM} ${STRIP_W},${STRIP_H} 0,${STRIP_H}`}
        fill="var(--color-teal-bright)"
        opacity={0.07}
      />
      <line
        x1={lens.x0}
        y1={LENS_BOTTOM}
        x2={0}
        y2={STRIP_H}
        stroke="var(--color-teal-bright)"
        strokeWidth={1}
        opacity={0.5}
      />
      <line
        x1={lens.x1}
        y1={LENS_BOTTOM}
        x2={STRIP_W}
        y2={STRIP_H}
        stroke="var(--color-teal-bright)"
        strokeWidth={1}
        opacity={0.5}
      />
      <rect
        x={lens.x0}
        y={LENS_TOP}
        width={lens.x1 - lens.x0}
        height={LENS_BOTTOM - LENS_TOP}
        rx={3}
        fill="var(--color-teal-bright)"
        fillOpacity={0.1}
        stroke="var(--color-teal-bright)"
        strokeWidth={1.6}
      />
      <text x={lensLabelX} y={11} textAnchor="middle" fontSize={10.5} fill="var(--color-teal-bright)">
        {lensLabel}
      </text>
    </svg>
  );
}

/**
 * Roughly how wide a label will render, so a band can be asked whether it has
 * room for its own name. Measuring the text properly would need the DOM and a
 * layout pass; this is a ratio for the interface font at these sizes and it
 * only has to be right enough to decide between drawing and not drawing.
 */
function textWidth(text: string, fontSize = 10): number {
  return text.length * fontSize * 0.58;
}

function fits(text: string, width: number): boolean {
  return textWidth(text) + 10 <= width;
}

/** Microns, at a precision that does not pretend to more than the model has. */
function formatMicron(value: number): string {
  if (value >= 100) return `${value.toFixed(0)} um`;
  if (value >= 10) return `${value.toFixed(1)} um`;
  return `${value.toFixed(2)} um`;
}

// ---------------------------------------------------------------------------
// The figures each station answers its own question with
// ---------------------------------------------------------------------------

type Reading = { label: string; value: string; est?: boolean };

/** Nearest solved cell to a depth, which is how the profile is sampled. */
function sampleAt(depths: Float64Array, values: Float64Array, micron: number): number {
  let best = 0;
  for (let i = 0; i < depths.length; i += 1) {
    if (Math.abs((depths[i] ?? 0) - micron) < Math.abs((depths[best] ?? 0) - micron)) best = i;
  }
  return values[best] ?? 0;
}

function bandOf(solution: LabSolution, probe: ProbeId, name: string) {
  const layers = probe === "enzymatic" ? solution.enzymatic.layers : solution.optical.layers;
  return layers.find((l) => l.name === name);
}

function readingsFor(
  station: Station,
  solution: LabSolution,
  conditions: LabConditions,
): Reading[] {
  const e = solution.enzymatic;
  const o = solution.optical;

  switch (station.id) {
    case "e-capsule": {
      const inner = bandOf(solution, "enzymatic", "capsule")?.toMicron ?? 0;
      const arriving = sampleAt(e.depthsMicron, solution.profiles.glucose, inner);
      const lost = conditions.glucoseMmol > 0 ? 1 - arriving / conditions.glucoseMmol : 0;
      return [
        { label: "Glucose in the fluid", value: `${conditions.glucoseMmol.toFixed(2)} mmol/L` },
        { label: "Reaching the membrane", value: `${arriving.toFixed(2)} mmol/L` },
        { label: "Eaten crossing the capsule", value: `${(lost * 100).toFixed(1)} per cent` },
        {
          label: "Impedance at the probe frequency",
          value: `${(e.impedanceAtProbe.magnitude / 1000).toFixed(2)} kOhm`,
          est: true,
        },
      ];
    }
    case "e-outer":
      return [
        {
          label: "What the enzyme sees, as its Michaelis constant",
          value: `${e.betaAtEnzymePpm.toFixed(1)} parts per million`,
        },
        { label: "Thiele modulus", value: e.thiele.toFixed(2) },
        { label: "Effectiveness factor", value: e.effectiveness.toFixed(3) },
        { label: "Current", value: `${e.currentNa.toFixed(3)} nA` },
      ];
    case "e-enzyme":
      return [
        {
          label: "Beta anomer where the enzyme is",
          value: `${(e.betaFraction * 100).toFixed(2)} per cent`,
        },
        { label: "Oxygen limitation", value: `${(e.oxygenLimitation * 100).toFixed(2)} per cent` },
        { label: "pH inside the layer", value: e.localPh.toFixed(3) },
        { label: "Damkohler number", value: e.damkohler.toExponential(2) },
      ];
    case "e-inner":
      return [
        { label: "Current from glucose", value: `${e.glucoseCurrentNa.toFixed(3)} nA` },
        { label: "Current from paracetamol", value: `${e.paracetamolCurrentNa.toFixed(3)} nA` },
        { label: "Current from ascorbate", value: `${e.ascorbateCurrentNa.toFixed(4)} nA` },
        {
          label: "Paracetamol as a share of the reading",
          value:
            e.currentNa > 0
              ? `${((e.paracetamolCurrentNa / e.currentNa) * 100).toFixed(1)} per cent`
              : "0 per cent",
        },
      ];
    case "e-platinum":
      return [
        {
          label: "Peroxide reaching the platinum",
          value: `${(e.peroxideCapture * 100).toFixed(2)} per cent`,
        },
        {
          label: "Oxygen given back to the layer",
          value: `${(e.oxygenReturned * 100).toFixed(2)} per cent`,
        },
        { label: "Total current", value: `${e.currentNa.toFixed(3)} nA` },
        {
          label: "Impedance at the probe frequency",
          value: `${(e.impedanceAtProbe.magnitude / 1000).toFixed(1)} kOhm`,
          est: true,
        },
      ];
    case "o-capsule": {
      const gelFace = bandOf(solution, "optical", "gel")?.fromMicron ?? 0;
      const outside = sampleAt(o.depthsMicron, o.glucose, gelFace - 1);
      const inside = sampleAt(o.depthsMicron, o.glucose, gelFace + 1);
      return [
        { label: "Glucose in the fluid", value: `${conditions.glucoseMmol.toFixed(2)} mmol/L` },
        { label: "At the gel face, outside", value: `${outside.toFixed(2)} mmol/L` },
        { label: "Just inside the gel", value: `${inside.toFixed(2)} mmol/L` },
        {
          label: "Time for the stack to follow a step",
          value: `${o.responseSeconds.toFixed(0)} s`,
        },
      ];
    }
    case "o-gel":
      return [
        { label: "Sites occupied", value: `${(o.totalOccupancy * 100).toFixed(1)} per cent` },
        {
          label: "Of those, holding glucose",
          value:
            o.totalOccupancy > 0
              ? `${((o.glucoseOccupancy / o.totalOccupancy) * 100).toFixed(1)} per cent`
              : "0 per cent",
        },
        { label: "Dissociation constant", value: `${o.dissociationMmol.toFixed(2)} mmol/L` },
        { label: "Quantum yield", value: o.quantumYield.toFixed(4) },
      ];
    default:
      return [
        { label: "Indicator, 430 nm", value: `${o.indicatorCounts.toFixed(0)} counts` },
        { label: "Reference, 520 nm", value: `${o.referenceCounts.toFixed(0)} counts` },
        { label: "Ratio", value: o.ratio.toFixed(4) },
        {
          label: "Reading",
          value: `${o.readingMmol.toFixed(2)} plus or minus ${o.uncertaintyMmol.toFixed(2)} mmol/L`,
        },
      ];
  }
}

// ---------------------------------------------------------------------------
// Six claims, each with the conditions that show it
// ---------------------------------------------------------------------------

/**
 * Presets over the same dials the reader already has.
 *
 * Each one states its claim before it is run, so the claim can be wrong, and
 * each is asserted against the solver in the test suite. Nothing here is a
 * separate mode: every one of them can be reached by moving the dials by hand,
 * and moving any dial drops the claim rather than leaving it standing over
 * conditions it was not made about.
 */
function Presets({
  preset,
  onRun,
  onClear,
}: {
  preset: { experiment: Experiment; side: "left" | "right" } | null;
  onRun: (experiment: Experiment, side: "left" | "right") => void;
  onClear: () => void;
}) {
  return (
    <section aria-label="Things to try" className="mt-2">
      <div className="flex flex-wrap gap-1">
        {EXPERIMENTS.map((item) => (
          <Chip
            key={item.id}
            on={preset?.experiment.id === item.id}
            onClick={() =>
              preset?.experiment.id === item.id ? onClear() : onRun(item, "right")
            }
          >
            {item.title}
          </Chip>
        ))}
      </div>

      {preset ? (
        <div className="border-edge bg-panel-raised mt-1.5 rounded-[var(--radius-card)] border p-2">
          <p className="text-body-s max-w-[80ch]">{preset.experiment.question}</p>
          <p className="text-micro text-muted mt-1 max-w-[80ch]">{preset.experiment.claim}</p>
          <div role="group" aria-label="Compare" className="mt-1.5 flex flex-wrap gap-1">
            {(["left", "right"] as const).map((side) => (
              <Chip
                key={side}
                on={preset.side === side}
                onClick={() => onRun(preset.experiment, side)}
              >
                {preset.experiment[side].label}
              </Chip>
            ))}
          </div>
        </div>
      ) : null}
    </section>
  );
}

// ---------------------------------------------------------------------------
// Only the dials this station responds to
// ---------------------------------------------------------------------------

type Dial = {
  label: string;
  min: number;
  max: number;
  step: number;
  format: (value: number) => string;
  /** What to watch on the drawing when this moves. */
  watch: string;
  colour?: string;
};

const DIALS: Readonly<Record<string, Dial>> = {
  glucoseMmol: {
    label: "Glucose in the fluid",
    min: 1,
    max: 30,
    step: 0.5,
    format: (v) => `${v.toFixed(1)} mmol/L`,
    watch: "how many green hexagons there are",
    colour: MOLECULE.glucose,
  },
  oxygenMmHg: {
    label: "Oxygen",
    min: 1,
    max: 100,
    step: 1,
    format: (v) => `${v.toFixed(0)} mmHg`,
    watch: "the blue pairs, and how little else changes when there are fewer of them",
    colour: MOLECULE.oxygen,
  },
  temperatureC: {
    label: "Temperature",
    min: 32,
    max: 42,
    step: 0.1,
    format: (v) => `${v.toFixed(1)} C`,
    watch: "the turnover rate, and the beta fraction with it",
  },
  capsuleMicron: {
    label: "Capsule",
    min: 0,
    max: 200,
    step: 5,
    format: (v) => `${v.toFixed(0)} um`,
    watch: "the strip above: this band is the one that grows",
  },
  paracetamolMmol: {
    label: "Paracetamol",
    min: 0,
    max: 0.6,
    step: 0.02,
    format: (v) => `${v.toFixed(2)} mmol/L`,
    watch: "the grey squares that the charged film does not stop",
    colour: MOLECULE.interferent,
  },
  polyolMmol: {
    label: "Infused polyol",
    min: 0,
    max: 6,
    step: 0.25,
    format: (v) => `${v.toFixed(2)} mmol/L`,
    watch: "which sites light up, and what is sitting in them",
    colour: MOLECULE.interferent,
  },
  foulingFraction: {
    label: "Fouling",
    min: 0,
    max: 1,
    step: 0.05,
    format: (v) => `${(v * 100).toFixed(0)} per cent`,
    watch: "the impedance, which is the only figure here that notices",
  },
  flashes: {
    label: "Flashes already fired",
    min: 0,
    max: 3_000_000,
    step: 50_000,
    format: (v) => v.toLocaleString("en-GB"),
    watch: "the counts falling while the ratio does not",
    colour: LIGHT.indicator,
  },
};

function Controls({
  station,
  conditions,
  onChange,
}: {
  station: Station;
  conditions: LabConditions;
  onChange: (next: LabConditions) => void;
}) {
  const set = <K extends keyof LabConditions>(key: K, value: LabConditions[K]): void =>
    onChange({ ...conditions, [key]: value });

  return (
    <section aria-label="Conditions" className="mt-2 grid min-w-0 gap-x-5 gap-y-1.5 lg:grid-cols-2">
      {station.controls.map((key) => {
        if (key === "recycleOxygen") {
          return (
            <label key={key} className="text-micro flex min-w-0 items-center gap-2">
              <span className="text-muted w-32 shrink-0">Oxygen recycling</span>
              <input
                type="checkbox"
                checked={conditions.recycleOxygen}
                onChange={(event) => set("recycleOxygen", event.target.checked)}
                className="accent-[var(--color-teal-bright)]"
              />
              <span className="text-muted min-w-0 flex-1">
                A model switch, not a state of the device. Turn it off to see what the loop is
                worth.
              </span>
            </label>
          );
        }
        const dial = DIALS[key];
        if (!dial) return null;
        const value = conditions[key] as number;
        return (
          <label key={key} className="text-micro flex min-w-0 items-center gap-2">
            <span
              className="w-24 shrink-0 sm:w-32"
              style={dial.colour ? { color: dial.colour } : undefined}
            >
              {dial.label}
            </span>
            <input
              type="range"
              min={dial.min}
              max={dial.max}
              step={dial.step}
              value={value}
              onChange={(event) => set(key, Number(event.target.value) as never)}
              className="min-w-0 flex-1 accent-[var(--color-teal-bright)]"
              aria-valuetext={dial.format(value)}
            />
            <span className="w-20 shrink-0 text-right font-mono sm:w-24">{dial.format(value)}</span>
          </label>
        );
      })}
      <p className="text-micro text-muted lg:col-span-2">
        Watch:{" "}
        {station.controls
          .map((key) =>
            key === "recycleOxygen"
              ? "what the current does when the loop is broken"
              : DIALS[key]?.watch,
          )
          .filter(Boolean)
          .join("; ")}
        .
      </p>
    </section>
  );
}
