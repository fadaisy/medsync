/**
 * The ten-step clerking record in the diabetes pack's shape (ADR 0216): the desk's examination
 * context (history, past history with "About the diabetes", medicines, examination, vital signs,
 * result facts), the problem list and the visit's diagnoses → the pack's `PackInput`. Pure and
 * browser-safe.
 *
 * Signed pack laws: a feature is set only when the record answers it. Blank, "not asked" and an
 * unknown three-valued answer stay absent, never negative; a blank medicine list is not "not on X"
 * (only "takes none" is); nothing is invented. Capillary glucose comes only from the vital signs
 * (the "Now" column or this visit's saved set), never from a laboratory fact. Every judgement call
 * here is listed for the CSO in docs/ncd/diabetes/desk/mapping-rulings.md (MR-nn in comments).
 */
import type { ExamContext, ResultFact } from "@/lib/clerking/exam/context";
import type { PackInput, PackSite, PackValue, PackValues } from "@/lib/ncd/pack/types";

import { durationDays } from "@/lib/clerking/answers";
import { entryOf, readAttr } from "@/lib/clerking/exam/answers";
import {
  evalTri,
  medicinesMatching,
  symptomAnswer,
  symptomEntry,
} from "@/lib/clerking/exam/context";
import { acvpuOf, amts, gcsTotal } from "@/lib/clerking/exam/scores";
import { bmiOf, parseVitalsDraft } from "@/lib/clerking/exam/vitals";
import { inPregnancyAgeRange } from "@/lib/emr/reference/pregnancy";
import { packInputOf } from "@/lib/ncd/pack/live";
import { egfr } from "@/lib/ncdreg/standard/calculations";

export interface ClerkingPackSources {
  x: ExamContext;
  /** p.context.problems (problem list) and the visit's diagnoses (DeskDiagnosis: display, code, termId). */
  problems: readonly {
    display: string;
    code?: string | null;
    termId?: string | null;
    conceptId?: string | null;
  }[];
  diagnoses: readonly { display: string; code: string | null; termId: string | null }[];
  pregnancy?: { gestationWeeks?: number | null; weeksPostpartum?: number | null } | null;
  /** The restricted classes the viewer may see (impression `Viewer`); absent: the treating
   *  clinician, who sees them all (k.canSeeRestricted). */
  viewer?: { classes: ReadonlySet<string> };
  /** Default "referral" (as the NCD shadow runs). */
  site?: PackSite;
}

export interface ClerkingPackResult {
  input: PackInput; // what runProtocol takes
  /** For each pack feature with a value: where it came from, as a short human phrase ("Examination · feet", "Results · HbA1c 2026-10-01"). */
  from: Record<string, string>;
}

/** Results the pack reads beyond the `result` atom's (lib/clerking/desk-load.ts loads them). */
export const PACK_RESULT_CONCEPTS = [
  "obs.creatinine",
  "obs.potassium",
  "obs.chol_total",
  "obs.chol_ldl",
  "obs.chol_hdl",
  "obs.triglycerides",
  "obs.urine_protein_dipstick",
  "obs.ketones_urine",
  "obs.ketones_blood",
] as const;

/** The pack's restricted features (pack `features[].restrictedClass`; a test keeps them equal). */
export const RESTRICTED_FEATURES: Record<string, string> = {
  hiv_on_art: "hiv",
  art_regimen: "hiv",
  months_since_art_start_or_switch: "hiv",
  cough_over_2_weeks: "tb",
  tb_current: "tb",
  on_rifampicin: "tb",
  on_second_gen_antipsychotic: "mental_health",
  weeks_since_antipsychotic_start: "mental_health",
  glucose_test_since_antipsychotic_start: "mental_health",
  prior_gdm: "sexual_reproductive_health",
  could_conceive: "sexual_reproductive_health",
};

/** How old a result may be, in days. Acute values: this episode (REF-DX-RESULT-AGE-ACUTE, 1);
 *  laboratory glucose too, because the pack reads it in its immediate interrupts and means "at
 *  this encounter" (pack semantics.recorded; MR-01). HbA1c 90 (REF-DX-RESULT-AGE-HBA1C); eGFR and
 *  ACR 365 (REF-DX-RESULT-AGE-KIDNEY); lipids 365 (unsigned, MR-02). */
const WINDOW = { acute: 1, hba1c: 90, kidney: 365, lipids: 365 };
const DAY = 86_400_000;
const MONTH = 30.4375 * DAY;

/** Diabetes types by problem concept, diagnosis term and ICD-11 stem (MR-07). */
const DM_TYPE: Record<string, string> = {
  "cond.dm_type1": "type_1",
  "cond.dm_type2": "type_2",
  "cond.dm_other": "other",
  "cond.dm_mrdm": "other",
  "cond.dm_unspecified": "unclassified",
  "cond.dm_in_pregnancy": "unclassified",
  "dx.dm_type1": "type_1",
  "dx.dm_type2": "type_2",
  "dx.dm_type_unknown": "unclassified",
  "dx.diabetes_in_pregnancy": "unclassified",
  "5A10": "type_1",
  "5A11": "type_2",
  "5A14": "unclassified",
};
const GDM = new Set(["cond.gestational_diabetes", "dx.gestational_diabetes"]);

/** Medicine name stems for classes the catalogues have no group for (MR-10). */
const words = (s: string) => s.split(" ");
const STEMS = {
  dpp4: ["gliptin"],
  glp1: ["glutide", "exenatide"],
  antipsychotic2: words(
    "olanzapine risperidone quetiapine clozapine aripiprazole ziprasidone paliperidone lurasidone asenapine",
  ),
  antiplatelet: words("aspirin clopidogrel ticagrelor prasugrel"),
  ironB12Epo: words("ferrous iron cyanocobalamin hydroxocobalamin b12 epoetin erythropoietin"),
  rifampicin: words("rifampicin rifampin rhze rhz"),
  /** Blood pressure medicines with no other common use here (calcium-channel blockers, thiazides,
   *  methyldopa); `bp` adds the RAS blockers, beta-blockers and others (MR-21). */
  bpOnly: words(
    "amlodipine nifedipine felodipine hydrochlorothiazide bendroflumethiazide chlorthalidone indapamide methyldopa",
  ),
  bp: words("pril sartan atenolol bisoprolol metoprolol carvedilol hydralazine spironolactone"),
};

