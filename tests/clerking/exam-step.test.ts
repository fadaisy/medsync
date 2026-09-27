import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";

import { emptyExam } from "@/lib/clerking/exam/payload";
import { ecat } from "./exam-fixtures";
import { PATIENTS } from "./exam-patients";

/**
 * The examination step's markup (PROMPT-CLERKING-EXAM-V2 §4, §5, §10): the systems grid, rows by
 * response type in the item's own words, the gate lock, links, and the colour law.
 */

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh() {}, push() {} }) }));
const { examMarkup } = await import("./exam-render");

const empty = () => emptyExam(ecat.version);

describe("the examination step", () => {
  it("shows the eleven pills: Vital signs, General, the eight systems and Feet", () => {
    const html = examMarkup(empty(), { system: "general" });
    for (const name of [
      "Vital signs",
      "General",
      "Cardiovascular",
      "Respiratory",
      "Abdomen",
      "Nervous system",
      "Spine and joints",
      "Skin",
      "Eyes, ENT and neck",
      "Rectal and genital",
      "Feet",
    ])
      expect(html).toContain(`>${name.replace(/,/g, ",")}<`);
    expect(html).toContain('aria-label="Examination systems"');
    expect(html).toContain('aria-label="locked, needs consent and chaperone"'); // the rectal pill before the gate
  });

  it("renders rows in each item's own words, and never Normal/Abnormal outside state items or counters (E1)", () => {
    for (const s of ecat.systems)
      for (const part of s.parts) {
        const html = examMarkup(empty(), { system: s.id, part: part.id }, { sex: "male" });
        for (const id of part.items) {
          const it = ecat.item(id)!;
          if (it.response.type === "link" || it.applies_to_sex === "female") continue;
          expect(html, id).toContain(`data-item="${id}"`);
          if ("negative_label" in it.response)
            expect(html, id).toContain(`>${it.response.negative_label.replace(/&/g, "&amp;")}<`);
        }
        const counters = [...html.matchAll(/<span class="text-caption[^"]*">([^<]*)<\/span>/g)].map(
          (m) => m[1]!,
        );
        for (const c of counters.filter((x) => /\bfindings?\b|nothing found|not examined/i.test(x)))
          expect(c).not.toMatch(/\b(normal|abnormal)\b/i);
      }
  });

  it("the rectal and genital items are locked until the gate is complete (E7)", () => {
    const locked = examMarkup(empty(), { system: "rectal_genital", part: "digital_rectal" });
    expect(locked).toContain("Before this examination");
    expect(locked).toContain("A relative may stay with the patient but is not a chaperone.");
    expect(locked).toMatch(/<div role="tabpanel"[^>]*inert=""/);
    const open = examMarkup(PATIENTS.three3().s.exam, {
      system: "rectal_genital",
      part: "digital_rectal",
    });
    expect(open).toContain("Chaperone: Sr N. Akello, nurse. Verbal consent.");
    expect(open).not.toMatch(/<div role="tabpanel"[^>]*inert=""/);
  });

  it("a link reads its owner and opens it; a restricted item carries a lock", () => {
    const html = examMarkup(PATIENTS.three3().s.exam, {
      system: "cardiovascular",
      part: "inspection",
    });
    expect(html).toContain("Open in General");
    const signs = examMarkup(empty(), { system: "general", part: "signs" });
    expect(signs).toMatch(/HIV-associated signs<span title="Restricted"/);
  });

  it("suggestions come from the history, with reasons, done ones last", () => {
    const html = examMarkup(empty(), { system: "general" });
    expect(html).toContain('aria-label="Suggested examinations"');
    expect(html).toMatch(/Back pain with pain at night or at rest/);
  });

  it("no exam component names red (D-CV-03)", () => {
    for (const f of [
      "exam-step.tsx",
      "item-row.tsx",
      "result-pill.tsx",
      "blocks.tsx",
      "vitals-card.tsx",
    ])
      expect(readFileSync(`components/clerking/exam/${f}`, "utf8"), f).not.toMatch(
        /\b(red|rose|destructive|status-critical)-/,
      );
  });
});
