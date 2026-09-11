/**
 * The magnified view: one station of one probe, blown up until the mechanism
 * is visible.
 *
 * Everything that moves here is driven by the solved model. The number of
 * molecules drawn in a band is its solved concentration; how fast they cross
 * is its permeability; how often the enzyme turns over is its rate law; how
 * often an electron arrives is the current. Under reduced motion everything
 * stops where it is and the numbers keep updating, because the point of the
 * drawing is the arrangement, not the movement.
 *
 * The one thing not to scale is size. A glucose molecule is under a nanometre
 * and the outer membrane is twenty five thousand of them thick; drawn to scale
 * this would be an empty rectangle. So the molecules are drawn large enough to
 * read and their *number* carries the concentration, which is the quantity
 * that matters.
 */

import { useId } from "react";

import { Electron, Molecule, Photon, type Species } from "./molecules.tsx";
import { LIGHT, MOLECULE } from "./palette.ts";
import type { LabSolution } from "./labModel.ts";
import type { Station } from "./stations.ts";

const W = 900;
const H = 360;

/**
 * The drawing's own horizontals.
 *
 * Named rather than repeated, because every stage puts its molecules inside
 * the band and its sentences underneath it, and the two used to overlap when
 * each stage carried its own arithmetic.
 */
const TOP = 40;
const BOTTOM = 268;
/** Where a band's own caption sits: just under it, still attached to it. */
const SUB_Y = 286;
/** The two lines that read the model's numbers out. */
const NOTE_Y = 310;
/** The one sentence that says what the station is for. */
const FOOT_Y = 348;
/** The vertical room molecules are allowed, inside the band. */
const FIELD_TOP = TOP + 26;
const FIELD_BOTTOM = BOTTOM - 22;

type Props = {
  station: Station;
  solution: LabSolution;
  reduced: boolean;
  /** Live figures the caption quotes, already formatted. */
};

/** Deterministic scatter, so the arrangement does not reshuffle on every frame. */
function scatter(seed: number, count: number, x0: number, x1: number, y0: number, y1: number) {
  const out: Array<{ x: number; y: number; phase: number }> = [];
  let a = seed >>> 0;
  const next = () => {
    a = (a * 1664525 + 1013904223) >>> 0;
    return a / 4294967296;
  };
  for (let i = 0; i < count; i += 1) {
    out.push({
      x: x0 + next() * (x1 - x0),
      y: y0 + next() * (y1 - y0),
      phase: next(),
    });
  }
  return out;
}

/**
 * How many to draw for a concentration.
 *
 * Logarithmic, because the species in this stack differ by six orders of
 * magnitude and a linear count would draw either an empty band or a solid one.
 * The scale is stated on the drawing so nobody reads the count as a number.
 */
function countFor(mmol: number, most = 26): number {
  if (!(mmol > 0)) return 0;
  const decades = Math.log10(mmol) + 5;
  return Math.max(1, Math.min(most, Math.round((decades / 6) * most)));
}

/** The concentration the solver has in the enzymatic stack at a depth. */
function enzymaticAt(solution: LabSolution, values: Float64Array, micron: number): number {
  const depths = solution.enzymatic.depthsMicron;
  let best = 0;
  for (let i = 0; i < depths.length; i += 1) {
    if (Math.abs((depths[i] ?? 0) - micron) < Math.abs((depths[best] ?? 0) - micron)) best = i;
  }
  return values[best] ?? 0;
}

/** The middle of a named layer, which is where a stage samples its species. */
function midOf(solution: LabSolution, layer: string): number {
  const band = solution.enzymatic.layers.find((l) => l.name === layer);
  return band ? (band.fromMicron + band.toMicron) / 2 : 0;
}

function Drift({
  children,
  from,
  to,
  y,
  seconds,
  delay,
  reduced,
}: {
  children: React.ReactNode;
  from: number;
  to: number;
  y: number;
  seconds: number;
  delay: number;
  reduced: boolean;
}) {
  if (reduced) {
    return <g transform={`translate(${from + (to - from) * delay} ${y})`}>{children}</g>;
  }
  return (
    <g transform={`translate(${from} ${y})`}>
      {/*
        Additive, not the default. An animateTransform on `transform` replaces
        the element's own transform outright, which put every drifting molecule
        on the top edge of the drawing at x near zero. Summing keeps the static
        translate as the base and animates an offset from it.
      */}
      <animateTransform
        additive="sum"
        attributeName="transform"
        type="translate"
        from={`0 0`}
        to={`${to - from} 0`}
        dur={`${seconds}s`}
        begin={`${-delay * seconds}s`}
        repeatCount="indefinite"
      />
      {children}
    </g>
  );
}

