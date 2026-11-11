import "server-only";

import type { EmrDb } from "@/lib/emr/db";
import type { Holiday } from "@/lib/pharmacy/derive/roster";
import type { RosterWorld } from "@/lib/pharmacy/roster/read";

import { signedAvatarUrl } from "@/lib/avatars";
import { addDays, holidays, weekStart } from "@/lib/pharmacy/derive/roster";
import { loadRosterWorld } from "@/lib/pharmacy/roster/read";

/**
 * The tab's serialisable payload: the loader's world without its closures, plus what the client needs to decide on
 * its own (editable places, signed photo URLs, holidays in range). Every client component takes `view: RosterView`.
 */
export type RosterView = Omit<RosterWorld, "canEdit" | "people"> & {
  editable: string[];
  people: (RosterWorld["people"][number] & { photo: string | null })[];
  holidays: Record<string, Holiday>;
  /** For the month view: the month shown (`yyyy-mm`). */
  month: string;
  /** Hospital staff not on the roster yet, for "Add a person" (the page adds them). */
  staff?: { userId: string; name: string }[];
};

export interface RosterQuery {
  week?: string;
  month?: string;
}

export async function rosterView(
  db: EmrDb,
  hospitalId: string,
  viewerId: string,
  inCharge: boolean,
  q: RosterQuery,
  now = new Date(),
): Promise<RosterView> {
  const today = new Date(now.getTime() + 3 * 3_600_000).toISOString().slice(0, 10);
  const shown = q.week && /^\d{4}-\d{2}-\d{2}$/.test(q.week) ? weekStart(q.week) : weekStart(today);
  const month = q.month && /^\d{4}-\d{2}$/.test(q.month) ? q.month : shown.slice(0, 7);
  // The month view needs its whole grid; the week view its load window and the swap form's next week.
  const mStart = weekStart(`${month}-01`);
  const from = [addDays(shown, -28), mStart].sort()[0]!;
  const to = [addDays(shown, 13), addDays(mStart, 41)].sort().at(-1)!;
  const w = await loadRosterWorld(db, hospitalId, viewerId, inCharge, shown, now, { from, to });
  const { canEdit, people, ...rest } = w;
  const years = [...new Set([from.slice(0, 4), to.slice(0, 4)].map(Number))];
  const hol: Record<string, Holiday> = {};
  for (const y of years) for (const [d, h] of holidays(y, w.gazetted)) hol[d] = h;
  return {
    ...rest,
    editable: w.places.filter((p) => canEdit(p.id)).map((p) => p.id),
    people: await Promise.all(
      people.map(async (p) => ({ ...p, photo: await signedAvatarUrl(p.avatarPath) })),
    ),
    holidays: hol,
    month,
  };
}
