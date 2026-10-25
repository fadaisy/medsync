/**
 * Pharmacy Phase 3: antimicrobial stewardship (AM-0 to AM-8). Pure over courses, charted doses, culture orders and
 * the signed AWaRe pack and review settings. Every figure returns its numerator, denominator and definition (AM-8);
 * nothing stops an antibiotic (Law 5) and no interval is assumed (Law 6).
 */

export type Group = "Access" | "Watch" | "Reserve" | "unknown";

export interface ReviewSettings {
  /** Days from day 1 to the review, per group; a group not listed gets no prompt (D-PH3-07). */
  intervalDays: Partial<Record<Exclude<Group, "unknown">, number>>;
  /** The "started with no culture sent" window, hours either side of the start. */
  noCultureWindowHours: number;
}

export interface Course {
  prescriptionId: string;
  patientUserId: string;
  medicineId: string;
  route: string | null;
  ward: string | null;
  indication: string | null;
  placedAt: Date;
  /** Ended by cancellation, replacement or discharge; null while open (AM-2). */
  endedAt: Date | null;
  /** Charted administrations of this line (the administration record). */
  doses: readonly Date[];
}

export interface Culture {
  patientUserId: string;
  orderedAt: Date;
  releasedAt: Date | null;
  reportId: string | null;
}

export interface Review {
  prescriptionId: string;
  reviewedAt: Date;
}

/** Calendar day in the hospital's local time, as yyyy-mm-dd. */
export const localDay = (d: Date, timeZone: string) =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
const dayNumber = (iso: string) => Math.round(Date.parse(`${iso}T00:00:00Z`) / 86_400_000);

/** AM-0: the signed tag for a medicine and route (a route-specific tag wins); null when not in the pack. */
export function groupOf(
  tags: Record<string, Group>,
  medicineId: string,
  route: string | null,
): Group | null {
  return (route ? tags[`${medicineId}:${route}`] : undefined) ?? tags[medicineId] ?? null;
}

/** AM-2, AM-3: day of therapy from the first charted dose, or from the placing when nothing is charted. */
export function dayOfTherapy(c: Course, now: Date, timeZone: string) {
  const first = c.doses.length ? new Date(Math.min(...c.doses.map(Number))) : c.placedAt;
  return {
    day: dayNumber(localDay(now, timeZone)) - dayNumber(localDay(first, timeZone)) + 1,
    from: c.doses.length ? ("charted" as const) : ("prescribed" as const),
    start: first,
  };
}

/**
 * AM-3: review due when the day of therapy has reached the signed interval for the group and no review was recorded
 * since the interval began. Unsigned settings or an unlisted group: never due. An ended course is never due.
 */
export function reviewDue(
  c: Course,
  group: Group,
  settings: ReviewSettings | null,
  reviews: readonly Review[],
  now: Date,
  timeZone: string,
): { due: boolean; day: number; interval: number | null } {
  const { day, start } = dayOfTherapy(c, now, timeZone);
  const interval = group === "unknown" ? null : (settings?.intervalDays[group] ?? null);
  if (!interval || c.endedAt || day < interval) return { due: false, day, interval };
  const intervalStarted = dayNumber(localDay(start, timeZone)) + interval - 1;
  const reviewed = reviews.some(
    (r) =>
      r.prescriptionId === c.prescriptionId &&
      dayNumber(localDay(r.reviewedAt, timeZone)) >= intervalStarted,
  );
  return { due: !reviewed, day, interval };
}

/** AM-7: not sent, sent with no result, or released, around the course's start. */
export function cultureState(
  cultures: readonly Culture[],
  patientUserId: string,
  start: Date,
  windowHours: number,
): { state: "not_sent" | "sent" | "released"; at: Date | null; reportId: string | null } {
  const w = windowHours * 3_600_000;
  const near = cultures
    .filter(
      (x) =>
        x.patientUserId === patientUserId && Math.abs(x.orderedAt.getTime() - start.getTime()) <= w,
    )
    .sort((a, b) => b.orderedAt.getTime() - a.orderedAt.getTime())[0];
  if (!near) return { state: "not_sent", at: null, reportId: null };
  return near.releasedAt
    ? { state: "released", at: near.releasedAt, reportId: near.reportId }
    : { state: "sent", at: near.orderedAt, reportId: null };
}

export interface Fraction {
  numerator: number;
  denominator: number;
  definition: string;
}

/** AM-4, AM-5, AM-5a: figures for courses started in the period. Shares are shares of prescriptions. */
export function figures(
  courses: readonly Course[],
  tags: Record<string, Group>,
  cultures: readonly Culture[],
  settings: ReviewSettings | null,
  from: Date,
  to: Date,
) {
  const started = courses.filter((c) => c.placedAt >= from && c.placedAt < to);
  const groups: Group[] = ["Access", "Watch", "Reserve", "unknown"];
  const byGroup = Object.fromEntries(
    groups.map((g) => [
      g,
      {
        numerator: started.filter((c) => groupOf(tags, c.medicineId, c.route) === g).length,
        denominator: started.length,
        definition:
          "Antibiotic prescriptions started in the period in this group ÷ all started (a share of prescriptions)",
      } satisfies Fraction,
    ]),
  ) as Record<Group, Fraction>;
  const noCulture: Fraction | null = settings
    ? {
        numerator: started.filter(
          (c) =>
            cultureState(
              cultures,
              c.patientUserId,
              c.doses.length ? new Date(Math.min(...c.doses.map(Number))) : c.placedAt,
              settings.noCultureWindowHours,
            ).state === "not_sent",
        ).length,
        denominator: started.length,
        definition:
          "Courses started with no culture ordered within the signed window ÷ courses started",
      }
    : null;
  // AM-5: days of therapy are distinct calendar days with a charted dose; a ward that charts nothing shows courses.
  const dotByGroup = Object.fromEntries(
    groups.map((g) => {
      const days = new Set<string>();
      for (const c of started)
        if (groupOf(tags, c.medicineId, c.route) === g)
          for (const d of c.doses) days.add(`${c.prescriptionId}:${d.toISOString().slice(0, 10)}`);
      return [g, days.size];
    }),
  ) as Record<Group, number>;
  const wards = [...new Set(started.map((c) => c.ward ?? "none"))].sort();
  const byWard = wards.map((w) => {
    const inWard = started.filter((c) => (c.ward ?? "none") === w);
    return {
      ward: w,
      charts: inWard.some((c) => c.doses.length > 0),
      counts: Object.fromEntries(
        groups.map((g) => [
          g,
          inWard.filter((c) => groupOf(tags, c.medicineId, c.route) === g).length,
        ]),
      ) as Record<Group, number>,
    };
  });
  const reserve = started.filter((c) => groupOf(tags, c.medicineId, c.route) === "Reserve");
  return { started: started.length, byGroup, noCulture, dotByGroup, byWard, reserve };
}
