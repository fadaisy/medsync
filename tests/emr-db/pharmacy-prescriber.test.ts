/**
 * The prescriber's side of a pharmacy query (Pharmacy Phase 1 Step 5; 5.4, RQ-4..RQ-8, RQ-11,
 * D-PH1-08, D-PH1-41, D-PH1-49): answers, the first-answer rule, the dispute, the not-supplied notice,
 * the prescriber's cancel and the print record, each line's stage folded by lines.lineStatus over the
 * stored record. Fixture medicines only. Runs only with EMR_PGLITE=1.
 */
import { randomUUID } from "node:crypto";
import type { Lane } from "./_pglite";
import type { EmrActor } from "@/lib/emr/actor";
import type { WriteCtx } from "@/lib/emr/write/context";
import { beforeAll, describe, expect, it } from "vitest";

import { asClinicalWriter } from "@/lib/emr/db";
import { withPatientWrite } from "@/lib/emr/write/context";
import {
  acknowledgeNotSupplied,
  answerQuery,
  cancelPrescriptionLine,
  chooseAlternative,
  confirmChangesMade,
  disputePhoneAnswer,
  recordPrescriptionPrint,
  recordQuerySeen,
} from "@/lib/emr/write/pharmacy-answers";
import {
  loadPatientPharmacy,
  loadPrescriberPharmacy,
  statusOf,
} from "@/lib/pharmacy/review/prescriber-read";
import {
  bootLane,
  clinician,
  department,
  encounter,
  hospital,
  intake,
  laneOn,
  patient,
} from "./_pglite";

const key = () => `k-${randomUUID()}`;
const T0 = Date.now() - 3 * 3600_000;
const at = (min: number) => new Date(T0 + min * 60_000).toISOString();

