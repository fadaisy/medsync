/**
 * The trace palette, kept out of the component so the colour rules can be
 * asserted in a test without importing React or a canvas.
 *
 * Red never appears here except on the insulin path and the invalid state.
 * The canvas is not in the document, so the DOM colour audit cannot see it;
 * this module is what the audit's canvas half checks instead.
 */

import type { Sample } from "../engine/types.ts";
import type { HourAggregate } from "../worker/protocol.ts";

export const GLUCOSE_MIN = 2;
export const GLUCOSE_MAX = 20;

/** The one red on the traces: insulin delivery. */
export const INSULIN_COLOUR = "#dc2626";

export type Series = {
  id: string;
  label: string;
  shortLabel: string;
  colour: string;
  dash: number[];
  width: number;
  /** Drawn behind the rest, at reduced opacity: the truth and the comparator. */
  ghost?: boolean;
  minute: (s: Sample) => number | null;
  hour: (h: HourAggregate) => number | null;
};

export const SERIES: Series[] = [
  {
    id: "plasma",
    label: "Plasma glucose (the truth, not measured)",
    shortLabel: "Plasma, the truth",
    colour: "#e8edf5",
    dash: [5, 4],
    width: 1.25,
    ghost: true,
    minute: (s) => s.plasma,
    hour: (h) => h.plasmaMean,
  },
  {
    id: "subcutaneous",
    label: "Subcutaneous comparator (never dosed on)",
    shortLabel: "Subcutaneous, comparator",
    colour: "#9aa4b2",
    dash: [2, 5],
    width: 1.25,
    ghost: true,
    minute: (s) => s.subcutaneous,
    hour: (h) => h.subcutaneousMean,
  },
  {
    id: "peritoneal",
    label: "Peritoneal glucose",
    shortLabel: "Peritoneal",
    colour: "#ccfbf1",
    dash: [],
    width: 1,
    ghost: true,
    minute: (s) => s.peritoneal,
    hour: (h) => h.peritonealMean,
  },
  {
    id: "a",
    label: "Glucose A, optical tip",
    shortLabel: "Tip A, optical",
    colour: "#0d9488",
    dash: [],
    width: 1.5,
    minute: (s) => s.glucoseA,
    hour: () => null,
  },
  {
    id: "b",
    label: "Glucose B, electrochemical tip",
    shortLabel: "Tip B, electrochemical",
    colour: "#5eead4",
    dash: [6, 3],
    width: 1.5,
    minute: (s) => s.glucoseB,
    hour: () => null,
  },
  {
    id: "fused",
    label: "Fused output",
    shortLabel: "Fused",
    colour: "#ffffff",
    dash: [],
    width: 2,
    minute: (s) => s.fused,
    hour: (h) => h.fusedMean,
  },
];

export const STATE_COLOUR: Record<string, string> = {
  valid: "#0d9488",
  "doubtful-one": "#fde68a",
  invalid: "#dc2626",
  bridged: "#9aa4b2",
};

