import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { CalendarEvent } from "@/components/scheduling/calendar/types";
import { describe, expect, it } from "vitest";

import {
  AVAILABILITY_CARD_CLASSES,
  AVAILABILITY_KIND_LABEL,
  AVAILABILITY_KIND_TONES,
  cardRows,
  describeEvent,
  eventMatches,
} from "@/components/scheduling/calendar/helpers";
import { AVAILABILITY_KINDS } from "@/db/schema/scheduling";

/**
 * The calendar's three surfaces (timeline cards, month pills, agenda rows)
 * all describe an event through one helper; a kind the helper does not
 * know would render as an unlabelled tint — colour alone, which the
 * design system forbids.
 */
const CAL = resolve(process.cwd(), "components/scheduling/calendar");
const read = (f: string) => readFileSync(resolve(CAL, f), "utf8");

const session: CalendarEvent = {
  id: "s-1",
  kind: "session",
  startsAtIso: "2026-09-22T05:00:00.000Z",
  endsAtIso: "2026-09-22T09:00:00.000Z",
  serviceLineName: "Diabetes clinic",
  venue: "Clinic 4",
  bookedCount: 12,
  capacity: 20,
  status: "published",
  delayMinutes: 0,
};

const appointment: CalendarEvent = {
  id: "a-1",
  kind: "appointment",
  startsAtIso: "2026-09-22T07:00:00.000Z",
  endsAtIso: "2026-09-22T07:30:00.000Z",
  status: "confirmed",
  priority: "routine",
  type: "in_person",
  reason: "follow_up",
  reasonNote: null,
  patientName: "Amina Okello",
  patientCode: "MRN-2026-00012",
  clinicianName: null,
  departmentName: null,
};

describe("clinic days on the calendar", () => {
  it("every view describes its events through the one helper", () => {
    for (const f of ["event-card.tsx", "month-view.tsx", "agenda-view.tsx"]) {
      expect(read(f), f).toContain("describeEvent(");
    }
    // Week and day are the time grid, which renders the card.
    expect(read("time-grid.tsx")).toContain("EventCard");
    expect(read("week-view.tsx")).toContain("TimeGrid");
    expect(read("day-view.tsx")).toContain("TimeGrid");
  });

  it("a session reads as a clinic day with its places", () => {
    const d = describeEvent(session);
    expect(d.kindLabel).toBe("Clinic day");
    expect(d.title).toBe("Diabetes clinic");
    expect(d.subtitle).toBe("12 of 20 places");
    expect(d.monogram).toBe("12");
    expect(d.clickable).toBe(true);
  });

  it("a cancelled session carries the word, not just a muted tint", () => {
    const d = describeEvent({ ...session, status: "cancelled" });
    expect(d.statusWord).toBe("Cancelled");
    expect(d.struck).toBe(true);
  });

  it("the agenda no longer drops everything but appointments", () => {
    expect(read("agenda-view.tsx")).not.toMatch(/kind === "appointment"\)/);
  });
});

describe("the label pill", () => {
  it("has a word for every availability kind the schema allows", () => {
    for (const kind of AVAILABILITY_KINDS) {
      expect(AVAILABILITY_KIND_LABEL[kind], kind).toBeTruthy();
      const d = describeEvent({
        id: `b-${kind}`,
        kind: "availability",
        startsAtIso: session.startsAtIso,
        endsAtIso: session.endsAtIso,
        availabilityKind: kind,
        recurrence: "none",
        location: null,
        label: null,
      });
      expect(d.kindLabel).toBe(AVAILABILITY_KIND_LABEL[kind]);
      expect(d.clickable).toBe(false);
      // ADR 0095: every kind has its own tint, and none of them is red.
      expect(AVAILABILITY_KIND_TONES[kind], kind).toBeTruthy();
      expect(AVAILABILITY_KIND_TONES[kind], kind).not.toBe("critical");
      expect(d.pillTone).toBe(AVAILABILITY_KIND_TONES[kind]);
      expect(AVAILABILITY_CARD_CLASSES[kind], kind).toBeTruthy();
      expect(d.cardClasses).toBe(AVAILABILITY_CARD_CLASSES[kind]);
    }
  });

  it("a custom block is titled by its own name, with the kind on the pill", () => {
    const d = describeEvent({
      id: "b-custom",
      kind: "availability",
      startsAtIso: session.startsAtIso,
      endsAtIso: session.endsAtIso,
      availabilityKind: "custom",
      recurrence: "none",
      location: null,
      label: "Kiruddu clinic",
    });
    expect(d.title).toBe("Kiruddu clinic");
    expect(d.kindLabel).toBe("Custom");
  });

  it("names the kind of an appointment and keeps 'Urgent' in the word", () => {
    expect(describeEvent(appointment).kindLabel).toBe("Appointment");
    expect(describeEvent({ ...appointment, type: "virtual" }).kindLabel).toBe("Video visit");
    const urgent = describeEvent({ ...appointment, priority: "urgent" });
    expect(urgent.kindLabel).toMatch(/^Urgent /);
    expect(urgent.urgent).toBe(true);
    expect(describeEvent(appointment).statusWord).toBe("Confirmed");
  });
});

describe("the time gutter", () => {
  it("never prints a GMT+N zone name", () => {
    for (const f of ["time-grid.tsx", "calendar.tsx", "helpers.ts"]) {
      const src = read(f);
      expect(src, f).not.toMatch(/GMT\+/);
      expect(src, f).not.toContain("timeZoneName");
    }
    expect(read("calendar.tsx")).toContain('timeZoneLabel = "EAT"');
  });
});

describe("cardRows", () => {
  it("collapses to the title alone under 28px", () => {
    expect(cardRows(20)).toEqual({
      pill: false,
      title: true,
      time: false,
      subtitle: false,
      footer: false,
    });
  });

  it("shows pill + title under 56px", () => {
    expect(cardRows(32)).toMatchObject({ pill: true, time: false, subtitle: false });
  });

  it("adds the time line at an hour, the subtitle past 80px, the footer past 112px", () => {
    expect(cardRows(64)).toMatchObject({ pill: true, time: true, subtitle: false, footer: false });
    expect(cardRows(96)).toMatchObject({ time: true, subtitle: true, footer: false });
    expect(cardRows(128)).toMatchObject({ pill: true, time: true, subtitle: true, footer: true });
  });
});

describe("search", () => {
  it("matches on patient name, code and title, case-insensitively", () => {
    expect(eventMatches(appointment, "amina")).toBe(true);
    expect(eventMatches(appointment, "00012")).toBe(true);
    expect(eventMatches(session, "diabetes")).toBe(true);
    expect(eventMatches(session, "amina")).toBe(false);
    expect(eventMatches(session, "   ")).toBe(true);
  });
});
