import { CATALOG } from "@shared/symptom-catalog/catalog.v0.1";
import { MAX_FREE_TEXT } from "@shared/symptom-catalog/types";

import { followUps, interruptOf, noteFor } from "@/features/symptoms/logic";

const sel = (items: string[], qualifiers: Record<string, Record<string, string>> = {}) => ({
  audience: "adult" as const,
  pregnant: false,
  items,
  qualifiers,
});
const item = (key: string) => CATALOG.items.find((i) => i.key === key)!;

describe("symptom steps", () => {
  it("opens Help for an emergency sign, and not once declined", () => {
    const s = sel(["SYM.CHEST.STRUGGLING_TO_BREATHE"]);
    expect(interruptOf(s, [], CATALOG)?.key).toBe("SYM.CHEST.STRUGGLING_TO_BREATHE");
    expect(interruptOf(s, ["SYM.CHEST.STRUGGLING_TO_BREATHE"], CATALOG)).toBeNull();
  });

  it("opens Help when a follow-up answer raises it, not before", () => {
    expect(interruptOf(sel(["SYM.CHEST.WHEEZE"]), [], CATALOG)).toBeNull();
    const raised = sel(["SYM.CHEST.WHEEZE"], { "SYM.CHEST.WHEEZE": { can_speak: "no" } });
    expect(interruptOf(raised, [], CATALOG)).not.toBeNull();
  });

  it("asks each chosen item's own questions", () => {
    const qs = followUps([item("SYM.CHEST.WHEEZE"), item("SYM.CHEST.COUGH_OVER_2_WEEKS")]);
    expect(qs.map((x) => x.q.key)).toEqual(["can_speak"]);
  });

  it("puts when it started before the patient's words, within the cap", () => {
    expect(noteFor("  keeps me up  ", "days")).toBe("Started: a few days. keeps me up");
    expect(noteFor("", "today")).toBe("Started today.");
    expect(noteFor("words", null)).toBe("words");
    expect(noteFor("x".repeat(600), "week").length).toBe(MAX_FREE_TEXT);
  });
});
