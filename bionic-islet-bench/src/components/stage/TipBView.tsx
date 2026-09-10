import type { ReactNode } from "react";

import { AGEING, ELECTROCHEMICAL, PHYSIOLOGY } from "../../engine/params.ts";
import { DOT, num } from "../../lib/format.ts";
import { Part, StageSvg } from "./Part.tsx";
import { useLiveState, usePulse, useReducedMotion } from "./useLiveState.ts";
import { crossingPeriodSeconds, electronPeriodSeconds, tipCapsuleRadius } from "./visualMapping.ts";

/**
 * Zoom 4: the electrochemical tip, as a layer stack.
 *
 * Glucose crosses the outer diffusion membrane at a rate the membrane sets,
 * the enzyme turns it over, electrons arrive at the platinum, interferents
 * bounce off the inner membrane or get through, fouling builds on the outer
 * surface and the impedance rises with it.
 *
 * The electron arrival period is the measured current, the crossing period is
 * the local glucose through the modelled membrane permeability, and the
 * fouling band's width is the modelled fouling. None of it is decoration.
 *
 * Layers are named inside themselves rather than from the margins, because a
 * stack this dense cannot carry seven labels around its edges without them
 * fighting each other.
 */

const TOP = 92;
const HEIGHT = 162;
const BOTTOM = TOP + HEIGHT;

const X = {
  fluidStart: 52,
  membraneStart: 262,
  enzymeStart: 344,
  innerStart: 512,
  platinumStart: 574,
  platinumEnd: 606,
  referenceStart: 628,
  referenceEnd: 652,
};

const LANES = Array.from({ length: 7 }, (_, i) => ({
  id: i,
  y: TOP + 20 + i * ((HEIGHT - 40) / 6),
  delay: (i * 0.19).toFixed(2),
}));

