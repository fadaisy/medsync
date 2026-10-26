import type { LogRow } from "@/data/health-log";
import { useEffect, useRef, useState } from "react";
import { Pedometer } from "expo-sensors";
import { Platform } from "react-native";

import { stepsToSave } from "@/data/exercise";
import { addLog, dayKey, lastDays, latestByDay } from "@/data/health-log";

export type StepsState =
  | { status: "checking" }
  | { status: "off"; why: "no_sensor" | "no_permission" }
  | { status: "on"; today: number; live: boolean };

/**
 * Steps from the phone's own motion counter (`expo-sensors`, works in Expo Go;
 * ADR 0413), written to the patient's log as each day's total so the history
 * outlives the phone's memory and the care team can read it.
 *
 * - iPhone keeps the last seven days even with the app closed: each is read
 *   when the screen opens and once a minute while it stays open.
 * - Android counts only while the app is open (`live`): the steps of this
 *   visit are added to what today already holds.
 *
 * Apple Health and Health Connect replace this in a development build.
 */
export function usePhoneSteps(rows: LogRow[], now: Date): StepsState {
  const [state, setState] = useState<StepsState>({ status: "checking" });
  // The stored totals, for callbacks that outlive a render.
  const stored = useRef(new Map<string, number>());
  useEffect(() => {
    const m = new Map<string, number>();
    for (const [k, r] of latestByDay(rows, "steps")) m.set(k, r.v1 ?? 0);
    stored.current = m;
  }, [rows]);

  const today = dayKey(now);
  useEffect(() => {
    let live = true;
    let timer: ReturnType<typeof setInterval> | null = null;
    let sub: { remove: () => void } | null = null;

    const write = (day: string, steps: number, at: Date) => {
      stored.current.set(day, steps);
      void addLog({ kind: "steps", v1: steps, unit: "phone" }, at);
    };

    void (async () => {
      if (!(await Pedometer.isAvailableAsync().catch(() => false))) {
        if (live) setState({ status: "off", why: "no_sensor" });
        return;
      }
      const perm = await Pedometer.requestPermissionsAsync().catch(() => null);
      if (!perm?.granted) {
        if (live) setState({ status: "off", why: "no_permission" });
        return;
      }

      if (Platform.OS === "ios") {
        const read = async () => {
          const end = new Date();
          const days = lastDays(end, 7);
          const phone = await Promise.all(
            days.map(async (d) => {
              const to =
                dayKey(d) === dayKey(end)
                  ? end
                  : new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59);
              const r = await Pedometer.getStepCountAsync(d, to).catch(() => ({ steps: 0 }));
              return { day: dayKey(d), steps: r.steps, at: to };
            }),
          );
          for (const p of stepsToSave(stored.current, phone)) {
            write(p.day, p.steps, phone.find((x) => x.day === p.day)!.at);
          }
          if (live)
            setState({ status: "on", today: phone[phone.length - 1]?.steps ?? 0, live: false });
        };
        await read();
        timer = setInterval(() => void read(), 60_000);
        return;
      }

      // Android: count while open, on top of what today already holds.
      const base = stored.current.get(today) ?? 0;
      if (live) setState({ status: "on", today: base, live: true });
      sub = Pedometer.watchStepCount(({ steps }) => {
        const total = base + steps;
        if (live) setState({ status: "on", today: total, live: true });
        const [due] = stepsToSave(stored.current, [{ day: today, steps: total }]);
        if (due) write(due.day, due.steps, new Date());
      });
    })();

    return () => {
      live = false;
      if (timer) clearInterval(timer);
      sub?.remove();
    };
  }, [today]);

  return state;
}
