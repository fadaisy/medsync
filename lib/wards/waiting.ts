import type { BoardBed, BoardWaiting } from "./board";
import type { BedWaitReason } from "@/db/schema/admissions";

/*
 * The bed board's admission parts (ADRs 0198–0200), pure so the board, its client and the tests share
 * them: the waiting list as a viewer may see it, the Arriving beds that need attention, and the words.
 */

/** Why an admitted patient waits for a bed, in words: one map, the close dialog's (ADR 0198 §5). */
export { WAIT_REASON_WORDS } from "@/lib/emr/closure";

/**
 * ADR 0199 §6: nothing auto-releases a held bed; one held as Arriving longer than this is listed under
 * the ward's "Needs attention". PROPOSED value (4 h), awaiting the owner's decision.
 */
export const ARRIVING_ATTENTION_MS = 4 * 60 * 60_000;

/** Arriving beds held past the threshold, longest first. Pure, for the tests. */
export function arrivingTooLong(beds: readonly BoardBed[], nowMs: number): BoardBed[] {
  return beds
    .filter(
      (b) =>
        b.state === "arriving" && b.since && nowMs - Date.parse(b.since) > ARRIVING_ATTENTION_MS,
    )
    .sort((a, b) => Date.parse(a.since!) - Date.parse(b.since!));
}

/** The waiting list as the viewer may see it: oldest first, the name only for `names`, nothing for `none`. */
export function waitingFor(
  rows: readonly (Omit<BoardWaiting, "decidedAt" | "waitReason"> & {
    decidedAt: Date;
    waitReason: string | null;
  })[],
  patients: "none" | "mrn" | "names",
): BoardWaiting[] {
  if (patients === "none") return [];
  return [...rows]
    .sort((a, b) => a.decidedAt.getTime() - b.decidedAt.getTime())
    .map((r) => ({
      admissionId: r.admissionId,
      patientUserId: r.patientUserId,
      name: patients === "names" ? r.name : null,
      mrn: r.mrn,
      admittedBy: r.admittedBy,
      decidedAt: r.decidedAt.toISOString(),
      waitReason: r.waitReason as BedWaitReason | null,
    }));
}
