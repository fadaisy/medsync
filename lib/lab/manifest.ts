/**
 * Manifests (Lab Phase 4 §6.2, MF-1..MF-4; RF-6; gate-a-proposal §5.2; D-LAB4-05; A18). Pure.
 *
 * A manifest belongs to one partner and one transport. Its rows carry lab numbers, the partner's identifiers,
 * specimen, containers, test and collected time: the input type has no field for a name, a birth date, a
 * hospital number or anything clinical, so none can reach the sheet (MF-1). A restricted test prints as the
 * partner's code with the word "Restricted", never its name (A18).
 */
import { fill, LAB4 } from "@/content/lab-phase-4";

export type ManifestState = "open" | "sealed" | "handed_over" | "received" | "discrepancy";

export interface ManifestItemInput {
  labNumber: string;
  /** The identifiers the partner requires, as scanned (their form number, barcode). */
  theirIds: readonly string[];
  specimenWords: string;
  containers: number;
  testWords: string;
  /** The partner's code from the signed partner_tests mapping; required for a restricted test. */
  partnerCode: string | null;
  restricted: boolean;
  collectedAt: Date;
}

export interface ManifestRow {
  position: number;
  labNumber: string;
  theirIds: string;
  specimen: string;
  containers: number;
  test: string;
  collectedAt: Date;
}

/** MF-1, A18: the printed rows, in the order added. */
export function manifestRows(items: readonly ManifestItemInput[]): ManifestRow[] {
  return items.map((i, n) => ({
    position: n + 1,
    labNumber: i.labNumber,
    theirIds: i.theirIds.join(" · "),
    specimen: i.specimenWords,
    containers: i.containers,
    test: i.restricted ? `${i.partnerCode ?? "—"} · Restricted` : i.testWords,
    collectedAt: i.collectedAt,
  }));
}

/**
 * RF-6: a specimen joins a manifest only when every identifier the partner requires is scanned, every packing
 * item on its signed checklist is ticked, and every test has a code for that partner. Checked on the server.
 */
export function readiness(o: {
  requiredIds: readonly string[];
  scanned: Readonly<Record<string, string | undefined>>;
  packingItems: readonly string[];
  ticked: readonly string[];
  unmappedTests: readonly string[];
}): {
  ready: boolean;
  missingIds: number;
  missingItems: number;
  unmapped: readonly string[];
  reason: string | null;
} {
  const missingIds = o.requiredIds.filter((k) => !o.scanned[k]?.trim()).length;
  const missingItems = o.packingItems.filter((k) => !o.ticked.includes(k)).length;
  const ready = missingIds === 0 && missingItems === 0 && o.unmappedTests.length === 0;
  const reason = ready
    ? null
    : o.unmappedTests.length > 0
      ? null // the row shows "Map before sending" per test (LAB4.mapBeforeSending)
      : fill(LAB4.addToManifestDisabled, { n: missingIds, m: missingItems });
  return { ready, missingIds, missingItems, unmapped: o.unmappedTests, reason };
}

/** MF-3: forward only; received and discrepancy are the two ends. */
const ORDER: Record<ManifestState, number> = {
  open: 0,
  sealed: 1,
  handed_over: 2,
  received: 3,
  discrepancy: 3,
};
export const canMoveManifest = (from: ManifestState, to: ManifestState) =>
  ORDER[to] === ORDER[from] + 1 &&
  (from !== "handed_over" || to === "received" || to === "discrepancy");

export type ArrivalCondition = "intact" | "leaking" | "broken" | "missing";

/** MF-3: any leaking, broken or missing package, or fewer received than sent, is a discrepancy. */
export function receiptOutcome(o: {
  condition: readonly ArrivalCondition[];
  sent: number;
  received: number;
}): "received" | "discrepancy" {
  const bad = o.condition.some((c) => c !== "intact") || o.received < o.sent;
  return bad ? "discrepancy" : "received";
}

/** MF-2: `MF-2026-0141`, printed as Code 128. */
export const manifestNumber = (year: number, seq: number) =>
  `MF-${year}-${String(seq).padStart(4, "0")}`;

/** MF-4: a reprint says so. */
export const printLabel = (isReprint: boolean) => (isReprint ? "Copy" : null);
