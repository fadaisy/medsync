import { describe, expect, it } from "vitest";

import { bundleState, obeysCommands, postRoscPins } from "@/lib/resus/closeout/post-rosc";
import { POST_ROSC_BUNDLE, POST_ROSC_REF } from "@/lib/resus/reference/post-rosc-catalog";
import { arrest, decision, ev, rosc } from "./fixtures";

const item = (minsAgo: number, itemId: string, state: string) =>
  decision(minsAgo, { decision: "post_rosc_item", itemId, state });

describe("PR — bundle item states", () => {
  it("PR-A-01: every checklist item starts open", () => {
    const s = bundleState([]);
    expect(Object.values(s).every((v) => v === "open")).toBe(true);
    expect(Object.keys(s)).toHaveLength(POST_ROSC_BUNDLE.filter((i) => i.checklist).length);
  });

  it("PR-NEVER-01: neuroprognostication is a standing rule, not a checklist item", () => {
    expect(bundleState([])).not.toHaveProperty("PR-NEVER-01");
    expect(POST_ROSC_BUNDLE.find((i) => i.id === "PR-NEVER-01")?.checklist).toBe(false);
  });

  it("PR-C-01: a recorded done state is reflected", () => {
    expect(bundleState([item(5, "PR-C-01", "done")])["PR-C-01"]).toBe("done");
  });

  it("PR-C-03: not available here is its own state", () => {
    expect(bundleState([item(5, "PR-C-03", "not_available")])["PR-C-03"]).toBe("not_available");
  });

  it("PR-A-03: not indicated is recorded", () => {
    expect(bundleState([item(5, "PR-A-03", "not_indicated")])["PR-A-03"]).toBe("not_indicated");
  });

  it("PR-B-02: the latest state wins (chronological, not input order)", () => {
    const tl = [item(1, "PR-B-02", "done"), item(10, "PR-B-02", "not_available")];
    expect(bundleState(tl)["PR-B-02"]).toBe("done");
  });

  it("PR-B-05: an unknown state or item ID is ignored", () => {
    const s = bundleState([item(5, "PR-B-05", "maybe"), item(4, "PR-ZZ-99", "done")]);
    expect(s["PR-B-05"]).toBe("open");
    expect(s).not.toHaveProperty("PR-ZZ-99");
  });

  it("PR-E-01: a superseded item decision no longer counts", () => {
    const d = item(5, "PR-E-01", "done");
    const fix = ev("note", null, 4, { label: "error" }, { supersedesEventId: d.id });
    expect(bundleState([d, fix])["PR-E-01"]).toBe("open");
  });

  it("PR-B-02: only 'Target / number' rows show a number", () => {
    const shows = (id: string) => POST_ROSC_BUNDLE.find((i) => i.id === id)?.showsNumber;
    expect(shows("PR-B-02")).toBe(true);
    expect(shows("PR-C-06")).toBe(true);
    expect(shows("PR-C-01")).toBe(false);
    expect(shows("PR-D-02")).toBe(false);
  });

  it("PR-D-02: no post-ROSC glucose number is encoded", () => {
    expect(POST_ROSC_REF["PR-D-02"]!.value).toBeUndefined();
  });
});

describe("PR-PIN — post-ROSC survey pins", () => {
  it("PR-PIN-B: B pins SpO₂ 94–98 % and PaCO₂ 4.7–6.0 kPa", () => {
    const pins = postRoscPins("B");
    expect(pins.map((p) => p.id)).toEqual(["PR-PIN-B"]);
    expect(pins[0]!.text).toContain("94–98 %");
    expect(pins[0]!.text).toContain("4.7–6.0 kPa");
  });

  it("PR-PIN-C: C pins MAP ≥ 65 and SBP > 100", () => {
    expect(postRoscPins("C")[0]!.text).toContain("MAP ≥ 65 and SBP > 100");
  });

  it("PR-PIN-D: D pins obeys commands", () => {
    expect(postRoscPins("D")[0]!.id).toBe("PR-PIN-D");
  });

  it("PR-PIN-E: E pins fever prevention ≤ 37.5 °C", () => {
    expect(postRoscPins("E")[0]!.text).toContain("≤ 37.5 °C");
  });

  it("PR-PIN-B: A has no pin", () => {
    expect(postRoscPins("A")).toEqual([]);
  });
});

describe("PR-D-01 — obeys commands", () => {
  it("PR-D-01: never recorded → null (not guessed)", () => {
    expect(obeysCommands([])).toBeNull();
  });

  it("PR-D-01: the latest answer wins", () => {
    const tl = [
      decision(10, { decision: "obeys_commands", value: false }),
      decision(2, { decision: "obeys_commands", value: true }),
    ];
    expect(obeysCommands(tl)).toBe(true);
  });

  it("PR-D-01: a non-boolean value is ignored", () => {
    expect(obeysCommands([decision(2, { decision: "obeys_commands", value: "yes" })])).toBeNull();
  });

  it("PR-D-01: an answer before a re-arrest does not count after the next ROSC", () => {
    const before = [
      arrest(120),
      rosc(100),
      decision(90, { decision: "obeys_commands", value: true }),
    ];
    expect(obeysCommands(before)).toBe(true);
    expect(obeysCommands([...before, arrest(40, 2), rosc(20, 2)])).toBeNull();
  });

  it("PR-C-05: bundle states reset at a re-arrest", () => {
    const tl = [arrest(120), rosc(100), item(90, "PR-C-05", "done"), arrest(40, 2), rosc(20, 2)];
    expect(bundleState(tl)["PR-C-05"]).toBe("open");
    expect(bundleState([...tl, item(10, "PR-C-05", "done")])["PR-C-05"]).toBe("done");
  });
});
