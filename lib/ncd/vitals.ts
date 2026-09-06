import "server-only";

import type { CaptureMap } from "@/lib/ncd/engine/evaluate";
import { and, desc, eq } from "drizzle-orm";

import { db } from "@/db";
import { clinicalObservations } from "@/db/schema/nurse-workspace";
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

/** Observation kinds in `clinical_observations` mapped to catalog features. */
const KINDS: Record<string, { feature: string; second?: string }> = {
  bp: { feature: "bp_systolic", second: "bp_diastolic" },
  hr: { feature: "pulse" },
  rr: { feature: "respiratory_rate" },
  temperature: { feature: "temperature" },
  spo2: { feature: "spo2" },
  weight: { feature: "weight_kg" },
  height: { feature: "height_cm" },
};

export interface PulledVital {
  feature: string;
  display: string;
  value: number;
  unit?: string;
  recordedAt: Date;
  /** Measured during triage rather than as a routine observation. */
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
  spo2: "SpO₂",
  weight_kg: "Weight",
  height_cm: "Height",
};

/**
 * The most recent ACTIVE observation of each kind for this patient.
 *
 * `corrected` rows are excluded by the state filter: a corrected observation is
 * one somebody has already said was wrong, and carrying it forward would undo
 * their correction.
 */
export async function loadLatestVitals(patientUserId: string): Promise<VitalsPull> {
  const empty: VitalsPull = { vitals: [], values: {}, anyFromTriage: false };
  if (!encounterEngineLive()) return empty;

  try {
    const rows = await db
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

    const vitals: PulledVital[] = [];
    const values: CaptureMap = {};
    const seen = new Set<string>();

    for (const row of rows) {
      const map = KINDS[row.kind];
      if (!map) continue;
      // Rows arrive newest first, so the first of a kind is the current one.
      if (seen.has(row.kind)) continue;
      seen.add(row.kind);

      const push = (feature: string, raw: string | null) => {
        const n = raw === null ? NaN : Number(raw);
        if (!Number.isFinite(n)) return;
        vitals.push({
          feature,
          display: LABELS[feature] ?? feature,
          value: n,
          unit: row.unit ?? undefined,
          recordedAt: row.recordedAt,
          fromTriage: Boolean(row.triageRecordId),
        });
        values[feature] = { state: "recorded", value: n, at: row.recordedAt.toISOString() };
      };

      push(map.feature, row.v1);
      if (map.second) push(map.second, row.v2);
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
  } catch (error) {
    // The observation table may not exist un-migrated. Nothing to offer is a
    // valid state; it must never be a broken page.
    logger.warn("ncd.vitals.load_failed", { error: String(error) });
    return empty;
  }
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
