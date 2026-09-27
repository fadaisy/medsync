import { createElement as h } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import examCatalogue from "@/data/clerking/clerking-exam-catalogue.v1.json";
import { cat, v2Payload } from "./fixtures";

/**
 * PROMPT-CLERKING-EXAM-V2 §3, Phase 0: failing tests for E-2, E-3 and E-8 against today's
 * Examination step (v1's s11 inside the v2 shell). Each is `it.fails`, so the suite stays green;
 * each flips to `it` when the phase that fixes it lands.
 */

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh() {}, push() {} }) }));
const { ClerkingDesk } = await import("@/components/clerking/clerking-desk");

function examStep(): string {
  const p = v2Payload();
  return renderToStaticMarkup(
    h(ClerkingDesk, {
      p,
      cat,
      content: p.draft!.content,
      current: "exam",
      save: { tone: "neutral", text: "Saved 08:19" },
      on: { onContent() {}, onVitals() {} },
      loaders: { findings: async () => [], terms: async () => [] },
    }),
  );
}

const glucose = examCatalogue.vital_signs.fields.find((f) => f.id === "vs.glucose")!;

describe("today's Examination step (baseline)", () => {
  it.fails("E-2: glucose is one field with a required random, fasting or 2-hour context", () => {
    const html = examStep();
    expect(html.match(/glucose/gi)?.length).toBeGreaterThan(0);
    // The catalogue's three contexts, in words. Today's chip offers fasting / not fasting / not sure.
    expect(glucose.qualifiers!.context).toEqual(["random", "fasting", "two_hours_after_food"]);
    for (const word of ["Random", "Fasting", "2 hours after food"]) expect(html).toContain(word);
    expect(html).not.toContain("Not sure");
  });

  it.fails("E-3: the step records air or oxygen and consciousness, so NEWS2 can complete", () => {
    const html = examStep();
    expect(html).toMatch(/Room air/);
    expect(html).toMatch(/Supplemental oxygen/);
    expect(html).toMatch(/GCS|ACVPU/);
  });

  it.fails("E-8: pallor and lymph nodes each have exactly one editable place", () => {
    const html = examStep();
    const freeText = html.match(/<textarea/g)?.length ?? 0; // any finding can be typed again here
    for (const finding of ["Pallor", "Lymph"]) {
      const controls = html.match(new RegExp(`aria-label="${finding}[^"]*"`, "g"))?.length ?? 0;
      expect(controls + freeText, finding).toBe(1);
    }
  });
});
