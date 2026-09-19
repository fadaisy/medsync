import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";

import {
  HELD_PAST_STATUSES,
  MIN_RATE_SAMPLE,
  parseReportDays,
  POSITIONS_HONOURED_THRESHOLD,
  ratio,
  reportWindow,
} from "@/lib/hospital-admin/reports";

/**
 * Gate H (ADR 0094) — the reports are operational, never a patient score.
 * Source-level, in the style of the gate D/E/F suites: these rules are about
 * what a module may SELECT and who may read it, not about what a row holds,
 * and the dev DB carries no report rows to assert against.
 */
const ROOT = process.cwd();
const read = (rel: string) => readFileSync(resolve(ROOT, rel), "utf8");

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.tsx?$/.test(p)) out.push(p);
  }
  return out;
}
const stripComments = (src: string) =>
  src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

const REPORTS = "lib/hospital-admin/reports.ts";
const PAGE = "app/hospital-admin/reports/page.tsx";
const ROLLUP = "app/admin/scheduling-rollup/page.tsx";

describe("the reports page is scoped, and says what its numbers are", () => {
  it("imports requireHospitalAdminScope and calls it before any read", () => {
    const page = stripComments(read(PAGE));
    expect(page).toMatch(
      /import \{ requireHospitalAdminScope \} from "@\/lib\/hospital-admin\/scope"/,
    );
    const scopeAt = page.indexOf("await requireHospitalAdminScope()");
    const readAt = page.indexOf("fetchHospitalReport(");
    expect(scopeAt).toBeGreaterThan(-1);
    expect(readAt).toBeGreaterThan(scopeAt);
    // The scope's hospital is the only one the page reads for.
    expect(page).toContain("fetchHospitalReport(scope.hospitalId");
  });

  it("states the ruling in words next to the numbers", () => {
    const page = read(PAGE);
    expect(page).toContain("never a patient");
    expect(page).toMatch(/nothing in the booking path reads these figures/i);
  });

  it("is registered as a live feature area", () => {
    const features = stripComments(read("app/hospital-admin/_lib/features.ts"));
    expect(features).toMatch(/slug: "reports",[\s\S]*?placeholder: false/);
  });
});

describe("the reports module selects counts, never a person", () => {
  const src = stripComments(read(REPORTS));

  it("never names a patient column, a phone, a code or a note", () => {
    for (const needle of [
      "fullName",
      "users.",
      "bookingCode",
      "patientUserId",
      "provisionalPatientId",
      "recipientPhoneEncrypted",
      "recipientUserId",
      "phone",
      "reasonNote",
      "displayName",
      "createdByUserId",
      "clinicianUserId",
    ]) {
      expect(src, needle).not.toContain(needle);
    }
  });

  it("every read is grouped or filtered by hospital — no ungrouped row-level select", () => {
    // Each `.from(` is a query; each must carry the hospital filter or the
    // per-hospital groupBy in the same statement.
    const statements = src.split(/(?=\bdb\s*\n?\s*\.select\()/).slice(1);
    expect(statements.length).toBeGreaterThanOrEqual(6);
    for (const stmt of statements) {
      expect(stmt).toMatch(/hospitalId/);
      expect(stmt).toMatch(/\.groupBy\(/);
    }
  });

  it("never orders or sorts by the no-show figure", () => {
    for (const line of src.split("\n")) {
      if (/orderBy|\.sort\(|order by/i.test(line)) {
        expect(line).not.toMatch(/no_?show/i);
      }
    }
  });
});

describe("nothing in the booking path reads a metric", () => {
  const trees = [
    "app/patient",
    "app/reception",
    "lib/patient",
    "lib/scheduling",
    "supabase/functions",
  ].map((t) => resolve(ROOT, t));

  it("no booking surface imports the reports module", () => {
    for (const tree of trees) {
      for (const p of walk(tree)) {
        expect(readFileSync(p, "utf8"), p).not.toContain("hospital-admin/reports");
      }
    }
    for (const core of [
      "supabase/functions/_shared/book.ts",
      "supabase/functions/pt-request-appointment/index.ts",
    ]) {
      expect(read(core), core).not.toMatch(/reports/i);
    }
  });

  it("no booking surface orders or sorts anything by a no-show figure", () => {
    for (const tree of trees) {
      for (const p of walk(tree)) {
        const lines = stripComments(readFileSync(p, "utf8")).split("\n");
        lines.forEach((line, i) => {
          if (/orderBy|\.sort\(|order by/i.test(line)) {
            expect(line, `${p}:${i + 1}`).not.toMatch(/no_?show/i);
          }
        });
      }
    }
  });
});

describe("the superadmin rollup reuses the lib and stays PHI-free", () => {
  const src = stripComments(read(ROLLUP));

  it("reads through fetchTenantAggregates rather than its own query", () => {
    expect(src).toContain("fetchTenantAggregates(");
    expect(src).not.toContain("queueEntries");
    expect(src).not.toContain("waitlistEntries");
  });

  it("names no patient column", () => {
    for (const needle of ["bookingCode", "patientUserId", "fullName", "phone"]) {
      expect(src, needle).not.toContain(needle);
    }
  });
});

describe("a thin sample says so", () => {
  const w = reportWindow(28, new Date("2026-09-19T09:00:00Z"));

  it("a rate under the minimum has no share; at the minimum it does", () => {
    expect(MIN_RATE_SAMPLE).toBe(20);
    expect(ratio(3, MIN_RATE_SAMPLE - 1, w).share).toBeNull();
    expect(ratio(3, MIN_RATE_SAMPLE, w)).toMatchObject({
      numerator: 3,
      denominator: 20,
      share: 0.15,
      minimum: 20,
      window: w,
    });
    expect(ratio(0, 0, w).share).toBeNull();
  });

  it("the window starts at local midnight in Kampala and ends now", () => {
    // 28 days before 09:00Z on 19 Sep is 22 Aug; Kampala midnight is 21:00Z the day before.
    expect(w.from.toISOString()).toBe("2026-08-21T21:00:00.000Z");
    expect(w.to.toISOString()).toBe("2026-09-19T09:00:00.000Z");
    expect(w.days).toBe(28);
  });

  it("?days= accepts only the three windows", () => {
    expect(parseReportDays("7")).toBe(7);
    expect(parseReportDays("90")).toBe(90);
    expect(parseReportDays("30")).toBe(28);
    expect(parseReportDays(undefined)).toBe(28);
    expect(parseReportDays("abc")).toBe(28);
  });

  it("the no-show denominator is the held set, and the detector threshold is half", () => {
    expect([...HELD_PAST_STATUSES]).toEqual([
      "confirmed",
      "arrived",
      "in_progress",
      "completed",
      "no_show",
    ]);
    expect(POSITIONS_HONOURED_THRESHOLD).toBe(0.5);
  });
});
