import type { LineEventRow, MovementRow } from "./handover";
import type { PharmacyAccess } from "@/lib/pharmacy/access";

import { can } from "@/lib/pharmacy/access";

/**
 * Reversing a supply, correcting the record, and failures after commit (Pharmacy Phase 1; SU-11, SU-13,
 * SU-14, CD-5, Law 5, Law 11, 5.7.1). Pure: ids and the time are injected.
 *
 * - SU-11 A reversal names the hand-over and each supply. It writes a `reversed` movement returning the
 *   quantity to its batch; a pack that is not fit is written off in the same step by an `adjusted`
 *   movement of the same quantity (0126 `psr_fit`). Allowed on the hospital-local day the supply was
 *   recorded (for a back-entered supply, the day it was entered), by `pharmacy.manage` or
 *   `pharmacy.review`; a controlled one also needs `pharmacy.controlled` and a witness (CD-5).
 * - SU-14 "Recorded in error": `pharmacy.manage`, a reason, any day; it moves no stock.
 * - Both return each line to where it stood before that hand-over: one `returned` line event per line,
 *   naming the hand-over (`lines.ts` convention), with the reason (0125 `ple_reason`).
 * - SU-13, Law 11 A notification, print or message failure after commit never throws and never undoes
 *   anything: `failureNeverThrows` turns it into words for the supplier.
 */

/** The supply rows being reversed or corrected: every one of them from one hand-over. */
export interface SupplyRef {
  id: string;
  handoverId: string;
  hospitalId: string;
  dispensingPointId: string;
  patientUserId: string;
  prescriptionId: string | null;
  batchId: string;
  quantity: number;
}

export type ReversalRefusal =
  | "not_today"
  | "not_permitted"
  | "controlled_permission"
  | "witness_needed";

/** SU-11, CD-5, 5.7.1. Local days are YYYY-MM-DD (Africa/Kampala; `localDate`). */
export function reversalAllowed(input: {
  suppliedLocalDay: string;
  enteredAfterDowntime: boolean;
  enteredLocalDay: string;
  today: string;
  actorHolds: PharmacyAccess;
  controlled: boolean;
  /** The witness's attestation id, or null (CD-5). */
  witness: string | null;
}): { ok: true } | { ok: false; reason: ReversalRefusal } {
  const day = input.enteredAfterDowntime ? input.enteredLocalDay : input.suppliedLocalDay;
  if (day !== input.today) return { ok: false, reason: "not_today" };
  if (!can(input.actorHolds, "pharmacy.manage") && !can(input.actorHolds, "pharmacy.review"))
    return { ok: false, reason: "not_permitted" };
  return controlledOk(input);
}

/** SU-14, CD-5: `correctSupplyRecord`, on any day. */
export function correctionAllowed(input: {
  actorHolds: PharmacyAccess;
  controlled: boolean;
  witness: string | null;
}): { ok: true } | { ok: false; reason: Exclude<ReversalRefusal, "not_today"> } {
  if (!can(input.actorHolds, "pharmacy.manage")) return { ok: false, reason: "not_permitted" };
  return controlledOk(input);
}

function controlledOk(input: {
  actorHolds: PharmacyAccess;
  controlled: boolean;
  witness: string | null;
}): { ok: true } | { ok: false; reason: "controlled_permission" | "witness_needed" } {
  if (!input.controlled) return { ok: true };
  if (!can(input.actorHolds, "pharmacy.controlled"))
    return { ok: false, reason: "controlled_permission" };
  return input.witness ? { ok: true } : { ok: false, reason: "witness_needed" };
}

type Actor = { userId: string; cadre: string };
type Shape = "no_supplies" | "mixed_handovers" | "no_reason";

const reasonOk = (s: string) => s.trim().length >= 2 && s.trim().length <= 60;

function shapeProblem(supplies: readonly SupplyRef[], reasonCode: string): Shape | null {
  if (!supplies.length) return "no_supplies";
  if (new Set(supplies.map((s) => s.handoverId)).size !== 1) return "mixed_handovers";
  return reasonOk(reasonCode) ? null : "no_reason";
}

