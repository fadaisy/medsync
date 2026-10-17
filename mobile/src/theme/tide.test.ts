import { contrast, tideDark, tideLight } from "@/theme/tide";

/** Law L13 and the Tide README: text at 4.5:1 or more on its ground, in both themes. */
describe("Tide contrast", () => {
  for (const t of [tideLight, tideDark]) {
    describe(t.scheme, () => {
      it.each([
        ["ink on bg", t.ink, t.bg],
        ["ink on surface", t.ink, t.surface],
        ["ink-2 on bg", t.ink2, t.bg],
        ["ink-2 on surface", t.ink2, t.surface],
        ["ink-3 on bg", t.ink3, t.bg],
        ["ink-3 on surface", t.ink3, t.surface],
        ["primary label", t.onPrimary, t.primary],
        ["accent label", t.onAccent, t.accent],
        ["emergency label", t.onEmergency, t.emergency],
        ["on band", t.onBand, t.band],
        ["on cascade 1", t.onBand, t.cascade[0]],
        ["on cascade 2", t.onBand, t.cascade[1]],
        ["on cascade 3", t.onBand, t.cascade[2]],
        ["accent text on bg", t.accentText, t.bg],
      ])("%s is at least 4.5:1", (_name, fg, bg) => {
        expect(contrast(fg, bg)).toBeGreaterThanOrEqual(4.5);
      });
    });
  }
  it("light clinical words read on their tints", () => {
    expect(contrast(tideLight.stable.text, tideLight.stable.tint)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(tideLight.caution.text, tideLight.caution.tint)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(tideLight.critical.text, tideLight.critical.tint)).toBeGreaterThanOrEqual(4.5);
  });
});
