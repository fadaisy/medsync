/**
 * The cut-over to one result path (Lab Phase 1, §6.9, rules CO-1 to CO-5; ADR 0249). Pure.
 *
 * Four conditions, each with its evidence; the switch needs all four and a second approver, and is one
 * audited transaction (CO-2). After it, no legacy write is allowed for that hospital (CO-4) until a
 * superadmin reverses it with a second approver and a reason (CO-5).
 */

export interface ReadinessInput {
  openLegacyItems: number;
  testsWithoutUnit: readonly string[];
  noticeSigned: boolean;
  alertWordingSigned: boolean;
  responseTimesSigned: boolean;
  departmentsWithoutLevel1: readonly string[];
  drills: number;
  briefings: number;
}

export interface Condition {
  key: "legacy_clear" | "setup_complete" | "drill_recorded" | "briefing_recorded";
  met: boolean;
  evidence: string[];
}

/** CO-1, CO-3: the four conditions, with what shows each. */
export function cutoverReadiness(i: ReadinessInput): { ready: boolean; conditions: Condition[] } {
  const setupGaps = [
    ...i.testsWithoutUnit.map((t) => `no_unit:${t}`),
    ...(i.noticeSigned ? [] : ["notice_unsigned"]),
    ...(i.alertWordingSigned ? [] : ["alert_wording_unsigned"]),
    ...(i.responseTimesSigned ? [] : ["response_times_unsigned"]),
    ...i.departmentsWithoutLevel1.map((d) => `no_level1:${d}`),
  ];
  const conditions: Condition[] = [
    {
      key: "legacy_clear",
      met: i.openLegacyItems === 0,
      evidence: [`open_legacy:${i.openLegacyItems}`],
    },
    { key: "setup_complete", met: setupGaps.length === 0, evidence: setupGaps },
    { key: "drill_recorded", met: i.drills > 0, evidence: [`drills:${i.drills}`] },
    { key: "briefing_recorded", met: i.briefings > 0, evidence: [`briefings:${i.briefings}`] },
  ];
  return { ready: conditions.every((c) => c.met), conditions };
}

/** CO-2: all four, and someone other than the requester approves. */
export function canSwitch(
  readiness: { ready: boolean },
  requestedBy: string,
  approvedBy: string,
): { ok: true } | { ok: false; reason: "not_ready" | "same_person" } {
  if (!readiness.ready) return { ok: false, reason: "not_ready" };
  if (requestedBy === approvedBy) return { ok: false, reason: "same_person" };
  return { ok: true };
}

export interface CutoverRow {
  switchedAt: Date | null;
  reversedAt: Date | null;
}

/** CO-4: the legacy path takes writes only where no live switch exists. */
export const legacyWritesAllowed = (live: CutoverRow | null) =>
  !live || live.switchedAt === null || live.reversedAt !== null;

/** CO-5: a superadmin, a second superadmin, and a reason. */
export function canReverse(i: {
  reversedBy: string;
  reversedByIsSuperadmin: boolean;
  approvedBy: string;
  approvedByIsSuperadmin: boolean;
  reason: string;
}): { ok: true } | { ok: false; reason: "not_superadmin" | "same_person" | "reason_required" } {
  if (!i.reversedByIsSuperadmin || !i.approvedByIsSuperadmin)
    return { ok: false, reason: "not_superadmin" };
  if (i.reversedBy === i.approvedBy) return { ok: false, reason: "same_person" };
  if (i.reason.trim().length < 10) return { ok: false, reason: "reason_required" };
  return { ok: true };
}
