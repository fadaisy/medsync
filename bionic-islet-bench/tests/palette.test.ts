import { describe, expect, it } from "vitest";

import { INSULIN_COLOUR, SERIES, STATE_COLOUR } from "../src/components/tracePalette.ts";

/** True for the red family: red clearly dominant and the colour saturated. */
function isRed(hex: string): boolean {
  const m = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex);
  if (!m) return false;
  const [r, g, b] = [parseInt(m[1]!, 16), parseInt(m[2]!, 16), parseInt(m[3]!, 16)];
  return r > 110 && r > g * 1.7 && r > b * 1.7;
}

/**
 * The traces are drawn on a canvas, so the browser colour audit cannot see
 * them. This is the canvas half of the same rule: red is reserved for the
 * insulin path and the invalid state.
 */
describe("the trace palette keeps red for the insulin path and the invalid state", () => {
  it("no glucose series is drawn in red", () => {
    for (const series of SERIES) {
      expect(isRed(series.colour), `${series.id} is drawn in ${series.colour}`).toBe(false);
    }
  });

  it("insulin is the one red line", () => {
    expect(isRed(INSULIN_COLOUR)).toBe(true);
    expect(INSULIN_COLOUR).toBe("#dc2626");
  });

  it("the state ribbon is red only for invalid", () => {
    for (const [state, colour] of Object.entries(STATE_COLOUR)) {
      expect(isRed(colour), `${state} is drawn in ${colour}`).toBe(state === "invalid");
    }
  });

  it("every series is distinguishable by more than colour", () => {
    // Colour alone is never allowed to carry meaning on a clinical surface,
    // so each series also has a distinct stroke pattern or weight, and a
    // label in the legend.
    const signatures = new Set(
      SERIES.map((s) => `${s.dash.join(",")}|${s.width}|${s.ghost ? "ghost" : "solid"}`),
    );
    expect(signatures.size).toBe(SERIES.length);
    for (const series of SERIES) {
      expect(series.label.length).toBeGreaterThan(3);
      expect(series.shortLabel.length).toBeGreaterThan(3);
    }
  });
});
