import { hashId, setAnalyticsSink, track } from "@/lib/analytics";

describe("analytics", () => {
  it("hashes ids stably and does not echo them", () => {
    expect(hashId("patient-123")).toBe(hashId("patient-123"));
    expect(hashId("patient-123")).not.toContain("patient");
    expect(hashId("a")).toHaveLength(8);
  });

  it("never throws into a screen", () => {
    setAnalyticsSink(() => {
      throw new Error("vendor down");
    });
    expect(() => track("app_open")).not.toThrow();
  });
});
