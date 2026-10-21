import type { StoreBatch, StoreMovement } from "./ledger";

import { proposeBatches } from "@/lib/pharmacy/stock/fefo";
import { isExpired } from "@/lib/pharmacy/stock/ledger";

/**
 * Issues, requisitions, returns and loans (Pharmacy Phase 2, 5.3, 6.4: IS-1 to IS-7). Pure.
 */

export type RequisitionState =
  | "raised"
  | "issued"
  | "part_issued"
  | "refused"
  | "withdrawn"
  | "confirmed"
  | "confirmed_with_difference";

export type RequisitionEvent =
  | {
      type: "issue";
      lines: readonly { asked: number; issued: number; notIssuedReason: string | null }[];
    }
  | { type: "refuse"; reason: string }
  | { type: "withdraw" }
  | { type: "confirm"; differences: number };

export type RequisitionRefusal =
  | "not_allowed"
  | "reason_needed"
  | "not_issued_reason_needed"
  | "nothing_issued"
  | "invalid_quantity";

/**
 * IS-1: the requisition state machine. A raised requisition is issued in full, part issued, refused
 * (with a reason, 0181: 2–300) or withdrawn; an issued one is confirmed, with or without a difference.
 * A line issued as zero is "Not issued" and needs a reason (5.3); issuing nothing at all is a refusal.
 */
export function requisitionNext(
  state: RequisitionState,
  event: RequisitionEvent,
): { ok: true; state: RequisitionState } | { ok: false; reason: RequisitionRefusal } {
  if (state === "raised") {
    if (event.type === "withdraw") return { ok: true, state: "withdrawn" };
    if (event.type === "refuse") {
      const r = event.reason.trim();
      return r.length < 2 || r.length > 300
        ? { ok: false, reason: "reason_needed" }
        : { ok: true, state: "refused" };
    }
    if (event.type === "issue") {
      const ls = event.lines;
      if (ls.some((l) => !Number.isInteger(l.issued) || l.issued < 0))
        return { ok: false, reason: "invalid_quantity" };
      if (ls.every((l) => l.issued === 0)) return { ok: false, reason: "nothing_issued" };
      if (ls.some((l) => l.issued === 0 && !l.notIssuedReason?.trim()))
        return { ok: false, reason: "not_issued_reason_needed" };
      return { ok: true, state: ls.every((l) => l.issued >= l.asked) ? "issued" : "part_issued" };
    }
  }
  if ((state === "issued" || state === "part_issued") && event.type === "confirm")
    return { ok: true, state: event.differences > 0 ? "confirmed_with_difference" : "confirmed" };
  return { ok: false, reason: "not_allowed" };
}

/**
 * IS-2, SL-14: the batches to issue, first expiry first, pre-filled with the quantity asked and capped at
 * what is held, so no batch goes below zero. Expired and blocked (quarantined or recalled) batches are
 * never offered.
 */
export function planIssue(
  asked: number,
  input: {
    batches: readonly StoreBatch[];
    balances: ReadonlyMap<string, number>;
    blocked: ReadonlySet<string>;
    localDate: string;
  },
): { rows: { batchId: string; quantity: number }[]; issue: number; held: number; short: number } {
  const usable = input.batches.filter(
    (b) => !input.blocked.has(b.id) && !isExpired(b, input.localDate),
  );
  const held = usable.reduce((s, b) => s + Math.max(0, input.balances.get(b.id) ?? 0), 0);
  const issue = Math.max(0, Math.min(asked, held));
  const p =
    issue > 0
      ? proposeBatches({
          batches: usable,
          balances: input.balances,
          quantity: issue,
          localDate: input.localDate,
        })
      : null;
  const rows = p?.ok ? p.rows : [];
  return { rows, issue, held, short: Math.max(0, asked - issue) };
}

/**
 * IS-3: receipt confirmed at the other end. Each line whose confirmed quantity differs writes an
 * `adjusted` movement at the receiving location (confirmed − issued) with the reason, listed for both
 * in-charges; a controlled line also needs a witnessed Phase 1 controlled difference.
 */
export function confirmationAdjustments(
  lines: readonly {
    receivingBatchId: string;
    issued: number;
    confirmed: number;
    controlled: boolean;
  }[],
  reasonCode: string | null,
):
  | {
      ok: true;
      adjustments: {
        batchId: string;
        quantity: number;
        reasonCode: string;
        controlledDifference: boolean;
      }[];
      notify: ("issuing_in_charge" | "receiving_in_charge")[];
    }
  | { ok: false; reason: "reason_needed" | "invalid_quantity" } {
  if (lines.some((l) => !Number.isInteger(l.confirmed) || l.confirmed < 0))
    return { ok: false, reason: "invalid_quantity" };
  const diff = lines.filter((l) => l.confirmed !== l.issued);
  if (diff.length === 0) return { ok: true, adjustments: [], notify: [] };
  if (!reasonCode?.trim()) return { ok: false, reason: "reason_needed" };
  return {
    ok: true,
    adjustments: diff.map((l) => ({
      batchId: l.receivingBatchId,
      quantity: l.confirmed - l.issued,
      reasonCode,
      controlledDifference: l.controlled,
    })),
    notify: ["issuing_in_charge", "receiving_in_charge"],
  };
}

