import type { History } from "@/lib/clerking/answers";
import { createElement as h } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { SocialBody } from "@/components/clerking/family-social";
import CAGE from "@/data/clerking/cage.v1.json";
import { cageScore, setAlcohol } from "@/lib/clerking/answers";
import { compose } from "@/lib/clerking/compose";
import { linkedAnswers } from "@/lib/clerking/linkage";
import { operationGroups, OPERATIONS } from "@/lib/clerking/operations";
import { HistorySchema } from "@/lib/clerking/payload";
import { allergies, cat, header, medicines, patient, patientThree3 } from "./fixtures";
import { text } from "./press";

/** Past operations pick list (MS-EMR-CLERK-OPS-001) and CAGE (MS-EMR-CLERK-CAGE-001). */

const block = (hx: History, key: string, audience: "clinical" | "patient" = "clinical") =>
  compose({
    cat,
    header,
    history: hx,
    linked: linkedAnswers(cat, hx.complaints),
    patient,
    medicines,
    allergies,
    sectionText: {},
    edited: {},
    audience,
  }).find((b) => b.key === key)!.text;

describe("past operations list", () => {
  const all = OPERATIONS.groups.flatMap((g) => g.items);

  it("ids and labels are unique", () => {
    expect(new Set(all.map((o) => o.id)).size).toBe(all.length);
    expect(new Set(all.map((o) => o.label.toLowerCase())).size).toBe(all.length);
  });

  it("items for the other sex drop out; unknown sex keeps only items for everyone", () => {
    const ids = (sex: "male" | "female" | null) =>
      new Set(operationGroups(sex).flatMap((g) => g.items.map((o) => o.id)));
    expect(ids("male").has("op.caesarean")).toBe(false);
    expect(ids("male").has("op.prostatectomy")).toBe(true);
    expect(ids("female").has("op.caesarean")).toBe(true);
    expect(ids("female").has("op.circumcision")).toBe(false);
    expect([...ids(null)].every((id) => !all.find((o) => o.id === id)!.applies_to_sex)).toBe(true);
    expect(ids(null).has("op.appendicectomy")).toBe(true);
  });

  it("a picked operation keeps its id through the payload; restricted ones stay out of patient text", () => {
    const hx = patientThree3();
    hx.past.operations = [
      { text: "Appendicectomy", code: "op.appendicectomy", year: 1990 },
      { text: "Vasectomy", code: "op.vasectomy" },
      { text: "Something they named" },
    ];
    expect(HistorySchema.parse(hx).past.operations).toEqual(hx.past.operations);
    expect(block(hx, "pmh")).toContain(
      "Operations: Appendicectomy (1990); Vasectomy; Something they named.",
    );
    expect(block(hx, "pmh", "patient")).toContain(
      "Operations: Appendicectomy (1990); Something they named.",
    );
  });
});

describe("CAGE", () => {
  it("scores one per yes, out of the questions asked", () => {
    expect(cageScore(undefined, CAGE.items)).toEqual({ yes: 0, asked: 0, of: 4 });
    expect(cageScore({ cut_down: "yes", guilty: "no" }, CAGE.items)).toEqual({
      yes: 1,
      asked: 2,
      of: 4,
    });
  });

  it("shows under Alcohol while they drink; two yeses read as clinically significant", () => {
    const hx = patientThree3();
    const shown = text(renderToStaticMarkup(h(SocialBody, props(hx))));
    for (const q of CAGE.items) expect(shown).toContain(q.question);
    hx.social.cage = { cut_down: "yes", eye_opener: "yes" };
    const m = text(renderToStaticMarkup(h(SocialBody, props(hx))));
    expect(m).toContain("2 of 4");
    expect(m).toContain("2 not asked");
    expect(m).toContain(CAGE.positive_text);
    expect(block(hx, "social")).toContain("CAGE 2/4 (2 not asked)");
    hx.social.cage = { cut_down: "yes", annoyed: "no", guilty: "no", eye_opener: "no" };
    expect(block(hx, "social")).toContain("CAGE 1/4");
    expect(block(hx, "social")).not.toContain("not asked");
    expect(text(renderToStaticMarkup(h(SocialBody, props(hx))))).not.toContain(CAGE.positive_text);
  });

  it("goes with the drinking: 'None' clears the answers; nothing asked writes nothing", () => {
    const hx = patientThree3();
    expect(block(hx, "social")).not.toContain("CAGE");
    hx.social.cage = { cut_down: "yes" };
    hx.social = setAlcohol(hx.social, "none");
    expect(hx.social.cage).toBeUndefined();
    expect(text(renderToStaticMarkup(h(SocialBody, props(hx))))).not.toContain("CAGE");
  });
});

function props(history: History) {
  return {
    cat,
    header,
    history,
    onHeader: () => {},
    onHistory: () => {},
    editable: true,
    cautionFrom: 7,
  };
}
