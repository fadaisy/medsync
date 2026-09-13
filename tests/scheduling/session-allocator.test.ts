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
