/**
 * The 19 synthetic patients of dx-relations-vignettes.v1.json (ADR 0220) as acceptance tests at the
 * pure level: the board's places (lib/clerking/impression/relations places) and the note's
 * Impression (compose) with relations, the problem list, severity stages, refinement and the
 * risk-factor line. Each asserts the vignette's expected board placement and the key phrases of its
 * expected note in the words the note actually writes (the vignette's numbering and "1." layout are
 * illustrative). What needs a part not built is skipped with the reason in its name.
 */
import type { Board, BoardRow, ImpressionDraft } from "@/lib/clerking/impression/board";
import type { DropContext, Edge, Known } from "@/lib/clerking/impression/relations";
import type { StageInputs } from "@/lib/clerking/impression/stages";
import { describe, expect, it } from "vitest";

import VIGNETTES from "@/docs/emr/dx-relations/dx-relations-vignettes.v1.json";
import { composeImpression } from "@/lib/clerking/impression/compose";
import { DX_CATALOGUE, DX_NAMES } from "@/lib/clerking/impression/load";
import { placeholderOffers, riskLinesOf } from "@/lib/clerking/impression/refine";
import {
  causeRemovedBlocks,
  dropOutcome,
  places,
  refusal,
} from "@/lib/clerking/impression/relations";
import { cataloguedRelation, subtypesOf } from "@/lib/clerking/impression/relations-catalogue";
import { exposuresFrom } from "@/lib/clerking/impression/risk-line";
import { stageOf, stagesOf } from "@/lib/clerking/impression/stages";

type V = (typeof VIGNETTES.vignettes)[number];
const vignette = (id: string) => VIGNETTES.vignettes.find((v) => v.id === id)! as V;

/* ─── A patient, built as the desk reads it (logical id = dx id) ───── */

const name = (dx: string) => DX_NAMES[dx]?.display ?? dx;
const cls = (dx: string) => DX_CATALOGUE.profile(dx)?.restricted_class ?? null;

function row(
  dxId: string,
  slot: BoardRow["slot"],
  more: Partial<BoardRow["dx"]> &
    Partial<Pick<BoardRow, "mustNotMiss" | "likelihood" | "reason">> = {},
): BoardRow {
  const { mustNotMiss = false, likelihood = null, reason = "", ...dx } = more;
  const c = cls(dxId);
  return {
    dx: {
      logicalId: dxId,
      versionId: `${dxId}-v1`,
      termId: `term-${dxId}`,
      dxId,
      display: name(dxId),
      code: null,
      typed: false,
      rank: slot === "leading" ? "primary" : "secondary",
      // The vignettes' "status: working" is provisional; "final" is confirmed.
      verification: slot === "differential" ? "differential" : "provisional",
      restrictedClass: c,
      restricted: !!c,
      onProblemList: false,
      cosignPending: false,
      ...dx,
    },
    slot,
    profile: null,
    awaitingSignoff: false,
    mustNotMiss,
    timeCritical: false,
    pinned: false,
    likelihood,
    reason,
    reasonMissing: false,
    position: 0,
  };
}
let n = 0;
const edge = (
  c: string,
  r: string,
  label: Edge["label"] | "assoc" | "episode" = "secondary",
  more: Partial<Edge> = {},
): Edge => ({
  id: `e${++n}`,
  logicalId: `l${n}`,
  conditionId: c,
  relatedConditionId: r,
  relationType:
    label === "assoc" ? "associated_with" : label === "episode" ? "episode_of" : "due_to",
  label: label === "assoc" || label === "episode" ? null : label,
  position: 1,
  qualifiers: [],
  restricted: false,
  ...more,
});
const known = (dxId: string, logicalId = dxId): Known => ({
  id: `${logicalId}-v1`,
  logicalId,
  termId: `term-${dxId}`,
  display: name(dxId),
  code: null,
  restricted: !!cls(dxId),
  since: "2019-03-01T00:00:00.000Z",
});
const knownDx = (k: Known) => k.termId?.replace(/^term-/, "") ?? null;

