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

describe("doctor cards from the server's clinicians", () => {
  it("maps name, role, next open day, walk-ins and fee", () => {
    const [card] = toDoctorCards(
      [
        clinician({
          slotsByDate: { "2026-10-22": [slot], "2026-10-20": [slot] },
          specialty: "Diabetes",
        }),
      ],
      [priced],
      [{ id: "d1", name: "General clinic", openNow: true }],
    );
    expect(card).toMatchObject({
      key: "u1:d1",
      name: "Dr [Name A]",
      role: "Diabetes",
      place: "General clinic",
      initials: "A",
      nextDayKey: "2026-10-20",
      walkInToday: true,
      feeWords: "UGX 30,000",
    });
  });

  it("falls back to the cadre, no open day, no walk-ins and No fee", () => {
    const [card] = toDoctorCards([clinician({})], [], []);
    expect(card.role).toBe("Medical Officer");
    expect(card.nextDayKey).toBeNull();
    expect(card.walkInToday).toBe(false);
    expect(card.feeWords).toBe("No fee");
  });

  it("carries no count, rating or place number", () => {
    const [card] = toDoctorCards([clinician({ rating: { average: 4.9, count: 10 } })], [], []);
    expect(Object.keys(card)).not.toEqual(expect.arrayContaining(["rating", "ahead"]));
  });
});

describe("filters only for facets the data has", () => {
  it("none for one department that all take walk-ins", () => {
    const cards = toDoctorCards([clinician({}), clinician({ userId: "u2" })], [], []);
    expect(doctorFilters(cards)).toEqual([]);
  });

  it("walk-ins and departments when they differ", () => {
    const cards = toDoctorCards(
      [clinician({}), clinician({ userId: "u2", departmentId: "d2", departmentName: "Eye" })],
      [],
      [{ id: "d1", name: "General clinic", openNow: true }],
    );
    expect(doctorFilters(cards)).toEqual([WALK_IN_FILTER, "Eye", "General clinic"]);
    expect(cards.filter((c) => matchesFilter(c, WALK_IN_FILTER)).map((c) => c.userId)).toEqual([
      "u1",
    ]);
    expect(cards.filter((c) => matchesFilter(c, "Eye")).map((c) => c.userId)).toEqual(["u2"]);
    expect(cards.filter((c) => matchesFilter(c, null))).toHaveLength(2);
  });

  it("initials skip the title", () => {
    expect(initialsOf("Dr Jane Doe")).toBe("JD");
    expect(initialsOf("")).toBe("DR");
  });
});
