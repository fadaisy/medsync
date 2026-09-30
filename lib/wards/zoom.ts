/**
 * Zoom on the floor plan: 100 % shows the whole floor in the space there is; zooming in makes the
 * plan larger than its frame, which then scrolls. Steps for the buttons and keys; a continuous factor
 * for a pinch or Ctrl/Cmd + wheel. Pure, so the arithmetic is tested without a browser.
 */

export const ZOOM_MIN = 1;
export const ZOOM_MAX = 4;
export const ZOOM_STEPS = [1, 1.25, 1.5, 2, 2.5, 3, 4] as const;

export const clampZoom = (z: number) => Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, z));

/** The next step up (1) or down (-1) from any zoom, even one a pinch left between steps. */
export function zoomStep(z: number, dir: 1 | -1): number {
  const eps = 1e-6;
  if (dir > 0) return ZOOM_STEPS.find((s) => s > z + eps) ?? ZOOM_MAX;
  return [...ZOOM_STEPS].reverse().find((s) => s < z - eps) ?? ZOOM_MIN;
}

/**
 * A wheel or pinch event's zoom. A mouse notch (about 100) is roughly one step; a trackpad pinch sends
 * many small deltas, so it glides. Each event is capped so a fast flick can't jump the whole range.
 */
export function wheelZoom(z: number, deltaY: number): number {
  const d = Math.max(-50, Math.min(50, deltaY));
  return clampZoom(z * Math.exp(-d * 0.005));
}

/** The plan's size at 100 %: as large as fits the frame, keeping the floor's proportions. */
export function fitSize(frame: { w: number; h: number }, aspect: number): { w: number; h: number } {
  if (frame.w <= 0 || frame.h <= 0 || !(aspect > 0)) return { w: 0, h: 0 };
  const w = Math.min(frame.w, frame.h * aspect);
  return { w, h: w / aspect };
}

export const zoomWord = (z: number) => `${Math.round(z * 100)}%`;
