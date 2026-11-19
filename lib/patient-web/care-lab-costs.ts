import "server-only";

import type { Costs, TestCostLine, WaitingTest } from "./costs";
import { sql } from "drizzle-orm";

import { db } from "@/db";
import { rowsOf } from "@/lib/exchange/store";
import { labTestPricesLiveFor, patientPricesLiveFor } from "@/lib/lab/feature";
import { loadTestPrices } from "@/lib/lab/prices-store";
import { loadOpenProblems } from "@/lib/services/data";
import { testCosts } from "./costs";

/**
 * What the patient's waiting tests cost at their hospital (ADR 0527), for the lab page on Care. It prices only
 * orders the page already lists (`shownKeys`, from `loadLabNames`, which holds the consent, age and wording
 * gates), and of those only standard, unrestricted tests at this hospital: a restricted or sensitive test is never
 * named or priced here. Off (null) unless both PATIENT_PRICES and LAB_TEST_PRICES are on for the hospital.
 */
export async function loadLabCosts(
  userId: string,
  hospitalId: string | null,
  shownKeys: readonly string[],
): Promise<Costs<TestCostLine> | null> {
  if (!hospitalId || !shownKeys.length) return null;
  if (!(patientPricesLiveFor(hospitalId) && labTestPricesLiveFor(hospitalId))) return null;
  const today = new Date().toLocaleDateString("en-CA", { timeZone: "Africa/Kampala" });
  const res = await db.execute(sql`SELECT o.id, t.code, t.display AS name,
        coalesce(o.fasting_required, false) AS fasting, d.stated_tat AS tat
      FROM encounter_orders o
      JOIN test_catalogue t ON t.id = o.test_id
      LEFT JOIN diagnostic_offerings d
        ON d.hospital_id = o.hospital_id AND d.kind = 'lab' AND d.code = t.code
     WHERE o.patient_user_id = ${userId} AND o.hospital_id = ${hospitalId} AND o.kind = 'lab'
       AND o.sensitivity = 'standard' AND t.restricted_class IS NULL
       AND o.id::text IN (${sql.join(
         shownKeys.map((k) => sql`${k}`),
         sql`, `,
       )})`);
  const rows = rowsOf<{
    id: string;
    code: string;
    name: string;
    fasting: boolean;
    tat: string | null;
  }>(res);
  if (!rows.length) return null;
  const [prices, problems] = await Promise.all([
    loadTestPrices(hospitalId),
    loadOpenProblems(hospitalId),
  ]);
  const tests: WaitingTest[] = rows.map((r) => ({
    key: r.id,
    code: r.code,
    name: r.name,
    fasting: r.fasting,
  }));
  return testCosts(
    tests,
    prices,
    Object.fromEntries(rows.map((r) => [r.code, r.tat])),
    new Set(problems.filter((p) => p.subjectKind === "test").map((p) => p.subjectRef)),
    today,
  );
}
