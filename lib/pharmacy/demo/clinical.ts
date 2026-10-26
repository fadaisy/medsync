import "server-only";

import type { DemoPatient, DemoState } from "./state";
import type { EmrActor } from "@/lib/emr/actor";
import type { Pack } from "@/lib/pharmacy/clinical/content";
import type { z } from "zod";
import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";

import AWARE from "@/data/pharmacy/clinical/aware-candidates.json";
import { TEST_UUIDS } from "@/lib/clerking/impression/load";
import { asClinicalWriter } from "@/lib/emr/db";
import { withPatientWrite } from "@/lib/emr/write/context";
import { confirmCurrentMedicines, recordMedicationStatements } from "@/lib/emr/write/facts";
import { openReconciliation, recordHomeDecision } from "@/lib/emr/write/home-medicines";
import { encrypt } from "@/lib/encryption";
import { planAware } from "@/lib/pharmacy/clinical/content";
import * as reactions from "@/lib/pharmacy/clinical/reaction-store";
import { CHECKED, rowsOf, unsettled } from "@/lib/pharmacy/clinical/reconciliation";
import { factsFor, rulesFor } from "@/lib/pharmacy/clinical/reconciliation-read";
import * as recon from "@/lib/pharmacy/clinical/reconciliation-store";
import * as content from "@/lib/pharmacy/clinical/store";
import { storeNeed } from "@/lib/pharmacy/stores/write";
import { DRUGS, drugById } from "@/lib/prescribing/formulary";
import { at, bump, chiefActor, DAY, DEMO_DOSE, one, pharmacyActor, q, write } from "./state";

/**
 * Section 12: the clinical pages. Content entries for every pack (in force, one signature, draft, replaced and
 * withdrawn), signed by the demo CSO and the demo chief pharmacist through the content store; antibiotic courses on
 * inpatients with charted doses, blood cultures and prescriber reviews; suspected reaction reports in each state;
 * reconciliations at discharge in each state. Every entry's words say "Demo"; every dose is `[demo dose]`.
 */

const REVIEW = storeNeed("pharmacy.review");
const MANAGE = storeNeed("pharmacy.manage");
const DISPENSE = storeNeed("pharmacy.dispense");
const HOUR = 3_600_000;
const iso = (d: Date) => d.toISOString();
const DEMO_SOURCE = "Demo entry for the pharmacy demo hospital only. Not a reference and not signed guidance.";
const EXCEPTION = "Demo exception: the demo chief pharmacist is the only pharmacy.manage holder in this demo hospital.";
// The demo doctors in setup order, with their cadres.
const DOCTOR_CADRES = ["MEDICAL_OFFICER", "MEDICAL_OFFICER", "CONSULTANT", "MEDICAL_OFFICER", "CONSULTANT", "INTERN_DOCTOR"];
const doctorOf = (s: DemoState, p: DemoPatient) => ({
  userId: s.people.doctors[p.n % s.people.doctors.length]!,
  cadre: DOCTOR_CADRES[p.n % DOCTOR_CADRES.length]!,
});

export async function clinicalSection(s: DemoState): Promise<void> {
  await contentSection(s);
  const inpatients = s.patients.filter((p) => p.kind === "inpatient");
  const starts = new Map(
    (
      await q<{ id: string; started: Date }>(
        s,
        sql`SELECT id, started_at AS started FROM encounters
          WHERE id IN (${sql.join(inpatients.map((p) => sql`${p.enc}`), sql`, `)})`,
      )
    ).map((r) => [r.id, new Date(r.started)]),
  );
  const startOf = (p: DemoPatient) => starts.get(p.enc) ?? new Date(s.now.getTime() - 3 * DAY);
  await stewardshipSection(s, inpatients.slice(0, 12), startOf);
  await reactionsSection(s);
  // Reconciliation needs a doctor who records medicines alone: not the intern.
  await reconciliationSection(s, inpatients.slice(12).filter((p) => p.n % 6 !== 5).slice(0, 5), startOf);
}

/* ─── Clinical content ───────────────────────────────────────────────── */