describe.skipIf(!laneOn)("the prescriber answers the pharmacy (PGlite lane)", () => {
  let lane: Lane;
  let h: string;
  let clinic: string;
  let point: string;
  let pharmacist: string;
  let mo: EmrActor;
  let mo2: EmrActor;
  let mo3: EmrActor;
  let nurse: EmrActor;

  const q = async <T = Record<string, unknown>>(sql: string, params: unknown[] = []) =>
    (await lane.pg.query<T>(sql, params)).rows;
  const one = async <T = Record<string, unknown>>(sql: string, params: unknown[] = []) =>
    (await q<T>(sql, params))[0]!;

  const actor = (s: { userId: string; affiliationId: string }, cadreCode: string): EmrActor => ({
    userId: s.userId,
    affiliationId: s.affiliationId,
    fullName: null,
    hospitalId: h,
    departmentId: clinic,
    cadreCode,
    isClinical: true,
    surface: cadreCode === "NURSE" ? "nurse" : "doctor",
  });

  beforeAll(async () => {
    lane = await bootLane();
    h = await hospital(lane.pg, "Prescriber lane");
    clinic = await department(lane.pg, h, "Clinic");
    const pharmDept = (
      await one<{ id: string }>(
        `INSERT INTO public.hospital_departments (hospital_id, name, slug, kind, catalogue_code)
         VALUES ($1, 'Pharmacy', $2, 'support', 'PHARMACY') RETURNING id`,
        [h, `pharmacy-${randomUUID()}`],
      )
    ).id;
    point = (
      await one<{ id: string }>(
        `INSERT INTO public.hospital_departments (hospital_id, parent_id, name, slug, kind)
         VALUES ($1, $2, 'Fixture point A', $3, 'support') RETURNING id`,
        [h, pharmDept, `point-${randomUUID()}`],
      )
    ).id;
    await q(
      `INSERT INTO public.pharmacy_dispensing_points (department_id, hospital_id, serves, phone)
       VALUES ($1, $2, 'window', '+256 700 000000')`,
      [point, h],
    );
    pharmacist = (
      await clinician(lane.pg, { hospitalId: h, departmentId: point, cadre: "PHARMACIST" })
    ).userId;
    mo = actor(
      await clinician(lane.pg, { hospitalId: h, departmentId: clinic }),
      "MEDICAL_OFFICER",
    );
    mo2 = actor(
      await clinician(lane.pg, { hospitalId: h, departmentId: clinic }),
      "MEDICAL_OFFICER",
    );
    mo3 = actor(
      await clinician(lane.pg, { hospitalId: h, departmentId: clinic }),
      "MEDICAL_OFFICER",
    );
    nurse = actor(
      await clinician(lane.pg, { hospitalId: h, departmentId: clinic, cadre: "NURSE" }),
      "NURSE",
    );
    await q(`DELETE FROM public.clinical_cosign_policies WHERE hospital_id = $1`, [h]);
    await q(
      `INSERT INTO public.clinical_cosign_policies (hospital_id, cadre_code, action_kind, requirement)
       VALUES ($1, 'MEDICAL_OFFICER', 'prescription_routine', 'allowed')`,
      [h],
    );
  }, 180_000);

  async function visit() {
    const p = await patient(lane.pg);
    await intake(lane.pg, { hospitalId: h, patientUserId: p });
    const enc = await encounter(lane.pg, {
      hospitalId: h,
      patientUserId: p,
      clinicianUserId: mo.userId,
      departmentId: clinic,
    });
    return { p, enc };
  }
  async function line(
    p: string,
    enc: string,
    o: { placement?: string; min?: number; drug?: string; clientKey?: string } = {},
  ) {
    return (
      await one<{ id: string }>(
        `INSERT INTO public.prescriptions (hospital_id, encounter_id, patient_user_id, prescriber_user_id,
           prescriber_cadre, drug_id, drug_name, dose, route, frequency, is_emergency, state, placement_id,
           client_key, created_at, updated_at)
         VALUES ($1, $2, $3, $4, 'MEDICAL_OFFICER', 'fixture_tablet', $5, '[fixture dose]', 'oral',
                 '[fixture frequency]', false, 'active', $6, $7, $8, $8) RETURNING id`,
        [
          h,
          enc,
          p,
          mo.userId,
          o.drug ?? "Fixture tablet A",
          o.placement ?? randomUUID(),
          o.clientKey ?? key(),
          at(o.min ?? 0),
        ],
      )
    ).id;
  }
  async function query(
    p: string,
    rx: string,
    o: { scope?: "line" | "prescription"; placement?: string; type?: string; min?: number } = {},
  ) {
    const id = (
      await one<{ id: string }>(
        `INSERT INTO public.pharmacy_queries (hospital_id, patient_user_id, scope, prescription_id, placement_id,
           type_code, proposal, patient_waiting, dispensing_point_id, sender_user_id, sender_cadre, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, 'Fixture proposal, as typed', true, $7, $8, 'PHARMACIST', $9)
         RETURNING id`,
        [
          h,
          p,
          o.scope ?? "line",
          rx,
          o.placement ?? null,
          o.type ?? "dose",
          point,
          pharmacist,
          at(o.min ?? 1),
        ],
      )
    ).id;
    await q(
      `INSERT INTO public.pharmacy_query_events (query_id, hospital_id, kind, recipient_user_id, recipient_role,
         actor_user_id, occurred_at) VALUES ($1, $2, 'notified', $3, 'prescriber', $4, $5)`,
      [id, h, mo.userId, pharmacist, at(o.min ?? 1)],
    );
    return id;
  }
  const as = <T>(a: EmrActor, p: string, fn: (ctx: WriteCtx) => Promise<T>) =>
    withPatientWrite(a, p, fn, { database: lane.db });
  const record = (p: string) =>
    asClinicalWriter(
      { userId: mo.userId, hospitalId: h },
      (tx) => loadPatientPharmacy(tx, { hospitalId: h, patientUserId: p }),
      lane.db,
    );
  const stage = async (p: string, rx: string) => {
    const s = statusOf(await record(p), rx);
    return s?.kind === "stage" ? s.stage : s?.outcome;
  };
  const events = (queryId: string) =>
    q<{ kind: string; answer: string | null }>(
      `SELECT kind, answer FROM public.pharmacy_query_events WHERE query_id = $1 ORDER BY occurred_at, id`,
      [queryId],
    );
  const err = (pr: Promise<unknown>) =>
    pr.then(
      () => null,
      (e: { code?: string; message?: string }) => ({ code: e.code, message: e.message }),
    );

  it("S15: the query reaches the prescriber's plan, with the point's phone; seen is written once", async () => {
    const { p, enc } = await visit();
    const rx = await line(p, enc);
    const other = await line(p, enc);
    const qid = await query(p, rx);
    expect(await stage(p, rx)).toBe("queried");
    const view = await loadPrescriberPharmacy(mo, {
      patientUserId: p,
      encounterId: enc,
      now: new Date(),
      database: lane.db,
    });
    expect(view.count).toBe(1);
    const item = view.items[0]!;
    expect(item.kind).toBe("query");
    if (item.kind !== "query") return;
    expect(item.words).toMatch(
      /^From the pharmacy \(.+\), \d\d:\d\d · Dose unclear or unusual\. "Fixture proposal, as typed"$/,
    );
    expect(item.patientWaiting).toBe(true);
    expect(item.phone).toBe("+256 700 000000");
    expect(item.lines.map((l) => l.id)).toEqual([rx]);
    expect(view.lineStatus[other]).toBeUndefined();
    expect(view.announce?.id).toBe(qid);
    await as(mo, p, (ctx) => recordQuerySeen(ctx, { patientUserId: p, queryId: qid }));
    await as(mo, p, (ctx) => recordQuerySeen(ctx, { patientUserId: p, queryId: qid }));
    const seen = await q(
      `SELECT recipient_role FROM public.pharmacy_query_events WHERE query_id = $1 AND kind = 'seen'`,
      [qid],
    );
    expect(seen).toEqual([{ recipient_role: "prescriber" }]);
    // RQ-8: seen is not an answer.
    expect(await stage(p, rx)).toBe("queried");
    // A nurse reads nothing of it (0125: the prescriber's policies only).
    const nurseView = await loadPrescriberPharmacy(nurse, {
      patientUserId: p,
      encounterId: enc,
      now: new Date(),
      database: lane.db,
    });
    expect(nurseView.items).toEqual([]);
  });

  it("S16: keep with a reason returns the line to To review, showing the answer", async () => {
    const { p, enc } = await visit();
    const rx = await line(p, enc);
    const qid = await query(p, rx);
    const missing = await err(
      as(mo, p, (ctx) =>
        answerQuery(ctx, {
          patientUserId: p,
          queryId: qid,
          clientKey: key(),
          answer: "keep",
          reasonCode: "made_up",
        }),
      ),
    );
    expect(missing?.code).toBe("invalid");
    const k = key();
    const r = await as(mo, p, (ctx) =>
      answerQuery(ctx, {
        patientUserId: p,
        queryId: qid,
        clientKey: k,
        answer: "keep",
        reasonCode: "intended",
      }),
    );
    // The same client key is the same request.
    const again = await as(mo, p, (ctx) =>
      answerQuery(ctx, {
        patientUserId: p,
        queryId: qid,
        clientKey: k,
        answer: "keep",
        reasonCode: "intended",
      }),
    );
    expect(again.id).toBe(r.id);
    expect(await stage(p, rx)).toBe("to_review");
    const row = await one(
      `SELECT answer, answer_reason_code, via, answered_by_user_id FROM public.pharmacy_query_events WHERE id = $1`,
      [r.id],
    );
    expect(row).toEqual({
      answer: "keep",
      answer_reason_code: "intended",
      via: "app",
      answered_by_user_id: mo.userId,
    });
    const view = await loadPrescriberPharmacy(mo, {
      patientUserId: p,
      encounterId: enc,
      now: new Date(),
      database: lane.db,
    });
    const item = view.items[0]!;
    expect(item.kind === "query" && item.state).toBe("answered");
    expect(item.kind === "query" && item.outcome).toMatch(/: Keep it as written\.$/);
    expect(view.count).toBe(0);
  });

  it("S17: change places a new line and cancels the old one naming it; the old line is replaced", async () => {
    const { p, enc } = await visit();
    const rx = await line(p, enc);
    const qid = await query(p, rx);
    const nk = key();
    const fresh = await line(p, enc, { min: 30, clientKey: nk });
    const r = await as(mo, p, (ctx) =>
      answerQuery(ctx, {
        patientUserId: p,
        queryId: qid,
        clientKey: key(),
        answer: "changed",
        replacedByClientKey: nk,
      }),
    );
    expect(r.closed).toBe(true);
    expect(await one(`SELECT state FROM public.prescriptions WHERE id = $1`, [rx])).toEqual({
      state: "cancelled",
    });
    expect(
      await one(
        `SELECT reason_code, replaced_by_prescription_id, query_id, actor_user_id FROM public.prescription_cancellations WHERE prescription_id = $1`,
        [rx],
      ),
    ).toEqual({
      reason_code: "changed",
      replaced_by_prescription_id: fresh,
      query_id: qid,
      actor_user_id: mo.userId,
    });
    expect(
      await one(
        `SELECT answer, replaced_by_prescription_id FROM public.pharmacy_query_events WHERE kind = 'answered' AND query_id = $1`,
        [qid],
      ),
    ).toEqual({ answer: "changed", replaced_by_prescription_id: fresh });
    expect(await stage(p, rx)).toBe("replaced");
    expect(await one(`SELECT state FROM public.prescriptions WHERE id = $1`, [fresh])).toEqual({
      state: "active",
    });
  });

  it("S18: stop cancels the line; its outcome is cancelled by the prescriber", async () => {
    const { p, enc } = await visit();
    const rx = await line(p, enc);
    const qid = await query(p, rx);
    await as(mo, p, (ctx) =>
      answerQuery(ctx, {
        patientUserId: p,
        queryId: qid,
        clientKey: key(),
        answer: "stopped",
        reasonCode: "pharmacy_concern",
      }),
    );
    expect(await stage(p, rx)).toBe("cancelled_by_prescriber");
    expect(
      await one(
        `SELECT reason_code, replaced_by_prescription_id FROM public.prescription_cancellations WHERE prescription_id = $1`,
        [rx],
      ),
    ).toEqual({ reason_code: "pharmacy_concern", replaced_by_prescription_id: null });
  });

  it("S19: changing one line of a whole prescription does not close it; Changes made does", async () => {
    const { p, enc } = await visit();
    const placement = randomUUID();
    const [a, b, c] = [
      await line(p, enc, { placement }),
      await line(p, enc, { placement }),
      await line(p, enc, { placement }),
    ];
    const qid = await query(p, a, { scope: "prescription", placement });
    for (const x of [a, b, c]) expect(await stage(p, x)).toBe("queried");
    const early = await err(
      as(mo, p, (ctx) =>
        confirmChangesMade(ctx, { patientUserId: p, queryId: qid, clientKey: key() }),
      ),
    );
    expect(early?.code).toBe("invalid");
    const nk = key();
    await line(p, enc, { min: 30, clientKey: nk });
    const r = await as(mo, p, (ctx) =>
      answerQuery(ctx, {
        patientUserId: p,
        queryId: qid,
        clientKey: key(),
        answer: "changed",
        lineId: a,
        replacedByClientKey: nk,
      }),
    );
    expect(r.closed).toBe(false);
    expect((await events(qid)).some((e) => e.kind === "answered")).toBe(false);
    expect([await stage(p, a), await stage(p, b), await stage(p, c)]).toEqual([
      "replaced",
      "queried",
      "queried",
    ]);
    await as(mo, p, (ctx) =>
      confirmChangesMade(ctx, { patientUserId: p, queryId: qid, clientKey: key() }),
    );
    expect([await stage(p, a), await stage(p, b), await stage(p, c)]).toEqual([
      "replaced",
      "to_review",
      "to_review",
    ]);
  });

  it("S22: a logged phone keep answers by phone; the named clinician disputes it and it reopens", async () => {
    const { p, enc } = await visit();
    const rx = await line(p, enc);
    const qid = await query(p, rx);
    await q(
      `INSERT INTO public.pharmacy_query_events (query_id, hospital_id, kind, answer, via, answered_by_user_id,
         answer_reason_code, actor_user_id, occurred_at)
       VALUES ($1, $2, 'answered', 'keep', 'phone', $3, 'intended', $4, $5)`,
      [qid, h, mo.userId, pharmacist, at(5)],
    );
    expect(await stage(p, rx)).toBe("to_review");
    const view = await loadPrescriberPharmacy(mo, {
      patientUserId: p,
      encounterId: enc,
      now: new Date(),
      database: lane.db,
    });
    expect(view.items[0]!.kind === "query" && view.items[0]!.phoneAnswerAt).toMatch(/^\d\d:\d\d$/);
    const notMe = await err(
      as(mo2, p, (ctx) =>
        disputePhoneAnswer(ctx, { patientUserId: p, queryId: qid, clientKey: key() }),
      ),
    );
    expect(notMe?.code).toBe("forbidden");
    await as(mo, p, (ctx) =>
      disputePhoneAnswer(ctx, { patientUserId: p, queryId: qid, clientKey: key() }),
    );
    expect(await stage(p, rx)).toBe("queried");
    const after = await loadPrescriberPharmacy(mo, {
      patientUserId: p,
      encounterId: enc,
      now: new Date(),
      database: lane.db,
    });
    expect(after.items[0]!.kind === "query" && after.items[0]!.state).toBe("open");
  });

  it("S23: a second clinician answers; a third is shown the first and writes nothing; a nurse cannot answer", async () => {
    const { p, enc } = await visit();
    const rx = await line(p, enc);
    const qid = await query(p, rx);
    const nurseTry = await err(
      as(nurse, p, (ctx) =>
        answerQuery(ctx, {
          patientUserId: p,
          queryId: qid,
          clientKey: key(),
          answer: "keep",
          reasonCode: "intended",
        }),
      ),
    );
    expect(nurseTry?.code).toBe("forbidden");
    await as(mo2, p, (ctx) =>
      answerQuery(ctx, {
        patientUserId: p,
        queryId: qid,
        clientKey: key(),
        answer: "keep",
        reasonCode: "senior_advice",
      }),
    );
    const before = await events(qid);
    const third = await err(
      as(mo3, p, (ctx) =>
        answerQuery(ctx, {
          patientUserId: p,
          queryId: qid,
          clientKey: key(),
          answer: "stopped",
          reasonCode: "pharmacy_concern",
        }),
      ),
    );
    expect(third?.code).toBe("conflict");
    expect(third?.message).toMatch(/^Answered by .+ at \d\d:\d\d: Keep it as written\.$/);
    expect(await events(qid)).toEqual(before);
    expect(await one(`SELECT state FROM public.prescriptions WHERE id = $1`, [rx])).toEqual({
      state: "active",
    });
  });

  it("S27: a line returned for an alternative is changed, or left (keep) and returned to review", async () => {
    const run1 = await visit();
    const rx1 = await line(run1.p, run1.enc);
    const q1 = await query(run1.p, rx1, { type: "not_available" });
    const nk = key();
    const fresh = await line(run1.p, run1.enc, { min: 30, clientKey: nk });
    await as(mo, run1.p, (ctx) =>
      answerQuery(ctx, {
        patientUserId: run1.p,
        queryId: q1,
        clientKey: key(),
        answer: "changed",
        replacedByClientKey: nk,
      }),
    );
    expect(await stage(run1.p, rx1)).toBe("replaced");
    expect(
      await one(
        `SELECT replaced_by_prescription_id FROM public.prescription_cancellations WHERE prescription_id = $1`,
        [rx1],
      ),
    ).toEqual({ replaced_by_prescription_id: fresh });

    const run2 = await visit();
    const rx2 = await line(run2.p, run2.enc);
    const q2 = await query(run2.p, rx2, { type: "not_available" });
    await as(mo, run2.p, (ctx) =>
      answerQuery(ctx, {
        patientUserId: run2.p,
        queryId: q2,
        clientKey: key(),
        answer: "keep",
        reasonCode: "intended",
      }),
    );
    expect(await stage(run2.p, rx2)).toBe("to_review");
  });

  it("RQ-11: a not-supplied outcome shows as a notice until it is acknowledged or the line moves on", async () => {
    const { p, enc } = await visit();
    const owed = async (rx: string, min: number) => {
      await q(
        `INSERT INTO public.pharmacy_line_events (hospital_id, prescription_id, patient_user_id, dispensing_point_id,
           kind, lane, actor_user_id, occurred_at) VALUES ($1, $2, $3, $4, 'accepted', 'pharmacist_first', $5, $6)`,
        [h, rx, p, point, pharmacist, at(min)],
      );
      return (
        await one<{ id: string }>(
          `INSERT INTO public.pharmacy_line_events (hospital_id, prescription_id, patient_user_id, dispensing_point_id,
             kind, reason_code, patient_told, actor_user_id, occurred_at)
           VALUES ($1, $2, $3, $4, 'owed', 'out_point', 'Told to come back', $5, $6) RETURNING id`,
          [h, rx, p, point, pharmacist, at(min + 1)],
        )
      ).id;
    };
    const plan = () =>
      loadPrescriberPharmacy(mo, {
        patientUserId: p,
        encounterId: enc,
        now: new Date(),
        database: lane.db,
      });

    // 1. No query on the line: the notice shows, needs nothing, and there is nowhere to acknowledge it.
    const rx = await line(p, enc);
    const ev = await owed(rx, 2);
    expect(await stage(p, rx)).toBe("owed");
    const view = await plan();
    const item = view.items.find((i) => i.id === ev)!;
    expect(item.kind).toBe("not_supplied");
    expect(item.words).toMatch(
      /^From the pharmacy, \d\d:\d\d\. Fixture tablet A was not supplied: Out of stock at this dispensing point\. Told to come back\.$/,
    );
    expect(item.kind === "not_supplied" && item.ackQueryId).toBe(null);
    expect(item.phone).toBe("+256 700 000000");
    expect(view.count).toBe(1);
    const nowhere = await err(
      as(mo, p, (ctx) => acknowledgeNotSupplied(ctx, { patientUserId: p, lineEventId: ev })),
    );
    expect(nowhere?.code).toBe("conflict");
    expect(await stage(p, rx)).toBe("owed");

    // 2. Returned to the prescriber earlier (a query on the line), then owed: Leave it as it is
    //    records the acknowledgement once, on that query, and the notice goes.
    const rx2 = await line(p, enc);
    const q2 = await query(p, rx2, { type: "not_available" });
    await as(mo, p, (ctx) =>
      answerQuery(ctx, {
        patientUserId: p,
        queryId: q2,
        clientKey: key(),
        answer: "keep",
        reasonCode: "intended",
      }),
    );
    const ev2 = await owed(rx2, 300);
    const before = (await plan()).items.find((i) => i.id === ev2);
    expect(before?.kind === "not_supplied" && before.ackQueryId).toBe(q2);
    await as(mo, p, (ctx) => acknowledgeNotSupplied(ctx, { patientUserId: p, lineEventId: ev2 }));
    await as(mo2, p, (ctx) => acknowledgeNotSupplied(ctx, { patientUserId: p, lineEventId: ev2 }));
    expect((await events(q2)).filter((e) => e.kind === "not_supplied_acknowledged")).toHaveLength(
      1,
    );
    expect((await plan()).items.some((i) => i.id === ev2)).toBe(false);
    expect(await stage(p, rx2)).toBe("owed");

    // 3. Choose an alternative: the new line is placed, the owed line is cancelled naming it.
    const nk = key();
    const alt = await line(p, enc, { min: 30, clientKey: nk });
    await as(mo, p, (ctx) =>
      chooseAlternative(ctx, { patientUserId: p, lineEventId: ev, replacedByClientKey: nk }),
    );
    expect(
      await one(
        `SELECT reason_code, replaced_by_prescription_id FROM public.prescription_cancellations WHERE prescription_id = $1`,
        [rx],
      ),
    ).toEqual({ reason_code: "changed", replaced_by_prescription_id: alt });
    expect((await plan()).items.some((i) => i.id === ev)).toBe(false);
  });

  it("D-PH1-41: only an active line, with a reason, by a clinician who may prescribe; the new line comes after", async () => {
    const { p, enc } = await visit();
    const rx = await line(p, enc, { min: 10 });
    const earlier = await line(p, enc, { min: 5 });
    expect(
      (
        await err(
          as(nurse, p, (ctx) =>
            cancelPrescriptionLine(ctx, {
              patientUserId: p,
              prescriptionId: rx,
              reasonCode: "no_longer_needed",
            }),
          ),
        )
      )?.code,
    ).toBe("forbidden");
    expect(
      (
        await err(
          as(mo, p, (ctx) =>
            cancelPrescriptionLine(ctx, { patientUserId: p, prescriptionId: rx, reasonCode: " " }),
          ),
        )
      )?.code,
    ).toBe("invalid");
    expect(
      (
        await err(
          as(mo, p, (ctx) =>
            cancelPrescriptionLine(ctx, {
              patientUserId: p,
              prescriptionId: rx,
              reasonCode: "changed",
              replacedBy: earlier,
            }),
          ),
        )
      )?.code,
    ).toBe("invalid");
    expect(await one(`SELECT state FROM public.prescriptions WHERE id = $1`, [rx])).toEqual({
      state: "active",
    });
    const first = await as(mo, p, (ctx) =>
      cancelPrescriptionLine(ctx, {
        patientUserId: p,
        prescriptionId: rx,
        reasonCode: "no_longer_needed",
      }),
    );
    const replay = await as(mo, p, (ctx) =>
      cancelPrescriptionLine(ctx, {
        patientUserId: p,
        prescriptionId: rx,
        reasonCode: "no_longer_needed",
      }),
    );
    expect(replay.id).toBe(first.id);
    expect(
      (
        await err(
          as(mo2, p, (ctx) =>
            cancelPrescriptionLine(ctx, {
              patientUserId: p,
              prescriptionId: rx,
              reasonCode: "other",
            }),
          ),
        )
      )?.code,
    ).toBe("conflict");
    expect(await stage(p, rx)).toBeUndefined(); // no query covers it: the pharmacy record holds nothing
    // Audited as the clinician (audit_log_changes, 0130).
    expect(
      await one(
        `SELECT actor_id FROM public.audit_log WHERE table_name = 'prescription_cancellations' AND record_id::text = $1`,
        [first.id],
      ),
    ).toEqual({ actor_id: mo.userId });
  });

  it("D-PH1-49: printing writes one print event per printed line of this visit", async () => {
    const { p, enc } = await visit();
    const a = await line(p, enc);
    const b = await line(p, enc);
    await as(mo, p, (ctx) =>
      recordPrescriptionPrint(ctx, { patientUserId: p, encounterId: enc, prescriptionIds: [a, b] }),
    );
    expect(
      await q(
        `SELECT prescription_id, printed_by FROM public.prescription_print_events WHERE patient_user_id = $1 ORDER BY prescription_id`,
        [p],
      ),
    ).toEqual([a, b].sort().map((id) => ({ prescription_id: id, printed_by: mo.userId })));
    const elsewhere = await visit();
    const other = await line(elsewhere.p, elsewhere.enc);
    expect(
      (
        await err(
          as(mo, p, (ctx) =>
            recordPrescriptionPrint(ctx, {
              patientUserId: p,
              encounterId: enc,
              prescriptionIds: [a, other],
            }),
          ),
        )
      )?.code,
    ).toBe("invalid");
  });
});
