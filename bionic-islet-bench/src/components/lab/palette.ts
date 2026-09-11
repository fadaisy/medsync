/**
 * The molecular colour convention.
 *
 * One colour per species, used everywhere the lens view draws that species:
 * in a profile, in a legend, in a label. A reader who learns that green is
 * glucose learns it once.
 *
 * **Red is not in this file.** The bench reserves red for the insulin path and
 * for an invalid state, and nothing in the chemistry is either of those. The
 * peroxide is coral, which is deliberately close enough to read as "the
 * reactive one" and deliberately far enough not to be mistaken for the red the
 * rest of the bench uses to mean danger. The colour audit checks that.
 */

export const MOLECULE = {
  glucose: "#639922",
  oxygen: "#378add",
  peroxide: "#d85a30",
  electrons: "#7f77dd",
  interferent: "#888780",
  lactone: "#9aa870",
  gluconate: "#b08a3e",
} as const;

export const LIGHT = {
  excitation: "#7f77dd",
  indicator: "#378add",
  reference: "#1d9e75",
} as const;

export type MoleculeKey = keyof typeof MOLECULE;

/** Every colour the lab draws chemistry in, for the audit to check. */
export const CHEMISTRY_COLOURS: readonly string[] = [
  ...Object.values(MOLECULE),
  ...Object.values(LIGHT),
];
