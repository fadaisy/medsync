/** Pharmacy Phase 3, Steps 7 and 8 engines. Fixture data only: tags, intervals and timelines are not signed values. */
import type { Course, ReviewSettings } from "@/lib/pharmacy/clinical/stewardship";
import { describe, expect, it } from "vitest";

import {
  ageWords,
  dueBy,
  initials,
  reportFields,
  reportText,
  stateOf,
} from "@/lib/pharmacy/clinical/reactions";
import {
  cultureState,
  dayOfTherapy,
  figures,
  groupOf,
  reviewDue,
} from "@/lib/pharmacy/clinical/stewardship";

const TZ = "Africa/Kampala";
const at = (s: string) => new Date(s);
const course = (over: Partial<Course> = {}): Course => ({
  prescriptionId: "rx-1",
  patientUserId: "p-1",
  medicineId: "drug_w",
  route: "iv",
  ward: "Ward A",
  indication: null,
  placedAt: at("2026-10-20T20:30:00Z"),
  endedAt: null,
  doses: [at("2026-10-20T21:30:00Z"), at("2026-10-21T09:00:00Z")],
  ...over,
});
const tags = {
  drug_w: "Watch",
  drug_a: "Access",
  drug_r: "Reserve",
  "drug_x:iv": "Reserve",
  drug_x: "Watch",
} as const;
const settings: ReviewSettings = { intervalDays: { Watch: 3 }, noCultureWindowHours: 24 };

describe("AM: stewardship", () => {
  it("AM-0: a route-specific tag wins; unknown medicines have no tag", () => {
    expect(groupOf(tags, "drug_x", "iv")).toBe("Reserve");
    expect(groupOf(tags, "drug_x", "oral")).toBe("Watch");
    expect(groupOf(tags, "nothing", null)).toBeNull();
  });
  it("S8: day of therapy in local time across midnight; due on the signed day; never closes by itself", () => {
    // 21:30Z on the 20th is 00:30 on the 21st in Kampala (UTC+3): day 1 is the 21st.
    expect(dayOfTherapy(course(), at("2026-10-21T10:00:00Z"), TZ)).toMatchObject({
      day: 1,
      from: "charted",
    });
    expect(reviewDue(course(), "Watch", settings, [], at("2026-10-22T10:00:00Z"), TZ).due).toBe(
      false,
    );
    expect(
      reviewDue(course(), "Watch", settings, [], at("2026-10-23T10:00:00Z"), TZ),
    ).toMatchObject({ due: true, day: 3 });
    expect(reviewDue(course(), "Watch", settings, [], at("2026-11-22T10:00:00Z"), TZ).due).toBe(
      true,
    );
    const reviewed = [{ prescriptionId: "rx-1", reviewedAt: at("2026-10-23T11:00:00Z") }];
    expect(
      reviewDue(course(), "Watch", settings, reviewed, at("2026-10-23T12:00:00Z"), TZ).due,
    ).toBe(false);
  });
  it("Law 6: unsigned settings or an unlisted group never prompt", () => {
    expect(reviewDue(course(), "Watch", null, [], at("2026-11-01T10:00:00Z"), TZ).due).toBe(false);
    expect(reviewDue(course(), "Access", settings, [], at("2026-11-01T10:00:00Z"), TZ).due).toBe(
      false,
    );
  });
  it("AM-7: not sent, sent, released", () => {
    const start = at("2026-10-21T09:00:00Z");
    expect(cultureState([], "p-1", start, 24).state).toBe("not_sent");
    expect(
      cultureState(
        [
          {
            patientUserId: "p-1",
            orderedAt: at("2026-10-21T08:00:00Z"),
            releasedAt: null,
            reportId: null,
          },
        ],
        "p-1",
        start,
        24,
      ).state,
    ).toBe("sent");
    expect(
      cultureState(
        [
          {
            patientUserId: "p-1",
            orderedAt: at("2026-10-21T08:00:00Z"),
            releasedAt: at("2026-10-23T08:00:00Z"),
            reportId: "r1",
          },
        ],
        "p-1",
        start,
        24,
      ),
    ).toMatchObject({ state: "released", reportId: "r1" });
  });
  it("S9: figures equal a hand count on a fixture ward; a ward with no charted doses shows courses", () => {
    const cs = [
      course(),
      course({ prescriptionId: "rx-2", medicineId: "drug_a", doses: [at("2026-10-21T09:00:00Z")] }),
      course({ prescriptionId: "rx-3", medicineId: "drug_r", ward: "Ward B", doses: [] }),
    ];
    const f = figures(
      cs,
      tags,
      [],
      settings,
      at("2026-10-20T00:00:00Z"),
      at("2026-10-22T00:00:00Z"),
    );
    expect(f.started).toBe(3);
    expect(f.byGroup.Watch).toMatchObject({ numerator: 1, denominator: 3 });
    expect(f.byGroup.Reserve.numerator).toBe(1);
    expect(f.noCulture).toMatchObject({ numerator: 3, denominator: 3 });
    expect(f.dotByGroup.Watch).toBe(2);
    expect(f.byWard.find((w) => w.ward === "Ward B")).toMatchObject({ charts: false });
    expect(f.reserve.map((c) => c.prescriptionId)).toEqual(["rx-3"]);
  });
});

