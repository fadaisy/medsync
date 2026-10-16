/**
 * The count105 fixture month: September 2026, Africa/Kampala, hospital A (with hospital B rows mixed in).
 * Every id, code, answer, quantity and mapping entry is a FIXTURE. The mapping mirrors a few rows of GATE A §8.2
 * so the counting rules can be shown; it is not the mapping the lead and the HMIS focal person will sign.
 * Each row is tagged with the counting rule it proves; `count105-expected.md` walks through every expected cell.
 */
import type { EqaRound } from "@/lib/lab/eqa";
import type { Count105Input, HmisMapping, HmisReport, HmisSpecimen } from "@/lib/lab/hmis105";
import type { StockItem, StockTx } from "@/lib/lab/stock";

import { H1, H2, kla, TZ } from "../_fixtures";

export const MAPPING: HmisMapping = {
  rows: [
    { code: "HE02", sources: [{ testCode: "test.fbc" }] },
    { code: "HE04", sources: [{ testCode: "test.esr" }] },
    { code: "HE06", sources: [{ testCode: "test.inr_pt" }] },
    { code: "RP01", sources: [{ testCode: "test.urea_electrolytes", conceptId: "obs.urea" }] },
    { code: "RP03", sources: [{ testCode: "test.urea_electrolytes", conceptId: "obs.potassium" }] },
    { code: "RP04", sources: [{ testCode: "test.urea_electrolytes", conceptId: "obs.sodium" }] },
    {
      code: "RP05",
      sources: [
        { testCode: "test.urea_electrolytes", conceptId: "obs.creatinine" },
        { testCode: "test.creatinine", conceptId: "obs.creatinine" },
      ],
    },
    {
      code: "CX07",
      sources: [
        { testCode: "test.urea_electrolytes", conceptId: "obs.chloride" },
        { testCode: "test.urea_electrolytes", conceptId: "obs.bicarbonate" },
        { testCode: "test.hba1c" },
      ],
    },
    {
      code: "SR01",
      sources: [{ testCode: "test.rpr", conceptId: "obs.rpr_result" }],
      positive: [{ column: "Number Positive", conceptId: "obs.rpr_result", answers: ["reactive"] }],
    },
    {
      code: "PS02",
      sources: [{ testCode: "test.malaria_rdt" }],
      positive: [
        { column: "Number Positive", conceptId: "obs.malaria_rdt", answers: ["positive"] },
      ],
    },
    {
      code: "ML01",
      sources: [{ testCode: "test.tb_xpert" }],
      positive: [
        {
          column: "MTB+",
          conceptId: "obs.tb_xpert_mtb",
          answers: ["detected_high", "detected_medium", "detected_low", "detected_very_low"],
        },
        { column: "RR", conceptId: "obs.tb_xpert_rif", answers: ["detected"] },
      ],
    },
    {
      code: "MB01",
      sources: [
        {
          testCode: "test.sputum_afb",
          where: { conceptId: "obs.sputum_afb_stain_method", answers: ["fm"] },
        },
      ],
      positive: [
        {
          column: "Number Positive",
          conceptId: "obs.sputum_afb",
          answers: ["scanty", "plus1", "plus2", "plus3"],
        },
      ],
    },
    {
      code: "MB02",
      sources: [
        {
          testCode: "test.sputum_afb",
          where: { conceptId: "obs.sputum_afb_stain_method", answers: ["zn"] },
        },
      ],
      positive: [
        {
          column: "Number Positive",
          conceptId: "obs.sputum_afb",
          answers: ["scanty", "plus1", "plus2", "plus3"],
        },
      ],
    },
    { code: "IG02", sources: [{ testCode: "test.hiv_viral_load" }] },
  ],
  visits: { opd: "LV01", emergency: "LV01", inpatient: "LV02" },
  specimenColumns: {
    venous_serum: "Blood",
    venous_edta: "Blood",
    urine_spot: "Urine",
    sputum: "Sputum",
  },
  rejection: { clotted: "RS14", insufficient: "RS01" },
  reasons: {
    equipment_down: "Equipment break down",
    stock_out: "Reagent stock out",
    none: "Others",
  },
  hivTests: ["test.hiv_rapid"],
  kits: { Determine: "Determine", "Stat-Pak": "Statpak", "SD Bioline": "SD Bioline" },
  kitItems: { "item-determine": "Determine" },
  purposes: { hct: "HCT", emtct: "eMTCT", clinical_diagnosis: "Clinical Diagnosis" },
  tracers: { "item-determine": "SS07", "item-rdt": "SS11" },
  excluded: ["test.urinalysis_dipstick"],
};

