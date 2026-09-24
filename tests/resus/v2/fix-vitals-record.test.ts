import type { ResusEventKind, TimelineEvent } from "@/lib/resus/types";
import { describe, expect, it } from "vitest";

import {
  doseText,
  entryLabel,
  undoableInRecord,
} from "@/app/nurse/resus/[episodeId]/_components/v2/record-format";
import { etco2KpaFromMmHg, VITAL_INPUT_BOUNDS, vitalPlausible } from "@/lib/resus/vitals";

const AT = "2026-09-24T05:00:00.000Z";
function ev(kind: ResusEventKind, payload: Record<string, unknown> = {}): TimelineEvent {
  return {
    id: `e-${kind}`,
    episodeId: "ep",
    kind,
    step: null,
    recordedByUserId: "u1",
    recordedAt: AT,
    createdAt: AT,
    payload,
    supersedesEventId: null,
  };
}

describe("R2 — vitals input plausibility", () => {
  it("refuses the typos the review found", () => {
    expect(vitalPlausible("spo2", 970)).toBe(false);
    expect(vitalPlausible("temperature", 375)).toBe(false);
    expect(vitalPlausible("glucose", 600)).toBe(false);
  });

  it("keeps the step panel's bounds (glucose, temperature) and caps SpO₂ at 100 %", () => {
    expect(VITAL_INPUT_BOUNDS.glucose).toEqual({ min: 0, max: 60 });
    expect(VITAL_INPUT_BOUNDS.temperature).toEqual({ min: 10, max: 45 });
    expect(vitalPlausible("spo2", 100)).toBe(true);
    expect(vitalPlausible("spo2", 100.1)).toBe(false);
    expect(vitalPlausible("temperature", 9.9)).toBe(false);
  });

  it("an unbounded field only has to be a finite number ≥ 0", () => {
    expect(vitalPlausible("hr", 180)).toBe(true);
    expect(vitalPlausible("hr", -1)).toBe(false);
    expect(vitalPlausible("rr", Number.NaN)).toBe(false);
    expect(vitalPlausible("etco2", 35)).toBe(true);
  });

  it("converts an mmHg EtCO₂ to kPa by the unit definition, one decimal", () => {
    expect(etco2KpaFromMmHg(35)).toBe(4.7);
    expect(etco2KpaFromMmHg(0)).toBe(0);
  });
});

describe("R1 — one-tap Undo in the record", () => {
  it("never for ROSC, arrest, CPR start, stopping or death", () => {
    for (const k of [
      "rosc",
      "arrest_detected",
      "cpr_started",
      "resuscitation_stopped",
      "death_confirmed",
    ] as const)
      expect(undoableInRecord(ev(k)), k).toBe(false);
  });

  it("never for a terminal or phase decision, or the opening row", () => {
    for (const d of ["cpr_not_attempted", "closure", "cancel", "phase", "disposition"])
      expect(undoableInRecord(ev("decision", { decision: d })), d).toBe(false);
    expect(undoableInRecord(ev("decision", { summary: "Resus episode opened (triage_red)" }))).toBe(
      false,
    );
  });

  it("for the console's one-tap logs and one-tap decisions", () => {
    for (const k of ["rhythm_check", "shock", "drug", "procedure", "vital", "note"] as const)
      expect(undoableInRecord(ev(k)), k).toBe(true);
    expect(undoableInRecord(ev("decision", { decision: "reversible_cause" }))).toBe(true);
  });

  it("never for a correction row", () => {
    expect(undoableInRecord(ev("note", { noteKind: "correction" }))).toBe(false);
  });
});

describe("S4 — every row has a human label", () => {
  it("the opening row reads its summary with the trigger in words", () => {
    const e = ev("decision", { summary: "Resus episode opened (triage_red)" });
    expect(entryLabel(e)).toBe("Resus episode opened (Triage Red)");
  });

  it("a row with no label never prints the raw kind", () => {
    expect(entryLabel(ev("decision"))).toBe("Decision");
    expect(entryLabel(ev("resuscitation_stopped"))).toBe("Resuscitation stopped");
    expect(entryLabel(ev("role_change", { role: "cpr_provider" }))).toBe(
      "Role assigned: CPR provider",
    );
  });
});

describe("S5 — dose text has no nested brackets", () => {
  it("splits the dose from a concentration that has brackets of its own", () => {
    const stored =
      "1 mg (1:10 000 (100 micrograms/mL) — 1 mg in 10 mL prefilled syringe (10 mL bolus))";
    const shown = doseText(stored);
    expect(shown).toBe(
      "1 mg · 1:10 000 (100 micrograms/mL) — 1 mg in 10 mL prefilled syringe (10 mL bolus)",
    );
    expect(shown).not.toMatch(/\([^)]*\(/);
  });

  it("leaves a plain dose alone", () => {
    expect(doseText("500 mL")).toBe("500 mL");
    expect(doseText("1 g (over 10 min)")).toBe("1 g (over 10 min)");
  });
});
