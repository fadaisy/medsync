import type { ReportRow } from "@/lib/lab/report-store";
import type { WorklistRow } from "@/lib/lab/worklist";
import { describe, expect, it } from "vitest";

import { figuresFor, localDayStart, median, todaySnapshot, worstQc } from "@/lib/lab/today";

/**
 * S7–S11 on a fixture day, counted by hand. Kampala is UTC+3: 12:13 local is 09:13Z. Two sections, H
 * (haematology) and C (chemistry), plus one row with no section. Targets: FBC 60 min, CREA 90 min, ESR none.
 */
const TZ = "Africa/Kampala";
const NOW = new Date("2026-10-19T09:13:00Z"); // Mon 19 Oct, 12:13 local
const at = (local: string, day = "2026-10-19") => new Date(`${day}T${local}:00+03:00`);

let n = 0;
const row = (p: Partial<ReportRow> & Pick<ReportRow, "kind">): ReportRow => ({
  ref: `r${++n}`,
  orderId: null,
  patientUserId: null,
  restricted: false,
  deviceId: null,
  sectionId: null,
  wardId: null,
  priority: null,
  testCode: null,
  at: null,
  receivedAt: null,
  dueAt: null,
  doneAt: null,
  flag: false,
  bedside: false,
  reason: null,
  label: null,
  ...p,
});

const today: ReportRow[] = [
  // Received: 6 specimens (H 3, C 2, none 1); 1 rejected (C, haemolysed).
  row({ kind: "specimen", sectionId: "H", at: at("07:10") }),
  row({ kind: "specimen", sectionId: "H", at: at("08:05") }),
  row({ kind: "specimen", sectionId: "H", at: at("10:20") }),
  row({ kind: "specimen", sectionId: "C", at: at("08:40") }),
  row({ kind: "specimen", sectionId: "C", at: at("09:15"), flag: true, reason: "haemolysed" }),
  row({ kind: "specimen", sectionId: null, at: at("11:50") }),
  // Released: 4 in-house (tat 50 FBC, 70 FBC late, 100 CREA late, 20 ESR no stated time) + 1 bedside (excluded).
  row({
    kind: "released",
    sectionId: "H",
    testCode: "FBC",
    receivedAt: at("07:10"),
    at: at("08:00"),
  }),
  row({
    kind: "released",
    sectionId: "H",
    testCode: "FBC",
    receivedAt: at("08:05"),
    at: at("09:15"),
  }),
  row({
    kind: "released",
    sectionId: "C",
    testCode: "CREA",
    receivedAt: at("08:40"),
    at: at("10:20"),
  }),
  row({
    kind: "released",
    sectionId: "H",
    testCode: "ESR",
    receivedAt: at("10:20"),
    at: at("10:40"),
  }),
  row({
    kind: "released",
    sectionId: "H",
    testCode: "GLU",
    bedside: true,
    receivedAt: at("09:00"),
    at: at("09:05"),
  }),
  // Criticals: 2 sent, 1 acknowledged after 6 min.
  row({ kind: "critical", sectionId: "C", at: at("10:21"), doneAt: at("10:27") }),
  row({ kind: "critical", sectionId: "C", at: at("11:00") }),
];
// A week earlier, before 12:13: 4 received, 2 released (tat 40 and 60). After 12:13 (must not count): 1 more.
const lastWeek: ReportRow[] = [
  ...[7, 8, 9, 10].map((h) =>
    row({
      kind: "specimen",
      sectionId: "H",
      at: at(`${String(h).padStart(2, "0")}:00`, "2026-10-12"),
    }),
  ),
  row({
    kind: "released",
    sectionId: "H",
    testCode: "FBC",
    receivedAt: at("07:00", "2026-10-12"),
    at: at("07:40", "2026-10-12"),
  }),
  row({
    kind: "released",
    sectionId: "H",
    testCode: "FBC",
    receivedAt: at("08:00", "2026-10-12"),
    at: at("09:00", "2026-10-12"),
  }),
  row({ kind: "specimen", sectionId: "H", at: at("13:00", "2026-10-12") }),
];
const targets = { FBC: 60, CREA: 90 };
const clock = (lateBy: number | null, elapsed = 30) => ({
  kind: "running" as const,
  elapsed,
  target: null,
  lateBy,
});
const worklist = [
  {
    stage: "to_receive",
    sectionId: "H",
    clock: { kind: "not_received" as const, sinceCollection: 72 },
  },
  { stage: "to_result", sectionId: "H", clock: clock(5, 65) },
  { stage: "to_result", sectionId: "C", clock: clock(null, 20) },
  { stage: "preliminary", sectionId: null, clock: clock(null, 10) },
] as unknown as Pick<WorklistRow, "stage" | "clock" | "sectionId">[];
const sections = [
  { id: "H", name: "Haematology" },
  { id: "C", name: "Chemistry" },
];
const base = {
  now: NOW,
  timeZone: TZ,
  period: "today" as const,
  section: null,
  rows: [...today, ...lastWeek],
  targets,
  worklist,
  outAtPartners: 3,
  sections,
  qc: [
    { sectionId: "H", status: "passed" as const },
    { sectionId: "C", status: "warning" as const },
    { sectionId: "C", status: "failed" as const },
  ],
};