interface Patient {
  lead: BoardRow | null;
  also?: BoardRow[];
  diff?: BoardRow[];
  edges?: Edge[];
  known?: Known[];
  stage?: StageInputs;
  meta?: ImpressionDraft["meta"];
  ruledOut?: { display: string; reason: string | null; restricted: boolean }[];
  exposures?: Set<string>;
}
const board = (p: Patient): Board => ({
  leading: p.lead,
  also: p.also ?? [],
  differential: p.diff ?? [],
  deferred: null,
  hidden: 0,
});

function run(p: Patient, canSee: (c: string) => boolean = () => true) {
  const b = board(p);
  const edges = p.edges ?? [];
  const bg = p.known ?? [];
  const pl = places(b, edges, bg);
  const stages = p.stage
    ? stagesOf(
        [...pl.cardOf.values()].map((c) => c.row),
        p.stage,
      )
    : new Map();
  const risk = riskLinesOf({
    pl,
    edges,
    known: bg,
    knownDx,
    exposures: p.exposures ?? new Set(),
    classOf: cls,
    canSee,
  });
  const note = (audience: "clinical" | "patient") =>
    composeImpression({
      board: b,
      draft: {
        order: [],
        likelihood: {},
        reasons: {},
        evidence: {},
        meta: p.meta ?? {},
        catalogueVersion: "x",
      },
      findings: new Map(),
      unexplained: [],
      audience,
      relations: edges,
      background: bg,
      ruledOut: p.ruledOut,
      stages,
      risk,
    });
  return { b, pl, edges, stages, risk, clinical: note("clinical"), patient: note("patient") };
}

/** The vignette's expected board, read against the places the desk computes. */
function expectBoard(v: V, r: ReturnType<typeof run>, ruledOut: string[] = []) {
  for (const e of v.board as {
    id: string;
    place: string;
    verification: string;
    relation?: { type: string; to: string };
  }[]) {
    const card = r.pl.cardOf.get(e.id);
    const where = `${v.id} ${e.id}`;
    switch (e.place) {
      case "leading":
        expect(r.pl.leading?.row.dx.dxId, where).toBe(e.id);
        break;
      case "coexisting":
        expect(
          r.pl.coexisting.map((c) => c.row.dx.dxId),
          where,
        ).toContain(e.id);
        break;
      case "linked":
        expect(card?.via, where).toBeTruthy();
        expect(card?.parentId, where).toBe(e.relation!.to);
        break;
      case "background":
        expect(
          r.pl.background.map((x) => knownDx(x.item)),
          where,
        ).toContain(e.id);
        break;
      case "differential":
        // A refuted must-not-miss stays on the differential as Unlikely; a replaced one is ruled out.
        expect(
          r.b.differential.some((x) => x.dx.dxId === e.id) || ruledOut.includes(e.id),
          where,
        ).toBe(true);
        break;
      case "deferred":
        expect(card, where).toBeUndefined();
        break;
    }
  }
}

const adultMan = (age: number): StageInputs => ({ ageYears: age, sex: "male", pregnant: false });
const woman = (age: number, pregnant: boolean | null = false): StageInputs => ({
  ageYears: age,
  sex: "female",
  pregnant,
});

