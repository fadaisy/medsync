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
    // The shipped wording is signed (CSO, 2026-10-12): production allows it.
    expect(CRITICALS_COPY_STATUS).toMatchObject({ status: "signed", signedBy: "Fadhul (CSO)" });
    vi.stubEnv("LAB_WORKSPACE", "1");
    vi.stubEnv("LAB_CRITICALS", "1");
    vi.stubEnv("VERCEL_ENV", "production");
    expect(labCriticalsLiveFor("h1")).toBe(true);
    // The gate, proven on a draft copy: refused in production, allowed elsewhere.
    vi.spyOn(CRITICALS_COPY_STATUS, "status", "get").mockReturnValue("draft");
    expect(labCriticalsLiveFor("h1")).toBe(false);
    vi.stubEnv("VERCEL_ENV", "preview");
    expect(labCriticalsLiveFor("h1")).toBe(true);
  });
});

describe("Lab Phase 3 flags (gate-a-proposal §13)", () => {
  afterEach(() => vi.unstubAllEnvs());
  const ENVS = [
    "LAB_STOCK",
    "LAB_EQUIPMENT",
    "LAB_QC",
    "LAB_QC_HOLD",
    "LAB_EQA",
    "LAB_POCT_QUALITY",
    "LAB_HMIS",
    "LAB_REPORTS",
  ];
  const all = async () => {
    const f = await import("@/lib/lab/feature");
    return [
      f.labStockLiveFor,
      f.labEquipmentLiveFor,
      f.labQcLiveFor,
      f.labQcHoldLiveFor,
      f.labEqaLiveFor,
      f.labPoctQualityLiveFor,
      f.labHmisLiveFor,
      f.labReportsLiveFor,
    ].map((live) => live("h1"));
  };

  it("are off by default, live only inside the lab workspace, and stack as §13 says", async () => {
    vi.stubEnv("LAB_WORKSPACE", "1");
    expect(await all()).toEqual(Array(8).fill(false));
    for (const e of ENVS) vi.stubEnv(e, "1");
    vi.stubEnv("LAB_WORKSPACE", "");
    expect(await all()).toEqual(Array(8).fill(false));
    vi.stubEnv("LAB_WORKSPACE", "1");
    // QC needs stock and units/ranges; the hold needs QC; bedside quality needs bedside and stock.
    expect(await all()).toEqual([true, true, false, false, true, false, true, true]);
    vi.stubEnv("LAB_UNITS_RANGES", "1");
    vi.stubEnv("LAB_BEDSIDE", "1");
    expect(await all()).toEqual(Array(8).fill(true));
    vi.stubEnv("LAB_STOCK", "");
    expect(await all()).toEqual([false, true, false, false, true, false, true, true]);
  });

  it("CF-3: production refuses all eight while the Phase 3 copy is a draft", async () => {
    const { LAB3_COPY_STATUS } = await import("@/content/lab-phase-3");
    expect(LAB3_COPY_STATUS.status).toBe("draft");
    for (const e of [...ENVS, "LAB_WORKSPACE", "LAB_UNITS_RANGES", "LAB_BEDSIDE"])
      vi.stubEnv(e, "1");
    vi.stubEnv("VERCEL_ENV", "production");
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(await all()).toEqual(Array(8).fill(false));
    warn.mockRestore();
  });

  it("Appendix A is in the product word for word (§14), with the nine HM-3 counting rules (§8.3)", async () => {
    const { readFileSync } = await import("node:fs");
    const { LAB3 } = await import("@/content/lab-phase-3");
    const doc = readFileSync("docs/lab/phase-3/gate-a-proposal.md", "utf8");
    const rows = doc
      .slice(doc.indexOf("## 14. Appendix A"), doc.indexOf("## 15. Hazard log"))
      .split("\n")
      .map((l) => l.match(/^\| `(\w+)`\s*\| (.*?)\s*\| .*?\| draft\s*\|$/))
      .filter((m): m is RegExpMatchArray => m !== null && m[1] !== "hmisCountingRules");
    expect(rows).toHaveLength(29);
    for (const [, key, text] of rows) expect(LAB3[key as keyof typeof LAB3], key).toBe(text);
    const rules = doc
      .slice(doc.indexOf("### 8.3"), doc.indexOf("## 9. Sign-off"))
      .split("\n")
      .map((l) => l.match(/^\| \(\w\)\s*\| (.*?)\s*\|/)?.[1])
      .filter(Boolean);
    expect(LAB3.hmisCountingRules).toEqual(rules);
  });
});