export function TipBView() {
  const state = useLiveState();
  const reduced = useReducedMotion();
  const sweep = usePulse(Math.floor((state?.t ?? 0) / 3600), 800);

  if (!state) {
    return <div className="flex h-full items-center justify-center text-micro text-muted">Waiting for the device.</div>;
  }

  const tip = state.tipB;
  const dead = !tip.leadIntact;
  const current = state.readingB.raw;
  const electronPeriod = electronPeriodSeconds(current);
  const crossPeriod = crossingPeriodSeconds(tip.localGlucose, tip.fouling);
  const foulingWidth = 3 + tip.fouling * 54;
  const capsuleWidth = Math.min(150, tipCapsuleRadius(tip.capsuleMicron) * 0.85);
  const interferent = state.paracetamolElapsedS !== null || state.vitaminCElapsedS !== null;
  const oxygenFraction = Math.min(1, state.oxygenMmHg / ELECTROCHEMICAL.oxygenSaturationMmHg);
  const sensitivity =
    state.enzymeActivity * (1 - ELECTROCHEMICAL.foulingSensitivityCoefficient * tip.fouling);

  return (
    <StageSvg viewBox="0 0 920 420" title="Electrochemical tip, layer stack">
      <text x={X.fluidStart} y={64} className="fill-[var(--color-muted)] font-mono text-[12px]">
        peritoneal fluid
      </text>
      <text x={X.referenceEnd} y={64} textAnchor="end" className="fill-[var(--color-muted)] font-mono text-[12px]">
        electrode
      </text>

      {/* Fluid, with the capsule as a band against the membrane. */}
      <Layer
        number="30"
        name="Peritoneal fluid and capsule"
        short="Fluid and capsule"
        value={`${num(tip.localGlucose)} mmol/L, capsule ${num(tip.capsuleMicron, 0)} um`}
        detail="What the tip sits in. The fibrous capsule slows glucose reaching the membrane, and the peritoneal oxygen is what the enzyme needs, which is why this tip has a ceiling the optical one does not."
        x={X.fluidStart}
        width={X.membraneStart - X.fluidStart}
        fill="#101a30"
      >
        <rect
          x={X.membraneStart - capsuleWidth}
          y={TOP}
          width={capsuleWidth}
          height={HEIGHT}
          fill="#1c2743"
          opacity="0.7"
          data-bound="capsule-tip-b"
        />
      </Layer>

      {/* Glucose crossing towards the enzyme. */}
      {!dead
        ? LANES.map((lane) => (
            <circle
              key={`g-${lane.id}`}
              className={reduced ? undefined : "particle"}
              cx={X.fluidStart + 10}
              cy={lane.y}
              r={5}
              fill="#5eead4"
              opacity={reduced ? 0.6 : undefined}
              style={
                reduced
                  ? undefined
                  : {
                      animationName: "travel-x",
                      animationDuration: `${crossPeriod}s`,
                      animationDelay: `${lane.delay}s`,
                      ["--travel" as string]: `${X.enzymeStart - X.fluidStart - 4}px`,
                    }
              }
            />
          ))
        : null}

      {/* Fouling, growing outwards from the membrane into the fluid. */}
      <Part
        number="31"
        name="Protein fouling"
        value={`${num(tip.fouling * 100, 1)} %`}
        detail="Protein laid down on the outer surface. It lowers sensitivity by 0.6 times the fouling and raises impedance by one plus three times the fouling. That impedance rise is the evidence that lets the supervisor blame this tip rather than guess."
        x={X.fluidStart}
        y={BOTTOM + labelRow("31")}
      >
        <rect
          x={X.membraneStart - foulingWidth}
          y={TOP}
          width={foulingWidth}
          height={HEIGHT}
          fill="#8a7038"
          opacity="0.9"
          data-bound="fouling"
        />
      </Part>

      <Layer
        number="32"
        name="Outer diffusion membrane"
        short="Outer membrane"
        value={`crossing every ${num(crossPeriod, 2)} s`}
        detail="Limits how fast glucose reaches the enzyme, which is what keeps the electrode linear at high glucose. Fouling on top of it slows the crossing further."
        x={X.membraneStart}
        width={X.enzymeStart - X.membraneStart}
        fill="#243055"
      />

      <Layer
        number="33"
        name="Glucose oxidase layer"
        short="Glucose oxidase"
        value={`${num(state.enzymeActivity * 100, 1)} % activity`}
        detail={`Turns glucose and oxygen into gluconolactone and hydrogen peroxide. Activity falls to one over e in ${AGEING.enzymeTauDays} days. Without oxygen it stops.`}
        x={X.enzymeStart}
        width={X.innerStart - X.enzymeStart}
        fill="#123a3a"
      >
        <text x={X.enzymeStart + 46} y={BOTTOM - 10} className="fill-[var(--color-muted)] font-mono text-[11px]">
          oxygen {num(oxygenFraction * 100, 0)} %
        </text>
      </Layer>

      {/* Interferents bouncing off the inner membrane. */}
      {interferent && !dead
        ? LANES.slice(0, 4).map((lane) => (
            <circle
              key={`i-${lane.id}`}
              className={reduced ? undefined : "particle"}
              cx={X.enzymeStart + 20}
              cy={lane.y + 7}
              r={4}
              fill="#fde68a"
              opacity={reduced ? 0.75 : undefined}
              style={
                reduced
                  ? undefined
                  : {
                      animationName: "bounce-off",
                      animationDuration: "2.2s",
                      animationDelay: `${lane.delay}s`,
                      ["--travel" as string]: `${X.innerStart - X.enzymeStart - 26}px`,
                    }
              }
            />
          ))
        : null}

      {/* Electrons arriving at the platinum. The period is the current. */}
      {!dead
        ? LANES.map((lane) => (
            <circle
              key={`e-${lane.id}`}
              className={reduced ? undefined : "particle"}
              cx={X.enzymeStart + 30}
              cy={lane.y - 7}
              r={3.4}
              fill="#ccfbf1"
              opacity={reduced ? 0.8 : undefined}
              data-bound={lane.id === 0 ? "electron" : undefined}
              style={
                reduced
                  ? undefined
                  : {
                      animationName: "travel-x",
                      animationDuration: `${electronPeriod}s`,
                      animationDelay: `${lane.delay}s`,
                      ["--travel" as string]: `${X.platinumStart - X.enzymeStart - 30}px`,
                    }
              }
            />
          ))
        : null}

      <Layer
        number="34"
        name="Inner rejection membrane"
        short="Inner membrane"
        value={interferent ? "interferent present" : "clear"}
        detail="Meant to keep paracetamol and vitamin C away from the platinum. It is imperfect: what gets through is read as glucose, and nothing in the electrode can tell the difference."
        x={X.innerStart}
        width={X.platinumStart - X.innerStart}
        fill="#2a2440"
      />

      <Layer
        number="35"
        name="Platinum working electrode"
        short="Platinum"
        value={dead ? "open circuit" : `${num(current, 2)} nA`}
        detail="Oxidises the peroxide and counts the electrons. The current is the measurement. Everything upstream is about making sure the electrons that arrive came from glucose."
        x={X.platinumStart}
        width={X.platinumEnd - X.platinumStart}
        fill={dead ? "#3a4560" : "#8a93a8"}
      />

      <Layer
        number="36"
        name="Silver, silver chloride reference"
        short="Reference"
        value={`${num(state.referenceDriftMv, 2)} mV drift`}
        detail="Holds the potential the working electrode is measured against. Its chloride reserve depletes, so the potential drifts and adds a slow current offset that a one-point calibration cannot fully remove."
        x={X.referenceStart}
        width={X.referenceEnd - X.referenceStart}
        fill="#3a4560"
      />

      {/* Instrument panel for this tip. */}
      <g transform={`translate(694 ${TOP})`}>
        <text x={0} y={-14} className="fill-[var(--color-muted)] font-mono text-[12px]">
          impedance at 1 kHz
        </text>
        <rect x={0} y={0} width={172} height={14} rx={4} fill="#101a30" />
        <rect
          x={0}
          y={0}
          width={Math.min(
            172,
            dead ? 172 : (state.impedanceKohm / (ELECTROCHEMICAL.impedanceBaseKohm * 6)) * 172,
          )}
          height={14}
          rx={4}
          fill={dead ? "#fde68a" : "#0d9488"}
          opacity={0.75 + sweep * 0.25}
          className="transition-[width] duration-[var(--duration-settled)] ease-[var(--ease-medsync)]"
        />
        <text x={0} y={34} className="fill-[#e8edf5] font-mono text-[14px]">
          {dead ? "open circuit" : `${num(state.impedanceKohm, 2)} kOhm`}
        </text>
        <text x={0} y={52} className="fill-[var(--color-muted)] font-mono text-[11px]">
          fresh baseline {num(ELECTROCHEMICAL.impedanceBaseKohm, 2)} kOhm
        </text>

        <text x={0} y={96} className="fill-[#e8edf5] font-mono text-[16px]">
          I = {dead ? "--" : `${num(current, 2)} nA`}
        </text>
        <text x={0} y={116} className="fill-[var(--color-muted)] font-mono text-[11px]">
          {num(state.readingB.glucose)} +- {num(state.readingB.uncertainty, 2)} mmol/L
        </text>
        <text x={0} y={140} className="fill-[var(--color-muted)] font-mono text-[11px]">
          sensitivity {num(sensitivity * 100, 1)} % of new
        </text>
        <text x={0} y={158} className="fill-[var(--color-muted)] font-mono text-[11px]">
          lag {num(PHYSIOLOGY.tauCapsuleBaseMin + PHYSIOLOGY.tauCapsulePerMicron * tip.capsuleMicron, 1)} min
        </text>
      </g>

      <text x={X.fluidStart} y={408} className="fill-[var(--color-muted)] font-mono text-[12px]">
        glucose crossing every {num(crossPeriod, 2)} s {DOT} electron arriving every {num(electronPeriod, 3)} s {DOT} day{" "}
        {num(tip.ageDays, 1)}
        {interferent ? ` ${DOT} interferent present, read as glucose` : ""}
      </text>
      {reduced ? (
        <text x={880} y={408} textAnchor="end" className="fill-[var(--color-muted)] font-mono text-[12px]">
          motion frozen, values live
        </text>
      ) : null}
    </StageSvg>
  );
}

