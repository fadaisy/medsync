import type { ProfileInput } from "@/lib/services/profile";
import { describe, expect, it } from "vitest";

import { buildCapabilityProfile, PROFILE_VERSION } from "@/lib/services/profile";

/*
 * PRF-1…PRF-3 (S14): the capability profile carries no personal data, filters by audience and is
 * versioned. The key walk is the schema test: any key that could name a person fails it.
 */

const input: ProfileInput = {
  hospitalId: "11111111-1111-4111-8111-111111111111",
  generatedAt: "2026-09-26T08:00:00.000Z",
  departments: [
    {
      code: "INTERNAL_MEDICINE",
      name: "Internal Medicine",
      kind: "clinical",
      live: true,
      archived: false,
      isStart: true,
      units: ["Cardiology"],
    },
    {
      code: "GENERAL_SURGERY",
      name: "General Surgery",
      kind: "clinical",
      live: false,
      archived: false,
      isStart: false,
      units: [],
    },
    {
      code: "LABORATORY",
      name: "Laboratory",
      kind: "diagnostic",
      live: true,
      archived: false,
      isStart: false,
      units: ["Haematology"],
    },
  ],
  clinics: [
    {
      code: "diabetes",
      name: "Diabetes clinic",
      department: "Internal Medicine",
      audience: "patients",
      confidential: false,
      live: true,
      place: { name: "Block C, Room 12", directions: "Behind OPD" },
      days: [{ weekday: 2, start: "08:00", end: "13:00", pattern: "weekly" }],
    },
    {
      code: "hiv_art",
      name: "HIV / ART clinic",
      department: "Internal Medicine",
      audience: "patients",
      confidential: true,
      live: true,
      place: null,
      days: [],
    },
    {
      code: "renal_dialysis",
      name: "Renal clinic",
      department: "Internal Medicine",
      audience: "referral",
      confidential: false,
      live: true,
      place: null,
      days: [],
    },
    {
      code: "sickle_cell",
      name: "Sickle cell clinic",
      department: "Internal Medicine",
      audience: "patients",
      confidential: false,
      live: false,
      place: null,
      days: [],
    },
  ],
  diagnostics: [
    {
      kind: "lab",
      code: "4548-4",
      name: "HbA1c",
      where: "in_house",
      hours: "Mon–Fri",
      statedTurnaround: "1 day",
      referredTo: null,
      confirmed: true,
    },
    {
      kind: "imaging",
      code: "ct",
      name: "CT",
      where: "referred",
      hours: null,
      statedTurnaround: null,
      referredTo: "Mulago",
      confirmed: true,
    },
    {
      kind: "imaging",
      code: "xray",
      name: "X-ray",
      where: "in_house",
      hours: null,
      statedTurnaround: null,
      referredTo: null,
      confirmed: false,
    },
  ],
  capabilities: [
    { key: "emergency_capability", value: "24h", derived: false, verification: "verified" },
    { key: "resus_bays", value: 2, derived: false, verification: "change_pending" },
    { key: "icu_beds", value: 4, derived: true, verification: null },
  ],
  availability: [
    {
      kind: "test",
      label: "HbA1c",
      state: "unavailable",
      since: "2026-09-24T06:10:00Z",
      lastConfirmedAt: "2026-09-26T06:10:00Z",
    },
    {
      kind: "ward",
      label: "Female medical",
      state: "unavailable",
      since: "2026-09-25T06:10:00Z",
      lastConfirmedAt: "2026-09-25T06:10:00Z",
    },
  ],
  opdHours: { "1": [{ from: "08:00", to: "17:00" }] },
  places: [{ name: "Block C, Room 12", directions: "Behind OPD" }],
  holidays: [{ date: "2026-10-09", name: "Independence Day" }],
};

const PERSONAL =
  /user|author|verifier|verified_?by|actor|by$|email|phone|nin|patient|staff_?name|full_?name/i;
function keys(v: unknown, path = ""): string[] {
  if (Array.isArray(v)) return v.flatMap((x) => keys(x, path));
  if (v && typeof v === "object")
    return Object.entries(v).flatMap(([k, x]) => [k, ...keys(x, `${path}.${k}`)]);
  return [];
}

describe("PRF-3 — no personal data, in any audience", () => {
  for (const audience of ["internal", "network", "public"] as const) {
    it(`${audience}: no key could carry a person`, () => {
      const offenders = keys(buildCapabilityProfile(input, audience)).filter((k) =>
        PERSONAL.test(k),
      );
      expect(offenders).toEqual([]);
    });
  }
});

describe("PRF-1 — versioned; only live departments; verified values only", () => {
  const p = buildCapabilityProfile(input, "network");
  it("is versioned", () => expect(p.version).toBe(PROFILE_VERSION));
  it("carries live departments only", () =>
    expect(p.departments.map((d) => d.name)).toEqual(["Internal Medicine", "Laboratory"]));
  it("carries each routing key's verification state, not who", () => {
    expect(p.capabilities.find((c) => c.key === "resus_bays")).toMatchObject({
      verification: "change_pending",
      routing: true,
    });
  });
  it("diagnostics: confirmed only (a Planned X-ray is not asserted)", () => {
    expect(p.diagnostics.map((d) => d.code)).toEqual(["4548-4", "ct"]);
  });
});

describe("PRF-2 — audiences", () => {
  it("public: patient-bookable, non-confidential, live clinics only", () => {
    const p = buildCapabilityProfile(input, "public");
    expect(p.clinics.map((c) => c.code)).toEqual(["diabetes"]);
  });
  it("public: no internal availability (a closed ward) and no referral partners", () => {
    const p = buildCapabilityProfile(input, "public");
    expect(p.availabilityNow.map((a) => a.kind)).toEqual(["test"]);
    expect(p.diagnostics.every((d) => d.referredTo === null)).toBe(true);
    expect(p.capabilities.map((c) => c.key)).toEqual(["emergency_capability"]);
  });
  it("network: a confidential clinic is never named (D-SVC-08); internal sees its own", () => {
    expect(
      buildCapabilityProfile(input, "network").clinics.find((c) => c.code === "hiv_art")?.name,
    ).toBe("Clinic");
    expect(
      buildCapabilityProfile(input, "internal").clinics.find((c) => c.code === "hiv_art")?.name,
    ).toBe("HIV / ART clinic");
  });
  it("snapshot per audience (the contract other surfaces read)", () => {
    for (const a of ["internal", "network", "public"] as const) {
      expect(buildCapabilityProfile(input, a)).toMatchSnapshot(a);
    }
  });
});
