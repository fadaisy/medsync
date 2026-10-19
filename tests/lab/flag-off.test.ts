import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Lab Phase 0 — LAB_WORKSPACE off is today's /lab (Law 11, S14), and on with EMR v1 off is the old
 * list with one note (LW-10, S15). Source contracts: the routing below is the whole difference; the
 * legacy markup itself was compared token for token with main (STOP 4).
 */
const read = (p: string) => readFileSync(resolve(process.cwd(), p), "utf8");

describe("LAB_WORKSPACE off", () => {
  it("the layout returns the original top bar", () => {
    const layout = read("app/lab/layout.tsx");
    // Lab Workspace v2 (ADR 0349): the six-place shell only where the workspace (and the record) is on.
    expect(layout).toMatch(/const v2 = scope\.workspaceLive \? await labV2\(\) : null;/);
    expect(layout).toMatch(
      /return <LegacyLabLayout scope=\{scope\}>\{children\}<\/LegacyLabLayout>;/,
    );
  });

  it("the worklist page returns the EMR worklist or the old list, as before", () => {
    const page = read("app/lab/page.tsx");
    // Workspace and EMR on: the role landing (v2). EMR on without the workspace: the EMR worklist; EMR off: the
    // old list with no note.
    expect(page).toMatch(/if \(v2\.live\)\s*redirect\(/);
    expect(page).toMatch(
      /if \(emrV1LiveFor\(scope\.hospitalId\)\) return <EmrLabWorklist scope=\{scope\} \/>;/,
    );
    expect(page).toMatch(/note=\{scope\.workspaceLive \? LAB\.worklist\.legacy : undefined\}/);
  });

  it("Released today and Rejected do not exist", () => {
    for (const p of ["app/lab/bench/_views/released.tsx", "app/lab/bench/_views/rejected.tsx"])
      expect(read(p), p).toMatch(/if \(!scope\.workspaceLive\) notFound\(\);/);
  });

  it("the result screen adds nothing: notice and Reject are behind the flag", () => {
    // Lab Workspace v2: the result screen's reads live in one loader shared with the bench work pane.
    const load = read("app/lab/results/[orderId]/_lib/load.ts");
    expect(load).toMatch(
      /const flagging = workspace\s*\?[\s\S]*?!criticalFlaggingActive\(scope\.hospitalId\)\s*\?\s*"notice"/,
    );
    expect(load).toMatch(/workspace && !data\.report\?\.released/);
    expect(read("app/lab/bench/[orderId]/page.tsx")).toMatch(
      /flagging === "notice" \?\s*\(?\s*<FlaggingNotice \/>/,
    );
  });

  it("the scope keeps bouncing a non-lab user to the landing page", () => {
    expect(read("lib/lab-tech/scope.ts")).toMatch(
      /redirect\(process\.env\.LAB_WORKSPACE\?\.trim\(\) \? "\/not-authorised\?for=lab" : "\/"\)/,
    );
  });
});

describe("LAB_WORKSPACE on, EMR v1 off (LW-10)", () => {
  it("the old list, unchanged, with its one-line note; no section filter or clock on it", () => {
    const page = read("app/lab/page.tsx");
    expect(page).toMatch(
      /<LegacyWorklist[\s\S]*?note=\{scope\.workspaceLive \? LAB\.worklist\.legacy : undefined\}/,
    );
    const legacy = page.slice(page.indexOf("async function LegacyWorklist"));
    expect(legacy).not.toMatch(/computeWorklist|TurnaroundCell|section/);
  });
});
