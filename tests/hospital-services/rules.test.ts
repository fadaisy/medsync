import type {
  AvailabilityEvent,
  DeptState,
  ServicePreset,
} from "@/supabase/functions/_shared/services-hub";
import { describe, expect, it } from "vitest";

import {
  archiveVerdict,
  bedLabelsToAdd,
  CAPABILITY_KEYS,
  CATALOGUE_CLINICS,
  CATALOGUE_DEPARTMENTS,
  checkCapabilityValue,
  compareToPreset,
  derivedCapabilities,
  headEligible,
  IMAGING_ITEMS,
  inChargeEligible,
  LAB_SECTIONS,
  liveChange,
  orderingAvailability,
  planLegacyImport,
  planPreset,
  projectAvailability,
  SERVICE_PRESETS,
  setOutcome,
  signedPresetFor,
  skipDayFor,
  startChange,
  toUgE164,
  verifyVerdict,
} from "@/supabase/functions/_shared/services-hub";
import { expandSessionTemplate } from "@/supabase/functions/_shared/slots";

/*
 * Departments & services hub — every engine rule ID (prompt §6) against the ONE pure module the
 * Edge Function enforces and the app renders from. Rule IDs appear in the test names so the
 * coverage map at STOP 2 is a grep.
 */

const TZ = "Africa/Kampala";
const dept = (over: Partial<DeptState> & { id: string }): DeptState => ({
  parentId: null,
  live: false,
  archived: false,
  isStart: false,
  ...over,
});

describe("catalogues (Appendix A) — integrity", () => {
  it("A.1: 30 departments, unique codes, the 23 application codes plus 7 additions with kinds", () => {
    const codes = CATALOGUE_DEPARTMENTS.map((d) => d.code);
    expect(new Set(codes).size).toBe(codes.length);
    expect(codes).toHaveLength(30);
    expect(CATALOGUE_DEPARTMENTS.filter((d) => d.kind === "clinical")).toHaveLength(23);
    const kindOf = (c: string) => CATALOGUE_DEPARTMENTS.find((d) => d.code === c)?.kind;
    expect(kindOf("LABORATORY")).toBe("diagnostic");
    expect(kindOf("RADIOLOGY_IMAGING")).toBe("diagnostic");
    expect(kindOf("PHARMACY")).toBe("support");
    expect(kindOf("RECEPTION_FRONT_DESK")).toBe("administrative");
    expect(kindOf("RECORDS_HEALTH_INFO")).toBe("administrative");
  });

  it("A.2: every clinic's default department is in the catalogue; D-SVC-08 confidential list", () => {
    for (const c of CATALOGUE_CLINICS) {
      expect(
        CATALOGUE_DEPARTMENTS.some((d) => d.code === c.department),
        c.code,
      ).toBe(true);
    }
    const confidential = CATALOGUE_CLINICS.filter((c) => c.confidential)
      .map((c) => c.code)
      .sort();
    expect(confidential).toEqual(["family_planning", "hiv_art", "mental_health", "srh", "tb"]);
  });

  it("A.2: the application form's nine clinic codes are kept verbatim (0021 CHECK)", () => {
    for (const code of [
      "diabetes",
      "hypertension_cardiac",
      "renal_dialysis",
      "oncology",
      "hiv_art",
      "tb",
      "antenatal_maternal",
      "asthma_copd",
      "mental_health",
    ]) {
      expect(
        CATALOGUE_CLINICS.some((c) => c.code === code),
        code,
      ).toBe(true);
    }
  });

  it("A.3 / A.4: 8 lab sections, 11 imaging items, unique codes", () => {
    expect(LAB_SECTIONS).toHaveLength(8);
    expect(IMAGING_ITEMS).toHaveLength(11);
    expect(new Set(IMAGING_ITEMS.map((i) => i.code)).size).toBe(11);
  });

  it("A.7 / CAP-4: the routing flags are the signed set", () => {
    const routing = CAPABILITY_KEYS.filter((k) => k.routing)
      .map((k) => k.key)
      .sort();
    expect(routing).toEqual(
      [
        "accepts_pre_alerts",
        "ambulance_24h",
        "ambulance_line",
        "arrival_directions",
        "blood_24h",
        "blood_source",
        "emergency_capability",
        "emergency_sms_number",
        "emergency_theatre_24h",
        "hdu_beds",
        "icu_beds",
        "nicu_cots",
        "oxygen_24h",
        "oxygen_sources",
        "resus_bays",
        "ventilators_count",
      ].sort(),
    );
    // CAP-2: the pathway's own keys are all routing-relevant.
    expect(CAPABILITY_KEYS.filter((k) => k.pathway).every((k) => k.routing)).toBe(true);
  });
});

