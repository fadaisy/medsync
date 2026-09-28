import { createElement as h } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { complaintGroups } from "@/components/clerking/model";
import { emptyHistory } from "@/lib/clerking/answers";
import { cat, header } from "./fixtures";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh() {}, push() {} }) }));
const { ComplaintBody } = await import("@/components/clerking/history-sections");

/** Complaint "Show all": the whole catalogue of complaints, by body system. */
describe("show all complaints", () => {
  const offered = (sex: "male" | "female") =>
    cat.symptoms.filter(
      (s) => s.offer_as_complaint && (!s.applies_to_sex || s.applies_to_sex === sex),
    );

  it("lists every complaint offered to this patient exactly once", () => {
    for (const sex of ["male", "female"] as const) {
      const ids = complaintGroups(cat, sex).flatMap((g) => g.symptoms.map((s) => s.id));
      expect(new Set(ids).size).toBe(ids.length);
      expect([...ids].sort()).toEqual(
        offered(sex)
          .map((s) => s.id)
          .sort(),
      );
    }
  });

  it("groups by body system in the catalogue's order, sex-appropriate", () => {
    const male = complaintGroups(cat, "male");
    expect(male.map((g) => g.id)).not.toContain("gyn");
    expect(male.find((g) => g.id === "skin")!.symptoms.map((s) => s.id)).toContain(
      "sym.breast_lump",
    );
    expect(male.flatMap((g) => g.symptoms.map((s) => s.id))).toContain("sym.scrotal");
    const female = complaintGroups(cat, "female");
    expect(female.find((g) => g.id === "gyn")!.symptoms.map((s) => s.id)).toContain(
      "sym.vaginal_bleeding",
    );
    expect(female.flatMap((g) => g.symptoms.map((s) => s.id))).not.toContain("sym.scrotal");
    expect(male[0]!.label).toBe("General");
    // Complaint-only symptoms with no review-of-systems place still land under their system.
    expect(male.find((g) => g.id === "rs")!.symptoms.map((s) => s.id)).toContain(
      "sym.breathlessness",
    );
  });

  it("the Complaint step offers the Show all button beside the search", () => {
    const markup = renderToStaticMarkup(
      h(ComplaintBody, {
        cat,
        header,
        history: emptyHistory(),
        onHeader: () => {},
        onHistory: () => {},
        editable: true,
        cautionFrom: null,
        sex: "male",
      }),
    );
    expect(markup).toContain("Show all");
  });
});
