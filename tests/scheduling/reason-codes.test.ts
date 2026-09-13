import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import { PATIENT_REASON_CODES } from "@/supabase/functions/_shared/sessions-sql";

/**
 * Ruling C5 (ADR 0087): the reason vocabulary the Edge Functions validate
 * against must be the one migration 0058 wrote into
 * `appointments_reason_check` and `service_lines_reason_codes_check`. The
 * SQL is parsed, not retyped, so a code added on one side alone fails here.
 */
const SQL = readFileSync(
  resolve(process.cwd(), "supabase/migrations/0058_service_lines_and_sessions.sql"),
  "utf8",
);

function quotedList(afterMarker: string): string[] {
  const start = SQL.indexOf(afterMarker);
  expect(start, `marker not found: ${afterMarker}`).toBeGreaterThan(-1);
  const body = SQL.slice(start, SQL.indexOf(");", start));
  return [...body.matchAll(/'([a-z_]+)'/g)].map((m) => m[1] ?? "");
}

describe("migration 0058 reason codes ↔ PATIENT_REASON_CODES", () => {
  it("appointments_reason_check is exactly the 13 patient codes + urgent_review + other", () => {
    const sqlCodes = quotedList("ADD CONSTRAINT appointments_reason_check");
    expect(sqlCodes).toHaveLength(15);
    expect(new Set(sqlCodes)).toEqual(new Set([...PATIENT_REASON_CODES, "urgent_review", "other"]));
  });

  it("service_lines_reason_codes_check is the 13 + other, never urgent_review", () => {
    const sqlCodes = quotedList("CONSTRAINT service_lines_reason_codes_check");
    expect(new Set(sqlCodes)).toEqual(new Set([...PATIENT_REASON_CODES, "other"]));
    expect(sqlCodes).not.toContain("urgent_review");
  });

  it("the 13 are distinct", () => {
    expect(new Set(PATIENT_REASON_CODES).size).toBe(13);
  });
});