describe("STR-2 — one start department once any department is live", () => {
  it("the first department to go live becomes the start department", () => {
    const all = [dept({ id: "a" }), dept({ id: "b" })];
    expect(liveChange(all, "a", true)).toEqual({ ok: true, makeStart: true });
  });
  it("a later department going live does not steal the start", () => {
    const all = [dept({ id: "a", live: true, isStart: true }), dept({ id: "b" })];
    expect(liveChange(all, "b", true)).toEqual({ ok: true, makeStart: false });
  });
  it("switching off the start department is refused while others are live", () => {
    const all = [dept({ id: "a", live: true, isStart: true }), dept({ id: "b", live: true })];
    const r = liveChange(all, "a", false);
    expect(r.ok).toBe(false);
  });
  it("a unit, an archived or a not-live department can't be the start", () => {
    const all = [
      dept({ id: "u", parentId: "a", live: true }),
      dept({ id: "x", archived: true }),
      dept({ id: "n" }),
    ];
    expect(startChange(all, "u").ok).toBe(false);
    expect(startChange(all, "x").ok).toBe(false);
    expect(startChange(all, "n").ok).toBe(false);
    expect(startChange([dept({ id: "ok", live: true })], "ok").ok).toBe(true);
  });
  it("a unit going live never becomes the start", () => {
    expect(liveChange([dept({ id: "u", parentId: "a" })], "u", true)).toEqual({
      ok: true,
      makeStart: false,
    });
  });
});

describe("STR-3 — heads and in-charges", () => {
  const aff = [
    { userId: "doc", departmentId: "im", state: "active", cadreCode: "MEDICAL_OFFICER" },
    { userId: "pending", departmentId: "im", state: "pending_approval", cadreCode: "CONSULTANT" },
    { userId: "nurse", departmentId: "surg", state: "approved", cadreCode: "NURSE" },
    { userId: "recep", departmentId: "front", state: "active", cadreCode: "RECEPTION" },
  ];
  it("heads: approved staff affiliated to the department (or its units)", () => {
    expect(headEligible(aff, "doc", ["im"])).toBe(true);
    expect(headEligible(aff, "doc", ["surg"])).toBe(false); // S4: not affiliated → rejected
    expect(headEligible(aff, "pending", ["im"])).toBe(false);
  });
  it("in-charges: approved nursing staff at the hospital", () => {
    expect(inChargeEligible(aff, "nurse")).toBe(true);
    expect(inChargeEligible(aff, "doc")).toBe(false);
    expect(inChargeEligible(aff, "recep")).toBe(false);
  });
});

describe("STR-4 — archive only what nothing uses", () => {
  it("blocked with the counts while in use", () => {
    const r = archiveVerdict({ staff: 23, bookedSessions: 4, wards: 3, units: 0, occupiedBeds: 0 });
    expect(r).toEqual({
      ok: false,
      reason: "In use: 23 staff · 4 booked sessions · 3 wards. Reassign first.",
    });
  });
  it("allowed when nothing references it", () => {
    expect(
      archiveVerdict({ staff: 0, bookedSessions: 0, wards: 0, units: 0, occupiedBeds: 0 }),
    ).toEqual({ ok: true });
  });
});

describe("STR-5 — beds", () => {
  it("generates labels up to the count, skipping taken labels (archived ones stay taken)", () => {
    expect(bedLabelsToAdd(3, 0, [])).toEqual(["Bed 1", "Bed 2", "Bed 3"]);
    expect(bedLabelsToAdd(3, 1, ["Bed 2", "Bed 9"])).toEqual(["Bed 1", "Bed 3"]);
    expect(bedLabelsToAdd(2, 2, ["Bed 1", "Bed 2"])).toEqual([]);
  });
});

