/** Pharmacy rework P2: the pure derives (test 8, the count sheet, Today's order). */
import { describe, expect, it } from "vitest";

import { rxChecksOpen, rxFlags } from "@/lib/pharmacy/derive/checks";
import { countBlockers, countDiffs } from "@/lib/pharmacy/derive/count";
import { todayItems } from "@/lib/pharmacy/derive/today";

const at = (m: number) => new Date(Date.UTC(2026, 9, 30, 9, m));

describe("rework test 8: the checks panel blocks hand-over", () => {
  const flags = rxFlags([
    { id: "amox", checkAnswers: [{ code: "allergy", answer: "benefit", outcome: "stop" }], confirmedFlags: [] },
    { id: "pcm", checkAnswers: [{ code: "child", outcome: "check" }], confirmedFlags: [] },
    { id: "ors", checkAnswers: [], confirmedFlags: [] },
  ]);

  it("lists each stored check as a flag with its level", () => {
    expect(flags.map((f) => [f.id, f.level])).toEqual([
      ["amox:allergy", "stop"],
      ["pcm:child", "check"],
    ]);
  });

  it("every flag on a line being given needs an answer; a line not given does not", () => {
    expect(rxChecksOpen(flags, [], ["pcm", "ors"]).map((f) => f.id)).toEqual(["pcm:child"]);
    expect(rxChecksOpen(flags, [], ["ors"])).toEqual([]);
    const checked = { lineId: "pcm", code: "child", answer: "checked" as const, at: at(1) };
    expect(rxChecksOpen(flags, [checked], ["pcm"])).toEqual([]);
  });

  it("a stop takes only the prescriber's confirmation; a query holds the line", () => {
    const base = { lineId: "amox", code: "allergy" };
    expect(rxChecksOpen(flags, [{ ...base, answer: "checked", at: at(1) }], ["amox"])).toHaveLength(1);
    expect(rxChecksOpen(flags, [{ ...base, answer: "query", at: at(1) }], ["amox"])).toHaveLength(1);
    expect(rxChecksOpen(flags, [{ ...base, answer: "prescriber_confirmed", at: at(1) }], ["amox"])).toEqual([]);
  });

  it("the latest answer stands", () => {
    const answers = [
      { lineId: "pcm", code: "child", answer: "checked" as const, at: at(1) },
      { lineId: "pcm", code: "child", answer: "query" as const, at: at(2) },
    ];
    expect(rxChecksOpen(flags, answers, ["pcm"])).toHaveLength(1);
  });
});

describe("the count sheet", () => {
  const recorded = new Map([
    ["a", 30],
    ["b", 10],
  ]);
  it("counts packs and loose units, and a difference needs a reason for its direction", () => {
    const lines = [
      { batchId: "a", packSize: 10, countedPacks: 2, countedUnits: 5, reason: null },
      { batchId: "b", packSize: 1, countedPacks: null, countedUnits: null, reason: null },
    ];
    expect(countDiffs(lines, recorded)).toEqual([{ batchId: "a", counted: 25, recorded: 30, diff: -5, reason: null }]);
    expect(countBlockers(lines, recorded)).toEqual({ uncounted: 1, unexplained: 1 });
    const explained = [{ ...lines[0]!, reason: "found_other_shelf" }, { ...lines[1]!, countedUnits: 10 }];
    expect(countBlockers(explained, recorded)).toEqual({ uncounted: 0, unexplained: 1 });
    expect(countBlockers([{ ...explained[0]!, reason: "damaged" }, explained[1]!], recorded)).toEqual({
      uncounted: 0,
      unexplained: 0,
    });
  });
});

describe("Today", () => {
  const item = (kind: Parameters<typeof todayItems>[1][number]["kind"]) => ({
    kind,
    key: kind,
    title: kind,
    meta: "",
    action: "Open",
    href: "/pharmacy/today",
  });
  it("ranks the role's items in its order and puts the rest under other roles", () => {
    const r = todayItems("storekeeper", [item("rx"), item("delivery"), item("emerg"), item("approve")]);
    expect(r.mine.map((i) => i.kind)).toEqual(["emerg", "delivery"]);
    expect(r.others.map((i) => i.kind)).toEqual(["rx", "approve"]);
    expect(todayItems("incharge", [item("rx"), item("approve")]).mine.map((i) => i.kind)).toEqual(["approve", "rx"]);
  });
});
