import type { DeathConfirmedPayload } from "@/lib/resus/model";
import type { RefEntry } from "@/lib/resus/reference/ref";

/**
 * Confirmation of death after cardiorespiratory arrest — reference entries (ALS-DTH-01..09)
 * and the bedside checklist items.
 *
 * Transcribed from docs/clinical/resus-als-clinical-catalog.md §10 (CSO-signed at GATE A,
 * 2026-09-23), source AoMRC Code of Practice for the Diagnosis and Confirmation of Death,
 * 2025 update (s5.13–5.18), verbatim-checked 2026-09-23. ALS-DTH-09 (who may confirm,
 * certification, reportable deaths in Uganda) is a legal question (D10): facts only.
 * The 5-minute constant itself is `DEATH_OBSERVATION_MS` in `als-catalog.ts`.
 */

const AOMRC25 =
  "https://www.aomrc.org.uk/publication/a-code-of-practice-for-the-diagnosis-and-confirmation-of-death-2025-update/";

function dth(id: string, text: string, source: string, value?: string): RefEntry {
  const aomrc = source.startsWith("AOMRC25");
  return {
    id,
    text,
    ...(value !== undefined ? { value } : {}),
    source,
    url: aomrc ? AOMRC25 : "docs/clinical/resus-als-clinical-catalog.md",
    verifiedOn: "2026-09-23",
    confidence: aomrc ? "verified-web" : "design",
    status: "signed",
  };
}

export const DEATH_CONFIRMATION_REFS: readonly RefEntry[] = [
  dth(
    "ALS-DTH-01",
    "Observe for at least 5 minutes for all three: continuous unconsciousness; continuous apnoea (no chest movement, no breath sounds); continuous absence of circulation (no central pulse, no heart sounds)",
    "AOMRC25 s5.13",
    "5:00",
  ),
  dth(
    "ALS-DTH-02",
    'The 5 minutes start at the onset of circulatory arrest (mechanical asystole) and apnoea — the clock starts at "CPR stopped"',
    "AOMRC25 s5.13–5.14",
  ),
  dth(
    "ALS-DTH-03",
    "A ventilated patient is disconnected from the ventilator before the observation starts",
    "AOMRC25 s5.13",
  ),
  dth(
    "ALS-DTH-04",
    "Monitoring may support it: asystole on continuous ECG (not required if echo or an arterial trace is used), no pulsatile arterial trace, no contractile activity on echo",
    "AOMRC25 s5.14",
  ),
  dth(
    "ALS-DTH-05",
    'Any spontaneous return of circulatory, respiratory or neurological function → "Signs of life — resume" (console / ROSC); a new 5:00 runs from the next arrest',
    "AOMRC25 s5.16",
  ),
  dth(
    "ALS-DTH-06",
    "After the 5 minutes: absent pupillary responses to light and no motor response to supraorbital pressure; soon after an arrest, also absent corneal reflexes",
    "AOMRC25 s5.15",
  ),
  dth(
    "ALS-DTH-07",
    "Time of death = when the clinician is satisfied all the criteria are met; the confirming clinician is recorded",
    "AOMRC25 s5.17",
  ),
  dth(
    "ALS-DTH-08",
    "Tell the family the recorded time may differ from the last observed breath",
    "AOMRC25 s5.18",
  ),
  dth(
    "ALS-DTH-09",
    "Who may confirm, certification, civil registration and reportable deaths in Uganda are legal questions (D10): the desk records facts and leaves them as configured tasks",
    "CSO/legal (D10)",
  ),
];

export type DeathCriterionKey = keyof DeathConfirmedPayload["criteria"];

/** The bedside checklist, in the order it is performed (ALS-DTH-01 then ALS-DTH-06). */
export const DEATH_CHECKLIST: readonly { key: DeathCriterionKey; ruleId: string; text: string }[] =
  [
    { key: "unconscious", ruleId: "ALS-DTH-01", text: "Continuous unconsciousness" },
    {
      key: "apnoea",
      ruleId: "ALS-DTH-01",
      text: "Continuous apnoea — no chest movement, no breath sounds",
    },
    {
      key: "noCirculation",
      ruleId: "ALS-DTH-01",
      text: "No circulation — no central pulse, no heart sounds",
    },
    { key: "pupilsUnreactive", ruleId: "ALS-DTH-06", text: "Pupils do not react to light" },
    {
      key: "noMotorResponse",
      ruleId: "ALS-DTH-06",
      text: "No motor response to supraorbital pressure",
    },
    {
      key: "cornealReflexesAbsent",
      ruleId: "ALS-DTH-06",
      text: "Corneal reflexes absent (soon after an arrest)",
    },
  ];