/** A draft by the chief pharmacist through the content store. */
async function draft(s: DemoState, pack: Pack, key: string, payload: unknown, when: Date, source = DEMO_SOURCE) {
  bump(s, "content_entries");
  return (await write(s, chiefActor(s, null), content.DraftInput, REVIEW, content.saveDraft, { pack, key, payload, source }, when)).id;
}

/**
 * One signature through the content store, with the signer's passed second factor collected at the chief pharmacist's
 * screen, as the sign dialog does. Where no other pharmacy.manage holder exists, the exception is written in words, as
 * the store asks.
 */
async function sign(s: DemoState, entryId: string, who: "cso" | "chief", when: Date) {
  const signer = who === "cso" ? s.people.cso : s.people.chief;
  const att = await one<{ id: string }>(
    s,
    sql`INSERT INTO pharmacy_attestations (hospital_id, actor_user_id, attester_user_id, purpose, action, outcome, attested_at)
      VALUES (${s.h}, ${s.people.chief}, ${signer}, 'signer', 'sign_pack', 'passed', ${iso(when)}::timestamptz) RETURNING id`,
  );
  const raw = { entryId, role: who === "cso" ? "cso" : "pharmacy_in_charge", attestationId: att.id, exception: null as string | null };
  const go = () => write(s, chiefActor(s, null), content.SignInput, MANAGE, content.signEntry, raw, when);
  try {
    await go();
  } catch (e) {
    if (!/exception/i.test(e instanceof Error ? e.message : "")) throw e;
    raw.exception = EXCEPTION;
    await go();
  }
  bump(s, "content_signatures");
}

/** A draft signed by the demo CSO, then the demo chief pharmacist: in force. */
async function inForce(s: DemoState, pack: Pack, key: string, payload: unknown, daysAgo: number, source = DEMO_SOURCE) {
  const id = await draft(s, pack, key, payload, at(s, daysAgo, 9), source);
  await sign(s, id, "cso", at(s, daysAgo, 11));
  await sign(s, id, "chief", at(s, daysAgo, 12));
  return id;
}

