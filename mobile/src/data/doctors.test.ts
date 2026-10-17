import type { ClinicianOption } from "@/lib/booking";

import {
  doctorFilters,
  initialsOf,
  matchesFilter,
  toDoctorCards,
  WALK_IN_FILTER,
} from "@/data/doctors";

jest.mock("@/lib/booking", () => ({}));

const clinician = (over: Partial<ClinicianOption>): ClinicianOption => ({
  userId: "u1",
  fullName: "Dr [Name A]",
  hospitalId: "h1",
  hospitalName: "[Hospital name]",
  cadre: "Medical Officer",
  cadreId: "c1",
  specialty: null,
  departmentId: "d1",
  departmentName: "General clinic",
  photoUrl: null,
  rating: null,
  allowVirtual: false,
  seenBefore: false,
  patientsSeen: 0,
  withUsSinceIso: null,
  autoConfirm: false,
  slotsByDate: {},
  ...over,
});

const slot = { startsAtIso: "2026-10-20T06:00:00Z", endsAtIso: "2026-10-20T06:15:00Z" };
const priced = {
  departmentId: "d1",
  fee: { posture: "full", baseFeeUgx: 30000, lineName: "OPD", cadreFees: [] },
};

const lines = (entries: [string, (typeof priced)[]][]) => new Map(entries);

describe("doctor cards from the server's clinicians", () => {
  it("maps name, role, and each place's next open day, walk-ins and fee", () => {
    const [card] = toDoctorCards(
      [
        clinician({
          slotsByDate: { "2026-10-22": [slot], "2026-10-20": [slot] },
          specialty: "Diabetes",
        }),
      ],
      lines([["h1", [priced]]]),
      [{ id: "d1", name: "General clinic", openNow: true }],
      "h1",
    );
    expect(card).toMatchObject({
      key: "u1",
      name: "Dr [Name A]",
      role: "Diabetes",
      initials: "A",
      nextDayKey: "2026-10-20",
    });
    expect(card.places).toEqual([
      expect.objectContaining({
        hospitalId: "h1",
        departmentName: "General clinic",
        nextDayKey: "2026-10-20",
        walkInToday: true,
        feeWords: "UGX 30,000",
        home: true,
      }),
    ]);
  });

  it("falls back to the cadre, no open day, no walk-ins and No fee", () => {
    const [card] = toDoctorCards([clinician({})], lines([]), [], null);
    expect(card.role).toBe("Medical Officer");
    expect(card.nextDayKey).toBeNull();
    expect(card.places[0]).toMatchObject({ walkInToday: false, feeWords: "No fee", home: false });
  });

  it("one card per doctor, listing every hospital, the patient's own first", () => {
    const cards = toDoctorCards(
      [
        clinician({
          hospitalId: "h2",
          hospitalName: "Hospital B",
          slotsByDate: { "2026-10-19": [slot] },
        }),
        clinician({
          hospitalId: "h1",
          hospitalName: "Hospital A",
          slotsByDate: { "2026-10-25": [slot] },
        }),
        clinician({
          userId: "u2",
          fullName: "Dr [Name B]",
          hospitalId: "h2",
          hospitalName: "Hospital B",
        }),
      ],
      lines([]),
      [],
      "h1",
    );
    expect(cards.map((c) => c.userId)).toEqual(["u1", "u2"]);
    expect(cards[0].places.map((p) => p.hospitalName)).toEqual(["Hospital A", "Hospital B"]);
    // The soonest open day anywhere, not only at the first hospital listed.
    expect(cards[0].nextDayKey).toBe("2026-10-19");
  });

  it("walk-ins only at the patient's own hospital", () => {
    const [card] = toDoctorCards(
      [clinician({ hospitalId: "h2" })],
      lines([]),
      [{ id: "d1", name: "General clinic", openNow: true }],
      "h1",
    );
    expect(card.places[0].walkInToday).toBe(false);
  });

  it("carries no count, rating or place number", () => {
    const [card] = toDoctorCards(
      [clinician({ rating: { average: 4.9, count: 10 } })],
      lines([]),
      [],
      null,
    );
    expect(Object.keys(card)).not.toEqual(expect.arrayContaining(["rating", "ahead"]));
  });
});

describe("filters only for facets the data has", () => {
  it("none for one hospital and one department that all take walk-ins", () => {
    const cards = toDoctorCards([clinician({}), clinician({ userId: "u2" })], lines([]), [], "h1");
    expect(doctorFilters(cards)).toEqual([]);
  });

  it("walk-ins and departments when they differ at one hospital", () => {
    const cards = toDoctorCards(
      [clinician({}), clinician({ userId: "u2", departmentId: "d2", departmentName: "Eye" })],
      lines([]),
      [{ id: "d1", name: "General clinic", openNow: true }],
      "h1",
    );
    expect(doctorFilters(cards)).toEqual([WALK_IN_FILTER, "Eye", "General clinic"]);
    expect(cards.filter((c) => matchesFilter(c, WALK_IN_FILTER)).map((c) => c.userId)).toEqual([
      "u1",
    ]);
    expect(cards.filter((c) => matchesFilter(c, "Eye")).map((c) => c.userId)).toEqual(["u2"]);
    expect(cards.filter((c) => matchesFilter(c, null))).toHaveLength(2);
  });

  it("hospitals when there are two or more", () => {
    const cards = toDoctorCards(
      [
        clinician({ hospitalName: "Hospital A" }),
        clinician({ userId: "u2", hospitalId: "h2", hospitalName: "Hospital B" }),
      ],
      lines([]),
      [],
      null,
    );
    expect(doctorFilters(cards)).toEqual(["Hospital A", "Hospital B"]);
    expect(cards.filter((c) => matchesFilter(c, "Hospital B")).map((c) => c.userId)).toEqual([
      "u2",
    ]);
  });

  it("initials skip the title", () => {
    expect(initialsOf("Dr Jane Doe")).toBe("JD");
    expect(initialsOf("")).toBe("DR");
  });
});
