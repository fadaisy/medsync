import type { History } from "@/lib/clerking/answers";
import { describe, expect, it } from "vitest";

import { compose, SECTION_BLOCK } from "@/lib/clerking/compose";
import { linkedAnswers } from "@/lib/clerking/linkage";
import { sectionStatuses } from "@/lib/clerking/status";
import { allergies, cat, header, medicines, patient, patientThree3 } from "./fixtures";

/**
 * PROMPT-CLERKING-SUMMARY-IMPRESSION §3, the defects found in production (28 Sep 2026), as tests
 * that fail today (`it.fails`). Each flips to `it` in the phase that fixes it.
 */

const blocks = (h: History) =>
  compose({
    cat,
    header,
    history: h,
    linked: linkedAnswers(cat, h.complaints),
    patient,
    medicines,
    allergies,
    sectionText: { exam: "Temperature 32.5 °C." },
    edited: {},
    audience: "clinical",
  });

describe("S-1: the Summary step composes nothing", () => {
  it.fails("the note has a Summary block between Examination and Impression", () => {
    const keys: string[] = blocks(patientThree3()).map((b) => b.key);
    expect(keys).toContain("summary");
    expect(keys.indexOf("summary")).toBe(keys.indexOf("exam") + 1);
  });

  it.fails("Summary highlights its own block, not the examination's", () => {
    expect(SECTION_BLOCK.summary as string).toBe("summary");
  });

  it.fails("the section bar does not claim 'Auto' when nothing is composed", () => {
    const h = patientThree3();
    const s = sectionStatuses({
      cat,
      history: h,
      linked: linkedAnswers(cat, h.complaints),
      sex: "male",
      allergyConfirmedThisVisit: true,
      exam: "open",
      missing: [],
    });
    expect(s.summary.text).not.toBe("Auto");
  });
});