/**
 * IS-4: issues not confirmed within the signed confirmation window, for both in-charges. Unsigned, the
 * list is not computed (Law 6).
 */
export function unconfirmedOverdue<I extends { issuedAt: Date; confirmedAt: Date | null }>(
  issues: readonly I[],
  now: Date,
  windowHours: number | null,
): { missing: ["confirmation_window"] } | { overdue: I[] } {
  if (windowHours === null) return { missing: ["confirmation_window"] };
  const cut = now.getTime() - windowHours * 3_600_000;
  return { overdue: issues.filter((i) => i.confirmedAt === null && i.issuedAt.getTime() < cut) };
}

/**
 * IS-5: a return goes back to its issuer as a return pair; stock not fit for the shelf goes to
 * quarantine instead (5.6). A reason is required.
 */
export function returnRoute(input: {
  fit: boolean;
  reasonCode: string;
  issuerLocationId: string;
  quarantineLocationId: string;
}):
  | { ok: true; outKind: "returned_out" | "quarantined_out"; toLocationId: string }
  | { ok: false; reason: "reason_needed" } {
  if (!input.reasonCode.trim()) return { ok: false, reason: "reason_needed" };
  return input.fit
    ? { ok: true, outKind: "returned_out", toLocationId: input.issuerLocationId }
    : { ok: true, outKind: "quarantined_out", toLocationId: input.quarantineLocationId };
}

/**
 * IS-6, IS-7: what a controlled line needs. Issued only with a witness at the issuing end, confirmed by a
 * person with a second factor at the receiving end; never lent or borrowed in this slice.
 */
export function controlledRefusals(line: {
  controlled: boolean;
  movement: "issue" | "confirm" | "loan";
  witnessAttestationId: string | null;
  confirmerSecondFactor: boolean;
}): ("witness_needed" | "second_factor_needed" | "controlled_not_lent")[] {
  if (!line.controlled) return [];
  if (line.movement === "loan") return ["controlled_not_lent"];
  if (line.movement === "issue" && !line.witnessAttestationId) return ["witness_needed"];
  if (line.movement === "confirm" && !line.confirmerSecondFactor) return ["second_factor_needed"];
  return [];
}

/**
 * IS-7: loans outstanding per facility and product, a projection. `lent` is settled by
 * `loan_returned_in`, `borrowed` by `loan_returned_out`, each linked to the loan; a return never opens a
 * new loan, and one that exceeds or mismatches its loan is listed as a problem.
 */
export function loanBalances(
  movements: readonly StoreMovement[],
  productOf: ReadonlyMap<string, string>,
): {
  outstanding: {
    loanMovementId: string;
    counterpartyId: string;
    productId: string;
    direction: "lent" | "borrowed";
    quantity: number;
  }[];
  problems: { movementId: string; problem: "no_loan" | "wrong_direction" | "exceeds_loan" }[];
} {
  const loans = new Map(
    movements.filter((m) => m.kind === "lent" || m.kind === "borrowed").map((m) => [m.id, m]),
  );
  const left = new Map([...loans].map(([id, m]) => [id, Math.abs(m.quantity)]));
  const problems: {
    movementId: string;
    problem: "no_loan" | "wrong_direction" | "exceeds_loan";
  }[] = [];
  for (const m of movements) {
    if (m.kind !== "loan_returned_in" && m.kind !== "loan_returned_out") continue;
    const loan = m.loanMovementId ? loans.get(m.loanMovementId) : undefined;
    if (!loan) {
      problems.push({ movementId: m.id, problem: "no_loan" });
      continue;
    }
    const settles = loan.kind === "lent" ? "loan_returned_in" : "loan_returned_out";
    if (m.kind !== settles) {
      problems.push({ movementId: m.id, problem: "wrong_direction" });
      continue;
    }
    const rest = (left.get(loan.id) ?? 0) - Math.abs(m.quantity);
    if (rest < 0) problems.push({ movementId: m.id, problem: "exceeds_loan" });
    left.set(loan.id, Math.max(0, rest));
  }
  const outstanding = [...loans.values()]
    .map((m) => ({
      loanMovementId: m.id,
      counterpartyId: m.counterpartyId ?? "",
      productId: productOf.get(m.batchId) ?? "",
      direction: m.kind as "lent" | "borrowed",
      quantity: left.get(m.id) ?? 0,
    }))
    .filter((r) => r.quantity > 0);
  return { outstanding, problems };
}

/** IS-7: the outstanding loan total per facility, product and direction. */
export function loanTotals(
  outstanding: ReturnType<typeof loanBalances>["outstanding"],
): Map<string, number> {
  const out = new Map<string, number>();
  for (const r of outstanding) {
    const k = `${r.counterpartyId}|${r.productId}|${r.direction}`;
    out.set(k, (out.get(k) ?? 0) + r.quantity);
  }
  return out;
}