/** Fills the Clinical content page (every pack) and the in-force entries the other clinical pages read. */
async function contentSection(s: DemoState) {
  // No "stop" level: the demo never blocks a prescriber.
  const levels = { contraindicated: "check", serious: "check", monitor: "note" } as const;
  await inForce(s, "alert_levels", "alert_levels", { dialog: levels, review: levels, suppressionDays: 30 }, 30);
  await inForce(s, "lookback_windows", "lookback_windows", { chartedHours: 72, suppliedDays: 30, suppliedDaysByMedicine: {} }, 30);
  // Replaced: version 1 is withdrawn when version 2 goes into force.
  await inForce(s, "check_worth_signing", "check_worth_signing", { minimum: 10 }, 28);
  await inForce(s, "check_worth_signing", "check_worth_signing", { minimum: 20 }, 9);
  await inForce(s, "review_settings", "review_settings", { intervalDays: { Access: 7, Watch: 3, Reserve: 3 }, noCultureWindowHours: 48 }, 25);
  await inForce(s, "reaction_timelines", "reaction_timelines", { seriousHours: 48, otherDays: 15 }, 25);
  await inForce(
    s,
    "reconciliation_rules",
    "reconciliation_rules",
    {
      on: [...CHECKED],
      explainReasons: [
        "Demo reason: confirmed with the patient",
        "Demo reason: confirmed with the ward team",
        "Demo reason: the prescriber is aware",
      ],
    },
    25,
  );
  // The AWaRe groups as the import plans them from the repository's candidate file, under a demo edition name.
  const aware = planAware(
    AWARE.antibiotics,
    DRUGS.map((d) => ({ id: d.id, generic: d.generic })),
    "Demo edition: AWaRe groups for the pharmacy demo, not signed guidance",
  );
  // What the signer adds by hand for the shelf's unmatched rows: "x + y" is the formulary's "x–y", and "x (iv)" is a
  // route-specific tag (key "medicine:route"). The group is the file's own; nothing is guessed.
  const norm = (n: string) => n.toLowerCase().replace(/\s*\+\s*/g, "–").trim();
  const byName = new Map(DRUGS.map((d) => [norm(d.generic), d.id]));
  const shelf = new Set(s.medicines.map((m) => m.id));
  for (const row of AWARE.antibiotics) {
    const [, name, route] = /^(.*?)(?: \((iv|oral)\))?$/.exec(row.inn)!;
    const id = byName.get(norm(name!));
    if (!id || !shelf.has(id) || !["Access", "Watch", "Reserve"].includes(row.aware)) continue;
    const k = route ? `${id}:${route}` : id;
    if (!aware.tags[id] && !aware.tags[k]) {
      aware.tags[k] = row.aware as "Access" | "Watch" | "Reserve";
      aware.unmatched = aware.unmatched.filter((u) => u !== row.inn);
    }
  }
  await inForce(s, "aware_pack", "edition", { ...aware, unmatched: aware.unmatched.slice(0, 50) }, 25, `Demo entry after: ${AWARE.source.title}`.slice(0, 1000));
  // One signature only (waits for the second), and a draft.
  const codes = await draft(s, "query_codes_added", "query_codes_added", { codes: [{ code: "demo_stock_note", words: "Demo: stock note" }] }, at(s, 6, 10));
  await sign(s, codes, "cso", at(s, 6, 11));
  await draft(s, "pcne_map", "pcne_map", { permissionRef: "Demo: no permission held", version: "demo", map: {} }, at(s, 5, 10));

  // Interaction pairs after research candidates on the shelf; the words are the demo's, never the candidate's.
  const pair = (a: string, b: string, severity: "contraindicated" | "serious" | "monitor", cand: string) => {
    const [x, y] = [a, b].sort() as [string, string];
    return {
      key: `${x}+${y}`,
      payload: {
        a: x,
        b: y,
        severity,
        effect: `Demo pair: ${drugById(x)?.generic ?? x} with ${drugById(y)?.generic ?? y}. An example entry for the demo, not a signed interaction.`,
        management: "Demo note: no management advice here. Use the hospital's signed references.",
        byDesign: false,
        restricted: [x, y].includes("dolutegravir") ? ("hiv" as const) : null,
        route: null,
      },
      source: `Demo entry after candidate ${cand} (data/pharmacy/clinical/interaction-candidates.json). Not signed guidance.`,
    };
  };
  for (const p of [pair("phenytoin", "artemether_lumefantrine", "contraindicated", "CAND-026"), pair("carbamazepine", "dolutegravir", "serious", "CAND-006")])
    await inForce(s, "interaction_pair", p.key, p.payload, 20, p.source);
  const old = pair("phenobarbital", "dolutegravir", "serious", "CAND-008");
  const withdrawn = await inForce(s, "interaction_pair", old.key, old.payload, 20, old.source);
  await write(s, chiefActor(s, null), content.WithdrawInput, MANAGE, content.withdrawEntry, { entryId: withdrawn, reason: "Demo: withdrawn to show a withdrawn entry" }, at(s, 4, 15));
  const next = pair("dolutegravir", "metformin", "monitor", "CAND-009");
  await draft(s, "interaction_pair", next.key, next.payload, at(s, 2, 10), next.source);
}

/* ─── Stewardship ───────────────────────────────────────────────────── */

const COURSES: [medicine: string, route: "oral" | "iv"][] = [
  ["ceftriaxone", "iv"],
  ["amoxicillin_clavulanic_acid", "oral"],
  ["metronidazole", "iv"],
  ["gentamicin", "iv"],
  ["meropenem", "iv"],
  ["vancomycin", "iv"],
  ["ciprofloxacin", "oral"],
  ["flucloxacillin", "oral"],
  ["azithromycin", "oral"],
  ["ceftriaxone", "iv"],
  ["amoxicillin", "oral"],
  ["doxycycline", "oral"],
];
const REVIEWS: { answer: "continue" | "change" | "switch_oral" | "stop"; reason: string | null }[] = [
  { answer: "continue", reason: null },
  { answer: "change", reason: "Demo note: changed after the review" },
  { answer: "switch_oral", reason: "Demo note: switch to the oral form" },
  { answer: "stop", reason: "Demo note: course complete" },
];

