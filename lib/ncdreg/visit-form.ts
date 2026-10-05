/**
 * B9: the visit form assembled from the person's registrations. Shared fields always show; module
 * visit fields add theirs; each core registration adds its recorded control and its observations.
 * Pure and client-safe: the screen renders it, the speed-budget test counts it (§11.5).
 */
import type { ConditionModule, VisitField } from "./standard/types";

export type FormField =
  | { key: string; part: "nurse" | "clinician"; kind: "shared"; label: string; required: boolean }
  | { key: string; part: "nurse" | "clinician"; kind: "module"; label: string; required: boolean; field: VisitField; module: string }
  | { key: string; part: "clinician"; kind: "control"; label: string; required: boolean; registrationId: string; module: string }
  | { key: string; part: "clinician"; kind: "observation"; label: string; required: boolean; registrationId: string; module: string; field: VisitField };

export type FormRegistration = { registrationId: string; module: ConditionModule };

/**
 * `required` marks an input the user must touch on a follow-up with unchanged medicines. Fields with
 * a sensible default (glucose type fasting, method capillary) or that a single confirm covers
 * (carried-forward medicines) count once.
 */
export function visitFormSpec(regs: readonly FormRegistration[], visitType: string): FormField[] {
  const out: FormField[] = [
    { key: "weight", part: "nurse", kind: "shared", label: "Weight", required: true },
    { key: "bp_1", part: "nurse", kind: "shared", label: "Blood pressure", required: true },
  ];
  const seen = new Set<string>();
  for (const { module: m } of regs)
    for (const f of m.visit_fields.filter((x) => x.storage === "visit_column")) {
      if (seen.has(f.code)) continue;
      seen.add(f.code);
      out.push({
        key: f.code,
        part: f.code === "glucose" ? "nurse" : "clinician",
        kind: "module",
        label: f.label,
        // Expected fields are required; an offered enum asked at every visit (hypoglycaemia) is one tap.
        required: f.requirement === "expected" || (f.type === "enum" && f.storage === "visit_column"),
        field: f,
        module: m.code,
      });
    }
  out.push({ key: "medicines_confirm", part: "clinician", kind: "shared", label: "Medicines", required: true });
  out.push({ key: "missed_doses", part: "clinician", kind: "shared", label: "Missed doses in the past 7 days", required: true });
  for (const { registrationId, module: m } of regs) {
    if (m.outcome_classification.kind !== "clinician_recorded") continue;
    out.push({
      key: `control:${registrationId}`,
      part: "clinician",
      kind: "control",
      label: `${m.label}: control`,
      required: visitType === "scheduled" || visitType === "unscheduled",
      registrationId,
      module: m.code,
    });
    for (const f of m.visit_fields.filter((x) => x.storage === "observation"))
      out.push({ key: `obs:${registrationId}:${f.code}`, part: "clinician", kind: "observation", label: f.label, required: false, registrationId, module: m.code, field: f });
  }
  out.push({ key: "medicines_obtained", part: "clinician", kind: "shared", label: "Medicines obtained", required: true });
  out.push({ key: "next_appointment", part: "clinician", kind: "shared", label: "Next appointment", required: true });
  return out;
}

/** Inputs to complete a visit: the required fields plus the one "Close visit" action. */
export const requiredInputs = (spec: readonly FormField[]) => spec.filter((f) => f.required).length + 1;
