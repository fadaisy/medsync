import "server-only";

import type { CaptureMap } from "@/lib/ncd/engine/evaluate";
import { and, desc, eq } from "drizzle-orm";

import { db } from "@/db";
import { clinicalObservations } from "@/db/schema/nurse-workspace";
import { triageRecords } from "@/db/schema/triage";
import { encounterEngineLive } from "@/lib/encounter/feature";
import { logger } from "@/lib/logger";

/**
 * Vitals already on the record, carried into the clerkship rather than re-asked.
 *
 * A triaged patient has a blood pressure, a pulse and a temperature in
 * `clinical_observations` before the doctor opens this form. Asking for them a
 * second time is how a form gets routed around — and worse, how two different
 * numbers for the same patient end up in one chart.
 *
 * ── Prefilled, and said so ───────────────────────────────────────────────────
 * These ARE written into the capture on load: nobody should retype a blood
 * pressure the triage nurse took twenty minutes ago.
 *
 * But somebody else measured them, at another time, possibly in another room,
 * and the clinician signing this clerkship is accountable for every number in
 * it. So provenance travels with the value and the surface keeps saying it:
 * `at` carries the moment it was taken, and each row reads "from triage" until
 * the clinician changes the number — at which point it is theirs and the label
 * would be a lie. The section header says it once more at the top.
 *
 * The draft always wins over a prefill; see `initialCapture`.
 */

/**
 * ── Two sources, and the one that was missed ─────────────────────────────────
 * `clinical_observations` carries a `triage_record_id` column, which reads as
 * though triage writes there. IT DOES NOT — every row in it is a routine ward
 * observation, and the triage vitals live in `triage_records.vitals_snapshot`
 * as JSONB. Reading only the first table is why a fully triaged patient showed
 * an empty examination: the code was looking in the wrong place, confidently.
 *
 * Both are read now, and the most recent value per vital wins whichever table
 * it came from. A ward observation taken after triage SHOULD supersede it.
 */

/** Observation kinds in `clinical_observations` mapped to catalog features. */
const KINDS: Record<string, { feature: string; second?: string }> = {
  bp: { feature: "bp_systolic", second: "bp_diastolic" },
  hr: { feature: "pulse" },
  rr: { feature: "respiratory_rate" },
  temperature: { feature: "temperature" },
  spo2: { feature: "spo2" },
  glucose: { feature: "capillary_glucose" },
  weight: { feature: "weight_kg" },
  height: { feature: "height_cm" },
};

/**
 * Keys of `triage_records.vitals_snapshot` mapped to catalog features.
 *
 * The units line up: NEWS2 records temperature in °C, saturation in %, rate per
 * minute, pressure in mmHg — and glucose in mmol/L, which is what
 * `capillary_glucose` is in. The triage glucose is genuinely worth carrying: in
 * a hyperglycaemic crisis it is often the first number anyone has.
 *
 * NOT mapped, deliberately: `consciousness`. A triage ACVPU of V, P or U IS an
 * altered mental state, which is a RED danger sign here — and asserting a red
 * flag on the patient's behalf from another form's field is a bigger claim than
 * a prefill should make. It is a finding for the clinician to record.
 */
const SNAPSHOT: Record<string, string> = {
  systolicBp: "bp_systolic",
  diastolicBp: "bp_diastolic",
  pulse: "pulse",
  respiratoryRate: "respiratory_rate",
  temperature: "temperature",
  spo2: "spo2",
  bloodGlucose: "capillary_glucose",
};

export interface PulledVital {
  feature: string;
  display: string;
  value: number;
  unit?: string;
  recordedAt: Date;
  /** Measured at triage rather than as a routine observation. */
  fromTriage: boolean;
}

export interface VitalsPull {
  vitals: PulledVital[];
  /** The values, keyed by feature, each carrying when it was taken. */
  values: CaptureMap;
  latestAt?: Date;
  anyFromTriage: boolean;
}

const LABELS: Record<string, string> = {
  bp_systolic: "Systolic BP",
  bp_diastolic: "Diastolic BP",
  pulse: "Pulse",
  respiratory_rate: "Respiratory rate",
  temperature: "Temperature",
  spo2: "SpO\u2082",
  capillary_glucose: "Glucose",
  weight_kg: "Weight",
  height_cm: "Height",
};

/**
 * The most recent value of each vital, from triage and from the ward.
 *
 * `corrected` observations are excluded: a corrected reading is one somebody has
 * already said was wrong, and carrying it forward would undo them.
 */
