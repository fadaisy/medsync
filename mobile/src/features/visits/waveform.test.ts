import { bars, levelOf } from "@/features/visits/waveform";

describe("voice note waveform", () => {
  it("maps loudness to 0–1 with a visible floor", () => {
    expect(levelOf(0)).toBe(1);
    expect(levelOf(-25)).toBe(0.5);
    expect(levelOf(-160)).toBe(0.08);
  });

  it("always draws n bars, averaging or stretching the readings", () => {
    expect(bars([0.2, 0.4, 0.6, 0.8], 2)).toEqual([0.30000000000000004, 0.7]);
    expect(bars([0.5], 3)).toEqual([0.5, 0.5, 0.5]);
    expect(bars([], 4)).toEqual([0.08, 0.08, 0.08, 0.08]);
  });
});
