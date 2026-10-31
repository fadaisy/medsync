import "server-only";

import type { DemoMedicine, DemoPatient, DemoState, PointKey } from "./state";
import type { EmrActor } from "@/lib/emr/actor";
import type { PharmacyActor } from "@/lib/pharmacy/write";
import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";

import { DRAFT_KEEP_REASONS, DRAFT_NOT_SUPPLIED_REASONS, DRAFT_QUERY_TYPES } from "@/content/pharmacy-prescriber";
import { RX_CHECKS } from "@/content/pharmacy-rework-daily";
import { COUNSELLING_POINTS, IDENTITY_ROUTES } from "@/content/pharmacy-supply";
import { encrypt } from "@/lib/encryption";
import { withPatientWrite } from "@/lib/emr/write/context";
import { answerQuery } from "@/lib/emr/write/pharmacy-answers";
import { rxFlags } from "@/lib/pharmacy/derive/checks";
import { PRINT_LOG_NEED, PrintLogInput, printDispensingLog } from "@/lib/pharmacy/print/log-read";
import * as review from "@/lib/pharmacy/review/store";
import { AnswerCheckInput, answerCheck } from "@/lib/pharmacy/rx-checks-store";
import { localDate } from "@/lib/pharmacy/stock/ledger";
import * as supply from "@/lib/pharmacy/supply/store";
import { DEFAULT_TIME_ZONE, startOfLocalDay } from "@/supabase/functions/_shared/slots";
import { at, bump, chiefActor, DEMO_DOSE, one, pharmacyActor, q, signSet, write } from "./state";
import { shelfAt } from "./stock";

/**
 * Section 4 (and the Interventions page): the dispensing day at every point, busiest at the main outpatient and
 * inpatient pharmacies. Prescriptions are owner inserts (as the prescriber's dialog leaves them, the tests' `place()`);
 * every pharmacy step goes through its real store (`write`), and the prescriber's answers through `answerQuery`.
 * Today: every queue stage, open lines, hand-overs with labels, a reversal. The past week: hand-overs, dispensing-log
 * prints, a supply recorded in error. The past month: queries answered keep, changed or stopped, withdrawn, open.
 */

/** What this section made, for later sections or a test to pick up (this module only; DemoState is unchanged). */
export const dispensingMade = { handovers: [] as string[], slips: [] as string[], queries: [] as string[] };

const MIN = 60_000;
const ROUTE: Record<DemoMedicine["unit"], string> = {
  tablet: "oral",
  capsule: "oral",
  sachet: "oral",
  bottle: "oral",
  inhaler: "inhaled",
  vial: "IV",
  ampoule: "IM",
  bag: "IV",
  tube: "topical",
  pen: "SC",
};
/** Issue quantities only: never a strength or a dose. */
const QTY: Record<DemoMedicine["unit"], number[]> = {
  tablet: [14, 21, 28, 30],
  capsule: [14, 21, 15],
  sachet: [6, 10],
  bottle: [1],
  inhaler: [1],
  vial: [2, 3, 4],
  ampoule: [3, 4, 6],
  bag: [2, 3],
  tube: [1],
  pen: [1, 2],
};
const HIGH_RISK = ["insulin_soluble", "insulin_isophane", "heparin_unfractionated", "enoxaparin", "potassium_chloride", "magnesium_sulfate"];
const QUERY_TYPES = ["dose", "allergy", "duplicate", "renal", "not_available", "other"] as const;
/** The prescriber's stored check answers that put a line pharmacist-first under the signed rule. */
const CHECK = {
  stop: { code: "allergy", answer: "not_allergic", outcome: "stop" },
  child: { code: "child", answer: "aware_monitor", outcome: "check" },
  renal: { code: "kidney", answer: "result_awaited", outcome: "check" },
} as const;
type Flag = keyof typeof CHECK | "high_risk" | "controlled";

type Rx = { ids: string[]; meds: DemoMedicine[]; p: DemoPatient; point: PointKey; pf: boolean };

