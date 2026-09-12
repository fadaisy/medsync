import { PgDialect } from "drizzle-orm/pg-core";
import { describe, expect, test } from "vitest";

import { takesBelongToDay } from "@/lib/patient/self-tracking";

/**
 * Regression guard for a runtime-only failure that typecheck cannot see.
 *
 * `listTakesForDay` windows on `coalesce(scheduled_for, taken_at)` so a dose
 * swallowed after midnight still lands on the evening it was scheduled for.
 * The left operand is therefore a raw `sql` fragment, and drizzle's
 * `bindIfParam` only encodes an operand when the left side is a
 * DriverValueEncoder — which a Column is and an SQL fragment is not. Compared
 * against a bare `Date`, the bound was handed to postgres.js unencoded and it
 * threw `ERR_INVALID_ARG_TYPE: Received an instance of Date` on every render
 * of the patient home. Both bounds must bind as driver values instead.
 */
describe("takesBelongToDay", () => {
  const dayStart = new Date("2026-09-12T00:00:00+03:00");
  const dayEnd = new Date("2026-09-13T00:00:00+03:00");

  function compile() {
    const condition = takesBelongToDay(dayStart, dayEnd);
    expect(condition).toBeDefined();
    return new PgDialect().sqlToQuery(condition!);
  }

  test("binds no parameter as a Date — the driver cannot encode one", () => {
    for (const param of compile().params) {
      expect(param).not.toBeInstanceOf(Date);
    }
  });

  test("binds both day bounds as ISO strings the driver accepts", () => {
    expect(compile().params).toEqual([dayStart.toISOString(), dayEnd.toISOString()]);
  });

  test("windows on the scheduled slot, falling back to the clock", () => {
    const { sql } = compile();
    expect(sql).toContain('coalesce("self_medication_takes"."scheduled_for"');
    expect(sql).toContain('"self_medication_takes"."taken_at")');
  });
});