/** An owner-inserted prescription line, as the prescribing tests insert one; every dose and frequency is the demo's. */
async function prescribe(
  s: DemoState,
  p: DemoPatient,
  medicine: string,
  route: string,
  created: Date,
  state: "active" | "completed" | "cancelled" = "active",
  ended: Date = created,
) {
  const d = doctorOf(s, p);
  bump(s, "clinical_prescriptions");
  return (
    await one<{ id: string }>(
      s,
      sql`INSERT INTO prescriptions (hospital_id, encounter_id, patient_user_id, prescriber_user_id, prescriber_cadre, drug_id,
          drug_name, dose, route, frequency, is_emergency, state, created_at, updated_at, indication)
        VALUES (${s.h}, ${p.enc}, ${p.id}, ${d.userId}, ${d.cadre}, ${medicine}, ${drugById(medicine)?.generic ?? medicine},
          ${DEMO_DOSE}, ${route}, ${DEMO_DOSE}, false, ${state}, ${iso(created)}::timestamptz, ${iso(ended)}::timestamptz,
          'Demo indication') RETURNING id`,
    )
  ).id;
}

/** A charted dose on the administration record. */
async function chart(s: DemoState, p: DemoPatient, rx: string, medicine: string, route: string, when: Date, i: number) {
  bump(s, "mar_doses");
  await s.db.execute(sql`INSERT INTO medication_administration_records (hospital_id, patient_user_id, encounter_id,
      administered_by_user_id, drug_name, dose, route, state, emr_prescription_id, administered_at)
    VALUES (${s.h}, ${p.id}, ${p.enc}, ${s.people.nurses[i % s.people.nurses.length]}, ${drugById(medicine)?.generic ?? medicine},
      ${DEMO_DOSE}, ${route}, 'administered', ${rx}, ${iso(when)}::timestamptz)`);
}

/**
 * Fills Stewardship: twelve antibiotic courses on inpatients (two ended), a charted dose a day, a blood culture for
 * every other course, and four prescriber reviews (continue, change, switch to oral, stop), so some courses are due.
 */
async function stewardshipSection(s: DemoState, patients: DemoPatient[], startOf: (p: DemoPatient) => Date) {
  const bc = TEST_UUIDS["test.blood_culture"];
  const [catalogued] = bc ? await q<{ id: string }>(s, sql`SELECT id FROM test_catalogue WHERE id = ${bc}`) : [];
  if (!catalogued) s.notes["clinical.cultures"] = "No blood culture in the test catalogue: courses show no culture.";
  for (const [i, p] of patients.entries()) {
    const [medicine, route] = COURSES[i % COURSES.length]!;
    const d = doctorOf(s, p);
    const start = new Date(startOf(p).getTime() + 2 * HOUR);
    const ended = i === 10 ? "completed" : i === 11 ? "cancelled" : null;
    const end = ended ? new Date(start.getTime() + 2 * DAY) : s.now;
    const rx = await prescribe(s, p, medicine, route, start, ended ?? "active", ended ? end : start);
    for (let t = start.getTime(); t < end.getTime(); t += DAY) await chart(s, p, rx, medicine, route, new Date(t), i);
    if (catalogued && i % 2 === 0) {
      const ordered = new Date(start.getTime() - HOUR);
      const order = await one<{ id: string }>(
        s,
        sql`INSERT INTO encounter_orders (encounter_id, patient_user_id, kind, text, authored_by_user_id, lifecycle, hospital_id,
            priority, frequency, performer, intent_source, requester_cadre, effective_at, reason_text_ciphertext, test_id,
            created_at)
          VALUES (${p.enc}, ${p.id}, 'lab', 'Blood culture', ${d.userId}, 'events', ${s.h}, 'routine', 'once', 'in_house',
            'clinician', ${d.cadre}, ${iso(ordered)}::timestamptz, ${encrypt("Demo note: culture before the antibiotic")}, ${bc},
            ${iso(ordered)}::timestamptz) RETURNING id`,
      );
      await s.db.execute(sql`INSERT INTO encounter_order_events (order_id, hospital_id, patient_user_id, kind, actor_user_id,
          actor_cadre, recorded_at) VALUES (${order.id}, ${s.h}, ${p.id}, 'placed', ${d.userId}, ${d.cadre}, ${iso(ordered)}::timestamptz)`);
      bump(s, "culture_orders");
    }
    const review = REVIEWS[i];
    if (review && !ended) {
      const stopDate = new Date(s.now.getTime() + 3 * DAY).toISOString().slice(0, 10);
      await s.db.execute(sql`INSERT INTO pharmacy_ams_reviews (hospital_id, patient_user_id, prescription_id, answer, stop_date,
          reason, actor_user_id, actor_cadre, reviewed_at)
        VALUES (${s.h}, ${p.id}, ${rx}, ${review.answer}, ${review.answer === "continue" || review.answer === "stop" ? stopDate : null},
          ${review.reason}, ${d.userId}, ${d.cadre}, ${iso(new Date(s.now.getTime() - 2 * HOUR))}::timestamptz)`);
      bump(s, "ams_reviews");
    }
  }
}