export const MENU = [
  "test.fbc",
  "test.esr",
  "test.urea_electrolytes",
  "test.creatinine",
  "test.rpr",
  "test.malaria_rdt",
  "test.tb_xpert",
  "test.sputum_afb",
  "test.hiv_rapid",
  "test.hba1c",
  "test.lft", // (HM-2) on the menu, in no row: listed as unmapped
  "test.urinalysis_dipstick", // explicitly excluded by the lead
];

const obs = (...pairs: [string, string | null][]) =>
  pairs.map(([conceptId, code]) => ({ conceptId, code }));
const HIV_ALGO = [
  { step: 1, kit: "Determine" },
  { step: 2, kit: "Stat-Pak" },
  { step: 3, kit: "SD Bioline" },
];
const report = (
  id: string,
  testCode: string,
  resultAt: string,
  o: Partial<HmisReport> = {},
): HmisReport => ({
  id: `${id}-v${o.version ?? 1}`,
  logicalId: id,
  version: 1,
  hospitalId: H1,
  testCode,
  status: "final",
  performer: "in_house",
  bedside: false,
  resultAt: kla(resultAt),
  formResultAt: null,
  observations: [],
  ...o,
});

export const REPORTS: HmisReport[] = [
  // (a) month by result time, hospital-local
  report("fbc-1", "test.fbc", "2026-09-10 10:00"),
  report("fbc-2", "test.fbc", "2026-09-30 23:30"), // 20:30Z: September in Kampala
  report("fbc-3", "test.fbc", "2026-10-01 00:30"), // 21:30Z on 30 SEP: October in Kampala, not counted
  report("fbc-4", "test.fbc", "2026-10-09 11:00", { formResultAt: kla("2026-09-29 15:00") }), // downtime: the form's date
  report("fbc-18", "test.fbc", "2026-09-18 10:00", { status: "preliminary" }), // never released
  report("fbc-20", "test.fbc", "2026-09-20 10:00"),
  report("fbc-20", "test.fbc", "2026-09-20 11:00", { version: 2, status: "entered_in_error" }), // withdrawn
  report("fbc-19", "test.fbc", "2026-09-19 10:00", { hospitalId: H2 }), // hospital B
  // (b) chemistry per analyte; eGFR is never counted
  report("ue-5", "test.urea_electrolytes", "2026-09-11 12:00", {
    observations: obs(
      ["obs.sodium", null],
      ["obs.potassium", null],
      ["obs.chloride", null],
      ["obs.bicarbonate", null],
      ["obs.urea", null],
      ["obs.creatinine", null],
      ["obs.egfr", null],
    ),
  }),
  report("creat-6", "test.creatinine", "2026-09-12 12:00", {
    observations: obs(["obs.creatinine", null]),
  }),
  // (g) an amended result counts once, as its current version
  report("ue-7", "test.urea_electrolytes", "2026-09-12 13:00", {
    observations: obs(["obs.potassium", null], ["obs.sodium", null]),
  }),
  report("ue-7", "test.urea_electrolytes", "2026-10-02 09:00", {
    version: 2,
    status: "corrected",
    observations: obs(["obs.potassium", null], ["obs.sodium", null]),
  }),
  report("rpr-8", "test.rpr", "2026-09-13 09:00", {
    observations: obs(["obs.rpr_result", "non_reactive"]),
  }),
  report("rpr-8", "test.rpr", "2026-09-14 09:00", {
    version: 2,
    status: "amended",
    observations: obs(["obs.rpr_result", "reactive"]),
  }),
  // (f) an outside result is never counted
  report("hba1c-9", "test.hba1c", "2026-09-14 10:00", { performer: "external" }),
  // (h) bedside tests counted in their row, share stored
  report("rdt-10", "test.malaria_rdt", "2026-09-15 10:00", {
    observations: obs(["obs.malaria_rdt", "positive"]),
  }),
  report("rdt-11", "test.malaria_rdt", "2026-09-15 11:00", {
    observations: obs(["obs.malaria_rdt", "negative"]),
  }),
  report("rdt-12", "test.malaria_rdt", "2026-09-16 10:00", {
    bedside: true,
    observations: obs(["obs.malaria_rdt", "positive"]),
  }),
  report("rdt-13", "test.malaria_rdt", "2026-09-16 11:00", {
    bedside: true,
    observations: obs(["obs.malaria_rdt", "negative"]),
  }),
  // positives by sub-column and by a filtered source
  report("xpert-14", "test.tb_xpert", "2026-09-17 10:00", {
    observations: obs(["obs.tb_xpert_mtb", "detected_low"], ["obs.tb_xpert_rif", "detected"]),
  }),
  report("afb-15", "test.sputum_afb", "2026-09-17 11:00", {
    observations: obs(["obs.sputum_afb_stain_method", "fm"], ["obs.sputum_afb", "scanty"]),
  }),
  // 10.3 HIV by kit × purpose (HM-5)
  report("hiv-16", "test.hiv_rapid", "2026-09-18 09:00", {
    observations: obs(
      ["obs.hiv_rdt_t1", "reactive"],
      ["obs.hiv_rdt_t2", "non_reactive"],
      ["obs.hiv_rdt_t3", "reactive"],
    ),
    hiv: { assays: HIV_ALGO, outcome: "inconclusive", purpose: "hct" },
  }),
  report("hiv-17", "test.hiv_rapid", "2026-09-18 10:00", {
    observations: obs(["obs.hiv_rdt_t1", "non_reactive"]),
    hiv: { assays: HIV_ALGO, outcome: "negative", purpose: null },
  }),
];

