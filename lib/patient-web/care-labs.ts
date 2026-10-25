import "server-only";

import { patientResultsLiveFor } from "@/lib/lab/feature";
import { resultsFor } from "@/lib/lab/patient-results";
import { hasSmsConsent } from "@/lib/notifications/consent";

/**
 * Lab tests on Care: the patient's own results read exactly as the old results page reads them
 * (`resultsFor` behind `patientResults` at their hospital, with the in-app consent), reduced here to names,
 * dates and the "not ready" lines. No value, unit, range or word about a value leaves this file (S15).
 */
export type LabNames =
  | { state: "off" | "no_consent" | "minor" | "rules_unsigned" }
  | {
      state: "ready";
      ready: { id: string; test: string; releasedOn: string; hospitalName: string }[];
      notReady: { key: string; test: string; line: string }[];
    };

export async function loadLabNames(userId: string, hospitalId: string | null): Promise<LabNames> {
  if (!hospitalId || !patientResultsLiveFor(hospitalId)) return { state: "off" };
  const [res, consent] = await Promise.all([
    resultsFor({ userId, subjectUserId: userId }, new Date()),
    hasSmsConsent(userId, "results_in_app"),
  ]);
  if (!res) return { state: "off" };
  if (res.blocked === "no_consent" || !consent) return { state: "no_consent" };
  if (res.blocked) return { state: res.blocked };
  return {
    state: "ready",
    ready: res.ready.map((c) => ({
      id: c.reportId,
      test: c.test,
      releasedOn: c.releasedOn,
      hospitalName: c.hospitalName,
    })),
    notReady: res.notReady.map((n) => ({ key: n.key, test: n.test, line: n.line })),
  };
}
