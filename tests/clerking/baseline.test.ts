import type { ReactElement } from "react";
import { createElement as h } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { vitalsView } from "@/components/clerking/model";
import { addComplaint, emptyHistory } from "@/lib/clerking/answers";
import { rosSystemsFor } from "@/lib/clerking/catalogue";
import { linkedAnswers, rosAnswer } from "@/lib/clerking/linkage";
import { systemStatuses } from "@/lib/clerking/status";
import { cat, THREE3_VITALS, v2Payload } from "./fixtures";

/**
 * Clerking v2, Phase 0 baseline defects (PROMPT-CLERKING-DESK-V2 §3), now held by the v2 engines
 * and views. They were `it.fails` against the v1 desk at STOP 0; the markers came off as each fix
 * landed (C2 and C3 in the Phase 2 engines, C6 with the v2 rail in Phase 3).
 */

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh() {}, push() {} }) }));
const { ClerkingRail } = await import("@/components/clerking/rail");
const { formatters } = await import("@/components/emr/format");
const text = (el: ReactElement) =>
  renderToStaticMarkup(el)
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ");

describe("clerking baseline defects, fixed in v2", () => {
  it("C2: the review of systems leaves out items that do not apply to the patient's sex", () => {
    const man = rosSystemsFor(cat, "male");
    const items = man.flatMap((s) => s.items);
    expect(man.some((s) => s.id === "gyn")).toBe(false);
    expect(items.some((s) => s.applies_to_sex === "female")).toBe(false);
    expect(items.some((s) => /menstrual|period/i.test(s.label))).toBe(false);
    expect(rosSystemsFor(cat, "female").some((s) => s.id === "gyn")).toBe(true);
  });

  it("C3: a complaint recorded in Complaint reads as a yes in the review of systems", () => {
    const hx = addComplaint(emptyHistory(), "sym.polyuria", "pp");
    const linked = linkedAnswers(cat, hx.complaints);
    expect(rosAnswer(hx, linked, "sym.polyuria")).toBe("yes");
    expect(systemStatuses(cat, hx, linked, "male").flatMap((s) => s.yes)).toContain("sym.polyuria");
  });

  it("C6: a vital sign scoring 3 in NEWS2 is marked where it is shown", () => {
    const p = v2Payload();
    const vitals = vitalsView({ ...THREE3_VITALS, temperature: 32.5 }, p.context.vitals);
    expect(text(h(ClerkingRail, { p, fmt: formatters(p.timeZone), vitals, alarm: true }))).toMatch(
      /scores 3/,
    );
  });
});
