/**
 * Pharmacy Phase 3, Step 5 (5.3): the interaction line in the prescribing dialog. Fixture content only: the pair,
 * levels and windows are invented for the test and are not signed values.
 */
import type { Entry } from "@/lib/pharmacy/clinical/content";
import type { InteractionContext } from "@/lib/pharmacy/clinical/read";
import type { PlanCheckContext } from "@/lib/prescribing/plan-checks";
import type { PlanRx } from "@/lib/prescribing/plan-rx";
import { describe, expect, it } from "vitest";

import { CLINICAL_B } from "@/content/pharmacy-clinical";
import { drugById } from "@/lib/prescribing/formulary";
import { planChecks, verifyAnswers } from "@/lib/prescribing/plan-checks";

const base: PlanCheckContext = {
  ageYears: 40,
  weight: { kg: 60, at: "2026-10-25T08:00:00Z", source: "triage" },
  allergies: [],
  allergyStatus: "none_known",
  conditions: [],
  creatinine: null,
  kidneyTestPlanned: false,
  glucose: null,
  sepsisTypeProblem: false,
  bloodCulture: "none",
  others: [],
  cosign: "allowed",
  pharmacy: { status: "not_linked" },
};
const rx = (answers: PlanRx["answers"] = []): PlanRx => ({
  clientKey: "plan-rx-0001",
  kind: "drug",
  drugId: "ceftriaxone",
  conditionId: "00000000-0000-4000-8000-000000000001",
  regimenId: null,
  doseNum: 2,
  unit: "g",
  strength: null,
  route: "iv",
  method: "Intermittent infusion",
  infusionOver: "30 min",
  diluent: "Sodium chloride 0.9%",
  frequency: "daily",
  prn: false,
  course: "5d",
  start: "now",
  note: null,
  fluid: null,
  answers,
  witness: null,
  weightAt: null,
  typedDose: null,
});
const entry: Entry<"interaction_pair"> = {
  id: "11111111-1111-4111-8111-111111111111",
  pack: "interaction_pair",
  key: "ceftriaxone+fixture_other",
  version: 2,
  source: "Fixture source, section 1",
  status: "in_force",
  blocked: null,
  authorUserId: "u",
  payload: {
    a: "ceftriaxone",
    b: "fixture_other",
    severity: "contraindicated",
    effect: "[effect]",
    management: "[what to do]",
    byDesign: false,
    restricted: null,
    route: null,
  },
};
const ix = (over: Partial<InteractionContext> = {}): InteractionContext => ({
  entries: [entry],
  levels: {
    dialog: { contraindicated: "stop", serious: "note", monitor: "hidden" },
    review: { contraindicated: "stop", serious: "check", monitor: "note" },
    suppressionDays: 7,
  },
  current: [
    { medicineId: "fixture_other", source: "active_line", since: new Date("2026-10-20T00:00:00Z") },
  ],
  earlier: [],
  pairs: 1,
  ...over,
});
const line = (ctx: PlanCheckContext) =>
  planChecks(drugById("ceftriaxone")!, rx(), ctx).find((c) => c.code === "interactions")!;

describe("5.3 the dialog's interaction line", () => {
  it("S23: with the flag off or nothing signed, the baseline line stays", () => {
    expect(line(base)).toMatchObject({ outcome: "not_checked" });
    expect(line({ ...base, interactions: ix({ entries: [], pairs: 0 }) })).toMatchObject({
      outcome: "not_checked",
    });
  });
  it("IX-4: levels unsigned, nothing fires and the dialog says so", () => {
    expect(line({ ...base, interactions: ix({ levels: null }) })).toMatchObject({
      outcome: "not_checked",
      message: CLINICAL_B.levelsUnsigned,
    });
  });
  it("S16: a signed pair with an active line fires at its level with source and version, and needs an answer", () => {
    const c = line({ ...base, interactions: ix() });
    expect(c.outcome).toBe("stop");
    expect(c.message).toMatch(
      /Source: Fixture source, section 1\. Entry ceftriaxone\+fixture_other, version 2\./,
    );
    expect(c.entries).toEqual([{ id: entry.id, key: entry.key, version: 2 }]);
    expect(verifyAnswers([c], rx()).ok).toBe(false);
  });
  it("S17: answered within the suppression window, it returns as a Note naming the answer", () => {
    const earlier = [
      {
        entryId: entry.id,
        key: entry.key,
        answeredAt: new Date(),
        cadre: "Medical officer",
        reason: "Fixture reason",
      },
    ];
    const c = line({ ...base, interactions: ix({ earlier }) });
    expect(c.outcome).toBe("note");
    expect(c.message).toMatch(/Medical officer: Fixture reason/);
  });
  it("Law 4: nothing fired is a Note saying how little is checked, never Passed", () => {
    const c = line({ ...base, interactions: ix({ current: [] }) });
    expect(c).toMatchObject({ outcome: "note", message: CLINICAL_B.dialogNothingFired(1) });
  });
  it("a medicine in this basket counts as being taken", () => {
    const c = line({
      ...base,
      interactions: ix({ current: [] }),
      others: [{ drugId: "fixture_other", display: "Other", source: "basket" }],
    });
    expect(c.outcome).toBe("stop");
  });
});
