import type { VisitRecord } from "@/data/records";
import AsyncStorage from "@react-native-async-storage/async-storage";

import { labsFromRecords } from "@/data/labs";

jest.mock("@/lib/supabase", () => ({
  supabase: {
    auth: {
      getSession: async () => ({ data: { session: { access_token: "tok", user: { id: "u1" } } } }),
    },
  },
}));

const record = (over: Partial<VisitRecord> = {}): VisitRecord => ({
  id: "s1",
  sharedAt: "2026-10-03T09:00:00Z",
  updated: false,
  hospitalName: "Lane Hospital",
  startedAt: "2026-10-03T07:30:00Z",
  clinician: null,
  outcome: "You went home.",
  outcomeNote: null,
  found: [],
  medicines: [],
  stopped: [],
  tests: [],
  testsNote: null,
  next: null,
  comeBackIf: null,
  ...over,
});

describe("labsFromRecords", () => {
  it("keeps only visits with tests, with the summary's own sentence", () => {
    const labs = labsFromRecords([
      record({ id: "a" }),
      record({
        id: "b",
        tests: [{ id: "test:1", name: "Full blood count" }],
        testsNote: "Results will be shared after your clinician reviews them.",
      }),
    ]);
    expect(labs).toEqual([
      {
        recordId: "b",
        startedAt: "2026-10-03T07:30:00Z",
        hospitalName: "Lane Hospital",
        tests: [{ id: "test:1", name: "Full blood count" }],
        note: "Results will be shared after your clinician reviews them.",
      },
    ]);
  });

  it("uses the web's sentence when a copy has none", () => {
    const [v] = labsFromRecords([record({ tests: [{ id: "t", name: "Malaria test" }] })]);
    expect(v.note).toBe("Results will be shared after your clinician reviews them.");
  });
});

describe("loadRecords", () => {
  /** A fresh copy of the module: the web origin is read at import, as in a build. */
  const load = async () => {
    let mod!: typeof import("@/data/records");
    jest.isolateModules(() => {
      mod = jest.requireActual<typeof import("@/data/records")>("@/data/records");
    });
    return mod;
  };

  afterEach(() => {
    delete process.env.EXPO_PUBLIC_WEB_ORIGIN;
    jest.restoreAllMocks();
  });

  it("says records are off when the build names no web origin", async () => {
    const { RECORDS_OFF, peekRecords } = await load();
    expect(RECORDS_OFF).toBe("Records are not switched on in this build.");
    expect(peekRecords()).toMatchObject({ status: "off", message: RECORDS_OFF });
  });

  it("sends the token, keeps the list, and reads the phone's copy when offline", async () => {
    process.env.EXPO_PUBLIC_WEB_ORIGIN = "https://medsync.test/";
    const fetchMock = jest
      .spyOn(global, "fetch")
      .mockResolvedValueOnce(new Response(JSON.stringify({ summaries: [record()] })))
      .mockRejectedValueOnce(new Error("offline"));

    const first = await load();
    await first.loadRecords();
    expect(fetchMock).toHaveBeenCalledWith("https://medsync.test/api/mobile/visit-summaries", {
      headers: { Authorization: "Bearer tok" },
    });
    expect(await AsyncStorage.getItem("medsync-records-v1:u1")).toContain('"id":"s1"');

    const second = await load(); // a fresh start of the app, offline
    await second.loadRecords();
    expect(second.peekRecords()).toMatchObject({
      status: "ready",
      fromPhone: true,
      message: "Couldn't reach MedSync. Showing what was saved on this phone.",
      items: [{ id: "s1" }],
    });
  });
});
