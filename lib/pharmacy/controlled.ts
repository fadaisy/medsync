import type { SignedCopy } from "@/content/signed-copy";
import type { PharmacyPermission } from "@/lib/pharmacy/access";
import type { Movement } from "@/lib/pharmacy/stock/ledger";

import { countResult } from "@/lib/pharmacy/stock/ledger";

/**
 * Controlled drugs (Pharmacy Phase 1, §5.9, §6.9): CD-1 to CD-8, PA2-6, D-PH1-26 to 28, D-PH1-42,
 * ADR 0268, ADR 0279. Pure: no I/O, no clock. 0127 is the source of truth; this mirrors it.
 *
 * Law 9: MedSync records a controlled supply beside the statutory paper. Nothing here marks the paper as
 * done (CD-7) or says the record replaces the signed prescription or the register; the two attestations
 * record what the supplier said. The register slip is `lib/pharmacy/print/register.ts` (LB-7).
 *
 * - CD-1 `isControlledLine`, `classLabel`, `handoverRoute` (the whole hand-over goes through 5.9).
 * - CD-2 `attestationStands` (0127's witness guard), `witnessAllowed` (PA2-6, D-PH1-27),
 *   `controlledSupplyReady` (Record supply stays off until every item is complete).
 * - CD-3 `commitCount`: the typed figures are fixed first; differences, corrections.
 * - CD-4 `pathAllowed`: the four paths a controlled line never takes.
 * - CD-6 `runningBalance`: the page's balance equals the ledger at every row.
 * - CD-8 `attestationsFor`: changed since printing → the caution, and paper first.
 */

/** Appendix B, gate-a-content B-08 and B-47 to B-51, B-53, exactly as written. All draft. */
export const CONTROLLED_COPY = {
  status: "draft",
  signedBy: null,
  signedOn: null,
  noClass: "Controlled drug",
  changedSincePrinting: "Changed since printing. The paper the patient carries is out of date.",
  notice:
    "MedSync's record does not replace the paper. Keep the signed prescription and make the entry in the hospital's controlled drugs register, as you do today.",
  paperPrescription:
    "The signed prescription is here, matches what is on this screen, and will be kept.",
  paperRegister:
    "The entry is made in the controlled drugs register, and the person collecting has signed it.",
  witnessAgrees: "I, the witness, saw the count and agree with the balance of {n}.",
  difference:
    "The count does not match the record. Record the difference; it goes to the pharmacy in charge.",
  noBuyingOutside:
    "A controlled drug cannot be sent to another pharmacy on this form. Return it to the prescriber, or record it as owed.",
} as const satisfies SignedCopy & Record<string, unknown>;

/** What Record supply waits for, in screen order (CD-2, CD-3). Draft staff copy, not in Appendix B. */
export const READY_COPY = {
  status: "draft",
  signedBy: null,
  signedOn: null,
  permission: "Only a holder of the controlled drugs permission can supply this.",
  acceptance: "A pharmacist has not accepted every line.",
  witness: "The witness has not confirmed who they are.",
  count: "Count every batch in the cupboard with the witness.",
  paperPrescription: "Tick that the signed prescription is here.",
  paperRegister: "Tick that the register entry is made.",
  witnessAgreement: "The witness has not agreed the balance.",
} as const satisfies SignedCopy & Record<string, unknown>;

// ─── CD-1 ────────────────────────────────────────────────────────────────

export interface ControlledFacts {
  /** The prescription's `controlled` flag, as stored at prescribing. */
  rxControlled: boolean;
  /**
   * The medicine's class from this hospital's signed controlled-class set (CT-7, `signedEntry`), or null
   * when the set is unsigned or signs this medicine "not controlled".
   */
  signedClass: string | null;
}

/** CD-1: controlled when prescribing flagged it or a signed class says so. Either alone is enough. */
export const isControlledLine = (l: ControlledFacts): boolean =>
  l.rxControlled || !!l.signedClass?.trim();

/** CD-1: the class chip from signed data only; with no signed class, no class is named. */
export const classLabel = (signedClass: string | null): string =>
  signedClass?.trim() || CONTROLLED_COPY.noClass;

/**
 * CD-1, CD-2, S64: a hand-over that includes any controlled line goes through the controlled screen,
 * which records every line of it (controlled and other) once, in one transaction.
 */
