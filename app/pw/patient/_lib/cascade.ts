import type { DayDose, Today } from "@/lib/patient-web/today";
import type { LogRow, SavedReading } from "@patient-core/log";
import { SLOT_WORDS } from "@patient-core/dose-slots";
import {
  DAY_GOAL,
  dayKey,
  GLASSES,
  minutesOn,
  STEP_AIM,
  stepsOn,
  waterOn,
  whenWords,
} from "@patient-core/log";
import { checkReading, readingValueText } from "@patient-core/readings";

import { HOME_COPY as C } from "@/content/patient/home";

/**
 * The day cascade, as the phone's Home builds it (mobile/src/app/(app)/(tabs)/index.tsx): doses taken today
 * (the last two), the latest reading, Move, Eat and Water, then the tail card (the dose due now, the next
 * one, or "Nothing due right now"). Pure, so S4 is tested without a page.
 */

export type StepIcon = "pill" | "activity" | "walk" | "utensils" | "droplet";
export interface Step {
  key: string;
  icon: StepIcon;
  title: string;
  line: string;
  done: boolean;
  href: string;
}

export type Tail =
  | { kind: "now"; dose: DayDose }
  | { kind: "next"; dose: DayDose }
  | { kind: "quiet" }
  | null;

export type DayView = { kind: "firstRun" } | { kind: "cascade"; steps: Step[]; tail: Tail };

/** The reading's plain word: in range, outside the target, or needs attention. Weight is never judged. */
export function readingWord(input: SavedReading["input"]): string {
  if (input.kind === "weight") return C.readingWord.weight;
  const level = checkReading(input).level;
  return level === "ok"
    ? C.readingWord.ok
    : level === "watch"
      ? C.readingWord.watch
      : C.readingWord.danger;
}

export function buildDay(input: {
  today: Today;
  medicineCount: number;
  readings: SavedReading[];
  rows: LogRow[];
  now: Date;
}): DayView {
  const { today, readings, rows, now } = input;
  const moved = minutesOn(rows, [now])[0] ?? 0;
  const water = waterOn(rows, now);
  // ponytail: the web has no food list yet, so the Eat card keeps the phone's empty words; meals only stop
  // first run. Upgrade: move the phone's food items into @patient-core and count kcal as the phone does.
  const meals = rows.filter((r) => r.kind === "meal" && sameDay(r.recordedAt, now)).length;
  if (!input.medicineCount && !readings.length && !moved && !water && !meals)
    return { kind: "firstRun" };

  // The web has no step counter (§3): steps show only when the phone app synced them today.
  const synced = stepsOn(rows, [now])[0] ?? 0;
  const stepsToday = synced > 0 ? synced : null;
  const minutesLine = !moved
    ? C.minutesNone
    : moved >= DAY_GOAL
      ? C.minutesGoal
      : C.minutesSome(moved, DAY_GOAL);

  const takenToday = today.doses.filter((d) => d.status === "taken");
  const latest = readings[0];
  const steps: Step[] = [
    ...takenToday.slice(-2).map((d) => ({
      key: d.id,
      icon: "pill" as const,
      title: C.doseTitle(SLOT_WORDS[d.slot], d.medicine),
      line: C.doseTaken(d.takenAt ?? d.time),
      done: true,
      href: "/patient/care/medicines",
    })),
    ...(latest
      ? [
          {
            key: latest.id,
            icon: "activity" as const,
            title: `${C.kindWords[latest.input.kind]} · ${readingValueText(latest.input)}`,
            line: `${whenWords(latest.at, now)} · ${readingWord(latest.input)}`,
            done: false,
            href: "/patient/care/trends",
          },
        ]
      : []),
    {
      key: "move",
      icon: "walk",
      title:
        stepsToday !== null
          ? C.moveSteps(stepsToday.toLocaleString("en-GB"), STEP_AIM.toLocaleString("en-GB"))
          : C.moveMinutes(moved, DAY_GOAL),
      line:
        stepsToday !== null
          ? minutesLine
          : !moved
            ? C.moveNone
            : moved >= DAY_GOAL
              ? C.moveGoal
              : C.moveToGo(DAY_GOAL - moved),
      done: stepsToday !== null ? stepsToday >= STEP_AIM || moved >= DAY_GOAL : moved >= DAY_GOAL,
      href: "/patient/care/move",
    },
    {
      key: "eat",
      icon: "utensils",
      title: C.eatNone,
      line: C.eatTap,
      // No calorie goal is set for anyone, so a day of meals is never "done".
      done: false,
      href: "/patient/care/move?tab=eat",
    },
    {
      key: "water",
      icon: "droplet",
      title: C.water(water, GLASSES),
      line: !water ? C.waterNone : water >= GLASSES ? C.waterDone : C.waterToGo(GLASSES - water),
      done: water >= GLASSES,
      href: "/patient/care/move?tab=eat",
    },
  ];

  const due = today.dueNow[0];
  const next = today.doses.find((d) => d.status === "later");
  const quiet = !takenToday.length && !latest;
  const tail: Tail = due
    ? { kind: "now", dose: due }
    : next
      ? { kind: "next", dose: next }
      : quiet
        ? { kind: "quiet" }
        : null;
  return { kind: "cascade", steps, tail };
}

const sameDay = (iso: string, now: Date) => dayKey(new Date(iso)) === dayKey(now);

/** The tone of the card at `index`: navy, ocean, sea, then ocean and sea in turn (three tones). */
export function cascadeTone(index: number): 0 | 1 | 2 {
  return index < 3 ? (index as 0 | 1 | 2) : index % 2 ? 1 : 2;
}
