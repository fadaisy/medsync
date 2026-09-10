/**
 * Recorded therapy that a guideline says is wrong for THIS patient.
 *
 * ── Why these are not danger signs ───────────────────────────────────────────
 * A danger sign fires on one finding being present. Every rule here is a
 * RELATION between captures — metformin and an eGFR below 30, an SGLT2 inhibitor
 * and an acute illness — so each is a `Criterion` evaluated at the catalog level
 * rather than a property of any single feature.
 *
 * ── The line ─────────────────────────────────────────────────────────────────
 * Each `action` is the source's own instruction and never a dose; the validator
 * rejects a flag whose action contains one. Naming a DRUG is allowed where the
 * source names it, because WHO's instruction is precisely to switch from
 * glibenclamide to gliclazide, and a warning that cannot say which drug is a
 * warning nobody can act on.
 *
 * ── What these are not ───────────────────────────────────────────────────────
 * They are not an audit of the prescriber. The capture is what the PATIENT
 * reports taking, which is frequently not what was prescribed and sometimes not
 * what is being swallowed. A flag is a prompt to look, and its action says what
 * the guideline says — nothing here concludes that anyone did anything wrong.
 *
 * ── Deliberately absent ──────────────────────────────────────────────────────
 * A "type 1 not on insulin" flag, which would be the most severe rule in the
 * set. There is no captured diabetes TYPE — the classification is derived from
 * criteria and a predicate cannot reference it — so the rule is not expressible.
 * Recorded as a gap rather than approximated from phenotype, which is exactly
 * what `classify()` refuses to do.
 *
 * A thiazolidinedione-with-heart-failure flag, for the same reason: no heart
 * failure feature exists to test against.
 */
import type { TherapyFlag } from "@/lib/ncd/catalog/schema";

const RETRIEVED = "2026-09-06";

/**
 * ADA Standards of Care 2026, Section 9. Every quote below was read from this
 * document directly rather than taken from a secondary source.
 */
const ADA_S9 = {
  standard: "ADA" as const,
  version: "Standards of Care in Diabetes—2026, Section 9",
  title: "9. Pharmacologic Approaches to Glycemic Treatment",
  url: "https://pmc.ncbi.nlm.nih.gov/articles/PMC12690185/",
  retrieved: RETRIEVED,
  csoSigned: false,
};

/** WHO HEARTS-D, the authority for the resource-limited tier. */
const HEARTS_D = {
  standard: "WHO" as const,
  version: "HEARTS-D, WHO 2020 (WHO/UCN/NCD/20.1)",
  title: "HEARTS D: diagnosis and management of type 2 diabetes",
  url: "https://iris.who.int/server/api/core/bitstreams/2a0b4f68-7155-4ad1-b543-945791e31830/content",
  retrieved: RETRIEVED,
  csoSigned: false,
};

