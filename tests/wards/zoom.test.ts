import { describe, expect, it } from "vitest";

import {
  clampZoom,
  fitSize,
  wheelZoom,
  ZOOM_MAX,
  ZOOM_MIN,
  ZOOM_STEPS,
  zoomStep,
  zoomWord,
} from "@/lib/wards/zoom";

/* Zoom on the floor plan: 100 % is the whole floor; in to 400 %, never out past the whole floor. */

describe("plan zoom", () => {
  it("stays between the whole floor and 400 %", () => {
    expect([clampZoom(0.2), clampZoom(2), clampZoom(9)]).toEqual([ZOOM_MIN, 2, ZOOM_MAX]);
    expect(ZOOM_STEPS[0]).toBe(ZOOM_MIN);
    expect(ZOOM_STEPS[ZOOM_STEPS.length - 1]).toBe(ZOOM_MAX);
  });

  it("the buttons and keys go step by step, from any zoom a pinch left", () => {
    expect(zoomStep(1, 1)).toBe(1.25);
    expect(zoomStep(1.25, 1)).toBe(1.5);
    expect(zoomStep(1.25, -1)).toBe(1);
    expect(zoomStep(1.4, 1)).toBe(1.5);
    expect(zoomStep(1.4, -1)).toBe(1.25);
    expect(zoomStep(ZOOM_MAX, 1)).toBe(ZOOM_MAX);
    expect(zoomStep(ZOOM_MIN, -1)).toBe(ZOOM_MIN);
    let z = 1;
    for (let i = 0; i < 20; i++) z = zoomStep(z, 1);
    expect(z).toBe(ZOOM_MAX);
  });

  it("a wheel notch is about one step, a pinch glides, a flick is capped", () => {
    const notchIn = wheelZoom(1.5, -100);
    expect(notchIn).toBeGreaterThan(1.5);
    expect(notchIn).toBeLessThan(2.1);
    expect(wheelZoom(2, 100)).toBeLessThan(2);
    const pinch = wheelZoom(2, -4);
    expect(pinch).toBeGreaterThan(2);
    expect(pinch).toBeLessThan(2.1);
    expect(wheelZoom(1.5, -10_000)).toBe(wheelZoom(1.5, -50));
    expect(wheelZoom(1, 500)).toBe(ZOOM_MIN);
    expect(wheelZoom(4, -500)).toBe(ZOOM_MAX);
  });

  it("at 100 % the plan is as large as fits, keeping the floor's proportions", () => {
    // A wide floor in a squarer frame: limited by the width.
    expect(fitSize({ w: 600, h: 500 }, 1.5)).toEqual({ w: 600, h: 400 });
    // A wide frame: limited by the height.
    expect(fitSize({ w: 1000, h: 400 }, 1.5)).toEqual({ w: 600, h: 400 });
    // Before the frame is measured, nothing.
    expect(fitSize({ w: 0, h: 0 }, 1.5)).toEqual({ w: 0, h: 0 });
  });

  it("names the zoom as a percentage", () => {
    expect([zoomWord(1), zoomWord(1.25), zoomWord(2.345)]).toEqual(["100%", "125%", "235%"]);
  });
});
