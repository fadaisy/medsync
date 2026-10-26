import type { El } from "./press";
import type { ReportedItem } from "@/lib/patient/reported-history";
import type { ReactNode } from "react";
import { createElement as h } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { emptyHistory } from "@/lib/clerking/answers";
import { HistorySchema } from "@/lib/clerking/payload";
import {
  openAllergies,
  openConditions,
  openFamily,
  reportsNoKnownAllergies,
  withReportedCondition,
  withReportedFamily,
} from "@/lib/clerking/reported";
import { cat, header } from "./fixtures";
import { walk, words } from "./press";

/**
 * ADR 0414: what the patient reported on their phone shows on the desk as patient-reported, not yet
 * confirmed. Confirm answers it in the note (never on its own); Dismiss hides it for this visit.
 */

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh() {}, push() {} }) }));
const { FamilyBody } = await import("@/components/clerking/family-social");

const now = new Date("2026-10-18T09:00:00Z");
let n = 0;
const item = (p: Partial<ReportedItem>): ReportedItem => ({
  id: `00000000-0000-4000-8000-00000000000${n++}`,
  kind: "condition",
  itemId: "hypertension",
  otherText: null,
  onsetYear: null,
  resolved: false,
  relation: null,
  reactions: [],
  severity: null,
  createdAt: "2026-10-18T08:00:00Z",
  ...p,
});

describe("patient-reported conditions", () => {
  it("stay open until answered or dismissed; confirm is a yes with 'known for' from the year", () => {
    const htn = item({ itemId: "hypertension", onsetYear: 2019 });
    const own = item({ itemId: "other", otherText: "Glaucoma" });
    let hist = emptyHistory();
    expect(openConditions([htn, own], hist)).toEqual([htn, own]);
    hist = withReportedCondition(hist, htn, now);
    expect(hist.past.conditions.hypertension).toEqual({ answer: "yes", since: "over_5_years" });
    expect(openConditions([htn, own], hist)).toEqual([own]);
    // The patient's own words have nothing to confirm into.
    expect(withReportedCondition(hist, own, now)).toBe(hist);
    hist = { ...hist, reportedDismissed: [own.id] };
    expect(openConditions([htn, own], hist)).toEqual([]);
    expect(HistorySchema.safeParse(hist).success).toBe(true);
  });

  it("an answer the clinician already gave wins over the patient's", () => {
    const hist = emptyHistory();
    hist.past.conditions.hypertension = { answer: "no" };
    expect(openConditions([item({})], hist)).toEqual([]);
  });
});

describe("patient-reported allergies", () => {
  it("drop off once the record holds the same name; no-known-allergies only with no status", () => {
    const pen = item({ kind: "allergy", itemId: "penicillins", resolved: null });
    const nka = item({ kind: "no_known_allergies", itemId: null, resolved: null });
    const hist = emptyHistory();
    expect(openAllergies([pen], hist, [])).toEqual([pen]);
    expect(openAllergies([pen], hist, ["penicillins"])).toEqual([]);
    expect(reportsNoKnownAllergies([nka], hist, "not_recorded")).toBe(true);
    expect(reportsNoKnownAllergies([nka], hist, "listed")).toBe(false);
  });
});

describe("patient-reported family history on the desk", () => {
  it("one row per condition naming every relative; confirm answers yes for them", () => {
    const mum = item({ kind: "family", itemId: "diabetes", relation: "mother", resolved: null });
    const dad = item({ kind: "family", itemId: "diabetes", relation: "father", resolved: null });
    const rows = openFamily([mum, dad], emptyHistory());
    expect(rows).toEqual([
      {
        itemId: "diabetes",
        label: "Diabetes",
        relations: ["mother", "father"],
        ids: [mum.id, dad.id],
      },
    ]);

    const s = { h: emptyHistory() };
    const onHistory = (fn: (x: typeof s.h) => typeof s.h) => {
      s.h = fn(s.h);
    };
    const props = () => ({
      cat,
      header,
      history: s.h,
      onHeader: () => {},
      onHistory,
      editable: true,
      cautionFrom: 7,
      reported: [mum, dad],
    });
    const m = renderToStaticMarkup(h(FamilyBody, props()));
    expect(m).toContain("Patient-reported, not yet confirmed");
    expect(m).toContain("In: mother, father");
    const confirm = walk(h(FamilyBody, props())).find(
      (e: El) => words(e as unknown as ReactNode) === "Confirm: yes",
    );
    (confirm!.props.onClick as () => void)();
    expect(s.h.family.diabetes).toEqual({ answer: "yes", relations: ["mother", "father"] });
    expect(renderToStaticMarkup(h(FamilyBody, props()))).not.toContain("Patient-reported");
    expect(withReportedFamily(emptyHistory(), "diabetes", []).family.diabetes).toEqual({
      answer: "yes",
    });
  });
});
