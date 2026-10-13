import type { ReadinessFacts } from "@/lib/pharmacy/readiness";
import { describe, expect, it } from "vitest";

import { anythingNotDone, pharmacyChecksState } from "@/lib/pharmacy/check-state";
import {
  canSwitchOff,
  canSwitchOn,
  CLINICAL_SETS,
  GO_LIVE_SETS,
  patientSurfacesAllowed,
  pharmacyReadiness,
} from "@/lib/pharmacy/readiness";

/** Pharmacy Phase 1, Step 3: going live (RD-1 to RD-5) and the check state (CK-1, CK-2). Fixtures only. */

const ready = (): ReadinessFacts => ({
  permissionMapSigned: true,
  signedSets: GO_LIVE_SETS.map((kind) => ({ kind, pharmacistCoSigned: true })),
  supplyWithoutPharmacistOn: false,
  usesPaymentStatus: false,
  hazardLogSigned: true,
  hazardLogPharmacistCoSigned: true,
  pharmacistCoSignRequired: true,
  stockedMedicineIds: ["fx-a", "fx-b"],
  controlledDecisionIds: ["fx-a", "fx-b"],
  legalAnswers: [1, 2, 3, 4, 5, 6].map((question) => ({
    question,
    sourceRef: `FX-LEGAL-${question}`,
    givenBy: "Fixture counsel",
    givenOn: "2026-10-20",
  })),
  q1RequiresPharmacistInCharge: true,
  activeProducts: [
    { name: "Fixture tablet A", hasOpeningCount: true },
    { name: "Fixture tablet B", hasOpeningCount: true },
  ],
  drillOn: "2026-10-21",
  briefings: [
    { audience: "pharmacy", on: "2026-10-21" },
    { audience: "prescribers", on: "2026-10-22" },
  ],
  inCharge: { name: "Fixture In-charge", isPharmacist: true },
  pointPhone: "+256 700 000 001",
  laterPoint: false,
  pilotNote: null,
});

const unmetIds = (f: ReadinessFacts) =>
  pharmacyReadiness(f)
    .conditions.filter((c) => !c.met)
    .map((c) => c.id);

