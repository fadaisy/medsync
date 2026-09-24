import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { LIFECYCLE_RULE_IDS } from "@/lib/resus/closeout/lifecycle";
import { SURVEY_RULE_IDS } from "@/lib/resus/reference/presentation";

/**
 * GATE A §10 item 3 — rule-ID coverage. Every rule ID in the three signed
 * catalogs, the survey list (SURVEY_RULE_IDS + GATE A §5 SV-VIT rows) and the
 * lifecycle list has at least one test in tests/resus/v2 whose title STARTS
 * with it ("ID: …" or "ID, ID2: …"). An uncovered ID fails the suite; the fix
 * is a test, never an allowlist entry.
 */

/** Must stay EMPTY. Listed here only so a reviewer sees the escape hatch is shut. */
const KNOWN_UNCOVERED: readonly string[] = [];

const ROOT = process.cwd();
const read = (p: string) => readFileSync(join(ROOT, p), "utf8");

const CATALOGS = [
  {
    path: "docs/clinical/resus-als-clinical-catalog.md",
    prefix: "ALS",
    loose: [/ALS-[A-Z]+-\d{2}/g],
  },
  {
    path: "docs/clinical/resus-post-rosc-clinical-catalog.md",
    prefix: "PR",
    loose: [/PR-[A-Z]+-\d{2}/g],
  },
  {
    path: "docs/clinical/resus-closeout-clinical-catalog.md",
    prefix: "CO",
    loose: [/CO-[A-Z]+-\d{2}/g, /CO-R\d{1,2}\b/g],
  },
] as const;

/** Rule IDs a catalog DEFINES: the first cell of each table row (PR-PIN-B, CO-R1 included). */
function rowIds(text: string, prefix: string): string[] {
  const re = new RegExp(`^\\|\\s*(${prefix}-[A-Z0-9]+(?:-[A-Z0-9]+)?)\\s*\\|`, "gm");
  return [...text.matchAll(re)].map((m) => m[1]!);
}

const ID_SRC = "[A-Z]{2,4}(?:-[A-Z0-9]+)+";
const LEAD = new RegExp(`^${ID_SRC}(?:\\s*(?:,|/|&|\\+|and)\\s*${ID_SRC})*(?=[\\s:—–(.]|$)`);

/** The rule IDs a test title starts with ("ID: …", "ID, ID2: …", "ID — …"); [] otherwise. */
function leadingIds(title: string): string[] {
  const head = LEAD.exec(title.trimStart())?.[0] ?? "";
  return [...head.matchAll(new RegExp(ID_SRC, "g"))].map((m) => m[0]);
}

/**
 * Test titles: the first string argument of it(…) / test(…) (+ .skip/.only/…),
 * and of the curried call after it.each(…)(…).
 * ponytail: `)(` stands in for the end of `.each(…)` (no paren balancing), so a
 * describe.each title would count too — none exist in tests/resus/v2.
 */
const TITLE =
  /(?:\b(?:it|test)(?:\.(?:skip|only|concurrent|sequential|fails))*|\))\s*\(\s*(["'`])(.*?)\1/g;

function testTitles(source: string): string[] {
  return [...source.matchAll(TITLE)].map((m) => m[2]!);
}

function v2TestFiles(): string[] {
  const dir = join(ROOT, "tests/resus/v2");
  return readdirSync(dir, { recursive: true, encoding: "utf8" })
    .filter((f) => f.endsWith(".test.ts") && !f.endsWith("rule-coverage.test.ts"))
    .map((f) => readFileSync(join(dir, f), "utf8"));
}

function catalogIds(): string[] {
  return CATALOGS.flatMap((c) => rowIds(read(c.path), c.prefix));
}

function gateAVitalIds(): string[] {
  return [...read("docs/resus-v2-gate-a-proposal.md").matchAll(/^\|\s*(SV-VIT-\d{2})\s*\|/gm)].map(
    (m) => m[1]!,
  );
}

function allRuleIds(): string[] {
  return [
    ...new Set([
      ...catalogIds(),
      ...SURVEY_RULE_IDS,
      ...gateAVitalIds(),
      ...Object.values(LIFECYCLE_RULE_IDS),
    ]),
  ];
}

describe("the parsers read what they claim to", () => {
  it("title parser: ID-first forms count, templates and mid-title IDs do not", () => {
    expect(leadingIds("ALS-AA-01: amiodarone after 3 shocks")).toEqual(["ALS-AA-01"]);
    expect(leadingIds("CO-R1, CO-R3: intubated → L3")).toEqual(["CO-R1", "CO-R3"]);
    expect(leadingIds("SV-CTX-19 — low RR")).toEqual(["SV-CTX-19"]);
    expect(leadingIds("PR-PIN-B: SpO₂ pin")).toEqual(["PR-PIN-B"]);
    expect(leadingIds("CO-R13: RRT + vasopressor")).toEqual(["CO-R13"]);
    expect(leadingIds("LC-01 / LC-06: read-only")).toEqual(["LC-01", "LC-06"]);
    expect(leadingIds("%s: %s label")).toEqual([]);
    expect(leadingIds("the rule ALS-AA-01 applies")).toEqual([]);
    expect(leadingIds("ALS-AA-01x: not an ID")).toEqual([]);
  });

  it("title parser: finds it / test / .each titles across lines, not describe titles", () => {
    const src = [
      'describe("ALS-X-01: block", () => {',
      '  it("ALS-X-02: a", () => {});',
      "  test.skip('ALS-X-03: b', () => {});",
      "  it.each([[1, 2]])(\n    `ALS-X-04: c %s`,\n    () => {},\n  );",
      "});",
    ].join("\n");
    expect(testTitles(src)).toEqual(["ALS-X-02: a", "ALS-X-03: b", "ALS-X-04: c %s"]);
  });

  it("catalog parser: every ID a catalog mentions anywhere is one of its defined rows", () => {
    for (const c of CATALOGS) {
      const text = read(c.path);
      const rows = new Set(rowIds(text, c.prefix));
      expect(rows.size, c.path).toBeGreaterThan(0);
      const mentioned = c.loose.flatMap((re) => [...text.matchAll(re)].map((m) => m[0]));
      expect(
        mentioned.filter((id) => !rows.has(id)),
        `${c.path} mentions IDs it does not define`,
      ).toEqual([]);
    }
  });

  it("catalog parser: row IDs are unique within and across the three catalogs", () => {
    const ids = catalogIds();
    expect(ids.filter((id, i) => ids.indexOf(id) !== i)).toEqual([]);
  });

  it("GATE A §5 lists SV-VIT-01..16 and SURVEY_RULE_IDS contains them all", () => {
    const vit = gateAVitalIds();
    expect(vit).toHaveLength(16);
    expect(vit.filter((id) => !SURVEY_RULE_IDS.includes(id))).toEqual([]);
  });
});

describe("every rule ID has a test whose title starts with it", () => {
  it("KNOWN_UNCOVERED stays empty", () => {
    expect(KNOWN_UNCOVERED).toEqual([]);
  });

  it("no rule ID in the catalogs, SURVEY_RULE_IDS or LIFECYCLE_RULE_IDS is uncovered", () => {
    const covered = new Set(v2TestFiles().flatMap(testTitles).flatMap(leadingIds));
    const missing = allRuleIds().filter((id) => !covered.has(id) && !KNOWN_UNCOVERED.includes(id));
    expect(
      missing,
      `Uncovered rule IDs (${missing.length}) — add a test titled "<ID>: …": ${missing.join(", ")}`,
    ).toEqual([]);
  });
});