/** Half the rendered width of a band caption, near enough to keep it on the drawing. */
function subHalfWidth(sub: string): number {
  return (sub.length * 11 * 0.6) / 2;
}

function Band({
  x,
  width,
  label,
  sub,
  fill,
  hatch,
}: {
  x: number;
  width: number;
  label: string;
  sub?: string;
  fill: string;
  hatch?: string;
}) {
  return (
    <g>
      <rect x={x} y={TOP} width={width} height={BOTTOM - TOP} fill={fill} />
      {hatch ? (
        <rect x={x} y={TOP} width={width} height={BOTTOM - TOP} fill={`url(#${hatch})`} />
      ) : null}
      <line x1={x} x2={x} y1={TOP} y2={BOTTOM} stroke="#2b3550" strokeWidth={1} />
      <text x={x + width / 2} y={TOP - 12} textAnchor="middle" fontSize={13} fill="#cfd8e6">
        {label}
      </text>
      {sub ? (
        // A band's caption is centred on the band, but pulled back inside the
        // drawing when it is wider than the band it belongs to. Without this a
        // long caption on a band near an edge simply runs off it.
        <text
          x={Math.min(
            W - subHalfWidth(sub) - 6,
            Math.max(subHalfWidth(sub) + 6, x + width / 2),
          )}
          y={SUB_Y}
          textAnchor="middle"
          fontSize={11}
          fill="var(--color-muted)"
          fontFamily="var(--font-mono, monospace)"
        >
          {sub}
        </text>
      ) : null}
    </g>
  );
}

export function Magnified({ station, solution, reduced }: Props) {
  const id = useId().replace(/:/g, "");
  const common = (
    <defs>
      <pattern id={`${id}-poly`} width="9" height="9" patternUnits="userSpaceOnUse">
        <path d="M 0 9 L 9 0" stroke="#ffffff0e" strokeWidth="1" />
        <circle cx="4.5" cy="4.5" r="1.5" fill="#ffffff14" />
      </pattern>
      <pattern id={`${id}-tissue`} width="16" height="16" patternUnits="userSpaceOnUse">
        <path d="M -2 8 q 6 -7 10 0 q 6 7 10 0" fill="none" stroke="#ffffff10" strokeWidth="1.4" />
      </pattern>
      <pattern id={`${id}-gel`} width="14" height="14" patternUnits="userSpaceOnUse">
        <circle cx="7" cy="7" r="1.1" fill="#ffffff12" />
      </pattern>
    </defs>
  );

  const body = (() => {
    switch (station.id) {
      case "e-capsule":
        return <CapsuleStage id={id} solution={solution} reduced={reduced} />;
      case "e-outer":
        return <OuterMembraneStage id={id} solution={solution} reduced={reduced} />;
      case "e-enzyme":
        return <EnzymeStage id={id} solution={solution} reduced={reduced} />;
      case "e-inner":
        return <InnerMembraneStage id={id} solution={solution} reduced={reduced} />;
      case "e-platinum":
        return <PlatinumStage id={id} solution={solution} reduced={reduced} />;
      case "o-capsule":
        return <OpticalCapsuleStage id={id} solution={solution} reduced={reduced} />;
      case "o-gel":
        return <GelStage id={id} solution={solution} reduced={reduced} />;
      default:
        return <FibreStage id={id} solution={solution} reduced={reduced} />;
    }
  })();

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      className="w-full"
      role="img"
      aria-label={`${station.title}. ${station.mechanism}`}
    >
      {common}
      {body}
    </svg>
  );
}

type StageProps = { id: string; solution: LabSolution; reduced: boolean };

// ---------------------------------------------------------------------------
// Enzymatic stations
// ---------------------------------------------------------------------------

