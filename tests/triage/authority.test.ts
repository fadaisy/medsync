import { describe, expect, it } from "vitest";

import { resolveTriageAuthority } from "@/lib/triage/authority";

/**
 * Triage authority resolver (ratified §A.4 / R1). Pure decision over a
 * cadre + the per-hospital cosign-policy rows. Safety-critical: who may
 * triage, and who may DOWN-triage (assign below the computed level).
 */

// Minimal policy-row shape the resolver reads.
const allow = (cadre: string, action: string) => ({
  cadreCode: cadre,
  actionKind: action,
  requirement: "allowed" as const,
});

describe("resolveTriageAuthority — may triage", () => {
  it("a nurse with a triage_patient=allowed row may triage", () => {
    const a = resolveTriageAuthority("NURSE", [allow("NURSE", "triage_patient")]);
    expect(a.mayTriage).toBe(true);
  });

  it("reception (no policy rows) may NOT triage (safe default)", () => {
    const a = resolveTriageAuthority("RECEPTION", []);
    expect(a.mayTriage).toBe(false);
    expect(a.mayDownTriage).toBe(false);
  });

  it("a cadre with an explicit blocked row may not triage", () => {
    const a = resolveTriageAuthority("PHARMACIST", [
      { cadreCode: "PHARMACIST", actionKind: "triage_patient", requirement: "blocked" },
    ]);
    expect(a.mayTriage).toBe(false);
  });
});

describe("resolveTriageAuthority — may down-triage (R1)", () => {
  it("a doctor may down-triage", () => {
    const a = resolveTriageAuthority("MEDICAL_OFFICER", [
      allow("MEDICAL_OFFICER", "triage_patient"),
      allow("MEDICAL_OFFICER", "triage_downgrade"),
    ]);
    expect(a.mayDownTriage).toBe(true);
  });

  it("a clinical officer may down-triage", () => {
    const a = resolveTriageAuthority("CLINICAL_OFFICER", [
      allow("CLINICAL_OFFICER", "triage_patient"),
      allow("CLINICAL_OFFICER", "triage_downgrade"),
    ]);
    expect(a.mayDownTriage).toBe(true);
  });

  it("a nurse may triage but NOT down-triage (the R1 boundary)", () => {
    const a = resolveTriageAuthority("NURSE", [
      allow("NURSE", "triage_patient"),
      { cadreCode: "NURSE", actionKind: "triage_downgrade", requirement: "blocked" },
    ]);
    expect(a.mayTriage).toBe(true);
    expect(a.mayDownTriage).toBe(false);
  });

  it("absent triage_downgrade row → may NOT down-triage (safe default)", () => {
    const a = resolveTriageAuthority("NURSE", [allow("NURSE", "triage_patient")]);
    expect(a.mayDownTriage).toBe(false);
  });
});

describe("resolveTriageAuthority — only this cadre's rows are read", () => {
  it("ignores rows for other cadres", () => {
    const a = resolveTriageAuthority("NURSE", [
      allow("MEDICAL_OFFICER", "triage_downgrade"), // not mine
      allow("NURSE", "triage_patient"),
    ]);
    expect(a.mayTriage).toBe(true);
    expect(a.mayDownTriage).toBe(false);
  });

  it("is deterministic (flags + behaviour identical across calls)", () => {
    const rows = [allow("NURSE", "triage_patient")];
    const a = resolveTriageAuthority("NURSE", rows);
    const b = resolveTriageAuthority("NURSE", rows);
    // canAssignLevel is a closure (functions never deep-equal), so
    // compare the data flags + a representative verdict instead.
    expect({ t: a.mayTriage, d: a.mayDownTriage }).toEqual({ t: b.mayTriage, d: b.mayDownTriage });
    expect(a.canAssignLevel(3, 2)).toEqual(b.canAssignLevel(3, 2));
    expect(a.canAssignLevel(2, 4)).toEqual(b.canAssignLevel(2, 4));
  });
});

describe("canAssignLevel — applies the authority to a concrete override", () => {
  it("anyone who may triage can assign a MORE acute level (up)", () => {
    const a = resolveTriageAuthority("NURSE", [allow("NURSE", "triage_patient")]);
    // computed 3, assigning 2 (more acute / up) → allowed.
    expect(a.canAssignLevel(3, 2).allowed).toBe(true);
  });

  it("a nurse may confirm the same level", () => {
    const a = resolveTriageAuthority("NURSE", [allow("NURSE", "triage_patient")]);
    expect(a.canAssignLevel(3, 3).allowed).toBe(true);
  });

  it("a nurse may NOT assign a LESS acute level (down) — blocked", () => {
    const a = resolveTriageAuthority("NURSE", [allow("NURSE", "triage_patient")]);
    const v = a.canAssignLevel(2, 4); // computed Orange, wants Green
    expect(v.allowed).toBe(false);
    expect(v.direction).toBe("down");
  });

  it("a doctor may assign a less acute level (down)", () => {
    const a = resolveTriageAuthority("MEDICAL_OFFICER", [
      allow("MEDICAL_OFFICER", "triage_patient"),
      allow("MEDICAL_OFFICER", "triage_downgrade"),
    ]);
    expect(a.canAssignLevel(2, 4).allowed).toBe(true);
  });

  it("a non-triager cannot assign at all", () => {
    const a = resolveTriageAuthority("RECEPTION", []);
    expect(a.canAssignLevel(3, 3).allowed).toBe(false);
  });
});
