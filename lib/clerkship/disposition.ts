import type { BpStandard } from "@/lib/clerkship/exam/bp";
import type { RecordedVitals } from "@/lib/clerkship/exam/types";
import type { AcuityLevel } from "@/lib/triage/types";

import { gcsTotal } from "@/lib/clerkship/exam/types";
import { abnormalVitals, recordedToAdult } from "@/lib/clerkship/synthesis";
import { scoreNews2 } from "@/lib/triage/scoring/news2";

/**
 * Disposition cross-check — DECISION-SUPPORT, never a gate.
 *
 * At the end of the clerking the clinician chooses a disposition. This derives
 * the MINIMUM disposition acuity the recorded clinical state supports and flags
 * when the chosen disposition is LESS acute than that floor — a "you recorded a
 * sick patient but are sending them home, please review" prompt. It NEVER blocks
 * and NEVER auto-sets the disposition; the clinician's call stands.
 *
 * It invents no thresholds: the floor is built only from already-CSO-signed
 * signals — the NEWS2 aggregate + single-parameter-3 rule (RCP NEWS2 2017), a
 * reduced GCS / out-of-range glucose / abnormal BP (via the shared
 * `abnormalVitals` engine), any must-not-miss exam EMERGENCY pattern the exam
 * engines matched, and the triage acuity carried into the encounter. Bias to
 * over-escalation; never under.
 */

export type Disposition = "admit" | "discharge" | "refer" | "observe" | "transfer" | "deceased";

/** The minimum disposition tier the recorded state supports. */
export type DispositionFloor = "none" | "observe" | "escalate";

export interface DispositionInput {
  /** The clinician's chosen disposition (null until they pick one). */
  chosen: Disposition | null;
  vitals: RecordedVitals;
  bpStandard: BpStandard;
  /** Labels of must-not-miss / emergency exam patterns the exam engines matched. */
  examEmergencies: string[];
  /** The triage acuity carried into the encounter, if any. */
  triageAcuity?: AcuityLevel | null;
}

export interface DispositionCrossCheck {
  /** The minimum disposition acuity the recorded state supports. */
  expected: DispositionFloor;
  /** The signals driving the floor (surfaced to the clinician). */
  reasons: string[];
  /** True when the chosen disposition is LESS acute than `expected`. */
  diverges: boolean;
  chosen: Disposition | null;
}

const FLOOR_RANK: Record<DispositionFloor, 0 | 1 | 2> = { none: 0, observe: 1, escalate: 2 };

/** Where each disposition sits on the acuity ladder (deceased is N/A → null). */
const DISPOSITION_RANK: Record<Disposition, 0 | 1 | 2 | null> = {
  discharge: 0,
  observe: 1,
  admit: 2,
  refer: 2, // escalate to another service
  transfer: 2, // escalate to a higher-level facility
  deceased: null,
};

export function crossCheckDisposition(input: DispositionInput): DispositionCrossCheck {
  const reasons: string[] = [];
  let floor: DispositionFloor = "none";
  const raise = (to: DispositionFloor) => {
    if (FLOOR_RANK[to] > FLOOR_RANK[floor]) floor = to;
  };

  // NEWS2 aggregate (the per-parameter thresholds are RCP NEWS2 2017, reused).
  const news2 = scoreNews2(recordedToAdult(input.vitals));
  if (news2.total >= 7 || news2.hasSingleParameterThree) {
    raise("escalate");
    reasons.push(
      `NEWS2 ${news2.total}${news2.hasSingleParameterThree ? " (single parameter 3)" : ""}`,
    );
  } else if (news2.total >= 5) {
    raise("observe");
    reasons.push(`NEWS2 ${news2.total}`);
  }

  // GCS / glucose / BP — via the shared abnormalVitals engine (single source of
  // those thresholds). A critical item escalates; a borderline one warrants
  // observation. NEWS2-parameter items are skipped here (counted in the aggregate).
  for (const item of abnormalVitals(input.vitals, input.bpStandard)) {
    const isNews2Param = /^(RR|SpO₂|HR|T )/.test(item.label);
    if (isNews2Param) continue;
    if (item.severity === "critical" || item.mustNotMiss) {
      raise("escalate");
      reasons.push(item.detail ? `${item.label} (${item.detail})` : item.label);
    } else if (item.severity === "borderline") {
      raise("observe");
      reasons.push(item.detail ? `${item.label} (${item.detail})` : item.label);
    }
  }

  // A reduced GCS is must-not-miss even if not surfaced above.
  const gcs = gcsTotal(input.vitals);
  if (gcs != null && gcs <= 8 && !reasons.some((r) => r.startsWith("GCS"))) {
    raise("escalate");
    reasons.push(`GCS ${gcs}/15`);
  }

  // Must-not-miss exam EMERGENCY patterns.
  for (const e of input.examEmergencies) {
    if (!e.trim()) continue;
    raise("escalate");
    reasons.push(e.trim());
  }

  // Triage acuity carried in (1–2 → escalate; 3 → observe).
  if (input.triageAcuity != null) {
    if (input.triageAcuity <= 2) {
      raise("escalate");
      reasons.push(`Triage acuity ${input.triageAcuity}`);
    } else if (input.triageAcuity === 3) {
      raise("observe");
      reasons.push(`Triage acuity 3`);
    }
  }

  const chosenRank = input.chosen ? DISPOSITION_RANK[input.chosen] : null;
  const diverges = chosenRank != null && chosenRank < FLOOR_RANK[floor];

  return { expected: floor, reasons, diverges, chosen: input.chosen };
}