function CapsuleStage({ id, solution, reduced }: StageProps) {
  const mid = midOf(solution, "capsule");
  const g = enzymaticAt(solution, solution.profiles.glucose, mid);
  const o = enzymaticAt(solution, solution.profiles.oxygen, mid);

  return (
    <g>
      <Band x={40} width={200} label="Peritoneal fluid" fill="#0f1c33" />
      <Band x={240} width={420} label="Fibrous capsule" sub={`${g.toFixed(2)} mmol/L glucose`} fill="#152238" hatch={`${id}-tissue`} />
      <Band x={660} width={200} label="On towards the membrane" fill="#0f1c33" />

      {scatter(11, countFor(g), 60, 840, FIELD_TOP, FIELD_BOTTOM).map((p, i) => (
        <Drift key={`g${i}`} from={p.x} to={p.x + 190} y={p.y} seconds={9 + (i % 4)} delay={p.phase} reduced={reduced}>
          <Molecule species="glucoseBeta" />
        </Drift>
      ))}
      {scatter(29, countFor(o), 60, 840, FIELD_TOP, FIELD_BOTTOM).map((p, i) => (
        <Drift key={`o${i}`} from={p.x} to={p.x + 260} y={p.y} seconds={5 + (i % 3)} delay={p.phase} reduced={reduced}>
          <Molecule species="oxygen" size={6} />
        </Drift>
      ))}

      {/* The cells that eat a little of it on the way through. */}
      {[320, 430, 545].map((x, i) => (
        <g key={x} transform={`translate(${x} ${118 + (i % 2) * 86})`}>
          <ellipse rx={26} ry={17} fill="#22345a" stroke="#33507f" strokeWidth={1.2} />
          <circle r={5} fill="#3c5c92" />
          <text y={30} textAnchor="middle" fontSize={9.5} fill="var(--color-muted)">
            cell
          </text>
        </g>
      ))}

      <text x={450} y={FOOT_Y} textAnchor="middle" fontSize={11.5} fill="var(--color-muted)">
        Oxygen moves three times faster than glucose here, and both have plenty to spare.
      </text>
    </g>
  );
}

function OuterMembraneStage({ id, solution, reduced }: StageProps) {
  const d = solution.enzymatic;
  const ratio = 2667;
  const outside = midOf(solution, "capsule");
  const inside = midOf(solution, "enzyme layer");
  const outsideGlucose = enzymaticAt(solution, solution.profiles.glucose, outside);
  const insideGlucose = enzymaticAt(solution, solution.profiles.glucose, inside);
  const drop = insideGlucose > 0 ? outsideGlucose / insideGlucose : Infinity;
  const arriving = countFor(outsideGlucose, 14);
  const through = countFor(insideGlucose, 14);
  const oxygen = countFor(enzymaticAt(solution, solution.profiles.oxygen, outside), 16);
  return (
    <g>
      <Band x={40} width={210} label="Capsule side" fill="#152238" hatch={`${id}-tissue`} />
      <Band
        x={250}
        width={400}
        label="Glucose-limiting membrane"
        sub={`${outsideGlucose.toFixed(2)} mmol/L on this side, ${insideGlucose.toFixed(4)} on the far one: ${drop.toFixed(0)} times less, drawn as ${arriving} against ${through} because the count is logarithmic`}
        fill="#1b1f30"
        hatch={`${id}-poly`}
      />
      <Band x={650} width={210} label="Enzyme side" fill="#182a20" hatch={`${id}-gel`} />

      {/* Glucose: many arrive, almost none get through, and slowly. */}
      {scatter(7, arriving, 60, 240, FIELD_TOP, FIELD_BOTTOM).map((p, i) => (
        <Drift key={`gi${i}`} from={p.x} to={250} y={p.y} seconds={7} delay={p.phase} reduced={reduced}>
          <Molecule species="glucoseBeta" />
        </Drift>
      ))}
      {scatter(13, through, 255, 640, FIELD_TOP + 14, FIELD_BOTTOM - 14).map((p, i) => (
        <Drift key={`gm${i}`} from={260} to={660} y={p.y} seconds={26} delay={p.phase} reduced={reduced}>
          <Molecule species="glucoseBeta" />
        </Drift>
      ))}

      {/* Oxygen: straight through, quickly. */}
      {scatter(23, oxygen, 60, 840, FIELD_TOP, FIELD_BOTTOM).map((p, i) => (
        <Drift key={`o${i}`} from={p.x} to={p.x + 300} y={p.y} seconds={4 + (i % 2)} delay={p.phase} reduced={reduced}>
          <Molecule species="oxygen" size={6} />
        </Drift>
      ))}

      <g transform={`translate(450 ${NOTE_Y})`}>
        <text textAnchor="middle" fontSize={12.5} fill={MOLECULE.oxygen}>
          oxygen crosses {ratio.toLocaleString("en-GB")} times more easily than glucose
        </text>
        <text y={20} textAnchor="middle" fontSize={11.5} fill="var(--color-muted)">
          diffusivity and solubility both, which is why the enzyme sees{" "}
          {solution.enzymatic.betaAtEnzymePpm.toFixed(0)} parts per million of its Michaelis
          constant
        </text>
      </g>
      <text x={450} y={FOOT_Y} textAnchor="middle" fontSize={11.5} fill="var(--color-muted)">
        Starving the enzyme is what keeps the response a straight line, all the way to 25 mmol/L.
      </text>
      <text x={0} y={0} fill="none">
        {d.damkohler}
      </text>
    </g>
  );
}