const CHECK_MONTHS: Record<string, number> = {
  within_1_year: 0,
  "1_to_2_years": 12,
  over_2_years: 24,
};
const tri = (b: boolean | null | undefined) => (b === null ? undefined : b);
const has = (v: unknown, o: string) => (Array.isArray(v) ? v.includes(o) : v === o);

export function packInputFromClerking(s: ClerkingPackSources): ClerkingPackResult {
  const { x } = s;
  const h = x.history.answers;
  const pd =
    h.past.conditions.diabetes?.answer === "yes" ? h.past.conditions.diabetes.details : undefined;
  const now = Date.parse(x.now ?? new Date().toISOString());
  const values: PackValues = {};
  const from: Record<string, string> = {};
  /** First answer wins: callers set the stronger source first. */
  const set = (f: string, v: PackValue | null | undefined, why: string) => {
    if (v === undefined || v === null || Number.isNaN(v) || f in values) return;
    values[f] = v;
    from[f] = why;
  };

  /* ─── History ─── */
  const sym = (id: string) => {
    const a = symptomAnswer(x, id);
    return a === "yes" ? true : a === "no" ? false : undefined;
  };
  const props = (id: string) => symptomEntry(x, id)?.props ?? {};
  const SYS = "History · symptoms";
  for (const [f, id] of [
    ["polyuria", "sym.polyuria"],
    ["polydipsia", "sym.polydipsia"],
    ["fatigue", "sym.fatigue"],
    ["abdominal_pain", "sym.abdominal_pain"],
    ["recurrent_infections", "sym.recurrent_infections"],
    ["pruritus", "sym.itch"],
    ["diarrhoea", "sym.diarrhoea"],
    ["weakness", "sym.muscle_weakness"], // MR-03
    ["vomiting", "sym.nausea_vomiting"], // MR-04
  ] as const)
    set(f, sym(id), SYS);
  if (props("sym.polyuria").thirst === "very_thirsty") set("polydipsia", true, SYS);
  if (props("sym.loss_of_appetite").level === "increased") set("polyphagia", true, SYS); // MR-41
  const wl = sym("sym.weight_loss");
  set("unexplained_weight_loss", wl && props("sym.weight_loss").intent !== "intentional", SYS); // MR-05
  if (
    has(props("sym.skin_lesion").change, "not_healing") ||
    props("sym.skin_lesion").diabetes_foot === "yes"
  )
    set("slow_healing_wound", true, SYS);
  const vis = sym("sym.blurred_vision"); // MR-37
  const vp = props("sym.blurred_vision");
  if (vis === false || (vis && (vp.type === undefined || vp.type === "blurred")))
    set("blurred_vision", vis, SYS);
  if (vis === false || (vis && (vp.onset === "sudden" || vp.type === "loss")))
    set("sudden_vision_loss", vis, SYS);
  const numb = sym("sym.numbness");
  if (numb === false || (numb && has(props("sym.numbness").where, "hands_feet")))
    set("foot_numbness_burning", numb, SYS); // MR-06
  const anyOf = (ids: string[]) => {
    const a = ids.map(sym);
    return a.includes(true) ? true : a.every((v) => v === false) ? false : undefined;
  };
  set(
    "chest_pain_or_stroke_symptoms",
    anyOf(["sym.chest_pain", "sym.focal_weakness", "sym.speech_change"]),
    SYS,
  );
  set(
    "autonomic_symptoms",
    anyOf(["sym.fainting", "sym.bowel_change", "sym.incontinence", "sym.excess_sweating"]),
    SYS,
  );
  set("hypertensive_symptoms", anyOf(["sym.headache", "sym.nausea_vomiting"]), SYS);
  const dizzy = sym("sym.dizziness");
  if (props("sym.dizziness").trigger === "standing" || x.exam.panels?.postural?.symptoms === "yes")
    set("orthostatic_dizziness", true, SYS);
  else if (dizzy === false) set("orthostatic_dizziness", false, SYS);
  const lowUrine = sym("sym.urine_output_low");
  const amount = props("sym.urine_output_low").amount;
  set(
    "anuria",
    lowUrine === false ? false : lowUrine && amount ? amount === "none" : undefined,
    SYS,
  );
  const cough = sym("sym.cough"); // MR-38
  const coughDays = durationDays(symptomEntry(x, "sym.cough")?.duration);
  set(
    "cough_over_2_weeks",
    cough === false ? false : cough && coughDays !== null ? coughDays > 14 : undefined,
    SYS,
  );
  if (
    anyOf(["sym.fever", "sym.nausea_vomiting", "sym.diarrhoea"]) ||
    props("sym.nausea_vomiting").keeping_fluids === "no"
  )
    set("acute_illness_current", true, SYS); // MR-08: true only
  const app = entryOf(x.cat, x.exam, "ex.general.appearance")?.choice;
  if (app && ["moderately_ill", "severely_ill", "toxic_looking"].includes(app))
    set("acute_illness_current", true, "Examination · general appearance");

  /* ─── Past history, problems, diagnoses ─── */
  const PMH = "Past history";
  const past = (id: string) => {
    const a = h.past.conditions[id]?.answer;
    return a === "yes" ? true : a === "no" ? false : undefined;
  };
  const codesOf = (r: {
    conceptId?: string | null;
    termId?: string | null;
    code?: string | null;
  }) => [r.conceptId, r.termId, r.code, r.code?.split(".")[0]].filter((c): c is string => !!c);
  const problem = (...ids: string[]) =>
    s.problems.find((p) => codesOf(p).some((c) => ids.includes(c)));
  const board = (...ids: string[]) =>
    s.diagnoses.find((d) => codesOf(d).some((c) => ids.includes(c)));
  const pregnant = x.patient.pregnant;

  // Type: this visit's diagnosis, then the problem list, then "About the diabetes" (MR-07).
  const typeOf = (r: Parameters<typeof codesOf>[0]) => {
    const c = codesOf(r);
    if (pregnant === true && c.some((k) => GDM.has(k))) return "gestational";
    return c.map((k) => DM_TYPE[k]).find(Boolean);
  };
  for (const d of s.diagnoses) set("dm_type_recorded", typeOf(d), `Diagnoses · ${d.display}`);
  for (const p of s.problems) set("dm_type_recorded", typeOf(p), `Problem list · ${p.display}`);
  const pdType = pd?.type;
  if (typeof pdType === "string")
    set(
      "dm_type_recorded",
      pdType === "not_sure" ? "unclassified" : pdType,
      `${PMH} · about the diabetes`,
    );

  // Known diabetes: the problem list, a glucose-lowering medicine, then the past history (MR-09).
  const dmProblem = s.problems.find((p) =>
    codesOf(p).some((k) => DM_TYPE[k] && k.startsWith("cond.")),
  );
  if (dmProblem) set("dm_status", "known", `Problem list · ${dmProblem.display}`);
  const glm = x.medicines.filter((m) =>
    evalTri({ medicine_group: "glucose_lowering" }, { ...x, medicines: [m] }),
  );
  if (glm.length) set("dm_status", "known", `Medicines · ${glm.map((m) => m.name).join(", ")}`);
  const dmPast = past("diabetes");
  set(
    "dm_status",
    dmPast === undefined ? undefined : dmPast ? "known" : "not_known",
    `${PMH} · diabetes`,
  );

  const orProblem = (f: string, cond: string, concept: string) => {
    const p = problem(concept);
    if (p) set(f, true, `Problem list · ${p.display}`);
    set(f, past(cond), `${PMH} · ${cond.replace(/_/g, " ")}`);
  };
  orProblem("hypertension_known", "hypertension", "cond.hypertension");
  orProblem("heart_failure_known", "heart_failure", "cond.heart_failure");
  orProblem("sickle_cell_disease", "sickle_cell_disease", "cond.sickle_cell_disease");
  for (const [f, concept] of [
    ["iron_deficiency", "cond.iron_deficiency_anaemia"],
    ["g6pd_deficiency", "cond.g6pd_deficiency"],
    ["pcos", "cond.pcos"],
    ["prior_intermediate_hyperglycaemia", "cond.intermediate_hyperglycaemia"],
  ] as const) {
    const p = problem(concept);
    if (p) set(f, true, `Problem list · ${p.display}`);
  }
  const gdm = problem(...GDM);
  if (gdm && pregnant !== true) set("prior_gdm", true, `Problem list · ${gdm.display}`); // MR-11
  const told = pd?.complications_told;
  const ascvd = problem("cond.ascvd");
  if (ascvd) set("cvd_established", true, `Problem list · ${ascvd.display}`);
  if (past("heart_attack_or_angina") || past("stroke") || has(told, "heart") || has(told, "stroke"))
    set("cvd_established", true, PMH);
  if (sym("sym.claudication")) set("cvd_established", true, SYS);
  if (past("heart_attack_or_angina") === false && past("stroke") === false)
    set("cvd_established", false, PMH); // MR-12
  set("haemorrhagic_or_unknown_stroke", past("stroke"), `${PMH} · stroke`); // MR-13
  const t = h.past.transfusions;
  if (t === "none") set("recent_transfusion", false, `${PMH} · transfusions`);
  else if (Array.isArray(t) && t.some((r) => r.when === "last_3_months"))
    set("recent_transfusion", true, `${PMH} · transfusions`);
  else if (Array.isArray(t) && t.length && t.every((r) => r.when === "longer_ago"))
    set("recent_transfusion", false, `${PMH} · transfusions`);

  const crisis = board("dx.dka", "dx.hhs", "5A22", "5A20");
  if (crisis) set("hyperglycaemic_crisis_now", true, `Diagnoses · ${crisis.display}`);
  const unstable = board("dx.dka", "dx.hhs", "dx.aki", "5A22", "5A20");
  if (unstable) set("creatinine_unstable", true, `Diagnoses · ${unstable.display}`); // MR-14

  // About the diabetes (EC-2).
  const ABOUT = `${PMH} · about the diabetes`;
  const year = Number(pd?.year_diagnosed);
  const years = Number.isFinite(year) && year > 1900 ? new Date(now).getUTCFullYear() - year : NaN;
  if (years >= 0) {
    set("years_since_diagnosis", years, ABOUT);
    if (typeof x.patient.ageYears === "number" && x.patient.ageYears >= years)
      set("age_at_diagnosis", x.patient.ageYears - years, ABOUT); // MR-15
  }
  if (typeof pd?.lows_12_months === "string" && pd.lows_12_months !== "not_sure")
    set("hypo_worst_12m", pd.lows_12_months, ABOUT);
  if (has(told, "foot_ulcer")) set("previous_foot_ulcer", true, ABOUT);
  if (has(told, "amputation")) set("previous_amputation", true, ABOUT);

  /* ─── Family and social ─── */
  const fam = h.family.diabetes;
  for (const [f, rel] of [
    ["first_degree_relative_diabetes", ["mother", "father", "sibling", "child"]],
    ["fh_diabetes_first_degree", ["mother", "father", "sibling"]],
    ["parent_with_diabetes", ["mother", "father"]],
  ] as const) {
    const v =
      fam?.answer === "no"
        ? false
        : fam?.answer === "yes" && fam.relations?.length
          ? fam.relations.some((r) => (rel as readonly string[]).includes(r))
          : undefined;
    set(f, v, "Family history · diabetes"); // MR-16
  }
  const so = h.social;
  if (so.tobacco === "current" || so.otherForms?.length)
    set("smoking_current", true, "Social history · tobacco");
  else if (so.tobacco === "never" || so.tobacco === "former")
    set("smoking_current", false, "Social history · tobacco");
  const cage = Object.values(so.cage ?? {});
  const cageYes = cage.filter((a) => a === "yes").length;
  if (cageYes >= 2) set("alcohol_harmful", true, "Social history · CAGE");
  else if (so.alcohol === "none" || cage.length >= 4)
    set("alcohol_harmful", false, "Social history · alcohol"); // MR-17
  if (so.activity === "needs_help" || so.activity === "bedbound")
    set("frailty_or_limited_life_expectancy", true, "Social history · activity"); // MR-18: true only
  if (entryOf(x.cat, x.exam, "ex.general.mobility")?.choice === "bedbound")
    set("frailty_or_limited_life_expectancy", true, "Examination · mobility");

  /* ─── Medicines ─── */
  const meds = x.medicines;
  const none = h.past.medicinesNone === true && meds.length === 0;
  const named = (stems: readonly string[]) =>
    meds.filter((m) => stems.some((st) => m.name.toLowerCase().includes(st)));
  const group = (g: string) =>
    meds.filter((m) => evalTri({ medicine_group: g }, { ...x, medicines: [m] }));
  const MEDS = "Medicines";
  const taking = (f: string, list: ExamContext["medicines"]) =>
    set(
      f,
      list.length ? true : none ? false : undefined,
      list.length ? `${MEDS} · ${list.map((m) => m.name).join(", ")}` : `${MEDS} · takes none`,
    );
  taking("on_statin", group("statin"));
  taking("on_glucocorticoid", group("systemic_steroid")); // MR-19
  taking("on_antiplatelet", named(STEMS.antiplatelet));
  taking("on_dapsone", named(["dapsone"]));
  taking("on_iron_b12_or_epo", named(STEMS.ironB12Epo));
  taking("on_second_gen_antipsychotic", named(STEMS.antipsychotic2));
  taking("on_rifampicin", [...medicinesMatching(x, "tb_treatment"), ...named(STEMS.rifampicin)]); // MR-20
  const tbRx = medicinesMatching(x, "tb_treatment");
  if (tbRx.length) set("tb_current", true, `${MEDS} · ${tbRx[0]!.name}`);
  const tbP = problem("cond.tuberculosis");
  if (tbP) set("tb_current", true, `Problem list · ${tbP.display}`);
  if (past("tuberculosis") === false) set("tb_current", false, `${PMH} · tuberculosis`);
  const arv = medicinesMatching(x, "antiretrovirals");
  const hiv = past("hiv") || !!problem("cond.hiv");
  if (hiv && arv.length) set("hiv_on_art", true, `${MEDS} · ${arv[0]!.name}`);
  else if (past("hiv") === false || (hiv && none)) set("hiv_on_art", false, PMH);
  const ras = group("ras_blocker");
  const acei = ras.some((m) => /pril/i.test(m.name)),
    arb = ras.some((m) => /sartan/i.test(m.name));
  set(
    "ras_blocker",
    acei && arb ? "both" : acei ? "acei" : arb ? "arb" : none ? "none" : undefined,
    ras.length ? `${MEDS} · ${ras.map((m) => m.name).join(", ")}` : `${MEDS} · takes none`,
  );
  const bp = named([...STEMS.bp, ...STEMS.bpOnly]);
  set("bp_medicines_count", bp.length || (none ? 0 : undefined), `${MEDS} · blood pressure`); // MR-21
  const htn = named(STEMS.bpOnly);
  if (htn.length) set("hypertension_known", true, `${MEDS} · ${htn.map((m) => m.name).join(", ")}`);
  // Glucose-lowering classes (multi-select); "Insulin" under "About the diabetes" names a class too.
  const cls = new Set<string>();
  for (const m of glm) {
    const n = m.name.toLowerCase();
    for (const [c, stems] of [
      ["metformin", ["metformin"]],
      ["insulin", ["insulin"]],
      ["glibenclamide", ["glibenclamide"]],
      ["gliclazide", ["gliclazide"]],
      ["glimepiride", ["glimepiride"]],
      ["sglt2_inhibitor", ["flozin"]],
      ["dpp4_inhibitor", STEMS.dpp4],
      ["glp1_ra", STEMS.glp1],
      ["pioglitazone", ["pioglitazone"]],
    ] as const)
      if (stems.some((st) => n.includes(st))) cls.add(c);
  }
  if (has(pd?.treatment, "insulin")) cls.add("insulin");
  const onlyDiet =
    Array.isArray(pd?.treatment) && pd.treatment.every((v) => v === "diet_only" || v === "none");
  if (cls.size)
    set(
      "glucose_lowering_therapy",
      [...cls],
      glm.length ? `${MEDS} · ${glm.map((m) => m.name).join(", ")}` : ABOUT,
    );
  else if (!glm.length && (onlyDiet || none))
    set("glucose_lowering_therapy", ["none"], onlyDiet ? ABOUT : `${MEDS} · takes none`);
  const ins = medicinesMatching(x, "insulin");
  if (ins.some((m) => m.adherence === "stopped" || m.adherence === "sometimes_misses"))
    set("insulin_omitted", true, `${MEDS} · insulin adherence`);
  else if (ins.length && ins.every((m) => m.adherence === "as_prescribed"))
    set("insulin_omitted", false, `${MEDS} · insulin adherence`);

  /* ─── Examination ─── */
  const e = (id: string) => entryOf(x.cat, x.exam, id);
  const attr = (id: string, a: string) => readAttr(x.cat, x.exam, id, a);
  const state = (id: string) => {
    const st = e(id)?.state;
    return st === "positive" ? true : st === "negative" ? false : undefined;
  };
  const EX = "Examination";
  for (const [f, id, where] of [
    ["active_foot_ulcer", "ex.feet.ulcer", "feet"],
    ["foot_gangrene", "ex.feet.gangrene", "feet"],
    ["foot_deformity", "ex.feet.deformity", "feet"],
    ["injection_site_lumps", "ex.skin.injection_sites", "injection sites"],
    ["splenomegaly", "ex.abdomen.spleen", "abdomen"],
    ["peripheral_oedema", "ex.general.oedema", "oedema"],
  ] as const)
    set(f, state(id), `${EX} · ${where}`);
  if (state("ex.feet.ulcer")) set("slow_healing_wound", true, `${EX} · feet`);
  const withAttr = (id: string, a: string, opt: string) => {
    const st = state(id);
    const v = attr(id, a);
    return st === false ? false : st && v !== undefined ? has(v, opt) : undefined;
  };
  set(
    "deep_rapid_breathing",
    withAttr("ex.respiratory.breathing_pattern", "pattern", "kussmaul_deep_sighing"),
    `${EX} · breathing`,
  );
  set("acetone_breath", withAttr("ex.general.odour", "smells", "ketones_fruity"), `${EX} · odour`);
  const risk = (opt: string) => {
    const st = state("ex.feet.foot_risk_history");
    return st === false
      ? false
      : st && has(attr("ex.feet.foot_risk_history", "history"), opt)
        ? true
        : undefined;
  };
  set("previous_foot_ulcer", risk("previous_foot_ulcer"), `${EX} · foot risk history`);
  set("previous_amputation", risk("previous_amputation"), `${EX} · foot risk history`);
  set(
    "end_stage_kidney_disease",
    risk("end_stage_kidney_disease_or_dialysis"),
    `${EX} · foot risk history`,
  ); // MR-22
  const seen = attr("ex.feet.deformity", "seen");
  if (has(seen, "minor_amputation") || has(seen, "major_amputation"))
    set("previous_amputation", true, `${EX} · feet`);

  // Feet: pulses grid, monofilament, fork, Ipswich, temperature, infection.
  const FEET = `${EX} · feet`;
  const pulses = x.exam.blocks.pulses ?? {}; // MR-42
  const pc = ["Dorsalis pedis", "Posterior tibial"].flatMap((r) => [pulses[r]?.R, pulses[r]?.L]);
  const sides = (["R", "L"] as const).every((sd) =>
    ["Dorsalis pedis", "Posterior tibial"].some((r) => pulses[r]?.[sd]),
  );
  set(
    "pedal_pulses",
    pc.includes("absent")
      ? "absent"
      : pc.includes("reduced")
        ? "reduced"
        : sides
          ? "both"
          : undefined,
    FEET,
  );
  const mono = state("ex.feet.monofilament");
  const nl = Number(attr("ex.feet.monofilament", "sites_not_felt_left")) > 0,
    nr = Number(attr("ex.feet.monofilament", "sites_not_felt_right")) > 0;
  set(
    "monofilament_10g",
    mono === false
      ? "none"
      : mono && (nl || nr)
        ? nl && nr
          ? "both_feet"
          : "one_foot"
        : undefined,
    FEET,
  );
  const fork = state("ex.feet.vibration_128");
  set(
    "vibration_128hz",
    fork === false
      ? "present"
      : fork
        ? attr("ex.feet.vibration_128", "side") === "both"
          ? "absent_both"
          : "absent_one"
        : undefined,
    FEET,
  );
  const ips = state("ex.feet.ipswich_touch"),
    toes = attr("ex.feet.ipswich_touch", "toes_not_felt");
  set(
    "ipswich_sites_missed",
    ips === false ? 0 : ips && typeof toes === "number" ? toes : undefined,
    FEET,
  );
  const temp = state("ex.feet.foot_temperature");
  set(
    "foot_hot_swollen",
    temp === false ? false : temp && attr("ex.feet.foot_temperature", "warmer") ? true : undefined,
    FEET,
  );
  const also = attr("ex.feet.foot_temperature", "also");
  if (has(also, "cold_foot") || has(also, "pale_on_elevation"))
    set("limb_ischaemia_signs", true, FEET); // MR-23
  const dfi = x.results?.get("dfi_iwgdf_idsa")?.result;
  const DFI: Record<string, string> = { "1": "none", "2": "mild", "3": "moderate", "4": "severe" };
  set(
    "foot_infection_grade",
    state("ex.feet.ulcer") === false ? "none" : dfi ? DFI[dfi] : undefined,
    FEET,
  );
  const sensedToday = [
    "ex.feet.monofilament",
    "ex.feet.vibration_128",
    "ex.feet.ipswich_touch",
    "ex.nervous.pinprick",
  ].some((id) => state(id) !== undefined);
  if (sensedToday) set("months_since_neuropathy_screen", 0, FEET);
  if (state("ex.feet.monofilament") !== undefined || state("ex.feet.ipswich_touch") !== undefined)
    set("months_since_foot_risk_assessment", 0, FEET);
  const pin = state("ex.nervous.pinprick");
  set(
    "pinprick_feet",
    pin === false
      ? "normal"
      : pin && attr("ex.nervous.pinprick", "pattern") === "glove_and_stocking"
        ? "reduced"
        : undefined,
    `${EX} · pinprick`,
  ); // MR-24
  const ankle = x.exam.blocks.reflexes?.Ankle;
  const ak = [ankle?.R, ankle?.L].filter((v): v is number => typeof v === "number");
  set(
    "ankle_reflexes",
    ak.some((v) => v <= 1) ? "reduced_or_absent" : ak.length === 2 ? "present" : undefined,
    `${EX} · reflexes`,
  );

  // Eyes.
  const EYE = `${EX} · fundoscopy`;
  const fundus = e("ex.eyes_ent_neck.fundoscopy")?.state;
  const grade = attr("ex.eyes_ent_neck.fundoscopy", "dr_grade");
  const mac = attr("ex.eyes_ent_neck.fundoscopy", "macula");
  set(
    "retinopathy_stage",
    typeof grade === "string" ? grade : fundus === "negative" ? "none" : undefined,
    EYE,
  ); // MR-25
  set(
    "macular_oedema",
    typeof mac === "string" && mac !== "cannot_assess"
      ? mac
      : fundus === "negative"
        ? "none"
        : undefined,
    EYE,
  );
  const view = attr("ex.eyes_ent_neck.fundoscopy", "view");
  set(
    "retina_view",
    typeof view === "string" ? view : fundus === "not_examined" ? "not_attempted" : undefined,
    EYE,
  );
  const method = attr("ex.eyes_ent_neck.fundoscopy", "method");
  set(
    "fundus_method",
    method === "photograph"
      ? "photograph"
      : typeof method === "string"
        ? `${method}_ophthalmoscopy`
        : undefined,
    EYE,
  );
  if (fundus === "positive" || fundus === "negative") set("months_since_eye_screen", 0, EYE);
  const acuity = x.results?.get("acuity_band");
  if (acuity?.result === "worse_than_6_12")
    set("visual_acuity_worse_6_12", true, `${EX} · visual acuity`);
  else if (
    attr("ex.eyes_ent_neck.visual_acuity", "right") &&
    attr("ex.eyes_ent_neck.visual_acuity", "left")
  )
    set("visual_acuity_worse_6_12", false, `${EX} · visual acuity`);

  // General: consciousness, hydration, wasting, cognition.
  const c = x.exam.blocks.consciousness;
  const a = acvpuOf(c);
  const g = gcsTotal(c);
  set(
    "mental_status",
    a
      ? ({ A: "alert", C: "drowsy", V: "drowsy", P: "stupor", U: "coma" } as const)[a]
      : g === null
        ? undefined
        : g >= 13
          ? "drowsy"
          : g >= 9
            ? "stupor"
            : "coma",
    `${EX} · consciousness`,
  ); // MR-26
  const hyd = e("ex.general.hydration");
  const signs = (hyd?.attrs?.signs_present as string[] | undefined) ?? [];
  // GTFCC grades only with diarrhoea or vomiting; ungraded, two signs or more count (MR-27).
  const gtfcc = x.results?.get("dehydration_gtfcc")?.result;
  if (hyd && hyd.state !== "not_examined")
    set(
      "dehydration",
      gtfcc === "some" || gtfcc === "severe" || (!gtfcc && signs.length >= 2)
        ? true
        : signs.length === 0
          ? false
          : undefined,
      `${EX} · hydration`,
    ); // MR-27
  const build = e("ex.general.build")?.choice;
  const nut = attr("ex.general.nutrition", "signs");
  if (build === "wasted_cachectic" || has(nut, "muscle_wasting") || has(nut, "temporal_wasting"))
    set("wasting", true, `${EX} · build`);
  else if (build) set("wasting", false, `${EX} · build`); // MR-28
  const am = amts(x.exam);
  const amtsCut = x.cat.refNumber("REF-EX-AMTS-IMPAIRED");
  if (state("ex.nervous.memory") || (am?.complete && amtsCut !== null && am.score <= amtsCut))
    set("cognitive_impairment", true, `${EX} · memory`); // MR-29: true only

  // Postural panel.
  const pos = x.exam.panels?.postural;
  const stand = [pos?.standing_1min, pos?.standing_3min];
  const fall = (k: "sbp" | "dbp") => {
    const st = stand.map((r) => r?.[k]).filter((v): v is number => typeof v === "number");
    const lie = pos?.lying?.[k];
    return typeof lie === "number" && st.length ? lie - Math.min(...st) : undefined;
  };
  set("postural_sbp_fall", fall("sbp"), `${EX} · postural blood pressure`);
  set("postural_dbp_fall", fall("dbp"), `${EX} · postural blood pressure`);

  // Ketone panel (note only), then this episode's charted ketones.
  const ket = x.exam.panels?.ketones;
  set("bohb", ket?.blood, `${EX} · ketones`);
  set("urine_ketones", ket?.urine, `${EX} · ketones`);

  /* ─── Vital signs ─── */
  const v = x.vitals;
  const VS = "Vital signs";
  for (const [f, val] of [
    ["bp_systolic", v.sbp],
    ["bp_diastolic", v.dbp],
    ["pulse", v.pulse],
    ["respiratory_rate", v.rr],
    ["temperature", v.temp],
    ["weight_kg", v.weight],
    ["height_cm", v.height],
    ["waist_cm", v.waist],
    ["bmi", bmiOf(v.weight, v.height)],
  ] as const)
    set(f, val, VS);
  // Capillary glucose: typed in "Now", or this visit's saved set (its context marks it). A newest
  // chart glucose with no context may be a laboratory or triage value: not capillary (MR-30).
  const draft = parseVitalsDraft(x.cat, x.exam.vitalsDraft).values;
  if (draft.glucose !== null || draft.glucoseReads || v.glucoseContext) {
    const why = `${VS} · glucose`;
    set("capillary_glucose", v.glucose, why);
    set("glucose_meter_extreme", v.glucoseReads?.toLowerCase(), why);
    set("capillary_glucose_context", v.glucoseContext, why);
    if (v.glucoseContext === "two_hours_after_food") set("postprandial_pg", v.glucose, why);
    set("months_since_glucose_test", 0, why);
  }

  /* ─── Results (EC-1 facts) ─── */
  const facts = x.facts ?? [];
  const label = (f: ResultFact) =>
    `Results · ${f.concept.replace(/^obs\./, "").replace(/_/g, " ")} ${f.at.slice(0, 10)}`;
  const newest = (pred: (f: ResultFact) => boolean, days = Infinity) =>
    facts
      .filter((f) => {
        const at = Date.parse(f.at);
        return f.trust >= 3 && pred(f) && at <= now && now - at <= days * DAY;
      })
      .sort((p, q) => (p.at < q.at ? 1 : -1))[0];
  const result = (
    f: string,
    pred: (r: ResultFact) => boolean,
    days: number,
    val = (r: ResultFact) => r.value as PackValue | undefined,
  ) => {
    const r = newest(pred, days);
    if (r) set(f, val(r), label(r));
    return r;
  };
  const is = (concept: string) => (r: ResultFact) => r.concept === concept;
  // Laboratory glucose: never a meter reading (point of care or capillary), split by its qualifiers.
  const lab = (r: ResultFact) =>
    r.concept === "obs.glucose" && r.pointOfCare !== true && r.specimen !== "capillary_whole_blood";
  const ogtt = (min: number) => (r: ResultFact) =>
    r.challenge?.type === "ogtt_75g" && r.challenge.minutes === min;
  result("ogtt_2h_pg", (r) => lab(r) && ogtt(120)(r), WINDOW.acute);
  result("ogtt_1h_pg", (r) => lab(r) && ogtt(60)(r), WINDOW.acute);
  result("fasting_pg", (r) => lab(r) && !r.challenge && r.fastingState === "fasting", WINDOW.acute);
  result("random_pg", (r) => lab(r) && !r.challenge && r.fastingState !== "fasting", WINDOW.acute); // unknown is never fasting
  const a1c = result("hba1c", is("obs.hba1c"), WINDOW.hba1c);
  // MR-31: point of care when flagged; a laboratory HbA1c when not flagged and not capillary.
  if (a1c)
    set(
      "hba1c_point_of_care",
      a1c.pointOfCare === true
        ? true
        : a1c.specimen && a1c.specimen !== "capillary_whole_blood"
          ? false
          : a1c.pointOfCare,
      label(a1c),
    );
  result("potassium", is("obs.potassium"), WINDOW.acute);
  result("venous_ph", is("obs.ph"), WINDOW.acute);
  result("bicarbonate", is("obs.bicarbonate"), WINDOW.acute);
  result("effective_osmolality", is("derived.osmolality_effective"), WINDOW.acute);
  result("bohb", is("obs.ketones_blood"), WINDOW.acute);
  const strip = (r: ResultFact) =>
    r.code === "negative"
      ? "neg"
      : r.code === "trace"
        ? "trace"
        : r.value >= 1
          ? `${Math.min(3, r.value)}plus`
          : undefined; // MR-32
  result("urine_ketones", is("obs.ketones_urine"), WINDOW.acute, strip);
  result("urine_protein_strip", is("obs.urine_protein_dipstick"), WINDOW.acute, strip);
  result("urine_acr", is("obs.uacr"), WINDOW.kidney);
  result("total_cholesterol", is("obs.chol_total"), WINDOW.lipids);
  result("ldl_cholesterol", is("obs.chol_ldl"), WINDOW.lipids);
  result("triglycerides", is("obs.triglycerides"), WINDOW.lipids);
  // eGFR: CKD-EPI 2021 (race-free; signed 2026-10-08) from the newest creatinine (µmol/L).
  const cr = newest(is("obs.creatinine"), WINDOW.kidney);
  const age = x.patient.ageYears,
    sex = x.patient.sex;
  if (cr && !cr.comparator && typeof age === "number" && sex)
    set("egfr", egfr(cr.value, age, sex), `${label(cr)} (eGFR, CKD-EPI 2021)`);
  // ACR count: abnormal (≥ 3 mg/mmol) among the last three within 6 months (MR-33).
  const acr = facts
    .filter((r) => r.concept === "obs.uacr" && r.trust >= 3 && now - Date.parse(r.at) <= 183 * DAY)
    .sort((p, q) => (p.at < q.at ? 1 : -1))
    .slice(0, 3);
  if (acr.length)
    set(
      "uacr_abnormal_count",
      acr.filter((r) => r.value >= 3).length,
      "Results · urine ACR, last 6 months",
    );
  // Months since: the newest of any age (absence is not "never", MR-34).
  const monthsSince = (f: string, pred: (r: ResultFact) => boolean) => {
    const r = newest(pred);
    if (r) set(f, Math.floor((now - Date.parse(r.at)) / MONTH), label(r));
    return r;
  };
  monthsSince(
    "months_since_glucose_test",
    (r) => r.concept === "obs.glucose" || r.concept === "obs.hba1c",
  );
  monthsSince("months_since_hba1c", is("obs.hba1c"));
  monthsSince(
    "months_since_any_control_measure",
    (r) =>
      r.concept === "obs.hba1c" || (r.concept === "obs.glucose" && r.fastingState === "fasting"),
  );
  monthsSince(
    "months_since_lipids",
    (r) => r.concept.startsWith("obs.chol_") || r.concept === "obs.triglycerides",
  );
  if (monthsSince("months_since_kidney_screen", is("obs.uacr")))
    set("never_kidney_screen", false, "Results · urine ACR");
  if (
    pregnant === true &&
    x.patient.pregnancySince &&
    facts.some(
      (r) =>
        r.concept === "obs.glucose" &&
        r.challenge?.type === "ogtt_75g" &&
        r.at >= x.patient.pregnancySince!,
    )
  )
    set("ogtt_done_this_pregnancy", true, "Results · 75 g OGTT");
  // The last checks as "About the diabetes" reports them (live.ts EYE_MONTHS convention).
  for (const [key, months, never] of [
    ["last_eye_check", "months_since_eye_screen", "never_eye_screen"],
    ["last_foot_check", "months_since_foot_risk_assessment", "never_foot_assessment"],
    ["last_kidney_test", "months_since_kidney_screen", "never_kidney_screen"],
  ] as const) {
    const ans = pd?.[key];
    if (typeof ans !== "string" || ans === "not_sure") continue;
    set(never, ans === "never", ABOUT);
    set(months, CHECK_MONTHS[ans], ABOUT);
  }

  /* ─── Patient and pregnancy ─── */
  const PT = "Patient record";
  set("sex", x.patient.sex, PT);
  set("pregnant", x.patient.pregnant, `${PT} · pregnancy`);
  if (pregnant === true)
    set("gestation_weeks", s.pregnancy?.gestationWeeks, `${PT} · pregnancy (LNMP)`);
  set("postpartum_weeks", s.pregnancy?.weeksPostpartum, `${PT} · pregnancy (birth)`);
  const inRange = inPregnancyAgeRange(x.patient.ageYears);
  set("could_conceive", sex === "male" ? false : sex === "female" ? tri(inRange) : undefined, PT); // MR-35

  /* ─── Restricted classes the viewer may not see ─── */
  for (const [f, cls] of Object.entries(RESTRICTED_FEATURES))
    if (s.viewer && !s.viewer.classes.has(cls)) {
      delete values[f];
      delete from[f];
    }

  const t0 = x.settings.encounterType;
  const careSetting =
    t0 === "inpatient" || t0 === "emergency"
      ? t0
      : t0 && ["opd", "follow_up", "antenatal", "tele", "virtual", "community"].includes(t0)
        ? "outpatient"
        : null; // MR-36
  if (typeof age === "number") from.age_years = PT;
  if (careSetting) from.care_setting = "Encounter type";
  const input = packInputOf(values, {
    ageYears: age,
    site: s.site ?? "referral",
    established: !!dmProblem,
    careSetting,
  });
  if (input.values.pregnancy_possible !== undefined)
    from.pregnancy_possible = `${PT} · sex and age`;
  return { input, from };
}