export async function dispensingSection(s: DemoState): Promise<void> {
  const keys = Object.keys(s.points) as PointKey[];
  const P = s.people;
  const tech = (k: PointKey) => pharmacyActor(s, P.techs[keys.indexOf(k)]!, "PHARMACY_TECH", k);
  // NCD and private have no pharmacist of their own: the chief pharmacist reviews there.
  const pharm = (k: PointKey): PharmacyActor =>
    keys.indexOf(k) < P.pharmacists.length ? pharmacyActor(s, P.pharmacists[keys.indexOf(k)]!, "PHARMACIST", k) : chiefActor(s, k);
  const dayStart = startOfLocalDay(s.now, DEFAULT_TIME_ZONE).getTime();
  /** A time today, as a fraction of the day so far (never in the future, whenever the demo is loaded). */
  const today = (f: number) => new Date(dayStart + f * (s.now.getTime() - dayStart));
  const plus = (d: Date, min: number) => new Date(Math.min(d.getTime() + min * MIN, s.now.getTime()));

  /* ─── The packs the queue, the hand-over and the prescriber's answers read ─── */
  const items = (o: Record<string, string>) => ({ items: Object.entries(o).map(([code, words]) => ({ code, words })) });
  await signSet(s, "lane_rule", {
    reasons: [
      { code: "overridden_stop", on: true },
      { code: "high_risk", on: true },
      { code: "child_check", on: true },
      { code: "renal_check", on: true },
      { code: "preset_dose_changed", on: true },
      { code: "typed_dose", on: false },
    ],
  });
  await signSet(
    s,
    "high_risk_list",
    Object.fromEntries(HIGH_RISK.filter((id) => s.medicines.some((m) => m.id === id)).map((id) => [id, "Demo high-risk entry"])),
  );
  await signSet(s, "controlled_classes", Object.fromEntries(s.medicines.filter((m) => m.controlled).map((m) => [m.id, "Demo controlled class"])));
  await signSet(s, "identity_routes", items(IDENTITY_ROUTES));
  await signSet(s, "counselling_points", items(COUNSELLING_POINTS));
  await signSet(s, "keep_reasons", { items: DRAFT_KEEP_REASONS });
  await signSet(s, "query_codes", { items: DRAFT_QUERY_TYPES });
  await signSet(s, "outcome_reasons", { items: DRAFT_NOT_SUPPLIED_REASONS });

  /* ─── Prescribers ─── */
  const docs = await q<{ userId: string; affiliationId: string; departmentId: string; cadre: string }>(
    s,
    sql`SELECT a.user_id AS "userId", a.id AS "affiliationId", a.department_id AS "departmentId", c.code AS cadre
      FROM staff_affiliations a JOIN cadres c ON c.id = a.cadre_id
      WHERE a.hospital_id = ${s.h} AND a.user_id IN (${sql.join(P.doctors.map((d) => sql`${d}::uuid`), sql`, `)})`,
  );
  /** The patient's visit is with this doctor (setup), who writes and answers for them. */
  const doctorOf = (p: DemoPatient) => docs.find((d) => d.userId === P.doctors[p.n % P.doctors.length])!;
  const mayAnswer = (p: DemoPatient) => doctorOf(p).cadre === "MEDICAL_OFFICER";
  const isIntern = (p: DemoPatient) => doctorOf(p).cadre === "INTERN_DOCTOR";
  const notIntern = (p: DemoPatient) => !isIntern(p);
  const mo = docs.find((d) => d.cadre === "MEDICAL_OFFICER")!;

  /* ─── Choosing patients and medicines ─── */
  let seq = 0;
  const cursor = new Map<PointKey, number>();
  /** The point's patients in turn, skipping those `ok` refuses. */
  const pick = (k: PointKey, ok: (p: DemoPatient) => boolean = notIntern) => {
    const pool = s.patients.filter((p) => p.point === k);
    for (let t = 0; t < pool.length; t++) {
      const i = cursor.get(k) ?? 0;
      cursor.set(k, i + 1);
      if (ok(pool[i % pool.length]!)) return pool[i % pool.length]!;
    }
    throw new Error(`No demo patient fits at ${k}.`);
  };
  /** n medicines from the point's shelf: none controlled or high-risk unless named, never the window's stock-out. */
  const meds = (p: DemoPatient, n: number, o: { only?: string[]; units?: DemoMedicine["unit"][] } = {}) => {
    const shelf = shelfAt(p.point, s.medicines).filter((m) =>
      o.only
        ? o.only.includes(m.id)
        : !m.controlled &&
          !HIGH_RISK.includes(m.id) &&
          !(p.point === "opd" && m.id === "artemether_lumefantrine") &&
          (!o.units || o.units.includes(m.unit)),
    );
    if (!shelf.length) throw new Error(`Nothing on the demo shelf at ${p.point} for this line.`);
    const out: DemoMedicine[] = [];
    for (let i = 0; out.length < Math.min(n, shelf.length); i++) {
      const m = shelf[(seq * 7 + i * 3) % shelf.length]!;
      if (!out.includes(m)) out.push(m);
    }
    seq += 1;
    return out;
  };
  const qty = (m: DemoMedicine, i = seq) => QTY[m.unit][i % QTY[m.unit].length]!;

  /** One placement, as the prescriber's dialog writes it (owner insert, as the tests' `place()`). */
  const prescribe = async (p: DemoPatient, list: DemoMedicine[], when: Date, flags: (Flag | null)[] = [], clientKey?: string): Promise<Rx> => {
    const placement = randomUUID();
    const d = doctorOf(p);
    const ids: string[] = [];
    for (const [i, m] of list.entries()) {
      const f = flags[i] ?? null;
      const answers = f && f in CHECK ? [CHECK[f as keyof typeof CHECK]] : [];
      const row = await one<{ id: string }>(
        s,
        sql`INSERT INTO prescriptions (hospital_id, encounter_id, patient_user_id, prescriber_user_id, prescriber_cadre,
            drug_id, drug_name, dose, route, frequency, is_emergency, state, placement_id, placement_line, created_at,
            updated_at, check_answers, controlled, edits, confirm_reason_ciphertext, client_key)
          VALUES (${s.h}, ${p.enc}, ${p.id}, ${d.userId}, ${d.cadre}, ${m.id}, ${m.name}, ${DEMO_DOSE}, ${ROUTE[m.unit]},
            ${DEMO_DOSE}, false, 'active', ${placement}, ${i + 1}, ${when.toISOString()}::timestamptz,
            ${when.toISOString()}::timestamptz, ${JSON.stringify(answers)}::jsonb, ${m.controlled}, '[]'::jsonb,
            ${answers.length ? encrypt("Demo: the prescriber's reason, as typed.") : null},
            ${clientKey ?? `pharmacy-demo-${randomUUID()}`}) RETURNING id`,
      );
      ids.push(row.id);
    }
    // The intern's prescriptions wait for a senior's co-signature (setup's policy lets only medical officers stand alone).
    if (isIntern(p))
      for (const id of ids)
        await s.db.execute(sql`INSERT INTO clinical_cosign_requests (hospital_id, patient_user_id, requested_by_user_id,
            requested_by_affiliation_id, requested_by_cadre_code, action_kind, action_payload, state)
          VALUES (${s.h}, ${p.id}, ${d.userId}, ${d.affiliationId}, ${d.cadre}, 'prescription_routine',
            ${JSON.stringify({ prescriptionId: id, encounterId: p.enc })}::jsonb, 'pending_review')`);
    bump(s, "prescription_lines", ids.length);
    bump(s, "prescriptions");
    return { ids, meds: list, p, point: p.point, pf: flags.some(Boolean) };
  };

  /* ─── The pharmacy's steps, each through its store ─── */
  const accept = async (rx: Rx, when: Date) => {
    if (rx.pf)
      for (const lineId of rx.ids) await write(s, pharm(rx.point), review.LineInput, review.REVIEW_NEED, review.acceptLine, { lineId }, when);
  };
  /** Ready: one decision per line (the store proposes the first to expire); `part` leaves the rest of the first line open. */
  const decide = async (rx: Rx, when: Date, partRest?: "owed" | "buying_outside") => {
    await accept(rx, when);
    await write(
      s,
      rx.pf ? pharm(rx.point) : tech(rx.point),
      review.DecisionsInput,
      review.DISPENSE_NEED,
      review.saveLineDecisions,
      {
        decisions: rx.ids.map((lineId, i) => {
          const n = qty(rx.meds[i]!, i);
          return partRest && i === 0
            ? { lineId, kind: "part", quantity: Math.ceil(n / 2), notSupplied: Math.floor(n / 2), rest: partRest, reasonCode: "out_point" }
            : { lineId, kind: "full", quantity: n };
        }),
      },
      when,
    );
  };
  const staged = (ids: string[]) =>
    q<{
      lineId: string;
      decision: { productId: string; batches: { batchId: string; quantity: number }[]; kind: string; notSupplied: number | null; rest: string | null };
    }>(
      s,
      sql`SELECT DISTINCT ON (prescription_id) prescription_id AS "lineId", decision FROM pharmacy_line_events
        WHERE kind = 'decision_saved' AND prescription_id IN (${sql.join(ids.map((i) => sql`${i}::uuid`), sql`, `)})
        ORDER BY prescription_id, occurred_at DESC`,
    );
  /** The hand-over of every staged line, labels printed: window patients identified, ward lines to a named nurse. */
  const handOver = async (rx: Rx, when: Date, o: { typed?: boolean; representative?: boolean } = {}) => {
    const actor = tech(rx.point);
    const clientKey = randomUUID();
    const ward = rx.p.kind === "inpatient";
    const typed = !ward && o.typed === true;
    if (typed) {
      const [y, m, d] = rx.p.dob.split("-");
      await write(s, actor, supply.IdentifierInput, supply.DISPENSE_LIVE, supply.checkSecondIdentifier, {
        clientKey,
        lineId: rx.ids[0],
        kind: "date_of_birth",
        typed: `${d}/${m}/${y}`,
      }, when);
    }
    // The pharmacist answers the checks panel first (rework test 8): a stop with the prescriber, a check as checked.
    const checked = await q<{ id: string; checkAnswers: never; confirmedFlags: string[] }>(
      s,
      sql`SELECT id, coalesce(check_answers, '[]') AS "checkAnswers", coalesce(confirmed_flags, '{}') AS "confirmedFlags"
        FROM prescriptions WHERE id IN (${sql.join(rx.ids.map((i) => sql`${i}::uuid`), sql`, `)})`,
    );
    for (const f of rxFlags(checked))
      await write(s, actor, AnswerCheckInput, supply.DISPENSE_LIVE, answerCheck, {
        lineId: f.lineId,
        code: f.code,
        answer: f.level === "stop" ? "prescriber_confirmed" : "checked",
        reason: f.level === "stop" ? null : RX_CHECKS.reasons[0],
      }, when);
    const payment = rx.point === "private" ? "insured" : rx.point === "emergency" ? "emergency" : "paid";
    const r = await write(s, actor, supply.HandoverInput, supply.DISPENSE_LIVE, supply.recordHandover, {
      clientKey,
      lines: (await staged(rx.ids)).map(({ lineId, decision: dc }) => ({
        lineId,
        productId: dc.productId,
        rows: dc.batches,
        strengthConfirmed: true,
        ...(dc.kind === "part" ? { rest: { outcome: dc.rest, quantityNotSupplied: dc.notSupplied, reasonCode: "out_point" } } : {}),
      })),
      collector: ward
        ? { kind: "ward_staff", userId: P.nurses[rx.p.n % P.nurses.length] }
        : o.representative
          ? { kind: "representative", name: "Demo relative", relationship: "Sister" }
          : { kind: "patient" },
      identity: ward
        ? { route: "ward_staff" }
        : typed
          ? { route: "two_identifiers", nameAttested: true }
          : { route: "identified_another_way", nameAttested: true, how: "card_shown" },
      counselling: ward ? [] : ["purpose", "how_when"],
      payment: { status: payment, ...(payment === "insured" ? { detail: "Demo insurance scheme" } : {}) },
    }, plus(when, 2));
    await write(s, actor, supply.PrintInput, supply.DISPENSE_LIVE, supply.printLabels, { handoverId: r.id }, plus(when, 3));
    dispensingMade.handovers.push(r.id);
    bump(s, "handovers");
    return r.id;
  };
  const supplyRx = async (rx: Rx, when: Date, o: { typed?: boolean; representative?: boolean } = {}) => {
    await decide(rx, when);
    return handOver(rx, plus(when, 5), o);
  };
  const slip = async (k: PointKey, lineId: string, when: Date) => {
    dispensingMade.slips.push((await write(s, tech(k), review.LineInput, review.DISPENSE_NEED, review.printSlip, { lineId }, when)).id);
    bump(s, "slips");
  };
  /** A query and its delivery to the prescriber (the action's two steps). */
  const ask = async (rx: Rx, when: Date, type: string, whole = false) => {
    const actor = pharm(rx.point);
    const r = await write(s, actor, review.QueryInput, review.QUERY_NEED, review.sendQuery, {
      lineId: rx.ids[0],
      whole,
      typeCode: type,
      proposal: type === "not_available" ? "Demo proposal: an alternative that is on the shelf here." : "Demo proposal: please confirm as written.",
      patientWaiting: rx.p.kind === "outpatient",
    }, when);
    await review.deliverQuery(actor, r.id, r, { database: s.db, now: when });
    dispensingMade.queries.push(r.id);
    bump(s, "queries");
    return r.id;
  };
  /** The prescriber's answer in the app (their own store), as the visit's doctor. A change places the new line first. */
  const answer = async (rx: Rx, queryId: string, when: Date, a: "keep" | "changed" | "stopped") => {
    const d = doctorOf(rx.p);
    const actor: EmrActor = {
      userId: d.userId,
      fullName: null,
      hospitalId: s.h,
      departmentId: d.departmentId,
      affiliationId: d.affiliationId,
      cadreCode: d.cadre,
      isClinical: true,
      surface: "doctor",
    };
    const base = { patientUserId: rx.p.id, queryId, clientKey: `pharmacy-demo-${randomUUID()}` };
    let replacement: Rx | null = null;
    if (a === "changed") {
      const ck = `pharmacy-demo-${randomUUID()}`;
      replacement = await prescribe(rx.p, meds(rx.p, 1), plus(when, -1), [], ck);
      await withPatientWrite(actor, rx.p.id, (ctx) => answerQuery(ctx, { ...base, answer: "changed", replacedByClientKey: ck }), {
        database: s.db,
        now: when,
      });
    } else
      await withPatientWrite(
        actor,
        rx.p.id,
        (ctx) => answerQuery(ctx, { ...base, answer: a, reasonCode: a === "keep" ? "intended" : "pharmacy_concern" }),
        { database: s.db, now: when },
      );
    bump(s, "query_answers");
    return replacement;
  };

  /* ─── The past month: queries answered every way, at several points (the Interventions page) ─── */
  type End = "keep" | "phone" | "changed" | "stopped" | "withdrawn" | "declined";
  const HISTORY: [days: number, point: PointKey, end: End][] = [
    [29, "opd", "keep"], [27, "inpatient", "changed"], [26, "ncd", "stopped"], [24, "opd", "phone"],
    [23, "art", "keep"], [21, "inpatient", "withdrawn"], [20, "paediatrics", "changed"], [18, "opd", "stopped"],
    [17, "maternity", "keep"], [15, "inpatient", "keep"], [14, "emergency", "phone"], [13, "opd", "changed"],
    [11, "ncd", "keep"], [10, "inpatient", "stopped"], [9, "private", "withdrawn"], [8, "opd", "declined"],
    [6, "inpatient", "changed"], [5, "art", "phone"], [4, "opd", "keep"], [3, "inpatient", "stopped"],
    [2, "paediatrics", "withdrawn"], [2, "opd", "changed"],
  ];
  for (const [i, [days, k, end]] of HISTORY.entries()) {
    const p = pick(k, end === "phone" || end === "withdrawn" ? notIntern : mayAnswer);
    const t = at(s, days, 9 + (i % 6));
    const rx = await prescribe(p, meds(p, 1 + (i % 2)), t);
    // A whole-prescription query now and then; a change answers one line, so those stay line queries.
    const whole = i % 5 === 4 && end !== "changed" && end !== "declined";
    const qid = await ask(rx, plus(t, 10), QUERY_TYPES[i % QUERY_TYPES.length]!, whole);
    const t2 = plus(t, 25 + (i % 4) * 15);
    if (end === "phone")
      await write(s, pharm(k), review.PhoneInput, review.QUERY_NEED, review.logPhoneAnswer, {
        queryId: qid,
        clinicianUserId: mo.userId,
        said: "keep",
        reasonCode: "intended",
        at: t2.toISOString(),
      }, plus(t2, 1));
    else if (end === "withdrawn")
      await write(s, pharm(k), review.WithdrawInput, review.QUERY_NEED, review.withdrawQuery, { queryId: qid, reasonCode: "answered_otherwise" }, t2);
    else {
      const replacement = await answer(rx, qid, t2, end === "declined" ? "keep" : end);
      if (replacement) await supplyRx(replacement, plus(t2, 10));
      if (end === "declined")
        await write(s, pharm(k), review.DeclineInput, review.REVIEW_NEED, review.declineLine, { lineId: rx.ids[0], reasonCode: "concern_stands" }, plus(t2, 5));
      // The queried line is declined, changed or stopped (a stop on the whole prescription stops every line).
      if (end !== "keep") {
        rx.ids = end === "stopped" && whole ? [] : rx.ids.slice(1);
        rx.meds = rx.meds.slice(1);
      }
    }
    if (rx.ids.length) await supplyRx(rx, plus(t2, 15), { typed: i % 3 === 0 });
  }

  /* ─── The past week: hand-overs at every point, busiest at the window and the wards ─── */
  const OTHERS: PointKey[] = ["emergency", "paediatrics", "maternity", "art", "ncd", "private"];
  const week = new Map<number, { handovers: string[]; rx: Rx[] }>();
  for (let d = 7; d >= 1; d--) {
    const day = { handovers: [] as string[], rx: [] as Rx[] };
    for (const [j, k] of (["opd", "inpatient", "opd", "inpatient", OTHERS[d % OTHERS.length]!] as PointKey[]).entries()) {
      const p = pick(k);
      const t = at(s, d, 8 + j * 2);
      const rx = await prescribe(p, meds(p, 2 + ((d + j) % 2)), t);
      day.rx.push(rx);
      day.handovers.push(await supplyRx(rx, plus(t, 20), { typed: j === 0, representative: j === 2 && d % 2 === 0 }));
    }
    week.set(d, day);
  }
  // The dispensing log printed at the end of the last three days, at the two busiest points.
  for (const d of [3, 2, 1])
    for (const k of ["opd", "inpatient"] as const)
      await write(s, tech(k), PrintLogInput, PRINT_LOG_NEED, printDispensingLog, { day: localDate(at(s, d, 12)) }, at(s, d, 18));
  bump(s, "dispensing_log_prints", 6);
  // Three days ago one supply at the window was recorded in error; the chief pharmacist corrects the record.
  const wrong = week.get(3)!;
  await write(s, chiefActor(s, "opd"), supply.CorrectInput, supply.MANAGE_NEED, supply.correctSupplyRecord, {
    handoverId: wrong.handovers[0],
    lineId: wrong.rx[0]!.ids[0],
    reasonCode: "wrong_entry",
    note: "Demo: the quantity was entered twice.",
  }, at(s, 1, 10));
  bump(s, "corrections");

  /* ─── Open lines: owed and bought outside ─── */
  // Owed: the window's stock-out, and lines short elsewhere.
  for (const [i, k] of (["opd", "opd", "inpatient", "ncd"] as PointKey[]).entries()) {
    const p = pick(k);
    const t = i ? at(s, i, 8) : today(0.3);
    const rx = await prescribe(p, k === "opd" ? meds(p, 1, { only: ["artemether_lumefantrine"] }) : meds(p, 1), t);
    await write(s, tech(k), review.NotSuppliedInput, review.DISPENSE_NEED, review.recordNotSupplied, {
      lineId: rx.ids[0],
      outcome: "owed",
      reasonCode: k === "opd" ? "out_point" : "out_hospital",
      quantityNotSupplied: qty(rx.meds[0]!),
    }, plus(t, 15));
    bump(s, "owed");
  }
  // Part supplied, the rest owed or bought outside (the slip printed for the rest).
  for (const [i, [k, rest]] of ([["opd", "owed"], ["inpatient", "owed"], ["art", "owed"], ["opd", "buying_outside"]] as const).entries()) {
    const p = pick(k);
    const t = i < 2 ? today(0.2 + i * 0.1) : at(s, i, 11);
    const rx = await prescribe(p, meds(p, 2, { units: ["tablet", "capsule"] }), t);
    await decide(rx, plus(t, 10), rest);
    await handOver(rx, plus(t, 15), { typed: i === 0 });
    if (rest === "buying_outside") await slip(k, rx.ids[0]!, plus(t, 20));
    bump(s, "part_supplies");
  }
  // Bought outside: a slip to take to another pharmacy; one later confirmed filled elsewhere.
  for (const [i, k] of (["opd", "ncd", "private", "maternity"] as PointKey[]).entries()) {
    const p = pick(k);
    const t = i ? at(s, i + 1, 10) : today(0.4);
    const rx = await prescribe(p, meds(p, 1), t);
    await write(s, tech(k), review.NotSuppliedInput, review.DISPENSE_NEED, review.recordNotSupplied, {
      lineId: rx.ids[0],
      outcome: "buying_outside",
      reasonCode: "out_point",
    }, plus(t, 10));
    await slip(k, rx.ids[0]!, plus(t, 11));
    if (i === 3)
      await write(s, tech(k), review.FilledInput, review.CLOSE_NEED, review.confirmFilledElsewhere, { lineId: rx.ids[0], saidBy: "patient" }, at(s, 1, 9));
    bump(s, "buying_outside");
  }
  // Written four days ago and never collected: closed.
  {
    const p = pick("opd");
    const rx = await prescribe(p, meds(p, 1), at(s, 4, 15));
    await write(s, tech("opd"), review.CloseInput, review.CLOSE_NEED, review.closePrescriptionNotCollected, {
      lineId: rx.ids[0],
      reasonCode: "not_collected",
      note: "Demo: not collected after four days.",
    }, today(0.1));
  }

  /* ─── Today: hand-overs at every point ─── */
  const TODAY: [PointKey, Flag?, string?][] = [
    ["opd"], ["inpatient"], ["opd"], ["inpatient", "renal"], ["opd"], ["inpatient"], ["ncd", "high_risk", "insulin_soluble"],
    ["art"], ["opd"], ["inpatient"], ["paediatrics", "child"], ["maternity"], ["emergency"], ["private"], ["ncd"], ["art"],
  ];
  const todays: string[] = [];
  for (const [i, [k, flag, only]] of TODAY.entries()) {
    const p = pick(k);
    const t = today(0.05 + (i / TODAY.length) * 0.6);
    const rx = await prescribe(p, only ? meds(p, 1, { only: [only] }) : meds(p, flag ? 1 : 1 + (i % 3)), t, flag ? [flag] : []);
    todays.push(await supplyRx(rx, plus(t, 8), { typed: i % 2 === 0, representative: i === 4 }));
  }
  // One reprint, and one hand-over handed back at the window and reversed the same day.
  await write(s, tech("opd"), supply.PrintInput, supply.DISPENSE_LIVE, supply.reprintLabels, { handoverId: todays[0] }, today(0.7));
  const [back] = await q<{ lineId: string }>(s, sql`SELECT prescription_id AS "lineId" FROM pharmacy_supplies WHERE handover_id = ${todays[2]!} LIMIT 1`);
  await write(s, pharm("opd"), supply.ReverseInput, supply.REVERSE_NEED, supply.reverseSupply, {
    handoverId: todays[2],
    lineId: back!.lineId,
    reasonCode: "handed_back",
    packFit: true,
    note: "Demo: the patient already had this medicine at home.",
  }, today(0.72));
  bump(s, "reversals");

  /* ─── Today's queue: every stage, both lanes, window and ward ─── */
  // To review: standard, and pharmacist-first (a stop overridden, high risk, a child, kidneys, a controlled drug).
  const TO_REVIEW: [PointKey, number | string[], (Flag | null)[]?][] = [
    ["opd", 3], ["opd", 1, ["stop"]], ["opd", 2], ["inpatient", 3],
    ["inpatient", ["heparin_unfractionated", "omeprazole"], ["high_risk", null]], ["inpatient", ["morphine"], ["controlled"]],
    ["inpatient", 2, ["renal", null]], ["paediatrics", 1, ["child"]], ["maternity", ["magnesium_sulfate"], ["high_risk"]],
    ["ncd", 3], ["art", 2], ["emergency", 2], ["private", 2], ["inpatient", 2],
  ];
  for (const [i, [k, what, flags]] of TO_REVIEW.entries()) {
    const p = pick(k);
    await prescribe(p, typeof what === "number" ? meds(p, what) : meds(p, what.length, { only: what }), today(0.7 + i * 0.015), flags ?? []);
  }
  // Queried, still open: line and whole-prescription queries at several points.
  for (const [i, k] of (["opd", "inpatient", "ncd", "paediatrics", "maternity", "opd"] as PointKey[]).entries()) {
    const p = pick(k);
    const t = today(0.5 + i * 0.05);
    const rx = await prescribe(p, meds(p, 2 + (i % 2)), t);
    await ask(rx, plus(t, 6), QUERY_TYPES[(i + 2) % QUERY_TYPES.length]!, i % 3 === 1);
  }
  // A query sent yesterday, still unanswered.
  {
    const p = pick("inpatient");
    const rx = await prescribe(p, meds(p, 1), at(s, 1, 16));
    await ask(rx, at(s, 1, 17), "duplicate");
  }
  // Ready: staged with the first-to-expire batches, waiting for the patient or the ward.
  const READY: [PointKey, (Flag | null)[]?, string?][] = [
    ["opd"], ["opd"], ["opd", ["stop", null]], ["inpatient"], ["inpatient"], ["inpatient", ["high_risk"], "enoxaparin"],
    ["ncd"], ["art"], ["paediatrics"], ["emergency"],
  ];
  for (const [i, [k, flags, only]] of READY.entries()) {
    const p = pick(k);
    const t = today(0.6 + i * 0.02);
    const rx = await prescribe(p, only ? meds(p, 1, { only: [only] }) : meds(p, flags ? flags.length : 1 + (i % 3)), t, flags ?? []);
    await decide(rx, plus(t, 5));
  }
  // One prescription with a line ready and a line queried.
  {
    const p = pick("opd");
    const t = today(0.8);
    const rx = await prescribe(p, meds(p, 2), t);
    await write(s, tech("opd"), review.DecisionsInput, review.DISPENSE_NEED, review.saveLineDecisions, {
      decisions: [{ lineId: rx.ids[1], kind: "full", quantity: qty(rx.meds[1]!) }],
    }, plus(t, 3));
    await ask({ ...rx, ids: rx.ids.slice(0, 1) }, plus(t, 4), "dose");
  }
  // Awaiting a senior's co-signature: the intern's prescriptions, at the window and on a ward.
  const interns = s.patients.filter(isIntern);
  for (const [i, p] of [...interns.filter((x) => x.kind === "outpatient").slice(0, 3), ...interns.filter((x) => x.kind === "inpatient").slice(0, 2)].entries())
    await prescribe(p, meds(p, 1 + (i % 2)), today(0.75 + i * 0.02));
}