describe("RD-1: six conditions", () => {
  it("all met: ready, every condition with evidence and no action", () => {
    const r = pharmacyReadiness(ready());
    expect(r.ready).toBe(true);
    expect(r.conditions.map((c) => c.id)).toEqual([1, 2, 3, 4, 5, 6]);
    for (const c of r.conditions) {
      expect(c.met).toBe(true);
      expect(c.action).toBeNull();
      expect(c.evidence.length).toBeGreaterThan(0);
    }
    expect(r.pilotNote).toBeNull();
  });

  const unmet: [string, (f: ReadinessFacts) => ReadinessFacts, number][] = [
    ["1: the permission map unsigned", (f) => ({ ...f, permissionMapSigned: false }), 1],
    [
      "1: a reason list unsigned",
      (f) => ({ ...f, signedSets: f.signedSets.filter((s) => s.kind !== "outcome_reasons") }),
      1,
    ],
    [
      "1: the label fields unsigned",
      (f) => ({ ...f, signedSets: f.signedSets.filter((s) => s.kind !== "label_fields") }),
      1,
    ],
    [
      "1: a clinical pack without a pharmacist's co-signature",
      (f) => ({
        ...f,
        signedSets: f.signedSets.map((s) =>
          s.kind === "lane_rule" ? { ...s, pharmacistCoSigned: false } : s,
        ),
      }),
      1,
    ],
    [
      "1: the hazard log without a pharmacist's co-signature",
      (f) => ({ ...f, hazardLogPharmacistCoSigned: false }),
      1,
    ],
    [
      "1: the hazard log not signed",
      (f) => ({ ...f, hazardLogSigned: false, pharmacistCoSignRequired: false }),
      1,
    ],
    [
      "1: a stocked medicine with no controlled-class decision",
      (f) => ({ ...f, controlledDecisionIds: ["fx-a"] }),
      1,
    ],
    [
      "1: supply without a pharmacist on, its list unsigned",
      (f) => ({ ...f, supplyWithoutPharmacistOn: true }),
      1,
    ],
    ["1: payment status used, its list unsigned", (f) => ({ ...f, usesPaymentStatus: true }), 1],
    [
      "2: a legal question without an answer",
      (f) => ({ ...f, legalAnswers: f.legalAnswers.filter((a) => a.question !== 4) }),
      2,
    ],
    [
      "2: an answer without its source",
      (f) => ({
        ...f,
        legalAnswers: f.legalAnswers.map((a) => (a.question === 1 ? { ...a, sourceRef: " " } : a)),
      }),
      2,
    ],
    [
      "3: a product without an opening count",
      (f) => ({ ...f, activeProducts: [{ name: "Fixture tablet A", hasOpeningCount: false }] }),
      3,
    ],
    ["3: no products at all", (f) => ({ ...f, activeProducts: [] }), 3],
    ["4: no drill", (f) => ({ ...f, drillOn: null }), 4],
    [
      "5: prescribers not briefed",
      (f) => ({ ...f, briefings: f.briefings.filter((b) => b.audience !== "prescribers") }),
      5,
    ],
    [
      "5: pharmacy not briefed",
      (f) => ({ ...f, briefings: f.briefings.filter((b) => b.audience !== "pharmacy") }),
      5,
    ],
    ["6: no in-charge", (f) => ({ ...f, inCharge: null }), 6],
    ["6 (W1): no phone for the point", (f) => ({ ...f, pointPhone: null }), 6],
    [
      "6: Q1 requires a pharmacist; the in-charge is not one",
      (f) => ({ ...f, inCharge: { name: "Fixture technician", isPharmacist: false } }),
      6,
    ],
    [
      "6: Q1 unanswered is the stricter path",
      (f) => ({
        ...f,
        q1RequiresPharmacistInCharge: null,
        inCharge: { name: "Fixture technician", isPharmacist: false },
      }),
      6,
    ],
  ];
  it.each(unmet)("%s", (_, change, id) => {
    const f = change(ready());
    expect(unmetIds(f)).toEqual([id]);
    const c = pharmacyReadiness(f).conditions.find((x) => x.id === id)!;
    expect(c.action).toBeTruthy();
    expect(pharmacyReadiness(f).ready).toBe(false);
  });

  it("6: where Q1 does not require a pharmacist, a technician in charge is met", () => {
    expect(
      unmetIds({
        ...ready(),
        q1RequiresPharmacistInCharge: false,
        inCharge: { name: "Fixture technician", isPharmacist: false },
      }),
    ).toEqual([]);
  });

  it("1: the clinical packs that need a pharmacist are a subset of what the Gate signs", () => {
    for (const k of GO_LIVE_SETS.filter((k) => CLINICAL_SETS.has(k)))
      expect(CLINICAL_SETS.has(k)).toBe(true);
    expect(GO_LIVE_SETS).not.toContain("patient_copy");
    expect(GO_LIVE_SETS).not.toContain("plain_words_templates");
  });

  it("the page carries no PHI: evidence is built only from the facts given", () => {
    const text = JSON.stringify(pharmacyReadiness(ready()));
    expect(text).not.toMatch(/MS-\d{4}-\d{5}/);
  });
});

describe("RD-5: a later point", () => {
  const later = (pilotNote: ReadinessFacts["pilotNote"]) =>
    pharmacyReadiness({ ...ready(), laterPoint: true, pilotNote });

  it("needs a pilot note", () => {
    expect(later(null).ready).toBe(false);
    expect(later(null).pilotNote).toMatchObject({ met: false });
    expect(later({ writtenBy: "Fixture Writer", on: "2026-11-01" }).ready).toBe(true);
  });

  it("written by someone other than the requester", () => {
    const r = later({ writtenBy: "Fixture Writer", on: "2026-11-01" });
    expect(
      canSwitchOn(r, { requestedBy: "u-req", approvedBy: "u-app", pilotNoteBy: "u-req" }),
    ).toEqual({
      ok: false,
      reason: "pilot_note_by_requester",
    });
    expect(
      canSwitchOn(r, { requestedBy: "u-req", approvedBy: "u-app", pilotNoteBy: "u-other" }),
    ).toEqual({ ok: true });
  });
});

