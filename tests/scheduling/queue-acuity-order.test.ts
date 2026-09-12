import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, test } from "vitest";

/**
 * Regression guard for the third defect in this family that manifests only
 * as row ORDER (see tests/triage/priority-rank.test.ts and
 * tests/triage/presence-order.test.ts for the first two — those are
 * `patient_intakes`; this one is `queue_entries`, a different table with a
 * different key, which is why it needed its own guard).
 *
 * `app/nurse/triage/actions.ts` writes `queue_entries.priority_order` on
 * every triage — the acuity level, lower = seen sooner, per migration 0036.
 * `fetchDepartmentQueueToday` is the ONLY reader of that table, and it
 * ordered by `sequence_number` alone. A nurse assessing a patient as Level 1
 * therefore wrote the re-rank to the database and moved nothing on the
 * doctor's rail.
 *
 * Read from source: an ORDER BY cannot be executed without a database, and
 * a comment claiming the right order is exactly what shipped the first two.
 */
const read = (f: string) => readFileSync(resolve(__dirname, "../..", f), "utf8");

function orderByClause(src: string, after: string): string {
  const from = src.indexOf(after);
  expect(from).toBeGreaterThan(-1);
  const i = src.indexOf(".orderBy(", from);
  expect(i).toBeGreaterThan(-1);
  let depth = 0;
  let end = i + ".orderBy".length;
  do {
    if (src[end] === "(") depth++;
    else if (src[end] === ")") depth--;
    end++;
  } while (depth > 0 && end < src.length);
  return src.slice(i, end).replace(/\s+/g, " ");
}

describe("doctor queue rail — acuity outranks arrival", () => {
  const source = read("lib/scheduling/doctor.ts");
  const clause = orderByClause(source, "export async function fetchDepartmentQueueToday");

  test("the nurse's triage re-rank is the FIRST ordering key", () => {
    expect(clause).toContain("priorityOrder");
    expect(clause).toContain("sequenceNumber");
    expect(clause.indexOf("priorityOrder")).toBeLessThan(clause.indexOf("sequenceNumber"));
  });

  test("un-triaged entries keep plain arrival order behind the assessed ones", () => {
    // NULLS LAST, not the Postgres default (NULLS LAST is already the default
    // for ASC — stated anyway, because the intent must survive a future DESC).
    expect(clause).toContain("NULLS LAST");
    expect(clause).not.toContain("DESC");
  });

  test("the rail says WHY it reordered — an unexplained jump is colour-alone for queues", () => {
    // The label is derived server-side from ACUITY_TIERS and rendered as text.
    expect(source).toContain("ACUITY_TIERS");
    expect(source).toMatch(/priorityLabel/);
    expect(read("app/doctor/schedule/_components/queue-rail.tsx")).toContain("row.priorityLabel");
  });
});