/* ─── Suspected reactions ───────────────────────────────────────────── */

type ReportEvent =
  | { kind: "causality"; causality: "probable" | "possible" }
  | { kind: "submitted" }
  | { kind: "closed_not_submitted" }
  | { kind: "printed" | "copied" };
type Report = Omit<z.input<typeof reactions.RecordInput>, "clientKey" | "patientUserId" | "medicines" | "startedOn"> & {
  medicine: string | null;
  text?: string;
  daysAgo: number;
  events: ReportEvent[];
};
const REPORTS: Report[] = [
  { kind: "suspected_reaction", medicine: "amoxicillin", reactionText: "Demo note: a rash after a dose (demo report).", manifestation: "rash", seriousness: ["not_serious"], outcome: "recovered", actionTaken: "stopped_by_clinician", rechallenge: "not_given_again", reporter: "patient", daysAgo: 1, events: [] },
  { kind: "suspected_reaction", medicine: "co_trimoxazole", reactionText: "Demo note: a skin reaction that kept the patient in hospital (demo report).", manifestation: "sjs_ten", seriousness: ["hospitalisation"], outcome: "recovering", actionTaken: "stopped_by_clinician", rechallenge: "not_given_again", reporter: "staff", daysAgo: 9, events: [{ kind: "causality", causality: "probable" }, { kind: "submitted" }] },
  { kind: "suspected_reaction", medicine: "ceftriaxone", reactionText: "Demo note: hives during the infusion (demo report).", manifestation: "urticaria", seriousness: ["life_threatening"], outcome: "recovered", actionTaken: "stopped_by_clinician", rechallenge: "not_given_again", reporter: "staff", daysAgo: 5, events: [{ kind: "causality", causality: "possible" }] },
  { kind: "lack_of_effect", medicine: "artemether_lumefantrine", reactionText: "Demo note: the patient says the course did not help (demo report).", manifestation: null, seriousness: ["not_serious"], outcome: "not_recovered", actionTaken: "continued", rechallenge: "unknown", reporter: "relative", daysAgo: 12, events: [{ kind: "closed_not_submitted" }] },
  { kind: "poor_quality", medicine: "paracetamol", reactionText: "Demo note: tablets crumbled in the strip (demo report).", manifestation: null, seriousness: ["not_serious"], outcome: "unknown", actionTaken: "unknown", rechallenge: "unknown", reporter: "staff", daysAgo: 7, events: [{ kind: "submitted" }, { kind: "printed" }] },
  { kind: "medication_error", medicine: null, text: "Demo herbal mixture", reactionText: "Demo note: a mix-up at the window, caught at the counter (demo report).", manifestation: null, seriousness: ["not_serious"], outcome: "recovered", actionTaken: "unknown", rechallenge: "unknown", reporter: "staff", daysAgo: 3, events: [{ kind: "copied" }] },
];