describe("dx-relations vignettes (ADR 0220)", () => {
  it("covers all 19 vignettes of the signed file", () => {
    expect(VIGNETTES.vignettes.map((v) => v.id)).toEqual(
      Array.from({ length: 19 }, (_, i) => `DXV-${String(i + 1).padStart(2, "0")}`),
    );
  });

  it("DXV-01 NSTEMI refined from ACS, with the included risk-factor line", () => {
    const p: Patient = {
      lead: row("dx.nstemi", "leading", {
        verification: "confirmed",
        refinedFrom: {
          display: "Acute coronary syndrome",
          dxId: "dx.acs",
          decided: ["ECG", "Troponin"],
        },
      }),
      diff: [
        row("dx.aortic_dissection", "differential", {
          mustNotMiss: true,
          likelihood: "unlikely",
          reason: "pain not tearing, equal arm pulses and BP, normal mediastinum",
        }),
        row("dx.pulmonary_embolism", "differential", { likelihood: "unlikely" }),
      ],
      known: [known("dx.dm_type2"), known("dx.hypertension"), known("dx.dyslipidaemia")],
      exposures: exposuresFrom({ tobacco: "current" }),
      meta: { "dx.nstemi": { risk: true } },
    };
    const r = run(p);
    expectBoard(vignette("DXV-01"), r);
    expect(r.clinical).toContain(
      "(NSTEMI) (refined from acute coronary syndrome after ECG and troponin)",
    );
    expect(r.clinical).toContain(
      "  Risk factors on record: type 2 diabetes, hypertension, dyslipidaemia; current tobacco use.",
    );
    expect(r.clinical).toContain(
      "Aortic dissection (must not miss), unlikely (pain not tearing, equal arm pulses and BP, normal mediastinum)",
    );
    expect(r.clinical).toContain("Known conditions: type 2 diabetes");
    expect(r.clinical).not.toMatch(/^Acute coronary syndrome/m);
    // Unrefined, the broad diagnosis reads as the subtype file's note_before.
    const broad = run({ lead: row("dx.acs", "leading") });
    expect(broad.clinical).toMatch(
      /^Acute coronary syndrome, type to be decided by ECG and troponin/,
    );
    // Not included: no line in the note.
    expect(run({ ...p, meta: {} }).clinical).not.toContain("Risk factors on record");
  });
  it.skip("DXV-01 the desk offers NSTEMI from a troponin rise: skipped, no structured ECG or troponin series (REF-01: the clinician picks)", () => {});

  it("DXV-02 severe anaemia secondary to malaria and to hookworm, the placeholder refined", () => {
    const placeholder = row("dx.anaemia_unexplained", "also");
    const before = run({
      lead: row("dx.malaria_severe", "leading"),
      also: [placeholder],
      edges: [edge("dx.anaemia_unexplained", "dx.malaria_severe")],
    });
    expect(placeholderOffers(before.pl, name, () => false)).toEqual([
      { row: placeholder, into: { dxId: "dx.anaemia", display: "Anaemia" }, explainedBy: null },
    ]);
    expect(placeholderOffers(before.pl, name, () => true)).toEqual([]); // declined: it stays

    const r = run({
      lead: row("dx.malaria_severe", "leading"),
      also: [
        row("dx.anaemia", "also", {
          refinedFrom: {
            display: "Anaemia, cause not yet known",
            dxId: "dx.anaemia_unexplained",
            decided: [],
          },
        }),
        row("dx.hookworm_helminth", "also"),
      ],
      edges: [
        edge("dx.anaemia", "dx.malaria_severe"),
        edge("dx.anaemia", "dx.hookworm_helminth", "secondary", { position: 2 }),
      ],
      stage: { ...woman(24), hbGPerL: 62 },
    });
    expectBoard(vignette("DXV-02"), r);
    expect(r.clinical).toContain(
      "  Anaemia, severe (WHO 2024) (working), secondary to malaria, severe and to intestinal helminth infection.",
    );
    expect(r.clinical).toContain("Also this visit, co-existing: Intestinal helminth infection");
    expect(r.clinical).not.toContain("cause not yet known");
    expect(stageOf("dx.anaemia", { ...woman(24, null), hbGPerL: 62 })).toMatchObject({
      insufficient: ["pregnancy status"],
    });
  });

  it("DXV-03 pneumonia and malaria co-existing and unrelated, CURB-65 0", () => {
    const r = run({
      lead: row("dx.pneumonia_community", "leading", {
        refinedFrom: { display: "Pneumonia", dxId: "dx.pneumonia", decided: ["Chest X-ray"] },
      }),
      also: [row("dx.malaria_uncomplicated", "also")],
      stage: { ...adultMan(35), confusion: false, rr: 20, sbp: 124, dbp: 78, ureaMmol: 5.1 },
    });
    expectBoard(vignette("DXV-03"), r);
    expect(r.clinical).toContain("Community-acquired pneumonia (CURB-65 0) (primary; working).");
    expect(r.clinical).toContain("Also this visit, co-existing: Malaria, uncomplicated (working).");
    expect(cataloguedRelation("dx.malaria_uncomplicated", "dx.pneumonia_community")).toBeNull();
    expect(cataloguedRelation("dx.pneumonia_community", "dx.malaria_uncomplicated")).toBeNull();
  });

  it("DXV-04 DKA, complication of known type 1 diabetes, precipitated by pneumonia and missed insulin", () => {
    const r = run({
      lead: row("dx.dka", "leading"),
      also: [row("dx.pneumonia_community", "also")],
      known: [known("dx.dm_type1")],
      edges: [
        edge("dx.dka", "dx.dm_type1", "complication"),
        edge("dx.dka", "dx.pneumonia_community", "precipitated_by", {
          position: 2,
          qualifiers: ["cause.insulin_omission"],
        }),
      ],
    });
    expectBoard(vignette("DXV-04"), r);
    expect(r.clinical).toContain(
      "Diabetic ketoacidosis (primary; working), complication of known type 1 diabetes; precipitated by community-acquired pneumonia and by missed or stopped insulin.",
    );
    expect(r.clinical).toContain("Also this visit, co-existing: Community-acquired pneumonia");
  });

  it("DXV-05 cryptococcal meningitis secondary to advanced HIV disease, restricted per audience", () => {
    const r = run({
      lead: row("dx.cryptococcal_meningitis", "leading", {
        refinedFrom: {
          display: "Meningitis, cause not yet known",
          dxId: "dx.meningitis_unexplained",
          decided: [],
        },
      }),
      also: [row("dx.hiv_advanced", "also")],
      known: [known("dx.hiv")],
      edges: [
        edge("dx.cryptococcal_meningitis", "dx.hiv_advanced", "secondary", { restricted: true }),
        edge("dx.hiv_advanced", "dx.hiv", "episode", { restricted: true }),
      ],
    });
    expectBoard(vignette("DXV-05"), r);
    expect(r.clinical).toContain(
      "Cryptococcal meningitis (primary; working), secondary to advanced HIV disease.",
    );
    expect(r.clinical).toContain("Also this visit, co-existing: Advanced HIV disease");
    expect(r.clinical).not.toContain("cause not yet known");
    // No viewer without the class sees HIV, nor a placeholder for it.
    expect(r.patient).not.toMatch(/HIV|hidden|secondary to/i);
  });
  it.skip("DXV-05 cryptococcal meningitis shown to a viewer without the hiv class: skipped, D-REL-10 withdrawn at Gate B (it stays HIV-restricted)", () => {});

  it("DXV-06 intracerebral haemorrhage secondary to hypertensive emergency, a complication of known hypertension", () => {
    const r = run({
      lead: row("dx.stroke_haemorrhagic", "leading", {
        refinedFrom: { display: "Stroke", dxId: "dx.stroke", decided: ["CT head"] },
      }),
      also: [
        row("dx.hypertensive_emergency", "also", {
          refinedFrom: {
            display: "Hypertensive crisis",
            dxId: "dx.hypertensive_crisis",
            decided: [],
          },
        }),
      ],
      known: [known("dx.hypertension")],
      edges: [
        edge("dx.stroke_haemorrhagic", "dx.hypertensive_emergency"),
        edge("dx.hypertensive_emergency", "dx.hypertension", "complication", {
          qualifiers: ["cause.treatment_interruption"],
        }),
      ],
    });
    expectBoard(vignette("DXV-06"), r);
    expect(r.clinical).toContain(
      "Intracerebral haemorrhage (primary; working), secondary to hypertensive emergency.",
    );
    expect(r.clinical).toContain(
      "Hypertensive emergency (working), complication of known hypertension; precipitated by medicines not taken (adherence or stock-out).",
    );
    expect(r.clinical).not.toMatch(/\b(mg|lower the BP|reduce the BP)\b/i);
    // The direction is clinical: a drop always opens the chooser (D-REL-06).
    const c: DropContext = {
      places: r.pl,
      board: r.b,
      edges: [],
      known: [],
      knownDx: () => null,
    };
    const o = dropOutcome(
      c,
      { kind: "dx", id: "dx.stroke_haemorrhagic" },
      { kind: "dx", id: "dx.hypertensive_emergency" },
    );
    expect(o.kind === "relate" && o.apply).toBeFalsy();
  });
  it.skip("DXV-06 death-certificate Part I proposal: skipped, not built", () => {});

  it("DXV-07 heart failure and AF, complications of rheumatic heart disease", () => {
    const r = run({
      lead: row("dx.rheumatic_heart_disease", "leading"),
      also: [row("dx.heart_failure", "also"), row("dx.af", "also")],
      edges: [
        edge("dx.heart_failure", "dx.rheumatic_heart_disease", "complication"),
        edge("dx.af", "dx.rheumatic_heart_disease", "complication", { position: 2 }),
      ],
    });
    expectBoard(vignette("DXV-07"), r);
    expect(r.clinical.split("\n")).toEqual([
      "Rheumatic heart disease (primary; working).",
      "  Heart failure (working), complication of rheumatic heart disease.",
      "  Atrial fibrillation (working), complication of rheumatic heart disease.",
    ]);
    // Its valvular cause suppresses the LVEF classes (the desk reads `suppressed_when`).
    expect(subtypesOf("dx.heart_failure")?.suppressed_when).toMatchObject({
      to_any: expect.arrayContaining(["dx.rheumatic_heart_disease"]),
    });
  });
  it.skip("DXV-07 LVEF 55% written beside heart failure: skipped, no structured echo reading", () => {});

  it("DXV-08 AKI stage 2 secondary to sepsis secondary to pyelonephritis; the loop refused", () => {
    const r = run({
      lead: row("dx.sepsis", "leading"),
      also: [row("dx.pyelonephritis", "also"), row("dx.aki", "also")],
      edges: [edge("dx.sepsis", "dx.pyelonephritis"), edge("dx.aki", "dx.sepsis")],
      stage: { ...woman(45), creatinineUmol: 210, baselineCreatinineUmol: 80 },
    });
    expectBoard(vignette("DXV-08"), r);
    expect(r.clinical).toContain("Sepsis (primary; working), secondary to acute pyelonephritis.");
    expect(r.clinical).toContain(
      "  Acute kidney injury, stage 2 (KDIGO 2012) (working), secondary to sepsis.",
    );
    const c: DropContext = {
      places: r.pl,
      board: r.b,
      edges: r.edges,
      known: [],
      knownDx: () => null,
    };
    // Sepsis onto AKI is refused (they are already linked); a cycle through the chain is a loop.
    expect(refusal(c, "dx.sepsis", "dx.aki", name)).toMatch(/^Drop refused/);
    expect(refusal(c, "dx.pyelonephritis", "dx.aki", name)).toMatch(/would make a loop/);
  });

  it("DXV-09 sickle cell crisis, complication of known sickle cell disease, precipitated by malaria", () => {
    const r = run({
      lead: row("dx.sickle_cell_crisis", "leading"),
      also: [row("dx.malaria_uncomplicated", "also")],
      known: [known("dx.sickle_cell_disease")],
      edges: [
        edge("dx.sickle_cell_crisis", "dx.sickle_cell_disease", "complication"),
        edge("dx.sickle_cell_crisis", "dx.malaria_uncomplicated", "precipitated_by", {
          position: 2,
        }),
      ],
      stage: { ...adultMan(17), hbGPerL: 74 },
    });
    expectBoard(vignette("DXV-09"), r);
    expect(r.clinical).toContain(
      "Sickle cell crisis (primary; working), complication of known sickle cell disease; precipitated by malaria, uncomplicated.",
    );
    expect(r.clinical).not.toMatch(/^\s*Anaemia/m); // never added by the desk
  });

  it("DXV-10 pulmonary TB with diabetes as a risk factor; the line takes the tb class", () => {
    const p: Patient = {
      lead: row("dx.tb_pulmonary_confirmed", "leading", {
        refinedFrom: {
          display: "Pulmonary tuberculosis, clinically diagnosed",
          dxId: "dx.tb_pulmonary_clinical",
          decided: ["Xpert MTB/RIF"],
        },
      }),
      known: [known("dx.dm_type2")],
      meta: { "dx.tb_pulmonary_confirmed": { risk: true } },
    };
    const r = run(p);
    expectBoard(vignette("DXV-10"), r);
    expect(r.risk.get("dx.tb_pulmonary_confirmed")?.restrictedClasses).toEqual(["tb"]);
    expect(r.clinical).toContain(
      "Pulmonary tuberculosis, bacteriologically confirmed (primary; working).\n  Risk factors on record: type 2 diabetes.",
    );
    expect(r.patient).toBe("Known conditions: type 2 diabetes (on record since 2019).");
    expect(run(p, (c) => c !== "tb").risk.size).toBe(0);
  });
  it.skip("DXV-10 rifampicin resistance and HbA1c in the note: skipped, the TB resistance stage is not built", () => {});

  it("DXV-11 ACS replaced by pericarditis: ruled out with the reason", () => {
    const r = run({
      lead: row("dx.pericarditis", "leading"),
      also: [row("dx.pericardial_effusion", "also")],
      edges: [edge("dx.pericardial_effusion", "dx.pericarditis", "complication")],
      ruledOut: [
        {
          display: "Acute coronary syndrome",
          reason:
            "ECG widespread ST-elevation with PR depression; troponin not raised at 0 h and 3 h",
          restricted: false,
        },
      ],
    });
    expectBoard(vignette("DXV-11"), r, ["dx.acs"]);
    expect(r.clinical).toContain(
      "  Pericardial effusion (working), complication of acute pericarditis.",
    );
    expect(r.clinical).toContain(
      "Ruled out: acute coronary syndrome (ECG widespread ST-elevation with PR depression; troponin not raised at 0 h and 3 h).",
    );
    expect(subtypesOf("dx.acs")?.alternatives_if_ruled_out).toContain("dx.pericarditis");
  });

  it("DXV-12 known hypertension active this visit, one problem-list entry", () => {
    const r = run({
      lead: row("dx.hypertension", "leading", { logicalId: "visit-htn" }),
      known: [known("dx.hypertension", "pl-htn")],
      edges: [edge("visit-htn", "pl-htn", "episode")],
    });
    expect(r.pl.leading?.row.dx.dxId).toBe("dx.hypertension");
    expect(r.pl.background).toMatchObject([{ active: true, named: true }]);
    expect(r.clinical).toBe(
      "Hypertension (primary; working; known condition, on record since 2019).",
    );
  });
  it.skip("DXV-12 BP grade from the hypertension pack beside the diagnosis: skipped, the pack's grade is not staged here (D-HTN-05)", () => {});

  it("DXV-13 parent entered in error: AKI leads, unstaged without a baseline, review before signing", () => {
    const r = run({
      lead: row("dx.aki", "leading"),
      stage: { ...adultMan(40), creatinineUmol: 290 },
    });
    expectBoard(vignette("DXV-13"), r);
    expect(r.clinical).toContain(
      "Acute kidney injury, stage not yet known (needs baseline creatinine) (primary; working).",
    );
    expect(r.clinical).not.toMatch(/stage 1/);
    const items = [{ logicalId: "rel", conditionId: "dx.aki", causeDisplay: "Malaria, severe" }];
    expect(causeRemovedBlocks(items, { reviewed: [] }, name)).toHaveLength(1);
    expect(causeRemovedBlocks(items, { reviewed: ["rel"] }, name)).toEqual([]);
  });

  it("DXV-14 a junior's Final: awaiting co-signature, then final", () => {
    const p = (cosignPending: boolean): Patient => ({
      lead: row("dx.iron_deficiency_anaemia", "leading", {
        cosignPending,
        verification: cosignPending ? "provisional" : "confirmed",
      }),
      also: [row("dx.hookworm_helminth", "also")],
      edges: [edge("dx.iron_deficiency_anaemia", "dx.hookworm_helminth")],
      stage: { ...adultMan(30), hbGPerL: 65 },
    });
    const before = run(p(true));
    expectBoard(vignette("DXV-14"), before);
    expect(before.clinical).toContain(
      "Iron-deficiency anaemia, severe (WHO 2024) (primary; final, awaiting senior co-signature), secondary to intestinal helminth infection.",
    );
    expect(run(p(false)).clinical).toContain(
      "Iron-deficiency anaemia, severe (WHO 2024) (primary; final), secondary to intestinal helminth infection.",
    );
  });

  it("DXV-15 anaemia in pregnancy: the second-trimester row, secondary to malaria and pregnancy", () => {
    const r = run({
      lead: row("dx.malaria_uncomplicated", "leading"),
      also: [row("dx.anaemia", "also")],
      edges: [
        edge("dx.anaemia", "dx.malaria_uncomplicated", "secondary", {
          qualifiers: ["cause.pregnancy"],
        }),
      ],
      stage: { ...woman(26, true), gestationWeeks: 24, hbGPerL: 98 },
    });
    expectBoard(vignette("DXV-15"), r);
    expect(r.clinical).toContain(
      "  Anaemia, mild (WHO 2024) (working), secondary to malaria, uncomplicated; precipitated by pregnancy (from the pregnancy record).",
    );
    expect(stageOf("dx.anaemia", { ...woman(26), hbGPerL: 98 })).toMatchObject({
      code: "moderate",
    });
    expect(
      stageOf("dx.anaemia", { ...woman(26, true), gestationWeeks: null, hbGPerL: 98 }),
    ).toMatchObject({ insufficient: ["gestation"] });
  });
  it.skip("DXV-15 'Malaria in pregnancy (24 weeks)' from the pregnancy record: skipped, pregnancy is not written into the diagnosis name", () => {});

  it("DXV-16 no relation to a differential; after promotion AKI secondary to severe malaria", () => {
    const aki = row("dx.aki", "also");
    const early = run({
      lead: null,
      also: [aki],
      diff: [row("dx.malaria_severe", "differential", { likelihood: "possible" })],
    });
    const c: DropContext = {
      places: early.pl,
      board: early.b,
      edges: [],
      known: [],
      knownDx: () => null,
    };
    expect(refusal(c, "dx.aki", "dx.malaria_severe", name)).toMatch(
      /differential\. Promote it first/,
    );
    const r = run({
      lead: row("dx.malaria_severe", "leading"),
      also: [aki],
      edges: [edge("dx.aki", "dx.malaria_severe")],
      stage: { ...adultMan(52), creatinineUmol: 320 },
    });
    expectBoard(vignette("DXV-16"), r);
    expect(r.clinical).toContain(
      "  Acute kidney injury, stage not yet known (needs baseline creatinine) (working), secondary to malaria, severe.",
    );
    expect(cataloguedRelation("dx.aki", "dx.malaria_severe")?.type).toBe("due_to");
  });

  it("DXV-17 a placeholder refined: the note never carries 'Fever, cause not yet known'", () => {
    const r = run({
      lead: row("dx.malaria_uncomplicated", "leading", {
        refinedFrom: {
          display: "Fever, cause not yet known",
          dxId: "dx.fever_unexplained",
          decided: ["Malaria RDT"],
        },
      }),
      stage: woman(31),
    });
    expectBoard(vignette("DXV-17"), r);
    expect(r.clinical).toBe("Malaria, uncomplicated (primary; working).");
  });

  it("DXV-18 severe hypertension without acute organ damage, in known hypertension", () => {
    const r = run({
      lead: row("dx.severe_hypertension_no_aod", "leading", {
        refinedFrom: {
          display: "Hypertensive crisis",
          dxId: "dx.hypertensive_crisis",
          decided: ["ECG", "Urinalysis"],
        },
      }),
      known: [known("dx.hypertension")],
      edges: [edge("dx.severe_hypertension_no_aod", "dx.hypertension", "complication")],
    });
    expectBoard(vignette("DXV-18"), r);
    expect(r.clinical).toContain(
      "Severe hypertension without acute organ damage (primary; working), complication of known hypertension.",
    );
    expect(r.clinical).not.toMatch(/urgency/i);
  });

  it("DXV-19 a viewer without access: the restricted cause and its words drop out cleanly", () => {
    const r = run({
      lead: row("dx.anaemia", "leading"),
      known: [known("dx.hiv")],
      edges: [edge("dx.anaemia", "dx.hiv", "secondary", { restricted: true })],
      stage: { ...woman(29), hbGPerL: 92 },
    });
    expectBoard(vignette("DXV-19"), r);
    expect(r.clinical).toBe(
      "Anaemia, moderate (WHO 2024) (primary; working), secondary to known HIV infection.",
    );
    expect(r.patient).toBe("Anaemia, moderate (WHO 2024) (primary; working).");
  });

  it.skip("HMIS and DHIS2 counting (every vignette's counted lines): skipped, D-REL-07 counting is not built", () => {});
});
