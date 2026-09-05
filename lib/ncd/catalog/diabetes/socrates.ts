/**
 * SOCRATES — the pain history, declared once.
 *
 * Site, Onset, Character, Radiation, Associations, Time course,
 * Exacerbating/relieving, Severity. The framework is the same wherever pain is
 * asked about; only the option lists are clinical, and those are passed in by
 * the symptom that uses it. Abdominal pain and chest pain share the shape and
 * share nothing else.
 *
 * ── Whose idea this is ───────────────────────────────────────────────────────
 * SOCRATES is a widely-taught mnemonic with NO primary guideline source behind
 * it — structurally the same thing as the "5 Ps" this catalog refused to build,
 * where five searches found no source at all.
 *
 * The reason it is safe to adopt where that was not: SOCRATES prescribes only
 * the SHAPE of the history — which questions to ask — and asserts nothing about
 * a patient. No threshold, no stage, no verdict turns on it. So it ships marked
 * as ours, carrying `needsCsoInput`, and the option lists it is given are
 * conventional clinical vocabulary rather than any body's published taxonomy.
 *
 * ── Inertness ────────────────────────────────────────────────────────────────
 * Nothing here is referenced by a criterion, and that is deliberate rather than
 * incidental. A pain history informs the clinician; it does not move the engine.
 */
import type { Feature, FeatureOption } from "@/lib/ncd/catalog/schema";

/** Not a guideline position. Named so it cannot borrow authority. */
export const SOCRATES_CITATION = {
  standard: "local" as const,
  version: "SOCRATES pain history framework",
  title: "Structure of the pain history — not a guideline position",
  retrieved: "2026-09-05",
  csoSigned: false,
  needsCsoInput:
    "A widely-taught mnemonic with no primary guideline source. It structures the questions and asserts nothing clinical; the option lists are conventional. CSO to ratify.",
};

/** Shared where the answer does not depend on where the pain is. */
const ONSET: FeatureOption[] = [
  { value: "sudden", display: "Sudden, at its worst straight away" },
  { value: "rapid", display: "Over minutes to hours" },
  { value: "gradual", display: "Gradually, over days" },
];

const COURSE: FeatureOption[] = [
  { value: "constant", display: "Constant" },
  { value: "intermittent", display: "Comes and goes" },
  { value: "worsening", display: "Getting worse" },
  { value: "improving", display: "Getting better" },
];

export interface SocratesOptions {
  /** The finding these characterise. Codes are derived from it. */
  parent: string;
  section: string;
  site: FeatureOption[];
  character: FeatureOption[];
  radiation: FeatureOption[];
  /**
   * What accompanies the pain. Pass ONLY things the catalog does not already
   * capture as findings of their own — asking again under a second heading is
   * how one history ends up split across two answers that can disagree.
   */
  associations: FeatureOption[];
  /** Exacerbating and relieving factors. */
  modifiers: FeatureOption[];
  /** Default unit for "how long". Match the tempo, so nobody types a fraction. */
  durationUnit: string;
  onset?: FeatureOption[];
  course?: FeatureOption[];
}

/**
 * The nine rows of a pain history: eight letters, with T split into how long it
 * has lasted and what it has done since. Every one is a property of `parent`, so
 * none of them appears until the pain itself is recorded present — and the well
 * they live in refuses to fold while any is unanswered.
 */
export function socratesProps(o: SocratesOptions): Feature[] {
  const p = (
    suffix: string,
    display: string,
    extra: Partial<Feature> & Pick<Feature, "valueType">,
  ): Feature => ({
    code: `${o.parent}_${suffix}`,
    display,
    kind: "symptom",
    section: o.section,
    parent: o.parent,
    citation: SOCRATES_CITATION,
    ...extra,
  });

  return [
    p("site", "Site", { valueType: "single_select", options: o.site }),
    p("onset", "Onset", { valueType: "single_select", options: o.onset ?? ONSET }),
    p("character", "Character", { valueType: "single_select", options: o.character }),
    p("radiation", "Radiation", { valueType: "single_select", options: o.radiation }),
    p("associations", "Associations", { valueType: "multi_select", options: o.associations }),
    p("duration", "Duration", { valueType: "duration", unit: o.durationUnit }),
    p("time_course", "Course", { valueType: "single_select", options: o.course ?? COURSE }),
    p("modifiers", "What changes it", { valueType: "multi_select", options: o.modifiers }),
    p("severity", "Severity", { valueType: "number", unit: "/10" }),
  ];
}
