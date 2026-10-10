import type { CadreGroup, LandingFacts } from "@/lib/auth/landing";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import { resolveLanding } from "@/lib/auth/landing";

/**
 * Pharmacy Phase 0, Step 0 (docs/pharmacy/phase-0/PROMPT-PHARMACY-PHASE-0.md §9): failing tests
 * that reproduce the claims Step 0 confirmed. Each is `it.fails` (green while the defect is
 * present); the step that fixes it flips it to a plain `it`: P5 in Step 2, P3 in Step 2, P4 in
 * Step 4.
 */
const read = (p: string) => readFileSync(resolve(process.cwd(), p), "utf8");

describe("Pharmacy Phase 0 baseline — defects reproduced at Step 0", () => {
  // P3: PHARMACIST and PHARMACY_TECH fall to the "other" cadre group and land on /clinician.
  it.fails("P3: an approved pharmacy professional lands on /pharmacy", () => {
    expect(read("app/(auth)/sign-in/landing.ts")).toMatch(/PHARMACY_TECH/);
    const facts: LandingFacts = {
      roles: [],
      active: { doctor: false, lab: false },
      latestAffiliation: { state: "approved", group: "pharmacy" as CadreGroup },
      hospitalApplicationState: null,
      hasPatientProfile: false,
    };
    expect(resolveLanding(facts).target).toBe("/pharmacy");
  });

  // P4: no /pharmacy route exists.
  it.fails("P4: /pharmacy exists", () => {
    expect(existsSync(resolve(process.cwd(), "app/pharmacy/page.tsx"))).toBe(true);
  });

  // P5: approval writes staff_affiliations and users.state only; the one SQL role grant (0097)
  // names the lab cadres alone.
  it.fails("P5: approving a pharmacy cadre grants pharmacy access, audited", () => {
    const dir = resolve(process.cwd(), "supabase/migrations");
    const sql = readdirSync(dir)
      .filter((f) => f.endsWith(".sql"))
      .map((f) => readFileSync(resolve(dir, f), "utf8"))
      .join("\n");
    expect(sql).toMatch(/pharmacy_access_granted/);
  });
});