describe("CAP-3 — derived capabilities from Wards & beds (S6)", () => {
  it("ICU beds follow the ICU wards; archived wards don't count", () => {
    const d = derivedCapabilities([
      { wardType: "icu", bedCount: 4, archived: false },
      { wardType: "general", bedCount: 30, archived: false },
      { wardType: "icu", bedCount: 6, archived: true },
      { wardType: "nicu", bedCount: 10, archived: false },
    ]);
    expect(d).toEqual({
      icu_beds: 4,
      hdu_beds: 0,
      isolation_beds: 0,
      nicu_cots: 10,
      total_beds: 44,
    });
  });
});

describe("CAP-1 — typed values", () => {
  it("normalises phone numbers people actually write, against the pathway's formats", () => {
    expect(toUgE164("0772 123 456")).toBe("+256772123456");
    expect(toUgE164("+256 414 123456")).toBe("+256414123456");
    expect(toUgE164("12345")).toBeNull();
    expect(checkCapabilityValue("emergency_sms_number", "0772123456")).toEqual({
      ok: true,
      value: "+256772123456",
    });
    expect(checkCapabilityValue("ambulance_line", "0800 123456")).toEqual({
      ok: true,
      value: "0800123456",
    });
    expect(checkCapabilityValue("emergency_sms_number", "0712").ok).toBe(false);
  });
  it("refuses derived keys, unknown keys and out-of-range counts", () => {
    expect(checkCapabilityValue("icu_beds", 4).ok).toBe(false);
    expect(checkCapabilityValue("nope", 1).ok).toBe(false);
    expect(checkCapabilityValue("resus_bays", -1).ok).toBe(false);
    expect(checkCapabilityValue("resus_bays", 2)).toEqual({ ok: true, value: 2 });
  });
  it("pre-alerts need a board owner; directions fit one SMS", () => {
    expect(checkCapabilityValue("accepts_pre_alerts", { enabled: true, owner: "" }).ok).toBe(false);
    expect(
      checkCapabilityValue("accepts_pre_alerts", { enabled: true, owner: "Reception lead" }).ok,
    ).toBe(true);
    expect(checkCapabilityValue("arrival_directions", "x".repeat(141)).ok).toBe(false);
  });
  it("weekly hours: by ISO weekday, the end after the start", () => {
    expect(checkCapabilityValue("opd_hours", { "1": [{ from: "08:00", to: "17:00" }] }).ok).toBe(
      true,
    );
    expect(checkCapabilityValue("opd_hours", { "1": [{ from: "17:00", to: "08:00" }] }).ok).toBe(
      false,
    );
    expect(checkCapabilityValue("opd_hours", { "9": [] }).ok).toBe(false);
  });
});

describe("CAP-5 — routing values need a second person (S13)", () => {
  const key = (k: string) => CAPABILITY_KEYS.find((x) => x.key === k)!;
  it("a routing change is pending; a non-routing one takes effect", () => {
    expect(setOutcome(key("emergency_capability"), "24h").kind).toBe("pending");
    expect(setOutcome(key("theatres_count"), 3).kind).toBe("direct");
  });
  it("the author can't verify their own change; another admin can", () => {
    const row = {
      key: "emergency_capability",
      value: null,
      authoredBy: null,
      verifiedBy: null,
      verifiedAt: null,
      pendingValue: "24h",
      pendingBy: "A",
      pendingAt: "2026-09-26T08:00:00Z",
    };
    expect(verifyVerdict(row, "A").ok).toBe(false);
    expect(verifyVerdict(row, "B")).toEqual({ ok: true });
    expect(verifyVerdict(null, "B").ok).toBe(false);
  });
});

