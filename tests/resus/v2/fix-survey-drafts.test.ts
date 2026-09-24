import { describe, expect, it } from "vitest";

import {
  baseKeyOf,
  diffCount,
  seedFor,
  stepDrafts,
  unsavedSteps,
} from "@/app/nurse/resus/[episodeId]/_components/v2/step-panel-draft";
import { assess, EP } from "./survey-fixtures";

/**
 * The step panel's drafts (Record button + R3): a recorded set is never
 * "unsaved", drafts outlive the panel, and a pending → confirmed record keeps
 * the same base so edits made meanwhile survive.
 */

describe("step drafts", () => {
  const b = assess("B", 5, { state: "respiratory_distress", present: ["wheeze", "accessory"] });

  it("a step loaded with recorded findings has 0 changes (Record stays disabled — no duplicate)", () => {
    const seed = seedFor("B", [b]);
    expect(seed.draft.present).toHaveLength(2);
    expect(diffCount(seed.draft, seedFor("B", [b]).draft)).toBe(0);
  });

  it("the count is the number of changes, not the number of selected findings", () => {
    const seed = seedFor("B", [b]).draft;
    expect(diffCount({ ...seed, present: ["wheeze"] }, seed)).toBe(1);
  });

  it("a held draft outlives the panel and is listed for the leave guards until cleared", () => {
    const seed = seedFor("B", [b]).draft;
    stepDrafts.set(EP, "B", { base: baseKeyOf(b), draft: { ...seed, present: ["wheeze"] } });
    expect(unsavedSteps(EP, [b])).toEqual(["B"]);
    stepDrafts.set(EP, "B", null);
    expect(unsavedSteps(EP, [b])).toEqual([]);
  });

  it("a held draft equal to the record is not unsaved", () => {
    stepDrafts.set(EP, "B", { base: baseKeyOf(b), draft: seedFor("B", [b]).draft });
    expect(unsavedSteps(EP, [b])).toEqual([]);
    stepDrafts.set(EP, "B", null);
  });

  it("the base key survives pending → confirmed (same clientEventId, new id)", () => {
    const pending = { ...b, id: "pending:abc:0", clientEventId: "abc" };
    const confirmed = { ...b, id: "0f0e0d0c-0000-4000-8000-000000000099", clientEventId: "abc" };
    expect(baseKeyOf(pending)).toBe(baseKeyOf(confirmed));
    expect(baseKeyOf({ ...b, clientEventId: null })).toBe(b.id);
    expect(baseKeyOf(null)).toBeNull();
  });

  it("subscribers hear every change", () => {
    let calls = 0;
    const off = stepDrafts.subscribe(() => (calls += 1));
    const v = stepDrafts.version();
    stepDrafts.set(EP, "C", null);
    off();
    stepDrafts.set(EP, "C", null);
    expect(calls).toBe(1);
    expect(stepDrafts.version()).toBe(v + 2);
  });
});