function EnzymeStage({ id, solution, reduced }: StageProps) {
  const turnovers = 4;
  /*
   * One cycle of the drawing is one turnover of one enzyme molecule.
   *
   * The cycle is drawn at a fixed, watchable period and the ratio to the real
   * interval is stated on the drawing, rather than the period being scaled and
   * the ratio hidden. The ratio is worth reading: an enzyme this starved sits
   * idle for minutes between turnovers, which is the whole point of the
   * membrane in front of it, and a drawing that ran at the true rate would
   * appear to be doing nothing at all.
   */
  const DRAWN_PERIOD_S = 4.5;
  const period = DRAWN_PERIOD_S;
  const interval = 1 / Math.max(solution.enzymatic.turnoverPerSecond, 1e-9);
  const speedUp = interval / DRAWN_PERIOD_S;
  return (
    <g>
      <Band x={40} width={150} label="From the membrane" fill="#1b1f30" hatch={`${id}-poly`} />
      <Band
        x={190}
        width={520}
        label="Crosslinked glucose oxidase"
        sub={`one turnover every ${interval.toFixed(0)} s per enzyme, drawn ${speedUp.toFixed(0)} times faster · ${(solution.enzymatic.betaFraction * 100).toFixed(2)} per cent of the glucose here is beta`}
        fill="#182a20"
        hatch={`${id}-gel`}
      />
      <Band x={710} width={150} label="Towards the platinum" fill="#1b2436" />

      {/* The enzyme molecules, each running the two half reactions in turn. */}
      {Array.from({ length: turnovers }, (_, i) => {
        const x = 265 + i * 130;
        const y = 104 + (i % 2) * 84;
        const begin = -(i / turnovers) * period;
        return (
          <g key={i} transform={`translate(${x} ${y})`}>
            <circle r={38} fill="#20402d" stroke="#2f6a45" strokeWidth={1.6} />
            <text y={4} textAnchor="middle" fontSize={11} fill="#9fd6b4" fontFamily="var(--font-mono, monospace)">
              GOx
            </text>
            {/* The flavin, which is what actually changes state. */}
            <circle cx={0} cy={-20} r={6} fill={MOLECULE.electrons}>
              {reduced ? null : (
                <animate
                  attributeName="opacity"
                  values="0.35;1;0.35"
                  dur={`${period}s`}
                  begin={`${begin}s`}
                  repeatCount="indefinite"
                />
              )}
            </circle>

            {/* Half one: a beta glucose arrives and leaves as a lactone. */}
            <g transform="translate(-70 0)">
              {reduced ? (
                <g transform="translate(20 0)">
                  <Molecule species="glucoseBeta" />
                </g>
              ) : (
                <g>
                  <animateTransform
                    additive="sum"
                    attributeName="transform"
                    type="translate"
                    values="0 0; 40 0; 40 0"
                    keyTimes="0;0.4;1"
                    dur={`${period}s`}
                    begin={`${begin}s`}
                    repeatCount="indefinite"
                  />
                  <Molecule species="glucoseBeta" />
                </g>
              )}
            </g>
            <g transform="translate(30 0)">
              {reduced ? (
                <g transform="translate(30 0)">
                  <Molecule species="lactone" />
                </g>
              ) : (
                <g opacity={0}>
                  <animateTransform
                    additive="sum"
                    attributeName="transform"
                    type="translate"
                    values="0 0; 0 0; 62 0"
                    keyTimes="0;0.42;1"
                    dur={`${period}s`}
                    begin={`${begin}s`}
                    repeatCount="indefinite"
                  />
                  <animate
                    attributeName="opacity"
                    values="0;0;1;1"
                    keyTimes="0;0.42;0.5;1"
                    dur={`${period}s`}
                    begin={`${begin}s`}
                    repeatCount="indefinite"
                  />
                  <Molecule species="lactone" />
                </g>
              )}
            </g>

            {/* Half two: only now does oxygen arrive, and it leaves as peroxide. */}
            <g transform="translate(0 -58)">
              {reduced ? (
                <g transform="translate(0 30)">
                  <Molecule species="oxygen" size={6} />
                </g>
              ) : (
                <g>
                  <animateTransform
                    additive="sum"
                    attributeName="transform"
                    type="translate"
                    values="0 0; 0 0; 0 46"
                    keyTimes="0;0.5;0.78"
                    dur={`${period}s`}
                    begin={`${begin}s`}
                    repeatCount="indefinite"
                  />
                  <Molecule species="oxygen" size={6} />
                </g>
              )}
            </g>
            <g transform="translate(0 26)">
              {reduced ? (
                <g transform="translate(0 34)">
                  <Molecule species="peroxide" />
                </g>
              ) : (
                <g opacity={0}>
                  <animateTransform
                    additive="sum"
                    attributeName="transform"
                    type="translate"
                    values="0 0; 0 0; 0 44"
                    keyTimes="0;0.8;1"
                    dur={`${period}s`}
                    begin={`${begin}s`}
                    repeatCount="indefinite"
                  />
                  <animate
                    attributeName="opacity"
                    values="0;0;1;1"
                    keyTimes="0;0.8;0.86;1"
                    dur={`${period}s`}
                    begin={`${begin}s`}
                    repeatCount="indefinite"
                  />
                  <Molecule species="peroxide" />
                </g>
              )}
            </g>
          </g>
        );
      })}

      {/* The alpha anomer, waiting its turn. */}
      <g transform="translate(215 252)">
        <Molecule species="glucoseAlpha" />
        <text x={16} y={4} fontSize={11} fill="var(--color-muted)">
          alpha: the enzyme will not touch it until it turns, and that takes about 100 s
        </text>
      </g>

      <text x={450} y={FOOT_Y} textAnchor="middle" fontSize={11.5} fill="var(--color-muted)">
        Glucose first, oxygen second, never both at once. That is why running out of either one
        looks completely different.
      </text>
    </g>
  );
}

