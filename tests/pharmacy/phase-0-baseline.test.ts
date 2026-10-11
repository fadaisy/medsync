import { existsSync, readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { LandingFacts } from "@/lib/auth/landing";
import { describe, expect, it } from "vitest";

import { resolveLanding } from "@/lib/auth/landing";

/**
 * Pharmacy Phase 0, Step 0 (docs/pharmacy/phase-0/PROMPT-PHARMACY-PHASE-0.md §9): failing tests
 * that reproduce the claims Step 0 confirmed. Each began as `it.fails` (green while the defect
 * was present) and is flipped to a plain `it` by the step that fixes it: P3 and P5 in Step 2, P4
 * in Step 4.
 */
const read = (p: string) => readFileSync(resolve(process.cwd(), p), "utf8");

describe("Pharmacy Phase 0 baseline — defects reproduced at Step 0", () => {
  // Fixed in Step 2: the loader groups pharmacy cadres (from the signed map) as `pharmacy` where the
  // workspace is on, and the resolver sends them to /pharmacy (tests/pharmacy/landing.test.ts).
  it("P3: an approved pharmacy professional lands on /pharmacy", () => {
    expect(read("app/(auth)/sign-in/landing.ts")).toMatch(/PHARMACY_MAP_CADRES/);
    const facts: LandingFacts = {
      roles: [],
      active: { doctor: false, lab: false },
      latestAffiliation: { state: "approved", group: "pharmacy" },
      hospitalApplicationState: null,
      hasPatientProfile: false,
    };
    expect(resolveLanding(facts).target).toBe("/pharmacy");
  });

  // Fixed in Step 4: the workspace's queue page.
  it("P4: /pharmacy exists", () => {
    expect(existsSync(resolve(process.cwd(), "app/pharmacy/page.tsx"))).toBe(true);
  });

  // Fixed in Step 2: migration 0098's trigger grants in the approval's transaction (behaviour:
  // tests/emr-db/pharmacy-access.test.ts).
  it("P5: approving a pharmacy cadre grants pharmacy access, audited", () => {
    const dir = resolve(process.cwd(), "supabase/migrations");
    const sql = readdirSync(dir)
      .filter((f) => f.endsWith(".sql"))
      .map((f) => readFileSync(resolve(dir, f), "utf8"))
      .join("\n");
    expect(sql).toMatch(/pharmacy_access_granted/);
  });
});