/** Fills Reactions: six reports through the reaction store (to submit, assessed, submitted, closed) with their events. */
async function reactionsSection(s: DemoState) {
  const recorder = pharmacyActor(s, s.people.pharmacists[2] ?? s.people.chief, "PHARMACIST", "inpatient");
  const reviewer = pharmacyActor(s, s.people.pharmacists[0] ?? s.people.chief, "PHARMACIST", "opd");
  for (const [i, r] of REPORTS.entries()) {
    const p = s.patients[(i * 11 + 3) % s.patients.length]!;
    const recorded = at(s, r.daysAgo, 10);
    const shelf = r.medicine ? s.stock.get(r.medicine) : undefined;
    const stock = shelf?.get(p.point) ?? [...(shelf?.values() ?? [])][0];
    const { medicine, text, daysAgo: _, events, ...fields } = r;
    const report = await write(
      s,
      recorder,
      reactions.RecordInput,
      DISPENSE,
      reactions.recordReaction,
      {
        ...fields,
        startedOn: new Date(recorded.getTime() - DAY).toISOString().slice(0, 10),
        patientUserId: p.id,
        medicines: [
          {
            medicineId: medicine,
            name: medicine ? (drugById(medicine)?.generic ?? medicine) : text!,
            productId: stock?.productId ?? null,
            batchId: stock?.batches[0] ?? null,
            main: true,
          },
        ],
      },
      recorded,
    );
    bump(s, "reaction_reports");
    for (const [j, e] of events.entries()) {
      const when = new Date(recorded.getTime() + (j + 1) * 6 * HOUR);
      const raw =
        e.kind === "submitted"
          ? { kind: e.kind, route: "Demo route: Med Safety app (demo)", submittedOn: when.toISOString().slice(0, 10), reference: null }
          : e.kind === "closed_not_submitted"
            ? { kind: e.kind, note: "Demo note: closed after review, not for the national report." }
            : e;
      await write(s, reviewer, reactions.EventInput, REVIEW, reactions.reportEvent, { reportId: report.id, ...raw }, when);
      bump(s, "reaction_events");
    }
  }
}

/* ─── Reconciliation at discharge ──────────────────────────────────── */

const PLANS = ["open", "confirmed", "reopened", "closed", "added"] as const;

/** The demo doctor as the EMR's write path sees them. */
async function doctorActor(s: DemoState, p: DemoPatient): Promise<EmrActor> {
  const d = doctorOf(s, p);
  const aff = await one<{ id: string; dept: string | null }>(
    s,
    sql`SELECT id, department_id AS dept FROM staff_affiliations WHERE user_id = ${d.userId} AND hospital_id = ${s.h} LIMIT 1`,
  );
  return {
    userId: d.userId,
    fullName: null,
    hospitalId: s.h,
    departmentId: aff.dept,
    affiliationId: aff.id,
    cadreCode: d.cadre,
    isClinical: true,
    surface: "doctor",
  };
}

/** The ward a patient's department holds, made once (found first, so another section's ward is reused). */
async function wardFor(s: DemoState, dept: string) {
  const [found] = await q<{ id: string }>(s, sql`SELECT id FROM hospital_wards WHERE hospital_id = ${s.h} AND department_id = ${dept} LIMIT 1`);
  if (found) return found.id;
  return (
    await one<{ id: string }>(
      s,
      sql`INSERT INTO hospital_wards (hospital_id, department_id, name, slug, bed_count)
        SELECT ${s.h}, d.id, d.name, ${`demo-ward-${randomUUID().slice(0, 8)}`}, 20 FROM hospital_departments d WHERE d.id = ${dept}
        RETURNING id`,
    )
  ).id;
}

/**
 * Fills Reconciliation: five admissions, each with medicines before admission (recorded and decided through the EMR
 * write path), ward lines with a dose, medicines for home and the prescriber's decisions: one open, one confirmed, one
 * reopened by a later decision, one closed with a reason, one open with an added and an explained discrepancy.
 */