export async function loadLatestVitals(patientUserId: string): Promise<VitalsPull> {
  const empty: VitalsPull = { vitals: [], values: {}, anyFromTriage: false };
  if (!encounterEngineLive()) return empty;

  const candidates: PulledVital[] = [];
  const offer = (v: PulledVital) => candidates.push(v);

  try {
    const obs = await db
      .select({
        kind: clinicalObservations.observationKind,
        v1: clinicalObservations.numericValue1,
        v2: clinicalObservations.numericValue2,
        unit: clinicalObservations.unit,
        recordedAt: clinicalObservations.recordedAt,
        triageRecordId: clinicalObservations.triageRecordId,
      })
      .from(clinicalObservations)
      .where(
        and(
          eq(clinicalObservations.patientUserId, patientUserId),
          eq(clinicalObservations.state, "active"),
        ),
      )
      .orderBy(desc(clinicalObservations.recordedAt))
      .limit(120);

    for (const row of obs) {
      const map = KINDS[row.kind];
      if (!map) continue;
      const push = (feature: string, raw: string | null) => {
        if (raw === null) return;
        offer({
          feature,
          display: LABELS[feature] ?? feature,
          value: Number(raw),
          unit: row.unit ?? undefined,
          recordedAt: row.recordedAt,
          fromTriage: Boolean(row.triageRecordId),
        });
      };
      push(map.feature, row.v1);
      if (map.second) push(map.second, row.v2);
    }
  } catch (error) {
    logger.warn("ncd.vitals.observations_failed", { error: String(error) });
  }

  try {
    const triage = await db
      .select({ snapshot: triageRecords.vitalsSnapshot, triagedAt: triageRecords.triagedAt })
      .from(triageRecords)
      .where(eq(triageRecords.patientUserId, patientUserId))
      .orderBy(desc(triageRecords.triagedAt))
      .limit(5);

    for (const row of triage) {
      const snap = row.snapshot as Record<string, unknown> | null;
      if (!snap || typeof snap !== "object") continue;
      for (const [key, feature] of Object.entries(SNAPSHOT)) {
        const raw = snap[key];
        // A null in the snapshot means it was not measured, not that it is zero.
        if (typeof raw !== "number") continue;
        offer({
          feature,
          display: LABELS[feature] ?? feature,
          value: raw,
          recordedAt: row.triagedAt,
          fromTriage: true,
        });
      }
    }
  } catch (error) {
    logger.warn("ncd.vitals.triage_failed", { error: String(error) });
  }

  const vitals = latestPerVital(candidates);
  const values: CaptureMap = {};
  for (const v of vitals) {
    values[v.feature] = { state: "recorded", value: v.value, at: v.recordedAt.toISOString() };
  }

  return {
    vitals,
    values,
    latestAt: vitals.reduce<Date | undefined>(
      (a, v) => (!a || v.recordedAt > a ? v.recordedAt : a),
      undefined,
    ),
    anyFromTriage: vitals.some((v) => v.fromTriage),
  };
}

/**
 * The newest reading of each vital, whichever table it came from.
 *
 * A ward observation taken after triage SHOULD supersede it — the point is the
 * most recent measurement, not the most recent triage. Non-finite values are
 * dropped rather than ranked: a NaN is a parse failure, not a reading.
 */
export function latestPerVital(candidates: PulledVital[]): PulledVital[] {
  const best = new Map<string, PulledVital>();
  for (const v of candidates) {
    if (!Number.isFinite(v.value)) continue;
    const held = best.get(v.feature);
    if (!held || v.recordedAt > held.recordedAt) best.set(v.feature, v);
  }
  return [...best.values()];
}

/**
 * What the form opens with: the record's vitals, with the author's own draft
 * laid over the top.
 *
 * THE DRAFT ALWAYS WINS. A value the clinician typed and saved is theirs, and an
 * older reading from the ward must never overwrite it — that is the difference
 * between a helpful prefill and a form that argues with you.
 *
 * One rough edge, stated rather than hidden: a value the clinician deliberately
 * CLEARED is simply absent from the draft, which is indistinguishable from never
 * having answered it — so it prefills again next time. Recoverable in one click,
 * and the alternative is a tombstone per field.
 */
export function initialCapture(
  pulled: CaptureMap | undefined,
  draft: CaptureMap | undefined,
): CaptureMap {
  return { ...(pulled ?? {}), ...(draft ?? {}) };
}
