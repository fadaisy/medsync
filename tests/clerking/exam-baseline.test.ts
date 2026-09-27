import { describe, expect, it, vi } from "vitest";

import examCatalogue from "@/data/clerking/clerking-exam-catalogue.v1.json";
import { emptyExam } from "@/lib/clerking/exam/payload";
import { ecat } from "./exam-fixtures";

/**
 * PROMPT-CLERKING-EXAM-V2 §3: E-2, E-3 and E-8. Written at Phase 0 as `it.fails` against v1's s11
 * (they failed for the stated reasons: no random or two-hour glucose context, no air-or-oxygen or
 * consciousness control, pallor answerable twice). Flipped to `it` at Phase 3 against the new step.
 */

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh() {}, push() {} }) }));
const { examMarkup } = await import("./exam-render");

const glucose = examCatalogue.vital_signs.fields.find((f) => f.id === "vs.glucose")!;
const empty = () => emptyExam(ecat.version);

describe("E-2, E-3, E-8 resolved", () => {
  it("E-2: glucose is one field with a required random, fasting or 2-hour context", () => {
    const html = examMarkup(empty(), { system: "vitals" });
    expect(glucose.qualifiers!.context).toEqual(["random", "fasting", "two_hours_after_food"]);
    for (const word of ["Random", "Fasting", "2 hours after food"]) expect(html).toContain(word);
    expect(html).not.toContain("Not sure");
    expect(
      html.match(/<input[^>]*aria-label="Glucose[^"]*"/gi) ??
        html.match(/id="[^"]*glucose[^"]*"/gi),
    ).toHaveLength(1);
  });

  it("E-3: the step records air or oxygen and consciousness, so NEWS2 can complete", () => {
    const attachments = examMarkup(empty(), { system: "general", part: "attachments" });
    expect(attachments).toMatch(/Room air/);
    expect(attachments).toMatch(/Supplemental oxygen/);
    const consciousness = examMarkup(empty(), { system: "general", part: "consciousness" });
    expect(consciousness).toMatch(/GCS/);
    expect(consciousness).toMatch(/ACVPU/);
  });

  it("E-8: pallor and lymph nodes each have exactly one editable place", () => {
    const signs = examMarkup(empty(), { system: "general", part: "signs" });
    expect(signs).not.toContain("<textarea");
    for (const finding of ["Pallor", "Lymphadenopathy"])
      expect(
        signs.match(new RegExp(`role="group" aria-label="${finding}"`, "g")),
        finding,
      ).toHaveLength(1);
    // Elsewhere they are read-only links to General.
    const eyes = examMarkup(empty(), { system: "eyes_ent_neck", part: "eyes" });
    expect(eyes).not.toContain('aria-label="Pallor"');
    expect(eyes).toContain("Open in General");
  });
});
