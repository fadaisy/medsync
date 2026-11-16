import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import { kampalaDay } from "@/app/hospital-admin/today/_lib/load";
import { ACTIVITY_ACTIONS, activityLine } from "@/lib/hospital-admin/activity";
import { ADMIN_HOME } from "@/lib/hospital-admin/admin-nav";
import { todayStats, todayTodo, waitedText } from "@/lib/hospital-admin/today";

const read = (rel: string) => readFileSync(resolve(process.cwd(), rel), "utf8");
const DAY = 86_400_000;

/** ADR 0521: Today is the admin's home; Activity shows admin actions only. */
describe("Today", () => {
  const base = { booked: 12, pending: [], review: 0, unavailable: 0, verify: [], copies: [] };

  it("is the home on both domains and the first item in the menu", () => {
    expect(ADMIN_HOME.href).toBe("/hospital-admin/today");
    expect(read("app/hospital-admin/page.tsx")).toContain('redirect("/hospital-admin/today")');
    expect(read("lib/landing/feature.ts")).toContain('"/hospital-admin": "/hospital-admin/today"');
    expect(existsSync(resolve(process.cwd(), "app/hospital-admin/today/page.tsx"))).toBe(true);
  });

  it("prints a count it could not read as a dash, never as zero", () => {
    const s = todayStats({ ...base, booked: null, pending: null, review: null, unavailable: null });
    expect(s.map((x) => x.value)).toEqual(["—", "—", "—", "—"]);
    expect(s.every((x) => !x.attention)).toBe(true);
  });

  it("has nothing to do when nothing waits", () => {
    expect(todayTodo(base)).toEqual([]);
  });

  it("lists other admins' changes to verify apart from your own, then people, urgent, stale and copies", () => {
    const t = todayTodo({
      ...base,
      review: 2,
      unavailable: 1,
      pending: [
        { urgent: true, waitedMs: 3 * 3_600_000 },
        { urgent: false, waitedMs: 3 * DAY },
        { urgent: false, waitedMs: DAY / 2 },
      ],
      verify: [
        { byName: "Dr. A", mine: false },
        { byName: "Dr. A", mine: false },
        { byName: "Me", mine: true },
      ],
      copies: [{ code: "MUL-1", dueText: "Wed 2 Dec" }],
    });
    expect(t.map((x) => x.key)).toEqual([
      "verify",
      "mine",
      "review",
      "urgent",
      "stale",
      "copy",
      "unavailable",
    ]);
    expect(t[0]!.title).toContain("2 changes");
    expect(t[0]!.sub).toBe("Proposed by Dr. A");
    expect(t[3]!.sub).toContain("3 hours");
    expect(t[4]!.title).toContain("1 requests");
  });

  it("says how long in the largest whole unit", () => {
    expect(waitedText(30 * 60_000)).toBe("30 minutes");
    expect(waitedText(90 * 60_000)).toBe("1 hour");
    expect(waitedText(5 * 3_600_000)).toBe("5 hours");
    expect(waitedText(DAY + 1)).toBe("1 day");
    expect(waitedText(3 * DAY)).toBe("3 days");
  });

  it("counts today in Kampala time", () => {
    // 22:30 UTC on 1 Dec is 01:30 on 2 Dec in Kampala.
    const d = kampalaDay(Date.UTC(2026, 11, 1, 22, 30));
    expect(d.from.toISOString()).toBe("2026-12-01T21:00:00.000Z");
    expect(d.to.toISOString()).toBe("2026-12-02T21:00:00.000Z");
  });

  it("keeps every tile neutral: a count is a workflow state", () => {
    const v = read("app/hospital-admin/today/_components/today-view.tsx");
    expect(v).not.toMatch(/"warn"|"no"|cautbg|critical/);
  });
});

describe("Activity", () => {
  it("reads admin actions only, never one about a patient", () => {
    for (const a of [
      "book_appointment",
      "record_observation",
      "administer_medication",
      "open_resus_episode",
      "register_patient",
      "assign_triage",
      "phi_access_break_glass",
      "cross_tenant_read",
    ])
      expect(activityLine(a)).toBeNull();
    expect(activityLine("publish_ward_layout")).toEqual(["hospital", "Published a ward layout"]);
    expect(activityLine("toString")).toBeNull();
  });

  it("names only actions the audit log accepts", () => {
    const sql = read("supabase/migrations/0296_clinics_schedule.sql");
    for (const a of Object.keys(ACTIVITY_ACTIONS)) expect(sql, a).toContain(`'${a}'`);
  });

  it("replaces the Audit placeholder, scoped to the hospital, server-side", () => {
    expect(read("app/hospital-admin/audit/page.tsx")).toContain(
      'permanentRedirect("/hospital-admin/activity")',
    );
    const load = read("lib/hospital-admin/activity-load.ts");
    expect(load).toContain('import "server-only"');
    expect(load).toContain("eq(saAuditLog.targetId, hospitalId)");
    expect(load).toContain("inArray(saAuditLog.action, ACTIVITY_ACTION_KEYS)");
  });
});
