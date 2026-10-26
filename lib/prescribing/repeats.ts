import { addDays } from "@/lib/pharmacy/stores/ledger";

/**
 * Repeat authorisations (Pharmacy Phase 4, 6.1: RP-1 to RP-6, RI-1; Laws 2 and 4). Pure. Dates are local
 * "YYYY-MM-DD" strings, so they compare as text. 0230 is the source of truth for the rows and their guards.
 *
 * The pack (Appendix D: repeat list, never-repeat list, maxima, minimum interval, tolerance) is signed per
 * hospital; nothing here defaults it. While it is unsigned (`null`) no Repeats step is shown and no repeat is allowed.
 */

export interface RepeatPack {
  repeatList: readonly string[];
  neverRepeat: readonly string[];
  maxSupplies: number;
  maxPeriodDays: number;
  /** At least one day (Law 4). */
  minIntervalDays: number;
  /** May be zero. */
  toleranceDays: number;
}

export interface RepeatMedicine {
  medicineId: string;
  controlled: boolean;
  /** A line from the emergency path never offers repeats (5.2). */
  emergency: boolean;
}

/** RP-2, 5.2: is the Repeats step shown for this line? Controlled drugs never. */
export const repeatsOffered = (m: RepeatMedicine, pack: RepeatPack | null): boolean =>
  pack !== null &&
  !m.controlled &&
  !m.emergency &&
  pack.repeatList.includes(m.medicineId) &&
  !pack.neverRepeat.includes(m.medicineId);

export interface AuthorisationInput {
  furtherSupplies: number;
  minIntervalDays: number;
  notAfter: string;
  reviewBy: string | null;
}

export type AuthoriseRefusal = "not_offered" | "supplies" | "interval" | "not_after" | "review_by";

/** RP-2: every reason the prescriber's typed terms are refused; empty means they may be recorded. */
export function checkAuthorisation(
  a: AuthorisationInput,
  m: RepeatMedicine,
  pack: RepeatPack | null,
  today: string,
): AuthoriseRefusal[] {
  if (!pack || !repeatsOffered(m, pack)) return ["not_offered"];
  const out: AuthoriseRefusal[] = [];
  const whole = (n: number) => Number.isInteger(n);
  if (!whole(a.furtherSupplies) || a.furtherSupplies < 1 || a.furtherSupplies > pack.maxSupplies)
    out.push("supplies");
  if (!whole(a.minIntervalDays) || a.minIntervalDays < Math.max(1, pack.minIntervalDays))
    out.push("interval");
  if (a.notAfter <= today || a.notAfter > addDays(today, pack.maxPeriodDays)) out.push("not_after");
  if (a.reviewBy !== null && (a.reviewBy < today || a.reviewBy > a.notAfter)) out.push("review_by");
  return out;
}

export interface Authorisation extends AuthorisationInput {
  lineVersionId: string;
}

/** RP-3: what ended an authorisation. Only `stopped` is a row; the rest are read from the line. */
export type EndReason = "stopped" | "changed" | "cancelled" | "replaced" | "renewed";

export interface LineNow {
  /** The line's current version. */
  versionId: string;
  cancelled: boolean;
  replaced: boolean;
  /** A renewal placed a new prescription from this line (RN-3). */
  renewed: boolean;
}

/** RP-3: the projection; null while the authorisation stands. */
export function endedBy(a: Authorisation, line: LineNow, stopped: boolean): EndReason | null {
  if (stopped) return "stopped";
  if (line.cancelled) return "cancelled";
  if (line.replaced) return "replaced";
  if (line.renewed) return "renewed";
  if (a.lineVersionId !== line.versionId) return "changed";
  return null;
}

/** One repeat instance (RI-1) as RP-4 counts it. */
export interface InstanceUse {
  /** Closed by a hand-over, at the hospital or a partner. */
  handedOver: boolean;
  /** A Phase 1 "recorded in error" correction reopened it. */
  reversed: boolean;
}

/** RP-4: n less the instances a hand-over closed, net of reversals. A split across batches is one instance. */
export const remaining = (n: number, instances: readonly InstanceUse[]): number =>
  n - instances.filter((i) => i.handedOver && !i.reversed).length;

/** RP-5: whole local days. */
export const nextAllowed = (lastSupplyOn: string, intervalDays: number, toleranceDays: number) =>
  addDays(lastSupplyOn, intervalDays - toleranceDays);

/** Phase 3's reasons a repeat is blocked (RF-4). */
export type BlockReason = "stewardship_review" | "suspected_reaction";

export type RepeatStatus =
  | { kind: "allowed"; remaining: number; nextAllowed: string }
  | { kind: "too_early"; on: string }
  | { kind: "none_left" }
  | { kind: "expired" }
  | { kind: "stopped"; by: EndReason }
  | { kind: "blocked"; reason: BlockReason }
  | { kind: "not_allowed" }
  /** The line's own first supply (Phase 1) is still open, so there is nothing to repeat yet. */
  | { kind: "first_supply_open" };

export interface RepeatFacts {
  authorisation: Authorisation | null;
  line: LineNow;
  stopped: boolean;
  instances: readonly InstanceUse[];
  /** The last standing supply of the line, the first or a repeat. */
  lastSupplyOn: string | null;
  blocked: BlockReason | null;
  /** The medicine is on the never-repeat list now (it may have been added after authorising). */
  neverRepeat: boolean;
  toleranceDays: number;
}

/** RP-6: reads only the current, uncancelled line version. */
export function repeatStatus(f: RepeatFacts, today: string): RepeatStatus {
  const a = f.authorisation;
  if (!a || f.neverRepeat) return { kind: "not_allowed" };
  const by = endedBy(a, f.line, f.stopped);
  if (by) return { kind: "stopped", by };
  if (today > a.notAfter) return { kind: "expired" };
  const left = remaining(a.furtherSupplies, f.instances);
  if (left <= 0) return { kind: "none_left" };
  if (f.blocked) return { kind: "blocked", reason: f.blocked };
  if (!f.lastSupplyOn) return { kind: "first_supply_open" };
  const next = nextAllowed(f.lastSupplyOn, a.minIntervalDays, f.toleranceDays);
  if (today < next) return { kind: "too_early", on: next };
  return { kind: "allowed", remaining: left, nextAllowed: next };
}