export function handoverRoute<L extends ControlledFacts & { id: string }>(
  lines: readonly L[],
): { screen: "controlled" | "standard"; lineIds: string[]; controlledLineIds: string[] } {
  const controlledLineIds = lines.filter(isControlledLine).map((l) => l.id);
  return {
    screen: controlledLineIds.length ? "controlled" : "standard",
    lineIds: lines.map((l) => l.id),
    controlledLineIds,
  };
}

// ─── CD-2: the witness ───────────────────────────────────────────────────

/** One `pharmacy_attestations` row (0122): never a secret. */
export interface Attestation {
  hospitalId: string;
  actorUserId: string;
  attesterUserId: string | null;
  purpose: "witness" | "signer";
  outcome: "passed" | "failed" | "locked";
  attestedAt: Date;
}

export const ATTESTATION_MAX_AGE_MS = 30 * 60_000;

/**
 * 0127 `pharmacy_controlled_witness_guard`, mirrored (D-PH1-42, ADR 0279): a passed witness attestation,
 * by someone other than the actor, for this actor at this hospital, no older than 30 minutes.
 */
export function attestationStands(input: {
  attestation: Attestation | null;
  actorUserId: string;
  hospitalId: string;
  now: Date;
}): boolean {
  const a = input.attestation;
  return (
    a !== null &&
    a.purpose === "witness" &&
    a.outcome === "passed" &&
    a.attesterUserId !== null &&
    a.attesterUserId !== input.actorUserId &&
    a.actorUserId === input.actorUserId &&
    a.hospitalId === input.hospitalId &&
    a.attestedAt.getTime() >= input.now.getTime() - ATTESTATION_MAX_AGE_MS
  );
}

/** The signed witness list (D-PH1-27, gate-a-content 2.5): the permissions that may witness. */
export interface WitnessList {
  permissions: readonly PharmacyPermission[];
}

/** gate-a-content 2.5, drafted from D-PH1-27. Draft until signed; the caller passes the signed list. */
export const PROPOSED_WITNESS_LIST: WitnessList = { permissions: ["pharmacy.dispense"] };

/**
 * PA2-6, D-PH1-27: a witness holds a permission on the signed list and is never the actor. A technician
 * holds `pharmacy.dispense`, so may witness under the proposed list. No signed list: nobody may (RD-1
 * keeps the point from going live meanwhile).
 */
export function witnessAllowed(input: {
  witnessPermissions: readonly PharmacyPermission[];
  signedWitnessList: WitnessList | null;
  witnessUserId: string;
  actorUserId: string;
}): boolean {
  if (!input.signedWitnessList || input.witnessUserId === input.actorUserId) return false;
  return input.signedWitnessList.permissions.some((p) => input.witnessPermissions.includes(p));
}

export type ReadyItem = Exclude<keyof typeof READY_COPY, keyof SignedCopy>;

/**
 * CD-2: Record supply stays off until all of these are complete. `missing` is in screen order, each with
 * its words. `batchIds` are the batches of the controlled product in the cupboard; `countedBatchIds`
 * those whose count was committed with this witness present.
 */
export function controlledSupplyReady(input: {
  actorPermissions: readonly PharmacyPermission[];
  everyLineAccepted: boolean;
  witnessStands: boolean;
  batchIds: readonly string[];
  countedBatchIds: readonly string[];
  paperAttested: boolean;
  registerAttested: boolean;
  witnessAgreedBalance: number | null;
}): { ready: boolean; missing: { item: ReadyItem; words: string }[] } {
  const checks: [ReadyItem, boolean][] = [
    ["permission", input.actorPermissions.includes("pharmacy.controlled")],
    ["acceptance", input.everyLineAccepted],
    ["witness", input.witnessStands],
    [
      "count",
      input.witnessStands &&
        input.batchIds.length > 0 &&
        input.batchIds.every((b) => input.countedBatchIds.includes(b)),
    ],
    ["paperPrescription", input.paperAttested],
    ["paperRegister", input.registerAttested],
    ["witnessAgreement", input.witnessAgreedBalance !== null],
  ];
  const missing = checks
    .filter(([, done]) => !done)
    .map(([item]) => ({ item, words: READY_COPY[item] }));
  return { ready: missing.length === 0, missing };
}

// ─── CD-3: the count ─────────────────────────────────────────────────────

export interface CountLine {
  readonly batchId: string;
  readonly counted: number;
}
export interface ControlledDifference {
  readonly batchId: string;
  readonly countedQuantity: number;
  readonly recordedBalance: number;
}
export interface CountCorrection {
  readonly batchId: string;
  readonly kind: "count_correction";
  readonly quantity: number;
  readonly witnessed: true;
}

