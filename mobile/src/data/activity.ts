import { hhmm } from "@/data/medicines";
import { createStore, useStore } from "@/data/store";
import { flag } from "@/lib/flags";

/**
 * Move and eat. Demo data until Gate CG (law L2): the boards' values
 * (TActivity, TCare). Water and a started walk live in this store on the
 * phone only; nothing is sent anywhere.
 */
export const ACTIVITY_NOTE = "Illustrative. Goals set by your care team and dietitian.";

/** Illustration colours for the plate guide and the water glasses: art, not UI. */
export const PLATE_ART = {
  plate: "#ffffff",
  rim: "#dde1e9",
  greens: "#a7f3e4",
  starch: "#7dd3fc",
  protein: "#c7d2fe",
  leaf: "#2f855a",
  leafVein: "#c6f6d5",
  matooke: "#c9d77a",
  matookeEdge: "#7c8a2e",
  bean: "#8b4a3c",
  water: "#7dd3fc",
  waterEdge: "#0284c7",
} as const;

export const TODAY = {
  steps: 5420,
  stepsGoal: 7000,
  activeMin: 22,
  activeGoal: 30,
  kcal: 1240,
  kcalGoal: 1800,
};

/** Active minutes, Sunday first; the last day is today. */
export const WEEK_MINUTES = [12, 25, 30, 18, 0, 25, 22];
export const WEEK_LETTERS = ["S", "M", "T", "W", "T", "F", "S"];
export const WEEK_GOAL = 150;

export const SAFETY_SIGNS = [
  { icon: "heart", text: "Chest pain or tightness" },
  { icon: "wind", text: "Very short of breath" },
  { icon: "dizzy", text: "Dizzy or about to faint" },
  { icon: "droplet", text: "Shaky, sweaty or confused" },
] as const;

export const SAFETY_STEPS = [
  "1. Stop and sit down.",
  "2. Shaky, sweaty or confused? Eat or drink something sweet now.",
  "3. Chest pain or it is not getting better? Get help.",
];

export interface Meal {
  id: string;
  time: string;
  name: string;
  what: string;
  kcal: number;
}
export const MEALS: Meal[] = [
  {
    id: "b",
    time: "07:30",
    name: "Breakfast",
    what: "Tea, no sugar · brown bread · egg",
    kcal: 320,
  },
  { id: "l", time: "13:10", name: "Lunch", what: "Matooke · beans · dodo greens", kcal: 610 },
  { id: "s", time: "16:00", name: "Snack", what: "Groundnuts · an orange", kcal: 310 },
];

export const GLASSES = 8;

/** Tap a full glass and the water empties down to it; tap an empty one and it fills up to it. */
export function tapGlass(water: number, index: number): number {
  return index < water ? index : index + 1;
}

interface ActivityState {
  water: number;
  /** "HH:MM" the suggested evening walk was started, or null. */
  walkStartedAt: string | null;
}

const store = createStore<ActivityState>({ water: 5, walkStartedAt: null });

export const activityRepo = {
  demo: !flag("mobileClinicalData"),
  tapGlass(index: number) {
    store.set((s) => ({ ...s, water: tapGlass(s.water, index) }));
  },
  startWalk(at: Date) {
    store.set((s) => ({ ...s, walkStartedAt: hhmm(at) }));
  },
};

export function useActivity(): ActivityState {
  return useStore(store);
}

export function useActivityToday(): {
  steps: number;
  stepsGoal: number;
  activeMin: number;
  activeGoal: number;
  kcal: number;
  kcalGoal: number;
} {
  return TODAY;
}
