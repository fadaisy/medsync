import type { Cond } from "@/lib/clerking/impression/catalogue";
import { describe, expect, it } from "vitest";

import { EMPTY_IMPRESSION } from "@/lib/clerking/impression/board";
import { refsOf } from "@/lib/clerking/impression/catalogue";
import { atomTrue } from "@/lib/clerking/impression/evidence";
import { suggestions } from "@/lib/clerking/impression/suggest";
import { scenario } from "./exam-fixtures";
import { board, ctx, dx, IN, LIVE, solveDx } from "./si-fixtures";

/**
 * Rule coverage (§7 "One fixture per rule (100), both ways") and atom coverage: every differential
 * rule fires on its trigger, suggests its diagnoses, and stays silent on an empty record and on a
 * near miss; every evidence atom in the catalogue can be made true and is false when unrecorded.
 */

const fresh = () => scenario({ patient: { ageYears: 40, sex: null, pregnant: null } });
/** Dark by design: it reads a reference with no signed value (REF-DX-RESULT-AGE-GLUCOSE, D-DM-08),
 *  so it can never fire, even on a record built to make it true. */
const dark = (c: Cond) => refsOf(c).some((r) => dx.refValue(r) === null);
const branches = (c: Cond) => ("any" in c ? (c.any as Cond[]).length : 1);
const leaves = (c: Cond): number =>
  "all" in c
    ? (c.all as Cond[]).reduce((n, y) => n + leaves(y), 0)
    : "any" in c
      ? leaves((c.any as Cond[])[0]!)
      : "not" in c
        ? 0
        : 1;

describe("differential rules, both ways", () => {
  // 100 + the diabetes pack's 11 (Phase 5); 2 of them dark (D-DM-08).
  it("covers the catalogue's 111 rules", () => expect(dx.rules.length).toBe(111));
  it("reports no dark rule now that the glucose window is signed (STOP 5 answers)", () =>
    expect(dx.rules.filter((r) => dark(r.when)).map((r) => r.id)).toEqual([]));

  for (const rule of dx.rules) {
    if (dark(rule.when)) {
      it(`${rule.id} is dark: silent even on a record built to fire it`, () => {
        const s = fresh();
        expect(solveDx(rule.when, s)).toEqual([]);
        expect(atomTrue(rule.when, { x: ctx(s), ...IN })).toBe(false);
      });
      continue;
    }
    it(`${rule.id} fires on each trigger and suggests its diagnoses`, () => {
      for (let b = 0; b < branches(rule.when); b++) {
        const s = fresh();
        expect(solveDx(rule.when, s, { branch: b })).toEqual([]);
        const x = ctx(s);
        expect(atomTrue(rule.when, { x, ...IN }), `branch ${b}`).toBe(true);
        const ids = suggestions({
          x,
          dx,
          live: LIVE,
          viewer: IN.viewer,
          board: board([], EMPTY_IMPRESSION),
        }).map((g) => g.dxId);
        const sex = x.patient.sex;
        const sexRule = dx.data.engine_rules.sex_specific;
        const expected = rule.suggest.filter(
          (id) =>
            !(sex === "male" && sexRule.female_only.includes(id)) &&
            !(sex === "female" && sexRule.male_only.includes(id)),
        );
        for (const id of expected) expect(ids, `${rule.id} → ${id}`).toContain(id);
      }
    });

    it(`${rule.id} is silent on an empty record and on a near miss`, () => {
      expect(atomTrue(rule.when, { x: ctx(fresh()), ...IN })).toBe(false);
      const n = leaves(rule.when);
      for (let k = 0; k < n && n > 1; k++) {
        const s = fresh();
        solveDx(rule.when, s, { skip: k, branch: 0 });
        if ("any" in rule.when) continue; // another branch may legitimately hold
        expect(atomTrue(rule.when, { x: ctx(s), ...IN }), `without atom ${k}`).toBe(false);
      }
    });
  }
});

describe("every evidence atom in the catalogue", () => {
  it("can be made true, and is false on an empty record (not asked is never evidence)", () => {
    const failed: string[] = [];
    const emptyX = ctx(fresh());
    let n = 0;
    for (const p of dx.profiles)
      for (const e of [...p.suggest_for, ...p.suggest_against]) {
        n++;
        const s = fresh();
        const unknown = solveDx(e.atom, s);
        const ok = !unknown.length && atomTrue(e.atom, { x: ctx(s), ...IN }) !== dark(e.atom);
        // Age and sex are always on the record: only history and examination atoms must be quiet.
        const quiet =
          !atomTrue(e.atom, { x: emptyX, ...IN }) || "not" in e.atom || "patient" in e.atom;
        if (!ok || !quiet)
          failed.push(
            `${p.id}: ${e.text}${unknown.length ? ` (${unknown.join("; ")})` : ""}${quiet ? "" : " fires unrecorded"}`,
          );
      }
    expect(n).toBe(1960); // 1910 + the diabetes pack's merge
    expect(failed).toEqual([]);
  });
});
