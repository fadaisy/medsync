import type { V2ContextInput } from "@/lib/resus/survey/context";
import type { AbcdeLetter } from "@/lib/resus/types";
import { describe, expect, it } from "vitest";

import { EMPTY_CONTEXT, EMPTY_LOCAL, PREGNANCY_STATES } from "@/lib/resus/model";
import { legacyContexts, SIGNED_COVARIANCES } from "@/lib/resus/survey/context";
import { ABCDE_LETTERS } from "@/lib/resus/types";
import { v2 } from "./survey-fixtures";

/**
 * GATE A §4 / §10 item 2 — the signed co-variance list (SV-EQ-05..07). Every
 * atomic v2 input is applied alone and the steps whose legacy context it moves
 * are measured: the inputs that move more than one step are exactly §4's list,
 * and those are the only cross-step constraints (the mapping is a per-key OR,
 * and the pregnancy values' effects are nested: possible ⊂ confirmed).
 */

/** GATE A §4 "Co-variance list (signed)", transcribed; D20 adds the one arrest state. */
const GATE_A_SECTION_4 = [
  { input: "trauma", steps: ["A", "C", "E"] },
  { input: "allergenTrigger", steps: ["A", "B", "C"] },
  { input: "headInjury", steps: ["C", "D"] },
  { input: "spinalInjury", steps: ["A", "C"] },
  { input: "pregnancy:confirmed", steps: ["C", "D"] },
  { input: "pregnancy:postpartum", steps: ["C", "D"] },
  { input: "inArrest", steps: ["A", "B", "C", "D", "E"] },
];

/** Every atomic v2 input, by name. */
function atomicInputs(): [string, V2ContextInput][] {
  const out: [string, V2ContextInput][] = [];
  for (const [k, v] of Object.entries(EMPTY_CONTEXT))
    if (typeof v === "boolean") out.push([k, v2({ flags: { ...EMPTY_CONTEXT, [k]: true } })]);
  for (const p of PREGNANCY_STATES)
    if (p !== "none")
      out.push([`pregnancy:${p}`, v2({ flags: { ...EMPTY_CONTEXT, pregnancy: p } })]);
  out.push(["gestationWeeks", v2({ flags: { ...EMPTY_CONTEXT, gestationWeeks: 24 } })]);
  for (const k of Object.keys(EMPTY_LOCAL))
    out.push([`local:${k}`, v2({ local: { ...EMPTY_LOCAL, [k]: true } })]);
  out.push(["inArrest", v2({ inArrest: true })], ["abcAbnormal", v2({ abcAbnormal: true })]);
  return out;
}

/** The (step.key) pairs an input turns on, against the empty baseline. */
function effect(input: V2ContextInput): string[] {
  const base = legacyContexts(v2());
  const got = legacyContexts(input);
  return ABCDE_LETTERS.flatMap((s) =>
    Object.entries(got[s])
      .filter(([k, on]) => on !== (base[s] as Record<string, boolean>)[k])
      .map(([k]) => `${s}.${k}`),
  );
}
const stepsOf = (eff: string[]) => [...new Set(eff.map((e) => e[0] as AbcdeLetter))];
const byInput = (a: { input: string }, b: { input: string }) => a.input.localeCompare(b.input);

describe("SV-EQ-05 — the signed co-variance list", () => {
  it("SV-EQ-05: SIGNED_COVARIANCES equals GATE A §4 (+ D20 arrest state)", () => {
    const norm = (l: readonly { input: string; steps: readonly string[] }[]) =>
      l.map((c) => ({ input: c.input, steps: [...c.steps].sort() })).sort(byInput);
    expect(norm(SIGNED_COVARIANCES)).toEqual(norm(GATE_A_SECTION_4));
  });
  it("SV-EQ-05: spinal injury also sets A trauma (D19, jaw thrust) — and nothing else in A", () => {
    const eff = effect(v2({ flags: { ...EMPTY_CONTEXT, spinalInjury: true } }));
    expect(eff.sort()).toEqual(["A.trauma", "C.spinalInjury"]);
  });
});

