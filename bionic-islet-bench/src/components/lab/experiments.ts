import type { LabConditions } from "./labModel.ts";

import { DEFAULT_CONDITIONS } from "./labModel.ts";

/**
 * Six preset experiments.
 *
 * Each one is a claim the physics makes that the bench's linearised front end
 * could not have made, together with the conditions that show it. They are
 * presets over the same controls the reader has anyway: nothing here is a
 * special mode, and every one of them can be reached by moving the sliders.
 */

export type Experiment = {
  id: string;
  title: string;
  /** What to look at, in one sentence. */
  question: string;
  /** The answer, stated before the reader runs it, so it can be wrong. */
  claim: string;
  panel: "optical" | "enzymatic";
  /** Conditions to compare, left and right. */
  left: { label: string; conditions: LabConditions };
  right: { label: string; conditions: LabConditions };
};

const base = DEFAULT_CONDITIONS;

export const EXPERIMENTS: readonly Experiment[] = [
  {
    id: "membrane",
    title: "Why the membrane is there",
    question:
      "Glucose oxidase half saturates at 25 mmol/L, which is inside the clinical range. So why is the response a straight line?",
    claim:
      "Because the outer membrane starves it. At 25 mmol/L outside, the enzyme sees about 25 parts per million of its Michaelis constant, so it never leaves the first order part of its own curve.",
    panel: "enzymatic",
    left: { label: "6 mmol/L", conditions: { ...base, glucoseMmol: 6 } },
    right: { label: "25 mmol/L", conditions: { ...base, glucoseMmol: 25 } },
  },
  {
    id: "oxygen",
    title: "The electrode gives the oxygen back",
    question:
      "Peritoneal oxygen is about half arterial, and the enzyme needs one oxygen per glucose. Why does starving it of oxygen do so little?",
    claim:
      "Because oxidising peroxide at the platinum returns one oxygen for each one the enzyme spent, and almost all of the peroxide gets there. Switch the recycling off, which is a model switch and not a state of the device, and the same probe at 2 mmHg loses half its current.",
    panel: "enzymatic",
    left: {
      label: "2 mmHg, recycling on",
      conditions: { ...base, glucoseMmol: 12, oxygenMmHg: 2 },
    },
    right: {
      label: "2 mmHg, recycling off",
      conditions: { ...base, glucoseMmol: 12, oxygenMmHg: 2, recycleOxygen: false },
    },
  },
  {
    id: "bleaching",
    title: "Half the dye, the same reading",
    question: "The excitation destroys the indicator. Why does the reading not drift as it fades?",
    claim:
      "Because both dyes are excited by the same flash with the same cross-section, so they die at the same fractional rate and their ratio does not move. The counts halve and the reading does not.",
    panel: "optical",
    left: { label: "new probe", conditions: { ...base, flashes: 0 } },
    right: {
      label: "half the dye gone",
      conditions: { ...base, flashes: Math.round(Math.log(2) / 4e-7) },
    },
  },
  {
    id: "polyol",
    title: "A polyol reads as glucose",
    question:
      "The receptor binds a diol. Mannitol is a diol. What does an osmotherapy infusion do to the reading?",
    claim:
      "The switch is the boron holding a diol and it cannot tell which diol. Every occupied site lights up, the instrument attributes all of them to glucose, and the reading goes up rather than down.",
    panel: "optical",
    left: { label: "no mannitol", conditions: { ...base, polyolMmol: 0 } },
    right: { label: "3 mmol/L mannitol", conditions: { ...base, polyolMmol: 3 } },
  },
  {
    id: "acid",
    title: "The layer acidifies itself",
    question: "The enzyme makes an acid. Where does it go?",
    claim:
      "Nowhere fast. Gluconate is anionic, so the same membrane that let the glucose in traps it, and the enzyme layer runs a pH unit or more below the body at high glucose. Nothing in the model reads that number, because no pH dependence of glucose oxidase is declared and inventing one would be inventing physics.",
    panel: "enzymatic",
    left: { label: "6 mmol/L", conditions: { ...base, glucoseMmol: 6 } },
    right: { label: "25 mmol/L", conditions: { ...base, glucoseMmol: 25 } },
  },
  {
    id: "impedance",
    title: "Where the fouling shows",
    question:
      "A protein film raises the solution resistance. Why was it nearly invisible at 1 kHz?",
    claim:
      "Because at 1 kHz the double layer shunts most of the cell and the measurement is reading a capacitor. The protein film the bench's fault deposits moves the magnitude by 20 per cent there, under the 35 per cent step the supervisor flags on, so it goes unseen. Move up to 10 kHz, where that capacitor is effectively a short and the cell reads its solution resistance, and the same film moves it by 83 per cent.",
    panel: "enzymatic",
    left: { label: "clean", conditions: { ...base, foulingFraction: 0 } },
    right: {
      // The level the bench's protein deposition fault actually applies, so
      // the number on this card is the number the scenarios see.
      label: "protein film",
      conditions: { ...base, foulingFraction: 0.35 },
    },
  },
];