export const THERAPY_FLAGS: TherapyFlag[] = [
  {
    /**
     * The single most consequential rule in the set, and the one most often
     * missed, because the glucose can be NORMAL. A patient on an SGLT2 inhibitor
     * who is unwell can be in ketoacidosis at a glucose nobody would act on, so
     * the flag has to fire on the drug plus the illness rather than on any
     * number.
     */
    id: "sglt2_during_acute_illness",
    display: "SGLT2 inhibitor during an acute illness",
    severity: "red",
    action:
      "Stop the SGLT2 inhibitor and check ketones even if the glucose is normal. ADA directs discontinuation during critical illness or prolonged fasting, and warns of euglycaemic ketoacidosis.",
    when: {
      id: "sglt2_and_illness",
      label: "On an SGLT2 inhibitor, and acutely unwell",
      all: [{ feature: "glucose_lowering_therapy", op: "==", value: "sglt2" }],
      any: [
        { feature: "intercurrent_illness", op: "present" },
        { feature: "vomiting", op: "present" },
      ],
      citation: {
        ...ADA_S9,
        quote:
          "DKA risk in individuals with insulin deficiency (rare in T2D): discontinue, evaluate, and treat promptly if suspected; be aware of predisposing risk factors and clinical presentations (including euglycemic DKA); mitigate risk with sick-day planning; discontinue before scheduled surgery (e.g., 3–4 days), during critical illness, or during prolonged fasting",
      },
    },
    citation: {
      ...ADA_S9,
      quote:
        "discontinue before scheduled surgery (e.g., 3–4 days), during critical illness, or during prolonged fasting",
    },
  },
  {
    /**
     * Insulin omission is categorically different from missing a tablet, which
     * is why this is separate from `treatment_omission`: stopping metformin
     * worsens control, and stopping insulin causes ketoacidosis.
     */
    id: "insulin_stopped",
    display: "Insulin recently stopped",
    severity: "red",
    action:
      "Establish why the insulin stopped before anything else — supply, cost, or a misunderstanding — and restart it. WHO names insulin omission a major cause of ketoacidosis.",
    when: {
      id: "insulin_was_stopped",
      label: "Insulin was being taken, and has been stopped",
      all: [
        { feature: "drug_change_from", op: "==", value: "insulin" },
        { feature: "drug_change_kind", op: "==", value: "stopped" },
      ],
      citation: { ...HEARTS_D, quote: "A major cause of DKA" },
    },
    citation: { ...HEARTS_D, quote: "A major cause of DKA" },
  },
  {
    id: "metformin_low_egfr",
    display: "Metformin with an eGFR below 30",
    severity: "amber",
    action:
      "Stop metformin. ADA lists it as contraindicated below an eGFR of 30 mL/min/1.73 m². Reassess the glucose-lowering plan with the prescribing team.",
    when: {
      id: "metformin_and_egfr_30",
      label: "On metformin, with an eGFR below 30 mL/min/1.73 m²",
      all: [
        { feature: "glucose_lowering_therapy", op: "==", value: "metformin" },
        { feature: "egfr", op: "<", value: 30, unit: "mL/min/1.73m2" },
      ],
      citation: { ...ADA_S9, quote: "Contraindicated with eGFR <30 mL/min/1.73 m 2" },
    },
    citation: { ...ADA_S9, quote: "Contraindicated with eGFR <30 mL/min/1.73 m 2" },
  },
  {
    /**
     * The commonest correctable prescribing problem where this module is going,
     * and the reason `sulfonylurea_agent` exists at all. Glibenclamide is long
     * acting and its metabolites accumulate, so the hypoglycaemia it causes is
     * prolonged and often nocturnal.
     */
    id: "glibenclamide_in_use",
    display: "Taking glibenclamide",
    severity: "amber",
    action:
      "Consider switching to gliclazide. WHO directs the switch, and ADA states glyburide is generally not recommended in chronic kidney disease.",
    when: {
      id: "on_glibenclamide",
      label: "The sulfonylurea is glibenclamide",
      all: [{ feature: "sulfonylurea_agent", op: "==", value: "glibenclamide" }],
      citation: { ...ADA_S9, quote: "Glyburide: generally not recommended in CKD" },
    },
    citation: {
      ...HEARTS_D,
      needsCsoInput:
        "ADA's 'generally not recommended in CKD' is verbatim. WHO's switch instruction is quoted elsewhere in this catalog but was not re-verified against the source here. CSO to confirm the wording.",
    },
  },
  {
    id: "sulfonylurea_with_insulin",
    display: "Sulfonylurea taken with insulin",
    severity: "amber",
    action:
      "Review the combination for hypoglycaemia risk with the prescribing team. ADA advises caution when a sulfonylurea is combined with insulin.",
    when: {
      id: "su_plus_insulin",
      label: "On both a sulfonylurea and insulin",
      all: [
        { feature: "glucose_lowering_therapy", op: "==", value: "sulfonylurea" },
        { feature: "glucose_lowering_therapy", op: "==", value: "insulin" },
      ],
      citation: {
        ...ADA_S9,
        quote:
          "Use with caution in individuals at risk for hypoglycemia, particularly if in combination with insulin",
      },
    },
    citation: {
      ...ADA_S9,
      quote:
        "Use with caution in individuals at risk for hypoglycemia, particularly if in combination with insulin",
    },
  },
  {
    /**
     * Ours, and marked so. ADA states that recurrent level 2 or any level 3
     * hypoglycaemia is an urgent medical issue, and separately that
     * sulfonylureas carry hypoglycaemia risk. That the COMBINATION of a
     * sulfonylurea with lost warning symptoms deserves its own prompt is our
     * inference from those two, not a sentence either source writes.
     */
    id: "sulfonylurea_without_warning",
    display: "Sulfonylurea, and the warning symptoms of a low are gone",
    severity: "amber",
    action:
      "Review the sulfonylurea with the prescribing team and relax the glycaemic target. A person who no longer feels a low is the one most likely to have a severe one.",
    when: {
      id: "su_and_unaware",
      label: "On a sulfonylurea, with impaired hypoglycaemia awareness",
      all: [
        { feature: "glucose_lowering_therapy", op: "==", value: "sulfonylurea" },
        { feature: "impaired_hypo_awareness", op: "present" },
      ],
      citation: {
        standard: "local",
        version: "MedSync clinical reasoning",
        title: "Not a guideline position — implementation reasoning, unratified",
        retrieved: RETRIEVED,
        csoSigned: false,
        needsCsoInput:
          "Composed from two ADA statements that are individually sourced; no retrieved source pairs them. CSO to ratify.",
      },
    },
    citation: {
      standard: "local",
      version: "MedSync clinical reasoning",
      title: "Not a guideline position — implementation reasoning, unratified",
      retrieved: RETRIEVED,
      csoSigned: false,
      needsCsoInput:
        "Composed from two ADA statements that are individually sourced; no retrieved source pairs them. CSO to ratify.",
    },
  },
];
