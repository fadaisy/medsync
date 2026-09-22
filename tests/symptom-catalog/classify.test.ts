import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type {
  CatalogItem,
  CatalogPackage,
  Classification,
  SubmissionAudience,
  SubmissionInput,
  Tier,
} from "@/supabase/functions/_shared/symptom-catalog/types";
import { describe, expect, it } from "vitest";

import { CATALOG } from "@/supabase/functions/_shared/symptom-catalog/catalog.v0.1";
import {
  classify,
  dangerSigns,
  searchItems,
  t,
  visibleCategories,
  visibleItems,
} from "@/supabase/functions/_shared/symptom-catalog/classify";
import { TIER_RANK } from "@/supabase/functions/_shared/symptom-catalog/types";

/**
 * The classifier against the shipped package (PRD MS-PRD-SYM-001 §5.3;
 * ADR 0098 ruling 1): the golden table (every E item, every R2 option, every
 * R3 row, every R4 pair), the laws (free text inert, invisible items
 * ignored, reasons name the decider), and the monotonicity invariant under
 * ≥ 10,000 seeded-PRNG submissions (ruling 11: no fast-check). Pure — no DB.
 */

// Widened: the generated const's `satisfies` literal type would make every item a distinct union member.
const pkg: CatalogPackage = CATALOG;
const AUDIENCES: SubmissionAudience[] = [
  "adult",
  "child_u2m",
  "child_2m_5y",
  "child_5_12",
  "pregnant",
];

const byKey = (key: string): CatalogItem => {
  const item = pkg.items.find((i) => i.key === key);
  if (!item) throw new Error(`missing ${key}`);
  return item;
};
/** The first audience that can see the item — `all` items default to adult. */
const audienceFor = (item: CatalogItem): SubmissionAudience =>
  item.audience.includes("all")
    ? "adult"
    : (AUDIENCES.find((a) => item.audience.includes(a)) ?? "adult");

const submit = (
  audience: SubmissionAudience,
  items: string[],
  qualifiers: SubmissionInput["qualifiers"] = {},
  freeText: string | null = null,
): Classification => classify({ audience, items, qualifiers, freeText }, pkg);

const r3Rules = pkg.rules.rules.filter((r) => r.kind === "audience_modifier");
const r4 = pkg.rules.rules.find((r) => r.kind === "combination");
if (!r4 || r4.kind !== "combination") throw new Error("R4 missing");

