import { describe, expect, it } from "vitest";

import { shelfStrip, shelfView } from "@/app/pharmacy/shelf/_lib/strip";

const all = () => true;

describe("shelfView", () => {
  it("takes a valid view the viewer has", () => {
    expect(shelfView({ view: "emergency" }, all)).toBe("emergency");
  });
  it("reads the Controlled drugs form's keys without a view as Controlled drugs", () => {
    expect(shelfView({ view: "controlled", medicine: "morphine" }, all)).toBe("controlled");
  });
  it("falls back to the viewer's first Shelf tab", () => {
    expect(shelfView({ view: "controlled" }, (k) => k === "emergency")).toBe("emergency");
    expect(shelfView({ view: "counts" }, all)).toBe("stock");
    expect(shelfView({}, () => false)).toBeNull();
  });
});

describe("shelfStrip", () => {
  const a = new Date("2026-10-27T08:10:00Z");
  const b = new Date("2026-10-26T08:10:00Z");
  it("counts low rows and takes the newest count; keeps a null vital figure", () => {
    const s = shelfStrip(
      [
        { low: true, lastCounted: b },
        { low: false, lastCounted: a },
        { low: true, lastCounted: null },
      ],
      { out: 2, outVital: null, medicines: 3 },
    );
    expect(s).toEqual({ medicines: 3, out: 2, outVital: null, low: 2, lastCount: a });
  });
  it("no counts at all is null, a real zero stays 0", () => {
    expect(shelfStrip([], { out: 0, outVital: 0, medicines: 0 })).toEqual({
      medicines: 0,
      out: 0,
      outVital: 0,
      low: 0,
      lastCount: null,
    });
  });
});
