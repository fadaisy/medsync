/**
 * MS-RX-CAT-001 (ADR 0187): the pack's validator (drug-catalogue-validate.py) as tests, the
 * dose-content guard, and the generated module's drift. The guard is the one that matters: no dose
 * text may appear in any entry whose dose is not verified.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { DRUGS } from "@/lib/prescribing/formulary";
import {
  DOSE_BANDS,
  DRUG_FLAG_KEYS,
  FORMULARY_CHARTS,
  FORMULARY_ROUTES,
  SUPPORTIVE_IDS,
} from "@/lib/prescribing/reference/formulary-types";
import {
  ALLERGY_GROUPS,
  DIAGNOSIS_LINKS,
  DRUG_CLASSES,
  DRUG_SYSTEMS,
  FORMULARY_DRUGS,
  FORMULARY_META,
  SUPPORTIVE_ITEMS,
} from "@/lib/prescribing/reference/general-formulary";
import {
  FORMULARY_OUTPUT,
  FORMULARY_SOURCE,
  generateFormulary,
  readFormularySource,
} from "@/scripts/prescribing/gen-formulary";

const root = process.cwd();
const json = readFormularySource(root);
const dx = JSON.parse(
  readFileSync(join(root, "data/clerking/clerking-diagnosis-catalogue.v1.json"), "utf8"),
) as { profiles: Record<string, unknown> };

// The validator's patterns, verbatim in meaning (drug-catalogue-validate.py DOSE_RE / FREQ_RE).
const DOSE_RE =
  /\d+(?:[.,]\d+)?\s*(?:(?:mg\/kg|mcg\/kg|micrograms?\/kg|g\/kg|units?\/kg|mg\/m2|mg|g|mcg|µg|ug|micrograms?|mL|ml|L|units?|IU|mmol|mEq|drops?)\b|%)/i;
const FREQ_RE =
  /\b(?:once|twice|thrice|three times|four times)\s+(?:a\s+|per\s+)?(?:day|daily|week|weekly)\b|\b(?:od|bd|bid|tds|tid|qds|qid|nocte|mane|prn|stat|q\d+h)\b|\bevery\s+\d+\s*(?:min(?:ute)?s?|h|hrs?|hours?|days?|weeks?)\b|\b(?:for|x)\s*\d+\s*(?:days?|weeks?|months?|doses?)\b|\bper\s+kg\b|\/kg\b|\bmax(?:imum)?\s+(?:dose|daily)\b/i;

function* strings(node: unknown, path: string): Generator<[string, string]> {
  if (typeof node === "string") yield [path, node];
  else if (Array.isArray(node))
    for (const [i, v] of node.entries()) yield* strings(v, `${path}[${i}]`);
  else if (node && typeof node === "object")
    for (const [k, v] of Object.entries(node)) {
      yield [`${path}.${k}(key)`, k];
      yield* strings(v, `${path}.${k}`);
    }
}

/** Dose or frequency text in any string, except a strength inside a name ("Glucose 50%"). */
function doseText(node: unknown, path: string, exempt: ReadonlySet<string> = new Set()): string[] {
  const hits: string[] = [];
  for (const [p, s] of strings(node, path)) {
    if (!exempt.has(p) && DOSE_RE.test(s)) hits.push(`${p}: ${s}`);
    if (FREQ_RE.test(s)) hits.push(`${p}: ${s}`);
  }
  return hits;
}

const classIds = new Set(DRUG_CLASSES.map((c) => c.id));
const groupIds = new Set(ALLERGY_GROUPS.map((g) => g.id));
const systemIds = new Set(DRUG_SYSTEMS.map((s) => s.id));

