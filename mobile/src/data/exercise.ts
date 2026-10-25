import type { IconName } from "@/components/tide/icon";
import type { LogRow } from "@/data/health-log";

import { dayKey, latestByDay } from "@/data/health-log";

/**
 * Activities the patient can log or time (ADR 0413), each with its energy cost
 * from the 2024 Adult Compendium of Physical Activities (Herrmann SD, Willis EA,
 * Ainsworth BE et al., J Sport Health Sci 2024;13(1):6–12; pacompendium.com),
 * by the Compendium's own activity code. Where effort changes the cost a lot,
 * the patient picks easy, moderate or hard and the matching code is used.
 */
export type Effort = "easy" | "moderate" | "hard";

export interface Activity {
  key: string;
  label: string;
  icon: IconName;
  /** One cost, or one per effort. MET and the Compendium code it comes from. */
  cost: { met: number; code: string } | Record<Effort, { met: number; code: string }>;
}

export const ACTIVITIES: readonly Activity[] = [
  {
    key: "walk",
    label: "Walking",
    icon: "walk",
    cost: {
      easy: { met: 3.5, code: "17160" }, // walking for pleasure
      moderate: { met: 4.8, code: "17200" }, // 3.5–3.9 mph, level, brisk
      hard: { met: 5.5, code: "17220" }, // 4.0–4.4 mph, very brisk
    },
  },
  {
    key: "run",
    label: "Running or jogging",
    icon: "footprints",
    cost: {
      easy: { met: 7.5, code: "12020" }, // jogging, general, self-selected pace
      moderate: { met: 8.5, code: "12030" }, // 5.0–5.2 mph
      hard: { met: 9.3, code: "12050" }, // 6–6.3 mph
    },
  },
  {
    key: "cycle",
    label: "Cycling",
    icon: "activity",
    cost: {
      easy: { met: 4.0, code: "01010" }, // <10 mph, leisure
      moderate: { met: 6.8, code: "01020" }, // 10–11.9 mph, light effort
      hard: { met: 7.0, code: "01014" }, // bicycling, general
    },
  },
  { key: "football", label: "Football", icon: "activity", cost: { met: 7.0, code: "15610" } },
  { key: "netball", label: "Netball", icon: "activity", cost: { met: 7.0, code: "15477" } },
  { key: "basketball", label: "Basketball", icon: "activity", cost: { met: 7.5, code: "15055" } },
  { key: "dance", label: "Dancing", icon: "heart", cost: { met: 4.5, code: "03025" } },
  {
    key: "garden",
    label: "Digging or gardening",
    icon: "sun",
    cost: {
      easy: { met: 3.8, code: "08239" }, // weeding, light-to-moderate
      moderate: { met: 3.8, code: "08245" }, // gardening, general, moderate
      hard: { met: 5.0, code: "08241" }, // using a hoe, moderate-to-vigorous
    },
  },
  { key: "housework", label: "Housework", icon: "home", cost: { met: 3.3, code: "05030" } },
  {
    key: "home_exercise",
    label: "Exercise at home",
    icon: "heart",
    cost: { met: 3.8, code: "02064" },
  },
  { key: "weights", label: "Weights", icon: "activity", cost: { met: 3.5, code: "02054" } },
  { key: "yoga", label: "Yoga or stretching", icon: "wind", cost: { met: 2.3, code: "02150" } },
  { key: "swim", label: "Swimming", icon: "droplet", cost: { met: 6.0, code: "18310" } },
];

export const hasEffort = (a: Activity): boolean => !("met" in a.cost);

/** The MET and Compendium code for an activity at an effort. */
export function costOf(a: Activity, effort: Effort): { met: number; code: string } {
  return "met" in a.cost ? a.cost : a.cost[effort];
}

/**
 * Estimated energy used: MET × body weight (kg) × hours, the Compendium's own
 * method. Null without a weight: the screen asks for one rather than assume.
 */
export function kcalFor(met: number, weightKg: number | null, minutes: number): number | null {
  if (!weightKg || weightKg <= 0 || minutes <= 0) return null;
  return Math.round(met * weightKg * (minutes / 60));
}

/** What the row stores in `unit`: the activity and effort, e.g. "walk:moderate". */
export const exerciseUnit = (a: Activity, effort: Effort) =>
  hasEffort(a) ? `${a.key}:${effort}` : a.key;

export function activityOf(unit: string | null): { activity: Activity; effort: Effort } | null {
  const [key, effort] = (unit ?? "").split(":");
  const activity = ACTIVITIES.find((a) => a.key === key);
  if (!activity) return null;
  return {
    activity,
    effort: (["easy", "moderate", "hard"] as const).find((e) => e === effort) ?? "moderate",
  };
}

/**
 * A common daily step aim for adults: the Lancet Public Health meta-analysis
 * (Paluch AE et al., 2022;7(3):e219–e228) found the gains level off around
 * 6,000–8,000 steps a day over 60 and 8,000–10,000 under 60. Shown as a common
 * aim, not this patient's target.
 */
export const STEP_AIM = 7000;

/** Each day's step total: the latest 'steps' row of the day (the counter only grows). */
export function stepsOn(rows: LogRow[], days: Date[]): number[] {
  const latest = latestByDay(rows, "steps");
  return days.map((d) => latest.get(dayKey(d))?.v1 ?? 0);
}

/**
 * Which phone totals to write: a day the phone counted more on than the log
 * holds, by at least `minStep` (so a screen left open does not write a row a
 * second). The phone's count only grows within a day, so a smaller number is
 * never written.
 */
export function stepsToSave(
  stored: ReadonlyMap<string, number>,
  phone: readonly { day: string; steps: number }[],
  minStep = 50,
): { day: string; steps: number }[] {
  return phone.filter((p) => p.steps - (stored.get(p.day) ?? 0) >= minStep);
}

/** Today's logged activities, newest first: what, how long, about how much energy. */
export function exercisesOn(rows: LogRow[], day: Date) {
  const k = dayKey(day);
  return rows.flatMap((r) => {
    if (r.kind !== "exercise" || dayKey(new Date(r.recordedAt)) !== k) return [];
    const found = activityOf(r.unit);
    return found
      ? [
          {
            id: r.id,
            label: found.activity.label,
            minutes: r.v1 ?? 0,
            kcal: r.v2,
            at: r.recordedAt,
          },
        ]
      : [];
  });
}
