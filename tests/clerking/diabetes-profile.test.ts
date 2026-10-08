import { describe, expect, it } from "vitest";

import { shortTitle } from "@/components/clerking/diabetes-profile";

describe("the Due list's short titles", () => {
  it("cuts at the first colon or opening bracket and keeps the rest for 'more'", () => {
    expect(shortTitle("Counsel at this visit: diet, physical activity")).toEqual({
      title: "Counsel at this visit",
      rest: "diet, physical activity",
    });
    expect(shortTitle("HbA1c is due (never done, or 6 months since the last)")).toEqual({
      title: "HbA1c is due",
      rest: "(never done, or 6 months since the last)",
    });
    expect(shortTitle("Teach foot care")).toEqual({ title: "Teach foot care", rest: null });
  });
});
