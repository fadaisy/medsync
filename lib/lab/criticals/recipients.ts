/**
 * The recipient ladder (Lab Phase 1, §6.5, rules RC-1 to RC-7; ADR 0243). Pure.
 *
 * Level 0: who ordered, and the patient's current responsible clinician. Level 1: the ordering
 * department's contacts, in order. Level 2: the hospital's contacts. Recipients are resolved when the
 * message is sent and stored on the event (RC-6). A level that resolves to nobody is skipped at once and
 * named; if every level is empty the alert is `not_sent` (RC-5, Law 4).
 *
 * RC-7 (the nurse in charge, informed only) has no surface in this slice (D-LAB1-05): not resolved here.
 */
import type { Level } from "@/lib/lab/criticals/alerts";

import { LAST_LEVEL } from "@/lib/lab/criticals/alerts";

export interface Contact {
  hospitalId: string;
  level: 1 | 2;
  departmentId: string | null;
  userId: string;
  position: number;
}

/** What the server knows about a would-be recipient now. */
export interface StaffNow {
  active: boolean;
  /** Still holds an approved or active affiliation at this hospital. */
  affiliatedHere: boolean;
  /** Has an access basis for the patient (only asked for a restricted report, RC-4). */
  mayOpenChart: boolean;
}

export type SkipReason = "inactive" | "left" | "no_access" | "unknown";

export interface LadderInput {
  hospitalId: string;
  orderedBy: string | null;
  responsibleClinician: string | null;
  orderDepartmentId: string | null;
  contacts: readonly Contact[];
  restricted: boolean;
  staff: (userId: string) => StaffNow | undefined;
}

export interface LevelResolution {
  level: Level;
  recipients: string[];
  skipped: { userId: string; reason: SkipReason }[];
}

function candidates(level: Level, i: LadderInput): string[] {
  const here = i.contacts.filter((c) => c.hospitalId === i.hospitalId);
  const ordered = (c: Contact[]) => c.sort((a, b) => a.position - b.position).map((c) => c.userId);
  if (level === 0)
    return [i.orderedBy, i.responsibleClinician].filter((u): u is string => u !== null);
  if (level === 1)
    return i.orderDepartmentId === null
      ? []
      : ordered(here.filter((c) => c.level === 1 && c.departmentId === i.orderDepartmentId));
  return ordered(here.filter((c) => c.level === 2 && c.departmentId === null));
}

/** RC-1 to RC-4: one level, with whoever was skipped and why. */
export function resolveLevel(level: Level, i: LadderInput): LevelResolution {
  const recipients: string[] = [];
  const skipped: LevelResolution["skipped"] = [];
  for (const userId of new Set(candidates(level, i))) {
    const s = i.staff(userId);
    const reason: SkipReason | null = !s
      ? "unknown"
      : !s.active
        ? "inactive"
        : !s.affiliatedHere
          ? "left"
          : i.restricted && !s.mayOpenChart
            ? "no_access"
            : null;
    if (reason) skipped.push({ userId, reason });
    else recipients.push(userId);
  }
  return { level, recipients, skipped };
}

export interface LadderResult {
  /** The level the alert now sits at: the first that reached someone, or the last when none did. */
  level: Level;
  recipients: string[];
  skipped: LevelResolution["skipped"];
  /** Levels tried that reached nobody, in order, for the lab to be told in words. */
  emptyLevels: Level[];
  /** True when no level from `from` upwards reached anyone (RC-5: the lab must phone). */
  reachedNobody: boolean;
}

/** RC-5: from a level upwards, the first level that reaches somebody. */
export function resolveFrom(from: Level, i: LadderInput): LadderResult {
  const emptyLevels: Level[] = [];
  const skipped: LevelResolution["skipped"] = [];
  for (let l = from; l <= LAST_LEVEL; l++) {
    const r = resolveLevel(l as Level, i);
    skipped.push(...r.skipped);
    if (r.recipients.length > 0)
      return {
        level: r.level,
        recipients: r.recipients,
        skipped,
        emptyLevels,
        reachedNobody: false,
      };
    emptyLevels.push(r.level);
  }
  return { level: LAST_LEVEL, recipients: [], skipped, emptyLevels, reachedNobody: true };
}
