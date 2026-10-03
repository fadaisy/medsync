/**
 * What the desk loads for step 10 when the Plan by problem is on (ADR 0184): the record the Plan
 * reads back, the ward list, the facts the checks read (weight with its time and source, the latest
 * creatinine and glucose), the co-sign policy and the monitoring charts. Plain data.
 */
import type { PlanRecord } from "./record";
import type { MonitoringPayload } from "@/lib/emr/charts/payload";
import type { WeightFact } from "@/lib/prescribing/formulary";
import type { CultureState } from "@/lib/prescribing/plan-checks";

export type CosignRequirement = "allowed" | "cosign_required" | "blocked";

export interface PlanPayload {
  /** EMR_PRESCRIBING is on here: the Plan can prescribe. */
  prescribing: boolean;
  record: PlanRecord;
  /** The hospital's ward names, for Admit. */
  /** The wards that take admissions; counts (words) with WARD_BUILDER on (ADR 0197 §5). */
  wards: { id: string; name: string; counts: string | null }[];
  /** The viewer is an intern: discharging with NEWS2 of 5 or more needs a senior to agree. */
  intern: boolean;
  facts: {
    ageYears: number | null;
    weight: WeightFact | null;
    creatinine: { value: number; unit: string; at: string } | null;
    glucose: { value: number; at: string } | null;
    conditions: string[];
  };
  cosign: { routine: CosignRequirement; controlled: CosignRequirement };
  /** The blood culture ordered at this visit, as the record holds it. */
  bloodCulture: Exclude<CultureState, "in_basket">;
  /** A U&E or creatinine ordered at this visit. */
  kidneyTestOrdered: boolean;
  monitoring: MonitoringPayload | null;
}
