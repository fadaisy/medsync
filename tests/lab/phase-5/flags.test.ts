import { afterEach, describe, expect, it, vi } from "vitest";

/**
 * Lab Phase 5 flags (gate-a-proposal §2 A17): off by default; each needs the workspace and units and ranges; the
 * results-ready SMS needs patient results; all four stay off in production while the Phase 5 copy is a draft (CF-3).
 */
const H = "00000000-0000-0000-0000-0000000000a1";
const BASE = ["LAB_WORKSPACE", "LAB_UNITS_RANGES"];
const FOUR = ["LAB_DELTA_CHECKS", "IPC_LAB_FEED", "PATIENT_RESULTS", "PATIENT_RESULTS_SMS"];
const all = async () => {
  vi.resetModules();
  const f = await import("@/lib/lab/feature");
  return [
    f.labDeltaChecksLiveFor(H),
    f.ipcLabFeedLiveFor(H),
    f.patientResultsLiveFor(H),
    f.patientResultsSmsLiveFor(H),
  ];
};

describe("Lab Phase 5 flags", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("off by default; on with their prerequisites; the SMS needs patient results", async () => {
    for (const e of [...BASE, ...FOUR]) vi.stubEnv(e, "");
    expect(await all()).toEqual([false, false, false, false]);
    for (const e of [...BASE, ...FOUR]) vi.stubEnv(e, "1");
    expect(await all()).toEqual([true, true, true, true]);
    vi.stubEnv("PATIENT_RESULTS", "");
    expect(await all()).toEqual([true, true, false, false]);
    vi.stubEnv("LAB_UNITS_RANGES", "");
    expect(await all()).toEqual([false, false, false, false]);
  });

  it("CF-3: production refuses all four while the Phase 5 copy is a draft", async () => {
    const { LAB5_COPY_STATUS } = await import("@/content/lab-phase-5");
    if (LAB5_COPY_STATUS.status !== "draft") return; // once signed, production honours them
    for (const e of [...BASE, ...FOUR]) vi.stubEnv(e, "1");
    vi.stubEnv("VERCEL_ENV", "production");
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(await all()).toEqual([false, false, false, false]);
    warn.mockRestore();
  });
});
