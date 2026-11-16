import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * The host is on Vercel Hobby, which refuses the whole deploy when any cron runs more than once a day
 * (16 Nov 2026: `*∕15` on dispatch-reminders failed every production deploy). Once the account is on Pro
 * (docs/booking-pilot/GO-LIVE.md), change this test with the schedule.
 */
const crons =
  (
    JSON.parse(readFileSync(join(process.cwd(), "vercel.json"), "utf8")) as {
      crons?: { path: string; schedule: string }[];
    }
  ).crons ?? [];

describe("vercel.json crons fit the Hobby plan", () => {
  it.each(crons.map((c) => [c.path, c.schedule] as const))(
    "%s (%s) fires at most once a day",
    (_path, schedule) => {
      const [minute, hour] = schedule.trim().split(/\s+/);
      expect(minute).toMatch(/^\d{1,2}$/);
      expect(hour).toMatch(/^\d{1,2}$/);
    },
  );
});