const specimen = (
  id: string,
  patientId: string,
  specimenType: string,
  encounterType: string,
  receivedAt: string,
  o: Partial<HmisSpecimen> = {},
): HmisSpecimen => ({
  id,
  hospitalId: H1,
  patientId,
  specimenType,
  encounterType,
  receivedAt: kla(receivedAt),
  collectedHere: true,
  rejected: null,
  ...o,
});

export const SPECIMENS: HmisSpecimen[] = [
  specimen("sp-1", "P1", "venous_edta", "opd", "2026-09-10 08:00"),
  specimen("sp-2", "P1", "venous_serum", "opd", "2026-09-10 09:00"), // same patient, day, OPD, Blood: one visit
  specimen("sp-3", "P1", "venous_serum", "opd", "2026-09-11 08:00"), // next day: a new visit
  specimen("sp-4", "P2", "sputum", "inpatient", "2026-09-12 08:00"),
  specimen("sp-5", "P3", "urine_spot", "opd", "2026-09-15 08:00", {
    rejected: { at: kla("2026-09-15 08:30"), reasonCode: "insufficient" },
  }), // (d)
  specimen("sp-6", "P4", "venous_edta", "opd", "2026-09-15 09:00", {
    rejected: { at: kla("2026-09-15 09:30"), reasonCode: "clotted" },
  }), // (d)
  specimen("sp-7", "P5", "venous_serum", "emergency", "2026-09-30 23:30"), // 20:30Z: September
  specimen("sp-8", "P6", "venous_serum", "opd", "2026-10-01 00:30"), // October: not counted
  specimen("sp-9", "P7", "venous_serum", "opd", "2026-09-16 08:00", {
    rejected: { at: kla("2026-09-16 08:30"), reasonCode: "wrong_container" },
  }), // unmapped code
  specimen("sp-10", "P8", "venous_serum", "opd", "2026-09-10 08:00", { hospitalId: H2 }),
];

