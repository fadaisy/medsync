/**
 * The places in a probe worth magnifying, and what each one is for.
 *
 * A probe is a stack of films and the interesting thing about it is that a
 * different mechanism dominates in each one. Scanning a lens along it and
 * stopping where something happens is how you read it; a chart of the whole
 * profile tells you the numbers but not the story.
 *
 * Each station carries the question it answers, so the reader knows what they
 * are looking for before they look, and the number that answers it comes out
 * of the solved model rather than out of this file.
 */

import type { LabConditions } from "./labModel.ts";

export type ProbeId = "enzymatic" | "optical";

/**
 * What the lens is over.
 *
 * A layer name is matched against the solved stack, so the lens sits on the
 * real thing at its real thickness and moves when the thickness does. The two
 * faces are not layers: the platinum and the fibre are where the stack ends,
 * so they are named rather than measured.
 */
export type Site = { kind: "layer"; layer: string } | { kind: "face" };

export type Station = {
  id: string;
  probe: ProbeId;
  site: Site;
  /** The conditions that visibly change this station, and only those. */
  controls: readonly (keyof LabConditions)[];
  short: string;
  title: string;
  /** What to look for, before looking. */
  question: string;
  /** The mechanism, in plain words. The numbers come from the model. */
  mechanism: string;
};

export const STATIONS: readonly Station[] = [
  {
    id: "e-capsule",
    probe: "enzymatic",
    site: { kind: "layer", layer: "capsule" },
    controls: ["capsuleMicron", "foulingFraction", "glucoseMmol"],
    short: "Capsule",
    title: "The tissue the body grew",
    question: "Is the capsule the bottleneck everyone assumes it is?",
    mechanism:
      "Glucose and oxygen both cross it easily. Cells in the capsule eat a little glucose on the way through, but a film this thin barely depletes anything: what it costs the probe is time, not signal. The capsule matters because it grows, and because it grows on the two tips at different rates.",
  },
  {
    id: "e-outer",
    probe: "enzymatic",
    site: { kind: "layer", layer: "outer membrane" },
    controls: ["glucoseMmol", "oxygenMmHg"],
    short: "Outer membrane",
    title: "The bottleneck, on purpose",
    question: "Why put a barrier in front of a sensor?",
    mechanism:
      "Glucose oxidase half saturates at 25 mmol/L, which is inside the range a person lives in, so an unprotected enzyme would flatten out exactly where the readings matter. This membrane starves it. Glucose crawls through a hydrophobic polymer it barely dissolves in; oxygen, small and uncharged, sails past. That ratio is the entire design.",
  },
  {
    id: "e-enzyme",
    probe: "enzymatic",
    site: { kind: "layer", layer: "enzyme layer" },
    controls: ["glucoseMmol", "temperatureC"],
    short: "Enzyme layer",
    title: "Two half reactions, never at once",
    question: "What does the enzyme actually do with a glucose?",
    mechanism:
      "It takes the beta anomer only, hands two hydrogens to its flavin and lets the lactone go. Then, separately, oxygen arrives and takes the hydrogens away as peroxide. No ternary complex, which is why starving it of either substrate looks so different. The alpha anomer has to turn into beta first, and that takes a hundred seconds.",
  },
  {
    id: "e-inner",
    probe: "enzymatic",
    site: { kind: "layer", layer: "inner membrane" },
    controls: ["paracetamolMmol"],
    short: "Permselective film",
    title: "One film, three fates",
    question: "How do you let peroxide through and keep everything else out?",
    mechanism:
      "By charge. Peroxide is small and neutral and passes. Ascorbate is an anion and a negatively charged film turns it away almost completely. Paracetamol is also neutral, so the film hardly touches it, and that is the leak that fools the probe.",
  },
  {
    id: "e-platinum",
    probe: "enzymatic",
    site: { kind: "face" },
    controls: ["oxygenMmHg", "recycleOxygen"],
    short: "Platinum",
    title: "The electrode gives the oxygen back",
    question: "Where does the current come from, and what is left behind?",
    mechanism:
      "Peroxide gives up two electrons at the platinum and leaves as oxygen. One oxygen for every one the enzyme spent, and almost all of the peroxide gets here. So the probe runs a closed loop on its own oxygen, and starving the fluid of it does far less than a supply calculation says.",
  },
  {
    id: "o-capsule",
    probe: "optical",
    site: { kind: "layer", layer: "capsule" },
    controls: ["capsuleMicron", "glucoseMmol"],
    short: "Capsule",
    title: "Getting to the gel",
    question: "What arrives at the sensing layer?",
    mechanism:
      "The same tissue as the other tip, and the same small loss to the cells in it. What reaches the gel is a little less than what is in the fluid, and a little later. The gel then dissolves less glucose than water does, so the concentration steps down again at its face without anything being consumed.",
  },
  {
    id: "o-gel",
    probe: "optical",
    site: { kind: "layer", layer: "gel" },
    controls: ["glucoseMmol", "polyolMmol"],
    short: "Sensing gel",
    title: "The boron cannot tell which diol",
    question: "How does binding a sugar make light?",
    mechanism:
      "An amine next to the fluorophore quenches it. When the boronic acid catches a diol, the boron pulls on that amine's lone pair, the quenching stops and the molecule lights up. It has no way of knowing which diol it caught, so a fructose or an infused mannitol lights it up exactly as a glucose would.",
  },
  {
    id: "o-fibre",
    probe: "optical",
    site: { kind: "face" },
    controls: ["flashes", "glucoseMmol"],
    short: "Fibre face",
    title: "Two colours, one flash",
    question: "Why measure a ratio instead of a brightness?",
    mechanism:
      "A second dye is mixed in that ignores glucose entirely. One flash excites both; the indicator answers in blue and the reference in teal. Anything that dims them both, a fading lamp, a dirtier window, the dye itself bleaching, divides out. Only a difference between the two colours survives, and there is very little that produces one.",
  },
];

export function stationsFor(probe: ProbeId): Station[] {
  return STATIONS.filter((s) => s.probe === probe);
}
