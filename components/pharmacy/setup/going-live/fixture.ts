import type { ItemKey } from "@/content/pharmacy-setup";
import type { GoLiveItem, GoLiveView } from "@/lib/pharmacy/setup/types";

import { CHECKLIST } from "@/content/pharmacy-setup";

/**
 * Synthetic data for a dev page of Set-up › Going live. Made-up names, no real people, no numbers to call. Covers
 * done items, automatic items part-way, an overdue blocker, a blocker due after the go-live date, one signature in
 * and a few events.
 */
const AUTO: Partial<Record<ItemKey, [number, number]>> = {
  mfa: [9, 14],
  places: [6, 6],
  levels: [44, 47],
  prices: [41, 47],
  opening: [3, 6],
  sensor: [2, 3],
  roster: [0, 2],
  lic: [5, 6],
  train: [7, 12],
  rules: [8, 10],
};
const DUE: Partial<Record<ItemKey, string>> = {
  q1: "2026-11-06",
  q24: "2026-11-06",
  wit: "2026-11-02",
  mfa: "2026-11-10",
  levels: "2026-11-10",
  opening: "2026-11-18",
  roster: "2026-11-12",
  train: "2026-11-13",
  hmis: "2026-11-13",
};
const DONE: Partial<Record<ItemKey, [string, string]>> = {
  dev: ["Support engineer A", "2026-10-28T13:02:00.000Z"],
  demo: ["Support engineer A", "2026-10-28T13:05:00.000Z"],
  supp: ["In-charge A", "2026-10-30T08:20:00.000Z"],
};

export function goLiveFixture(): GoLiveView {
  const items: GoLiveItem[] = CHECKLIST.map((c) => {
    const d = DONE[c.key];
    const q24 = c.key === "q24";
    return {
      key: c.key,
      status: d || q24 ? "done" : "todo",
      answer: q24 ? "Electronic and paper side by side. Ward registers kept for 2 years." : null,
      choice: q24 ? "Electronic and paper side by side" : null,
      decidedBy: q24 ? "Superintendent B" : null,
      doneByName: d?.[0] ?? (q24 ? "Superintendent B" : null),
      doneAt: d?.[1] ?? (q24 ? "2026-11-02T09:40:00.000Z" : null),
      owner: c.owner,
      dueOn: DUE[c.key] ?? null,
      prog: c.kind === "auto" ? (AUTO[c.key] ?? [0, 1]) : null,
    };
  });
  return {
    today: "2026-11-03",
    phase: "setup",
    target: "2026-11-16",
    liveAt: null,
    retiredAt: null,
    practice: { open: false, trainedMe: false },
    items,
    signatures: [{ role: "in_charge", byName: "In-charge A", at: "2026-11-03T07:15:00.000Z" }],
    events: [
      {
        at: "2026-11-03T07:15:00.000Z",
        who: "In-charge A",
        kind: "sign",
        item: null,
        detail: "in_charge",
      },
      {
        at: "2026-11-02T09:40:00.000Z",
        who: "Superintendent B",
        kind: "answer",
        item: "q24",
        detail: "Superintendent B",
      },
      {
        at: "2026-11-01T12:00:00.000Z",
        who: "In-charge A",
        kind: "owner",
        item: "opening",
        detail: "Store keeper · 2026-11-18",
      },
      {
        at: "2026-10-31T06:30:00.000Z",
        who: "In-charge A",
        kind: "target",
        item: null,
        detail: "2026-11-16",
      },
      {
        at: "2026-10-30T08:20:00.000Z",
        who: "In-charge A",
        kind: "mark",
        item: "supp",
        detail: null,
      },
      {
        at: "2026-10-28T13:05:00.000Z",
        who: "Support engineer A",
        kind: "mark",
        item: "demo",
        detail: null,
      },
      {
        at: "2026-10-28T13:02:00.000Z",
        who: "Support engineer A",
        kind: "mark",
        item: "dev",
        detail: null,
      },
    ],
    can: { manage: true, answer: true, signInCharge: false, signMs: false },
  };
}
