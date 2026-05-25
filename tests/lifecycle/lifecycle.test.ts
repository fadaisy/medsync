import { describe, expect, test } from "vitest";

import {
  ACTIVE_STATES,
  BLOCKS_CLINICAL,
  canTransition,
  HOSPITAL_AGREEMENT_GATE_STATE,
  HOSPITAL_APPLICATION_STATES,
  LIFECYCLE_STATES,
  LIFECYCLE_TRANSITIONS,
} from "@/lib/lifecycle";

describe("lib/lifecycle — state set", () => {
  test("includes the hospital-upgrade additions", () => {
    expect(LIFECYCLE_STATES).toContain("under_review");
    expect(LIFECYCLE_STATES).toContain("agreement_signed");
    expect(LIFECYCLE_STATES).toContain("provisioning");
    expect(LIFECYCLE_STATES).toContain("offboarded");
    expect(LIFECYCLE_STATES).toContain("agreement_expired");
  });

  test("preserves the original Phase 0 states", () => {
    for (const s of [
      "unverified",
      "verified",
      "pending_approval",
      "approved",
      "active",
      "rejected",
      "suspended",
      "deactivated",
    ] as const) {
      expect(LIFECYCLE_STATES).toContain(s);
    }
  });

  test("HOSPITAL_APPLICATION_STATES excludes user-only states", () => {
    expect(HOSPITAL_APPLICATION_STATES.has("unverified")).toBe(false);
    expect(HOSPITAL_APPLICATION_STATES.has("approved")).toBe(false);
  });

  test("HOSPITAL_AGREEMENT_GATE_STATE is 'verified'", () => {
    expect(HOSPITAL_AGREEMENT_GATE_STATE).toBe("verified");
  });
});

describe("lib/lifecycle — canTransition (hospital upgrade paths)", () => {
  test("pending_approval → under_review (new hospital triage path)", () => {
    expect(canTransition("pending_approval", "under_review")).toBe(true);
  });

  test("under_review → verified (review completed)", () => {
    expect(canTransition("under_review", "verified")).toBe(true);
  });

  test("under_review → rejected (review failed)", () => {
    expect(canTransition("under_review", "rejected")).toBe(true);
  });

  test("verified → agreement_signed (hospital path — agreement gate)", () => {
    expect(canTransition("verified", "agreement_signed")).toBe(true);
  });

  test("verified → active (patient path — direct activation)", () => {
    // Patients don't need an institutional agreement; the global
    // transition table allows verified → active so the patient path
    // continues to work alongside the institution path.
    expect(canTransition("verified", "active")).toBe(true);
  });

  test("agreement_signed → provisioning (setup wizard begins)", () => {
    expect(canTransition("agreement_signed", "provisioning")).toBe(true);
  });

  test("provisioning → active (setup wizard complete)", () => {
    expect(canTransition("provisioning", "active")).toBe(true);
  });

  test("active → offboarded (terminal hospital-leaves-platform)", () => {
    expect(canTransition("active", "offboarded")).toBe(true);
  });

  test("active → agreement_expired (renewal required)", () => {
    expect(canTransition("active", "agreement_expired")).toBe(true);
  });

  test("agreement_expired → agreement_signed (renewal succeeded)", () => {
    expect(canTransition("agreement_expired", "agreement_signed")).toBe(true);
  });
});

describe("lib/lifecycle — canTransition (illegal transitions)", () => {
  test("pending_approval CANNOT skip directly to active", () => {
    expect(canTransition("pending_approval", "active")).toBe(false);
  });

  test("verified CANNOT skip the agreement gate to provisioning", () => {
    // The whole point of the agreement gate: verified must go through
    // agreement_signed first. The structural check enforces it.
    expect(canTransition("verified", "provisioning")).toBe(false);
  });

  test("agreement_signed CANNOT bypass provisioning to active", () => {
    // Provisioning (the setup wizard) is mandatory. The agreement on
    // its own does not produce a usable tenant.
    expect(canTransition("agreement_signed", "active")).toBe(false);
  });

  test("offboarded is terminal — no transitions out", () => {
    expect(LIFECYCLE_TRANSITIONS.offboarded).toHaveLength(0);
  });

  test("deactivated is terminal — no transitions out", () => {
    expect(LIFECYCLE_TRANSITIONS.deactivated).toHaveLength(0);
  });

  test("rejected → active is not a single step (must re-apply)", () => {
    expect(canTransition("rejected", "active")).toBe(false);
  });
});

describe("lib/lifecycle — clinical-access guards", () => {
  test("ACTIVE_STATES is exactly { 'active' }", () => {
    expect(ACTIVE_STATES.size).toBe(1);
    expect(ACTIVE_STATES.has("active")).toBe(true);
  });

  test("every new lifecycle state blocks clinical access (except 'active')", () => {
    for (const s of [
      "under_review",
      "agreement_signed",
      "provisioning",
      "offboarded",
      "agreement_expired",
    ] as const) {
      expect(BLOCKS_CLINICAL.has(s)).toBe(true);
    }
  });

  test("'active' does NOT block clinical access", () => {
    expect(BLOCKS_CLINICAL.has("active")).toBe(false);
  });
});

describe("lib/lifecycle — transition table integrity", () => {
  test("every key in LIFECYCLE_TRANSITIONS is a valid LifecycleState", () => {
    const known = new Set<string>(LIFECYCLE_STATES);
    for (const key of Object.keys(LIFECYCLE_TRANSITIONS)) {
      expect(known.has(key)).toBe(true);
    }
  });

  test("every value in LIFECYCLE_TRANSITIONS is a valid LifecycleState", () => {
    const known = new Set<string>(LIFECYCLE_STATES);
    for (const targets of Object.values(LIFECYCLE_TRANSITIONS)) {
      for (const t of targets) {
        expect(known.has(t)).toBe(true);
      }
    }
  });

  test("every state has an entry in LIFECYCLE_TRANSITIONS (exhaustive)", () => {
    for (const s of LIFECYCLE_STATES) {
      expect(LIFECYCLE_TRANSITIONS).toHaveProperty(s);
    }
  });
});
