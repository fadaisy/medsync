import { cascadeTone } from "@/components/tide/cascade";

describe("cascade tones", () => {
  it("goes navy, ocean, sea, then alternates so neighbours differ", () => {
    expect([0, 1, 2, 3, 4, 5].map(cascadeTone)).toEqual([0, 1, 2, 1, 2, 1]);
  });
});