/* ─── Where each pack feature is asked ─── */

const HOMES: Record<string, string> = {
  systems:
    "polyuria polydipsia unexplained_weight_loss fatigue vomiting abdominal_pain blurred_vision recurrent_infections foot_numbness_burning sudden_vision_loss chest_pain_or_stroke_symptoms orthostatic_dizziness cough_over_2_weeks autonomic_symptoms anuria hypertensive_symptoms pruritus weakness diarrhoea",
  pmh: "dm_status glucose_lowering_therapy hiv_on_art recent_transfusion hypertension_known age_at_diagnosis years_since_diagnosis sickle_cell_disease heart_failure_known on_glucocorticoid on_second_gen_antipsychotic tb_current cvd_established on_dapsone on_iron_b12_or_epo hypo_worst_12m months_since_eye_screen months_since_kidney_screen months_since_foot_risk_assessment bp_medicines_count on_statin ras_blocker on_rifampicin dm_type_recorded never_eye_screen never_kidney_screen never_foot_assessment insulin_omitted on_antiplatelet haemorrhagic_or_unknown_stroke",
  fh: "first_degree_relative_diabetes parent_with_diabetes fh_diabetes_first_degree",
  social: "smoking_current alcohol_harmful",
  exam: "capillary_glucose bohb urine_ketones mental_status deep_rapid_breathing acetone_breath dehydration bp_systolic bp_diastolic pulse respiratory_rate temperature weight_kg height_cm waist_cm bmi pedal_pulses monofilament_10g retinopathy_stage foot_deformity active_foot_ulcer foot_infection_grade peripheral_oedema previous_foot_ulcer previous_amputation end_stage_kidney_disease vibration_128hz ipswich_sites_missed foot_hot_swollen foot_gangrene injection_site_lumps splenomegaly fundus_method capillary_glucose_context postprandial_pg macular_oedema visual_acuity_worse_6_12 retina_view pinprick_feet ankle_reflexes postural_sbp_fall postural_dbp_fall months_since_neuropathy_screen limb_ischaemia_signs glucose_meter_extreme wasting",
  summary: "age_years sex care_setting pregnancy_possible",
  impression: "hyperglycaemic_crisis_now",
  results:
    "random_pg hba1c venous_ph bicarbonate sodium urea effective_osmolality egfr urine_acr urine_protein_strip fasting_pg ogtt_2h_pg ogtt_1h_pg potassium haematuria_strip total_cholesterol ldl_cholesterol triglycerides months_since_glucose_test months_since_hba1c months_since_any_control_measure uacr_abnormal_count months_since_lipids ogtt_normal ogtt_done_this_pregnancy hba1c_point_of_care",
  more: "polyphagia slow_healing_wound kidney_abnormality_3_months art_regimen haemolysis malaria_current acanthosis_nigricans pregnant gestation_weeks repeat_abnormal_result acute_illness_current ketosis_at_presentation c_peptide islet_autoantibodies sickle_cell_trait iron_deficiency on_dialysis prior_gdm postpartum_weeks prior_intermediate_hyperglycaemia weeks_since_antipsychotic_start months_since_art_start_or_switch pancreatitis_history pcos physically_inactive secondary_enuresis g6pd_deficiency b12_deficiency uacr_transient_cause creatinine_unstable insulin_stopped_without_relapse childhood_undernutrition steatorrhoea recurrent_abdominal_pain pancreatic_calcification glucose_at_presentation months_off_glucose_lowering glycaemic_target_tier therapy_changed_recently hypo_awareness_score frailty_or_limited_life_expectancy cognitive_impairment food_insecurity egfr_fall_percent creatinine_rise_percent_4w nephrotic_or_active_sediment neuropathy_atypical abi ulcer_area_reduction_4w bp_raised_two_occasions who_cvd_risk_percent who_cvd_chart_used overt_nephropathy surgery_or_fasting_planned could_conceive fasting_ramadan_planned glucose_goal_unmet_on_oral meals_irregular months_since_dental non_diabetic_kidney_clue never_glucose_tested never_hba1c never_neuropathy_screen never_lipids hypoglycaemia_not_resolving glucose_test_since_antipsychotic_start ras_or_sglt2_started_recently glucose_tested_since_birth hypertensive_organ_damage hba1c_method_variant_free prior_macrosomia_or_stillbirth polyhydramnios glycosuria fetus_large_for_dates hyperglycaemic_emergency_last_2_weeks months_since_b12 never_b12",
};

/** Where each pack feature is asked: a clerking step id ("complaint"|"history"|"systems"|"pmh"|"fh"|"social"|"exam"|"summary"|"impression"|"plan"), "results" (comes from lab results), or "more" (no home in the clerking: the 'More diabetes questions' pop-up). Every pack feature appears. */
export const PACK_FEATURE_HOME: Record<string, string> = Object.fromEntries(
  Object.entries(HOMES).flatMap(([home, list]) => words(list).map((f) => [f, home])),
);