function InnerMembraneStage({ id, solution, reduced }: StageProps) {
  const enzymeMid = midOf(solution, "enzyme layer");
  const count = (values: Float64Array): number =>
    countFor(enzymaticAt(solution, values, enzymeMid), 7);
  const lanes = [
    {
      y: 92,
      species: "peroxide" as Species,
      label: "peroxide: small, neutral, straight through",
      through: true,
      count: count(solution.profiles.peroxide),
    },
    {
      y: 166,
      species: "paracetamol" as Species,
      label: "paracetamol: neutral, so the charge does nothing",
      through: true,
      count: count(solution.profiles.paracetamol),
    },
    {
      y: 240,
      species: "ascorbate" as Species,
      label: "ascorbate: an anion, and the film is negative",
      through: false,
      count: count(solution.profiles.ascorbate),
    },
  ];
  return (
    <g>
      <Band x={40} width={280} label="Enzyme layer" fill="#182a20" hatch={`${id}-gel`} />
      <Band x={320} width={230} label="Permselective film" sub="1 um, negatively charged" fill="#241d33" />
      <Band x={550} width={310} label="Platinum" fill="#2a2e3a" />

      {/* The fixed negative charges that do the work. */}
      {Array.from({ length: 7 }, (_, i) => (
        <text
          key={i}
          x={335 + (i % 2) * 190}
          y={TOP + 22 + i * 30}
          fontSize={15}
          fill="#8d7ad6"
          fontFamily="var(--font-mono, monospace)"
        >
          –
        </text>
      ))}

      {lanes.map((lane, i) => (
        <g key={lane.species}>
          {scatter(41 + i, lane.count, 60, 300, lane.y - 22, lane.y + 22).map((p, j) => (
            <Drift
              key={j}
              from={p.x}
              to={lane.through ? 820 : 330}
              y={p.y}
              seconds={lane.through ? (lane.species === "peroxide" ? 6 : 13) : 5}
              delay={p.phase}
              reduced={reduced}
            >
              <Molecule species={lane.species} size={lane.species === "peroxide" ? 7 : 6} />
            </Drift>
          ))}
          {!lane.through ? (
            <g transform={`translate(342 ${lane.y})`}>
              <path
                d="M 0 -26 L 0 26"
                stroke={MOLECULE.interferent}
                strokeWidth={2}
                strokeDasharray="3 3"
              />
              <text x={8} y={-30} fontSize={10} fill={MOLECULE.interferent}>
                turned away
              </text>
            </g>
          ) : null}
          <text x={60} y={lane.y - 30} fontSize={11} fill="var(--color-muted)">
            {lane.label}
          </text>
        </g>
      ))}

      <text x={450} y={FOOT_Y} textAnchor="middle" fontSize={11.5} fill="var(--color-muted)">
        The film rejects by charge, so it stops the anion and lets the neutral molecule through.
        Paracetamol is neutral.
      </text>
    </g>
  );
}

