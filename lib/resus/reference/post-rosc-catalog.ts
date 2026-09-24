import type { RefEntry } from "@/lib/resus/reference/ref";
import type { AbcdeLetter } from "@/lib/resus/types";

import { indexRefs } from "@/lib/resus/reference/ref";

/**
 * Resus v2 post-ROSC reference — the resus-phase post-resuscitation bundle and
 * the post-ROSC survey pins.
 *
 * Transcribed from docs/clinical/resus-post-rosc-clinical-catalog.md (CSO-signed
 * at GATE A, 2026-09-23). Every RCUK-PRC25 / RCUK-SC25 value matched the primary
 * page verbatim on 2026-09-23. House defaults: SpO₂ 94–98 % (D2), MAP ≥ 65 and
 * SBP > 100 (D3). No AHA number is displayed; the desk makes no prognostic
 * statement (PR-NEVER-01).
 */

const VERIFIED_ON = "2026-09-23";

const SOURCES = {
  "RCUK-PRC25":
    "https://www.resus.org.uk/professional-library/2025-resuscitation-guidelines/post-resuscitation-care-guidelines",
  "RCUK-SC25":
    "https://www.resus.org.uk/professional-library/2025-resuscitation-guidelines/special-circumstances-guidelines",
  "RCUK-ETH25":
    "https://www.resus.org.uk/professional-library/2025-resuscitation-guidelines/ethics-guidelines",
} as const;
type SourceCode = keyof typeof SOURCES;

export type PostRoscDomain = AbcdeLetter | "Cause" | "Family" | null;

export interface PostRoscBundleItem {
  id: string;
  domain: PostRoscDomain;
  /** Checklist text (catalog "Item"). */
  text: string;
  /** The catalog's "Target / number" column carries a number (not "—" / NOT ENCODED). */
  showsNumber: boolean;
  /**
   * A done / not-indicated / not-available item (PR-NEVER-01 is a standing rule
   * and PR-B-04 a caveat on the SpO₂ row — neither is a task).
   */
  checklist: boolean;
}

function ref(id: string, text: string, sources: SourceCode[], value?: string): RefEntry {
  return {
    id,
    text,
    ...(value ? { value } : {}),
    source: sources.join(", "),
    url: SOURCES[sources[0]!],
    verifiedOn: VERIFIED_ON,
    confidence: "verified-web",
    status: "signed",
  };
}