/** One `returned` per line of the hand-over, naming it: the line goes back to where it stood before. */
function returnedEvents(
  supplies: readonly SupplyRef[],
  reasonCode: string,
  actor: Actor,
  newId: () => string,
): LineEventRow[] {
  const byLine = new Map<string, SupplyRef>();
  for (const s of supplies) if (s.prescriptionId) byLine.set(s.prescriptionId, s);
  return [...byLine].map(([prescriptionId, s]) => ({
    id: newId(),
    hospitalId: s.hospitalId,
    prescriptionId,
    patientUserId: s.patientUserId,
    dispensingPointId: s.dispensingPointId,
    kind: "returned",
    lane: null,
    quantitySupplied: null,
    quantityNotSupplied: null,
    reasonCode: reasonCode.trim(),
    handoverId: s.handoverId,
    actorUserId: actor.userId,
    actorCadre: actor.cadre,
  }));
}

export interface ReversalRow {
  id: string;
  supplyId: string;
  hospitalId: string;
  dispensingPointId: string;
  reasonCode: string;
  packFit: boolean;
  returnedMovementId: string;
  writeoffMovementId: string | null;
  witnessAttestationId: string | null;
  actorUserId: string;
  actorCadre: string;
  reversedAt: Date;
}

/** SU-11: the rows of one reversal, all in one transaction. */
export function reversalWrites(input: {
  supplies: readonly SupplyRef[];
  packFit: boolean;
  reasonCode: string;
  actor: Actor;
  witness: string | null;
  now: Date;
  newId: () => string;
}):
  | { ok: true; reversals: ReversalRow[]; movements: MovementRow[]; lineEvents: LineEventRow[] }
  | { ok: false; reason: Shape } {
  const problem = shapeProblem(input.supplies, input.reasonCode);
  if (problem) return { ok: false, reason: problem };
  const { actor, now, newId } = input;
  const reasonCode = input.reasonCode.trim();
  const reversals: ReversalRow[] = [];
  const movements: MovementRow[] = [];
  for (const s of input.supplies) {
    const reversalId = newId();
    const movement = (kind: "reversed" | "adjusted", quantity: number): MovementRow => ({
      id: newId(),
      hospitalId: s.hospitalId,
      dispensingPointId: s.dispensingPointId,
      batchId: s.batchId,
      kind,
      quantity,
      effectiveAt: now,
      actorUserId: actor.userId,
      reasonCode,
      sourceKind: "reversal",
      sourceId: reversalId,
      witnessAttestationId: input.witness,
      downtime: false,
    });
    const back = movement("reversed", s.quantity);
    const writeOff = input.packFit ? null : movement("adjusted", -s.quantity);
    movements.push(back, ...(writeOff ? [writeOff] : []));
    reversals.push({
      id: reversalId,
      supplyId: s.id,
      hospitalId: s.hospitalId,
      dispensingPointId: s.dispensingPointId,
      reasonCode,
      packFit: input.packFit,
      returnedMovementId: back.id,
      writeoffMovementId: writeOff?.id ?? null,
      witnessAttestationId: input.witness,
      actorUserId: actor.userId,
      actorCadre: actor.cadre,
      reversedAt: now,
    });
  }
  return {
    ok: true,
    reversals,
    movements,
    lineEvents: returnedEvents(input.supplies, reasonCode, actor, newId),
  };
}

export interface CorrectionRow {
  id: string;
  supplyId: string;
  hospitalId: string;
  reasonCode: string;
  note: string | null;
  actorUserId: string;
  correctedAt: Date;
}

/** SU-14: "recorded in error". No movement: the shelf is put right by a count. */
export function correctionWrites(input: {
  supplies: readonly SupplyRef[];
  reasonCode: string;
  note: string | null;
  actor: Actor;
  now: Date;
  newId: () => string;
}):
  | { ok: true; corrections: CorrectionRow[]; movements: []; lineEvents: LineEventRow[] }
  | { ok: false; reason: Shape } {
  const problem = shapeProblem(input.supplies, input.reasonCode);
  if (problem) return { ok: false, reason: problem };
  const reasonCode = input.reasonCode.trim();
  return {
    ok: true,
    corrections: input.supplies.map((s) => ({
      id: input.newId(),
      supplyId: s.id,
      hospitalId: s.hospitalId,
      reasonCode,
      note: input.note?.trim() || null,
      actorUserId: input.actor.userId,
      correctedAt: input.now,
    })),
    movements: [],
    lineEvents: returnedEvents(input.supplies, reasonCode, input.actor, input.newId),
  };
}

/** SU-13, Law 11, RQ-10: run a post-commit side effect; a failure becomes words, never a throw. */
export async function failureNeverThrows(
  run: () => unknown,
  words: string,
): Promise<{ ok: true } | { ok: false; words: string }> {
  try {
    await run();
    return { ok: true };
  } catch {
    return { ok: false, words };
  }
}
