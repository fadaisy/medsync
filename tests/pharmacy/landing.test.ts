import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { LandingFacts } from "@/lib/auth/landing";
import { describe, expect, it } from "vitest";

import { resolveLanding } from "@/lib/auth/landing";

/**
 * Pharmacy Phase 0 — the pharmacy rows of the landing table (LD-P1..LD-P5; gate-a-proposal §3).
 * Every existing row is pinned, unchanged, by tests/lab/landing.test.ts (LD-P1).
 */
const none: LandingFacts = {
  roles: [],
  active: { doctor: false, lab: false },
  latestAffiliation: null,
  hospitalApplicationState: null,
  hasPatientProfile: false,
};
const f = (o: Partial<LandingFacts>): LandingFacts => ({ ...none, ...o });
const on = { doctor: false, lab: false, pharmacy: true };

describe("landing — the pharmacy", () => {
  it.each<[string, LandingFacts, string]>([
    [
      "LD-P2: pharmacy_staff + active pharmacy affiliation, flag on",
      f({ roles: ["pharmacy_staff"], active: on }),
      "/pharmacy",
    ],
    [
      "LD-P2: no role yet, approved pharmacy cadre, flag on",
      f({ latestAffiliation: { state: "approved", group: "pharmacy" } }),
      "/pharmacy",
    ],
    [
      "flag off: the loader keeps a pharmacy cadre in `other`",
      f({ latestAffiliation: { state: "approved", group: "other" } }),
      "/clinician",
    ],
    [
      "flag off: pharmacy_staff without active.pharmacy",
      f({ roles: ["pharmacy_staff"] }),
      "/clinician",
    ],
    [
      "pending pharmacy applicant",
      f({ latestAffiliation: { state: "pending_approval", group: "pharmacy" } }),
      "/onboarding/clinical-pending",
    ],
    [
      "LD-P3: a doctor cadre outranks the pharmacy",
      f({
        roles: ["clinician", "pharmacy_staff"],
        active: { doctor: true, lab: false, pharmacy: true },
      }),
      "/doctor",
    ],
    [
      "LD-P3: the lab outranks the pharmacy",
      f({
        roles: ["lab_tech", "pharmacy_staff"],
        active: { doctor: false, lab: true, pharmacy: true },
      }),
      "/lab",
    ],
  ])("%s → %s", (_name, facts, target) => {
    expect(resolveLanding(facts).target).toBe(target);
  });

  it("LD-P5: ?redirect=/pharmacy is honoured only for an active pharmacy user", () => {
    const yes = resolveLanding(f({ roles: ["pharmacy_staff"], active: on }), "/pharmacy?lane=ward");
    expect(yes.target).toBe("/pharmacy?lane=ward");
    const no = resolveLanding(f({ roles: ["nurse"] }), "/pharmacy/prescriptions/x");
    expect(no.target).toBe("/clinician");
    expect(no.refusedNext).toBe("/pharmacy");
    expect(resolveLanding(f({ roles: ["pharmacy_staff"], active: on }), "//evil.test").target).toBe(
      "/pharmacy",
    );
  });

  it("LD-P1: the loader groups pharmacy cadres from the signed map, behind the flag", () => {
    const loader = readFileSync(resolve(process.cwd(), "app/(auth)/sign-in/landing.ts"), "utf8");
    expect(loader).toMatch(/PHARMACY_MAP_CADRES\.includes\(code\)/);
    expect(loader).toMatch(/pharmacyWorkspaceLiveFor\(hospitalId\) \? "pharmacy" : "other"/);
  });

  it("LD-P4: /clinician forwards pharmacy users, after doctors and the lab", () => {
    const layout = readFileSync(resolve(process.cwd(), "app/clinician/layout.tsx"), "utf8");
    const lab = layout.indexOf('redirect("/lab")');
    const pharmacy = layout.indexOf(
      'if (await isPharmacyUser(scope.userId)) redirect("/pharmacy")',
    );
    expect(lab).toBeGreaterThan(0);
    expect(pharmacy).toBeGreaterThan(lab);
  });
});
