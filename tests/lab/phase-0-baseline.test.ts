import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Lab Phase 0, Step 0 (docs/lab/phase-0/PROMPT-LAB-PHASE-0.md §9): failing tests that reproduce
 * the claims Step 0 confirmed. Each is `it.fails`: it passes while the defect is present and turns
 * red the moment the defect is fixed, so the step that fixes it must flip it to a plain `it`.
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

  it.fails("L5: the EMR lab worklist routes rows by section (fixed in Step 3)", () => {
    const loader = read("app/lab/_lib/emr.ts");
    const start = loader.indexOf("export async function loadEmrLabWorklist");
    const body = loader.slice(start, loader.indexOf("\n}\n", start));
    // Today the only filter is the hospital: no section, no offering, no department.
    expect(body).toMatch(/section/i);
  });

  it.fails("L7: the lab result screen says critical flagging is off (fixed in Step 4)", () => {
    const screen = read("app/lab/results/[orderId]/page.tsx");
    const entry = read("components/emr/results/result-entry-view.tsx");
    // Today neither the route nor the entry view renders any notice about critical flagging.
    expect(`${screen}\n${entry}`).toMatch(
      /criticalFlaggingActive|Automatic critical flagging is off/,
    );
  });
});
