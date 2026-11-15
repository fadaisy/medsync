/**
 * D-CS-08: the curated clinic colours. Each passes `colourCheck` (never red, ≥ 3:1 on white); a test proves it.
 * Clinic colours mark a PLACE in this workspace, never a state. Raw hex lives here and in the picker only.
 */
export const CLINIC_PALETTE = [
  "#0369A1",
  "#7C3AED",
  "#0F766E",
  "#B45309",
  "#4338CA",
  "#BE185D",
  "#0E7490",
  "#1D4ED8",
  "#9333EA",
  "#86198F",
  "#475569",
  "#A16207",
] as const;
