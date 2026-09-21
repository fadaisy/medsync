import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { ClinicianOption, LineOption, SessionOption } from "@/app/patient/book/_lib/booking";
import { describe, expect, it } from "vitest";

import {
  accessAlternatives,
  INTERSTITIAL,
  parseDraft,
  REASONS,
  splitDays,
  splitSessions,
} from "@/app/patient/book/_lib/booking";
import { formatArrivalWindow, formatFullDate, formatTime } from "@/lib/patient/booking-format";
import { PATIENT_REASON_CODES } from "@/supabase/functions/_shared/sessions-sql";

/**
 * The web wizard's pure parts (Gate C, ADR 0088). Every instant is an
 * explicit UTC ISO string and every expectation a Kampala (UTC+3) reading,
 * so a host clock or zone that leaked into the derivation fails here rather
 * than on a patient's phone.
 */

/** 2026-09-15T05:00Z = 08:00 EAT, Tuesday. */
const NOW_MS = Date.UTC(2026, 8, 15, 5, 0, 0);
const DAY = 86_400_000;

function clinician(userId: string, days: number[], seenBefore = false): ClinicianOption {
  const slotsByDate: ClinicianOption["slotsByDate"] = {};
  for (const d of days) {
    const startsAt = new Date(NOW_MS + d * DAY);
    const key = startsAt.toISOString().slice(0, 10);
    slotsByDate[key] = [
      {
        startsAtIso: startsAt.toISOString(),
        endsAtIso: new Date(startsAt.getTime() + 15 * 60_000).toISOString(),
      },
    ];
  }
  return {
    userId,
    fullName: userId,
    autoConfirm: false,
    allowVirtual: false,
    seenBefore,
    slotsByDate,
  };
}

function session(
  id: string,
  day: number,
  placesLeft: number,
  /** Null = the day names no clinician: not bookable (PRD §3.6). */
  clinicianUserId: string | null = "clinician-1",
): SessionOption {
  const startsAt = new Date(NOW_MS + day * DAY);
  return {
    id,
    startsAtIso: startsAt.toISOString(),
    endsAtIso: new Date(startsAt.getTime() + 4 * 3_600_000).toISOString(),
    clinicianUserId,
    clinicianName: null,
    venue: null,
    placesLeft,
  };
}

function line(partial: Partial<LineOption>): LineOption {
  return {
    id: "line",
    name: "Diabetes Clinic",
    capacityMode: "slot",
    confidential: false,
    reasonCodes: ["follow_up"],
    timeToCareDays: 7,
    departmentId: "dept",
    departmentName: "Medicine",
    clinicians: [],
    sessions: [],
    elsewhere: [{ hospitalId: "h2", hospitalName: "Kiruddu", region: "Central" }],
    ...partial,
  };
}

describe("no-silent-wait (PRD §2.4)", () => {
  it("stands aside when the preferred clinician has a day inside the target", () => {
    const preferred = clinician("a", [2, 9], true);
    const l = line({ clinicians: [preferred, clinician("b", [1])] });
    expect(accessAlternatives(l, preferred, NOW_MS)).toBeNull();
  });

  it("offers the other clinician first, then elsewhere, when the preferred one is beyond it", () => {
    const preferred = clinician("a", [9], true);
    const sooner = clinician("b", [3]);
    const alsoLate = clinician("c", [12]);
    const l = line({ clinicians: [preferred, sooner, alsoLate] });
    const alt = accessAlternatives(l, preferred, NOW_MS);
    expect(alt?.otherClinicians.map((c) => c.userId)).toEqual(["b"]);
    expect(alt?.elsewhere.map((h) => h.hospitalName)).toEqual(["Kiruddu"]);
  });

  it("labels beyond-target days instead of hiding them", () => {
    const { within, beyond } = splitDays(clinician("a", [1, 7, 8]), NOW_MS + 7 * DAY);
    expect(within).toHaveLength(2);
    expect(beyond).toHaveLength(1);
  });

  it("treats a full clinic day as no option, and splits sessions at the target", () => {
    const l = line({
      capacityMode: "session",
      sessions: [session("full", 2, 0), session("late", 10, 5)],
    });
    expect(accessAlternatives(l, null, NOW_MS)?.elsewhere).toHaveLength(1);
    const { within, beyond } = splitSessions(l.sessions, NOW_MS + 7 * DAY);
    expect(within.map((s) => s.id)).toEqual(["full"]);
    expect(beyond.map((s) => s.id)).toEqual(["late"]);
    expect(
      accessAlternatives(
        line({ capacityMode: "session", sessions: [session("ok", 2, 1)] }),
        null,
        NOW_MS,
      ),
    ).toBeNull();
  });
});