/**
 * One layer of the stack, named inside itself. The bracket number sits at the
 * top of the layer, the short name runs up it, and the full name and current
 * value are on hover and focus like every other part on the bench.
 */
/**
 * Three rows under the stack, assigned so that no two labels on the same row
 * can reach each other. Seven names will not fit on one line at this width.
 */
const LABEL_ROW: Record<string, number> = {
  "30": 30,
  "33": 30,
  "36": 30,
  "32": 62,
  "35": 62,
  "31": 94,
  "34": 94,
};

function labelRow(number: string): number {
  return LABEL_ROW[number] ?? 30;
}

function Layer({
  number,
  name,
  short,
  value,
  detail,
  x,
  width,
  fill,
  children,
}: {
  number: string;
  name: string;
  short: string;
  value: string;
  detail: string;
  x: number;
  width: number;
  fill: string;
  children?: ReactNode;
}) {
  const narrow = width < 90;
  return (
    <Part number={number} name={name} value={value} detail={detail} x={x} y={BOTTOM + labelRow(number)}>
      <rect x={x} y={TOP} width={width} height={HEIGHT} fill={fill} stroke="#2c3b5c" strokeWidth="1" />
      {children}
      <text x={x + 6} y={TOP + 16} className="fill-[var(--color-teal-bright)] font-mono text-[12px]">
        [{number}]
      </text>
      <text
        transform={`translate(${x + (narrow ? width / 2 + 5 : 20)} ${BOTTOM - 24}) rotate(-90)`}
        className="fill-[#cfd8e6] text-[13px]"
      >
        {short}
      </text>
    </Part>
  );
}