describe("SV-EQ-06 — measured: only the listed inputs move more than one step", () => {
  const measured = atomicInputs().map(([input, i]) => ({ input, eff: effect(i) }));

  it("SV-EQ-06: the multi-step inputs are exactly SIGNED_COVARIANCES", () => {
    const multi = measured
      .map((m) => ({ input: m.input, steps: stepsOf(m.eff).sort() }))
      .filter((m) => m.steps.length > 1)
      .sort(byInput);
    const signed = SIGNED_COVARIANCES.map((c) => ({ input: c.input, steps: [...c.steps].sort() }));
    expect(multi).toEqual(signed.sort(byInput));
  });
  it("SV-EQ-06: every other input sets exactly one legacy key, or none (BMI, renal, LAST, weeks)", () => {
    const signed = new Set(SIGNED_COVARIANCES.map((c) => c.input));
    const rest = measured.filter((m) => !signed.has(m.input));
    const none = rest.filter((m) => m.eff.length === 0).map((m) => m.input);
    expect(none.sort()).toEqual(
      ["bmiOver40", "gestationWeeks", "localAnaestheticToxicity", "renalDialysis"].sort(),
    );
    for (const m of rest.filter((r) => r.eff.length > 0)) expect(m.eff, m.input).toHaveLength(1);
  });
  it("SV-EQ-06: every legacy key of every step is set by some input", () => {
    const reached = new Set(measured.flatMap((m) => m.eff));
    const all = ABCDE_LETTERS.flatMap((s) =>
      Object.keys(legacyContexts(v2())[s]).map((k) => `${s}.${k}`),
    );
    expect(all.filter((k) => !reached.has(k))).toEqual([]);
  });
});

describe("SV-EQ-07 — the co-variances are the only cross-step constraints", () => {
  const atoms = atomicInputs().map(([input, i]) => ({ input, eff: new Set(effect(i)) }));
  /**
   * A joint target (a set of step.key pairs on, the rest off) is expressible iff
   * the union of every atomic effect contained in it equals it (per-key OR).
   */
  const expressible = (target: readonly string[]) => {
    const t = new Set(target);
    const union = new Set(
      atoms.filter((a) => [...a.eff].every((e) => t.has(e))).flatMap((a) => [...a.eff]),
    );
    return union.size === t.size;
  };
  const allKeys = ABCDE_LETTERS.flatMap((s) =>
    Object.keys(legacyContexts(v2())[s]).map((k) => `${s}.${k}`),
  );

  it("SV-EQ-07: a legacy key alone is unreachable iff only co-variance inputs set it", () => {
    const signed = new Set(SIGNED_COVARIANCES.map((c) => c.input));
    const singleOnly = (k: string) =>
      atoms.filter((a) => a.eff.has(k)).every((a) => signed.has(a.input));
    expect(allKeys.filter((k) => !expressible([k]))).toEqual(allKeys.filter(singleOnly));
  });
  it("SV-EQ-07: each co-variance's full effect is expressible; its one-step slice is not", () => {
    for (const c of SIGNED_COVARIANCES) {
      const eff = [...atoms.find((a) => a.input === c.input)!.eff];
      expect(expressible(eff), c.input).toBe(true);
      // The D19 / §4 consequence, e.g. C spinal injury without A trauma.
      const slices = c.steps.map((s) => eff.filter((e) => e.startsWith(`${s}.`)));
      expect(
        slices.some((sl) => !expressible(sl)),
        c.input,
      ).toBe(true);
    }
  });
  it("SV-EQ-07: composing any set of atomic inputs sets exactly the union of their effects", () => {
    const all = atomicInputs();
    const on = (i: V2ContextInput) => effect(i).sort();
    const changed = <T extends object>(o: T, empty: T): Partial<T> =>
      Object.fromEntries(
        Object.entries(o).filter(([k, v]) => v !== (empty as Record<string, unknown>)[k]),
      ) as Partial<T>;
    let seed = 7;
    for (let n = 0; n < 512; n++) {
      const pick = all.filter(
        () => ((seed = (Math.imul(seed, 1103515245) + 12345) >>> 0) & 256) !== 0,
      );
      // Pregnancy is one value: the last picked wins (atom order: possible ⊂ confirmed).
      const input = pick.reduce<V2ContextInput>(
        (acc, [, i]) => ({
          flags: { ...acc.flags, ...changed(i.flags, EMPTY_CONTEXT) },
          local: { ...acc.local, ...changed(i.local, EMPTY_LOCAL) },
          inArrest: acc.inArrest || i.inArrest,
          abcAbnormal: acc.abcAbnormal || i.abcAbnormal,
        }),
        v2(),
      );
      const want = [...new Set(pick.flatMap(([, i]) => effect(i)))].sort();
      expect(on(input), pick.map(([k]) => k).join(",")).toEqual(want);
    }
  });
});
