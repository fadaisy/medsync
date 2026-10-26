import { KIND_WORDS } from "@patient-core/notifications";
import { describe, expect, it } from "vitest";

import { groupDispatches, webHref } from "@/lib/patient-web/notification-items";

const NOW = new Date("2026-10-25T09:00:00Z"); // 12:00 in Kampala
const row = (over: Partial<Parameters<typeof groupDispatches>[0][number]> = {}) => ({
  id: crypto.randomUUID(),
  kind: "reminder",
  relatedKind: "appointment",
  relatedId: "00000000-0000-4000-8000-000000000001",
  payload: {},
  scheduledAt: new Date("2026-10-25T06:00:00Z"),
  acknowledgedAt: null,
  hospital: null,
  ...over,
});

describe("S8 notifications", () => {
  it("every kind has a title, and every action has a web page", () => {
    for (const [kind, w] of Object.entries(KIND_WORDS)) {
      const [n] = groupDispatches([row({ kind })], NOW);
      expect(n!.title).toBe(w.title);
      if (n!.act) expect(n!.href).toMatch(/^\/patient\//);
    }
  });

  it("maps every target key to a web route", () => {
    expect(webHref({ key: "visit", id: "x" })).toBe("/patient/visits/x");
    expect(webHref({ key: "visits" })).toBe("/patient/visits");
    expect(webHref({ key: "book" })).toBe("/patient/book");
    expect(webHref({ key: "ticket" })).toBe("/patient/book/today");
    expect(webHref(undefined)).toBeUndefined();
  });

  it("a push and its SMS are one item, read once either is acknowledged", () => {
    const a = row();
    const b = row({ scheduledAt: new Date("2026-10-25T06:30:00Z") });
    expect(groupDispatches([a, b], NOW)).toHaveLength(1);
    expect(groupDispatches([a, b], NOW)[0]!.unread).toBe(true);
    expect(groupDispatches([a, { ...b, acknowledgedAt: NOW }], NOW)[0]!.unread).toBe(false);
  });

  it("groups by the Kampala day and words the delay", () => {
    const [y] = groupDispatches([row({ scheduledAt: new Date("2026-10-24T08:00:00Z") })], NOW);
    expect(y!.group).toBe("yesterday");
    const [w] = groupDispatches(
      [row({ kind: "window_shifted", payload: { delay_minutes: 20 } })],
      NOW,
    );
    expect(w!.line).toBe("The clinic is running 20 minutes late. Open it to see the new window.");
    expect(w!.time).toBe("9:00 AM");
  });
});