export const REFERRALS: Count105Input["referrals"] = [
  {
    orderId: "ord-1",
    hospitalId: H1,
    testCode: "test.hiv_viral_load",
    placedAt: kla("2026-09-08 10:00"),
    reason: "equipment_down",
  }, // (e)
  {
    orderId: "ord-2",
    hospitalId: H1,
    testCode: "test.hiv_viral_load",
    placedAt: kla("2026-09-09 10:00"),
    reason: null,
  }, // (e) before P17: Others
  {
    orderId: "ord-3",
    hospitalId: H1,
    testCode: "test.hiv_viral_load",
    placedAt: kla("2026-10-02 10:00"),
    reason: "stock_out",
  }, // October
  {
    orderId: "ord-4",
    hospitalId: H2,
    testCode: "test.hiv_viral_load",
    placedAt: kla("2026-09-08 10:00"),
    reason: "stock_out",
  },
];

export const CONTROL_CHECKS: Count105Input["controlChecks"] = [
  { hospitalId: H1, itemId: "item-determine", at: kla("2026-09-05 08:00"), hmisIqc: true }, // KQ-6
  { hospitalId: H1, itemId: "item-rdt", at: kla("2026-09-05 08:00"), hmisIqc: false }, // (c) malaria kit control: not in PS02
  { hospitalId: H2, itemId: "item-determine", at: kla("2026-09-05 08:00"), hmisIqc: true },
];

const round = (id: string, submittedOn: string, samples: EqaRound["samples"]): EqaRound => ({
  hospitalId: H1,
  id,
  schemeId: "scheme",
  receivedOn: "2026-09-01",
  dueOn: "2026-09-25",
  submittedOn,
  scoredOn: null,
  testedBy: [],
  samples,
});
export const EQA_ROUNDS: EqaRound[] = [
  round("eqa-chem", "2026-09-20", [{ sampleId: "C1", conceptId: "obs.potassium" }]), // (c) adds 0 to RP03
  round("eqa-hiv", "2026-09-21", [
    { sampleId: "H1", conceptId: "obs.hiv_rdt_t1", kit: "Determine" },
    { sampleId: "H2", conceptId: "obs.hiv_rdt_t1", kit: "Determine" },
  ]), // EA-6
];

const item = (id: string, hmisTracerCode: string, hospitalId = H1): StockItem => ({
  id,
  hospitalId,
  name: id,
  kind: "kit",
  testsPerUnit: null,
  testCodes: [],
  hmisTracerCode,
  minMonths: null,
  maxMonths: null,
});
export const STOCK_ITEMS = [
  item("item-determine", "SS07"),
  item("item-rdt", "SS11"),
  item("item-other-hospital", "SS11", H2),
];
const tx = (
  itemId: string,
  kind: StockTx["kind"],
  quantity: number,
  at: string,
  reason: string | null = null,
): StockTx => ({
  hospitalId: H1,
  itemId,
  lotId: null,
  kind,
  quantity,
  reason,
  at: kla(at),
});
export const STOCK_TXS: StockTx[] = [
  tx("item-determine", "receipt", 100, "2026-08-30 09:00"),
  tx("item-determine", "issue", -10, "2026-09-05 09:00"),
  tx("item-determine", "issue", -5, "2026-09-20 09:00"),
  tx("item-determine", "write_off", -3, "2026-09-25 09:00", "expired"),
  tx("item-determine", "issue", -2, "2026-10-01 00:30"), // October in Kampala
  tx("item-rdt", "receipt", 10, "2026-09-01 09:00"),
  tx("item-rdt", "issue", -10, "2026-09-28 10:00"),
];

export const MANUAL = {
  "VS02|No. of Specimen Referred": 2, // HM-6
  "Determine|Repeat Testers": 1, // HM-5
  "HE02|Number Done": 99, // computed: ignored
};

export const SEPTEMBER: Count105Input = {
  hospitalId: H1,
  month: "2026-09",
  timeZone: TZ,
  mapping: MAPPING,
  menu: MENU,
  reports: REPORTS,
  specimens: SPECIMENS,
  referrals: REFERRALS,
  controlChecks: CONTROL_CHECKS,
  eqaRounds: EQA_ROUNDS,
  stockItems: STOCK_ITEMS,
  stockTxs: STOCK_TXS,
  manual: MANUAL,
};
