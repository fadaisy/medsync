import "server-only";

/**
 * Monitoring alerts seam.
 *
 * The monitoring engine hasn't shipped — there are no alerts tables.
 * This module defines the contract the engine will expose so the
 * workspace can be wired up the day the engine lands without touching
 * any UI code. Today: `listOpenAlertsForDoctor()` returns an empty
 * array; the panel renders an honest empty state.
 *
 * Future shape (when the engine lands, this becomes a real query):
 *
 *   - Source: a `clinical_alerts` table (TBD migration) with rows
 *     keyed to a patient, a metric (glucose / BP / SpO2 / temp), a
 *     threshold, a severity, and a state (open / acknowledged /
 *     resolved).
 *   - Scope: alerts for patients the doctor has access to per
 *     `lib/doctor/patient-access.ts` (care-team / encounter /
 *     department).
 *   - Order: severity DESC, opened_at DESC.
 *
 * The `appointments.triggered_by_alert_id` text column already exists
 * as the urgent-from-alert seam (scheduling GATE F). When the alerts
 * table lands, that column gets upgraded to a real FK.
 */

export type AlertSeverity = "critical" | "high" | "moderate" | "low";

export interface DoctorAlert {
  id: string;
  patientUserId: string;
  patientCode: string;
  metric: string; // 'glucose' | 'bp' | 'spo2' | 'temperature' | ...
  reading: string; // pretty-printed value
  severity: AlertSeverity;
  openedAtIso: string;
  state: "open" | "acknowledged" | "resolved";
}

export async function listOpenAlertsForDoctor(_args: {
  doctorUserId: string;
  doctorDepartmentId: string;
}): Promise<DoctorAlert[]> {
  // Seam — the engine will fill this in. Returning [] is deliberate:
  // the panel UI handles the honest empty state with the right tone.
  return [];
}

export const ALERT_SEVERITY_LABEL: Record<AlertSeverity, string> = {
  critical: "Critical",
  high: "High",
  moderate: "Moderate",
  low: "Low",
};
