import type { CapturedSymptom } from "@/lib/clerkship/symptom-engine";
import type { Clerkship } from "@/lib/encounter/clerkship";
import { z } from "zod";

import { renderSymptomProse } from "@/lib/clerkship/symptom-engine";

/**
 * The documentation-entry form's submission shape (v1: essential structured
 * sections — PC / HPC+SOCRATES / PMH / drug history + allergies / social / exam /
 * summary / differential / investigations / plan + disposition / safety-net).
 * Validated here; mapped to the engine's nested `Clerkship` by
 * `clerkshipInputToClerkship`. Structured-but-flexible — every field optional.
 * Pure (no DB / no server-only) so it is shared by the action + the client form
 * + the tests.
 */

const severity = z.enum(["mild", "moderate", "severe", "anaphylaxis", "unknown"]);
const orderKind = z.enum(["bloods", "imaging", "bedside", "special", "other"]);
const disposition = z.enum(["admit", "discharge", "refer", "observe", "transfer", "deceased"]);
const valueType = z.enum(["single_select", "multi_select", "scale", "duration", "boolean", "text"]);

/** Tap-first structured HPC — a symptom + its tapped property values. */
const capturedProperty = z.object({
  propertyCode: z.string().max(64),
  propertyDisplay: z.string().max(120),
  valueType,
  labels: z.array(z.string().max(160)).max(30).optional(),
  num: z.number().min(0).max(100).optional(),
  durationValue: z.number().min(0).max(100000).optional(),
  durationUnit: z.string().max(20).optional(),
  bool: z.boolean().optional(),
  text: z.string().max(1000).optional(),
});
const capturedSymptom = z.object({
  symptomCode: z.string().max(80),
  symptomDisplay: z.string().max(160),
  adHoc: z.boolean().optional(),
  properties: z.array(capturedProperty).max(40),
  note: z.string().max(1000).optional(),
});

export const ClerkshipInputSchema = z.object({
  presentingComplaint: z.string().max(2000).optional(),
  hpc: z.string().max(8000).optional(),
  /** Tap-first structured HPC; when present, `hpc` prose is generated from it. */
  hpcItems: z.array(capturedSymptom).max(30).optional(),
  socrates: z
    .object({
      site: z.string().max(240).optional(),
      onset: z.string().max(240).optional(),
      character: z.string().max(240).optional(),
      radiation: z.string().max(240).optional(),
      associated: z.string().max(500).optional(),
      timing: z.string().max(240).optional(),
      exacerbating: z.string().max(240).optional(),
      severity: z.string().max(240).optional(),
    })
    .optional(),
  pmh: z.string().max(8000).optional(),
  drugHistory: z.string().max(4000).optional(),
  allergies: z
    .array(
      z.object({
        substance: z.string().max(240),
        reaction: z.string().max(240).optional(),
        severity: severity.optional(),
      }),
    )
    .max(50)
    .optional(),
  social: z
    .object({
      occupation: z.string().max(240).optional(),
      smokingPackYears: z.number().min(0).max(200).optional(),
      alcoholUnitsPerWeek: z.number().min(0).max(500).optional(),
      recreationalDrugs: z.string().max(500).optional(),
    })
    .optional(),
  examGeneral: z.string().max(8000).optional(),
  examSystems: z
    .object({
      cardiovascular: z.string().max(2000).optional(),
      respiratory: z.string().max(2000).optional(),
      abdominal: z.string().max(2000).optional(),
      neurological: z.string().max(2000).optional(),
    })
    .optional(),
  summary: z.string().max(8000).optional(),
  differential: z
    .array(
      z.object({
        text: z.string().max(240),
        icd10: z.string().max(16).optional(),
        mustNotMiss: z.boolean().optional(),
      }),
    )
    .max(30)
    .optional(),
  investigations: z
    .array(
      z.object({
        kind: orderKind,
        text: z.string().max(240),
        loinc: z.string().max(16).optional(),
        justification: z.string().max(500).optional(),
      }),
    )
    .max(30)
    .optional(),
  managementPlan: z.string().max(8000).optional(),
  disposition: disposition.optional(),
  safetyNetting: z.string().max(2000).optional(),
});

export type ClerkshipInput = z.infer<typeof ClerkshipInputSchema>;

const clean = (s: string | undefined): string | undefined => {
  const t = s?.trim();
  return t ? t : undefined;
};
const prune = <T extends object>(o: T): T | undefined =>
  Object.values(o).some((v) => v !== undefined) ? o : undefined;

/** Build the engine's nested Clerkship from the validated form input. Pure. */
export function clerkshipInputToClerkship(input: ClerkshipInput): Clerkship {
  // Tap-first structured HPC: keep symptoms that have a code, and render the
  // prose from them (the generated prose wins over any free-typed hpc).
  const hpcItems = (input.hpcItems ?? [])
    .filter((s) => s.symptomCode.trim().length > 0)
    .map((s) => ({ ...s }) as CapturedSymptom);
  const hpcProse = hpcItems.length > 0 ? renderSymptomProse(hpcItems) : clean(input.hpc);

  const history = prune({
    presentingComplaint: clean(input.presentingComplaint),
    hpc: hpcProse,
    hpcItems: hpcItems.length > 0 ? hpcItems : undefined,
    socrates: input.socrates ? prune({ ...input.socrates }) : undefined,
    pmh: clean(input.pmh),
    drugHistory: clean(input.drugHistory),
    allergies: input.allergies
      ?.filter((a) => a.substance.trim().length > 0)
      .map((a) => ({ substance: a.substance.trim(), reaction: a.reaction, severity: a.severity })),
    social: input.social ? prune({ ...input.social }) : undefined,
  });

  const examination = prune({
    general: clean(input.examGeneral),
    systems: input.examSystems ? prune({ ...input.examSystems }) : undefined,
  });

  const synthesis = prune({
    summary: clean(input.summary),
    differential: input.differential
      ?.filter((d) => d.text.trim().length > 0)
      .map((d) => ({ text: d.text.trim(), icd10: clean(d.icd10), mustNotMiss: d.mustNotMiss })),
    investigations: input.investigations
      ?.filter((o) => o.text.trim().length > 0)
      .map((o) => ({
        kind: o.kind,
        text: o.text.trim(),
        loinc: clean(o.loinc),
        justification: clean(o.justification),
      })),
    managementPlan: clean(input.managementPlan),
    disposition: input.disposition,
    safetyNetting: clean(input.safetyNetting),
  });

  return { history, examination, synthesis };
}