function PlatinumStage({ id, solution, reduced }: StageProps) {
  void id;
  const captured = solution.enzymatic.peroxideCapture;
  const returned = solution.enzymatic.oxygenReturned;
  const depths = solution.enzymatic.depthsMicron;
  const atElectrode = enzymaticAt(
    solution,
    solution.profiles.peroxide,
    depths[depths.length - 1] ?? 0,
  );
  // What is drawn is the peroxide on its way in, taken from the layer that
  // makes it. The concentration at the surface itself is near nothing, which
  // is a consequence of the reaction rather than a shortage, and the band
  // caption says so rather than the drawing showing an empty film.
  const arriving = countFor(enzymaticAt(solution, solution.profiles.peroxide, midOf(solution, "enzyme layer")), 8);
  // Electrons are charge per unit time, so the current sets how often one
  // arrives rather than how many are drawn. The reference below is the
  // drawing's stated scale, the way the molecule count is: one electron every
  // REFERENCE_SECONDS at REFERENCE_CURRENT_NA.
  const REFERENCE_SECONDS = 2.4;
  const REFERENCE_CURRENT_NA = 0.4;
  const electronSeconds =
    REFERENCE_SECONDS / Math.max(solution.enzymatic.currentNa / REFERENCE_CURRENT_NA, 0.08);
  return (
    <g>
      <Band x={40} width={380} label="Permselective film" fill="#241d33" />
      <Band
        x={420}
        width={240}
        label="Platinum"
        sub={`held at 0.6 V · ${atElectrode.toExponential(1)} mmol/L peroxide left standing at the surface, because it is consumed as fast as it arrives`}
        fill="#39404f"
      />
      <Band x={660} width={200} label="To the amplifier" fill="#0f1c33" />

      {/* Peroxide arrives. */}
      {scatter(61, arriving, 60, 400, FIELD_TOP + 14, FIELD_BOTTOM).map((p, i) => (
        <Drift key={`p${i}`} from={p.x} to={425} y={p.y} seconds={5} delay={p.phase} reduced={reduced}>
          <Molecule species="peroxide" />
        </Drift>
      ))}

      {/* Oxygen leaves, going back the way the peroxide came. */}
      {scatter(67, arriving, 60, 400, FIELD_TOP + 14, FIELD_BOTTOM).map((p, i) => (
        <Drift key={`o${i}`} from={420} to={60} y={p.y + 14} seconds={6} delay={p.phase} reduced={reduced}>
          <Molecule species="oxygen" size={6} />
        </Drift>
      ))}

      {/* Electrons leave into the wire. */}
      {Array.from({ length: 8 }, (_, i) => (
        <Drift
          key={`e${i}`}
          from={520}
          to={860}
          y={186}
          seconds={electronSeconds}
          delay={i / 8}
          reduced={reduced}
        >
          <Electron />
        </Drift>
      ))}
      <line x1={520} x2={860} y1={186} y2={186} stroke={MOLECULE.electrons} strokeWidth={1} opacity={0.35} />

      <g transform="translate(540 120)">
        <text fontSize={12.5} fill="#cfd8e6" fontFamily="var(--font-mono, monospace)">
          H2O2 to O2 + 2H+ + 2e-
        </text>
      </g>

      <g transform={`translate(450 ${NOTE_Y})`}>
        <text textAnchor="middle" fontSize={12.5} fill={MOLECULE.oxygen}>
          {(returned * 100).toFixed(2)} per cent of the oxygen the enzyme spent comes back here
        </text>
        <text y={20} textAnchor="middle" fontSize={11.5} fill="var(--color-muted)">
          because {(captured * 100).toFixed(2)} per cent of the peroxide reaches the platinum rather
          than escaping outwards
        </text>
      </g>
      <text x={450} y={FOOT_Y} textAnchor="middle" fontSize={11.5} fill="var(--color-muted)">
        The probe runs a closed loop on its own oxygen. Starving the fluid barely touches it.
      </text>
    </g>
  );
}

