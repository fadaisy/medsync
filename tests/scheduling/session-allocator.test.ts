import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import {
  ALLOCATE_SESSION_POSITION_SQL,
  NEXT_SESSIONS_OF_LINE_SQL,
} from "@/supabase/functions/_shared/sessions-sql";

/**
 * Proposal §5.3: the allocator is ONE statement whose WHERE is the capacity
 * guard. Nobody may quietly turn it back into a check-then-write or drop the
 * counter that keeps position numbers monotonic.
 */
describe("ALLOCATE_SESSION_POSITION_SQL", () => {
  it("guards capacity and status in the WHERE, not in a prior SELECT", () => {
    expect(ALLOCATE_SESSION_POSITION_SQL).toContain(
      "booked_count < ceil(capacity_booked * overbooking_factor)",
    );
    expect(ALLOCATE_SESSION_POSITION_SQL).toContain("status = 'published'");
    expect(ALLOCATE_SESSION_POSITION_SQL.trim().toUpperCase().startsWith("UPDATE")).toBe(true);
    expect(ALLOCATE_SESSION_POSITION_SQL).not.toMatch(/^\s*SELECT/i);
  });

  it("moves both counters and returns the position", () => {
    expect(ALLOCATE_SESSION_POSITION_SQL).toContain("booked_count = booked_count + 1");
    expect(ALLOCATE_SESSION_POSITION_SQL).toContain("next_position = next_position + 1");
    expect(ALLOCATE_SESSION_POSITION_SQL).toMatch(/RETURNING next_position/);
    expect(ALLOCATE_SESSION_POSITION_SQL).not.toContain("next_position - 1");
  });
});

describe("NEXT_SESSIONS_OF_LINE_SQL", () => {
  it("offers only published, future, non-full sessions of the same line", () => {
    expect(NEXT_SESSIONS_OF_LINE_SQL).toContain("status = 'published'");
    expect(NEXT_SESSIONS_OF_LINE_SQL).toContain("starts_at > now()");
    expect(NEXT_SESSIONS_OF_LINE_SQL).toContain(
      "booked_count < ceil(capacity_booked * overbooking_factor)",
    );
    expect(NEXT_SESSIONS_OF_LINE_SQL).toContain("LIMIT 2");
  });
});

/**
 * Migration 0059 (ADR 0088) installs the allocator as a SQL function because
 * supabase-js cannot run raw SQL. The function body must carry the same
 * load-bearing clauses as the string above, and only service_role may call
 * any of the three functions.
 */
describe("migration 0059 — the allocator as SQL functions", () => {
  const SQL = readFileSync(resolve(process.cwd(), "supabase/migrations/0059_receipts.sql"), "utf8");
  const fn = (name: string) => {
    const start = SQL.indexOf(`CREATE OR REPLACE FUNCTION public.${name}(`);
    expect(start, `function not found: ${name}`).toBeGreaterThan(-1);
    return SQL.slice(start, SQL.indexOf("$$;", start));
  };

  it("allocate_session_position is the ADR 0087 UPDATE, guard in the WHERE, NULL when full", () => {
    const body = fn("allocate_session_position");
    expect(body).toContain("RETURNS smallint");
    expect(body).toContain("booked_count = booked_count + 1");
    expect(body).toContain("next_position = next_position + 1");
    expect(body).toContain("status = 'published'");
    expect(body).toContain("booked_count < ceil(capacity_booked * overbooking_factor)");
    expect(body).toMatch(/RETURNING next_position/);
    expect(body).not.toMatch(/AS \$\$\s*SELECT/i);
  });

  it("release_session_position moves booked_count only — never next_position", () => {
    const body = fn("release_session_position");
    expect(body).toContain("booked_count - 1");
    expect(body).not.toContain("next_position");
  });

  it("next_sessions_of_line offers only published, future, non-full sessions of the line", () => {
    const body = fn("next_sessions_of_line");
    expect(body).toContain("service_line_id = p_line");
    expect(body).toContain("status = 'published'");
    expect(body).toContain("starts_at > p_after");
    expect(body).toContain("booked_count < ceil(capacity_booked * overbooking_factor)");
    expect(body).toContain("LIMIT 2");
  });

  it("every function is SECURITY DEFINER and executable by service_role only", () => {
    for (const name of [
      "allocate_session_position",
      "next_sessions_of_line",
      "release_session_position",
    ]) {
      expect(fn(name)).toContain("SECURITY DEFINER");
      expect(SQL).toMatch(
        new RegExp(
          `REVOKE ALL ON FUNCTION public\\.${name}\\([^)]*\\) FROM PUBLIC, anon, authenticated;`,
        ),
      );
      expect(SQL).toMatch(
        new RegExp(`GRANT EXECUTE ON FUNCTION public\\.${name}\\([^)]*\\) TO service_role;`),
      );
    }
  });

  it("appointment_reminders.kind is additive: NOT NULL DEFAULT 'reminder', CHECK reminder|receipt", () => {
    expect(SQL).toContain("ADD COLUMN IF NOT EXISTS kind text NOT NULL DEFAULT 'reminder'");
    expect(SQL).toContain("CHECK (kind IN ('reminder','receipt'))");
    expect(SQL).not.toMatch(/DROP (TABLE|COLUMN|INDEX)/i);
  });
});