describe("AR: reactions", () => {
  const input = {
    reference: "R-ABCDEFGH",
    kind: "suspected_reaction" as const,
    patient: { fullName: "Fixture Patient Nine", dateOfBirth: "1990-05-01", sex: "female" },
    medicines: [{ name: "Fixture medicine", product: "Fixture product", batch: "B1", main: true }],
    reactionText: "[reaction in the reporter's words]",
    startedOn: "2026-10-24",
    seriousness: ["not_serious"],
    outcome: "recovering",
    actionTaken: "stopped_by_clinician",
    rechallenge: "not_given_again",
    causality: null,
    reporter: { role: "staff", cadre: "Pharmacist" },
  };
  it("AR-5: initials, age in years or months", () => {
    expect(initials("Fixture Patient Nine")).toBe("FPN");
    expect(initials(null)).toBe("Not recorded");
    expect(ageWords("1990-05-01", at("2026-10-25T00:00:00Z"))).toBe("36 years");
    expect(ageWords("2025-10-01", at("2026-10-25T00:00:00Z"))).toBe("12 months");
  });
  it("S11: the print and the copy carry no name, number, phone or address", () => {
    const text = reportText(reportFields(input, at("2026-10-25T00:00:00Z")));
    expect(text).not.toMatch(/Fixture Patient Nine|Patient Nine/);
    expect(text).toMatch(/Patient initials: FPN/);
    expect(text).toMatch(/MedSync reference: R-ABCDEFGH/);
    expect(text).not.toMatch(/\+?256\d{6,}|MS-\d{4}-\d+/);
  });
  it("a medication error names no staff member", () => {
    const f = reportFields({ ...input, kind: "medication_error" }, at("2026-10-25T00:00:00Z"));
    expect(f.find((x) => x.label === "Reporter")!.value).toBe("Health facility");
  });
  it("AR-5a: due-by from the signed timelines; none while unsigned", () => {
    const t = { seriousHours: 48, otherDays: 7 };
    expect(dueBy(at("2026-10-25T00:00:00Z"), ["not_serious"], null)).toBeNull();
    expect(dueBy(at("2026-10-25T00:00:00Z"), ["hospitalisation"], t)!.at.toISOString()).toBe(
      "2026-10-27T00:00:00.000Z",
    );
    expect(dueBy(at("2026-10-25T00:00:00Z"), ["not_serious"], t)!.at.toISOString()).toBe(
      "2026-11-01T00:00:00.000Z",
    );
  });
  it("AR-6, Law 11: to submit until recorded as submitted or closed", () => {
    expect(stateOf([])).toBe("to_submit");
    expect(stateOf([{ kind: "causality" }])).toBe("to_submit");
    expect(stateOf([{ kind: "submitted" }])).toBe("submitted");
    expect(stateOf([{ kind: "closed_not_submitted" }])).toBe("closed_not_submitted");
  });
});
