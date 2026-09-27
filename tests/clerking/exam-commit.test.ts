import { describe, expect, it } from "vitest";

import tokenMap from "@/data/clerking/exam-token-map.v1.json";
import * as A from "@/lib/clerking/exam/answers";
import { examCommitLines } from "@/lib/clerking/exam/commit";
import { conceptDef } from "@/lib/facts/project/shared";
import { ecat, gcs, scenario, toCtx } from "./exam-fixtures";
import { PATIENTS } from "./exam-patients";

/** What signing charts from the examination (CFC v1.3, table-driven from the token map). */

const valid = (l: ReturnType<typeof examCommitLines>["lines"][number]) => {
  const def = conceptDef(l.conceptId)!;
  if (l.value.type === "presence") return def.valueType === "presence";
  if (l.value.type === "coded") return !!def.answers?.includes(l.value.code);
  return def.valueType === "quantity";
};

describe("examination commit", () => {
  it("every concept the token map names exists in the registry", () => {
    const ids = [...Object.values(tokenMap.items), ...tokenMap.options.map((o) => o.concept)];
    for (const id of ids) expect(conceptDef(id), id).toBeDefined();
  });

  it.each(Object.entries(PATIENTS))(
    "%s: every line is a valid value for its concept",
    (_, make) => {
      const { s } = make();
      const { lines } = examCommitLines(ecat, s.exam, toCtx(s));
      expect(lines.length).toBeGreaterThan(0);
      for (const l of lines) {
        expect(valid(l), `${l.conceptId} ${JSON.stringify(l.value)}`).toBe(true);
        expect(l.context.elicitedBy).toBe("examination");
        if (conceptDef(l.conceptId)!.contextRequired.includes("laterality"))
          expect(l.context.laterality, l.conceptId).toBeDefined();
      }
    },
  );

  it("writes nothing unrecorded; negatives are absent or the expected answer; options only when ticked", () => {
    let d = A.setState(ecat, scenario().exam, "ex.general.pallor", "negative");
    d = A.setState(ecat, d, "ex.respiratory.trachea", "positive");
    d = A.setAttr(ecat, d, "ex.respiratory.audible_sounds", "heard", "stridor");
    const s = scenario({ exam: d });
    const { lines } = examCommitLines(ecat, d, toCtx(s));
    const by = new Map(lines.map((l) => [l.conceptId, l]));
    expect(by.get("sign.pallor")!.value).toEqual({ type: "presence", presence: "absent" });
    expect(by.get("sign.tracheal_deviation")!.value).toEqual({
      type: "presence",
      presence: "present",
    });
    expect(by.get("sign.stridor")!.value).toEqual({ type: "presence", presence: "present" });
    expect(
      [...by.keys()].every((id) =>
        [
          "sign.pallor",
          "sign.tracheal_deviation",
          "sign.stridor",
          "sign.audible_breath_sounds",
        ].includes(id),
      ),
    ).toBe(true);
  });

  it("GCS parts: NT is written as not testable, never 1; the grids write one fact per side", () => {
    const s = scenario();
    gcs(s, 3, 4, 6, { nt: { V: "Intubated or tracheostomy" } });
    s.exam = A.fillGrid(s.exam, "power", ["Hip flexion"], "5");
    const { lines } = examCommitLines(ecat, s.exam, toCtx(s));
    expect(lines.find((l) => l.conceptId === "obs.gcs_verbal")!.value).toEqual({
      type: "coded",
      code: "not_testable",
    });
    const power = lines.filter((l) => l.conceptId === "exam.muscle_power");
    expect(power.map((l) => l.context.laterality).sort()).toEqual(["left", "right"]);
  });

  it("a finding recorded in two places is one fact, present if either says so; restricted stays restricted", () => {
    let d = A.setAttr(ecat, scenario().exam, "ex.general.hand_signs", "signs", "palmar_erythema");
    d = A.setState(ecat, d, "ex.abdomen.liver_stigmata", "positive");
    d = A.setState(ecat, d, "ex.rectal_genital.scrotum_testes", "positive");
    const s = scenario({ exam: d });
    const { lines } = examCommitLines(ecat, d, toCtx(s));
    expect(lines.filter((l) => l.conceptId === "sign.palmar_erythema")).toHaveLength(1);
    expect(lines.find((l) => l.conceptId === "exam.scrotum_testes")!.restricted).toBe(true);
  });
});
