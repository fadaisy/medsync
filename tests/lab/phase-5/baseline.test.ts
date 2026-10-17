import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Lab Phase 5, Step 0 (docs/lab/phase-5/PROMPT-LAB-PHASE-5.md §9): the defects named in the baseline, written as
 * `it.fails` at Step 0 and flipped to plain `it` when fixed: (a) at Step 4 (delta checks), (b) at Step 5 (the IPC
 * feed); both fixed. (c) holds today, because no patient surface reads a result at all; it stays a guard for Step 7. The
 * behaviour itself is proven on the database in the Phase 5 PGlite lanes.
 */
const read = (p: string) => readFileSync(resolve(process.cwd(), p), "utf8");
const migrations = () =>
  readdirSync(resolve(process.cwd(), "supabase/migrations"))
    .filter((f) => f.endsWith(".sql"))
    .map((f) => read(`supabase/migrations/${f}`))
    .join("\n");
const filesUnder = (dir: string): string[] =>
  readdirSync(resolve(process.cwd(), dir)).flatMap((f) => {
    const p = join(dir, f);
    return statSync(resolve(process.cwd(), p)).isDirectory()
      ? filesUnder(p)
      : /\.tsx?$/.test(f)
        ? [p]
        : [];
  });

describe("Lab Phase 5 baseline — defects reproduced at Step 0", () => {
  // (a) Result entry (lib/emr/write/results.ts) compares nothing with the patient's previous result: a full blood
  // count whose MCV moved far from yesterday's is released with no prompt.
  it("(a) a result far from the patient's previous one raises a delta check before release", () => {
    expect(migrations()).toMatch(/create table[^;]*\bdelta_flags\b/i);
    expect(read("lib/emr/write/results.ts")).toMatch(/delta/i);
  });

  // (b) Releasing "MTB detected, rifampicin resistance detected" (obs.tb_xpert = mtb_detected_rif_detected) writes
  // the report and, at most, a critical alert to the clinician; nothing reaches infection prevention.
  it("(b) a released RR-TB result raises an infection prevention alert", () => {
    expect(migrations()).toMatch(/create table[^;]*\bipc_alerts\b/i);
    // …and the release path raises it (the table alone arrives at Step 2; the feed at Step 5).
    expect(read("lib/emr/write/results.ts")).toMatch(/raiseIpcAlerts/);
  });

  // (c) Today no patient surface reads a laboratory result (Step 0 Q3), so none can show one before review. From
  // Step 7 every patient read goes through visibleToPatient.
  it("(c) no patient surface reads results except through visibleToPatient", () => {
    const readers = [...filesUnder("app/patient"), ...filesUnder("lib/patient")].filter((f) =>
      /diagnosticReports|diagnostic_reports|clinicalObservations|labResultSnapshots/.test(read(f)),
    );
    for (const f of readers) expect(read(f)).toMatch(/visibleToPatient/);
  });
});