describe("MS-RX-CAT-001 generated module", () => {
  it("regenerating from the JSON reproduces the committed module byte for byte", async () => {
    expect(await generateFormulary(root)).toBe(readFileSync(join(root, FORMULARY_OUTPUT), "utf8"));
  });

  it("carries the JSON's data unchanged", () => {
    expect(FORMULARY_META.id).toBe("MS-RX-CAT-001");
    expect(DRUG_SYSTEMS).toEqual(json.systems);
    expect(DRUG_CLASSES).toEqual(json.classes);
    expect(FORMULARY_DRUGS).toEqual(json.drugs);
    expect(DIAGNOSIS_LINKS).toEqual(json.diagnosisLinks);
    expect(FORMULARY_SOURCE).toBe("data/prescribing/drug-catalogue.v0.json");
  });

  it("the data copy is byte-identical to the pack as delivered", () => {
    expect(readFileSync(join(root, FORMULARY_SOURCE))).toEqual(
      readFileSync(join(root, "docs/emr/clerking-v2/plan/drug-catalogue.v0.json")),
    );
  });
});

describe("MS-RX-CAT-001 structure (drug-catalogue-validate.py)", () => {
  it("ids are unique within each kind", () => {
    for (const list of [
      DRUG_SYSTEMS,
      DRUG_CLASSES,
      FORMULARY_DRUGS,
      ALLERGY_GROUPS,
      SUPPORTIVE_ITEMS,
    ]) {
      const ids = list.map((x) => x.id);
      expect(new Set(ids).size).toBe(ids.length);
    }
    const links = DIAGNOSIS_LINKS.map((l) => l.profileId);
    expect(new Set(links).size).toBe(links.length);
  });

  it("classes name a known system, parent and allergy group, with no cycle", () => {
    const byId = new Map(DRUG_CLASSES.map((c) => [c.id, c]));
    for (const c of DRUG_CLASSES) {
      expect(systemIds.has(c.system), c.id).toBe(true);
      if (c.parent) expect(classIds.has(c.parent) && c.parent !== c.id, c.id).toBe(true);
      if (c.allergyGroup) expect(groupIds.has(c.allergyGroup), c.id).toBe(true);
      const seen = new Set<string>();
      for (let cur: string | null = c.id; cur; cur = byId.get(cur)?.parent ?? null) {
        expect(seen.has(cur), `${c.id} cycles`).toBe(false);
        seen.add(cur);
      }
    }
  });

  it("every system has classes; every leaf class has drugs", () => {
    for (const s of systemIds)
      expect(
        DRUG_CLASSES.some((c) => c.system === s),
        s,
      ).toBe(true);
    for (const c of DRUG_CLASSES) {
      const parent = DRUG_CLASSES.some((x) => x.parent === c.id);
      if (!parent)
        expect(
          FORMULARY_DRUGS.some((d) => d.class === c.id),
          c.id,
        ).toBe(true);
    }
  });

  it("drugs: known class, allowed routes with matching methods, flags, charts and groups", () => {
    const flagKeys = [...DRUG_FLAG_KEYS].sort();
    for (const d of FORMULARY_DRUGS) {
      expect(classIds.has(d.class), d.id).toBe(true);
      expect(d.routes.length, d.id).toBeGreaterThan(0);
      expect(new Set(d.routes).size, d.id).toBe(d.routes.length);
      for (const r of d.routes) expect(FORMULARY_ROUTES as readonly string[]).toContain(r);
      expect(Object.keys(d.methods).sort(), d.id).toEqual([...d.routes].sort());
      for (const ms of Object.values(d.methods))
        expect(
          ms!.every((m) => m.length > 0),
          d.id,
        ).toBe(true);
      expect(d.presentationsDraft.length, d.id).toBeGreaterThan(0);
      for (const g of d.allergyGroups) expect(groupIds.has(g), `${d.id} ${g}`).toBe(true);
      const cls = DRUG_CLASSES.find((c) => c.id === d.class)!;
      if (cls.allergyGroup) expect(d.allergyGroups, d.id).toContain(cls.allergyGroup);
      expect(Object.keys(d.flags).sort(), d.id).toEqual(flagKeys);
      for (const v of Object.values(d.flags)) expect(typeof v).toBe("boolean");
      for (const ch of d.charts) expect(FORMULARY_CHARTS as readonly string[]).toContain(ch);
      expect(d.charts, d.id).toContain("mar");
      expect([true, false, null]).toContain(d.onEmhsluDraft);
    }
  });

  it("supportive items and diagnosis links point at known classes and profiles", () => {
    for (const s of SUPPORTIVE_ITEMS) {
      expect(SUPPORTIVE_IDS as readonly string[]).toContain(s.id);
      for (const c of s.classes) expect(classIds.has(c), s.id).toBe(true);
    }
    for (const l of DIAGNOSIS_LINKS) {
      expect(l.profileId in dx.profiles, l.profileId).toBe(true);
      expect(l.classes.length + l.supportive.length, l.profileId).toBeGreaterThan(0);
      expect(new Set(l.classes).size, l.profileId).toBe(l.classes.length);
      for (const c of l.classes) expect(classIds.has(c), `${l.profileId} ${c}`).toBe(true);
      for (const s of l.supportive) expect(SUPPORTIVE_IDS as readonly string[]).toContain(s);
    }
  });

  it("the counts the pack reported (STOP 0)", () => {
    const parents = new Set(DRUG_CLASSES.flatMap((c) => (c.parent ? [c.parent] : [])));
    expect({
      systems: DRUG_SYSTEMS.length,
      classes: DRUG_CLASSES.length,
      leaf: DRUG_CLASSES.filter((c) => !parents.has(c.id)).length,
      drugs: FORMULARY_DRUGS.length,
      links: DIAGNOSIS_LINKS.length,
      groups: ALLERGY_GROUPS.length,
    }).toEqual({ systems: 14, classes: 69, leaf: 67, drugs: 182, links: 100, groups: 28 });
  });
});