describe("classify — golden table", () => {
  it("every E item alone → E, and is the one reason", () => {
    const eItems = pkg.items.filter((i) => i.tier === "E");
    expect(eItems.length).toBeGreaterThanOrEqual(40);
    for (const item of eItems) {
      const out = submit(audienceFor(item), [item.key]);
      expect(out.tier, item.key).toBe("E");
      expect(out.reasons, item.key).toEqual([item.key]);
      expect(out.catalogVersion).toBe(pkg.version);
    }
  });

  it("every U item alone → U; every R item alone → R (with its own audience)", () => {
    for (const item of pkg.items.filter((i) => i.tier !== "E" && i.audience.length > 0)) {
      const audience = audienceFor(item);
      // R3 escalates some U/R items for a specific audience — those are asserted below, not here.
      const escalated = r3Rules.some(
        (r) =>
          r.kind === "audience_modifier" &&
          r.when.audience === audience &&
          r.when.anyOf.includes(item.key),
      );
      if (escalated) continue;
      expect(submit(audience, [item.key]).tier, item.key).toBe(item.tier);
    }
  });

  it("R2: every escalating option → its tier; every plain option → the item's own tier", () => {
    let escalating = 0;
    let plain = 0;
    for (const item of pkg.items.filter((i) => i.qualifiers?.length)) {
      const audience = audienceFor(item);
      for (const q of item.qualifiers ?? []) {
        for (const o of q.options) {
          const out = submit(audience, [item.key], { [item.key]: { [q.key]: o.key } });
          if (o.escalatesTo) {
            escalating++;
            expect(out.tier, `${item.key} ${q.key}=${o.key}`).toBe(o.escalatesTo);
            expect(out.reasons).toEqual([item.key]);
          } else {
            plain++;
            expect(out.tier, `${item.key} ${q.key}=${o.key}`).toBe(item.tier);
          }
        }
      }
    }
    expect(escalating).toBe(4);
    expect(plain).toBeGreaterThanOrEqual(5);
  });

  it("R2: an unknown option or a qualifier on an unchosen item changes nothing", () => {
    const base = submit("adult", ["SYM.MOOD.DIZZY"]);
    expect(base.tier).toBe("R");
    expect(submit("adult", ["SYM.MOOD.DIZZY"], { "SYM.MOOD.DIZZY": { nope: "yes" } }).tier).toBe(
      "R",
    );
    expect(
      submit("adult", ["SYM.MOOD.DIZZY"], {
        "SYM.MOOD.DIZZY": { chest_pain_or_fainting: "maybe" },
      }).tier,
    ).toBe("R");
    // The answer is for HEART_RACING, which was not chosen.
    expect(
      submit("adult", ["SYM.MOOD.DIZZY"], {
        "SYM.MOOD.HEART_RACING": { chest_pain_or_fainting: "yes" },
      }).tier,
    ).toBe("R");
  });

  it("R3: every row of every audience modifier → its tier for that audience, and the rule is named in the trace", () => {
    let rows = 0;
    for (const rule of r3Rules) {
      if (rule.kind !== "audience_modifier") continue;
      for (const key of rule.when.anyOf) {
        const item = byKey(key);
        if (!item.audience.includes("all") && !item.audience.includes(rule.when.audience)) continue;
        rows++;
        const out = submit(rule.when.audience, [key]);
        expect(out.tier, `${rule.when.audience} + ${key}`).toBe(rule.tier);
        expect(out.reasons).toEqual([key]);
        expect(out.trace.find((x) => x.rule === "R3" && x.detail.includes(key))).toBeDefined();
      }
    }
    expect(rows).toBeGreaterThanOrEqual(25);
  });

  it("R3 named cases: infant fever, pregnant fever + too weak, child IMCI danger signs", () => {
    expect(submit("child_u2m", ["SYM.CHILD.FEVER"]).tier).toBe("E");
    expect(submit("child_u2m", ["SYM.FEVER.OVER_2_DAYS"]).tier).toBe("E");
    expect(submit("pregnant", ["SYM.FEVER.PREG_FEVER_WEAK"]).tier).toBe("E");
    for (const a of ["child_u2m", "child_2m_5y", "child_5_12"] as const) {
      for (const key of [
        "SYM.BELLY.VOMITING_EVERYTHING",
        "SYM.CHILD.NOT_DRINKING",
        "SYM.CHILD.VOMITS_EVERYTHING",
        "SYM.CHILD.FITS",
        "SYM.CHILD.VERY_SLEEPY",
        "SYM.CHILD.BREATHING_FAST",
      ]) {
        expect(submit(a, [key]).tier, `${a} + ${key}`).toBe("E");
      }
    }
  });

  it("R3 negatives: the same items outside the audience keep their own tier", () => {
    expect(submit("adult", ["SYM.BELLY.VOMITING_EVERYTHING"]).tier).toBe("U");
    expect(submit("child_2m_5y", ["SYM.CHILD.FEVER"]).tier).toBe("U");
    expect(submit("child_5_12", ["SYM.FEVER.OVER_2_DAYS"]).tier).toBe("U");
    expect(submit("adult", ["SYM.FEVER.MILD_WITH_COLD"]).tier).toBe("R");
  });

  it("R4: fever × each unusual bleeding → E with isolation, both named as reasons", () => {
    const [fevers, bleeds] = r4.when.allOfGroups as [string[], string[]];
    let pairs = 0;
    for (const f of fevers) {
      for (const b of bleeds) {
        const fi = byKey(f);
        const bi = byKey(b);
        const audience = AUDIENCES.find(
          (a) =>
            (fi.audience.includes("all") || fi.audience.includes(a)) &&
            (bi.audience.includes("all") || bi.audience.includes(a)),
        );
        if (!audience) continue;
        pairs++;
        const out = submit(audience, [f, b]);
        expect(out.tier, `${f} + ${b}`).toBe("E");
        expect(out.flags, `${f} + ${b}`).toContain("isolation");
        expect(out.reasons).toContain(f);
        expect(out.reasons).toContain(b);
        expect(out.trace.find((x) => x.rule === "R4")?.detail).toContain("isolation");
      }
    }
    expect(pairs).toBe(fevers.length * bleeds.length);
  });

  it("R4 negatives: fever alone or bleeding alone never sets isolation", () => {
    const out = submit("adult", ["SYM.FEVER.OVER_2_DAYS"]);
    expect(out.tier).toBe("U");
    expect(out.flags).toEqual([]);
    const bleed = submit("adult", ["SYM.URINE.BLOOD_IN_URINE"]);
    expect(bleed.tier).toBe("U");
    expect(bleed.flags).toEqual([]);
    expect(submit("adult", ["SYM.FEVER.OVER_2_DAYS", "SYM.URINE.BLOOD_IN_URINE"]).flags).toEqual([
      "isolation",
    ]);
  });

  it("R5: a mixed pick takes the highest item tier and names only the deciders", () => {
    const e = submit("adult", [
      "SYM.CHEST.COUGH_OVER_2_WEEKS",
      "SYM.FEVER.OVER_2_DAYS",
      "SYM.HEAD.FIT",
    ]);
    expect(e.tier).toBe("E");
    expect(e.reasons).toEqual(["SYM.HEAD.FIT"]);
    const u = submit("adult", ["SYM.CHEST.COUGH_OVER_2_WEEKS", "SYM.FEVER.OVER_2_DAYS"]);
    expect(u.tier).toBe("U");
    expect(u.reasons).toEqual(["SYM.FEVER.OVER_2_DAYS"]);
    const r = submit("adult", ["SYM.CHEST.COUGH_OVER_2_WEEKS", "SYM.BONES.JOINT_PAIN"]);
    expect(r.tier).toBe("R");
    expect(r.reasons).toEqual(["SYM.CHEST.COUGH_OVER_2_WEEKS", "SYM.BONES.JOINT_PAIN"]);
  });

  it("nothing chosen → R with no reasons, no flags, no hint", () => {
    const out = submit("adult", []);
    expect(out.tier).toBe("R");
    expect(out.reasons).toEqual([]);
    expect(out.flags).toEqual([]);
    expect(out.serviceLineHint).toBeNull();
    expect(out.trace.map((x) => x.rule)).toEqual([
      "R1",
      "R2",
      "R3",
      "R3",
      "R3",
      "R3",
      "R3",
      "R4",
      "R5",
      "R6",
      "R7",
    ]);
  });
});

