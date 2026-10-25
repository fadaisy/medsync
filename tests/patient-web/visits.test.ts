import { act, createElement as h } from "react";
import { createRoot } from "react-dom/client";
import {
  directionsUrl,
  monthGrid,
  nextVisit,
  onCalendar,
  reasonTooShort,
  visitControls,
} from "@patient-core/visits-calendar";
import { JSDOM } from "jsdom";
import { describe, expect, it } from "vitest";

import { VisitTicket } from "@/components/tide/visits-ticket";
import { VISITS_COPY } from "@/content/patient/visits";

/** Step 4, Visits and One visit (PROMPT-PATIENT-WEB-TIDE S13, S14). */

const base = {
  status: "confirmed",
  startsAtIso: "2026-10-27T07:00:00Z",
  type: "in_person",
  forMember: null,
  sessionId: null,
  confirmedByPatientAtIso: null,
};
const now = new Date("2026-10-25T09:00:00Z");

describe("S13: the 8-character reason and what leaves the calendar", () => {
  it("refuses a reason under 8 characters, trimmed, and says why", () => {
    expect(reasonTooShort("")).toBe(true);
    expect(reasonTooShort("too far")).toBe(true);
    expect(reasonTooShort("   1234567   ")).toBe(true);
    expect(reasonTooShort("I cannot travel")).toBe(false);
    expect(VISITS_COPY.reasonShort(8)).toBe("Say a little more about why — at least 8 characters.");
  });

  it("cancelled, declined, missed and rescheduled visits leave the calendar", () => {
    for (const s of ["cancelled", "declined", "no_show", "rescheduled"])
      expect(onCalendar(s)).toBe(false);
    for (const s of ["requested", "pending_approval", "confirmed", "arrived", "completed"])
      expect(onCalendar(s)).toBe(true);
  });

  it("the next visit skips what left the calendar and what is done", () => {
    const rows = [
      { id: "a", status: "cancelled", startsAtIso: "2026-10-26T07:00:00Z" },
      { id: "b", status: "completed", startsAtIso: "2026-10-26T08:00:00Z" },
      { id: "c", status: "confirmed", startsAtIso: "2026-10-29T07:00:00Z" },
      { id: "d", status: "requested", startsAtIso: "2026-10-28T07:00:00Z" },
    ];
    expect(nextVisit(rows)?.id).toBe("d");
    expect(nextVisit([rows[0]!])).toBeNull();
  });

  it("move and cancel follow the server's sets; a member's visit offers nothing", () => {
    expect(visitControls(base, now)).toMatchObject({ canMove: true, canCancel: true });
    expect(visitControls({ ...base, status: "arrived" }, now)).toMatchObject({
      canMove: false,
      canCancel: true,
    });
    expect(visitControls({ ...base, sessionId: "s" }, now).canMove).toBe(false);
    expect(visitControls({ ...base, status: "cancelled" }, now)).toMatchObject({
      canMove: false,
      canCancel: false,
    });
    expect(visitControls({ ...base, forMember: "Mum" }, now)).toMatchObject({
      mine: false,
      canMove: false,
      canCancel: false,
      arrivable: false,
      confirmable: false,
    });
  });

  it("I'm coming inside the last day, I'm here on the day", () => {
    const tomorrow = { ...base, startsAtIso: "2026-10-26T06:00:00Z" };
    expect(visitControls(tomorrow, now)).toMatchObject({ confirmable: true, arrivable: false });
    expect(visitControls({ ...tomorrow, confirmedByPatientAtIso: "x" }, now).confirmable).toBe(
      false,
    );
    const today = { ...base, startsAtIso: "2026-10-25T12:00:00Z" };
    expect(visitControls(today, now)).toMatchObject({ arrivable: true, confirmable: false });
  });

  it("the month grid is whole Monday-first weeks", () => {
    const g = monthGrid("2026-10-01");
    expect(g.length % 7).toBe(0);
    expect(g.slice(0, 3)).toEqual([null, null, null]); // 1 October 2026 is a Thursday
    expect(g[3]).toBe("2026-10-01");
  });

  it("directions carry coordinates only, and nothing without a pin (W4)", () => {
    expect(directionsUrl({ lat: 0.34, lng: 32.58 })).toBe(
      "https://www.google.com/maps/dir/?api=1&destination=0.34%2C32.58",
    );
    expect(directionsUrl(null)).toBeNull();
  });
});

describe("S14: the ticket turns over", () => {
  const props = {
    hospitalName: "[Hospital]",
    day: "27",
    dayLine: "TUE · OCT",
    sessionLine: "10:00",
    slot: true,
    status: "Confirmed",
    details: [{ label: "Clinic", value: "[Clinic]" }],
    fee: 0,
    code: "AB12CD",
  };

  function mount() {
    const dom = new JSDOM("<!doctype html><body><div id=r></div></body>");
    const g = globalThis as Record<string, unknown>;
    g.window = dom.window;
    g.document = dom.window.document;
    g.IS_REACT_ACT_ENVIRONMENT = true;
    const host = dom.window.document.getElementById("r")!;
    const root = createRoot(host);
    act(() => root.render(h(VisitTicket, props)));
    return { host, root };
  }

  it("is one real button that turns by click (so Enter and Space, natively), and says which face", () => {
    const { host, root } = mount();
    const button = host.querySelector("button")!;
    expect(button.getAttribute("type")).toBe("button");
    expect(button.getAttribute("aria-pressed")).toBe("false");
    expect(button.getAttribute("aria-label")).toContain("Code A B 1 2 C D");
    const [front, back] = [...button.querySelectorAll("[data-ticket-turn] > span")];
    expect(front!.getAttribute("aria-hidden")).toBe("false");
    expect(back!.getAttribute("aria-hidden")).toBe("true");

    act(() => button.click());
    expect(button.getAttribute("aria-pressed")).toBe("true");
    expect(front!.getAttribute("aria-hidden")).toBe("true");
    expect(back!.getAttribute("aria-hidden")).toBe("false");
    expect(host.textContent).toContain(VISITS_COPY.ticket.tapBack);
    act(() => root.unmount());
  });

  it("with reduced motion it swaps faces without the turn", () => {
    const { host, root } = mount();
    const button = host.querySelector("button")!;
    act(() => button.click());
    const turn = host.querySelector("[data-ticket-turn]")!;
    expect(turn.className).toContain("motion-reduce:transition-none");
    expect(turn.className).toContain("motion-reduce:rotate-y-0");
    const [front] = [...turn.querySelectorAll(":scope > span")];
    expect(front!.className).toContain("motion-reduce:invisible");
    expect(turn.className).toMatch(/duration-400/);
    act(() => root.unmount());
  });

  it("shows the payment strip only when the fee is known, and no place number", () => {
    const { host, root } = mount();
    expect(host.textContent).toContain(VISITS_COPY.ticket.freeTitle);
    expect(host.textContent).not.toMatch(/position|ahead of you/i);
    act(() => root.unmount());
  });
});
