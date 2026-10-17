import { afterEach, describe, expect, it, vi } from "vitest";

/**
 * Lab Phase 4 flags (gate-a-proposal §2 A16, D-LAB4-26, A13): off by default; `labReferral` needs the one menu,
 * the high-risk mark and units and ranges; `labExchange` needs `labReferral`; both stay off in production while
 * the Phase 4 copy is a draft (CF-3).
 */
const H = "00000000-0000-0000-0000-0000000000a1";
const BASE = ["LAB_WORKSPACE", "LAB_ONE_MENU", "LAB_HIGH_RISK", "LAB_UNITS_RANGES"];
const both = async () => {
  vi.resetModules();
  const f = await import("@/lib/lab/feature");
  return [f.labReferralLiveFor(H), f.labExchangeLiveFor(H)];
};

describe("Lab Phase 4 flags", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("off by default", async () => {
    for (const e of [...BASE, "LAB_REFERRAL", "LAB_EXCHANGE"]) vi.stubEnv(e, "");
    expect(await both()).toEqual([false, false]);
  });

  it("labReferral needs the one menu, the high-risk mark and units and ranges; labExchange needs labReferral", async () => {
    for (const e of [...BASE, "LAB_REFERRAL", "LAB_EXCHANGE"]) vi.stubEnv(e, "1");
    expect(await both()).toEqual([true, true]);
    for (const missing of ["LAB_ONE_MENU", "LAB_HIGH_RISK", "LAB_UNITS_RANGES"]) {
      vi.stubEnv(missing, "");
      expect(await both(), missing).toEqual([false, false]);
      vi.stubEnv(missing, "1");
    }
    vi.stubEnv("LAB_REFERRAL", "");
    expect(await both()).toEqual([false, false]);
    vi.stubEnv("LAB_REFERRAL", H);
    vi.stubEnv("LAB_EXCHANGE", "");
    expect(await both()).toEqual([true, false]);
  });

  it("CF-3: production refuses both while the Phase 4 copy is a draft", async () => {
    const { LAB4_COPY_STATUS } = await import("@/content/lab-phase-4");
    expect(LAB4_COPY_STATUS.status).toBe("draft");
    for (const e of [...BASE, "LAB_REFERRAL", "LAB_EXCHANGE"]) vi.stubEnv(e, "1");
    vi.stubEnv("VERCEL_ENV", "production");
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(await both()).toEqual([false, false]);
    warn.mockRestore();
  });
});
