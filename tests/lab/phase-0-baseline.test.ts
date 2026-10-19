import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Lab Phase 0, Step 0 (docs/lab/phase-0/PROMPT-LAB-PHASE-0.md §9): failing tests that reproduce
 * the claims Step 0 confirmed. Each began as `it.fails` (green while the defect was present) and was flipped to a plain
 * `it` by the step that fixed it: L3 in Step 2, L5 in Step 3, L7 in Step 4.
 *
 * L1 (lab staff sent to /clinician) is already resolved on this branch; tests/lab/routing.test.ts
 * pins it.
 */
const read = (p: string) => readFileSync(resolve(process.cwd(), p), "utf8");

describe("Lab Phase 0 baseline — defects reproduced at Step 0", () => {
  // Fixed in Step 2: a trigger on staff_affiliations grants in the approval's transaction
  // (migration 0097; behaviour proven in tests/emr-db/lab-access.test.ts).
  it("L3: approving a lab cadre grants lab access", () => {
    const sql = read("supabase/migrations/0097_lab_access_sync.sql");
    expect(sql).toMatch(/CREATE TRIGGER staff_affiliations_lab_access/);
    expect(sql).toMatch(
      /INSERT INTO public\.user_roles \(user_id, role, hospital_id, created_by\)/,
    );
  });

  // Fixed in Step 3 at the projection: lib/lab/read.ts carries each row's offering section and
  // lib/lab/worklist.ts routes by it (behaviour: tests/lab/worklist-projection.test.ts, LW-3/LW-4;
  // tests/emr-db/lab-reads.test.ts). The legacy loader stays untouched.
  it("L5: the lab worklist routes rows by section", () => {
    expect(read("lib/lab/read.ts")).toMatch(/offeringSectionId: offering\?\.sectionId/);
    expect(read("lib/lab/worklist.ts")).toMatch(/r\.offeringSectionId \?\? r\.catalogueSectionId/);
  });

  // Fixed in Step 4: the result screen shows the notice while flagging is off (behind
  // LAB_WORKSPACE; rendered in tests/lab/ui.test.ts).
  it("L7: the lab result screen says critical flagging is off", () => {
    expect(read("app/lab/results/[orderId]/_lib/load.ts")).toMatch(
      /!criticalFlaggingActive\(scope\.hospitalId\)\s*\?\s*"notice"/,
    );
    expect(read("app/lab/results/[orderId]/page.tsx")).toMatch(
      /flagging === "notice" \?\s*\(?\s*<FlaggingNotice \/>/,
    );
  });
});
