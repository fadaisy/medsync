import type { ReadingInput, ReadingKind } from "@/lib/readings";

import { createStore, useStore } from "@/data/store";
import { track } from "@/lib/analytics";
import { flag } from "@/lib/flags";
import { enqueue } from "@/offline/outbox";

/**
 * Readings the patient logs. Demo data until Gate CG (law L2): saved
 * readings go to the outbox on the phone and into this store so every screen
 * sees them; nothing leaves the phone.
 */
export interface SavedReading {
  id: string;
  input: ReadingInput;
  at: string;
  feel: string[];
}

/** "Last time" lines from the boards. */
export const LAST_TIME: Record<ReadingKind, string> = {
  bp: "142/88 · yesterday 20:10",
  sugar: "6.8 · before breakfast, yesterday",
  weight: "86.0 kg · last Saturday",
  pulse: "76 · yesterday",
};

/** The values a fresh form starts from (the last reading, as the boards show). */
export const START_VALUES = {
  top: "138",
  bottom: "86",
  sugar: "7.1",
  weight: "85.5",
  pulse: "74",
} as const;

const store = createStore<SavedReading[]>([]);

export const readingsRepo = {
  demo: !flag("mobileClinicalData"),

  /** Save in place. `entry` and `taps` feed the "two taps or fewer" metric. */
  save(input: ReadingInput, opts: { entry: "sheet" | "page"; taps: number; feel?: string[] }) {
    const at = new Date().toISOString();
    store.set((list) => [{ id: `${list.length + 1}`, input, at, feel: opts.feel ?? [] }, ...list]);
    track("reading_saved", { entry: opts.entry, taps: opts.taps, kind: input.kind });
    void enqueue("reading", { input, at, feel: opts.feel ?? [] });
  },
};

export function useSavedReadings(): SavedReading[] {
  return useStore(store);
}
