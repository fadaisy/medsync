import type { ManifestItemInput, ManifestState } from "@/lib/lab/manifest";
import { describe, expect, it } from "vitest";

import {
  canMoveManifest,
  manifestNumber,
  manifestRows,
  printLabel,
  readiness,
  receiptOutcome,
} from "@/lib/lab/manifest";

/** Lab Phase 4 Step 3: manifests (MF-1..MF-4, RF-6, A18). Every number and code is a FIXTURE. */
const item = (o: Partial<ManifestItemInput> = {}): ManifestItemInput => ({
  labNumber: "L00000622",
  theirIds: ["RL-55120"],
  specimenWords: "Serum",
  containers: 1,
  testWords: "Lipid profile",
  partnerCode: "FIXTURE-LIPID",
  restricted: false,
  collectedAt: new Date("2026-10-13T05:41:00Z"),
  ...o,
});

describe("MF-1, A18: the printed rows", () => {
  it("MF-1 rows carry lab numbers, their identifiers, specimen, containers, test and collected time only", () => {
    const rows = manifestRows([item(), item({ labNumber: "L00000625", theirIds: ["RL-55121"] })]);
    expect(rows.map((r) => Object.keys(r).sort())).toEqual([
      ["collectedAt", "containers", "labNumber", "position", "specimen", "test", "theirIds"],
      ["collectedAt", "containers", "labNumber", "position", "specimen", "test", "theirIds"],
    ]);
    expect(rows.map((r) => r.position)).toEqual([1, 2]);
  });

  it("MF-1 nothing about the patient can be passed in, so nothing can be printed (type-level)", () => {
    // @ts-expect-error — a manifest item has no patient name
    item({ patientName: "Fixture Twelve" });
    // @ts-expect-error — nor a hospital number
    item({ hospitalNumber: "MS-2026-00034" });
  });

  it("A18 a restricted test prints the partner's code and the word Restricted, never its name", () => {
    const [r] = manifestRows([
      item({ restricted: true, testWords: "HIV viral load", partnerCode: "FIXTURE-VL" }),
    ]);
    expect(r!.test).toBe("FIXTURE-VL · Restricted");
    expect(JSON.stringify(r)).not.toMatch(/HIV/);
  });
});

describe("RF-6: Add to manifest waits for every identifier and packing item", () => {
  it("S5 disabled with the reason in words until both form numbers and every item are done", () => {
    const base = {
      requiredIds: ["form"],
      packingItems: ["triple", "forms", "cool"],
      unmappedTests: [],
    };
    const none = readiness({ ...base, scanned: {}, ticked: [] });
    expect(none).toMatchObject({ ready: false, missingIds: 1, missingItems: 3 });
    expect(none.reason).toBe("Scan 1 more form numbers and tick 3 packing items first.");
    const done = readiness({
      ...base,
      scanned: { form: "RL-55120" },
      ticked: ["triple", "forms", "cool"],
    });
    expect(done).toMatchObject({ ready: true, reason: null });
  });

  it("RF-6 a blank scan does not count, and an unmapped test blocks (Map before sending)", () => {
    expect(
      readiness({
        requiredIds: ["form"],
        scanned: { form: "  " },
        packingItems: [],
        ticked: [],
        unmappedTests: [],
      }).ready,
    ).toBe(false);
    const r = readiness({
      requiredIds: [],
      scanned: {},
      packingItems: [],
      ticked: [],
      unmappedTests: ["test.fixture"],
    });
    expect(r).toMatchObject({ ready: false, unmapped: ["test.fixture"] });
  });
});

describe("MF-2..MF-4", () => {
  it("MF-3 forward only: open → sealed → handed over → received or discrepancy", () => {
    const S: ManifestState[] = ["open", "sealed", "handed_over", "received", "discrepancy"];
    const ok = new Set([
      "open>sealed",
      "sealed>handed_over",
      "handed_over>received",
      "handed_over>discrepancy",
    ]);
    for (const a of S)
      for (const b of S) expect(canMoveManifest(a, b), `${a}>${b}`).toBe(ok.has(`${a}>${b}`));
  });

  it("S11 any broken, leaking or missing package, or fewer received, is a discrepancy", () => {
    expect(receiptOutcome({ condition: ["intact"], sent: 3, received: 3 })).toBe("received");
    expect(receiptOutcome({ condition: ["broken"], sent: 3, received: 3 })).toBe("discrepancy");
    expect(receiptOutcome({ condition: ["intact"], sent: 3, received: 2 })).toBe("discrepancy");
  });

  it("MF-2 numbers and MF-4 reprints", () => {
    expect(manifestNumber(2026, 141)).toBe("MF-2026-0141");
    expect(printLabel(true)).toBe("Copy");
    expect(printLabel(false)).toBeNull();
  });
});