async function reconciliationSection(s: DemoState, patients: DemoPatient[], startOf: (p: DemoPatient) => Date) {
  const pharmacist = pharmacyActor(s, s.people.pharmacists[2] ?? s.people.chief, "PHARMACIST", "inpatient");
  const event = async (raw: Record<string, unknown>, when: Date) => {
    await write(s, pharmacist, recon.EventInput, REVIEW, recon.reconciliationEvent, raw, when);
    bump(s, "reconciliation_events");
  };
  for (const [k, p] of patients.entries()) {
    const plan = PLANS[k]!;
    const doctor = await doctorActor(s, p);
    const scope = { userId: doctor.userId, hospitalId: s.h };
    const arrived = startOf(p);
    const [open] = await q<{ status: string }>(
      s,
      sql`SELECT status FROM admissions WHERE patient_user_id = ${p.id} AND status IN ('awaiting_bed','bed_allocated','arrived')`,
    );
    if (open && open.status !== "arrived") continue;
    if (!open) {
      const ward = await wardFor(s, s.wards[p.ward!]);
      // As the admission tests do: a bed allocated, then the arrival as its own move (0091's guard).
      const adm = await one<{ id: string }>(
        s,
        sql`INSERT INTO admissions (hospital_id, patient_user_id, source_encounter_id, ward_id, status, decided_by, decided_at)
          VALUES (${s.h}, ${p.id}, ${p.enc}, ${ward}, 'bed_allocated', ${doctor.userId},
            ${iso(new Date(arrived.getTime() - HOUR))}::timestamptz) RETURNING id`,
      );
      await s.db.execute(sql`UPDATE admissions SET status = 'arrived', inpatient_encounter_id = ${p.enc},
          arrived_at = ${iso(arrived)}::timestamptz, arrived_by = ${s.people.nurses[0]} WHERE id = ${adm.id}`);
      bump(s, "admissions");
    }

    // Medicines before admission, as the clerking desk records them, then the admission decisions.
    const recorded = await withPatientWrite(
      doctor,
      p.id,
      (ctx) =>
        recordMedicationStatements(ctx, {
          patientUserId: p.id,
          encounterId: p.enc,
          clientKey: randomUUID(),
          statements: [
            { drugCode: "amlodipine", medicationStatus: "active", medicationSource: "patient_reported", route: "oral", informant: "patient" },
            { drugCode: "metformin", medicationStatus: "active", medicationSource: "patient_reported", route: "oral", ...(k === 1 ? {} : { informant: "carer" as const }) },
            { drugCode: "aspirin", medicationStatus: "active", medicationSource: "external_record", route: "oral", informant: "medicine_card" },
            ...(k === 0
              ? [{ drugText: "Demo herbal remedy", productKind: "herbal_traditional" as const, medicationStatus: "active" as const, medicationSource: "patient_reported" as const, informant: "patient" as const }]
              : []),
          ],
        }),
      { database: s.db, now: new Date(arrived.getTime() + HOUR) },
    );
    const [aml, met, asp] = recorded.ids as [string, string, string];
    await withPatientWrite(
      doctor,
      p.id,
      (ctx) =>
        confirmCurrentMedicines(ctx, {
          patientUserId: p.id,
          encounterId: p.enc,
          clientKey: randomUUID(),
          items: [
            { id: aml, reconciliation: "continued" },
            { id: met, reconciliation: "held", reasonText: "Demo note: held on the ward" },
            { id: asp, reconciliation: "stopped", reasonText: "Demo note: stopped on admission" },
          ],
        }),
      { database: s.db, now: new Date(arrived.getTime() + 2 * HOUR) },
    );
    bump(s, "medication_statements", recorded.ids.length);

    // Ward lines: paracetamol charted today, omeprazole cancelled.
    const wardAt = new Date(arrived.getTime() + 3 * HOUR);
    const para = await prescribe(s, p, "paracetamol", "oral", wardAt);
    await chart(s, p, para, "paracetamol", "oral", new Date(s.now.getTime() - 8 * HOUR), k);
    await prescribe(s, p, "omeprazole", "oral", wardAt, "cancelled", new Date(wardAt.getTime() + DAY));

    // "Prepare medicines for home", the lines for home, and the decisions.
    const opened = new Date(s.now.getTime() - 6 * HOUR);
    const rec = await asClinicalWriter(
      scope,
      (tx) => openReconciliation(tx, { clientKey: randomUUID(), patientUserId: p.id, hospitalId: s.h, actorUserId: doctor.userId, now: opened }),
      s.db,
    );
    bump(s, "reconciliations");
    const homeAt = new Date(opened.getTime() + HOUR);
    await prescribe(s, p, "amlodipine", "oral", homeAt);
    await prescribe(s, p, "paracetamol", "oral", homeAt);
    if (plan === "reopened") await prescribe(s, p, "omeprazole", "oral", homeAt);
    const decide = async (rowKey: string, decision: "continue" | "changed" | "stay_stopped" | "paused" | "ends_on_ward", reason: string | null, when: Date) => {
      await asClinicalWriter(
        scope,
        (tx) =>
          recordHomeDecision(tx, {
            clientKey: randomUUID(),
            reconciliationId: rec.id,
            rowKey,
            decision,
            reason,
            hospitalId: s.h,
            actorUserId: doctor.userId,
            actorCadre: doctor.cadreCode,
            now: when,
          }),
        s.db,
      );
      bump(s, "home_decisions");
    };

    const decidedAt = new Date(opened.getTime() + 2 * HOUR);
    const rules = await rulesFor(s.db, s.h);
    if (plan === "open") await decide("amlodipine", "continue", null, decidedAt);
    if (plan === "added") {
      await event({ reconciliationId: rec.id, kind: "added", reason: "not_recorded", note: "Demo note: the patient mentions an inhaler not on the list." }, decidedAt);
      const f = await factsFor(s.db, s.h, rec.id, decidedAt);
      const first = f ? unsettled(f.facts, rules.on)[0] : undefined;
      if (first) await event({ reconciliationId: rec.id, kind: "explained", discrepancy: first.id, reason: rules.explainReasons[0] }, decidedAt);
      continue;
    }
    if (plan === "open") continue;
    // Every row decided (closed: all but the last), each discrepancy still standing explained, then confirmed.
    const f = (await factsFor(s.db, s.h, rec.id, decidedAt))!;
    const rows = rowsOf(f.facts).filter((r) => !r.decision);
    for (const r of plan === "closed" ? rows.slice(0, -1) : rows) {
      if (r.home.length) await decide(r.key, "continue", null, decidedAt);
      else if (r.before?.admission === "stopped") await decide(r.key, "stay_stopped", "Demo note: stays stopped", decidedAt);
      else if (r.before) await decide(r.key, "paused", "Demo note: paused until the clinic review", decidedAt);
      else await decide(r.key, "ends_on_ward", null, decidedAt);
    }
    const confirmAt = new Date(decidedAt.getTime() + HOUR);
    if (plan === "closed") {
      await event({ reconciliationId: rec.id, kind: "closed", reason: "confirmed_by_phone", note: "Demo note: the list was confirmed with the ward by phone." }, confirmAt);
      continue;
    }
    const after = (await factsFor(s.db, s.h, rec.id, confirmAt))!;
    for (const d of unsettled(after.facts, rules.on))
      await event({ reconciliationId: rec.id, kind: "explained", discrepancy: d.id, reason: rules.explainReasons[k % rules.explainReasons.length] }, confirmAt);
    await event({ reconciliationId: rec.id, kind: "confirmed" }, confirmAt);
    await event({ reconciliationId: rec.id, kind: "printed" }, new Date(confirmAt.getTime() + 10 * 60_000));
    // MR-5: a decision after the confirmation reopens its row.
    if (plan === "reopened") await decide("paracetamol", "changed", "Demo note: changed after the confirmation", new Date(confirmAt.getTime() + HOUR));
  }
}