describe("reasons (PRD Appendix A)", () => {
  it("offers exactly the 13 patient codes the server takes, in its order", () => {
    expect(REASONS.map((r) => r.value)).toEqual([...PATIENT_REASON_CODES]);
  });
});

describe("no clinical question anywhere in the booking path (PRD §7.2 rule 1)", () => {
  const files = [
    "app/patient/book/_lib/booking.ts",
    "app/patient/book/_components/booking-wizard.tsx",
    "app/patient/book/page.tsx",
    "app/patient/book/actions.ts",
  ];
  // Symptom and severity words. A reason is administrative; nothing asks
  // how the patient feels, and no example names a symptom.
  const forbidden =
    /\b(pain|fever|cough|bleed|breath|vomit|headache|chest|dizzy|rash|swelling|severity|how bad|how urgent|rate your)\b/i;
  for (const file of files) {
    it(`${file} names no symptom`, () => {
      const src = readFileSync(resolve(process.cwd(), file), "utf8");
      expect(src.match(forbidden)).toBeNull();
    });
  }
});

describe("what is bothering you (ADR 0095) — words only, in its own file", () => {
  it("the wizard and the desk mount one picker, which shows the boundary sentence verbatim", () => {
    const read = (rel: string) => readFileSync(resolve(process.cwd(), rel), "utf8");
    const picker = read("app/patient/book/_components/symptom-picker.tsx");
    expect(picker).toContain("SYMPTOMS_NOTE");
    expect(picker).toContain("What is bothering you?");
    expect(read("app/patient/book/_components/booking-wizard.tsx")).toContain("<SymptomPicker");
    expect(read("app/reception/book/_components/desk-booking.tsx")).toContain("<SymptomPicker");
    // Descriptive: no flag from the catalogue reaches the selector.
    expect(read("lib/catalog/symptoms.ts")).not.toMatch(/mustNotMiss|isPain|ugandaFlag|rosScreen/);
  });
});

describe("interstitial copy (ADR 0088, byte-identical on the phone)", () => {
  it("is the ratified ASCII", () => {
    expect(INTERSTITIAL.title).toBe("Booking is for care that can wait.");
    expect(INTERSTITIAL.body).toBe(
      "If this cannot wait, do not book. Go to the nearest emergency unit now.",
    );
    expect(INTERSTITIAL.dismiss).toBe("Continue to book");
    for (const s of Object.values(INTERSTITIAL)) expect(/^[\x20-\x7e]+$/.test(s)).toBe(true);
  });
});

describe("draft persistence", () => {
  it("round-trips a draft and refuses one it cannot trust", () => {
    const draft = {
      v: 1 as const,
      forProvisionalId: null,
      reason: "follow_up" as const,
      reasonNote: "note",
      symptoms: [{ code: "fatigue", label: "Tiredness", duration: "days" as const }],
      interstitialSeen: false,
      lineId: "l",
      clinicianUserId: "c",
      dateIso: "2026-09-17",
      slotStartsAtIso: "2026-09-17T06:00:00.000Z",
      sessionId: null,
      appointmentType: "virtual" as const,
      idempotencyKey: "0b3c2a3e-8f4b-4c1d-9a2e-1f2e3d4c5b6a",
    };
    expect(parseDraft(JSON.stringify(draft))).toEqual(draft);
    expect(parseDraft(JSON.stringify({ ...draft, reason: "urgent_review" }))?.reason).toBeNull();
    // ADR 0095: a pick left without its duration does not survive a reload.
    expect(
      parseDraft(
        JSON.stringify({ ...draft, symptoms: [{ code: null, label: "x", duration: null }] }),
      )?.symptoms,
    ).toEqual([]);
    expect(parseDraft(JSON.stringify({ ...draft, v: 2 }))).toBeNull();
    expect(parseDraft("not json")).toBeNull();
    expect(parseDraft(null)).toBeNull();
  });
});

describe("formatting in the hospital's zone", () => {
  it("prints the receipt's date and times", () => {
    expect(formatFullDate("2026-09-22T06:30:00Z")).toBe("Tuesday 22 September");
    expect(formatTime("2026-09-22T06:30:00Z")).toBe("9:30 AM");
    expect(formatArrivalWindow("2026-09-22T06:30:00Z", "2026-09-22T08:00:00Z")).toBe(
      "9:30 AM and 11:00 AM",
    );
    // 01:00 EAT is the previous UTC day: the date must not slip.
    expect(formatFullDate("2026-09-21T22:00:00Z")).toBe("Tuesday 22 September");
  });
});
