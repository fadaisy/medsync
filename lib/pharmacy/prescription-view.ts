import type { AnsweredCheck, StoredAnswer } from "./checks";
import type { Lane, LineState, QueueEncounter, RowState } from "./queue";

import { answeredChecks } from "./checks";
import { byWrittenOrder, laneOf, lineState, rowState } from "./queue";

/**
 * One prescription, read-only (Pharmacy Phase 0, ADR 0231; RV-1..RV-5). Pure: the read
 * (lib/pharmacy/read.ts) brings exactly the signed read list (D-PH0-05) with text already decrypted;
 * this arranges it. Every text field passes through untouched (Law 5, RV-2): nothing is trimmed,
 * converted, rounded or completed. Only stored check answers appear (Law 6, RV-5).
 */

export interface ViewLineInput {
  id: string;
  placementLine: number | null;
  kind: string;
  drugName: string;
  concentration: string | null;
  dose: string;
  route: string;
  frequency: string | null;
  duration: string | null;
  quantity: string | null;
  method: string | null;
  infusionOver: string | null;
  diluent: string | null;
  prn: boolean;
  fluidPurpose: string | null;
  volumeMl: string | null;
  overMinutes: number | null;
  instructions: string | null;
  /** The line's problem (Plan rows) or its stored indication (EMR-sheet rows). */
  indication: string | null;
  conditionId: string | null;
  regimenId: string | null;
  edits: readonly { field: string; from: string; to: string }[];
  controlled: boolean;
  state: string;
  cosign: { state: string; reviewedAt: Date | null; reviewerCadre: string | null } | null;
  checkAnswers: readonly StoredAnswer[];
  confirmedFlags: readonly string[];
  /** The line's reasons, decrypted, exactly as the prescriber's answers wrote them. */
  reasons: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface ViewLine {
  id: string;
  input: ViewLineInput;
  state: LineState;
  /** When the line left "active": the co-sign return, or the close that stopped it. */
  stateAt: Date | null;
  /** Who cancelled it: the senior who returned the co-sign (cadre only, never a name). */
  stateByCadre: string | null;
  /** Plan rows only: "regimen" (signed) or "typed"; EMR-sheet rows: null. */
  doseSource: "regimen" | "typed" | null;
  checks: AnsweredCheck[];
  /** The stops the prescriber overrode on this line, for the override block. */
  overriddenStops: string[];
}

export interface PrescriptionView {
  lines: ViewLine[];
  state: RowState;
  lane: Lane;
  from: string | null;
  writtenAt: Date;
  prescriberCadre: string | null;
  /** "none" (no co-sign was needed), "awaiting", or the senior's sign-off. */
  cosign:
    | { kind: "none" }
    | { kind: "awaiting" }
    | { kind: "signed"; cadre: string | null; at: Date | null };
}

const stateOf = (l: ViewLineInput) => ({ state: l.state, cosign: l.cosign?.state ?? null });

export function buildPrescriptionView(input: {
  lines: readonly ViewLineInput[];
  encounter: QueueEncounter | undefined;
  prescriberCadre: string | null;
}): PrescriptionView {
  const ordered = [...input.lines].sort(byWrittenOrder);
  const lines = ordered.map((l): ViewLine => {
    const state = lineState(stateOf(l));
    const checks = answeredChecks(l);
    const returned = state === "cancelled" && l.cosign?.state === "returned";
    return {
      id: l.id,
      input: l,
      state,
      stateAt: state === "cancelled" || state === "not_continued" ? l.updatedAt : null,
      stateByCadre: returned ? l.cosign!.reviewerCadre : null,
      doseSource: l.conditionId && l.kind === "drug" ? (l.regimenId ? "regimen" : "typed") : null,
      checks,
      overriddenStops: checks.filter((c) => c.level === "stop").map((c) => c.title),
    };
  });
  const cosigns = ordered.map((l) => l.cosign).filter((c) => c !== null);
  const signed = cosigns.filter((c) => c.state === "approved");
  const cosign: PrescriptionView["cosign"] = cosigns.some((c) => c.state === "pending_review")
    ? { kind: "awaiting" }
    : signed.length
      ? { kind: "signed", cadre: signed[0]!.reviewerCadre, at: signed[0]!.reviewedAt }
      : { kind: "none" };
  return {
    lines,
    state: rowState(ordered.map(stateOf)),
    lane: laneOf(input.encounter),
    from: input.encounter?.departmentName ?? null,
    writtenAt: ordered[0]!.createdAt,
    prescriberCadre: input.prescriberCadre,
    cosign,
  };
}
