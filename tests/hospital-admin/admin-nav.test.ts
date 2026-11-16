import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import { activeKey, adminNavGroups } from "@/lib/hospital-admin/admin-nav";

/** ADR 0515: one admin menu, the same in the admin frame and the Clinics & schedule rail. */
const read = (rel: string) => readFileSync(resolve(process.cwd(), rel), "utf8");
const keys = (tether: boolean) =>
  adminNavGroups({ tether }).flatMap((g) => g.items.map((i) => i.key));

describe("the admin menu", () => {
  it("has the Hospital and Follow-up groups, in order", () => {
    expect(adminNavGroups({ tether: true }).map((g) => g.label)).toEqual(["Hospital", "Follow-up"]);
    expect(keys(true)).toEqual([
      "departments",
      "emergency",
      "staff",
      "profile",
      "requests",
      "reports",
    ]);
  });

  it("keeps Intake off the Tether domain and on MedSync's (ADR 0500, 0515)", () => {
    expect(keys(true)).not.toContain("intake");
    expect(keys(false)).toContain("intake");
  });

  it("links only to pages that exist, none of them a placeholder", () => {
    for (const it of adminNavGroups({ tether: false }).flatMap((g) => g.items)) {
      expect(it.href.startsWith("/hospital-admin/")).toBe(true);
      expect(existsSync(resolve(process.cwd(), `app${it.href}/page.tsx`)), it.href).toBe(true);
      expect(read(`app${it.href}/page.tsx`)).not.toContain("PlaceholderSurface");
    }
  });

  it("puts counts in words, and none when there are none", () => {
    const g = adminNavGroups({ tether: true, counts: { staffPending: 2, unavailable: 1 } });
    const by = Object.fromEntries(g.flatMap((x) => x.items).map((i) => [i.key, i.badge ?? ""]));
    expect(by.staff).toBe("2 to review");
    expect(by.departments).toBe("1 unavailable");
    const none = adminNavGroups({ tether: true, counts: {} }).flatMap((x) => x.items);
    expect(none.every((i) => !i.badge)).toBe(true);
  });

  it("marks the longest matching item as current", () => {
    const g = adminNavGroups({ tether: true });
    expect(activeKey("/hospital-admin/departments/emergency", g)).toBe("emergency");
    expect(activeKey("/hospital-admin/departments/wards", g)).toBe("departments");
    expect(activeKey("/hospital-admin/departments", g)).toBe("departments");
    expect(activeKey("/hospital-admin/requests", g)).toBe("requests");
    expect(activeKey("/hospital-admin/reportsx", g)).toBeNull();
    expect(activeKey("/hospital-admin/clinics", g)).toBeNull();
  });
});

describe("the frame and the workspace draw the same menu", () => {
  it("the frame steps aside on Clinics & schedule, which draws its own desk", () => {
    const frame = read("components/hospital-admin/admin-frame.tsx");
    expect(frame).toContain('const BARE = "/hospital-admin/clinics"');
    expect(frame).toContain("if (bare) return <>{children}</>;");
  });

  it("both render AdminNavGroups from the shared list", () => {
    expect(read("components/hospital-admin/admin-frame.tsx")).toContain("<AdminNavGroups");
    expect(read("components/clinics-schedule/workspace.tsx")).toContain(
      "<AdminNavGroups groups={groups} />",
    );
    expect(read("app/hospital-admin/clinics/page.tsx")).toContain("adminNavFor(scope.hospitalId)");
    expect(read("app/hospital-admin/layout.tsx")).toContain("adminNavFor(scope.hospitalId)");
  });

  it("the old copy-requests address forwards to Requests", () => {
    expect(read("app/hospital-admin/records-requests/page.tsx")).toContain(
      'permanentRedirect("/hospital-admin/requests?tab=copies")',
    );
  });
});
