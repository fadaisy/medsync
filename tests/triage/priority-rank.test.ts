import { PgDialect } from "drizzle-orm/pg-core";
import { describe, expect, test } from "vitest";

import { priorityHintRank } from "@/db/schema/patient-intakes";

/**
 * Regression guard for a clinical-safety defect that typecheck cannot see and
 * no unit test could reach, because it only manifests as row ORDER.
 *
 * `patient_intakes.priority_hint` is TEXT, constrained to
 * ('routine','high','urgent'). Both worklists originally ordered by
 * `desc(priorityHint)`, which sorts alphabetically:
 *
 *     urgent → routine → high
 *
 * So a patient reception had escalated to 'high' appeared BELOW every routine
 * patient on the nurse's un-triaged worklist. The comment above each query
 * said "priority desc" — the intent was documented and the collation silently
 * did the opposite.
 *
 * These assertions fail the moment someone reverts to a bare desc(), which is
 * the natural thing to reach for.
 */
describe("priorityHintRank", () => {
  const compiled = new PgDialect().sqlToQuery(priorityHintRank).sql;

  test("ranks urgent ahead of high, and high ahead of routine", () => {
    const urgent = compiled.indexOf("'urgent'");
    const high = compiled.indexOf("'high'");
    expect(urgent).toBeGreaterThan(-1);
    expect(high).toBeGreaterThan(-1);

    // The CASE assigns urgent a strictly lower rank than high, and high a
    // strictly lower rank than the ELSE branch (routine). Read the numbers
    // out of the emitted SQL rather than trusting the ordering of the text.
    const urgentRank = Number(/WHEN 'urgent' THEN (\d+)/.exec(compiled)?.[1]);
    const highRank = Number(/WHEN 'high' THEN (\d+)/.exec(compiled)?.[1]);
    const routineRank = Number(/ELSE (\d+)/.exec(compiled)?.[1]);

    expect(urgentRank).toBeLessThan(highRank);
    expect(highRank).toBeLessThan(routineRank);
  });

  test("is a CASE rank, not a collation-ordered column reference", () => {
    // A bare `desc(priorityHint)` compiles to `"priority_hint" desc` with no
    // CASE. That is the exact regression this file exists to catch.
    expect(compiled).toContain("CASE");
    expect(compiled).not.toMatch(/^\s*"?priority_hint"?\s*(asc|desc)?\s*$/i);
  });

  test("covers every value the CHECK constraint permits", () => {
    // ('routine','high','urgent'). routine is the ELSE branch, so only the
    // other two need naming — but a fourth value added to the CHECK without
    // being added here would silently rank as routine.
    for (const value of ["urgent", "high"]) {
      expect(compiled).toContain(`'${value}'`);
    }
    expect(compiled).toMatch(/ELSE \d+/);
  });
});