describe("AV-1, AV-2 — availability projection (S12)", () => {
  const ev = (over: Partial<AvailabilityEvent>): AvailabilityEvent => ({
    problemId: "p1",
    subjectKind: "test",
    subjectRef: "4548-4",
    subjectLabel: "HbA1c",
    event: "reported",
    state: "unavailable",
    reason: "stock_out",
    note: null,
    expectedBackAt: "2026-09-30T09:00:00+03:00",
    actorUserId: "u1",
    at: "2026-09-24T09:10:00+03:00",
    ...over,
  });
  it("an open problem carries since, expected-back and last-confirmed", () => {
    const [p] = projectAvailability([ev({})], new Date("2026-09-26T10:00:00+03:00"));
    expect(p).toMatchObject({
      state: "unavailable",
      unconfirmed: false,
      since: "2026-09-24T09:10:00+03:00",
    });
  });
  it("AV-2: past the expected-back date with no word it is UNCONFIRMED — never available", () => {
    const [p] = projectAvailability([ev({})], new Date("2026-10-01T10:00:00+03:00"));
    expect(p?.unconfirmed).toBe(true);
    expect(p?.state).toBe("unavailable");
  });
  it("a confirmation with a new date clears 'unconfirmed'", () => {
    const [p] = projectAvailability(
      [
        ev({}),
        ev({
          event: "confirmed",
          state: null,
          reason: null,
          expectedBackAt: "2026-10-05T09:00:00+03:00",
          at: "2026-10-01T11:00:00+03:00",
        }),
      ],
      new Date("2026-10-01T12:00:00+03:00"),
    );
    expect(p?.unconfirmed).toBe(false);
    expect(p?.lastConfirmedAt).toBe("2026-10-01T11:00:00+03:00");
  });
  it("resolved problems leave the projection; their events stay (history)", () => {
    const events = [
      ev({}),
      ev({ event: "resolved", state: null, reason: null, at: "2026-09-29T09:00:00+03:00" }),
    ];
    expect(projectAvailability(events, new Date("2026-09-30T09:00:00+03:00"))).toEqual([]);
    expect(events).toHaveLength(2);
  });
});

describe("DX-4 — the ordering contract (informs, never blocks)", () => {
  const hba1c = {
    kind: "lab" as const,
    code: "4548-4",
    provision: "in_house" as const,
    hours: "scheduled" as const,
    hoursNote: "Mon–Fri",
    statedTat: "1 day",
    referredTo: null,
    confirmedAt: "2026-09-26T08:00:00Z",
  };
  it("returns where, hours, stated turnaround and the availability with since/last-confirmed", () => {
    const r = orderingAvailability("4548-4", hba1c, [
      {
        problemId: "p",
        subjectKind: "test",
        subjectRef: "4548-4",
        subjectLabel: "HbA1c",
        state: "unavailable",
        unconfirmed: false,
        reason: "stock_out",
        note: null,
        since: "s",
        expectedBackAt: null,
        lastConfirmedAt: "l",
        reportedBy: null,
      },
    ]);
    expect(r).toEqual({
      code: "4548-4",
      where: "in_house",
      hours: "Mon–Fri",
      statedTurnaround: "1 day",
      referredTo: null,
      availability: { state: "unavailable", since: "s", lastConfirmedAt: "l" },
    });
  });
  it("a Planned (unconfirmed) offering is 'unknown', never asserted", () => {
    expect(orderingAvailability("4548-4", { ...hba1c, confirmedAt: null }, []).where).toBe(
      "unknown",
    );
    expect(orderingAvailability("x", null, []).where).toBe("unknown");
  });
});