/** [id, domain, text, target (undefined = "—" / NOT ENCODED), sources]. */
const BUNDLE_ROWS: [string, PostRoscDomain, string, string | undefined, SourceCode[]][] = [
  [
    "PR-A-01",
    "A",
    "Comatose, or another indication for sedation/ventilation → tracheal intubation by an experienced operator, confirmed by waveform capnography",
    undefined,
    ["RCUK-PRC25"],
  ],
  [
    "PR-A-02",
    "A",
    "No skilled intubator available → keep / insert a supraglottic or basic airway until one is",
    undefined,
    ["RCUK-PRC25"],
  ],
  [
    "PR-A-03",
    "A",
    "Brief arrest with immediate return of normal cerebral function and breathing: airway support may not be needed; give O₂ if SpO₂ < 94 %",
    "SpO₂ < 94 %",
    ["RCUK-PRC25"],
  ],
  [
    "PR-B-01",
    "B",
    "Maximum available O₂ until SpO₂ is reliable or PaO₂ measured, then titrate",
    undefined,
    ["RCUK-PRC25"],
  ],
  ["PR-B-02", "B", "Titrate to SpO₂ 94–98 % (house default D2)", "94–98 %", ["RCUK-PRC25"]],
  [
    "PR-B-03",
    "B",
    "Or PaO₂ 10–13 kPa (75–100 mmHg); avoid hypoxaemia PaO₂ < 8 kPa (60 mmHg) and hyperoxaemia",
    "10–13 kPa; < 8 kPa",
    ["RCUK-PRC25"],
  ],
  [
    "PR-B-04",
    "B",
    "Pulse oximetry can overestimate saturation in darker skin tones, and low-flow states give poor signal",
    undefined,
    ["RCUK-PRC25"],
  ],
  [
    "PR-B-05",
    "B",
    "Normocapnia PaCO₂ 4.7–6.0 kPa (35–45 mmHg); ABG + ETCO₂ if ventilated",
    "4.7–6.0 kPa",
    ["RCUK-PRC25"],
  ],
  [
    "PR-B-06",
    "B",
    "Lung-protective ventilation Vt 6–8 mL/kg ideal body weight",
    "6–8 mL/kg IBW",
    ["RCUK-PRC25"],
  ],
  ["PR-C-01", "C", "12-lead ECG", undefined, ["RCUK-PRC25"]],
  [
    "PR-C-02",
    "C",
    'Blood pressure target MAP ≥ 65 mmHg and SBP > 100 mmHg (house default D3: satisfies RCUK "SBP > 100 or MAP > 60–65")',
    "MAP ≥ 65 and SBP > 100",
    ["RCUK-PRC25"],
  ],
  [
    "PR-C-03",
    "C",
    "Arterial line; echo as soon as possible; fluids / noradrenaline / dobutamine by need — infusions are category-level, no rate shown",
    undefined,
    ["RCUK-PRC25"],
  ],
  [
    "PR-C-04",
    "C",
    "Avoid hypo- and hyperkalaemia; no routine steroids; no routine antiarrhythmic prophylaxis",
    undefined,
    ["RCUK-PRC25"],
  ],
  [
    "PR-C-05",
    "C",
    "Clear ST elevation or high suspicion of coronary occlusion → immediate coronary angiography",
    undefined,
    ["RCUK-PRC25"],
  ],
  [
    "PR-C-06",
    "C",
    "Sustained ROSC + ST elevation → angiography ± PCI within 120 min of diagnosis; consider fibrinolysis in non-PCI-capable settings if a longer delay is expected",
    "≤ 120 min",
    ["RCUK-SC25"],
  ],
  [
    "PR-C-07",
    "C",
    "Without ST elevation: consider immediate angiography if unstable or ongoing ischaemia; if stable with no high probability of occlusion, cath-lab evaluation can be delayed",
    undefined,
    ["RCUK-SC25"],
  ],
  [
    "PR-D-01",
    "D",
    "GCS; obeys commands (motor 6)? Yes / No — comatose. Drives the level-of-care suggestion (R1, R2)",
    "motor 6",
    ["RCUK-PRC25"],
  ],
  [
    "PR-D-02",
    "D",
    "Glucose by the standard protocol (no post-ROSC glucose number is encoded)",
    undefined,
    ["RCUK-PRC25"],
  ],
  [
    "PR-D-03",
    "D",
    "Seizures: levetiracetam or sodium valproate first-line plus sedation; EEG where available; no seizure prophylaxis; short-acting sedation",
    undefined,
    ["RCUK-PRC25"],
  ],
  [
    "PR-E-01",
    "E",
    "Comatose: actively prevent fever, target ≤ 37.5 °C (for 36–72 h in ICU)",
    "≤ 37.5 °C",
    ["RCUK-PRC25"],
  ],
  [
    "PR-E-02",
    "E",
    "Do not actively rewarm a comatose patient at 32–36 °C; no routine rapid large-volume cold IV fluids",
    "32–36 °C",
    ["RCUK-PRC25"],
  ],
  [
    "PR-E-03",
    "E",
    "Head-up 30°; no routine prophylactic antibiotics (low threshold if pneumonia suspected)",
    "30°",
    ["RCUK-PRC25"],
  ],
  [
    "PR-CAUSE-01",
    "Cause",
    "Echo + dual-phase whole-body CT (head, neck, chest, abdomen, pelvis, CTPA) when a non-coronary cause is suspected or pre-arrest symptoms point elsewhere; CT after a negative angiogram",
    undefined,
    ["RCUK-PRC25"],
  ],
  [
    "PR-NEVER-01",
    null,
    "Neuroprognostication is never done in resus (multimodal, ≥ 72 h after ROSC, in ICU). The desk shows no prognostic statement; withdrawal-of-therapy discussion is separate from prognosis",
    "≥ 72 h",
    ["RCUK-PRC25"],
  ],
  [
    "PR-FAM-01",
    "Family",
    "Information for the patient and co-survivors; offer family presence with a trained team member designated to support them",
    undefined,
    ["RCUK-PRC25", "RCUK-ETH25"],
  ],
];

/** PR-B-04: a caveat printed with the SpO₂ target, never a task of its own. */
export const OXIMETRY_CAVEAT_ID = "PR-B-04";

export const POST_ROSC_BUNDLE: readonly PostRoscBundleItem[] = BUNDLE_ROWS.map(
  ([id, domain, text, target]) => ({
    id,
    domain,
    text,
    showsNumber: target !== undefined,
    checklist: id !== "PR-NEVER-01" && id !== OXIMETRY_CAVEAT_ID,
  }),
);

/** Post-ROSC survey pins (after "Continue survey (post-ROSC)"). */
const PIN_ROWS: [string, AbcdeLetter, string, SourceCode[]][] = [
  ["PR-PIN-B", "B", "SpO₂ 94–98 % (with the oximetry caveat) · PaCO₂ 4.7–6.0 kPa", ["RCUK-PRC25"]],
  [
    "PR-PIN-C",
    "C",
    "MAP ≥ 65 and SBP > 100 · 12-lead ECG · STEMI → angiography ≤ 120 min",
    ["RCUK-PRC25", "RCUK-SC25"],
  ],
  [
    "PR-PIN-D",
    "D",
    "Obeys commands? · glucose · seizures (levetiracetam / valproate)",
    ["RCUK-PRC25"],
  ],
  ["PR-PIN-E", "E", "Prevent fever ≤ 37.5 °C · do not rewarm 32–36 °C", ["RCUK-PRC25"]],
];

/** Which step each pin belongs to. */
export const POST_ROSC_PIN_STEP: Record<string, AbcdeLetter> = Object.fromEntries(
  PIN_ROWS.map(([id, step]) => [id, step]),
);

export const POST_ROSC_REFS: readonly RefEntry[] = [
  ...BUNDLE_ROWS.map(([id, , text, target, sources]) => ref(id, text, sources, target)),
  ...PIN_ROWS.map(([id, , text, sources]) => ref(id, text, sources, text)),
];

export const POST_ROSC_REF: Record<string, RefEntry> = indexRefs(POST_ROSC_REFS);
