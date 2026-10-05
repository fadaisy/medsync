import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import type { ImpressionDraft } from "@/lib/clerking/impression/board";
import { describe, expect, it } from "vitest";

import { EMPTY_IMPRESSION } from "@/lib/clerking/impression/board";
import { composeImpression } from "@/lib/clerking/impression/compose";
import { recordedFindings, syntheticFinding } from "@/lib/clerking/impression/facts";
import { board, ctx, feverNeck, recorded } from "./si-fixtures";

/**
 * §12: the Summary and Impression never reach a patient. Source-level: no patient page and no print
 * a patient takes home reads a clinical note or a composer, so the reasoning (syndrome, likelihood,
 * reasons, evidence) and the composed text cannot leave the clinical views. The prints withhold a
 * restricted problem unless the clinician includes it (their own mechanism). Engine-level: the
 * patient audience drops restricted diagnoses and findings.
 */

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.(ts|tsx)$/.test(p)) out.push(p);
  }
  return out;
}

const PATIENT_FACING = [
  "app/patient",
  "app/doctor/encounters/[encounterId]/print",
  "components/emr/print-views.tsx",
  "components/emr/print-layout.tsx",
];
const NOTE_READS =
  /clinicalNotes|clinical_notes|contentCiphertext|composeSummary|composeImpression|\.impression\b|summaryText/;

describe("patient-facing exclusion (§12)", () => {
  it("no patient page or patient print reads a note or a composer", () => {
    const files = PATIENT_FACING.flatMap((p) => {
      const abs = join(process.cwd(), p);
      return statSync(abs).isDirectory() ? walk(abs) : [abs];
    });
    expect(files.length).toBeGreaterThan(10);
    const bad = files.filter((f) => NOTE_READS.test(readFileSync(f, "utf8")));
    expect(bad).toEqual([]);
  });

  it("the patient audience drops restricted diagnoses and findings (patient 3, HIV)", () => {
    const x = ctx(feverNeck());
    const lead = recorded("dx.meningitis_bacterial", { slot: "leading" });
    const crypto = recorded("dx.cryptococcal_meningitis");
    const at = { by: "u-1", at: "2026-09-28T08:00:00Z" };
    const draft: ImpressionDraft = {
      ...EMPTY_IMPRESSION,
      evidence: {
        [lead.logicalId]: { "ex:ex.nervous.neck_stiffness": { w: "for", ...at } },
        [crypto.logicalId]: { "pmh:hiv": { w: "for", ...at } },
      },
    };
    const input = {
      board: board([lead, crypto], draft),
      draft,
      findings: new Map(recordedFindings(x).map((f) => [f.ref, f])),
      unexplained: recordedFindings(x),
    };
    const clinical = composeImpression({ ...input, audience: "clinical" });
    const patient = composeImpression({ ...input, audience: "patient" });
    expect(clinical).toMatch(/Cryptococcal meningitis/);
    expect(clinical).toMatch(/HIV/);
    expect(patient).not.toMatch(/Cryptococcal meningitis/);
    expect(patient).not.toMatch(/HIV|antiretroviral/i);
    expect(patient).toMatch(/Bacterial meningitis/);
  });

  it("the diabetes pack's evidence (a past detail, ketones) keeps HIV out of the patient's text", () => {
    const s = feverNeck();
    s.history.past.conditions.diabetes = { answer: "yes", details: { type: "type_1" } };
    s.exam = { ...s.exam, panels: { ...s.exam.panels, ketones: { blood: 3.2 } } };
    const x = ctx(s);
    const lead = recorded("dx.dm_type1", { slot: "leading" });
    const crypto = recorded("dx.cryptococcal_meningitis");
    const at = { by: "u-1", at: "2026-10-05T08:00:00Z" };
    const draft: ImpressionDraft = {
      ...EMPTY_IMPRESSION,
      evidence: {
        [lead.logicalId]: {
          "pmh:diabetes#type": { w: "for", ...at },
          "cl:ketone_band": { w: "for", ...at },
        },
        [crypto.logicalId]: { "pmh:hiv": { w: "for", ...at } },
      },
    };
    const findings = new Map(recordedFindings(x).map((f) => [f.ref, f]));
    for (const ref of ["pmh:diabetes#type", "cl:ketone_band"]) {
      const f = syntheticFinding(ref, x);
      if (f) findings.set(ref, f);
    }
    const input = { board: board([lead, crypto], draft), draft, findings, unexplained: [] };
    const patient = composeImpression({ ...input, audience: "patient" });
    expect(composeImpression({ ...input, audience: "clinical" })).toMatch(/Cryptococcal/);
    expect(patient).not.toMatch(/HIV|antiretroviral|Cryptococcal/i);
    expect(patient).toMatch(/diabetes, type: type 1/);
  });
});