describe("PS-1, PS-2, PS-3 — presets and the standards comparison (S1)", () => {
  it("PS-1: every shipped preset is signed and sourced; an unsigned one is invisible", () => {
    for (const p of SERVICE_PRESETS) {
      expect(p.signedBy && p.signedAt && p.source && p.url && p.section, p.level).toBeTruthy();
      for (const i of p.items) expect(i.clause && i.page, `${p.level} ${i.code}`).toBeTruthy();
    }
    expect(signedPresetFor("regional")?.levelLabel).toBe("Regional Referral Hospital");
    expect(signedPresetFor("private")).toBeNull();
    const unsigned: ServicePreset = { ...SERVICE_PRESETS[0]!, signedBy: null };
    expect(unsigned.signedBy && unsigned.signedAt ? unsigned : null).toBeNull();
  });
  it("preset items reference catalogue codes only", () => {
    for (const p of SERVICE_PRESETS) {
      for (const i of p.items) {
        const pool =
          i.kind === "department"
            ? CATALOGUE_DEPARTMENTS.map((d) => d.code)
            : i.kind === "clinic"
              ? CATALOGUE_CLINICS.map((c) => c.code)
              : i.kind === "imaging"
                ? IMAGING_ITEMS.map((x) => x.code)
                : LAB_SECTIONS.map((s) => s.code);
        expect(pool, `${p.level} ${i.kind}:${i.code}`).toContain(i.code);
      }
    }
  });
  it("PS-2: applying only adds what is missing and reports what it skipped", () => {
    const rrh = signedPresetFor("regional")!;
    const plan = planPreset(rrh, {
      departmentCodes: new Set(["INTERNAL_MEDICINE"]),
      labSectionCodes: new Set(),
      clinicCodes: new Set(["immunisation"]),
      imagingCodes: new Set(),
    });
    expect(plan.skip.map((s) => s.code).sort()).toEqual(["INTERNAL_MEDICINE", "immunisation"]);
    expect(plan.add.some((a) => a.code === "INTERNAL_MEDICINE")).toBe(false);
    expect(plan.add.some((a) => a.code === "LABORATORY")).toBe(true);
  });
  it("PS-3: offered / in preset / gaps, pure", () => {
    const gh = signedPresetFor("district")!;
    const rows = compareToPreset(gh, {
      departmentCodes: new Set(["GENERAL_SURGERY", "LABORATORY"]),
      labSectionCodes: new Set(),
      clinicCodes: new Set(),
      imagingCodes: new Set(["xray"]),
    });
    const deps = rows.find((r) => r.kind === "department")!;
    expect(deps.offered).toBe(2);
    expect(deps.inPreset).toBe(10);
    expect(
      rows
        .find((r) => r.kind === "imaging")!
        .gaps.map((g) => g.code)
        .sort(),
    ).toEqual(["fluoroscopy", "ultrasound"]);
  });
});

describe("Appendix B — the one-time legacy import (S2)", () => {
  it("maps the application's arrays; routing values are returned for the PENDING path", () => {
    const p = planLegacyImport({
      specialisedClinics: ["diabetes", "hiv_art"],
      specialisedClinicsOther: ["Podiatry"],
      diagnosticServices: ["lab_chem", "lab_haem", "img_xray", "ecg"],
      supportServices: ["pharmacy", "blood_bank", "mortuary", "ambulance"],
      servicesOffered: ["emergency_24_7", "opd"],
      hasOnsitePharmacy: true,
    });
    expect(p.clinics).toEqual(["diabetes", "hiv_art"]);
    expect(p.customClinics).toEqual(["Podiatry"]);
    expect(p.labSections).toEqual(["clinical_chemistry", "haematology"]);
    expect(p.imaging).toEqual(["xray", "ecg"]);
    expect(p.departments.sort()).toEqual([
      "LABORATORY",
      "MORTUARY",
      "PHARMACY",
      "RADIOLOGY_IMAGING",
    ]);
    expect(p.capabilities).toContainEqual({ key: "emergency_capability", value: "24h" });
    expect(p.capabilities).toContainEqual({ key: "blood_source", value: "onsite" });
    expect(p.notes.join(" ")).toMatch(/Ambulance/);
  });
});

