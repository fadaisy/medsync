import { describe, expect, it } from "vitest";

import { NETWORK_UI } from "@/content/pharmacy-network";
import {
  DEMO_MEDICINES,
  DEMO_SAVE,
  demoIdentities,
  demoPatientRefills,
  demoRefillRows,
  demoRenewals,
  guard,
} from "@/lib/pharmacy/network-demo";

describe("Phase 4 demo catalogue", () => {
  const rows = demoRefillRows();
  const ids = demoIdentities();

  it("fills every built tab, every timing word and channel; the partner tab waits for Step 6", () => {
    const tabs = new Set(rows.map((r) => r.tab));
    for (const t of Object.keys(NETWORK_UI.refills.tabs))
      expect(tabs.has(t as never), t).toBe(t !== "partner");
    expect(rows.some((r) => r.timing.late)).toBe(true);
    expect(rows.some((r) => r.timing.early)).toBe(true);
    expect(new Set(rows.map((r) => r.channel))).toEqual(new Set(["app", "window", "phone"]));
    expect(rows.every((r) => ids[r.patientUserId])).toBe(true);
  });

  it("names patients by record number only, and medicines without strengths or doses", () => {
    expect(Object.values(ids).every((i) => i.name === "" && /^MS-DEMO-\d{4}$/.test(i.mrn))).toBe(
      true,
    );
    expect(demoRenewals().every((r) => r.name === "")).toBe(true);
    for (const m of DEMO_MEDICINES) expect(m).not.toMatch(/\d|\b(mg|mcg|ml|units?)\b/i);
  });

  it("covers every renewal reason and every patient sentence", () => {
    expect(new Set(demoRenewals().map((r) => r.reason))).toEqual(
      new Set(Object.keys(NETWORK_UI.renewalReasons)),
    );
    const p = demoPatientRefills().repeats;
    expect(p.some((r) => r.canAsk)).toBe(true);
    expect(p.some((r) => r.canAskClinic)).toBe(true);
    expect(new Set(p.map((r) => r.request)).size).toBeGreaterThanOrEqual(5);
  });

  it("saves nothing in demo mode", async () => {
    let called = false;
    const save = guard(true, async () => {
      called = true;
      return { ok: true, id: "x", serverTime: "" };
    });
    expect(await save("k", new FormData())).toMatchObject({ ok: false, error: DEMO_SAVE });
    expect(called).toBe(false);
  });
});