describe("classify — laws", () => {
  it("R6: free text never changes the answer (same input ± text)", () => {
    const cases: [SubmissionAudience, string[]][] = [
      ["adult", []],
      ["adult", ["SYM.BONES.JOINT_PAIN"]],
      ["adult", ["SYM.FEVER.OVER_2_DAYS"]],
      ["child_u2m", ["SYM.CHILD.FEVER"]],
      ["pregnant", ["SYM.URINE.PREG_SWELLING", "SYM.FEVER.OVER_2_DAYS"]],
    ];
    for (const [audience, items] of cases) {
      const without = submit(audience, items);
      for (const text of ["", "chest pain fits bleeding can't breathe", "x".repeat(500)]) {
        expect(submit(audience, items, {}, text), `${audience} ${items.join(",")}`).toEqual(
          without,
        );
      }
    }
  });

  it("items not in the catalog or not shown to the audience are ignored, and the trace says so", () => {
    const out = submit("adult", ["SYM.CHILD.FITS", "SYM.NOPE.X", "SYM.HEAD.PREG_FITS"]);
    expect(out.tier).toBe("R");
    expect(out.reasons).toEqual([]);
    const input = out.trace.filter((x) => x.rule === "input").map((x) => x.detail);
    expect(input).toHaveLength(3);
    expect(input.join("\n")).toMatch(/SYM\.CHILD\.FITS: not shown to adult/);
    expect(input.join("\n")).toMatch(/SYM\.NOPE\.X: not in catalog/);
    // The same key IS visible — and an emergency — for the right audience.
    expect(submit("child_2m_5y", ["SYM.CHILD.FITS"]).tier).toBe("E");
    expect(submit("pregnant", ["SYM.HEAD.PREG_FITS"]).tier).toBe("E");
  });

  it("flags are the union of chosen items' flags (catalog order) plus R4's", () => {
    expect(submit("adult", ["SYM.MOOD.SELF_HARM", "SYM.HEAD.FACE_DROOPING"]).flags).toEqual([
      "stroke_time",
      "crisis_route",
    ]);
    expect(submit("adult", ["SYM.FEVER.WITH_BLEEDING", "SYM.FEVER.OVER_2_DAYS"]).flags).toEqual([
      "isolation",
    ]);
  });

  it("serviceLineHint is the highest-tier hinted item's; ties → first in catalog order; none → null", () => {
    expect(
      submit("adult", ["SYM.CHEST.COUGH_OVER_2_WEEKS", "SYM.CHEST.BREATHLESS_WALKING_LYING"])
        .serviceLineHint,
    ).toBe("cardiology");
    expect(
      submit("adult", ["SYM.URINE.LEGS_SWELLING_LESS_URINE", "SYM.SKIN.INFECTED_WOUND"])
        .serviceLineHint,
    ).toBe("renal");
    expect(submit("adult", ["SYM.HEAD.FIT", "SYM.BONES.NUMB_FEET"]).serviceLineHint).toBe(
      "diabetes_ncd",
    );
    expect(submit("adult", ["SYM.HEAD.FIT"]).serviceLineHint).toBeNull();
  });

  it("the answer is a function of the set: tap order and duplicates do not matter", () => {
    const a = submit("adult", ["SYM.FEVER.OVER_2_DAYS", "SYM.HEAD.FIT", "SYM.BONES.JOINT_PAIN"]);
    const b = submit("adult", [
      "SYM.BONES.JOINT_PAIN",
      "SYM.HEAD.FIT",
      "SYM.HEAD.FIT",
      "SYM.FEVER.OVER_2_DAYS",
    ]);
    expect(b).toEqual(a);
  });

  it("the classifier source is pure: one type-only import, no clock, no randomness, no I/O", () => {
    const src = readFileSync(
      resolve(__dirname, "../../supabase/functions/_shared/symptom-catalog/classify.ts"),
      "utf8",
    );
    const imports = src.match(/^import .*$/gm) ?? [];
    expect(imports).toEqual(["import type {"]);
    expect(src).toMatch(/from "\.\/types\.ts";/);
    expect(src).not.toMatch(/Date\b|Math\.random|fetch\(|freeText|process\.|Deno\./);
  });
});

describe("catalog helpers", () => {
  it("visibleItems: `all` items plus the audience's own; the review affordance is nobody's", () => {
    for (const a of AUDIENCES) {
      for (const i of visibleItems(pkg, a)) {
        expect(i.audience.includes("all") || i.audience.includes(a), `${a} ${i.key}`).toBe(true);
      }
      expect(visibleItems(pkg, a).some((i) => i.key === "SYM.NCD.ROUTINE_REVIEW")).toBe(false);
    }
    expect(visibleItems(pkg, "adult").some((i) => i.key === "SYM.CHILD.FITS")).toBe(false);
    expect(visibleItems(pkg, "child_5_12").some((i) => i.key === "SYM.CHILD.FITS")).toBe(true);
  });

  it("visibleCategories: 11 per audience in slot order; children get child_illness in skin's slot", () => {
    const adult = visibleCategories(pkg, "adult");
    expect(adult.map((c) => c.key)).not.toContain("child_illness");
    expect(adult.find((c) => c.key === "skin")?.slot).toBe(10);
    expect(adult).toHaveLength(11);
    for (const a of ["child_u2m", "child_2m_5y", "child_5_12"] as const) {
      const cats = visibleCategories(pkg, a);
      expect(cats).toHaveLength(11);
      expect(cats.map((c) => c.key)).not.toContain("skin");
      expect(cats.find((c) => c.key === "child_illness")?.slot).toBe(10);
      expect(cats.map((c) => c.slot)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]);
    }
    expect(visibleCategories(pkg, "pregnant").map((c) => c.slot)).toEqual([
      1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11,
    ]);
  });

  it("dangerSigns: exactly four E items per audience, in catalog order", () => {
    for (const a of AUDIENCES) {
      const strip = dangerSigns(pkg, a);
      expect(strip, a).toHaveLength(4);
      for (const i of strip) expect(i.tier).toBe("E");
      const idx = strip.map((i) => pkg.items.indexOf(i));
      expect([...idx].sort((x, y) => x - y)).toEqual(idx);
    }
  });

  it("searchItems: case-insensitive over label + synonyms, audience-scoped, catalog order, never tier order", () => {
    const fits = searchItems(pkg, "adult", "FITS");
    expect(fits.map((i) => i.key)).toContain("SYM.HEAD.FIT");
    expect(fits.map((i) => i.key)).not.toContain("SYM.CHILD.FITS");
    expect(searchItems(pkg, "child_2m_5y", "fits").map((i) => i.key)).toContain("SYM.CHILD.FITS");
    // Lay Ugandan English reaches the item through synonyms.
    expect(searchItems(pkg, "adult", "pressure").map((i) => i.key)).toContain(
      "SYM.NCD.PRESSURE_HIGH_REPEATEDLY",
    );
    expect(searchItems(pkg, "adult", "sugar").length).toBeGreaterThan(0);
    // Prefix and multi-word substring.
    expect(searchItems(pkg, "adult", "brea").map((i) => i.key)).toContain(
      "SYM.CHEST.STRUGGLING_TO_BREATHE",
    );
    expect(searchItems(pkg, "adult", "fever bleeding").map((i) => i.key)).toContain(
      "SYM.FEVER.WITH_BLEEDING",
    );
    // Catalog order, whatever the tiers.
    const fever = searchItems(pkg, "adult", "fever");
    expect(fever.length).toBeGreaterThan(5);
    const idx = fever.map((i) => pkg.items.indexOf(i));
    expect([...idx].sort((x, y) => x - y)).toEqual(idx);
    expect(fever.map((i) => i.tier)).not.toEqual([...fever.map((i) => i.tier)].sort());
    expect(searchItems(pkg, "adult", "")).toEqual([]);
    expect(searchItems(pkg, "adult", "   ")).toEqual([]);
    expect(searchItems(pkg, "adult", "zzzzqq")).toEqual([]);
  });

  it("t: every referenced key resolves; a missing key throws", () => {
    for (const i of pkg.items) {
      expect(t(pkg, i.labelKey)).toBeTruthy();
      if (i.helperKey) expect(t(pkg, i.helperKey)).toBeTruthy();
      for (const q of i.qualifiers ?? []) {
        expect(t(pkg, q.promptKey)).toBeTruthy();
        for (const o of q.options) expect(t(pkg, o.labelKey)).toBeTruthy();
      }
    }
    for (const c of pkg.categories) expect(t(pkg, c.labelKey)).toBeTruthy();
    expect(t(pkg, "tier.E")).toBe("Get help now");
    expect(() => t(pkg, "item.SYM.NOPE.label")).toThrow(/no en string/);
  });
});

