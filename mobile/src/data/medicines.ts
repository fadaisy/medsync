import { createStore, useStore } from "@/data/store";
import { track } from "@/lib/analytics";
import { flag } from "@/lib/flags";
import { enqueue } from "@/offline/outbox";

/**
 * Medicines and today's doses. Demo data until Gate CG (law L2): a fixture
 * behind the shape the real repository will fill. Names stay placeholders
 * and no dose amount exists anywhere in the model (law L5): a dose is a
 * medicine, a time of day and "as your clinician prescribed".
 */
export type DoseSlot = "morning" | "midday" | "evening";
export type DoseStatus = "taken" | "due" | "later" | "missed";

export interface Dose {
  id: string;
  slot: DoseSlot;
  /** 24-hour "HH:MM". */
  time: string;
  medicine: string;
  instruction: string;
  takenAt: string | null;
  snoozedUntil: string | null;
}

export interface Medicine {
  id: string;
  name: string;
  forWhat: string;
  when: string;
  daysLeft: number;
  /** 0–1 of the supply left, for the bar. */
  supply: number;
  /** Two halves of a capsule, or one colour for a round tablet. */
  look: { shape: "capsule"; left: string; right: string } | { shape: "tablet"; color: string };
}

export const SLOT_WORDS: Record<DoseSlot, string> = {
  morning: "Morning",
  midday: "Midday",
  evening: "Evening",
};

/** Illustration colours for the pill drawings: art, not UI, so they live with the fixture. */
const ART = {
  violet: "#7c3aed",
  lilac: "#ede9fe",
  white: "#ffffff",
  navy: "#1b2540",
  sky: "#bae6fd",
};

const MEDICINES: Medicine[] = [
  {
    id: "a",
    name: "[Medicine A]",
    forWhat: "Diabetes",
    when: "morning and evening",
    daysLeft: 18,
    supply: 0.6,
    look: { shape: "capsule", left: ART.violet, right: ART.lilac },
  },
  {
    id: "b",
    name: "[Medicine B]",
    forWhat: "Diabetes",
    when: "midday with food",
    daysLeft: 4,
    supply: 0.13,
    look: { shape: "capsule", left: ART.white, right: ART.navy },
  },
  {
    id: "c",
    name: "[Medicine C]",
    forWhat: "Blood pressure",
    when: "morning",
    daysLeft: 22,
    supply: 0.73,
    look: { shape: "tablet", color: ART.sky },
  },
];

/** A supply of this many days or fewer shows amber and "Ask for refill". */
export const LOW_SUPPLY_DAYS = 7;

const minutes = (hhmm: string) => {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
};

export function hhmm(d: Date): string {
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

/** Due from an hour before its time until three hours after; then missed. */
export function doseStatus(dose: Dose, now: Date): DoseStatus {
  if (dose.takenAt) return "taken";
  const at = minutes(dose.time);
  const n = now.getHours() * 60 + now.getMinutes();
  if (n < at - 60) return "later";
  if (n <= at + 180) return "due";
  return "missed";
}

function seedDoses(now: Date): Dose[] {
  const n = now.getHours() * 60 + now.getMinutes();
  return [
    {
      id: "m",
      slot: "morning",
      time: "08:00",
      medicine: "[Medicine A]",
      instruction: "As your clinician prescribed",
      takenAt: n > minutes("08:12") ? "08:12" : null,
      snoozedUntil: null,
    },
    {
      id: "n",
      slot: "midday",
      time: "13:00",
      medicine: "[Medicine B]",
      instruction: "As your clinician prescribed · with food",
      takenAt: null,
      snoozedUntil: null,
    },
    {
      id: "e",
      slot: "evening",
      time: "20:00",
      medicine: "[Medicine A]",
      instruction: "As your clinician prescribed",
      takenAt: null,
      snoozedUntil: null,
    },
  ];
}

interface MedicinesState {
  doses: Dose[];
  /** Doses taken on each of the six days before today, oldest first. */
  pastWeek: number[];
  otherReported: boolean;
}

const store = createStore<MedicinesState>({
  doses: seedDoses(new Date()),
  pastWeek: [3, 3, 2, 3, 3, 3],
  otherReported: false,
});

export const medicinesRepo = {
  demo: !flag("mobileClinicalData"),
  medicines: (): Medicine[] => MEDICINES,

  take(id: string, at: Date = new Date()) {
    store.set((s) => ({
      ...s,
      doses: s.doses.map((d) =>
        d.id === id ? { ...d, takenAt: hhmm(at), snoozedUntil: null } : d,
      ),
    }));
    track("dose_confirmed", { slot: id });
    void enqueue("dose", { dose: id, takenAt: at.toISOString() });
  },

  undo(id: string) {
    store.set((s) => ({
      ...s,
      doses: s.doses.map((d) => (d.id === id ? { ...d, takenAt: null } : d)),
    }));
    track("dose_undone", { slot: id });
  },

  snooze(id: string, at: Date = new Date()) {
    const until = new Date(at.getTime() + 15 * 60 * 1000);
    store.set((s) => ({
      ...s,
      doses: s.doses.map((d) => (d.id === id ? { ...d, snoozedUntil: hhmm(until) } : d)),
    }));
    track("dose_snoozed", { slot: id });
  },

  /** "Something not on my list": tells the care team; no name is recorded here. */
  reportOther() {
    store.set((s) => ({ ...s, otherReported: true }));
  },
};

export function useMedicines(now: Date) {
  const s = useStore(store);
  const withStatus = s.doses.map((d) => ({ ...d, status: doseStatus(d, now) }));
  const taken = withStatus.filter((d) => d.status === "taken").length;
  return {
    doses: withStatus,
    dueNow: withStatus.filter((d) => d.status === "due"),
    taken,
    total: withStatus.length,
    week: [...s.pastWeek, taken],
    otherReported: s.otherReported,
    medicines: MEDICINES,
  };
}

/** The share of doses taken this month, for "92% this month" (demo, like the rest). */
export const MONTH_ADHERENCE = 0.92;