describe("Today (S7–S11)", () => {
  it("S7: every figure equals the hand count", () => {
    const s = todaySnapshot(base);
    expect(s.figures).toEqual({
      received: 6,
      released: 4,
      tatMedian: 50, // 20, 50, 70, 100 → nearest-rank median 50
      late: 2, // FBC 70 > 60, CREA 100 > 90
      withStated: 3, // ESR has none
      criticals: 2,
      criticalsAcked: 1,
      ackMedian: 6,
      rejected: 1,
      topReason: "haemolysed",
    });
    expect(s.hero).toMatchObject({
      inLab: 4,
      toReceive: 1,
      toResult: 2,
      preliminary: 1,
      outAtPartners: 3,
      oldestMinutes: 72,
      lateNow: 1,
    });
    expect(s.histogram).toEqual([0, 1, 0, 1, 1, 1, 0, 0]); // 20 · 50 · 70 · 100
    expect(s.bedsideExcluded).toBe(1);
  });

  it("compares with the same weekday at the same clock time", () => {
    const s = todaySnapshot(base);
    expect(s.before).toMatchObject({ received: 4, released: 2, tatMedian: 40 });
    expect(s.spark!.received).toEqual([null, null, null, null, null, 4, 6]);
  });

  it("S8: section totals equal the hero and the key figures", () => {
    const s = todaySnapshot(base);
    const sum = (k: "inLab" | "released" | "lateNow" | "past" | "rejected") =>
      s.sections.reduce((a, l) => a + l[k], 0);
    expect(s.sections.map((l) => l.sectionId)).toEqual(["H", "C", null]);
    expect(sum("inLab")).toBe(s.hero.inLab);
    expect(sum("lateNow")).toBe(s.hero.lateNow);
    expect(sum("released")).toBe(s.figures.released);
    expect(sum("past")).toBe(s.figures.late);
    expect(sum("rejected")).toBe(s.figures.rejected);
    expect(s.totals).toMatchObject({
      inLab: 4,
      released: 4,
      past: 2,
      rejected: 1,
      tatMedian: 50,
      qc: "failed",
    });
    expect(s.sections.find((l) => l.sectionId === "C")!.qc).toBe("failed");
  });

  it("S9: no earlier data is null, never 0", () => {
    const s = todaySnapshot({ ...base, rows: today });
    expect(s.before).toBeNull();
    expect(s.spark!.received.slice(0, 6)).toEqual([null, null, null, null, null, null]);
    expect(figuresFor([], targets, NOW, NOW, null).tatMedian).toBeNull();
  });

  it("S10: a test without a stated time is never late", () => {
    const only = [
      row({ kind: "released", testCode: "ESR", receivedAt: at("07:00"), at: at("11:00") }),
    ];
    const f = figuresFor(only, targets, localDayStart(NOW, TZ), NOW, null);
    expect(f).toMatchObject({ released: 1, late: 0, withStated: 0, tatMedian: 240 });
  });

  it("S11: the pace line switches between its two strings", () => {
    // Hours 07–11 complete; the 09:15 rejected specimen arrived, so it counts as received at 09.
    const s = todaySnapshot(base);
    expect(s.hours.map((h) => [h.hour, h.received, h.released])).toEqual([
      [7, 1, 0],
      [8, 2, 1],
      [9, 1, 1],
      [10, 1, 2],
      [11, 1, 0],
      [12, 0, 0],
    ]);
    expect(s.hours.at(-1)!.partial).toBe(true);
    // 11:00 received 1, released 0 → growing; the growing run starts at 11:00.
    expect(s.hero.pace).toEqual({ kind: "growing", since: at("11:00") });
    const keeping = todaySnapshot({
      ...base,
      rows: [
        ...today,
        row({
          kind: "released",
          sectionId: "H",
          testCode: "ESR",
          receivedAt: at("11:05"),
          at: at("11:30"),
        }),
      ],
    });
    // 10:00 (1 vs 2) and 11:00 (1 vs 1) keep pace; the run starts at 09:00 (1 vs 1).
    expect(keeping.hero.pace).toEqual({ kind: "keeping", since: at("09:00") });
  });

  it("helpers", () => {
    expect(median([5, 1, 3])).toBe(3);
    expect(worstQc(["passed", "warning"])).toBe("warning");
    expect(worstQc([])).toBeNull();
    expect(localDayStart(NOW, TZ).toISOString()).toBe("2026-10-18T21:00:00.000Z");
  });
});
