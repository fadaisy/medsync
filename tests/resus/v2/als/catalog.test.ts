import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import { ALS_CATALOG, ALS_REFS } from "@/lib/resus/reference/als-catalog";
import * as C from "@/lib/resus/reference/als-catalog";
import { PENDING_CSO, refValue } from "@/lib/resus/reference/ref";

/**
 * The ALS reference file mirrors docs/clinical/resus-als-clinical-catalog.md: one signed entry per
 * ALS-* row, every URL from the source key, NOT ENCODED rows without a value, and the engine
 * constants equal to the catalog numbers. UI-text rows are covered here by rule ID.
 */

const doc = readFileSync(
  resolve(__dirname, "../../../../docs/clinical/resus-als-clinical-catalog.md"),
  "utf8",
);
const docIds = [...doc.matchAll(/^\| (ALS-[A-Z]+-\d+)\s*\|/gm)].map((m) => m[1]!);

function expectRef(id: string, value?: string | RegExp) {
  const e = ALS_REFS[id];
  expect(e, id).toBeDefined();
  expect(e!.status).toBe("signed");
  expect(e!.verifiedOn).toBe("2026-09-23");
  expect(e!.url).toMatch(/^https:\/\/|^docs\/clinical\//);
  if (value !== undefined) expect(refValue(e!)).toMatch(value);
}

describe("catalog ↔ reference file", () => {
  it("every ALS-* row of the catalog has exactly one signed reference entry", () => {
    expect(docIds.length).toBeGreaterThan(100);
    expect(Object.keys(ALS_REFS).sort()).toEqual([...new Set(docIds)].sort());
    expect(
      Object.values(ALS_REFS).every((e) => e.status === "signed" && refValue(e) !== PENDING_CSO),
    ).toBe(true);
  });

  it("design / CSO-decision rows are marked design; sourced rows verified-web", () => {
    expect(ALS_REFS["ALS-REC-04"]!.confidence).toBe("design");
    expect(ALS_REFS["ALS-ADR-01"]!.confidence).toBe("verified-web");
    expect(ALS_CATALOG.some((e) => e.id.startsWith("ALS-DTH"))).toBe(false);
  });

  it("the engine constants equal the catalog numbers", () => {
    expect([C.CYCLE_MS, C.CYCLE_PREPARE_MS, C.CYCLE_OVERDUE_MS]).toEqual([
      120_000, 105_000, 135_000,
    ]);
    expect([C.ADRENALINE_OPEN_MS, C.ADRENALINE_OVERDUE_MS]).toEqual([180_000, 300_000]);
    expect([C.HYPOTHERMIC_ADRENALINE_OPEN_MS, C.HYPOTHERMIC_ADRENALINE_OVERDUE_MS]).toEqual([
      360_000, 600_000,
    ]);
    expect([
      C.AMIODARONE_FIRST_MG,
      C.AMIODARONE_SECOND_MG,
      C.LIDOCAINE_FIRST_MG,
      C.LIDOCAINE_SECOND_MG,
    ]).toEqual([300, 150, 100, 50]);
    expect([
      C.ANTIARRHYTHMIC_FIRST_AFTER_SHOCKS,
      C.ANTIARRHYTHMIC_SECOND_AFTER_SHOCKS,
      C.ADRENALINE_AFTER_SHOCKS,
    ]).toEqual([3, 5, 3]);
    expect([C.IV_FAILED_ATTEMPTS_FOR_IO, C.STACK_MAX_SHOCKS, C.REFRACTORY_VF_SHOCKS]).toEqual([
      2, 3, 3,
    ]);
    expect([
      C.HYPOTHERMIA_WITHHOLD_BELOW_C,
      C.HYPOTHERMIA_UPPER_C,
      C.PERIPHERAL_PROMPT_BELOW_C,
    ]).toEqual([30, 35, 32]);
    expect([C.ROSC_SUSTAINED_MS, C.DEATH_OBSERVATION_MS]).toEqual([1_200_000, 300_000]);
    expect([C.PE_LYSIS_CPR_MIN_MIN, C.PE_LYSIS_CPR_MAX_MIN, C.ERC_TOR_MIN, C.RCUK_TOR_MIN]).toEqual(
      [60, 90, 20, 45],
    );
    expect([C.ETCO2_PE_HINT_BELOW_KPA, C.ADULT_MIN_AGE_YEARS]).toEqual([1.7, 16]);
  });
});

describe("NOT ENCODED rows never carry a number", () => {
  it("ALS-ADR-06: small-increment adrenaline has no value and no number in its text", () => {
    expect(ALS_REFS["ALS-ADR-06"]!.value).toBeUndefined();
    expect(ALS_REFS["ALS-ADR-06"]!.text).not.toMatch(/\d+\s*(µg|mcg)/);
  });
  it("ALS-DRG-03: CPR-induced consciousness sedation doses are not encoded", () => {
    expect(ALS_REFS["ALS-DRG-03"]!.value).toBeUndefined();
  });
  it("ALS-MOD-07: no hysterotomy minute target is encoded", () => {
    expect(ALS_REFS["ALS-MOD-07"]!.value).toBeUndefined();
    expect(ALS_REFS["ALS-MOD-07"]!.text).not.toMatch(/\d+\s*min/);
  });
});

describe("UI-text rows (shown by the console, no engine logic)", () => {
  it("ALS-REC-03: monitored-patient hint — SBP stays < 50 mmHg", () =>
    expectRef("ALS-REC-03", /< 50/));
  it("ALS-REC-05: triage Rapid-Red opens straight into the console", () => expectRef("ALS-REC-05"));
  it("ALS-REC-06: a treatment-limitation decision is shown, never suppresses CPR", () =>
    expectRef("ALS-REC-06"));
  it("ALS-REC-07: CPR-not-attempted needs a reason", () => expectRef("ALS-REC-07"));
  it("ALS-REC-08: family presence prompt", () => expectRef("ALS-REC-08"));
  it("ALS-REC-09: Utstein fields after, never before CPR", () => expectRef("ALS-REC-09"));
  it("ALS-CPR-01: compression rate 100–120 /min", () => expectRef("ALS-CPR-01", /100–120/));
  it("ALS-CPR-02: depth ≥ 5 cm, ≤ 6 cm", () => expectRef("ALS-CPR-02", /≥ 5 cm, ≤ 6 cm/));
  it("ALS-CPR-04: identify the rhythm within 5 s", () => expectRef("ALS-CPR-04", /^5$/));
  it("ALS-CPR-05: peri-shock pause < 5 s", () => expectRef("ALS-CPR-05", /< 5/));
  it("ALS-CPR-07: stop early only on a combination of ROSC signs", () => expectRef("ALS-CPR-07"));
  it("ALS-CPR-08: filtered-ECG asystole needs no pause", () => expectRef("ALS-CPR-08"));
  it("ALS-CPR-09: never shock during manual compressions", () => expectRef("ALS-CPR-09"));
  it("ALS-CPR-10: oxygen ≥ 1 m from the chest at shock", () => expectRef("ALS-CPR-10", /≥ 1/));
  it("ALS-CPR-13: optional metronome 110 /min, off by default", () =>
    expectRef("ALS-CPR-13", /110/));
  it("ALS-SHK-06: pads > 8 cm from an ICD / pacemaker", () => expectRef("ALS-SHK-06", /> 8/));
  it("ALS-NRG-03: profile-entry reference energies (never a default)", () =>
    expectRef("ALS-NRG-03", /≥ 150 J/));
  it("ALS-ADR-07: fast path records 1:10,000", () => expectRef("ALS-ADR-07", /1:10,000/));
  it("ALS-AIR-02: intubation competence and < 5 s interruption", () =>
    expectRef("ALS-AIR-02", /95 %/));
  it("ALS-AIR-05: failed airway — cricothyroidotomy is record only", () => expectRef("ALS-AIR-05"));
  it("ALS-AIR-06: ventilator-during-CPR text reference", () =>
    expectRef("ALS-AIR-06", /Vt 6–8 mL\/kg/));
  it("ALS-ETC-04: physiology-guided CPR targets (text)", () => expectRef("ALS-ETC-04", /3\.3 kPa/));
  it("ALS-POC-01: POCUS is never the sole basis for stopping", () => expectRef("ALS-POC-01"));
  it("ALS-DEV-01: mechanical CPR / ECPR are capability flags", () =>
    expectRef("ALS-DEV-01", /capability/));
  it("ALS-DRG-01: fluids only for hypovolaemia", () => expectRef("ALS-DRG-01"));
  it("ALS-DRG-02: calcium / bicarbonate / steroids not routine", () => expectRef("ALS-DRG-02"));
  it("ALS-DRG-05: the fast path runs the prescribing safety check", () => expectRef("ALS-DRG-05"));
  it("ALS-RC-03: hyper/hypokalaemic arrest treatment numbers are signed", () =>
    expectRef("ALS-RC-03", /50 mmol/));
});
