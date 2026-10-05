/**
 * The pack's content laws, enforced in CI (PROMPT-NCD-DIABETES N1, N5, N9, N10, N11).
 * The pack's own Python builder enforces the same; these keep the shipped runtime file honest.
 */
import type { PackCriterion, PackX } from "@/lib/ncd/pack/types";
import { describe, expect, it } from "vitest";

import { diabetesPack } from "@/lib/ncd/pack";
import { predicatesOf } from "@/lib/ncd/pack/engine";

const P = diabetesPack();

const NUMERIC = new Set([">=", ">", "<=", "<"]);
type Item = { id: string; x: PackX; when?: PackCriterion; contraindications?: PackCriterion[] };
const ITEMS: [string, Item][] = [
  ...P.rules.map((r) => ["rule", r] as [string, Item]),
  ...P.management.map((s) => ["step", s] as [string, Item]),
  ...P.therapyFlags.map((f) => ["flag", f] as [string, Item]),
  ...P.targets.map((t) => ["target", t] as [string, Item]),
  ...P.validityCaveats.map((c) => ["caveat", c] as [string, Item]),
];
function* criteria(): Generator<[string, PackCriterion]> {
  for (const [kind, it] of ITEMS) {
    if (it.when) yield [`${kind}.${it.id}`, it.when];
    for (const k of [
      ...(it.contraindications ?? []),
      ...(it.x.notWhen ?? []),
      ...(it.x.cautions ?? []),
    ])
      yield [`${kind}.${it.id}`, k];
  }
  for (const cs of [...P.diagnosis, ...P.diagnosisPending])
    for (const c of cs.anyOf) yield [`set.${cs.id}`, c];
  for (const c of P.complications) {
    for (const k of c.establishedBy) yield [`complication.${c.code}`, k];
    for (const st of c.staging ?? []) for (const sg of st.stages) yield [`stage.${st.id}`, sg.when];
  }
  for (const m of P.riskModels) for (const b of m.bands) yield [`risk.${m.id}`, b.when];
}

describe("N1: one number, one place", () => {
  it("every numeric threshold names a REF-DM entry whose value it is", () => {
    const bad: string[] = [];
    for (const [where, c] of criteria())
      for (const p of predicatesOf(c)) {
        if (!NUMERIC.has(p.op)) continue;
        const ref = p._ref ? P.refs[p._ref] : undefined;
        if (!ref || ref.value !== p.value)
          bad.push(
            `${where}.${c.id}: ${p.feature} ${p.op} ${String(p.value)} (${p._ref ?? "no ref"})`,
          );
      }
    expect(bad).toEqual([]);
  });
});

describe("N10: a label states the numbers its predicates test", () => {
  it("every REF number appears in its criterion's label", () => {
    const bad: string[] = [];
    for (const [where, c] of criteria()) {
      const lab = c.label.replace(/,/g, "");
      for (const p of predicatesOf(c)) {
        if (!p._ref || typeof p.value !== "number") continue;
        const v = p.value;
        const forms = new Set([
          String(v),
          v.toFixed(1),
          Number.isInteger(v) ? String(v) : String(v),
        ]);
        if (p.op === "<")
          for (const f of [
            (v - 0.1).toFixed(1),
            Number.isInteger(v) ? String(v - 1) : "",
            (v - 0.01).toFixed(2),
          ])
            if (f) forms.add(f);
        const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        if (![...forms].some((s) => new RegExp(`(?<![\\d.])${esc(s)}(?![\\d])`).test(lab)))
          bad.push(`${where}.${c.id}: '${c.label}' lacks ${v}`);
      }
    }
    expect(bad).toEqual([]);
  });
});

describe("N5: no dose, no titration", () => {
  const DOSE =
    /\b\d+(\.\d+)?\s?(mg|mcg|µg|microgram|g|units?|iu|ml|mL|tablets?|tabs?|puffs?)\b(?!\s*\/\s*(dL|dl|g|mmol|L|l|24|min|day creat))|\b(once|twice|three times)\s+(a\s+)?(daily|day)\b|\b(od|bd|tds|qds|nocte)\b/gi;
  const OK =
    /mg\/dL|mg\/g|mg\/mmol|mL\/min|mL\/kg\/h|mg\/24|g\/day|g\/kg|g per|g of carbohydrate|75[- ]?g|10[- ]?g monofilament|100[- ]?g|50[- ]?g/i;
  function* strings(o: unknown, path: string): Generator<[string, string]> {
    if (typeof o === "string") yield [path, o];
    else if (Array.isArray(o)) for (const [i, v] of o.entries()) yield* strings(v, `${path}[${i}]`);
    else if (o && typeof o === "object")
      for (const [k, v] of Object.entries(o))
        if (!["quote", "url", "citation"].includes(k)) yield* strings(v, `${path}.${k}`);
  }
  it("no shown string looks like a dose", () => {
    const hits: string[] = [];
    for (const [kind, it] of ITEMS)
      for (const [path, s] of strings(it, `${kind}.${it.id}`))
        for (const m of s.matchAll(DOSE))
          if (
            !OK.test(s.slice(Math.max(0, (m.index ?? 0) - 12), (m.index ?? 0) + m[0].length + 14))
          )
            hits.push(`${path}: ${m[0]}`);
    expect(hits).toEqual([]);
  });
});

describe("N9: restricted classes never ride in a shown string", () => {
  it("every item that reads a restricted fact has a neutral display (and a flag a neutral action)", () => {
    const bad: string[] = [];
    for (const [kind, it] of ITEMS) {
      if (!(it.x.restrictedClasses ?? []).length) continue;
      if (!it.x.neutralDisplay) bad.push(`${kind}.${it.id}: no neutralDisplay`);
      if (kind === "flag" && !it.x.neutralAction) bad.push(`${kind}.${it.id}: no neutralAction`);
      for (const w of [
        "HIV",
        "ART",
        "TB",
        "antipsychotic",
        "dolutegravir",
        "rifampicin",
        "pregnan",
        "conceive",
        "tuberculosis",
      ])
        for (const key of ["neutralDisplay", "neutralAction", "neutralAlternative"])
          if (new RegExp(`\\b${w}`).test(String(it.x[key] ?? "")))
            bad.push(`${kind}.${it.id}.${key} leaks ${w}`);
      const p = it.x.proposal as { restrictedClass?: string } | undefined;
      if (p?.restrictedClass && !it.x.neutralProposal)
        bad.push(`${kind}.${it.id}: proposal names a restricted class without neutralProposal`);
    }
    expect(bad).toEqual([]);
  });
});

describe("N11: off is a field, and nothing unsigned claims to be signed", () => {
  it("every item switched off names the decision that switches it on", () => {
    expect(
      ITEMS.filter(([, it]) => it.x.enabled === false && !it.x.enabledBy).map(
        ([k, it]) => `${k}.${it.id}`,
      ),
    ).toEqual([]);
  });
  it("no reference claims a CSO signature while needing CSO input", () => {
    expect(
      Object.entries(P.refs)
        .filter(([, r]) => r.status === "cso_signed" && r.needsCsoInput)
        .map(([k]) => k),
    ).toEqual([]);
  });
});
