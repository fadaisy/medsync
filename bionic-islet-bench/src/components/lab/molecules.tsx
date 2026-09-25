/**
 * The drawing vocabulary for the magnified views.
 *
 * One shape per species, used at the same size everywhere, so that a reader
 * who learns the green hexagon is glucose learns it once and can then read
 * every station without a legend.
 *
 * Shapes as well as colours, because colour alone is not allowed to carry
 * meaning on a clinical surface and because these drawings are dense enough
 * that two similar hues would blur into each other.
 */

import { LIGHT, MOLECULE } from "./palette.ts";

export type Species =
  | "glucoseBeta"
  | "glucoseAlpha"
  | "oxygen"
  | "peroxide"
  | "lactone"
  | "gluconate"
  | "paracetamol"
  | "ascorbate"
  | "polyol";

export const SPECIES_LABEL: Readonly<Record<Species, string>> = {
  glucoseBeta: "beta glucose, the one the enzyme takes",
  glucoseAlpha: "alpha glucose, waiting to turn",
  oxygen: "oxygen",
  peroxide: "hydrogen peroxide",
  lactone: "gluconolactone",
  gluconate: "gluconate, the acid",
  paracetamol: "paracetamol",
  ascorbate: "ascorbate",
  polyol: "infused polyol",
};

const COLOUR: Readonly<Record<Species, string>> = {
  glucoseBeta: MOLECULE.glucose,
  glucoseAlpha: MOLECULE.glucose,
  oxygen: MOLECULE.oxygen,
  peroxide: MOLECULE.peroxide,
  lactone: MOLECULE.lactone,
  gluconate: MOLECULE.gluconate,
  paracetamol: MOLECULE.interferent,
  ascorbate: MOLECULE.interferent,
  polyol: MOLECULE.interferent,
};

/** A hexagon, for a pyranose ring. */
function hexPoints(r: number): string {
  return Array.from({ length: 6 }, (_, i) => {
    const angle = (Math.PI / 3) * i - Math.PI / 6;
    return `${(r * Math.cos(angle)).toFixed(2)},${(r * Math.sin(angle)).toFixed(2)}`;
  }).join(" ");
}

/**
 * One molecule.
 *
 * Glucose is a hexagon because it is a six-membered ring, and the alpha anomer
 * is the same hexagon hollow, because it is the same molecule with one bond
 * pointing the other way and the enzyme will not touch it until it has turned.
 * Oxygen is a pair of small circles, peroxide the same pair with a bar between
 * them, and the interferents are grey squares, which is the shape that says
 * "not part of this reaction".
 */
export function Molecule({ species, size = 7 }: { species: Species; size?: number }) {
  const colour = COLOUR[species];
  switch (species) {
    case "glucoseBeta":
      return <polygon points={hexPoints(size)} fill={colour} />;
    case "glucoseAlpha":
      return (
        <polygon points={hexPoints(size)} fill="none" stroke={colour} strokeWidth={1.6} />
      );
    case "polyol":
      // An open chain rather than a ring: a polyol is what a sugar looks like
      // when it has been reduced and cannot close.
      return (
        <path
          d={`M ${-size} 0 L ${-size / 3} ${-size / 2} L ${size / 3} ${size / 2} L ${size} 0`}
          fill="none"
          stroke={colour}
          strokeWidth={1.8}
          strokeLinecap="round"
        />
      );
    case "oxygen":
      return (
        <g fill={colour}>
          <circle cx={-size * 0.42} cy={0} r={size * 0.46} />
          <circle cx={size * 0.42} cy={0} r={size * 0.46} />
        </g>
      );
    case "peroxide":
      return (
        <g>
          <rect
            x={-size * 0.5}
            y={-size * 0.13}
            width={size}
            height={size * 0.26}
            fill={colour}
          />
          <circle cx={-size * 0.5} cy={0} r={size * 0.44} fill={colour} />
          <circle cx={size * 0.5} cy={0} r={size * 0.44} fill={colour} />
        </g>
      );
    case "lactone":
      return (
        <polygon points={hexPoints(size)} fill={colour} opacity={0.85} />
      );
    case "gluconate":
      return (
        <g>
          <path
            d={`M ${-size} ${size * 0.3} L 0 ${-size * 0.4} L ${size} ${size * 0.3}`}
            fill="none"
            stroke={colour}
            strokeWidth={1.8}
            strokeLinecap="round"
          />
          <text
            x={size * 1.15}
            y={-size * 0.3}
            fontSize={size * 1.1}
            fill={colour}
            fontFamily="var(--font-mono, monospace)"
          >
            -
          </text>
        </g>
      );
    default:
      return (
        <rect
          x={-size * 0.7}
          y={-size * 0.7}
          width={size * 1.4}
          height={size * 1.4}
          fill={colour}
          rx={1}
        />
      );
  }
}

/** An electron, for the wire. */
export function Electron({ size = 4 }: { size?: number }) {
  return <circle r={size} fill={MOLECULE.electrons} />;
}

/** A photon, drawn as a short wave so it does not read as a molecule. */
export function Photon({
  kind,
  length = 26,
}: {
  kind: "excitation" | "indicator" | "reference";
  length?: number;
}) {
  const colour =
    kind === "excitation" ? LIGHT.excitation : kind === "indicator" ? LIGHT.indicator : LIGHT.reference;
  const step = length / 4;
  return (
    <path
      d={`M 0 0 q ${step / 2} -4 ${step} 0 q ${step / 2} 4 ${step} 0 q ${step / 2} -4 ${step} 0 q ${step / 2} 4 ${step} 0`}
      fill="none"
      stroke={colour}
      strokeWidth={1.8}
      strokeLinecap="round"
    />
  );
}

export const MOLECULE_COLOUR = COLOUR;
