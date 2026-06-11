import type { RosObservation } from "@/lib/clerkship/ros";
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

/** Review-of-Systems three-state screen entry (present/denies; not-asked omitted). */
const rosObservation = z.object({
  symptomCode: z.string().max(80),
  symptomDisplay: z.string().max(160),
  system: z.string().max(40),
  status: z.enum(["present", "denies"]),
  properties: z.array(capturedProperty).max(40).optional(),
  note: z.string().max(1000).optional(),
});

export const ClerkshipInputSchema = z.object({
  presentingComplaint: z.string().max(2000).optional(),
  hpc: z.string().max(8000).optional(),
  /** The clinician's own free-typed HPC narrative (kept separate from the
   * auto-generated symptom prose; the two are combined for display). */
  hpcNarrative: z.string().max(8000).optional(),
  /** Tap-first structured HPC; its prose is combined with the narrative. */
  hpcItems: z.array(capturedSymptom).max(30).optional(),
  /** Review-of-Systems screen (system-grouped three-state sweep). */
  ros: z.array(rosObservation).max(200).optional(),
  /** ROS scope (complete/focused) — truthful coverage; PC systems are HPC-covered. */
  rosScope: z
    .object({
      mode: z.enum(["complete", "focused"]),
      reviewedSystems: z.array(z.string().max(40)).max(20),
    })
    .optional(),
  /** Clinician's free-text ROS narrative (saved with the generated sweep summary). */
  rosNarrative: z.string().max(20000).optional(),
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
  /** Tap-first PMH conditions (pick-list + attributes). → problem list. */
  pmhItems: z
    .array(
      z.object({
        code: z.string().max(80),
        display: z.string().max(160),
        year: z.string().max(20).optional(),
        status: z
          .enum([
            "well_controlled",
            "poorly_controlled",
            "remission",
            "resolved",
            "newly_diagnosed",
          ])
          .optional(),
        onTreatment: z.boolean().optional(),
        complications: z.array(z.string().max(80)).max(20).optional(),
        note: z.string().max(1000).optional(),
        adHoc: z.boolean().optional(),
      }),
    )
    .max(50)
    .optional(),
  /** Always-screen "ever had?" toggles (yes/no/unsure). */
  pmhScreen: z.record(z.string().max(60), z.enum(["yes", "no", "unsure"])).optional(),
  /** Tap-first PSH operations (pick-list + attributes). */
  pshItems: z
    .array(
      z.object({
        code: z.string().max(80),
        display: z.string().max(160),
        year: z.string().max(20).optional(),
        indication: z.string().max(240).optional(),
        anaesthetic: z.enum(["ga", "spinal", "local", "unsure"]).optional(),
        anaestheticComplication: z.boolean().optional(),
        complications: z.string().max(500).optional(),
        note: z.string().max(1000).optional(),
        adHoc: z.boolean().optional(),
      }),
    )
    .max(50)
    .optional(),
  /** Tap-first current medications (drug pick-list + attributes). → medications. */
  medications: z
    .array(
      z.object({
        name: z.string().max(160),
        dose: z.string().max(80).optional(),
        route: z.string().max(40).optional(),
        frequency: z.string().max(40).optional(),
        indication: z.string().max(160).optional(),
        adherence: z.enum(["good", "occasional_miss", "frequent_miss", "stopped"]).optional(),
        category: z.enum(["prescribed", "otc", "herbal", "contraceptive"]).optional(),
        adHoc: z.boolean().optional(),
      }),
    )
    .max(50)
    .optional(),
  /** Explicit recorded negatives per section (nkda / no_meds / no_pmh / …). */
  negatives: z.record(z.string().max(40), z.boolean()).optional(),
  /** Tap-first family history (relative + condition) + quick family screens. */
  familyHistory: z
    .array(
      z.object({
        relative: z.enum([
          "mother",
          "father",
          "sibling",
          "child",
          "grandparent",
          "aunt_uncle",
          "other",
        ]),
        conditionCode: z.string().max(80).optional(),
        conditionDisplay: z.string().max(160),
        ageOnset: z.string().max(40).optional(),
        deceased: z.boolean().optional(),
        causeOfDeath: z.string().max(160).optional(),
        adHoc: z.boolean().optional(),
      }),
    )
    .max(50)
    .optional(),
  fhScreen: z.record(z.string().max(60), z.enum(["yes", "no", "unsure"])).optional(),
  /** Structured social / personal history (smoking pack-years, alcohol/CAGE, …). */
  socialHx: z
    .object({
      smokingStatus: z.enum(["never", "current", "ex"]).optional(),
      cigsPerDay: z.number().min(0).max(200).optional(),
      smokingYears: z.number().min(0).max(120).optional(),
      quitYear: z.string().max(20).optional(),
      alcoholStatus: z.enum(["never", "occasional", "regular", "ex"]).optional(),
      alcoholUnitsPerWeek: z.number().min(0).max(500).optional(),
      cage: z
        .object({
          cutDown: z.boolean().optional(),
          annoyed: z.boolean().optional(),
          guilty: z.boolean().optional(),
          eyeOpener: z.boolean().optional(),
        })
        .optional(),
      drugUse: z.enum(["never", "past", "current"]).optional(),
      drugDetail: z.string().max(500).optional(),
      occupationCode: z.string().max(80).optional(),
      occupation: z.string().max(160).optional(),
      exposures: z.array(z.string().max(80)).max(20).optional(),
      living: z.enum(["alone", "with_family", "with_spouse", "institution"]).optional(),
      func: z.enum(["independent", "some_help", "dependent"]).optional(),
      mobility: z.enum(["independent", "aid", "wheelchair", "bedbound"]).optional(),
      diet: z.string().max(240).optional(),
      activity: z.enum(["sedentary", "moderate", "active"]).optional(),
      recentTravel: z.string().max(240).optional(),
    })
    .optional(),
  /** Ideas / concerns / expectations. */
  ice: z
    .object({
      ideas: z.string().max(2000).optional(),
      concerns: z.string().max(2000).optional(),
      expectations: z.string().max(2000).optional(),
    })
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
  /** Tap-first general-exam findings (three-state + value-sets). */
  examGeneralFindings: z
    .array(
      z.object({
        code: z.string().max(80),
        group: z.string().max(40),
        display: z.string().max(160),
        state: z.enum(["present", "absent", "not_examined"]),
        values: z.array(z.string().max(120)).max(20).optional(),
        note: z.string().max(1000).optional(),
      }),
    )
    .max(120)
    .optional(),
  /** A vitals set recorded at this exam (triage set is carried, not re-entered). */
  examVitals: z
    .object({
      hr: z.number().min(0).max(400).optional(),
      rr: z.number().min(0).max(120).optional(),
      spo2: z.number().min(0).max(100).optional(),
      sbp: z.number().min(0).max(320).optional(),
      dbp: z.number().min(0).max(260).optional(),
      tempC: z.number().min(20).max(45).optional(),
      glucose: z.number().min(0).max(60).optional(),
      gcs: z.number().min(3).max(15).optional(),
      recordedAtIso: z.string().max(40).optional(),
    })
    .optional(),
  /** Structured respiratory exam (tap-first IPPA + zonal). */
  examRespiratory: (() => {
    const zoneRec = <T extends z.ZodTypeAny>(v: T) =>
      z
        .object({
          upper_right: v,
          upper_left: v,
          mid_right: v,
          mid_left: v,
          lower_right: v,
          lower_left: v,
        })
        .partial()
        .optional();
    return z
      .object({
        findings: z
          .array(
            z.object({
              code: z.string().max(80),
              group: z.string().max(40),
              display: z.string().max(160),
              state: z.enum(["present", "absent", "not_examined"]),
              values: z.array(z.string().max(120)).max(20).optional(),
              note: z.string().max(1000).optional(),
            }),
          )
          .max(60)
          .optional(),
        trachea: z.enum(["central", "deviated_right", "deviated_left"]).optional(),
        expansion: z
          .object({ right: z.enum(["normal", "reduced"]), left: z.enum(["normal", "reduced"]) })
          .partial()
          .optional(),
        percussion: zoneRec(z.enum(["resonant", "dull", "stony_dull", "hyper_resonant"])),
        breathSounds: zoneRec(z.enum(["vesicular", "bronchial", "reduced", "absent"])),
        vocalResonance: zoneRec(z.enum(["normal", "increased", "reduced"])),
        addedSounds: zoneRec(
          z
            .array(
              z.enum([
                "wheeze_poly",
                "wheeze_mono",
                "crackles_fine",
                "crackles_coarse",
                "pleural_rub",
                "stridor",
              ]),
            )
            .max(6),
        ),
      })
      .optional();
  })(),
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
  // Tap-first structured HPC: keep symptoms that have a code, render their prose,
  // and COMBINE it with the clinician's own narrative (both are preserved — the
  // generated prose first, the typed narrative after).
  const hpcItems = (input.hpcItems ?? [])
    .filter((s) => s.symptomCode.trim().length > 0)
    .map((s) => ({ ...s }) as CapturedSymptom);
  const generated = hpcItems.length > 0 ? renderSymptomProse(hpcItems) : undefined;
  const narrative =
    clean(input.hpcNarrative) ?? (hpcItems.length > 0 ? undefined : clean(input.hpc));
  const hpcProse = [generated, narrative].filter(Boolean).join("\n\n") || undefined;

  // Review of Systems: keep present/denies entries (not-asked is already omitted).
  const ros = (input.ros ?? [])
    .filter((o) => o.symptomCode.trim().length > 0)
    .map((o) => ({ ...o }) as RosObservation);

  const history = prune({
    presentingComplaint: clean(input.presentingComplaint),
    hpc: hpcProse,
    hpcNarrative: narrative,
    hpcItems: hpcItems.length > 0 ? hpcItems : undefined,
    ros: ros.length > 0 ? ros : undefined,
    rosScope: input.rosScope,
    rosNarrative: clean(input.rosNarrative),
    socrates: input.socrates ? prune({ ...input.socrates }) : undefined,
    pmh: clean(input.pmh),
    drugHistory: clean(input.drugHistory),
    pmhItems: input.pmhItems?.filter((x) => x.display.trim().length > 0),
    pmhScreen: input.pmhScreen && Object.keys(input.pmhScreen).length ? input.pmhScreen : undefined,
    pshItems: input.pshItems?.filter((x) => x.display.trim().length > 0),
    medications: input.medications
      ?.filter((m) => m.name.trim().length > 0)
      .map((m) => ({ ...m, name: m.name.trim() })),
    negatives: input.negatives && Object.keys(input.negatives).length ? input.negatives : undefined,
    familyHistory: input.familyHistory?.filter((f) => f.conditionDisplay.trim().length > 0),
    fhScreen: input.fhScreen && Object.keys(input.fhScreen).length ? input.fhScreen : undefined,
    socialHx:
      input.socialHx && Object.values(input.socialHx).some((v) => v !== undefined)
        ? input.socialHx
        : undefined,
    ice: input.ice ? prune({ ...input.ice }) : undefined,
    allergies: input.allergies
      ?.filter((a) => a.substance.trim().length > 0)
      .map((a) => ({ substance: a.substance.trim(), reaction: a.reaction, severity: a.severity })),
    social: input.social ? prune({ ...input.social }) : undefined,
  });

  const examination = prune({
    general: clean(input.examGeneral),
    generalFindings: input.examGeneralFindings?.filter((x) => x.state !== "not_examined"),
    vitals:
      input.examVitals && Object.values(input.examVitals).some((v) => v !== undefined)
        ? input.examVitals
        : undefined,
    respiratory:
      input.examRespiratory && Object.values(input.examRespiratory).some((v) => v !== undefined)
        ? input.examRespiratory
        : undefined,
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