describe("the dose-content guard", () => {
  it("the catalogue as delivered carries no dose: every entry to-verify, no regimen, null bands", () => {
    for (const d of FORMULARY_DRUGS) {
      expect(d.dose.status, d.id).toBe("to-verify");
      expect(d.dose.regimens, d.id).toEqual([]);
      for (const b of DOSE_BANDS) expect(d.dose.bands[b], d.id).toBeNull();
      expect([d.dose.renal, d.dose.hepatic, d.dose.pregnancy], d.id).toEqual([null, null, null]);
      expect(d.dose.verifyAt.length, d.id).toBeGreaterThan(0);
    }
  });

  it("no dose text in any entry whose dose is not verified (a name may carry its strength)", () => {
    const hits = DRUGS.filter((d) => d.dose.status !== "verified").flatMap((d) =>
      doseText(d, `drug[${d.id}]`, new Set([`drug[${d.id}].generic`])),
    );
    expect(hits).toEqual([]);
  });

  it("no dose text in classes, links or the top level", () => {
    const hits = [
      ...DRUG_CLASSES.flatMap((c) =>
        doseText(c, `class[${c.id}]`, new Set([`class[${c.id}].name`])),
      ),
      ...DIAGNOSIS_LINKS.flatMap((l) => doseText(l, `link[${l.profileId}]`)),
      ...[
        "id",
        "version",
        "createdAt",
        "status",
        "conventions",
        "systems",
        "allergyGroups",
        "supportive",
      ].flatMap((k) => doseText(json[k], k)),
    ];
    expect(hits).toEqual([]);
  });

  it("the guard itself catches a remembered dose", () => {
    const planted = { ...FORMULARY_DRUGS[0]!, presentationsDraft: ["500 mg tablet"] };
    expect(doseText(planted, "x").length).toBeGreaterThan(0);
    expect(doseText({ note: "give twice daily" }, "x").length).toBeGreaterThan(0);
    expect(doseText({ note: "for 5 days" }, "x").length).toBeGreaterThan(0);
  });

  it("only the signed emergency entries are verified, and only they carry regimens", () => {
    const verified = DRUGS.filter((d) => d.dose.status === "verified").map((d) => d.id);
    expect(verified.sort()).toEqual([
      "glucagon",
      "glucose_10",
      "ringers_lactate",
      "sodium_chloride_0_9",
    ]);
    for (const d of DRUGS)
      if (d.dose.status !== "verified") expect(d.dose.regimens.length, d.id).toBe(0);
  });
});