export type CommitResult =
  | {
      ok: true;
      /** Written first, as the witnessed count event, before any balance goes to the client. Frozen. */
      count: readonly CountLine[];
      differences: readonly ControlledDifference[];
      corrections: readonly CountCorrection[];
      /** The supply proceeds from these figures. */
      supplyFrom: ReadonlyMap<string, number>;
    }
  | { ok: false; reason: "missing_batch" | "not_whole" };

/**
 * CD-3, SL-6: commit the supplier's typed figures (every batch, whole and not negative), then compare with
 * MedSync's balances. Each difference is a `pharmacy_controlled_differences` row and a witnessed
 * `count_correction` movement to the counted figure. The figures cannot be retyped (the result is
 * frozen); counting again is a second call, a second event.
 */
export function commitCount(input: {
  typedPerBatch: ReadonlyMap<string, number>;
  balancesPerBatch: ReadonlyMap<string, number>;
}): CommitResult {
  const ids = [...input.balancesPerBatch.keys()];
  if (ids.length === 0 || ids.some((id) => !input.typedPerBatch.has(id)))
    return { ok: false, reason: "missing_batch" };
  const typed = [...input.typedPerBatch];
  if (typed.some(([, n]) => !Number.isInteger(n) || n < 0))
    return { ok: false, reason: "not_whole" };

  const count = Object.freeze(
    typed.map(([batchId, counted]) => Object.freeze({ batchId, counted })),
  );
  const differences: ControlledDifference[] = [];
  const corrections: CountCorrection[] = [];
  for (const { batchId, counted } of count) {
    const balance = input.balancesPerBatch.get(batchId) ?? 0;
    const r = countResult({ counted, balance });
    if (r.matched) continue;
    differences.push(
      Object.freeze({ batchId, countedQuantity: counted, recordedBalance: balance }),
    );
    corrections.push(
      Object.freeze({
        batchId,
        kind: "count_correction",
        quantity: r.difference,
        witnessed: true,
      }),
    );
  }
  return {
    ok: true,
    count,
    differences: Object.freeze(differences),
    corrections: Object.freeze(corrections),
    supplyFrom: new Map(count.map((c) => [c.batchId, c.counted])),
  };
}

// ─── CD-4 ────────────────────────────────────────────────────────────────

/** CD-4: the paths a controlled line never takes. */
export const CONTROLLED_NEVER = [
  "buying_outside",
  "standard_lane",
  "supply_without_pharmacist", // D-PH1-05
  "slip",
] as const;
export type ControlledNeverPath = (typeof CONTROLLED_NEVER)[number];

/** CD-4: whether a line may take one of those paths. Every other line may (other rules permitting). */
export const pathAllowed = (_path: ControlledNeverPath, line: ControlledFacts): boolean =>
  !isControlledLine(line);

// ─── CD-6 ────────────────────────────────────────────────────────────────

/**
 * CD-6: the Controlled drugs page for one medicine at one point. Rows in ledger order (effective, then
 * recorded); `balance` is the medicine's total after the row and `batchBalance` the row's batch, both the
 * sum of the movements so far, exactly as `balances()` would give.
 */
export function runningBalance<M extends Movement>(
  entries: readonly M[],
): (M & { balance: number; batchBalance: number })[] {
  const byBatch = new Map<string, number>();
  let total = 0;
  return [...entries]
    .sort(
      (a, b) =>
        a.effectiveAt.getTime() - b.effectiveAt.getTime() ||
        a.recordedAt.getTime() - b.recordedAt.getTime(),
    )
    .map((m) => {
      total += m.quantity;
      const batchBalance = (byBatch.get(m.batchId) ?? 0) + m.quantity;
      byBatch.set(m.batchId, batchBalance);
      return { ...m, balance: total, batchBalance };
    });
}

// ─── CD-8 ────────────────────────────────────────────────────────────────

/**
 * CD-8, S65: the head's caution when the prescription changed since it was printed, and the two paper
 * attestations in order. The first is always that the signed paper matches the screen.
 */
export function attestationsFor(input: { changedSincePrinting: boolean }): {
  caution: string | null;
  attestations: readonly [string, string];
} {
  return {
    caution: input.changedSincePrinting ? CONTROLLED_COPY.changedSincePrinting : null,
    attestations: [CONTROLLED_COPY.paperPrescription, CONTROLLED_COPY.paperRegister],
  };
}

/** B-50 with the balance filled in. */
export const witnessAgreementText = (n: number): string =>
  CONTROLLED_COPY.witnessAgrees.replace("{n}", String(n));
