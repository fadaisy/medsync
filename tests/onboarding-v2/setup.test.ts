import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { countDone, facilityPointVerdict, neededTasks } from "@/app/admin/setup/_lib/rules";
import { CHECKLIST } from "@/content/onboarding-setup";

/* Setup checklist (§5.10): the non-DB rules behind /admin/setup. */

describe("setup checklist", () => {
  it("D17: needed to go live counts departments+start, backup admin and wards", () => {
    const none = neededTasks({ departments: 0, startChosen: false, backup: false, wards: 0 });
    expect(countDone(none)).toBe(0);
    const noStart = neededTasks({ departments: 3, startChosen: false, backup: true, wards: 2 });
    expect(noStart.departments).toBe(false);
    expect(countDone(noStart)).toBe(2);
    const all = neededTasks({ departments: 1, startChosen: true, backup: true, wards: 1 });
    expect(countDone(all)).toBe(Object.keys(all).length);
  });

  it("a facility point needs ≤ 200 m accuracy and the facility's own district", () => {
    expect(facilityPointVerdict(35, "UG1008", "UG1008")).toBe("ok");
    expect(facilityPointVerdict(200, "UG1008", "UG1008")).toBe("ok");
    expect(facilityPointVerdict(201, "UG1008", "UG1008")).toBe("imprecise");
    expect(facilityPointVerdict(Number.NaN, "UG1008", "UG1008")).toBe("imprecise");
    expect(facilityPointVerdict(20, "UG3001", "UG1008")).toBe("outside");
    expect(facilityPointVerdict(20, null, "UG1008")).toBe("outside");
    expect(facilityPointVerdict(20, "UG1008", null)).toBe("outside");
  });

  it("Law 9 / Q11: no red, no green ticks, no left bars, no email or SMS promise", () => {
    const dir = join(process.cwd(), "app/admin/setup/_components");
    const red = /\b(?:bg|text|border)-(?:red|rose)-\d|#dc2626|variant="(?:emergency|destructive)"/i;
    for (const f of readdirSync(dir)) {
      const src = readFileSync(join(dir, f), "utf8");
      expect(src, f).not.toMatch(red);
      expect(src, f).not.toMatch(/\b(?:text|bg|border)-(?:green|emerald)-\d/);
      expect(src, f).not.toMatch(/border-l-(?:2|4|\[)/);
    }
    const copy = JSON.stringify(CHECKLIST);
    expect(copy).not.toMatch(
      /(we'?ll|we will)\s+(email|text|sms|notif)|emailed|notify you|by email|by sms/i,
    );
  });
});
