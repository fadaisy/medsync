import type { RoleAssignment, TimelineEvent } from "@/lib/resus/types";

/**
 * Pure reconstruction of the immutable resus timeline (GATE B).
 *
 * The append-only store keeps EVERY event ever written, including
 * superseded originals. This derives the "current truth" VIEW by hiding
 * any event that a later correction supersedes — without ever mutating
 * the store. Pass `asOf` to replay the record as it stood at a past
 * SYSTEM time (createdAt), which is what makes the medico-legal record
 * reconstructable second-by-second.
 *
 * Nothing here decides supersession from a mutable status column —
 * supersession is derived purely from `supersedesEventId` pointers, so
 * the table can be hard append-only (REVOKE UPDATE/DELETE).
 */
export function reconstructTimeline(
  events: readonly TimelineEvent[],
  opts: { asOf?: string } = {},
): TimelineEvent[] {
  // Replay only the rows written at/under the as-of system time. A
  // correction written later does not yet apply when reconstructing an
  // earlier state.
  const visible = opts.asOf ? events.filter((e) => e.createdAt <= opts.asOf!) : events.slice();

  // Any event id that some visible event supersedes is hidden from view.
  const superseded = new Set<string>();
  for (const e of visible) {
    if (e.supersedesEventId) superseded.add(e.supersedesEventId);
  }

  const active = visible.filter((e) => !superseded.has(e.id));

  // Order by clinical time, then system time, then id (stable + total).
  return active.sort((a, b) => {
    if (a.recordedAt !== b.recordedAt) return a.recordedAt < b.recordedAt ? -1 : 1;
    if (a.createdAt !== b.createdAt) return a.createdAt < b.createdAt ? -1 : 1;
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  });
}

/**
 * The current team roster: one holder per role. Open assignments only
 * (`endedAt === null`); if a role was handed over and somehow has more
 * than one open row, the latest `assignedAt` wins (and its id breaks a
 * tie). Pure; does not mutate input.
 */
export function resolveRoster(assignments: readonly RoleAssignment[]): RoleAssignment[] {
  const current = new Map<string, RoleAssignment>();
  for (const a of assignments) {
    if (a.endedAt !== null) continue;
    const held = current.get(a.role);
    if (
      !held ||
      a.assignedAt > held.assignedAt ||
      (a.assignedAt === held.assignedAt && a.id > held.id)
    ) {
      current.set(a.role, a);
    }
  }
  return [...current.values()];
}
