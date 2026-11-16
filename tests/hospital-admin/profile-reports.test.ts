import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { PilotHospital, PilotWeek } from "@/lib/hospital-admin/pilot";
import type { HospitalReport } from "@/lib/hospital-admin/reports";
import { describe, expect, it } from "vitest";

import { reportView } from "@/app/hospital-admin/reports/_lib/view";
import {
  PROFILE,
  PROFILE_REPORTS_COPY_STATUS,
  REPORTS,
} from "@/content/hospital-admin/profile-reports";
import { MIN_RATE_SAMPLE, ratio, reportWindow } from "@/lib/hospital-admin/reports";

/**
 * Hospital profile and Reports in the Tether desk (ADR 0520, phase 2). The view lib only formats what the reports
 * lib computed: these pin that the thin-sample rule still prints words, SMS spend is printed once, and the pages
 * keep their actions, their dialogs and the design rules.
 */
const read = (rel: string) =>
  readFileSync(resolve(process.cwd(), rel), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");

const w = reportWindow(28, new Date("2026-09-19T09:00:00Z"));

function report(over: Partial<HospitalReport> = {}): HospitalReport {
  return {
    window: w,
    fillRate: ratio(34, 50, w),
    noShowRate: ratio(3, MIN_RATE_SAMPLE - 1, w),
    unmarked: 2,
    waitAccuracy: ratio(15, 20, w),
    requests: 40,
    waitlistJoined: 5,
    waitlistWaitingNow: 0,
    placesPublished: 60,
    refillVisits: 7,
    prescriptionsWritten: null,
    sms: { messages: 12, cost: 1200, currency: "UGX" },
    perLine: [],
    perSession: [],
    sent: [
      { kind: "reminder", channel: "sms", count: 12, cost: 1200, currency: "UGX" },
      { kind: "reminder", channel: "push", count: 30, cost: 0, currency: null },
    ],
    ...over,
  };
}

const week = (d: string, over: Partial<PilotWeek> = {}): PilotWeek => ({
  week: d,
  booked: { total: 10, web: 4, app: 3, desk: 3, ussd: 0 },
  noShow: 2,
  held: 25,
  unmarked: 1,
  noShowShare: 0.08,
  checkInVsBooked: { median: -5, n: 9 },
  checkInToSeen: { median: 38, n: 8 },
  ...over,
});

describe("Reports: the figures, as the desk prints them", () => {
  it("has the six tiles of the prototype, in its order", () => {
    const v = reportView(report(), undefined, w);
    expect(v.tiles.map((t) => t.key)).toEqual(["fill", "noShow", "seen", "demand", "sent", "sms"]);
    expect(v.tiles.map((t) => t.label)).toEqual([
      "Fill rate",
      "No-shows",
      "Seen near the time given",
      "Demand for each place",
      "Messages sent",
      "SMS spend",
    ]);
  });

  it("prints the same numbers, with their basis", () => {
    const t = Object.fromEntries(reportView(report(), undefined, w).tiles.map((x) => [x.key, x]));
    expect(t.fill!.value).toBe("68%");
    expect(t.fill!.sub).toContain("34 of 50 places");
    expect(t.seen!.value).toBe("75%");
    expect(t.demand!.value).toBe("40 / 60");
    expect(t.sent!.value).toBe("42");
    expect(t.sent!.sub).toBe("12 SMS · 30 push");
    expect(t.sms!.value).toBe("UGX 1200");
  });

  it("a rate under MIN_RATE_SAMPLE says it is too few, never a percentage", () => {
    const t = reportView(report(), undefined, w).tiles.find((x) => x.key === "noShow")!;
    expect(t.value).toBe(REPORTS.tooFew);
    expect(t.wordy).toBe(true);
    expect(t.sub).toContain(`3 of ${MIN_RATE_SAMPLE - 1} held bookings`);
  });

  it("prints SMS spend once: the Sent table has rows by kind and channel and no total", () => {
    const v = reportView(report(), undefined, w);
    expect(v.tiles.filter((t) => t.label === "SMS spend")).toHaveLength(1);
    expect(v.sent.map((r) => [r.kind, r.channel, r.count, r.cost])).toEqual([
      ["Reminders", "SMS", 12, "UGX 1200"],
      ["Reminders", "push", 30, "—"],
    ]);
    expect(Object.keys(v)).not.toContain("smsTotal");
  });

  it("an empty window prints a dash for demand, never a ratio over zero", () => {
    const v = reportView(report({ placesPublished: 0, sent: [] }), undefined, w);
    const t = Object.fromEntries(v.tiles.map((x) => [x.key, x]));
    expect(t.demand!.value).toBe("—");
    expect(t.sent!.sub).toBe(REPORTS.tiles.sentNone);
    expect(v.weeks).toBeNull();
  });

  it("names a flagged line in words and counts it", () => {
    const v = reportView(
      report({
        perLine: [
          {
            serviceLineId: "l1",
            serviceLineName: "Diabetes",
            fillRate: ratio(10, 20, w),
            waitAccuracy: ratio(4, 20, w),
            positionsNotHonoured: true,
          },
        ],
      }),
      undefined,
      w,
    );
    expect(v.lines[0]!.flagged).toBe(true);
    expect(v.linesNote).toMatch(/^1 line is flagged/);
  });

  it("lays the pilot weeks out newest first, with each line under its week", () => {
    const pilot: PilotHospital = {
      hospitalId: "h",
      weeks: [week("2026-09-14"), week("2026-09-07", { noShowShare: null })],
      lines: [
        { lineId: "a", lineName: "Diabetes", weeks: [week("2026-09-14"), week("2026-09-07")] },
        { lineId: null, lineName: null, weeks: [week("2026-09-14"), week("2026-09-07")] },
      ],
    };
    const rows = reportView(report(), pilot, w).weeks!;
    expect(rows.map((r) => [r.label, r.sub])).toEqual([
      ["This week", false],
      ["Diabetes", true],
      ["Not on a clinic day", true],
      ["7 Sept", false],
      ["Diabetes", true],
      ["Not on a clinic day", true],
    ]);
    expect(rows[0]!.noShows).toEqual({ value: "2 of 25", basis: "8% · 1 unmarked" });
    expect(rows[3]!.noShows.basis).toBe("too few for a % · 1 unmarked");
    expect(rows[0]!.vsGiven.value).toBe("5 min before");
    expect(rows[0]!.seen).toEqual({ value: "38 min", basis: "median of 8 seen" });
  });

  it("keeps the window in the URL and uses no colour for a figure", () => {
    const view = read("app/hospital-admin/reports/_components/reports-view.tsx");
    expect(view).toContain("router.push(`${PATH}?days=${d}`");
    expect(view).not.toMatch(/\bwarn\b|status-critical|text-destructive|\bred\b/);
    expect(view).toContain('k("su-st", "setup")');
  });
});

describe("Hospital profile in the desk", () => {
  const view = read("app/hospital-admin/profile/_components/profile-view.tsx");
  const outbreak = read("app/hospital-admin/profile/_components/outbreak-card.tsx");
  const emergency = read("app/hospital-admin/profile/_components/emergency-card.tsx");

  it("keeps both actions, unchanged in what they send", () => {
    expect(outbreak).toContain("setOutbreakModeAction(");
    expect(outbreak).toContain('name="on" value={on ? "false" : "true"}');
    expect(outbreak).toContain('name="reason"');
    expect(emergency).toContain("setEmergencySettingsAction(");
  });

  it("asks for the outbreak reason in a centred desk dialog", () => {
    expect(outbreak).toContain("<DeskDialog");
    expect(outbreak).toContain("text.trim().length < 8");
    expect(emergency).toContain("<DeskDialog");
  });

  it("links Admins under People and has no designation", () => {
    expect(view).toContain('href="/hospital-admin/staff?tab=admins"');
    expect(view).not.toMatch(/designation/i);
    expect(PROFILE.identity.admins).toBe("Admins are under People");
  });

  it("draws no red: settings, not an emergency", () => {
    for (const src of [view, outbreak, emergency])
      expect(src).not.toMatch(/\bred\b|status-critical|text-destructive|"r"\)/);
  });

  it("marks its wording a draft", () => {
    expect(PROFILE_REPORTS_COPY_STATUS.status).toBe("draft");
  });
});
