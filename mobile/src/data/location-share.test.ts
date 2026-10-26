import {
  clockWords,
  isMissingTable,
  leftWords,
  SHARE_OFF,
  shareLink,
  shareMinutes,
  shouldWrite,
  startShare,
  stopShare,
} from "@/data/location-share";

const mockInsertResult = jest.fn();
const mockUpdateResult = jest.fn();
const mockInsert = jest.fn();
const mockRemove = jest.fn();

jest.mock("@/lib/supabase", () => {
  const thenable = (result: () => unknown) => {
    const q: Record<string, unknown> = {};
    for (const m of ["eq", "is"]) q[m] = () => q;
    q.then = (ok: (v: unknown) => unknown, bad?: (e: unknown) => unknown) =>
      Promise.resolve(result()).then(ok, bad);
    return q;
  };
  return {
    supabase: {
      auth: { getSession: async () => ({ data: { session: { user: { id: "u1" } } } }) },
      from: () => ({
        insert: (row: unknown) => {
          mockInsert(row);
          return { select: () => ({ single: () => mockInsertResult() }) };
        },
        update: () => thenable(() => mockUpdateResult()),
      }),
    },
  };
});

const mockPerm = jest.fn();
jest.mock("expo-location", () => ({
  Accuracy: { Balanced: 3 },
  requestForegroundPermissionsAsync: () => mockPerm(),
  getForegroundPermissionsAsync: () => mockPerm(),
  watchPositionAsync: async () => ({ remove: mockRemove }),
}));

describe("location share: the rules", () => {
  it("'until I stop' is the table's 8-hour cap", () => {
    expect(shareMinutes(15)).toBe(15);
    expect(shareMinutes(60)).toBe(60);
    expect(shareMinutes("until stopped")).toBe(480);
  });

  it("makes the family link only when the build knows the web origin", () => {
    expect(shareLink("ab", "https://medsync.test/")).toBe("https://medsync.test/share/location/ab");
    expect(shareLink("ab", "")).toBeNull();
    expect(shareLink("ab", undefined)).toBeNull();
  });

  it("says the end time and time left in plain words", () => {
    expect(clockWords(new Date(2026, 9, 18, 9, 5))).toBe("09:05");
    const now = new Date(2026, 9, 18, 12, 0);
    expect(leftWords(new Date(2026, 9, 18, 12, 0), now)).toBe("ending now");
    expect(leftWords(new Date(2026, 9, 18, 12, 14, 30), now)).toBe("15 min left");
    expect(leftWords(new Date(2026, 9, 18, 13, 0), now)).toBe("1 h left");
    expect(leftWords(new Date(2026, 9, 18, 14, 10), now)).toBe("2 h 10 min left");
  });

  it("writes at most once every 20 seconds", () => {
    expect(shouldWrite(null, 0)).toBe(true);
    expect(shouldWrite(0, 19_999)).toBe(false);
    expect(shouldWrite(0, 20_000)).toBe(true);
  });

  it("knows a missing table from any other error", () => {
    expect(isMissingTable({ code: "PGRST205" })).toBe(true);
    expect(isMissingTable({ message: 'relation "location_shares" does not exist' })).toBe(true);
    expect(isMissingTable({ code: "23514", message: "violates check constraint" })).toBe(false);
    expect(isMissingTable(null)).toBe(false);
  });
});

describe("location share: start and stop", () => {
  beforeEach(() => {
    mockPerm.mockResolvedValue({ granted: true });
    mockUpdateResult.mockReturnValue({ error: null });
    mockInsert.mockReset();
  });

  it("asks for location first and stops there when refused", async () => {
    mockPerm.mockResolvedValue({ granted: false });
    const res = await startShare("emergency", 15);
    expect(res.ok).toBe(false);
    expect(mockInsert).not.toHaveBeenCalled();
  });

  it("says it is not switched on before 0185, never crashes", async () => {
    mockInsertResult.mockResolvedValue({ data: null, error: { code: "PGRST205" } });
    expect(await startShare("visit", 60)).toEqual({ ok: false, error: SHARE_OFF });
  });

  it("inserts without a token, inside the 8-hour window, and returns the link", async () => {
    process.env.EXPO_PUBLIC_WEB_ORIGIN = "https://medsync.test";
    const token = "a".repeat(64);
    mockInsertResult.mockResolvedValue({
      data: { id: "s1", token, ends_at: new Date(Date.now() + 3600_000).toISOString() },
      error: null,
    });
    const res = await startShare("visit", "until stopped");
    expect(res).toEqual({ ok: true, link: `https://medsync.test/share/location/${token}` });
    const row = mockInsert.mock.calls[0][0] as Record<string, string>;
    expect(row).not.toHaveProperty("token");
    expect(row).toMatchObject({ purpose: "visit", consent_version: "location-share-v1" });
    expect(Date.parse(row.ends_at) - Date.parse(row.started_at)).toBe(8 * 3600_000);
  });

  it("keeps the share when the stop cannot reach the database, then stops on retry", async () => {
    mockUpdateResult.mockReturnValue({ error: { message: "Failed to fetch" } });
    expect(await stopShare()).toMatch(/Couldn't reach MedSync/);
    expect(mockRemove).not.toHaveBeenCalled();
    mockUpdateResult.mockReturnValue({ error: null });
    expect(await stopShare()).toBeNull();
    expect(mockRemove).toHaveBeenCalled();
  });
});
