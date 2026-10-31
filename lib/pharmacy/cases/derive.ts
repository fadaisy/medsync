/**
 * Investigations, pure (rework TECH-SPEC §3, ported from prototype cases.js): a case's status and whether it is past
 * its deadline, the list order, and who needs to act (`caseFlags`). Plain data in, plain data out.
 */
import type { CaseFindings, CaseSeverity, CaseSource } from "@/db/schema/pharmacy-rework-controls";

export type CaseStatus = "new" | "open" | "signoff" | "closed";

export interface CaseRow {
  id: string;
  sourceType: CaseSource;
  sourceId: string | null;
  medicineId: string;
  medicineName: string;
  placeId: string;
  placeName: string;
  qty: number;
  what: string | null;
  severity: CaseSeverity;
  dueAt: Date;
  ownerUserId: string | null;
  owner: string | null;
  fixedAt: Date | null;
  fixedHow: string | null;
  findings: CaseFindings | null;
  submittedAt: Date | null;
  signedOffAt: Date | null;
  selfSigned: boolean;
  createdAt: Date;
  foundBy: string;
  fromHandover: boolean;
  escalated: boolean;
}

export const caseStatus = (c: Pick<CaseRow, "signedOffAt" | "submittedAt" | "ownerUserId">): CaseStatus =>
  c.signedOffAt ? "closed" : c.submittedAt ? "signoff" : c.ownerUserId ? "open" : "new";

export const isOverdue = (c: CaseRow, now: Date) => caseStatus(c) !== "closed" && c.dueAt < now;

const RANK: Record<CaseStatus, number> = { new: 0, open: 1, signoff: 2, closed: 3 };

/** New first, then investigating, sign-off, closed; overdue first within each; then the nearest deadline. */
export function caseList(cases: readonly CaseRow[], now: Date): CaseRow[] {
  return [...cases].sort(
    (a, b) =>
      RANK[caseStatus(a)] - RANK[caseStatus(b)] ||
      Number(isOverdue(b, now)) - Number(isOverdue(a, now)) ||
      a.dueAt.getTime() - b.dueAt.getTime(),
  );
}

export type CaseFlagWhy = "not_assigned" | "signoff" | "overdue" | "yours";

/** Who needs to act on a case: the in-charge for new, sign-off and overdue ones; the owner for theirs. */
export function caseFlags(cases: readonly CaseRow[], me: string, inCharge: boolean, now: Date) {
  const out: { c: CaseRow; why: CaseFlagWhy }[] = [];
  for (const c of caseList(cases, now)) {
    const s = caseStatus(c);
    if (s === "closed") continue;
    if (inCharge && s === "new") out.push({ c, why: "not_assigned" });
    else if (inCharge && s === "signoff") out.push({ c, why: "signoff" });
    else if (isOverdue(c, now) && (inCharge || c.ownerUserId === me)) out.push({ c, why: "overdue" });
    else if (c.ownerUserId === me && s === "open") out.push({ c, why: "yours" });
  }
  return out;
}

export const CASE_FILTERS = ["open", "new", "overdue", "signoff", "mine", "closed", "all"] as const;
export type CaseFilter = (typeof CASE_FILTERS)[number];

export function caseFilter(f: CaseFilter, me: string, now: Date): (c: CaseRow) => boolean {
  const s = (c: CaseRow) => caseStatus(c);
  return {
    open: (c: CaseRow) => s(c) !== "closed",
    new: (c: CaseRow) => s(c) === "new",
    overdue: (c: CaseRow) => isOverdue(c, now),
    signoff: (c: CaseRow) => s(c) === "signoff",
    mine: (c: CaseRow) => c.ownerUserId === me && s(c) !== "closed",
    closed: (c: CaseRow) => s(c) === "closed",
    all: () => true,
  }[f];
}

/** "3 h", "45 min", "2 days" (prototype `dur`). */
export function dur(ms: number): { n: number; unit: "min" | "h" | "days" } {
  const h = Math.round(Math.abs(ms) / 3_600_000);
  if (h < 1) return { n: Math.round(Math.abs(ms) / 60_000), unit: "min" };
  if (h < 48) return { n: h, unit: "h" };
  return { n: Math.round(h / 24), unit: "days" };
}

/** Findings are ready to submit: the number fixed (derived cases), a cause, an action and a prevention. */
export const findingsReady = (c: Pick<CaseRow, "sourceType" | "fixedAt">, f: Partial<CaseFindings>) =>
  (c.sourceType === "manual" || !!c.fixedAt) && !!f.cause && !!f.actions?.length && !!f.prevent?.length;