/* ── Monotonicity property (PRD §5.1 principle 2; ADR 0098 ruling 11) ─── */

/** xorshift32 — seeded, so a failure reproduces from the printed seed. */
function prng(seed: number) {
  let s = seed >>> 0 || 0x9e3779b9;
  const next = (): number => {
    s ^= s << 13;
    s >>>= 0;
    s ^= s >>> 17;
    s ^= s << 5;
    s >>>= 0;
    return s;
  };
  return {
    int: (n: number): number => next() % n,
    pick: <T>(arr: readonly T[]): T => {
      const v = arr[next() % arr.length];
      if (v === undefined) throw new Error("pick from empty");
      return v;
    },
    chance: (p: number): boolean => next() / 0x100000000 < p,
  };
}

describe("classify — monotonicity property", () => {
  const SEED = 0x5eed_2026;
  const CASES = 10_000;

  it(`adding an item or an escalating answer never lowers the tier (${CASES} seeded cases); classify is idempotent`, () => {
    const rnd = prng(SEED);
    const visible = Object.fromEntries(AUDIENCES.map((a) => [a, visibleItems(pkg, a)])) as Record<
      SubmissionAudience,
      CatalogItem[]
    >;
    const clone = (x: SubmissionInput): SubmissionInput => structuredClone(x);
    let addedItems = 0;
    let addedAnswers = 0;
    let raised = 0;
    let idempotent = 0;

    for (let n = 0; n < CASES; n++) {
      const audience = rnd.pick(AUDIENCES);
      const pool = visible[audience];
      const items = new Set<string>();
      for (let k = rnd.int(6); k > 0; k--) items.add(rnd.pick(pool).key);
      const qualifiers: SubmissionInput["qualifiers"] = {};
      for (const key of items) {
        for (const q of byKey(key).qualifiers ?? []) {
          if (rnd.chance(0.5)) (qualifiers[key] ??= {})[q.key] = rnd.pick(q.options).key;
        }
      }
      const base: SubmissionInput = {
        audience,
        items: [...items],
        qualifiers,
        freeText: rnd.chance(0.3) ? "some words" : null,
      };
      const before = classify(base, pkg);
      expect(classify(clone(base), pkg)).toEqual(before);
      idempotent++;

      // One step up: an unanswered escalating qualifier on a chosen item, else one more visible item.
      const step = clone(base);
      const open = [...items].flatMap((key) =>
        (byKey(key).qualifiers ?? [])
          .filter((q) => qualifiers[key]?.[q.key] === undefined)
          .flatMap((q) =>
            q.options.filter((o) => o.escalatesTo).map((o) => ({ key, q: q.key, o: o.key })),
          ),
      );
      if (open.length > 0 && rnd.chance(0.5)) {
        const a = rnd.pick(open);
        (step.qualifiers[a.key] ??= {})[a.q] = a.o;
        addedAnswers++;
      } else {
        const extra = pool.filter((i) => !items.has(i.key));
        step.items.push(rnd.pick(extra).key);
        addedItems++;
      }
      const after = classify(step, pkg);
      const msg = `seed=${SEED} case=${n} ${JSON.stringify(base)} → ${JSON.stringify(step)}`;
      expect(TIER_RANK[after.tier], msg).toBeGreaterThanOrEqual(TIER_RANK[before.tier]);
      // Flags only ever grow, too — a pre-alert can never lose "isolation" by adding a symptom.
      for (const f of before.flags) expect(after.flags, msg).toContain(f);
      if (after.tier !== before.tier) raised++;
    }

    expect(addedItems + addedAnswers).toBe(CASES);
    expect(idempotent).toBe(CASES);
    process.stdout.write(
      `symptom-catalog monotonicity: cases=${CASES} seed=${SEED} addedItem=${addedItems} addedEscalatingAnswer=${addedAnswers} tierRaised=${raised}\n`,
    );
  });

  it("every tier is reachable and the rank order is R < U < E", () => {
    const tiers: Tier[] = ["R", "U", "E"];
    expect(tiers.map((x) => TIER_RANK[x])).toEqual([0, 1, 2]);
    expect(submit("adult", ["SYM.BONES.JOINT_PAIN"]).tier).toBe("R");
    expect(submit("adult", ["SYM.FEVER.OVER_2_DAYS"]).tier).toBe("U");
    expect(submit("adult", ["SYM.HEAD.FIT"]).tier).toBe("E");
  });
});