describe("CLN-3 — recurrence (booking engine expander)", () => {
  const base = {
    weekday: 2,
    startMinutesLocal: 480,
    durationMinutes: 300,
    validFrom: "2026-09-01",
    validUntil: null,
  };
  const days = (r: { startsAt: Date }[]) =>
    r.map((x) => x.startsAt.toLocaleDateString("en-CA", { timeZone: TZ }));
  it("weekly (unchanged default)", () => {
    expect(
      days(
        expandSessionTemplate(base, "2026-09-28T00:00:00+03:00", "2026-10-27T00:00:00+03:00", TZ),
      ),
    ).toEqual(["2026-09-29", "2026-10-06", "2026-10-13", "2026-10-20"]);
  });
  it("every 2 weeks, anchored on the first Tuesday on/after validFrom (1 Sep)", () => {
    expect(
      days(
        expandSessionTemplate(
          { ...base, repeatEveryWeeks: 2 },
          "2026-09-28T00:00:00+03:00",
          "2026-10-27T00:00:00+03:00",
          TZ,
        ),
      ),
    ).toEqual(["2026-09-29", "2026-10-13"]);
  });
  it("1st Thursday monthly and the last Tuesday", () => {
    expect(
      days(
        expandSessionTemplate(
          { ...base, weekday: 4, nthWeekday: 1 },
          "2026-09-01T00:00:00+03:00",
          "2026-11-30T00:00:00+03:00",
          TZ,
        ),
      ),
    ).toEqual(["2026-09-03", "2026-10-01", "2026-11-05"]);
    expect(
      days(
        expandSessionTemplate(
          { ...base, nthWeekday: -1 },
          "2026-09-01T00:00:00+03:00",
          "2026-11-30T00:00:00+03:00",
          TZ,
        ),
      ),
    ).toEqual(["2026-09-29", "2026-10-27", "2026-11-24"]);
  });
  it("a one-off session is a template valid for a single day", () => {
    expect(
      days(
        expandSessionTemplate(
          { ...base, validFrom: "2026-10-13", validUntil: "2026-10-13" },
          "2026-09-28T00:00:00+03:00",
          "2026-12-01T00:00:00+03:00",
          TZ,
        ),
      ),
    ).toEqual(["2026-10-13"]);
  });
});

describe("CLN-4 — public holidays skip unless the clinic runs on them; closures always win (S8, S9)", () => {
  const friday = {
    weekday: 5,
    startMinutesLocal: 540,
    durationMinutes: 180,
    validFrom: "2026-09-01",
    validUntil: null,
  };
  const days = (r: { startsAt: Date }[]) =>
    r.map((x) => x.startsAt.toLocaleDateString("en-CA", { timeZone: TZ }));
  const range = ["2026-10-02T00:00:00+03:00", "2026-10-24T00:00:00+03:00"] as const;
  it("Independence Day (Fri 9 Oct 2026) is skipped …", () => {
    const skip = skipDayFor({
      holidays: ["2026-10-09"],
      closures: [],
      runsOnHolidays: false,
      departmentIds: ["d"],
      serviceLineId: "l",
    });
    expect(days(expandSessionTemplate(friday, range[0], range[1], TZ, skip))).toEqual([
      "2026-10-02",
      "2026-10-16",
      "2026-10-23",
    ]);
  });
  it("… unless the clinic runs on public holidays", () => {
    const skip = skipDayFor({
      holidays: ["2026-10-09"],
      closures: [],
      runsOnHolidays: true,
      departmentIds: ["d"],
      serviceLineId: "l",
    });
    expect(days(expandSessionTemplate(friday, range[0], range[1], TZ, skip))).toContain(
      "2026-10-09",
    );
  });
  it("a closure of this clinic (12–16 Oct) wins even over 'runs on holidays'", () => {
    const skip = skipDayFor({
      holidays: [],
      closures: [
        {
          scope: "clinic",
          departmentId: null,
          serviceLineId: "l",
          startsOn: "2026-10-12",
          endsOn: "2026-10-16",
        },
      ],
      runsOnHolidays: true,
      departmentIds: ["d"],
      serviceLineId: "l",
    });
    expect(days(expandSessionTemplate(friday, range[0], range[1], TZ, skip))).toEqual([
      "2026-10-02",
      "2026-10-09",
      "2026-10-23",
    ]);
  });
  it("another clinic's closure doesn't touch this one; a hospital or department closure does", () => {
    const mk = (scope: "clinic" | "department" | "hospital", ref: string | null) =>
      skipDayFor({
        holidays: [],
        closures: [
          {
            scope,
            departmentId: scope === "department" ? ref : null,
            serviceLineId: scope === "clinic" ? ref : null,
            startsOn: "2026-10-16",
            endsOn: "2026-10-16",
          },
        ],
        runsOnHolidays: false,
        departmentIds: ["d", "unit"],
        serviceLineId: "l",
      });
    expect(mk("clinic", "other")("2026-10-16")).toBe(false);
    expect(mk("department", "unit")("2026-10-16")).toBe(true);
    expect(mk("hospital", null)("2026-10-16")).toBe(true);
  });
});
