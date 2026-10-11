import { afterEach, describe, expect, it, vi } from "vitest";

import { CRITICAL_FLAGGING_NOTICE } from "@/content/lab";
import { labWorkspaceLiveFor } from "@/lib/lab/feature";

/** Lab Phase 0 — the LAB_WORKSPACE flag (Law 11, D-LAB0-15) and its production gate (CF-3). */
describe("LAB_WORKSPACE", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("is off by default", () => {
    vi.stubEnv("LAB_WORKSPACE", "");
    expect(labWorkspaceLiveFor("h1")).toBe(false);
  });

  it("'1' turns it on everywhere; a list turns it on per hospital", () => {
    vi.stubEnv("LAB_WORKSPACE", "1");
    expect(labWorkspaceLiveFor("h1")).toBe(true);
    vi.stubEnv("LAB_WORKSPACE", " h1 , h2 ");
    expect(labWorkspaceLiveFor("h2")).toBe(true);
    expect(labWorkspaceLiveFor("h3")).toBe(false);
  });

  it("CF-3: production refuses it while the notice wording is unsigned", () => {
    // The shipped wording is signed (2026-10-10); the gate is proven on a draft copy.
    vi.spyOn(CRITICAL_FLAGGING_NOTICE, "status", "get").mockReturnValue("draft");
    vi.stubEnv("LAB_WORKSPACE", "1");
    vi.stubEnv("VERCEL_ENV", "production");
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(labWorkspaceLiveFor("h1")).toBe(false);
    vi.stubEnv("VERCEL_ENV", "preview");
    expect(labWorkspaceLiveFor("h1")).toBe(true);
    warn.mockRestore();
    vi.restoreAllMocks();
  });

  it("CF-3: with the wording signed, production allows it", () => {
    expect(CRITICAL_FLAGGING_NOTICE.status).toBe("signed");
    vi.stubEnv("LAB_WORKSPACE", "1");
    vi.stubEnv("VERCEL_ENV", "production");
    expect(labWorkspaceLiveFor("h1")).toBe(true);
  });
});

describe("Lab Phase 1 flags (Law 14)", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("are off by default and live only inside the lab workspace", async () => {
    const { labCriticalsLiveFor, labDowntimeLiveFor, labUnitsRangesLiveFor } =
      await import("@/lib/lab/feature");
    vi.stubEnv("LAB_WORKSPACE", "");
    vi.stubEnv("LAB_CRITICALS", "1");
    vi.stubEnv("LAB_UNITS_RANGES", "1");
    vi.stubEnv("LAB_DOWNTIME", "1");
    expect([
      labCriticalsLiveFor("h1"),
      labUnitsRangesLiveFor("h1"),
      labDowntimeLiveFor("h1"),
    ]).toEqual([false, false, false]);
    vi.stubEnv("LAB_WORKSPACE", "1");
    vi.stubEnv("LAB_UNITS_RANGES", "h2");
    vi.stubEnv("LAB_DOWNTIME", "");
    expect([
      labCriticalsLiveFor("h1"),
      labUnitsRangesLiveFor("h1"),
      labDowntimeLiveFor("h1"),
    ]).toEqual([true, false, false]);
    expect(labUnitsRangesLiveFor("h2")).toBe(true);
  });

  it("S19: production refuses LAB_CRITICALS while the alert wording (Appendix A) is a draft", async () => {
    const { labCriticalsLiveFor } = await import("@/lib/lab/feature");
    const { CRITICALS_COPY_STATUS } = await import("@/content/lab-criticals");
    expect(CRITICALS_COPY_STATUS.status).toBe("draft"); // unsigned in this slice
    vi.stubEnv("LAB_WORKSPACE", "1");
    vi.stubEnv("LAB_CRITICALS", "1");
    vi.stubEnv("VERCEL_ENV", "production");
    expect(labCriticalsLiveFor("h1")).toBe(false);
    vi.stubEnv("VERCEL_ENV", "preview");
    expect(labCriticalsLiveFor("h1")).toBe(true);
  });
});
