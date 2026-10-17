import type { DispatchRow } from "@/data/notifications";

import { groupOf, notifFromDose, notifsFromDispatches, targetOf } from "@/data/notifications";

jest.mock("@/lib/supabase", () => ({ supabase: { auth: {}, from: jest.fn() } }));

const now = new Date("2026-10-17T09:00:00Z"); // 12:00 in Kampala

const row = (over: Partial<DispatchRow> = {}): DispatchRow => ({
  id: "d1",
  kind: "booking_receipt",
  related_kind: "appointment",
  related_id: "a1",
  payload: {},
  scheduled_at: "2026-10-17T06:00:00Z",
  acknowledged_at: null,
  hospitals: { name: "Lane Hospital" },
  ...over,
});

describe("notifsFromDispatches", () => {
  it("words a kind with the web's push title and opens its appointment", () => {
    const [n] = notifsFromDispatches([row()], now);
    expect(n).toMatchObject({
      title: "Your visit is booked",
      line: "Lane Hospital · Open it to see the day and your code.",
      type: "visit",
      group: "today",
      unread: true,
      href: { pathname: "/visits/[id]", params: { id: "a1" } },
    });
    expect(n.action).toBeUndefined();
  });

  it("makes a push and its SMS one item, read once either is acknowledged", () => {
    const items = notifsFromDispatches(
      [row(), row({ id: "d2", acknowledged_at: "2026-10-17T06:01:00Z" })],
      now,
    );
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ dispatchIds: ["d1", "d2"], unread: false });
  });

  it("says the delay for a moved window and offers the visit", () => {
    const [n] = notifsFromDispatches(
      [row({ kind: "window_shifted", payload: { delay_minutes: 30 }, hospitals: null })],
      now,
    );
    expect(n.line).toBe("The clinic is running 30 minutes late. Open it to see the new window.");
    expect(n.action).toMatchObject({ kind: "link", label: "Open visit" });
  });

  it("falls back to plain words for a kind it does not know", () => {
    const [n] = notifsFromDispatches(
      [row({ kind: "deterioration_flag", related_kind: "intake", hospitals: null })],
      now,
    );
    expect(n).toMatchObject({ title: "An update about your visit", type: "care", href: undefined });
  });
});

describe("targetOf", () => {
  it.each([
    [{ kind: "waitlist_offer", related_kind: "waitlist_entry", related_id: "w" }, "/visits"],
    [{ kind: "session_cancelled", related_kind: "clinic_session", related_id: "s" }, "/visits"],
    [{ kind: "unconfirmed_release", related_kind: "appointment", related_id: "a" }, "/book"],
    [{ kind: "sms_reply", related_kind: "inbound_sms", related_id: "i" }, undefined],
  ])("%o goes to %s", (r, href) => {
    expect(targetOf(r)).toEqual(href);
  });
});

describe("groupOf", () => {
  it("uses the clinic's calendar", () => {
    expect(groupOf("2026-10-16T22:30:00Z", now)).toBe("today"); // 01:30 on the 17th in Kampala
    expect(groupOf("2026-10-16T08:00:00Z", now)).toBe("yesterday");
    expect(groupOf("2026-10-10T08:00:00Z", now)).toBe("earlier");
  });
});

describe("notifFromDose", () => {
  it("is a medicine row with I took it, unread until taken, and no amount", () => {
    const n = notifFromDose({
      id: "x",
      slot: "midday",
      time: "13:00",
      medicine: "[Medicine B]",
      instruction: "As your clinician prescribed",
      takenAt: null,
      snoozedUntil: null,
      scheduledForIso: "2026-10-17T10:00:00Z",
    });
    expect(n).toMatchObject({
      title: "Midday medicine is due",
      line: "[Medicine B] · 13:00",
      type: "med",
      unread: true,
      action: { kind: "takeDose", doseId: "x" },
    });
  });
});
