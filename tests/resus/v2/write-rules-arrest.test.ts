import { describe, expect, it } from "vitest";

import { arrestSeqForDeclaration } from "@/lib/resus/als/rosc";
import {
  ADRENALINE_DOSE_TEXT,
  AMIODARONE_FIRST_MG,
  AMIODARONE_SECOND_MG,
  LIDOCAINE_FIRST_MG,
  LIDOCAINE_SECOND_MG,
} from "@/lib/resus/reference/als-catalog";
import {
  ARREST_CALL_FALLBACK_PLACE,
  arrestCallTarget,
  declarationSeqAt,
  fastPathDoseMg,
  isChild,
  roscProblem,
  stopProblem,
} from "@/lib/resus/v2-rules";
import { closeOutcomeProblem } from "@/lib/resus/v2-rules-closeout";
import { declare, ev, min, rosc, started, stop } from "./als/fixtures";

/**
 * Resus Desk v2 write rules — arrest-side (lib/resus/v2-rules.ts). What the
 * server actions check before a write: judged at the BEDSIDE time, never at
 * the time an offline queue delivered the entry.
 */

describe("arrest sequence at the bedside time (ALS-ROSC-04/05)", () => {
  // ROSC at +10:00; the re-arrest is tapped at +25:00 (15 min later) and delivered at +32:00.
  const record = [...started(), rosc(min(10))];

  it("ALS-ROSC-04: a re-arrest tapped 15 min after ROSC continues the same arrest, however late it lands", () => {
    expect(declarationSeqAt(record, min(25))).toBe(1);
    // The delivery time would have split one arrest into two.
    expect(arrestSeqForDeclaration(record, min(32))).toBe(2);
  });

  it("ALS-ROSC-05: a re-arrest tapped after 20 min of ROSC opens a new arrest", () => {
    expect(declarationSeqAt(record, min(31))).toBe(2);
  });

  it("ALS-ROSC-04: marks recorded after the bedside time do not decide it", () => {
    // Another device recorded a (later) stop of arrest 1 at +27:00.
    expect(declarationSeqAt([...record, stop(min(27))], min(25))).toBe(1);
  });
});

describe("stop resuscitation only during an arrest (LC-06)", () => {
  it("LC-06: a stop after a recorded ROSC is refused — declare re-arrest first", () => {
    expect(stopProblem([...started(), rosc(min(10))], 1, min(12))).toMatch(/ROSC is already/);
  });

  it("LC-06: a stop tapped (bedside) before a ROSC another device recorded is accepted", () => {
    // Stop at +8:00 delivered late; ROSC at +10:00 is then signs of life (ALS-DTH-05).
    expect(stopProblem([...started(), rosc(min(10))], 1, min(8))).toBeNull();
  });

  it("LC-06: a running arrest can be stopped; a second stop and a stale arrest are refused", () => {
    expect(stopProblem(started(), 1, min(5))).toBeNull();
    expect(stopProblem([...started(), stop(min(5))], 1, min(6))).toMatch(/already recorded/);
    const second = [...started(), rosc(min(5)), declare(min(40), 2)];
    expect(stopProblem(second, 1, min(41))).toMatch(/Arrest #2/);
    expect(stopProblem([], 1, min(1))).toMatch(/No arrest/);
  });
});

describe("ROSC only for the current arrest (LC-06, ALS-DTH-05)", () => {
  it("LC-06: ROSC during the arrest is recorded", () => {
    expect(roscProblem(started(), 1, min(5))).toBeNull();
  });

  it("ALS-DTH-05: signs of life after a stop record ROSC (the observation is invalidated)", () => {
    expect(roscProblem([...started(), stop(min(20))], 1, min(22))).toBeNull();
  });

  it("LC-06: a second ROSC with no re-arrest, or a stale arrest number, is refused", () => {
    expect(roscProblem([...started(), rosc(min(10))], 1, min(11))).toMatch(/ROSC is already/);
    const second = [...started(), rosc(min(5)), declare(min(40), 2)];
    expect(roscProblem(second, 1, min(41))).toMatch(/Arrest #2/);
  });
});

describe("the close-out outcome matches the record (LC-02 / CO-UTS-08)", () => {
  const reArrest = [...started(), rosc(min(10)), declare(min(15))];

  it("CO-UTS-08: a ROSC outcome is refused while a re-arrest is running", () => {
    expect(closeOutcomeProblem("rosc_sustained", "icu", reArrest)).toMatch(/arrest is running/);
    expect(closeOutcomeProblem("rosc_not_sustained", "icu", reArrest)).toMatch(/running/);
  });

  it("CO-UTS-08: a ROSC outcome after ROSC (no arrest running) is accepted", () => {
    expect(closeOutcomeProblem("rosc_not_sustained", "icu", [...started(), rosc(min(10))])).toBe(
      null,
    );
    expect(closeOutcomeProblem("rosc_sustained", "icu", started())).toMatch(/No ROSC/);
  });

  it("LC-02: a death needs a confirmed death and the mortuary; stabilised needs no arrest", () => {
    expect(closeOutcomeProblem("died_after_cpr", "mortuary", started())).toMatch(/Confirm death/);
    const dead = [...started(), stop(min(20)), ev("death_confirmed", min(26), {})];
    expect(closeOutcomeProblem("died_after_cpr", "mortuary", dead)).toBeNull();
    expect(closeOutcomeProblem("died_after_cpr", "ward", dead)).toMatch(/mortuary/);
    expect(closeOutcomeProblem("stabilised", "ward", started())).toMatch(/running/);
    expect(closeOutcomeProblem("transferred_out", "icu", started())).toBeNull();
  });
});

describe("the arrest call names where the patient is (GATE A §9)", () => {
  it("GATE-A-9: the place is the episode's department, never the caller's", () => {
    expect(arrestCallTarget({ departmentId: "d-em", departmentName: "Emergency" })).toEqual({
      departmentId: "d-em",
      placeLabel: "Emergency",
    });
  });

  it("GATE-A-9: an episode with no department names a neutral place", () => {
    expect(arrestCallTarget({ departmentId: null, departmentName: null }).placeLabel).toBe(
      ARREST_CALL_FALLBACK_PLACE,
    );
  });
});

describe("fast-path doses are the signed constants (Law 3, D4, ALS-DRG-05)", () => {
  it("Law 3: amiodarone and lidocaine follow the catalog, then open the dialog", () => {
    expect(fastPathDoseMg("amiodarone", 0)).toBe(AMIODARONE_FIRST_MG);
    expect(fastPathDoseMg("amiodarone", 1)).toBe(AMIODARONE_SECOND_MG);
    expect(fastPathDoseMg("amiodarone", 2)).toBeNull();
    expect(fastPathDoseMg("lidocaine", 0)).toBe(LIDOCAINE_FIRST_MG);
    expect(fastPathDoseMg("lidocaine", 1)).toBe(LIDOCAINE_SECOND_MG);
    expect(fastPathDoseMg("lidocaine", 2)).toBeNull();
  });

  it("Law 3: every adrenaline dose is the catalog's adult dose", () => {
    const mg = Number.parseFloat(ADRENALINE_DOSE_TEXT);
    expect(Number.isFinite(mg)).toBe(true);
    expect(fastPathDoseMg("adrenaline", 0)).toBe(mg);
    expect(fastPathDoseMg("adrenaline", 7)).toBe(mg);
  });

  it("ALS-MOD-16: the child cut-off is the catalog's adult age", () => {
    expect(isChild(15)).toBe(true);
    expect(isChild(16)).toBe(false);
    expect(isChild(null)).toBe(false);
  });
});