// ---------------------------------------------------------------------------
// Optical stations
// ---------------------------------------------------------------------------

function OpticalCapsuleStage({ id, solution, reduced }: StageProps) {
  const gel = solution.optical.glucose;
  const inGel = gel[gel.length - 1] ?? 0;
  return (
    <g>
      <Band x={40} width={230} label="Peritoneal fluid" fill="#0f1c33" />
      <Band x={270} width={330} label="Fibrous capsule" fill="#152238" hatch={`${id}-tissue`} />
      <Band x={600} width={260} label="Sensing gel" sub={`${inGel.toFixed(2)} mmol/L inside`} fill="#182a20" hatch={`${id}-gel`} />

      {scatter(83, countFor(inGel, 18), 60, 840, FIELD_TOP, FIELD_BOTTOM).map((p, i) => (
        <Drift key={i} from={p.x} to={p.x + 150} y={p.y} seconds={8 + (i % 3)} delay={p.phase} reduced={reduced}>
          <Molecule species="glucoseBeta" />
        </Drift>
      ))}

      <g transform={`translate(600 ${TOP})`}>
        <line y2={BOTTOM - TOP} stroke="#5eead4" strokeWidth={1.4} strokeDasharray="4 4" />
        <text x={8} y={-8} fontSize={11} fill="#5eead4">
          the concentration steps down here without anything being consumed
        </text>
      </g>

      <text x={450} y={FOOT_Y} textAnchor="middle" fontSize={11.5} fill="var(--color-muted)">
        A hydrogel dissolves less glucose than water does, so the gel sits below the fluid even at
        equilibrium. The calibration takes that out.
      </text>
    </g>
  );
}

