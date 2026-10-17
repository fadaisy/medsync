import { describe, expect, it } from "vitest";

import {
  CODE128_PATTERNS,
  code128Bars,
  code128Svg,
  code128Values,
  START_B,
  STOP,
} from "@/lib/lab/code128";

describe("Code 128 subset B (MF-2, A7)", () => {
  it("has 107 unique patterns: 3 bars and 3 spaces of 11 modules (the stop 13, with its last bar)", () => {
    expect(CODE128_PATTERNS).toHaveLength(107);
    expect(new Set(CODE128_PATTERNS).size).toBe(107);
    CODE128_PATTERNS.forEach((p, v) => {
      const sum = [...p].map(Number).reduce((a, b) => a + b, 0);
      expect(sum, `value ${v}`).toBe(v === STOP ? 13 : 11);
      expect(p.length, `value ${v}`).toBe(v === STOP ? 7 : 6);
    });
  });

  // Worked by hand: 104 + 48×1 + 42×2 + 42×3 + 17×4 + 18×5 + 19×6 + 35×7 = 879; 879 mod 103 = 55.
  it("'PJJ123C' in subset B carries check value 55", () => {
    const v = code128Values("PJJ123C");
    expect(v[0]).toBe(START_B);
    expect(v.at(-1)).toBe(STOP);
    expect(v.at(-2)).toBe(55);
  });

  it("the checksum is start + Σ value × position, mod 103, for a manifest number", () => {
    const text = "MF-2026-0141";
    const data = [...text].map((c) => c.charCodeAt(0) - 32);
    const want = data.reduce((s, d, i) => s + d * (i + 1), 104) % 103;
    expect(code128Values(text)).toEqual([104, ...data, want, 106]);
  });

  it("bars alternate starting with a bar and total 11 per symbol + 13 for the stop", () => {
    const bars = code128Bars("L00000622");
    const symbols = "L00000622".length + 2; // start + data + check
    expect(bars.reduce((a, b) => a + b, 0)).toBe(symbols * 11 + 13);
  });

  it("refuses characters outside subset B and empty text", () => {
    expect(() => code128Values("")).toThrow();
    expect(() => code128Values("é")).toThrow(/subset B/);
    expect(() => code128Values("A\nB")).toThrow(/subset B/);
  });

  it("draws black bars on white with a label for screen readers", () => {
    const svg = code128Svg("MF-2026-0141");
    expect(svg).toMatch(/role="img" aria-label="Barcode MF-2026-0141"/);
    expect(svg).toMatch(/fill="white"/);
    expect((svg.match(/<rect x=/g) ?? []).length).toBe(("MF-2026-0141".length + 3) * 3 + 1);
  });
});
