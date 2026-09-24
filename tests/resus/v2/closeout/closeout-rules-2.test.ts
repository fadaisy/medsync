import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { RefEntry } from "@/lib/resus/reference/ref";
import { getTableColumns } from "drizzle-orm";
import { describe, expect, it } from "vitest";

import { hospitalResusSettings } from "@/db/schema/resus";
import { CLOSEOUT_REF, CLOSEOUT_REFS } from "@/lib/resus/reference/levels-of-care";

/**
 * Close-out catalog §6 — after-death tasks CO-ADT-02..11: each row is the
 * signed catalog's task and source, in catalog order (the checklist renders
 * CLOSEOUT_REFS in order), with the source's URL or the catalog itself for
 * "design" and CSO/legal rows.
 */

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");
const CATALOG_PATH = "docs/clinical/resus-closeout-clinical-catalog.md";
const CATALOG = read(CATALOG_PATH);
const ADT = CLOSEOUT_REFS.filter((e) => e.id.startsWith("CO-ADT-")).map((e) => e.id);

/** A catalog row's cells after the ID, bold markers removed. */
function catalogRow(id: string): string[] {
  const line = CATALOG.split("\n").find((l) => l.startsWith(`| ${id} `));
  if (!line) throw new Error(`no catalog row ${id}`);
  return line
    .split("|")
    .slice(2, -1)
    .map((c) => c.trim().replaceAll("**", ""));
}

/** The entry equals its catalog row (task + source), signed, at its catalog position. */
function expectTask(id: string): RefEntry {
  const [task, source] = catalogRow(id);
  const e = CLOSEOUT_REF[id]!;
  expect(e).toMatchObject({ text: task, source, status: "signed", verifiedOn: "2026-09-23" });
  expect(ADT.indexOf(id), id).toBe(Number(id.slice(-2)) - 1);
  return e;
}
/** A "design" row points at the catalog itself, never a web source. */
function expectDesign(id: string): RefEntry {
  const e = expectTask(id);
  expect(e).toMatchObject({ source: "design", url: CATALOG_PATH, confidence: "design" });
  return e;
}

describe("CO-ADT — after-death tasks (catalog §6)", () => {
  it("CO-ADT-02: senior / consultant informed is the second task (design)", () => {
    expect(expectDesign("CO-ADT-02").text).toBe("Senior / consultant informed");
  });

  it("CO-ADT-03: the reportable-death screen keeps lines, tubes and devices in place (CSO/legal D10)", () => {
    const e = expectTask("CO-ADT-03");
    expect(e.text).toContain("Reportable-death screen (per D10)");
    expect(e.text).toContain("if reportable, leave lines, tubes and devices in place");
    expect(e.source).toBe("CSO/legal (D10)");
    // No web source: it is the CSO/legal decision recorded in the catalog.
    expect(e.url).toBe(CATALOG_PATH);
    const d10 = read("docs/resus-v2-gate-a-proposal.md")
      .split("\n")
      .find((l) => l.startsWith("| D10 "));
    expect(d10).toContain("reportable deaths");
  });

  it("CO-ADT-04: last offices (design)", () => {
    expect(expectDesign("CO-ADT-04").text).toBe("Last offices");
  });

  it("CO-ADT-05: property handed over (design)", () => {
    expect(expectDesign("CO-ADT-05").text).toBe("Property handed over");
  });

  it("CO-ADT-06: the cause-of-death certificate says it is not built yet (design)", () => {
    const e = expectDesign("CO-ADT-06");
    expect(e.text).toContain("Certificate of cause of death");
    expect(e.text).toContain("not built");
  });

  it("CO-ADT-07: mortuary transfer (design)", () => {
    expect(expectDesign("CO-ADT-07").text).toBe("Mortuary transfer");
  });

  it("CO-ADT-08: the immediate team debrief cites the RCUK 2025 ethics guideline", () => {
    const e = expectTask("CO-ADT-08");
    expect(e).toMatchObject({
      text: "Immediate team debrief",
      source: "RCUK-ETH25",
      confidence: "verified-web",
    });
    expect(e.url).toContain("resus.org.uk");
    expect(e.url).toContain("ethics-guidelines");
  });

  it("CO-ADT-09: staff welfare check (design)", () => {
    expect(expectDesign("CO-ADT-09").text).toBe("Staff welfare check");
  });

  it("CO-ADT-10: Utstein data completed cites UTS-IH19, reference-doc-only", () => {
    const e = expectTask("CO-ADT-10");
    expect(e).toMatchObject({
      text: "Utstein data completed",
      source: "UTS-IH19",
      confidence: "reference-doc-only",
    });
    expect(e.url).toContain("10.1161/CIR.0000000000000710");
  });

  it("CO-ADT-11: organ donation is the last row, RCUK post-resuscitation care, hidden unless enabled", () => {
    const e = expectTask("CO-ADT-11");
    expect(ADT.at(-1)).toBe("CO-ADT-11");
    expect(e.text).toContain("hidden unless the hospital enables it");
    expect(e.text).toContain("must follow local legal and ethical requirements");
    expect(e.url).toContain("post-resuscitation-care-guidelines");
  });

  it("CO-ADT-11: no hospital setting enables it yet, so the checklist leaves it out", () => {
    const cols = Object.keys(getTableColumns(hospitalResusSettings));
    expect(cols.filter((c) => /organ|donat/i.test(c))).toEqual([]);
    // The checklist (after-death.tsx, a React file — read, not imported) filters it out.
    const src = read("app/nurse/resus/[episodeId]/_components/v2/after-death.tsx");
    expect(src).toMatch(/r\.id !== "CO-ADT-11"/);
  });
});
