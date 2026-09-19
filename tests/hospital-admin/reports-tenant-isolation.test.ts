import type * as Reports from "@/lib/hospital-admin/reports";
import { afterAll, beforeAll, describe, expect, test } from "vitest";

import {
  cleanup,
  closeSql,
  createTestHospital,
  RLS_TESTS_ENABLED,
  serviceSql,
} from "../rls/_helpers";

/**
 * Tenant isolation for the reports queries (Gate H, ADR 0094).
 *
 * The reports lib reads through the app's service-role Drizzle client, so
 * RLS is not what keeps hospital B out of hospital A's page — the
 * `hospital_id` filter in every query is. This proves that filter with two
 * seeded tenants, and proves the lib's generated SQL runs against a real
 * Postgres (nothing else executes it: the source-level suite only greps).
 *
 * Scenario:
 *   - Hospital A: one clinic day that has ended, 10 places, 7 booked.
 *   - Hospital B: one clinic day that has ended, 20 places, 5 booked.
 *   - A's report shows 7 of 10 and only A's line; B's shows 5 of 20;
 *     the cross-tenant map keys them apart.
 *
 * Skipped unless MEDSYNC_ALLOW_RLS_DB_WRITES=1 (the same opt-in every
 * live-DB test uses). The lib is imported lazily so a skipped run never
 * opens the app's connection pool.
 */

describe.skipIf(!RLS_TESTS_ENABLED)("hospital-admin reports: tenant isolation", () => {
  let reports: typeof Reports;
  let hospitalA: { id: string };
  let hospitalB: { id: string };

  async function seedClinicDay(hospitalId: string, tag: string, places: number, booked: number) {
    const [dept] = await serviceSql<{ id: string }[]>`
      INSERT INTO public.hospital_departments (hospital_id, name, slug)
      VALUES (${hospitalId}, ${`Test Dept ${tag}`}, ${`test-dept-${tag}`})
      RETURNING id
    `;
    const [line] = await serviceSql<{ id: string }[]>`
      INSERT INTO public.service_lines (hospital_id, department_id, name, slug)
      VALUES (${hospitalId}, ${dept!.id}, ${`Test Line ${tag}`}, ${`test-line-${tag}`})
      RETURNING id
    `;
    // Yesterday, 09:00–12:00 UTC: inside every window, and already ended.
    const startsAt = new Date(Date.now() - 86_400_000);
    startsAt.setUTCHours(9, 0, 0, 0);
    const endsAt = new Date(startsAt.getTime() + 3 * 3_600_000);
    await serviceSql`
      INSERT INTO public.clinic_sessions
        (hospital_id, department_id, service_line_id, starts_at, ends_at,
         capacity_total, capacity_booked, booked_count, status)
      VALUES
        (${hospitalId}, ${dept!.id}, ${line!.id}, ${startsAt.toISOString()}, ${endsAt.toISOString()},
         ${places}, ${places}, ${booked}, 'published')
    `;
  }

  beforeAll(async () => {
    reports = await import("@/lib/hospital-admin/reports");
    hospitalA = await createTestHospital("rpt-a");
    hospitalB = await createTestHospital("rpt-b");
    await seedClinicDay(hospitalA.id, "rpt-a", 10, 7);
    await seedClinicDay(hospitalB.id, "rpt-b", 20, 5);
  });

  afterAll(async () => {
    await cleanup();
    await closeSql();
  });

  test("a hospital's report counts only its own clinic days", async () => {
    const w = reports.reportWindow(7);
    const a = await reports.fetchHospitalReport(hospitalA.id, w);
    const b = await reports.fetchHospitalReport(hospitalB.id, w);

    // 7 of 10 — under MIN_RATE_SAMPLE, so no percentage.
    expect(a.fillRate).toMatchObject({ numerator: 7, denominator: 10, share: null });
    expect(a.placesPublished).toBe(10);
    expect(a.perLine.map((l) => l.serviceLineName)).toEqual(["Test Line rpt-a"]);

    // 5 of 20 — at the floor, so the rate prints.
    expect(b.fillRate).toMatchObject({ numerator: 5, denominator: 20, share: 0.25 });
    expect(b.placesPublished).toBe(20);
    expect(b.perLine.map((l) => l.serviceLineName)).toEqual(["Test Line rpt-b"]);

    // Nothing else was seeded, so every other figure is empty, not invented.
    for (const r of [a, b]) {
      expect(r.noShowRate.denominator).toBe(0);
      expect(r.waitAccuracy.denominator).toBe(0);
      expect(r.perSession).toEqual([]);
      expect(r.sms).toEqual({ messages: 0, cost: 0, currency: null });
    }
  });

  test("the cross-tenant map keys the two hospitals apart", async () => {
    const all = await reports.fetchTenantAggregates(reports.reportWindow(7));
    expect(all.get(hospitalA.id)?.fillRate).toMatchObject({ numerator: 7, denominator: 10 });
    expect(all.get(hospitalB.id)?.fillRate).toMatchObject({ numerator: 5, denominator: 20 });
  });
});
