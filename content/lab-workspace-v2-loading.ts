/**
 * Lab Workspace v2, loading states: what a screen reader hears while a place loads or an action is in flight.
 * draft; covered by LABWS2_COPY_STATUS in content/lab-workspace-v2.ts
 */
export const LABWS2_LOADING = {
  /** Read once, politely, while a place or a view inside it loads. */
  place: "Loading {place}…",
  /** The fallback place name, for lab routes without their own skeleton. */
  laboratory: "the laboratory",
  /** Read while a button's action is in flight. */
  working: "Working…",
} as const;