function GelStage({ id, solution, reduced }: StageProps) {
  const theta = solution.optical.totalOccupancy;
  const byGlucose = solution.optical.glucoseOccupancy;
  const receptors = 12;
  const litByGlucose = Math.round(receptors * byGlucose);
  const litByOther = Math.max(0, Math.round(receptors * theta) - litByGlucose);
  // A fixed scatter of the twelve sites, so occupancy fills the gel evenly and
  // the same sites light up for the same occupancy every render.
  const ORDER = [0, 5, 10, 3, 8, 1, 6, 11, 4, 9, 2, 7];
  const glucoseSites = new Set(ORDER.slice(0, litByGlucose));
  const otherSites = new Set(ORDER.slice(litByGlucose, litByGlucose + litByOther));

  return (
    <g>
      <Band x={40} width={820} label="Boronic acid hydrogel" sub={`${(theta * 100).toFixed(0)} per cent of sites occupied`} fill="#182a20" hatch={`${id}-gel`} />

      {Array.from({ length: receptors }, (_, i) => {
        const col = i % 4;
        const row = Math.floor(i / 4);
        const x = 150 + col * 200;
        const y = 88 + row * 70;
        const lit = glucoseSites.has(i);
        const litOther = otherSites.has(i);
        const on = lit || litOther;
        return (
          <g key={i} transform={`translate(${x} ${y})`}>
            {/* The fluorophore. Dark while the amine is quenching it. */}
            <circle
              r={on ? 21 : 15}
              fill={on ? LIGHT.indicator : "#26333f"}
              opacity={on ? 0.85 : 1}
            />
            {on && !reduced ? (
              <circle r={21} fill="none" stroke={LIGHT.indicator} strokeWidth={1.5}>
                <animate attributeName="r" values="21;33;21" dur="2.4s" repeatCount="indefinite" />
                <animate attributeName="opacity" values="0.7;0;0.7" dur="2.4s" repeatCount="indefinite" />
              </circle>
            ) : null}
            {/* The amine, and the boron that pulls on it. */}
            <text x={-30} y={5} fontSize={11} fill={on ? "#66788a" : "#9fd6b4"} fontFamily="var(--font-mono, monospace)">
              N
            </text>
            <text x={22} y={5} fontSize={11} fill="#c9a34e" fontFamily="var(--font-mono, monospace)">
              B
            </text>
            {lit ? (
              <g transform="translate(44 0)">
                <Molecule species="glucoseBeta" />
              </g>
            ) : null}
            {litOther ? (
              <g transform="translate(44 0)">
                <Molecule species="polyol" />
              </g>
            ) : null}
          </g>
        );
      })}

      <g transform={`translate(450 ${NOTE_Y})`}>
        <text textAnchor="middle" fontSize={12.5} fill={LIGHT.indicator}>
          every occupied site lights up, whatever is sitting in it
        </text>
        <text y={20} textAnchor="middle" fontSize={11.5} fill="var(--color-muted)">
          {(byGlucose * 100).toFixed(0)} per cent of the sites hold glucose and{" "}
          {((theta - byGlucose) * 100).toFixed(0)} per cent hold something else, and the instrument
          calls all of them glucose
        </text>
      </g>
      <text x={450} y={FOOT_Y} textAnchor="middle" fontSize={11.5} fill="var(--color-muted)">
        Which is why an infused polyol makes this probe read high rather than low.
      </text>
    </g>
  );
}

function FibreStage({ id, solution, reduced }: StageProps) {
  void id;
  const o = solution.optical;
  return (
    <g>
      <Band x={40} width={520} label="Gel: indicator and reference dyes mixed together" fill="#182a20" />
      <Band x={560} width={300} label="Optical fibre" fill="#141b2b" />

      {/* The excitation going out. */}
      {[96, 168, 240].map((y, i) => (
        <Drift key={`x${y}`} from={560} to={90} y={y} seconds={2.2} delay={i / 3} reduced={reduced}>
          <Photon kind="excitation" />
        </Drift>
      ))}
      {/* The two emissions coming back. */}
      {[120, 196].map((y, i) => (
        <Drift key={`i${y}`} from={120} to={600} y={y} seconds={2.6} delay={(i + 0.4) / 2} reduced={reduced}>
          <Photon kind="indicator" />
        </Drift>
      ))}
      {[148, 224].map((y, i) => (
        <Drift key={`r${y}`} from={120} to={600} y={y} seconds={2.6} delay={(i + 0.8) / 2} reduced={reduced}>
          <Photon kind="reference" />
        </Drift>
      ))}

      <g transform="translate(600 90)">
        <text fontSize={11.5} fill={LIGHT.excitation}>
          375 nm out
        </text>
        <text y={22} fontSize={11.5} fill={LIGHT.indicator}>
          430 nm back: {o.indicatorCounts.toFixed(0)} counts
        </text>
        <text y={44} fontSize={11.5} fill={LIGHT.reference}>
          520 nm back: {o.referenceCounts.toFixed(0)} counts
        </text>
        <text y={70} fontSize={12.5} fill="#cfd8e6" fontFamily="var(--font-mono, monospace)">
          ratio {o.ratio.toFixed(3)}
        </text>
        <text y={92} fontSize={11.5} fill="var(--color-muted)">
          dye left: {(o.survival * 100).toFixed(1)} per cent
        </text>
      </g>

      <text x={450} y={NOTE_Y} textAnchor="middle" fontSize={12.5} fill="#cfd8e6">
        anything that dims both colours divides out of the ratio
      </text>
      <text x={450} y={FOOT_Y} textAnchor="middle" fontSize={11.5} fill="var(--color-muted)">
        The dye can bleach to half and the reading does not move. Only a difference between the two
        colours survives.
      </text>
    </g>
  );
}
