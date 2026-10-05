/**
 * Golden dataset (§6): hand-authored patients for reporting month 2026-09 (asOf 2026-09-30).
 * Every expectation in expected.ts was derived by walking this list by hand.
 * Groups: H = hypertension only, D = diabetes only, B = both, A/K = core modules (asthma, CKD),
 * X = events (death, transfer, withdrawal), R/L = recall and lost to follow-up.
 */
import type { GPatient } from "./types";

export const PATIENTS: GPatient[] = [
  // ---------------------------------------------------------------- hypertension only
  {
    id: "H01", // latest recent visit 139/89 → in range (boundary)
    sex: "male",
    dateOfBirth: "1960-03-14",
    phone: true,
    registrations: [{ condition: "hypertension", date: "2024-05-10" }],
    visits: [
      { date: "2025-11-12", bp: [[150, 95]], medicines: ["amlodipine"], next: "2026-02-12" },
      { date: "2026-02-12", bp: [[138, 86]], medicines: ["amlodipine"], next: "2026-05-12" },
      { date: "2026-05-14", bp: [[136, 84]], medicines: ["amlodipine"], next: "2026-08-14" },
      { date: "2026-08-14", bp: [[139, 89]], medicines: ["amlodipine"], next: "2026-11-14" },
    ],
    reviews: [{ component: "kidney", date: "2026-03-01", creatinineUmol: 90, acr: 2.0 }],
  },
  {
    id: "H02", // Sept visit 140/85 → not in range (boundary)
    sex: "female",
    dateOfBirth: "1955-07-02",
    phone: true,
    registrations: [{ condition: "hypertension", date: "2023-01-20" }],
    visits: [
      { date: "2026-03-05", bp: [[130, 80]], medicines: ["amlodipine"], next: "2026-06-05" },
      { date: "2026-06-05", bp: [[135, 85]], medicines: ["amlodipine"], next: "2026-09-05" },
      {
        date: "2026-09-07",
        bp: [[140, 85]],
        weightKg: 70,
        medicines: ["amlodipine", "losartan"],
        next: "2026-12-07",
      },
    ],
  },
  {
    id: "H03", // mean of [141,89],[138,86] = 139.5/87.5 → 140/88 → not in range
    sex: "male",
    dateOfBirth: "1970-11-30",
    phone: true,
    registrations: [{ condition: "hypertension", date: "2025-02-01" }],
    visits: [
      { date: "2026-01-20", bp: [[150, 92]], medicines: ["amlodipine"], next: "2026-07-20" },
      {
        date: "2026-07-20",
        bp: [
          [141, 89],
          [138, 86],
        ],
        medicines: ["amlodipine"],
        next: "2026-10-20",
      },
    ],
  },
  {
    id: "H04", // under care, no visit in the past 3 months
    sex: "female",
    dateOfBirth: "1965-04-22",
    phone: true,
    registrations: [{ condition: "hypertension", date: "2025-06-15" }],
    visits: [
      { date: "2025-12-01", bp: [[145, 92]], medicines: ["amlodipine"], next: "2026-03-01" },
      { date: "2026-03-02", bp: [[150, 100]], medicines: ["amlodipine"], next: "2026-09-02" },
    ],
  },
  {
    id: "H05", // latest recent visit has no BP → not recorded (earlier visit had one)
    sex: "male",
    dateOfBirth: "1958-09-09",
    phone: true,
    registrations: [{ condition: "hypertension", date: "2022-08-08" }],
    visits: [
      { date: "2026-05-20", bp: [[120, 70]], medicines: ["enalapril"], next: "2026-08-20" },
      { date: "2026-08-20", weightKg: 78, medicines: ["enalapril"], next: "2026-11-20" },
    ],
  },
  {
    id: "H06", // registered inside the 3-month window (2026-08-10)
    sex: "female",
    dateOfBirth: "1980-01-01",
    phone: true,
    registrations: [{ condition: "hypertension", date: "2026-08-10" }],
    visits: [
      { date: "2026-08-10", bp: [[160, 100]], medicines: ["amlodipine"], next: "2026-09-10" },
      {
        date: "2026-09-10",
        bp: [[135, 85]],
        weightKg: 80,
        medicines: ["amlodipine"],
        next: "2026-12-10",
      },
    ],
  },
  {
    id: "H07", // registered in September
    sex: "male",
    dateOfBirth: "1962-05-05",
    phone: true,
    registrations: [{ condition: "hypertension", date: "2026-09-03" }],
    visits: [
      {
        date: "2026-09-03",
        bp: [[150, 92]],
        weightKg: 75,
        medicines: ["amlodipine"],
        next: "2026-10-03",
      },
    ],
  },
  {
    id: "H08", // cohort edge: registered 2026-03-31 (2026-Q1)
    sex: "female",
    dateOfBirth: "1975-12-12",
    phone: true,
    registrations: [{ condition: "hypertension", date: "2026-03-31" }],
    visits: [
      { date: "2026-03-31", bp: [[160, 100]], medicines: ["amlodipine"], next: "2026-04-30" },
      { date: "2026-05-02", bp: [[150, 90]], medicines: ["amlodipine"], next: "2026-06-02" },
      { date: "2026-06-02", bp: [[138, 88]], medicines: ["amlodipine"], next: "2026-09-02" },
      {
        date: "2026-09-04",
        bp: [[128, 78]],
        weightKg: 66,
        medicines: ["amlodipine"],
        next: "2026-12-04",
      },
    ],
  },
  {
    id: "H09", // cohort edge: registered 2026-04-01 (2026-Q2)
    sex: "male",
    dateOfBirth: "1968-02-20",
    phone: true,
    registrations: [{ condition: "hypertension", date: "2026-04-01" }],
    visits: [
      { date: "2026-04-01", bp: [[170, 105]], medicines: ["amlodipine"], next: "2026-05-01" },
      { date: "2026-05-01", bp: [[150, 95]], medicines: ["amlodipine"], next: "2026-07-01" },
      { date: "2026-07-01", bp: [[142, 88]], medicines: ["amlodipine"], next: "2026-08-01" },
      {
        date: "2026-08-03",
        bp: [[145, 92]],
        medicines: ["amlodipine", "losartan"],
        next: "2026-10-03",
      },
    ],
  },
  {
    id: "H10", // cohort edge: registered 2025-09-30 (2025-Q3); Q4 outcome visit 2025-12-31
    sex: "female",
    dateOfBirth: "1952-10-10",
    phone: true,
    registrations: [{ condition: "hypertension", date: "2025-09-30" }],
    visits: [
      { date: "2025-09-30", bp: [[160, 95]], medicines: ["amlodipine"], next: "2025-10-30" },
      { date: "2025-12-31", bp: [[130, 85]], medicines: ["amlodipine"], next: "2026-03-31" },
      { date: "2026-03-31", bp: [[136, 82]], medicines: ["amlodipine"], next: "2026-06-30" },
      { date: "2026-07-02", bp: [[132, 80]], medicines: ["amlodipine"], next: "2026-10-02" },
    ],
  },
  {
    id: "H11", // cohort edge: registered 2025-10-01 (2025-Q4); Q1 outcome a refill visit, no BP; latest 139/90
    sex: "male",
    dateOfBirth: "1959-06-06",
    phone: true,
    registrations: [{ condition: "hypertension", date: "2025-10-01" }],
    visits: [
      { date: "2025-10-01", bp: [[150, 95]], medicines: ["amlodipine"], next: "2025-11-01" },
      { date: "2025-11-03", bp: [[148, 94]], medicines: ["amlodipine"], next: "2026-01-03" },
      { date: "2026-01-05", type: "refill_only", medicines: ["amlodipine"], next: "2026-04-05" },
      { date: "2026-04-06", bp: [[138, 88]], medicines: ["amlodipine"], next: "2026-07-06" },
      { date: "2026-07-07", bp: [[139, 90]], medicines: ["amlodipine"], next: "2026-10-07" },
    ],
  },
  {
    id: "H12", // 2025-Q3 cohort with no Q4 visit; pregnancy event
    sex: "female",
    dateOfBirth: "1985-08-25",
    phone: true,
    registrations: [{ condition: "hypertension", date: "2025-08-15" }],
    visits: [
      { date: "2025-08-15", bp: [[150, 95]], medicines: ["methyldopa"], next: "2025-09-15" },
      { date: "2025-09-15", bp: [[145, 92]], medicines: ["methyldopa"], next: "2026-01-15" },
      { date: "2026-01-20", bp: [[130, 80]], medicines: ["methyldopa"], next: "2026-04-20" },
      { date: "2026-04-20", bp: [[128, 82]], medicines: ["methyldopa"], next: "2026-07-20" },
      { date: "2026-07-21", bp: [[125, 80]], medicines: ["methyldopa"], next: "2026-10-21" },
    ],
    events: [{ type: "pregnancy", date: "2026-02-10" }],
  },
  {
    id: "H13", // lost to follow-up: last visit 2025-03-10
    sex: "male",
    dateOfBirth: "1949-01-15",
    phone: true,
    registrations: [{ condition: "hypertension", date: "2024-01-10" }],
    visits: [
      { date: "2025-03-10", bp: [[150, 90]], medicines: ["amlodipine"], next: "2025-06-10" },
    ],
  },
  {
    id: "H14", // registered 2026-01-15, never visited: not under care, never LTFU
    sex: "female",
    dateOfBirth: "1990-04-04",
    phone: true,
    registrations: [{ condition: "hypertension", date: "2026-01-15" }],
  },
  {
    id: "H15", // known CVD (stroke) → complications
    sex: "male",
    dateOfBirth: "1966-12-01",
    phone: true,
    registrations: [{ condition: "hypertension", date: "2025-05-05" }],
    knownCvd: ["stroke"],
    visits: [
      { date: "2026-02-01", bp: [[150, 95]], medicines: ["amlodipine"], next: "2026-05-01" },
      { date: "2026-05-01", bp: [[145, 90]], medicines: ["amlodipine"], next: "2026-08-01" },
      {
        date: "2026-08-01",
        bp: [[142, 85]],
        medicines: ["amlodipine", "atorvastatin"],
        next: "2026-11-01",
      },
    ],
  },
  {
    id: "H16", // 2025-Q4 cohort; Q1 outcome not in range
    sex: "female",
    dateOfBirth: "1972-07-07",
    phone: true,
    registrations: [{ condition: "hypertension", date: "2025-11-20" }],
    visits: [
      { date: "2025-11-20", bp: [[155, 95]], medicines: ["amlodipine"], next: "2026-02-20" },
      { date: "2026-02-20", bp: [[150, 94]], medicines: ["amlodipine"], next: "2026-05-20" },
      { date: "2026-05-20", bp: [[135, 85]], medicines: ["amlodipine"], next: "2026-08-20" },
      { date: "2026-08-20", bp: [[131, 79]], medicines: ["amlodipine"], next: "2026-11-20" },
    ],
  },
  {
    id: "H17", // historical (back-entered) September visit
    sex: "male",
    dateOfBirth: "1967-07-17",
    phone: true,
    registrations: [{ condition: "hypertension", date: "2025-04-04" }],
    visits: [
      { date: "2026-06-17", bp: [[138, 80]], medicines: ["amlodipine"], next: "2026-09-17" },
      {
        date: "2026-09-17",
        historical: true,
        bp: [[134, 80]],
        weightKg: 70,
        medicines: ["amlodipine"],
        next: "2026-12-17",
      },
    ],
  },

  // ---------------------------------------------------------------- diabetes only
  {
    id: "D01", // HbA1c 6.8 in window → in range; all reviews done; statin
    sex: "male",
    dateOfBirth: "1964-02-02",
    phone: true,
    registrations: [{ condition: "diabetes", date: "2023-06-01", subtype: "type_2" }],
    visits: [
      {
        date: "2026-04-10",
        glucose: { value: 7.5, type: "fasting" },
        medicines: ["metformin"],
        next: "2026-07-10",
      },
      {
        date: "2026-07-10",
        bp: [[128, 78]],
        weightKg: 80,
        glucose: { value: 6.9, type: "fasting" },
        hba1c: { percent: 6.8, resultDate: "2026-07-05" },
        medicines: ["metformin", "atorvastatin"],
        next: "2026-10-10",
      },
    ],
    reviews: [
      { component: "kidney", date: "2026-03-15", creatinineUmol: 80, acr: 1.5 },
      {
        component: "eyes",
        date: "2026-03-15",
        examined: true,
        grade: "no_apparent_retinopathy",
        macularOedema: "absent",
      },
      {
        component: "feet",
        date: "2026-03-15",
        lops: false,
        absentPulses: false,
        deformity: false,
        amputation: "none",
      },
      { component: "lipids", date: "2026-03-15", total: 5.2, ldl: 3.1 },
    ],
  },
  {
    id: "D02", // fasting 7.0 → moderately raised (boundary); BP 140/80; old moderate NPDR
    sex: "female",
    dateOfBirth: "1958-05-05",
    phone: true,
    registrations: [{ condition: "diabetes", date: "2024-02-02" }],
    visits: [
      {
        date: "2026-06-01",
        glucose: { value: 8.0, type: "fasting" },
        medicines: ["metformin"],
        next: "2026-09-01",
      },
      {
        date: "2026-09-02",
        bp: [[140, 80]],
        weightKg: 72,
        glucose: { value: 7.0, type: "fasting" },
        medicines: ["metformin", "glibenclamide"],
        next: "2026-12-02",
      },
    ],
    reviews: [{ component: "eyes", date: "2025-06-01", examined: true, grade: "moderate_npdr" }],
  },
  {
    id: "D03", // fasting 11.0 → moderately raised (boundary); eyes not examined
    sex: "male",
    dateOfBirth: "1970-08-08",
    phone: true,
    registrations: [{ condition: "diabetes", date: "2025-01-01" }],
    visits: [
      {
        date: "2026-02-01",
        glucose: { value: 9.0, type: "fasting" },
        medicines: ["metformin"],
        next: "2026-05-01",
      },
      {
        date: "2026-05-01",
        glucose: { value: 10.0, type: "fasting" },
        medicines: ["metformin"],
        next: "2026-08-01",
      },
      {
        date: "2026-08-01",
        bp: [[135, 85]],
        glucose: { value: 11.0, type: "fasting" },
        medicines: ["metformin"],
        next: "2026-11-01",
      },
    ],
    reviews: [{ component: "eyes", date: "2026-05-01", examined: false }],
  },
  {
    id: "D04", // fasting 11.1 → very raised (boundary); kidney review outside the year (ACR A2)
    sex: "female",
    dateOfBirth: "1962-03-03",
    phone: true,
    registrations: [{ condition: "diabetes", date: "2024-09-09" }],
    visits: [
      {
        date: "2026-04-15",
        glucose: { value: 9.0, type: "fasting" },
        medicines: ["metformin"],
        next: "2026-07-15",
      },
      {
        date: "2026-07-15",
        bp: [[150, 90]],
        glucose: { value: 11.1, type: "fasting" },
        medicines: ["metformin", "simvastatin"],
        next: "2026-10-15",
      },
    ],
    reviews: [{ component: "kidney", date: "2025-08-01", creatinineUmol: 85, acr: 4 }],
  },
  {
    id: "D05", // random only → not classifiable; HbA1c dated 2026-06-20 (outside 3 months) ignored
    sex: "male",
    dateOfBirth: "1975-10-10",
    phone: true,
    registrations: [{ condition: "diabetes", date: "2025-03-03" }],
    visits: [
      {
        date: "2026-05-05",
        glucose: { value: 8.0, type: "fasting" },
        medicines: ["metformin"],
        next: "2026-08-05",
      },
      {
        date: "2026-08-05",
        bp: [[130, 80]],
        glucose: { value: 12.5, type: "random" },
        hba1c: { percent: 8.2, resultDate: "2026-06-20" },
        medicines: ["metformin"],
        next: "2026-11-05",
      },
    ],
    reviews: [
      {
        component: "feet",
        date: "2026-05-05",
        lops: false,
        absentPulses: false,
        currentUlcer: true,
        amputation: "none",
      },
    ],
  },
  {
    id: "D06", // HbA1c 6.5 in window overrides fasting 12; medicines not applicable
    sex: "female",
    dateOfBirth: "1968-11-11",
    phone: true,
    registrations: [{ condition: "diabetes", date: "2024-04-04" }],
    visits: [
      {
        date: "2026-06-08",
        glucose: { value: 8.0, type: "fasting" },
        medicines: ["metformin"],
        next: "2026-09-08",
      },
      {
        date: "2026-09-08",
        bp: [[125, 75]],
        weightKg: 65,
        glucose: { value: 12.0, type: "fasting" },
        hba1c: { percent: 6.5, resultDate: "2026-09-01" },
        medicines: ["metformin", "atorvastatin"],
        obtained: "not_applicable",
        next: "2026-12-08",
      },
    ],
    reviews: [
      {
        component: "feet",
        date: "2026-04-04",
        lops: true,
        absentPulses: false,
        deformity: false,
        amputation: "none",
      },
    ],
  },
  {
    id: "D07", // latest visit has no glucose → not recorded; minor amputation on feet review
    sex: "male",
    dateOfBirth: "1980-06-06",
    phone: true,
    registrations: [{ condition: "diabetes", date: "2025-05-05" }],
    visits: [
      {
        date: "2026-04-25",
        glucose: { value: 7.5, type: "fasting" },
        medicines: ["metformin"],
        next: "2026-07-25",
      },
      { date: "2026-07-25", bp: [[130, 82]], medicines: ["metformin"], next: "2026-10-25" },
    ],
    reviews: [
      {
        component: "feet",
        date: "2026-02-02",
        lops: false,
        absentPulses: false,
        amputation: "minor",
      },
    ],
  },
  {
    id: "D08", // type 1, aged < 40; HbA1c 9.0 → very raised (boundary); late-entered Sept visit
    sex: "female",
    dateOfBirth: "1995-01-20",
    phone: true,
    registrations: [{ condition: "diabetes", date: "2024-07-07", subtype: "type_1" }],
    visits: [
      {
        date: "2026-06-15",
        glucose: { value: 6.0, type: "fasting" },
        medicines: ["soluble_insulin", "isophane_insulin"],
        next: "2026-09-15",
      },
      {
        date: "2026-09-15",
        enteredOn: "2026-09-18",
        bp: [[110, 70]],
        weightKg: 55,
        glucose: { value: 5.5, type: "fasting" },
        hba1c: { percent: 9.0, resultDate: "2026-09-10" },
        medicines: ["soluble_insulin", "isophane_insulin"],
        next: "2026-12-15",
      },
    ],
  },
  {
    id: "D09", // 2025-Q4 cohort, Q1 HbA1c 7.0 overrides later fasting 6.5; macular oedema
    sex: "male",
    dateOfBirth: "1955-12-25",
    phone: true,
    registrations: [{ condition: "diabetes", date: "2025-12-10" }],
    visits: [
      {
        date: "2025-12-10",
        glucose: { value: 12.0, type: "fasting" },
        medicines: ["metformin"],
        next: "2026-01-10",
      },
      {
        date: "2026-01-12",
        glucose: { value: 9.0, type: "fasting" },
        hba1c: { percent: 7.0, resultDate: "2026-01-12" },
        medicines: ["metformin"],
        next: "2026-03-12",
      },
      {
        date: "2026-03-12",
        glucose: { value: 6.5, type: "fasting" },
        medicines: ["metformin"],
        next: "2026-06-12",
      },
      {
        date: "2026-06-12",
        glucose: { value: 7.2, type: "fasting" },
        medicines: ["metformin"],
        next: "2026-09-12",
      },
      {
        date: "2026-09-14",
        bp: [[132, 84]],
        weightKg: 90,
        glucose: { value: 6.0, type: "fasting" },
        medicines: ["metformin"],
        next: "2026-12-14",
      },
    ],
    reviews: [
      {
        component: "eyes",
        date: "2026-02-02",
        examined: true,
        grade: "no_apparent_retinopathy",
        macularOedema: "present",
      },
    ],
  },
  {
    id: "D10", // 2026-Q1 cohort, Q2 outcome post-meal only; no visit in past 3 months
    sex: "female",
    dateOfBirth: "1982-02-14",
    phone: true,
    registrations: [{ condition: "diabetes", date: "2026-02-20" }],
    visits: [
      {
        date: "2026-02-20",
        glucose: { value: 10.0, type: "fasting" },
        medicines: ["metformin"],
        next: "2026-04-20",
      },
      {
        date: "2026-04-21",
        glucose: { value: 8.0, type: "fasting" },
        medicines: ["metformin"],
        next: "2026-06-21",
      },
      {
        date: "2026-06-22",
        glucose: { value: 9.5, type: "post_meal" },
        medicines: ["metformin"],
        next: "2026-09-22",
      },
    ],
  },
  {
    id: "D11", // 2026-Q2 cohort in range; BP 129/79; creatinine and dipstick on two reviews
    sex: "male",
    dateOfBirth: "1960-09-30",
    phone: true,
    registrations: [{ condition: "diabetes", date: "2026-05-15" }],
    visits: [
      {
        date: "2026-05-15",
        glucose: { value: 14.0, type: "fasting" },
        medicines: ["metformin"],
        next: "2026-06-15",
      },
      {
        date: "2026-06-15",
        glucose: { value: 10.0, type: "fasting" },
        medicines: ["metformin"],
        next: "2026-08-15",
      },
      {
        date: "2026-08-17",
        bp: [[129, 79]],
        glucose: { value: 6.2, type: "fasting" },
        medicines: ["metformin", "rosuvastatin"],
        next: "2026-11-17",
      },
    ],
    reviews: [
      { component: "kidney", date: "2026-06-15", creatinineUmol: 70 },
      { component: "kidney", date: "2026-08-17", dipstick: "trace" },
    ],
  },
  {
    id: "D12", // lost to follow-up: last visit 2025-05-05
    sex: "female",
    dateOfBirth: "1950-07-07",
    phone: true,
    registrations: [{ condition: "diabetes", date: "2024-03-03" }],
    visits: [
      {
        date: "2025-05-05",
        glucose: { value: 9.0, type: "fasting" },
        medicines: ["metformin"],
        next: "2025-08-05",
      },
    ],
  },
  {
    id: "D13", // registered in September; Sept visit lacks glucose (incomplete)
    sex: "male",
    dateOfBirth: "1978-03-03",
    phone: true,
    registrations: [{ condition: "diabetes", date: "2026-09-20" }],
    visits: [
      {
        date: "2026-09-20",
        bp: [[140, 90]],
        weightKg: 85,
        medicines: ["metformin"],
        next: "2026-10-20",
      },
    ],
  },
  {
    id: "D14", // 2025-Q3 cohort (registered 2025-07-01); eyes ungradable
    sex: "female",
    dateOfBirth: "1966-06-16",
    phone: true,
    registrations: [{ condition: "diabetes", date: "2025-07-01" }],
    visits: [
      {
        date: "2025-07-01",
        glucose: { value: 11.0, type: "fasting" },
        medicines: ["metformin"],
        next: "2025-10-01",
      },
      {
        date: "2025-10-01",
        glucose: { value: 7.8, type: "fasting" },
        medicines: ["metformin"],
        next: "2026-01-05",
      },
      {
        date: "2026-01-05",
        glucose: { value: 7.0, type: "fasting" },
        medicines: ["metformin"],
        next: "2026-04-05",
      },
      {
        date: "2026-04-06",
        glucose: { value: 6.5, type: "fasting" },
        medicines: ["metformin"],
        next: "2026-07-06",
      },
      {
        date: "2026-07-06",
        bp: [[118, 76]],
        glucose: { value: 6.8, type: "fasting" },
        medicines: ["metformin"],
        next: "2026-10-06",
      },
    ],
    reviews: [{ component: "eyes", date: "2026-03-03", examined: true, grade: "ungradable" }],
  },
  {
    id: "D15", // 2026-Q1 cohort with no Q2 visit; fasting 7.2 in July
    sex: "female",
    dateOfBirth: "1976-06-06",
    phone: true,
    registrations: [{ condition: "diabetes", date: "2026-01-30" }],
    visits: [
      {
        date: "2026-01-30",
        glucose: { value: 9.0, type: "fasting" },
        medicines: ["metformin"],
        next: "2026-07-30",
      },
      {
        date: "2026-07-30",
        bp: [[134, 86]],
        glucose: { value: 7.2, type: "fasting" },
        medicines: ["metformin"],
        next: "2026-10-30",
      },
    ],
  },
  {
    id: "D16", // 2026-Q2 cohort; Q3 visit without glucose → not recorded
    sex: "male",
    dateOfBirth: "1984-04-14",
    phone: true,
    registrations: [{ condition: "diabetes", date: "2026-04-30" }],
    visits: [
      {
        date: "2026-04-30",
        glucose: { value: 12.0, type: "fasting" },
        medicines: ["metformin"],
        next: "2026-07-30",
      },
      { date: "2026-07-31", bp: [[130, 85]], medicines: ["metformin"], next: "2026-10-31" },
    ],
  },

  // ---------------------------------------------------------------- diabetes and hypertension
  {
    id: "B01", // both, in range, no complications; creatinine + dipstick on one review
    sex: "male",
    dateOfBirth: "1957-04-04",
    phone: true,
    registrations: [
      { condition: "hypertension", date: "2020-01-01" },
      { condition: "diabetes", date: "2022-02-02" },
    ],
    visits: [
      {
        date: "2026-06-10",
        bp: [[140, 90]],
        glucose: { value: 8.0, type: "fasting" },
        medicines: ["metformin", "amlodipine"],
        next: "2026-09-10",
      },
      {
        date: "2026-09-10",
        bp: [[138, 88]],
        weightKg: 88,
        glucose: { value: 6.0, type: "fasting" },
        medicines: ["metformin", "amlodipine", "atorvastatin"],
        next: "2026-12-10",
      },
    ],
    reviews: [
      { component: "kidney", date: "2026-01-10", creatinineUmol: 95, dipstick: "negative" },
      { component: "eyes", date: "2026-01-10", examined: true, grade: "no_apparent_retinopathy" },
      {
        component: "feet",
        date: "2026-01-10",
        lops: false,
        absentPulses: false,
        amputation: "none",
      },
    ],
  },
  {
    id: "B02", // both, HbA1c 9.5 → very raised; eGFR < 60, ACR A3; feet risk 2
    sex: "female",
    dateOfBirth: "1963-08-08",
    phone: true,
    registrations: [
      { condition: "hypertension", date: "2023-03-03" },
      { condition: "diabetes", date: "2023-03-03" },
    ],
    visits: [
      {
        date: "2026-05-08",
        bp: [[145, 90]],
        glucose: { value: 9.0, type: "fasting" },
        medicines: ["metformin", "losartan"],
        next: "2026-08-08",
      },
      {
        date: "2026-08-08",
        bp: [[150, 95]],
        glucose: { value: 9.5, type: "fasting" },
        hba1c: { percent: 9.5, resultDate: "2026-08-01" },
        medicines: ["metformin", "losartan", "atorvastatin"],
        next: "2026-11-08",
      },
    ],
    reviews: [
      { component: "kidney", date: "2026-02-02", creatinineUmol: 130, acr: 35 },
      {
        component: "feet",
        date: "2026-03-01",
        lops: true,
        absentPulses: false,
        deformity: true,
        amputation: "none",
      },
      { component: "eyes", date: "2026-03-01", examined: true, grade: "mild_npdr" },
    ],
  },
  {
    id: "B03", // both + CKD; dialysis start; G5 then feet review → risk 3
    sex: "male",
    dateOfBirth: "1952-01-01",
    phone: true,
    registrations: [
      { condition: "hypertension", date: "2021-05-05" },
      { condition: "diabetes", date: "2021-05-05" },
      { condition: "chronic_kidney_disease", date: "2025-06-06", subtype: "unknown" },
    ],
    visits: [
      {
        date: "2026-04-04",
        bp: [[145, 85]],
        glucose: { value: 7.5, type: "fasting" },
        control: { chronic_kidney_disease: "partly_controlled" },
        medicines: ["metformin", "amlodipine"],
        next: "2026-07-04",
      },
      {
        date: "2026-07-06",
        bp: [[135, 80]],
        glucose: { value: 6.8, type: "fasting" },
        control: { chronic_kidney_disease: "controlled" },
        medicines: ["metformin", "amlodipine", "simvastatin"],
        next: "2026-10-06",
      },
    ],
    reviews: [
      { component: "kidney", date: "2026-04-20", creatinineUmol: 600, acr: 150 },
      {
        component: "feet",
        date: "2026-06-01",
        lops: true,
        absentPulses: false,
        deformity: false,
        amputation: "none",
      },
    ],
    events: [{ type: "dialysis_start", date: "2026-05-01" }],
  },
  {
    id: "B04", // both registered 2026-07-15 (inside window); Sept partial supply, stock out
    sex: "female",
    dateOfBirth: "1970-10-10",
    phone: true,
    registrations: [
      { condition: "hypertension", date: "2026-07-15" },
      { condition: "diabetes", date: "2026-07-15" },
    ],
    visits: [
      {
        date: "2026-07-15",
        bp: [[150, 95]],
        glucose: { value: 9.0, type: "fasting" },
        medicines: ["metformin", "enalapril"],
        next: "2026-08-15",
      },
      {
        date: "2026-08-15",
        bp: [[135, 85]],
        glucose: { value: 6.5, type: "fasting" },
        medicines: ["metformin", "enalapril"],
        next: "2026-09-15",
      },
      {
        date: "2026-09-16",
        bp: [[128, 78]],
        weightKg: 77,
        glucose: { value: 6.4, type: "fasting" },
        medicines: ["metformin", "enalapril"],
        obtained: "partial",
        notObtainedReason: "stock_out",
        next: "2026-12-16",
      },
    ],
  },
  {
    id: "B05", // DM 2025-Q3 cohort in range; admission hypertensive emergency (not a complication)
    sex: "male",
    dateOfBirth: "1961-11-11",
    phone: true,
    registrations: [
      { condition: "hypertension", date: "2024-06-06" },
      { condition: "diabetes", date: "2025-08-20" },
    ],
    visits: [
      {
        date: "2025-08-20",
        bp: [[150, 90]],
        glucose: { value: 10.0, type: "fasting" },
        medicines: ["metformin", "amlodipine"],
        next: "2025-11-20",
      },
      {
        date: "2025-11-20",
        bp: [[138, 85]],
        glucose: { value: 6.9, type: "fasting" },
        medicines: ["metformin", "amlodipine"],
        next: "2026-02-20",
      },
      {
        date: "2026-02-20",
        bp: [[140, 88]],
        medicines: ["metformin", "amlodipine"],
        next: "2026-05-20",
      },
      {
        date: "2026-05-21",
        bp: [[150, 95]],
        medicines: ["metformin", "amlodipine"],
        next: "2026-08-21",
      },
      {
        date: "2026-08-21",
        bp: [[160, 100]],
        glucose: { value: 9.0, type: "random" },
        medicines: ["metformin", "amlodipine"],
        next: "2026-11-21",
      },
    ],
    events: [{ type: "admission", date: "2026-06-10", admissionReason: "hypertensive_emergency" }],
  },
  {
    id: "B06", // died 2026-08-30; DKA admission before death
    sex: "female",
    dateOfBirth: "1956-02-02",
    phone: true,
    registrations: [
      { condition: "hypertension", date: "2022-02-02" },
      { condition: "diabetes", date: "2022-02-02" },
    ],
    visits: [
      {
        date: "2026-05-05",
        bp: [[140, 85]],
        glucose: { value: 8.0, type: "fasting" },
        medicines: ["metformin", "amlodipine"],
        next: "2026-08-05",
      },
      {
        date: "2026-08-05",
        bp: [[135, 85]],
        glucose: { value: 7.5, type: "fasting" },
        medicines: ["metformin", "amlodipine"],
        next: "2026-11-05",
      },
    ],
    reviews: [{ component: "kidney", date: "2026-04-01", creatinineUmol: 110, acr: 10 }],
    events: [
      { type: "admission", date: "2026-08-25", admissionReason: "diabetic_ketoacidosis" },
      { type: "death", date: "2026-08-30" },
    ],
  },
  {
    id: "B07", // transferred out by visit disposition 2026-07-10, back with a visit 2026-09-12
    sex: "male",
    dateOfBirth: "1974-04-14",
    phone: true,
    registrations: [
      { condition: "hypertension", date: "2025-02-02" },
      { condition: "diabetes", date: "2025-02-02" },
    ],
    visits: [
      {
        date: "2026-04-10",
        bp: [[140, 95]],
        glucose: { value: 8.0, type: "fasting" },
        medicines: ["metformin", "amlodipine"],
        next: "2026-07-10",
      },
      {
        date: "2026-07-10",
        bp: [[150, 95]],
        glucose: { value: 9.0, type: "fasting" },
        medicines: ["metformin", "amlodipine"],
        disposition: "transfer_out",
      },
      {
        date: "2026-09-12",
        bp: [[132, 82]],
        weightKg: 92,
        glucose: { value: 7.6, type: "fasting" },
        medicines: ["metformin", "amlodipine"],
        next: "2026-12-12",
      },
    ],
  },
  {
    id: "B08", // aged < 40 with diabetes; HTN 2026-Q2 cohort (registered 2026-06-30)
    sex: "female",
    dateOfBirth: "1988-09-09",
    phone: true,
    registrations: [
      { condition: "diabetes", date: "2025-04-04" },
      { condition: "hypertension", date: "2026-06-30" },
    ],
    visits: [
      {
        date: "2025-10-04",
        glucose: { value: 8.0, type: "fasting" },
        medicines: ["metformin"],
        next: "2026-01-04",
      },
      {
        date: "2026-01-05",
        glucose: { value: 7.5, type: "fasting" },
        medicines: ["metformin"],
        next: "2026-04-05",
      },
      {
        date: "2026-04-05",
        glucose: { value: 7.0, type: "fasting" },
        medicines: ["metformin"],
        next: "2026-06-30",
      },
      {
        date: "2026-06-30",
        bp: [[145, 92]],
        glucose: { value: 8.5, type: "fasting" },
        medicines: ["metformin", "nifedipine"],
        next: "2026-08-30",
      },
      {
        date: "2026-08-31",
        bp: [[128, 76]],
        glucose: { value: 6.0, type: "fasting" },
        medicines: ["metformin", "nifedipine"],
        next: "2026-11-30",
      },
    ],
  },

  // ---------------------------------------------------------------- core modules
  {
    id: "A01", // asthma only, controlled; acute asthma admission
    sex: "female",
    dateOfBirth: "1990-02-02",
    phone: true,
    registrations: [{ condition: "asthma", date: "2024-05-05", subtype: "unknown" }],
    visits: [
      {
        date: "2026-03-03",
        control: { asthma: "partly_controlled" },
        medicines: ["other"],
        next: "2026-06-03",
      },
      {
        date: "2026-06-03",
        control: { asthma: "not_controlled" },
        medicines: ["other"],
        next: "2026-08-03",
      },
      {
        date: "2026-08-04",
        weightKg: 60,
        control: { asthma: "controlled" },
        medicines: ["other"],
        next: "2026-11-04",
      },
    ],
    events: [{ type: "admission", date: "2026-05-15", admissionReason: "acute_asthma" }],
  },
  {
    id: "A02", // asthma only, latest control not assessed
    sex: "male",
    dateOfBirth: "1985-05-05",
    phone: true,
    registrations: [{ condition: "asthma", date: "2025-03-03", subtype: "unknown" }],
    visits: [
      {
        date: "2026-04-04",
        control: { asthma: "controlled" },
        medicines: ["other"],
        next: "2026-07-04",
      },
      {
        date: "2026-07-06",
        control: { asthma: "not_assessed" },
        medicines: ["other"],
        next: "2026-10-06",
      },
    ],
  },
  {
    id: "A03", // asthma only, no visit in the past 3 months
    sex: "female",
    dateOfBirth: "1979-09-09",
    phone: true,
    registrations: [{ condition: "asthma", date: "2025-01-01", subtype: "unknown" }],
    visits: [
      {
        date: "2026-01-10",
        control: { asthma: "partly_controlled" },
        medicines: ["other"],
        next: "2026-04-10",
      },
      {
        date: "2026-04-10",
        control: { asthma: "controlled" },
        medicines: ["other"],
        next: "2026-10-10",
      },
    ],
  },
  {
    id: "A04", // hypertension + asthma
    sex: "male",
    dateOfBirth: "1969-03-03",
    phone: true,
    registrations: [
      { condition: "hypertension", date: "2024-04-04" },
      { condition: "asthma", date: "2024-04-04", subtype: "unknown" },
    ],
    visits: [
      {
        date: "2026-06-06",
        bp: [[150, 90]],
        control: { asthma: "controlled" },
        medicines: ["amlodipine", "other"],
        next: "2026-09-06",
      },
      {
        date: "2026-09-07",
        bp: [[130, 85]],
        weightKg: 82,
        control: { asthma: "partly_controlled" },
        medicines: ["amlodipine", "other"],
        next: "2026-12-07",
      },
    ],
  },
  {
    id: "A05", // asthma registered in September; Sept visit without BP (incomplete)
    sex: "female",
    dateOfBirth: "1960-12-12",
    phone: true,
    registrations: [{ condition: "asthma", date: "2026-09-05", subtype: "unknown" }],
    visits: [
      {
        date: "2026-09-05",
        weightKg: 70,
        control: { asthma: "not_controlled" },
        medicines: ["other"],
        next: "2026-10-05",
      },
    ],
  },
  {
    id: "K01", // CKD only; latest recent visit refill-only → control not recorded
    sex: "male",
    dateOfBirth: "1958-08-18",
    phone: true,
    registrations: [
      { condition: "chronic_kidney_disease", date: "2023-03-03", subtype: "unknown" },
    ],
    visits: [
      {
        date: "2026-02-02",
        control: { chronic_kidney_disease: "controlled" },
        medicines: ["losartan"],
        next: "2026-05-02",
      },
      {
        date: "2026-05-04",
        control: { chronic_kidney_disease: "partly_controlled" },
        medicines: ["losartan"],
        next: "2026-08-04",
      },
      { date: "2026-08-04", type: "refill_only", medicines: ["losartan"], next: "2026-11-04" },
    ],
    reviews: [{ component: "kidney", date: "2026-05-04", creatinineUmol: 180, acr: 50 }],
  },
  {
    id: "K02", // hypertension + CKD; HTN 2025-Q3 cohort; Sept nothing obtained (cost)
    sex: "female",
    dateOfBirth: "1965-01-25",
    phone: true,
    registrations: [
      { condition: "hypertension", date: "2025-09-09" },
      { condition: "chronic_kidney_disease", date: "2025-09-09", subtype: "unknown" },
    ],
    visits: [
      {
        date: "2025-09-09",
        bp: [[160, 100]],
        control: { chronic_kidney_disease: "not_assessed" },
        medicines: ["losartan"],
        next: "2025-12-09",
      },
      {
        date: "2025-12-10",
        bp: [[138, 82]],
        control: { chronic_kidney_disease: "partly_controlled" },
        medicines: ["losartan"],
        next: "2026-03-10",
      },
      {
        date: "2026-03-10",
        bp: [[142, 90]],
        control: { chronic_kidney_disease: "controlled" },
        medicines: ["losartan"],
        next: "2026-06-10",
      },
      {
        date: "2026-06-10",
        bp: [[136, 86]],
        control: { chronic_kidney_disease: "controlled" },
        medicines: ["losartan"],
        next: "2026-09-10",
      },
      {
        date: "2026-09-11",
        bp: [[150, 95]],
        weightKg: 68,
        control: { chronic_kidney_disease: "not_controlled" },
        medicines: ["losartan", "amlodipine"],
        obtained: "none",
        notObtainedReason: "cost",
        next: "2026-10-11",
      },
    ],
    reviews: [{ component: "kidney", date: "2026-06-10", creatinineUmol: 140 }],
  },
  {
    id: "K03", // CKD only, no visit in the past 3 months; dipstick-only kidney review
    sex: "male",
    dateOfBirth: "1972-07-27",
    phone: true,
    registrations: [
      { condition: "chronic_kidney_disease", date: "2024-10-10", subtype: "unknown" },
    ],
    visits: [
      {
        date: "2025-12-12",
        control: { chronic_kidney_disease: "partly_controlled" },
        medicines: ["enalapril"],
        next: "2026-06-12",
      },
      {
        date: "2026-06-12",
        control: { chronic_kidney_disease: "controlled" },
        medicines: ["enalapril"],
        next: "2026-12-12",
      },
    ],
    reviews: [{ component: "kidney", date: "2026-06-12", dipstick: "2+" }],
  },
  {
    id: "K04", // asthma + CKD; withdrew 2026-08-15
    sex: "female",
    dateOfBirth: "1983-03-13",
    phone: true,
    registrations: [
      { condition: "asthma", date: "2025-11-11", subtype: "unknown" },
      { condition: "chronic_kidney_disease", date: "2026-01-20", subtype: "unknown" },
    ],
    visits: [
      {
        date: "2025-11-11",
        control: { asthma: "controlled" },
        medicines: ["other"],
        next: "2026-01-20",
      },
      {
        date: "2026-01-20",
        control: { asthma: "controlled", chronic_kidney_disease: "not_assessed" },
        medicines: ["other"],
        next: "2026-04-20",
      },
      {
        date: "2026-04-20",
        control: { asthma: "partly_controlled", chronic_kidney_disease: "controlled" },
        medicines: ["other"],
        next: "2026-07-20",
      },
      {
        date: "2026-07-20",
        control: { asthma: "partly_controlled", chronic_kidney_disease: "partly_controlled" },
        medicines: ["other"],
        next: "2026-10-20",
      },
    ],
    events: [{ type: "withdrawal", date: "2026-08-15" }],
  },

  // ---------------------------------------------------------------- events
  {
    id: "X01", // Sept visit without weight; stroke admission; died 2026-09-20
    sex: "male",
    dateOfBirth: "1950-05-05",
    phone: true,
    registrations: [{ condition: "hypertension", date: "2020-01-01" }],
    visits: [
      { date: "2026-06-20", bp: [[150, 90]], medicines: ["amlodipine"], next: "2026-09-20" },
      { date: "2026-09-05", bp: [[140, 90]], medicines: ["amlodipine"], next: "2026-10-05" },
    ],
    events: [
      { type: "admission", date: "2026-09-18", admissionReason: "stroke" },
      { type: "stroke", date: "2026-09-18" },
      { type: "death", date: "2026-09-20" },
    ],
  },
  {
    id: "X02", // withdrew 2026-09-25
    sex: "female",
    dateOfBirth: "1967-06-30",
    phone: true,
    registrations: [{ condition: "hypertension", date: "2023-05-05" }],
    visits: [
      { date: "2026-05-25", bp: [[135, 85]], medicines: ["amlodipine"], next: "2026-08-25" },
      { date: "2026-08-25", bp: [[130, 80]], medicines: ["amlodipine"], next: "2026-11-25" },
    ],
    events: [{ type: "withdrawal", date: "2026-09-25" }],
  },
  {
    id: "X03", // transfer-out event 2026-08-10, no later visit
    sex: "male",
    dateOfBirth: "1973-01-31",
    phone: true,
    registrations: [{ condition: "diabetes", date: "2024-12-12" }],
    visits: [
      {
        date: "2026-02-10",
        glucose: { value: 8.0, type: "fasting" },
        medicines: ["metformin"],
        next: "2026-05-10",
      },
      {
        date: "2026-05-10",
        glucose: { value: 7.0, type: "fasting" },
        medicines: ["metformin"],
        next: "2026-08-10",
      },
    ],
    events: [{ type: "transfer_out", date: "2026-08-10" }],
  },
  {
    id: "X04", // both 2025-Q4 cohorts; heart-failure admission; died 2026-02-15
    sex: "female",
    dateOfBirth: "1959-04-29",
    phone: true,
    registrations: [
      { condition: "hypertension", date: "2025-10-15" },
      { condition: "diabetes", date: "2025-10-15" },
    ],
    visits: [
      {
        date: "2025-10-15",
        bp: [[150, 90]],
        glucose: { value: 10.0, type: "fasting" },
        medicines: ["metformin", "amlodipine"],
        next: "2026-01-15",
      },
      {
        date: "2026-01-15",
        bp: [[135, 85]],
        glucose: { value: 6.5, type: "fasting" },
        hba1c: { percent: 7.5, resultDate: "2026-01-10" },
        medicines: ["metformin", "amlodipine"],
        next: "2026-04-15",
      },
    ],
    events: [
      { type: "admission", date: "2026-02-10", admissionReason: "heart_failure" },
      { type: "death", date: "2026-02-15" },
    ],
  },
  {
    id: "X05", // foot ulcer, foot-sepsis admission, major amputation; feet risk 3
    sex: "male",
    dateOfBirth: "1945-02-02",
    phone: true,
    registrations: [
      { condition: "diabetes", date: "2019-09-09" },
      { condition: "hypertension", date: "2019-09-09" },
    ],
    visits: [
      {
        date: "2026-04-01",
        bp: [[135, 80]],
        glucose: { value: 6.0, type: "fasting" },
        medicines: ["metformin", "enalapril"],
        next: "2026-07-01",
      },
      {
        date: "2026-07-02",
        bp: [[128, 78]],
        glucose: { value: 7.0, type: "random" },
        medicines: ["metformin", "enalapril", "atorvastatin"],
        next: "2026-10-02",
      },
    ],
    reviews: [
      {
        component: "feet",
        date: "2026-04-01",
        lops: true,
        absentPulses: true,
        previousUlcer: true,
        amputation: "major",
      },
    ],
    events: [
      { type: "foot_ulcer_new", date: "2026-01-15" },
      { type: "admission", date: "2026-01-20", admissionReason: "foot_sepsis" },
      { type: "amputation_major", date: "2026-03-03" },
    ],
  },

  // ---------------------------------------------------------------- recall and lost to follow-up
  {
    id: "R01", // overdue; called 09-03 will return; visited 09-10 (within 15 days)
    sex: "female",
    dateOfBirth: "1964-01-01",
    phone: true,
    registrations: [{ condition: "hypertension", date: "2023-02-02" }],
    visits: [
      { date: "2026-03-10", bp: [[140, 85]], medicines: ["amlodipine"], next: "2026-06-10" },
      { date: "2026-06-10", bp: [[145, 92]], medicines: ["amlodipine"], next: "2026-07-10" },
      {
        date: "2026-09-10",
        bp: [[135, 85]],
        weightKg: 74,
        medicines: ["amlodipine"],
        next: "2026-12-10",
      },
    ],
    calls: [{ date: "2026-09-03", outcome: "will_return", newDate: "2026-09-10" }],
  },
  {
    id: "R02", // overdue; called 09-05 no answer and 09-12 call later; visited 09-25 (after 15 days); partial, other
    sex: "male",
    dateOfBirth: "1971-02-02",
    phone: true,
    registrations: [{ condition: "hypertension", date: "2024-02-02" }],
    visits: [
      { date: "2026-02-15", bp: [[150, 95]], medicines: ["amlodipine"], next: "2026-05-15" },
      { date: "2026-05-15", bp: [[148, 92]], medicines: ["amlodipine"], next: "2026-06-15" },
      {
        date: "2026-09-25",
        bp: [[142, 88]],
        weightKg: 80,
        medicines: ["amlodipine", "losartan"],
        obtained: "partial",
        notObtainedReason: "other",
        next: "2026-12-25",
      },
    ],
    calls: [
      { date: "2026-09-05", outcome: "no_answer" },
      { date: "2026-09-12", outcome: "call_later" },
    ],
  },
  {
    id: "R03", // overdue, no phone
    sex: "female",
    dateOfBirth: "1968-03-03",
    phone: false,
    registrations: [{ condition: "diabetes", date: "2024-03-03" }],
    visits: [
      {
        date: "2026-03-20",
        glucose: { value: 8.0, type: "fasting" },
        medicines: ["metformin"],
        next: "2026-04-20",
      },
      {
        date: "2026-05-01",
        glucose: { value: 7.5, type: "fasting" },
        medicines: ["metformin"],
        next: "2026-06-01",
      },
    ],
  },
  {
    id: "R04", // overdue, declined in August → off the recall list
    sex: "male",
    dateOfBirth: "1953-04-04",
    phone: true,
    registrations: [{ condition: "hypertension", date: "2022-04-04" }],
    visits: [
      { date: "2026-04-04", bp: [[150, 90]], medicines: ["amlodipine"], next: "2026-07-04" },
    ],
    calls: [{ date: "2026-08-20", outcome: "declined" }],
  },
  {
    id: "R05", // overdue, wrong number in August → no valid phone
    sex: "female",
    dateOfBirth: "1977-05-05",
    phone: true,
    registrations: [{ condition: "hypertension", date: "2025-05-05" }],
    visits: [
      { date: "2026-05-05", bp: [[130, 80]], medicines: ["amlodipine"], next: "2026-08-05" },
    ],
    calls: [{ date: "2026-08-15", outcome: "wrong_number" }],
  },
  {
    id: "R06", // overdue, never called
    sex: "male",
    dateOfBirth: "1962-06-06",
    phone: true,
    registrations: [{ condition: "hypertension", date: "2023-06-06" }],
    visits: [
      { date: "2026-01-06", bp: [[150, 90]], medicines: ["amlodipine"], next: "2026-04-06" },
      { date: "2026-04-07", bp: [[138, 85]], medicines: ["amlodipine"], next: "2026-07-07" },
    ],
  },
  {
    id: "R07", // overdue; declined on 09-02 (after the 1st, still counted)
    sex: "female",
    dateOfBirth: "1955-07-07",
    phone: true,
    registrations: [{ condition: "hypertension", date: "2021-07-07" }],
    visits: [
      { date: "2026-05-07", bp: [[145, 90]], medicines: ["amlodipine"], next: "2026-08-07" },
    ],
    calls: [{ date: "2026-09-02", outcome: "declined" }],
  },
  {
    id: "R08", // overdue; call 09-10 reports death; death event 09-10
    sex: "male",
    dateOfBirth: "1948-08-08",
    phone: true,
    registrations: [{ condition: "diabetes", date: "2020-08-08" }],
    visits: [
      {
        date: "2026-04-08",
        glucose: { value: 9.0, type: "fasting" },
        medicines: ["metformin"],
        next: "2026-07-08",
      },
    ],
    calls: [{ date: "2026-09-10", outcome: "died" }],
    events: [{ type: "death", date: "2026-09-10" }],
  },
  {
    id: "R09", // overdue; call 09-08 moved; transfer-out event 09-08
    sex: "female",
    dateOfBirth: "1981-09-09",
    phone: true,
    registrations: [{ condition: "hypertension", date: "2024-09-09" }],
    visits: [
      { date: "2026-04-09", bp: [[135, 85]], medicines: ["amlodipine"], next: "2026-07-09" },
    ],
    calls: [{ date: "2026-09-08", outcome: "moved_or_transferred" }],
    events: [{ type: "transfer_out", date: "2026-09-08" }],
  },
  {
    id: "R10", // appointment 08-10 missed, but an August call reset it to 09-05 → not overdue on 09-01
    sex: "male",
    dateOfBirth: "1966-10-10",
    phone: true,
    registrations: [{ condition: "hypertension", date: "2023-10-10" }],
    visits: [
      { date: "2026-07-10", bp: [[138, 84]], medicines: ["amlodipine"], next: "2026-08-10" },
      {
        date: "2026-09-06",
        bp: [[136, 84]],
        weightKg: 77,
        medicines: ["amlodipine"],
        next: "2026-12-06",
      },
    ],
    calls: [{ date: "2026-08-20", outcome: "will_return", newDate: "2026-09-05" }],
  },
  {
    id: "R11", // appointment 2026-08-31 missed → overdue on 09-01 (boundary)
    sex: "female",
    dateOfBirth: "1974-11-11",
    phone: true,
    registrations: [{ condition: "hypertension", date: "2024-11-11" }],
    visits: [
      { date: "2026-05-31", bp: [[132, 82]], medicines: ["amlodipine"], next: "2026-08-31" },
    ],
  },
  {
    id: "R12", // appointment 2026-09-01 → not overdue on 09-01 (boundary)
    sex: "male",
    dateOfBirth: "1960-12-01",
    phone: true,
    registrations: [{ condition: "hypertension", date: "2023-12-01" }],
    visits: [
      { date: "2026-06-01", bp: [[140, 90]], medicines: ["amlodipine"], next: "2026-09-01" },
    ],
  },
  {
    id: "R13", // overdue, came back 09-15 without a call
    sex: "female",
    dateOfBirth: "1958-01-13",
    phone: true,
    registrations: [{ condition: "hypertension", date: "2024-01-13" }],
    visits: [
      { date: "2026-03-15", bp: [[145, 95]], medicines: ["amlodipine"], next: "2026-06-15" },
      {
        date: "2026-09-15",
        bp: [[150, 95]],
        weightKg: 81,
        medicines: ["amlodipine"],
        next: "2026-12-15",
      },
    ],
  },
  {
    id: "L02", // last visit 2025-09-15: under care on 08-31 and overdue, LTFU by 09-30
    sex: "male",
    dateOfBirth: "1963-03-23",
    phone: true,
    registrations: [{ condition: "hypertension", date: "2024-03-03" }],
    visits: [
      { date: "2025-03-03", bp: [[150, 95]], medicines: ["amlodipine"], next: "2025-09-15" },
      { date: "2025-09-15", bp: [[150, 90]], medicines: ["amlodipine"], next: "2025-10-15" },
    ],
  },
];