describe("RD-2, RD-3: the two-person rule", () => {
  it("on: ready and a second approver who is not the requester", () => {
    const r = pharmacyReadiness(ready());
    expect(canSwitchOn(r, { requestedBy: "u1", approvedBy: null, pilotNoteBy: null })).toEqual({
      ok: false,
      reason: "needs_second_approver",
    });
    expect(canSwitchOn(r, { requestedBy: "u1", approvedBy: "u1", pilotNoteBy: null })).toEqual({
      ok: false,
      reason: "same_person",
    });
    expect(canSwitchOn(r, { requestedBy: "u1", approvedBy: "u2", pilotNoteBy: null })).toEqual({
      ok: true,
    });
    const notReady = pharmacyReadiness({ ...ready(), drillOn: null });
    expect(
      canSwitchOn(notReady, { requestedBy: "u1", approvedBy: "u2", pilotNoteBy: null }),
    ).toEqual({ ok: false, reason: "not_ready" });
  });

  it("off: a reason of 10 characters or more and a second approver", () => {
    expect(canSwitchOff({ requestedBy: "u1", approvedBy: "u2", reason: "too short" })).toEqual({
      ok: false,
      reason: "reason_too_short",
    });
    expect(canSwitchOff({ requestedBy: "u1", approvedBy: "u2", reason: "         x" })).toEqual({
      ok: false,
      reason: "reason_too_short",
    });
    expect(
      canSwitchOff({ requestedBy: "u1", approvedBy: "u1", reason: "Fixture reason long enough" }),
    ).toEqual({ ok: false, reason: "same_person" });
    expect(
      canSwitchOff({ requestedBy: "u1", approvedBy: null, reason: "Fixture reason long enough" }),
    ).toEqual({ ok: false, reason: "needs_second_approver" });
    expect(
      canSwitchOff({ requestedBy: "u1", approvedBy: "u2", reason: "Fixture reason long enough" }),
    ).toEqual({ ok: true });
  });
});

describe("RD-4: patient surfaces", () => {
  const all = {
    production: true,
    patientCopySigned: true,
    templatesApproved: true,
    messageNameSigned: true,
  };
  it("production needs every patient string, the templates and the message name", () => {
    expect(patientSurfacesAllowed(all)).toEqual({ allowed: true, missing: [] });
    expect(patientSurfacesAllowed({ ...all, patientCopySigned: false }).missing).toEqual([
      "patient_copy",
    ]);
    expect(patientSurfacesAllowed({ ...all, templatesApproved: false }).missing).toEqual([
      "templates",
    ]);
    expect(patientSurfacesAllowed({ ...all, messageNameSigned: false }).allowed).toBe(false);
  });
  it("outside production, allowed", () => {
    expect(
      patientSurfacesAllowed({
        production: false,
        patientCopySigned: false,
        templatesApproved: false,
        messageNameSigned: false,
      }).allowed,
    ).toBe(true);
  });
});

describe("CK-1, CK-2: the check state", () => {
  it("without points: the Phase 0 answer", () => {
    const s = pharmacyChecksState("h1");
    expect(s.dispensingRecorded).toBe(false);
    expect(s.points).toEqual([]);
  });

  it("a live point records dispensing and is reported per point; interactions stay unchecked", () => {
    const s = pharmacyChecksState("h1", [
      { id: "p1", live: false },
      { id: "p2", live: true },
    ]);
    expect(s.dispensingRecorded).toBe(true);
    expect(s.points).toEqual([
      { id: "p1", live: false },
      { id: "p2", live: true },
    ]);
    expect(s.interactionsChecked).toBe(false);
    expect(anythingNotDone(s)).toBe(true);
  });

  it("no point live: nothing recorded", () => {
    expect(pharmacyChecksState("h1", [{ id: "p1", live: false }]).dispensingRecorded).toBe(false);
  });
});

describe("RD-1: the CSO signs alone while no pharmacist co-signs (owner, 13 Oct 2026)", () => {
  it("meets condition 1 without any pharmacist co-signature", () => {
    const f = ready();
    const r = pharmacyReadiness({
      ...f,
      pharmacistCoSignRequired: false,
      hazardLogPharmacistCoSigned: false,
      signedSets: f.signedSets.map((s) => ({ ...s, pharmacistCoSigned: false })),
    });
    expect(r.conditions.find((c) => c.id === 1)?.met).toBe(true);
  });
});
