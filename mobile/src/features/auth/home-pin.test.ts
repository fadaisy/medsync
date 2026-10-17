import { saveHomePin } from "@/data/signup";
import { pinLatLng } from "@/features/auth/map-pin";
import { HOME_PIN_CONSENT } from "@/features/auth/rules";

const mockUpdate = jest.fn();
const mockEq = jest.fn();
const mockGetSession = jest.fn();

jest.mock("@/lib/supabase", () => ({
  supabase: {
    auth: { getSession: () => mockGetSession() },
    from: () => ({
      update: (row: unknown) => (mockUpdate(row), { eq: (...a: unknown[]) => mockEq(...a) }),
    }),
  },
}));

beforeEach(() => {
  mockUpdate.mockReset();
  mockEq.mockReset();
  mockGetSession.mockReset();
  mockGetSession.mockResolvedValue({ data: { session: { user: { id: "u1" } } } });
});

describe("home pin", () => {
  it("is no place without a location fix", () => {
    expect(pinLatLng({ x: 175, y: 110 }, null)).toBeNull();
    expect(pinLatLng({ x: 175, y: 110 }, { lat: 0.35, lng: 32.56 })).toEqual({
      lat: 0.35,
      lng: 32.56,
    });
  });

  it("writes all four columns together on the patient's own row", async () => {
    mockEq.mockResolvedValue({ error: null });
    const ok = await saveHomePin(
      { lat: 0.3512345678, lng: 32.5698765432 },
      HOME_PIN_CONSENT.version,
      new Date("2026-10-17T09:00:00Z"),
    );
    expect(ok).toBe(true);
    expect(mockUpdate).toHaveBeenCalledWith({
      home_pin_lat: 0.351235,
      home_pin_lng: 32.569877,
      home_pin_consent_version: "home-pin-v1",
      home_pin_consented_at: "2026-10-17T09:00:00.000Z",
    });
    expect(mockEq).toHaveBeenCalledWith("id", "u1");
  });

  it("says not saved when the database refuses (0170 not applied) or nobody is signed in", async () => {
    mockEq.mockResolvedValue({ error: { message: 'column "home_pin_lat" does not exist' } });
    expect(await saveHomePin({ lat: 0, lng: 0 }, "home-pin-v1", new Date())).toBe(false);
    mockGetSession.mockResolvedValue({ data: { session: null } });
    expect(await saveHomePin({ lat: 0, lng: 0 }, "home-pin-v1", new Date())).toBe(false);
  });
});
