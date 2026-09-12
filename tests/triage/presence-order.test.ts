import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { PgDialect } from "drizzle-orm/pg-core";
import { describe, expect, test, vi } from "vitest";

// The presence rule lives beside the queries that use it, and that module
// constructs the pg client at import. Nothing here touches the database.
vi.mock("@/db", () => ({ db: {} }));

const { presenceAt, declaredLast, presenceOf } = await import("@/lib/intake/queries");
const { priorityHintRank } = await import("@/db/schema/patient-intakes");

/**
 * Regression guard for the second clinical-safety defect that only manifests
 * as row ORDER (see priority-rank.test.ts for the first).
 *
 * `patient_intakes.arrived_at` is `notNull().defaultNow()`, and
 * `pt-declare-intake` creates the row at DECLARATION time — while the patient
 * is still at home. `ha-check-in-patient` later stamps `checked_in_at` and
 * never touches `arrived_at`. Both worklists then ordered by `arrived_at`
 * ascending and called it "oldest-waiting first", so:
 *
 *     declared 06:10 from home, walked in 13:00   →  sorted FIRST
 *     registered at the desk 07:30, sat there since →  sorted SECOND
 *
 * ADR 0084 §7b makes fixing this a blocking prerequisite of making the
 * same-day door primary, precisely because that door multiplies the traffic
 * through it. The fix is read-side only — migration 0035 already ships
 * `checked_in_at`.
 */

/** 2026-09-12, one hospital day. */
const at = (hhmm: string) => new Date(`2026-09-12T${hhmm}:00.000Z`);

/** Declared from home at 06:10; actually walked in at 13:00. */
const declarer = { arrivedAt: at("06:10"), checkedInAt: at("13:00") };
/** Registered at the desk at 07:30 — staff rows leave checked_in_at NULL. */
const walkIn = { arrivedAt: at("07:30"), checkedInAt: null };
/** Declared at 06:00 and still not here. */
const stillDeclared = { arrivedAt: at("06:00"), checkedInAt: null };

describe("presence ordering — coalesce(checked_in_at, arrived_at)", () => {
  test("a checked-in patient ranks by checked_in_at, not by declaration", () => {
    expect(presenceOf(declarer)).toEqual(at("13:00"));
    // Staff-created rows have no check-in stamp: arrived_at IS the arrival.
    expect(presenceOf(walkIn)).toEqual(at("07:30"));
    // Nothing to coalesce to on a row that never arrived — which is why
    // `declaredLast` keeps it out of the line rather than this timestamp.
    expect(presenceOf(stillDeclared)).toEqual(at("06:00"));
  });

  test("an early declarer does not outrank an earlier physical arrival", () => {
    const byPresence = [declarer, walkIn].sort(
      (a, b) => presenceOf(a).getTime() - presenceOf(b).getTime(),
    );
    expect(byPresence[0]).toBe(walkIn);

    // And the fixture really does exercise the defect: the key we replaced
    // puts them the other way round. If this ever stops being true the
    // assertion above has gone tautological.
    const byArrivedAt = [declarer, walkIn].sort(
      (a, b) => a.arrivedAt.getTime() - b.arrivedAt.getTime(),
    );
    expect(byArrivedAt[0]).toBe(declarer);
  });

  test("the SQL coalesces check-in over arrival, in that order", () => {
    const compiled = new PgDialect().sqlToQuery(presenceAt).sql;
    expect(compiled).toContain("coalesce");

    const checkedIn = compiled.indexOf("checked_in_at");
    const arrived = compiled.indexOf("arrived_at");
    expect(checkedIn).toBeGreaterThan(-1);
    expect(arrived).toBeGreaterThan(-1);
    // `arrived_at` is NOT NULL, so coalesce(arrived_at, checked_in_at) would
    // always return arrived_at — a silent no-op that reads like a fix.
    expect(checkedIn).toBeLessThan(arrived);
  });

  test("a declared row is not a position among present patients", () => {
    const compiled = new PgDialect().sqlToQuery(declaredLast).sql;
    // A boolean, not a timestamp: Postgres sorts false → true ascending, so
    // present rows lead and declarations tail whatever their clock says.
    expect(compiled).toContain("'declared'");
    expect(compiled).toContain("status");
    expect(compiled).not.toContain("arrived_at");
  });
});

describe("priority still outranks presence", () => {
  test("an escalated 'high' patient precedes 'routine' regardless of either timestamp", () => {
    const compiled = new PgDialect().sqlToQuery(priorityHintRank).sql;
    const high = Number(/WHEN 'high' THEN (\d+)/.exec(compiled)?.[1]);
    const routine = Number(/ELSE (\d+)/.exec(compiled)?.[1]);
    expect(high).toBeLessThan(routine);

    // Rank is the FIRST ordering key at every queue call site, so no
    // timestamp — declaration or arrival — can reorder across it. Pinned by
    // the call-site guard below.
    for (const clause of queueOrderings()) {
      expect(clause.indexOf("priorityHintRank")).toBeLessThan(clause.indexOf("presenceAt"));
    }
  });
});

describe("call sites", () => {
  test("every priority-ordered queue ranks by presence, never by arrivedAt", () => {
    const clauses = queueOrderings();
    // intake board + triage worklist. A third would be welcome; zero means
    // this guard has stopped looking at anything.
    expect(clauses.length).toBeGreaterThanOrEqual(2);
    for (const clause of clauses) {
      expect(clause).toContain("presenceAt");
      expect(clause).not.toContain("patientIntakes.arrivedAt");
    }
  });
});

/**
 * The ORDER BY clauses of the clinical queues, read from source.
 *
 * An ORDER BY cannot be executed without a database, and the fragments above
 * are only safe if the queues actually use them — which is exactly the gap
 * that let both defects ship under comments claiming the opposite. So the
 * guard reads the argument list of every `.orderBy(...)` that ranks by
 * clinical priority (`priorityHintRank`) or triage state (`triageLevel`).
 * Whitespace is collapsed, so reformatting cannot break it.
 */
function queueOrderings(): string[] {
  const sources = ["lib/intake/queries.ts", "lib/triage/worklist.ts"].map((f) =>
    readFileSync(resolve(__dirname, "../..", f), "utf8"),
  );

  const clauses: string[] = [];
  for (const src of sources) {
    for (let i = src.indexOf(".orderBy("); i !== -1; i = src.indexOf(".orderBy(", i + 1)) {
      let depth = 0;
      let end = i + ".orderBy".length;
      do {
        if (src[end] === "(") depth++;
        else if (src[end] === ")") depth--;
        end++;
      } while (depth > 0 && end < src.length);
      const clause = src.slice(i, end).replace(/\s+/g, " ");
      if (clause.includes("priorityHintRank") || clause.includes("triageLevel")) {
        clauses.push(clause);
      }
    }
  }
  return clauses;
}
