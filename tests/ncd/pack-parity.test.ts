/**
 * Phase 3 acceptance (PROMPT-NCD-DIABETES): the TypeScript engine reproduces the
 * reference evaluator's `computed` result for every golden patient, field by field.
 * The expectations are never edited to make this pass; a difference is a defect in
 * the port or a real disagreement to report.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { PackInput, PackValues } from "@/lib/ncd/pack/types";
import { describe, expect, it } from "vitest";

import { diabetesPack, runDiabetesPack } from "@/lib/ncd/pack";

interface Vignette {
  id: string;
  title: string;
  site: "referral" | "district";
  established: boolean;
  ageBand: PackInput["ageBand"];
  values: PackValues;
  computed: Record<string, unknown>;
}
const fixture = JSON.parse(
  readFileSync(join(__dirname, "fixtures", "diabetes-pack-vignettes.json"), "utf8"),
) as { pack: { version: string }; vignettes: Vignette[] };
const VIGNETTES = fixture.vignettes;

describe("diabetes pack: parity with the reference evaluator", () => {
  it("covers every golden patient", () => {
    expect(VIGNETTES.length).toBeGreaterThanOrEqual(148);
    expect(diabetesPack().pack.version).toBe(fixture.pack.version);
  });

  it.each(VIGNETTES.map((v) => [v.id, v] as const))("%s", (_id, v) => {
    const r = runDiabetesPack({
      values: v.values,
      site: v.site,
      established: v.established,
      ageBand: v.ageBand,
    });
    const c = v.computed;
    expect({
      diagnosis: r.diagnosis,
      caveatsInForce: r.caveats,
      blockedCriteria: r.blockedCriteria,
      fired: r.fired,
      metButDark: r.dark,
      withheldForPregnancyAnswer: r.withheld,
      bandsWithheldByCaveat: r.bandsBlocked,
      complications: r.complications,
      stages: r.stages,
      risk: r.risk,
      targets: r.targets,
      bands: r.bands,
      classification: r.classification,
      unavailableFeatures: r.unavailableFeatures,
      restrictedClasses: r.restricted,
      urgency: r.urgency,
      interrupt: r.interrupt,
      foldedInto: r.foldedInto,
      interruptActions: r.interruptActions,
      metViaUnknown: r.metViaUnknown,
      cautions: r.cautions,
      gaps: r.gaps,
      pregnancyState: r.pregnancyState,
      actionOverride: r.actionOverride,
    }).toEqual(c);
  });
});
