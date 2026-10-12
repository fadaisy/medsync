/**
 * Pharmacy Phase 1, Step 5 (pharmacy side): review, queries and outcomes on the PGlite lane, every
 * migration replayed. Drives lib/pharmacy/review/store.ts through `runPharmacyWrite` (the action's own
 * path, Section 8) and reads back through lib/pharmacy/review/read.ts. The prescriber's answers are
 * written as the prescriber's store would write them (owner inserts), since that half is built
 * separately. Scenarios S12–S34 of docs/pharmacy/phase-1/PROMPT-PHARMACY-PHASE-1.md §9, Step 5.
 * Every medicine, batch and quantity is a fixture (Law 8).
 */
import { randomUUID } from "node:crypto";
import type { Lane, Pg } from "./_pglite";
import type { EmrDb } from "@/lib/emr/db";
import type { PharmacyActor, PharmacyCtx, PharmacyNeed } from "@/lib/pharmacy/write";
import type { z } from "zod";
import { beforeAll, describe, expect, it, vi } from "vitest";

import { PHARMACY_MAP_V2, pharmacyDispensingAccess } from "@/lib/pharmacy/access";
import { runPharmacyWrite } from "@/lib/pharmacy/write";
import { bootLane, department, encounter, hospital, laneOn, patient, staff } from "./_pglite";

vi.mock("server-only", () => ({}));
const held = vi.hoisted(() => ({ db: undefined as unknown }));
vi.mock("@/db", () => ({
  get db() {
    return held.db;
  },
}));

const store = await import("@/lib/pharmacy/review/store");
const read = await import("@/lib/pharmacy/review/read");

const DAY = 86_400_000;

describe.skipIf(!laneOn)("pharmacy review, queries and outcomes (Step 5, S12–S34)", () => {
  let lane: Lane;
  let pg: Pg;
  const f = {} as Record<string, string>;

  const one = async <T = { id: string }>(q: string, p?: unknown[]) =>
    (await pg.query<T>(q, p)).rows[0] as T;

  const actor = (
    userId: string,
    cadre: string,
    pointId: string | null = f.pointA!,
    hospitalId = f.hA!,
  ): PharmacyActor => ({
    userId,
    hospitalId,
    cadreCode: cadre,
    cadreName:
      cadre === "PHARMACIST"
        ? "Pharmacist"
        : cadre === "PHARMACY_TECH"
          ? "Pharmacy technician"
          : cadre,
    pointId,
    access: pharmacyDispensingAccess(cadre, PHARMACY_MAP_V2),
  });
  const pharmacist = () => actor(f.pharmacist!, "PHARMACIST");
  const tech = () => actor(f.tech!, "PHARMACY_TECH");

  /** The action's path: Zod → permission and point → one transaction. */
  const run = <I, R extends { id: string }>(
    a: PharmacyActor,
    schema: z.ZodType<I>,
    need: PharmacyNeed,
    write: (ctx: PharmacyCtx, input: I) => Promise<R>,
    raw: Record<string, unknown>,
    now?: Date,
  ) =>
    runPharmacyWrite(schema, { clientKey: randomUUID(), ...raw }, a, need, write, {
      database: lane.db,
      ...(now ? { now } : {}),
    });

  const accept = (a: PharmacyActor, lineId: string) =>
    run(a, store.LineInput, store.REVIEW_NEED, store.acceptLine, { lineId });
  const notSupplied = (a: PharmacyActor, lineId: string, outcome = "owed", extra = {}) =>
    run(a, store.NotSuppliedInput, store.DISPENSE_NEED, store.recordNotSupplied, {
      lineId,
      outcome,
      reasonCode: "out_point",
      ...extra,
    });
  /** sendQuery, then its delivery after commit (the action's two steps). */
  const query = async (a: PharmacyActor, lineId: string, whole = false) => {
    const r = await run(a, store.QueryInput, store.QUERY_NEED, store.sendQuery, {
      lineId,
      whole,
      typeCode: "dose",
      proposal: "Fixture proposal: please confirm the dose.",
      patientWaiting: true,
    });
    if (r.ok) await store.deliverQuery(a, r.id, r.data!, { database: lane.db });
    return r;
  };

  let line = 0;
  /** One placement of fixture lines; returns the line ids in order. */
  const place = async (
    lines: {
      drug?: string;
      answers?: unknown[];
      controlled?: boolean;
      regimen?: string | null;
      edits?: unknown[];
    }[],
    o: { encounterId?: string; createdAt?: Date; prescriber?: string } = {},
  ) => {
    const placement = randomUUID();
    const ids: string[] = [];
    for (const [i, l] of lines.entries()) {
      line += 1;
      ids.push(
        (
          await one(
            `INSERT INTO public.prescriptions
               (hospital_id, encounter_id, patient_user_id, prescriber_user_id, prescriber_cadre, drug_id, drug_name,
                dose, route, frequency, is_emergency, state, placement_id, placement_line, created_at, updated_at,
                check_answers, controlled, regimen_id, edits, confirm_reason_ciphertext)
             VALUES ($1, $2, $3, $4, 'MEDICAL_OFFICER', $5, $6, '[fixture dose]', 'oral', '[fixture frequency]',
                     false, 'active', $7, $8, $9, $9, $10::jsonb, $11, $12, $13::jsonb,
                     CASE WHEN $10::jsonb = '[]'::jsonb THEN NULL ELSE 'fixture-reason' END)
             RETURNING id`,
            [
              f.hA,
              o.encounterId ?? f.window,
              f.patient,
              o.prescriber ?? f.doctor,
              l.drug ?? "fixture_a",
              `Fixture medicine ${line}`,
              placement,
              i + 1,
              (o.createdAt ?? new Date()).toISOString(),
              JSON.stringify(l.answers ?? []),
              l.controlled ?? false,
              l.regimen === undefined ? "fixture_regimen" : l.regimen,
              JSON.stringify(l.edits ?? []),
            ],
          )
        ).id,
      );
    }
    return ids;
  };

  const queueRows = async (now?: Date) =>
    (await read.getReviewQueue(f.hA!, f.pointA!, lane.db, now)).rows;
  const review = async (lineId: string, now?: Date) =>
    (await read.getReviewOfLine(f.hA!, lineId, f.pointA!, lane.db, now))!;
  const statusOf = async (lineId: string, now?: Date) =>
    (await review(lineId, now)).lines.find((l) => l.id === lineId)!.status;
  const stage = async (lineId: string) => {
    const s = await statusOf(lineId);
    return s?.kind === "stage"
      ? s.stage
      : s?.kind === "open" || s?.kind === "closed"
        ? s.outcome
        : null;
  };
  /** The prescriber's half, as 0125 records it (that store is built separately). */
  const answer = (queryId: string, answer: "keep" | "changed", by = f.doctor!) =>
    pg.query(
      `INSERT INTO public.pharmacy_query_events (query_id, hospital_id, kind, answer, answer_reason_code, via,
         answered_by_user_id, actor_user_id) VALUES ($1, $2, 'answered', $3, 'intended', 'app', $4, $4)`,
      [queryId, f.hA, answer, by],
    );
  const replace = async (oldId: string) => {
    const [newId] = await place([{}]);
    await pg.query(
      `UPDATE public.prescriptions SET state = 'cancelled', updated_at = now() WHERE id = $1`,
      [oldId],
    );
    await pg.query(
      `INSERT INTO public.prescription_cancellations (prescription_id, hospital_id, patient_user_id, reason_code,
         replaced_by_prescription_id, actor_user_id) VALUES ($1, $2, $3, 'changed', $4, $5)`,
      [oldId, f.hA, f.patient, newId, f.doctor],
    );
    return newId!;
  };
  const signRule = (reasons: { code: string; on: boolean }[], version: number) =>
    pg.query(
      `INSERT INTO public.pharmacy_signed_sets (hospital_id, kind, version, content, sha256, status, authored_by,
         first_signer, second_signer, signed_at)
       VALUES ($1, 'lane_rule', $2, $3::jsonb, repeat('b', 64), 'signed', $4, $4, $5, now())`,
      [f.hA, version, JSON.stringify({ reasons }), f.pharmacist, f.doctor],
    );

  beforeAll(async () => {
    lane = await bootLane();
    pg = lane.pg;
    held.db = lane.db;
    for (const h of ["A", "B"]) {
      f[`h${h}`] = await hospital(pg, `Review ${h}`);
      f[`pharm${h}`] = (
        await one(
          `INSERT INTO public.hospital_departments (hospital_id, name, slug, kind, catalogue_code)
           VALUES ($1, 'Pharmacy', $2, 'support', 'PHARMACY') RETURNING id`,
          [f[`h${h}`], `ph-${h}-${Date.now()}`],
        )
      ).id;
      f[`point${h}`] = (
        await one(
          `INSERT INTO public.hospital_departments (hospital_id, parent_id, name, slug, kind)
           VALUES ($1, $2, 'Outpatient pharmacy', $3, 'support') RETURNING id`,
          [f[`h${h}`], f[`pharm${h}`], `op-${h}-${Date.now()}`],
        )
      ).id;
      await pg.query(
        `INSERT INTO public.pharmacy_dispensing_points (department_id, hospital_id, serves, live_at, phone)
         VALUES ($1, $2, 'window', now() - interval '40 days', '+256 700 000000')`,
        [f[`point${h}`], f[`h${h}`]],
      );
    }
    const clinic = await department(pg, f.hA!, "Clinic");
    f.pharmacist = (
      await staff(pg, { hospitalId: f.hA!, departmentId: f.pharmA!, cadre: "PHARMACIST" })
    ).userId;
    f.tech = (
      await staff(pg, { hospitalId: f.hA!, departmentId: f.pointA!, cadre: "PHARMACY_TECH" })
    ).userId;
    f.pharmacistB = (
      await staff(pg, { hospitalId: f.hB!, departmentId: f.pointB!, cadre: "PHARMACIST" })
    ).userId;
    f.doctor = (
      await staff(pg, { hospitalId: f.hA!, departmentId: clinic, cadre: "MEDICAL_OFFICER" })
    ).userId;
    f.doctor2 = (
      await staff(pg, { hospitalId: f.hA!, departmentId: clinic, cadre: "MEDICAL_OFFICER" })
    ).userId;
    f.nurse = (await staff(pg, { hospitalId: f.hA!, departmentId: clinic, cadre: "NURSE" })).userId;
    f.reception = (
      await staff(pg, { hospitalId: f.hA!, departmentId: clinic, cadre: "RECEPTION" })
    ).userId;
    await pg.query(
      `INSERT INTO public.clinical_cosign_policies (hospital_id, cadre_code, action_kind, requirement)
       VALUES ($1, 'MEDICAL_OFFICER', 'prescription_routine', 'allowed') ON CONFLICT DO NOTHING`,
      [f.hA],
    );
    f.patient = await patient(pg);
    f.window = await encounter(pg, {
      hospitalId: f.hA!,
      patientUserId: f.patient!,
      clinicianUserId: f.doctor!,
      departmentId: clinic,
    });
    await pg.query(`UPDATE public.encounters SET disposition = 'home' WHERE id = $1`, [f.window]);
    f.ward = await encounter(pg, {
      hospitalId: f.hA!,
      patientUserId: f.patient!,
      clinicianUserId: f.doctor!,
    });
    await pg.query(`UPDATE public.encounters SET encounter_type = 'inpatient' WHERE id = $1`, [
      f.ward,
    ]);
    // Stock of fixture_a at point A: one product, one batch of 100.
    f.product = (
      await one(
        `INSERT INTO public.pharmacy_products (hospital_id, medicine_id, name, issue_unit, created_by)
         VALUES ($1, 'fixture_a', 'Fixture medicine A 100s', 'tablet', $2) RETURNING id`,
        [f.hA, f.pharmacist],
      )
    ).id;
    await pg.query(
      `INSERT INTO public.pharmacy_product_points (product_id, dispensing_point_id, hospital_id) VALUES ($1, $2, $3)`,
      [f.product, f.pointA, f.hA],
    );
    f.batch = (
      await one(
        `INSERT INTO public.pharmacy_batches (hospital_id, dispensing_point_id, product_id, batch_number, expiry,
           first_batch_number, first_expiry, created_by)
         VALUES ($1, $2, $3, 'FX-001', '2099-03-31', 'FX-001', '2099-03-31', $4) RETURNING id`,
        [f.hA, f.pointA, f.product, f.pharmacist],
      )
    ).id;
    await pg.query(
      `INSERT INTO public.pharmacy_stock_movements (hospital_id, dispensing_point_id, batch_id, kind, quantity,
         effective_at, actor_user_id, source_kind) VALUES ($1, $2, $3, 'received', 100, now(), $4, 'delivery')`,
      [f.hA, f.pointA, f.batch, f.pharmacist],
    );
  }, 180_000);

  it("S12: with no signed rule every prescription is pharmacist-first; with one, the signed reasons decide", async () => {
    const [plain] = await place([{}]);
    const before = await read.getReviewQueue(f.hA!, f.pointA!, lane.db);
    expect(before.rule.signed).toBe(false);
    expect(before.rows.find((r) => r.firstLineId === plain)?.lane).toBe("pharmacist_first");

    await signRule(
      [
        { code: "overridden_stop", on: true },
        { code: "child_check", on: true },
        { code: "renal_check", on: true },
        { code: "preset_dose_changed", on: true },
        { code: "typed_dose", on: false },
      ],
      1,
    );
    const [stop] = await place([
      { answers: [{ code: "allergy", answer: "not_allergic", outcome: "stop" }] },
    ]);
    const [controlled] = await place([{ controlled: true }]);
    const [edited] = await place([{ edits: [{ field: "dose", from: "a", to: "b" }] }]);
    const after = await read.getReviewQueue(f.hA!, f.pointA!, lane.db);
    const laneOf = (id: string) => after.rows.find((r) => r.firstLineId === id);
    expect(after.rule.signed).toBe(true);
    expect(laneOf(plain!)?.lane).toBe("standard");
    expect(laneOf(stop!)).toMatchObject({ lane: "pharmacist_first", reasons: ["overridden_stop"] });
    expect(laneOf(controlled!)).toMatchObject({
      lane: "pharmacist_first",
      reasons: ["controlled"],
    });
    expect(laneOf(edited!)).toMatchObject({
      lane: "pharmacist_first",
      reasons: ["preset_dose_changed"],
    });
    expect(after.rule.reasonsOn).toContain("controlled"); // LN-5, always on
  });

  it("S13: a technician is read-only on a pharmacist-first line; forged accept and not-supplied are refused", async () => {
    const [id] = await place([{ edits: [{ field: "dose", from: "a", to: "b" }] }]);
    const forgedAccept = await accept(tech(), id!);
    expect(forgedAccept).toMatchObject({ ok: false, code: "forbidden" });
    const forgedOwed = await notSupplied(tech(), id!);
    expect(forgedOwed).toMatchObject({ ok: false, code: "conflict" });
    if (!forgedOwed.ok) expect(forgedOwed.error).toMatch(/Waiting for a pharmacist/);
    const decision = await run(
      tech(),
      store.DecisionsInput,
      store.DISPENSE_NEED,
      store.saveLineDecisions,
      {
        decisions: [{ lineId: id, kind: "full", quantity: 10 }],
      },
    );
    expect(decision).toMatchObject({ ok: false, code: "conflict" });
    expect(await stage(id!)).toBe("to_review");
    // Once a pharmacist accepts, the technician may decide on the line (Appendix A).
    expect(await accept(pharmacist(), id!)).toMatchObject({ ok: true });
    expect(
      await run(tech(), store.DecisionsInput, store.DISPENSE_NEED, store.saveLineDecisions, {
        decisions: [{ lineId: id, kind: "full", quantity: 10 }],
      }),
    ).toMatchObject({ ok: true });
  });

  it("S14: 'Reason accepted, supply' records the override was read; 'Accept the remaining lines' leaves a flagged line", async () => {
    const [stopLine, plain1, plain2] = await place([
      { answers: [{ code: "allergy", answer: "not_allergic", outcome: "stop" }] },
      {},
      {},
    ]);
    const rest = await run(
      pharmacist(),
      store.LineInput,
      store.REVIEW_NEED,
      store.acceptRemainingLines,
      {
        lineId: stopLine,
      },
    );
    expect(rest).toMatchObject({ ok: true, data: { accepted: 2 } });
    expect(await stage(plain1!)).toBe("ready");
    expect(await stage(plain2!)).toBe("ready");
    expect(await stage(stopLine!)).toBe("to_review");
    expect(await accept(pharmacist(), stopLine!)).toMatchObject({ ok: true });
    const { kind } = await one<{ kind: string }>(
      `SELECT kind FROM public.pharmacy_line_events WHERE prescription_id = $1`,
      [stopLine],
    );
    expect(kind).toBe("accepted_overridden_stop");
    expect(await stage(stopLine!)).toBe("ready");
  });

  it("S15 (pharmacy half): a query on one line of three; the others can still be decided; the prescriber is notified on user:<id>", async () => {
    const [a, b, c] = await place([{}, {}, {}]);
    const sent = await query(pharmacist(), a!);
    expect(sent.ok).toBe(true);
    if (!sent.ok) return;
    const d = await store.deliverQuery(pharmacist(), sent.id, sent.data!, { database: lane.db });
    expect(d).toMatchObject({ delivered: true, caution: false });
    expect(d.words).toMatch(/^Query sent \d\d:\d\d · not answered$/);
    expect(await stage(a!)).toBe("queried");
    const ev = await one<{ kind: string; recipient_user_id: string }>(
      `SELECT kind, recipient_user_id FROM public.pharmacy_query_events WHERE query_id = $1`,
      [sent.id],
    );
    expect(ev).toEqual({ kind: "notified", recipient_user_id: f.doctor });
    const msg = await one<{ topic: string; payload: Record<string, unknown> }>(
      `SELECT topic, payload FROM realtime.messages WHERE topic = 'user:' || $1 ORDER BY id DESC LIMIT 1`,
      [f.doctor],
    );
    expect(msg.topic).toBe(`user:${f.doctor}`);
    expect(msg.payload.ref).toBe(sent.id);
    expect(
      await run(pharmacist(), store.DecisionsInput, store.DISPENSE_NEED, store.saveLineDecisions, {
        decisions: [
          { lineId: b, kind: "full", quantity: 5 },
          { lineId: c, kind: "full", quantity: 5 },
        ],
      }),
    ).toMatchObject({ ok: true });
    expect([await stage(b!), await stage(c!)]).toEqual(["ready", "ready"]);
    const rq = await review(a!);
    expect(rq.queries[0]).toMatchObject({ state: "open", caution: false });
  });

  it("S19 (pharmacy half): a whole-prescription query puts every line to review or ready at Queried; one change does not close it", async () => {
    const [a, b] = await place([{}, {}]);
    await run(pharmacist(), store.DecisionsInput, store.DISPENSE_NEED, store.saveLineDecisions, {
      decisions: [{ lineId: b, kind: "full", quantity: 5 }],
    });
    const sent = await query(pharmacist(), a!, true);
    expect(sent.ok).toBe(true);
    if (!sent.ok) return;
    expect([await stage(a!), await stage(b!)]).toEqual(["queried", "queried"]);
    const a2 = await replace(a!);
    expect(await stage(a!)).toBe("replaced");
    expect(await stage(a2)).toBe("to_review"); // the new line enters as a new line
    expect(await stage(b!)).toBe("queried"); // the query is still open
    const rv = await review(b!);
    expect(rv.lines.find((l) => l.id === a)?.replacedAt).not.toBeNull();
    expect(rv.queries[0]!.state).toBe("open");
    await answer(sent.id, "changed"); // "Changes made"
    expect(await stage(b!)).toBe("to_review");
  });

  it("S20: delivery made to fail — the query stands, the words say NOT told, nothing threw", async () => {
    const [a] = await place([{}]);
    const sent = await run(pharmacist(), store.QueryInput, store.QUERY_NEED, store.sendQuery, {
      lineId: a,
      typeCode: "dose",
      proposal: "Fixture proposal.",
    });
    expect(sent.ok).toBe(true);
    if (!sent.ok) return;
    const broken = {
      transaction: () => Promise.reject(new Error("fixture: delivery down")),
    } as unknown as EmrDb;
    const d = await store.deliverQuery(pharmacist(), sent.id, sent.data!, { database: broken });
    expect(d).toEqual({
      delivered: false,
      caution: true,
      words: "The prescriber has NOT been told. Call them and log the call.",
    });
    expect(await stage(a!)).toBe("queried");
    const q = (await review(a!)).queries[0]!;
    expect(q).toMatchObject({ state: "not_sent", caution: true });
    expect(q.words).toBe("The prescriber has NOT been told. Call them and log the call.");
  });

  it("S21: nobody to tell — not sent, a phone keep answers it; second run: withdrawn and recorded as owed", async () => {
    const leaver = (
      await staff(pg, { hospitalId: f.hA!, departmentId: f.pharmA!, cadre: "MEDICAL_OFFICER" })
    ).userId;
    const enc = await encounter(pg, {
      hospitalId: f.hA!,
      patientUserId: f.patient!,
      clinicianUserId: leaver,
    });
    await pg.query(`UPDATE public.encounters SET disposition = 'home' WHERE id = $1`, [enc]);
    await pg.query(`UPDATE public.staff_affiliations SET state = 'suspended' WHERE user_id = $1`, [
      leaver,
    ]);
    const [a] = await place([{}], { encounterId: enc, prescriber: leaver });
    const sent = await query(pharmacist(), a!);
    expect(sent.ok && sent.data!.recipients).toEqual([]);
    if (!sent.ok) return;
    const d = await store.deliverQuery(pharmacist(), sent.id, sent.data!, { database: lane.db });
    expect(d.words).toBe("Nobody can be told in MedSync. Call the ward or clinic.");
    expect((await review(a!)).queries[0]).toMatchObject({ state: "not_sent", caution: true });
    const phoned = await run(
      pharmacist(),
      store.PhoneInput,
      store.QUERY_NEED,
      store.logPhoneAnswer,
      {
        queryId: sent.id,
        clinicianUserId: f.doctor2,
        said: "keep",
        reasonCode: "intended",
      },
    );
    expect(phoned).toMatchObject({ ok: true, data: { answered: true } });
    expect(await stage(a!)).toBe("to_review");

    const [b] = await place([{}], { encounterId: enc, prescriber: leaver });
    const sent2 = await query(pharmacist(), b!);
    if (!sent2.ok) throw new Error(sent2.error);
    const w = await run(pharmacist(), store.WithdrawInput, store.QUERY_NEED, store.withdrawQuery, {
      queryId: sent2.id,
      reasonCode: "unreachable",
    });
    expect(w.ok).toBe(true);
    expect(await stage(b!)).toBe("to_review");
    expect(await notSupplied(pharmacist(), b!)).toMatchObject({ ok: true });
    expect(await stage(b!)).toBe("owed");
  });

  it("S22: a phone keep answers via phone; the named clinician disputes; it reopens and the line is Queried", async () => {
    const [a] = await place([{}]);
    const sent = await query(pharmacist(), a!);
    if (!sent.ok) throw new Error(sent.error);
    await run(pharmacist(), store.PhoneInput, store.QUERY_NEED, store.logPhoneAnswer, {
      queryId: sent.id,
      clinicianUserId: f.doctor,
      said: "keep",
      reasonCode: "intended",
    });
    const ev = await one<{ via: string; answered_by_user_id: string; actor_user_id: string }>(
      `SELECT via, answered_by_user_id, actor_user_id FROM public.pharmacy_query_events
        WHERE query_id = $1 AND kind = 'answered'`,
      [sent.id],
    );
    expect(ev).toEqual({
      via: "phone",
      answered_by_user_id: f.doctor,
      actor_user_id: f.pharmacist,
    });
    expect(await stage(a!)).toBe("to_review");
    expect((await review(a!)).queries[0]!.words).toMatch(/^Answered by phone: kept as written/);
    // A "will change it" call answers nothing.
    const [b] = await place([{}]);
    const sentB = await query(pharmacist(), b!);
    if (!sentB.ok) throw new Error(sentB.error);
    expect(
      await run(pharmacist(), store.PhoneInput, store.QUERY_NEED, store.logPhoneAnswer, {
        queryId: sentB.id,
        clinicianUserId: f.doctor,
        said: "change",
      }),
    ).toMatchObject({ ok: true, data: { answered: false } });
    expect(await stage(b!)).toBe("queried");
    // The prescriber's dispute (their store), then the pharmacy reads it reopened.
    await pg.query(
      `INSERT INTO public.pharmacy_query_events (query_id, hospital_id, kind, actor_user_id) VALUES ($1, $2, 'disputed', $3)`,
      [sent.id, f.hA, f.doctor],
    );
    expect(await stage(a!)).toBe("queried");
    expect((await review(a!)).queries[0]!.state).toBe("open");
  });

  it("S24: owed is listed under Open lines; nothing was supplied", async () => {
    const [a] = await place([{}]);
    expect(await notSupplied(pharmacist(), a!, "owed", { quantityNotSupplied: 14 })).toMatchObject({
      ok: true,
    });
    const open = await read.getOpenLines(f.hA!, lane.db);
    expect(open.rows.find((r) => r.lineId === a)).toMatchObject({
      outcome: "owed",
      notSupplied: 14,
      supplied: 0,
    });
    const { n } = await one<{ n: number }>(
      `SELECT count(*)::int AS n FROM public.pharmacy_supplies WHERE prescription_id = $1`,
      [a],
    );
    expect(n).toBe(0);
    // Stock is on the shelf here: the review shows it (Supply now comes with the hand-over, Step 6).
    expect((await review(a!)).lines[0]!.shelf).toMatchObject({ state: "on_shelf", quantity: 100 });
  });

  it("S25: buying outside prints a slip whose code resolves here only; a controlled line is never sent outside", async () => {
    const [a] = await place([{}]);
    await notSupplied(pharmacist(), a!, "buying_outside");
    const slip = await run(pharmacist(), store.LineInput, store.DISPENSE_NEED, store.printSlip, {
      lineId: a,
    });
    expect(slip.ok).toBe(true);
    if (!slip.ok) return;
    const { code } = await one<{ code: string }>(
      `SELECT code FROM public.pharmacy_slips WHERE id = $1`,
      [slip.id],
    );
    expect(code).toMatch(/^[A-HJKMNP-Z2-9]{8,12}$/);
    expect(await read.findSlipByCode(f.hA!, code, lane.db)).toEqual({ id: slip.id });
    expect(await read.findSlipByCode(f.hB!, code, lane.db)).toBeNull();
    const printed = await read.getSlip(
      f.hA!,
      slip.id,
      async () => ({ name: "Fixture Patient", medsyncNumber: "MS-FIXTURE", sexAndAge: "F · 40 y" }),
      lane.db,
    );
    expect(printed?.result.ok).toBe(true);
    if (printed?.result.ok) {
      expect(printed.result.slip.verification).toContain(code);
      expect(printed.result.slip.lines[0]!.quantity).toBe("Quantity: as on the prescription");
    }
    expect(
      await read.getSlip(
        f.hB!,
        slip.id,
        async () => ({ name: "", medsyncNumber: "", sexAndAge: "" }),
        lane.db,
      ),
    ).toBeNull();
    const { n } = await one<{ n: number }>(
      `SELECT count(*)::int AS n FROM public.pharmacy_print_events WHERE ref_id = $1 AND kind = 'slip'`,
      [slip.id],
    );
    expect(n).toBe(1);

    const [cd] = await place([{ controlled: true }]);
    await accept(pharmacist(), cd!);
    const refused = await notSupplied(pharmacist(), cd!, "buying_outside");
    expect(refused).toMatchObject({ ok: false, code: "conflict" });
    if (!refused.ok)
      expect(refused.error).toMatch(/controlled drug cannot be sent to another pharmacy/);
    expect(await stage(cd!)).toBe("ready");
  });

  it("S26: owed changes to buying outside and prints; buying outside changes back to owed", async () => {
    const [a] = await place([{}]);
    await notSupplied(pharmacist(), a!, "owed");
    expect(
      await run(pharmacist(), store.LineInput, store.DISPENSE_NEED, store.changeOpenOutcome, {
        lineId: a,
      }),
    ).toMatchObject({ ok: true });
    expect(await stage(a!)).toBe("buying_outside");
    expect(
      (
        await run(pharmacist(), store.LineInput, store.DISPENSE_NEED, store.printSlip, {
          lineId: a,
        })
      ).ok,
    ).toBe(true);
    await run(pharmacist(), store.LineInput, store.DISPENSE_NEED, store.changeOpenOutcome, {
      lineId: a,
    });
    expect(await stage(a!)).toBe("owed");
  });

  it("S28: awaiting co-signature — read and queried, no decision; after co-signature, To review", async () => {
    const [a] = await place([{}]);
    const req = await one(
      `INSERT INTO public.clinical_cosign_requests (hospital_id, patient_user_id, requested_by_user_id,
         requested_by_affiliation_id, requested_by_cadre_code, action_kind, action_payload, state)
       VALUES ($1, $2, $3, (SELECT id FROM public.staff_affiliations WHERE user_id = $3 LIMIT 1), 'MEDICAL_OFFICER',
               'prescription_routine', $4::jsonb, 'pending_review') RETURNING id`,
      [f.hA, f.patient, f.doctor, JSON.stringify({ prescriptionId: a, encounterId: f.window })],
    );
    expect(await stage(a!)).toBe("awaiting_cosign");
    const decision = await run(
      pharmacist(),
      store.DecisionsInput,
      store.DISPENSE_NEED,
      store.saveLineDecisions,
      {
        decisions: [{ lineId: a, kind: "full", quantity: 5 }],
      },
    );
    expect(decision).toMatchObject({ ok: false });
    if (!decision.ok) expect(decision.error).toMatch(/A senior has not signed/);
    const sent = await query(pharmacist(), a!);
    expect(sent.ok).toBe(true);
    expect(await stage(a!)).toBe("awaiting_cosign");
    if (sent.ok)
      await run(pharmacist(), store.WithdrawInput, store.QUERY_NEED, store.withdrawQuery, {
        queryId: sent.id,
        reasonCode: "sent_in_error",
      });
    await pg.query(
      `UPDATE public.clinical_cosign_requests SET state = 'approved', reviewed_by_user_id = $2, reviewed_at = now() WHERE id = $1`,
      [req.id, f.doctor2],
    );
    expect(await stage(a!)).toBe("to_review");
  });

  it("S29: no decline before a query; decline after a keep; decline while open closes the query", async () => {
    const [a] = await place([{}]);
    const early = await run(
      pharmacist(),
      store.DeclineInput,
      store.REVIEW_NEED,
      store.declineLine,
      {
        lineId: a,
        reasonCode: "incomplete",
      },
    );
    expect(early).toMatchObject({ ok: false, code: "conflict" });
    const sent = await query(pharmacist(), a!);
    if (!sent.ok) throw new Error(sent.error);
    await answer(sent.id, "keep");
    expect(await stage(a!)).toBe("to_review");
    const declined = await run(
      pharmacist(),
      store.DeclineInput,
      store.REVIEW_NEED,
      store.declineLine,
      {
        lineId: a,
        reasonCode: "concern_stands",
      },
    );
    expect(declined.ok).toBe(true);
    expect(await stage(a!)).toBe("declined");
    const told = await one<{ patient_told: string }>(
      `SELECT patient_told FROM public.pharmacy_line_events WHERE prescription_id = $1 AND kind = 'declined'`,
      [a],
    );
    expect(told.patient_told).toBe(
      "The pharmacy did not give this medicine. Speak to your doctor or the pharmacy.",
    );

    const [b] = await place([{}]);
    const open = await query(pharmacist(), b!);
    if (!open.ok) throw new Error(open.error);
    expect(
      (
        await run(pharmacist(), store.DeclineInput, store.REVIEW_NEED, store.declineLine, {
          lineId: b,
          reasonCode: "other",
          note: "Fixture: cannot supply as written.",
        })
      ).ok,
    ).toBe(true);
    expect(await stage(b!)).toBe("declined");
    expect((await review(b!)).queries[0]!.state).toBe("withdrawn");
  });

  it("S30: thirty days on, open stages and outcomes are still listed; close as not collected", async () => {
    const old = new Date(Date.now() - 2 * DAY);
    const [a, b] = await place([{}, {}], { createdAt: old });
    await notSupplied(pharmacist(), b!, "owed");
    const later = new Date(Date.now() + 30 * DAY);
    const row = (await queueRows(later)).find((r) => r.firstLineId === a);
    expect(row).toMatchObject({ earlier: true, stage: "to_review" });
    expect(row!.ageDays).toBeGreaterThanOrEqual(31);
    expect((await read.getOpenLines(f.hA!, lane.db)).rows.some((r) => r.lineId === b)).toBe(true);
    const closed = await run(
      pharmacist(),
      store.CloseInput,
      store.CLOSE_NEED,
      store.closePrescriptionNotCollected,
      {
        lineId: a,
        reasonCode: "not_collected",
        note: "Fixture: never came back.",
      },
    );
    expect(closed.ok).toBe(true);
    expect(await stage(a!)).toBe("closed");
    expect(await stage(b!)).toBe("owed"); // an open outcome stays in Open lines
    expect((await queueRows()).some((r) => r.firstLineId === a)).toBe(false);
    // Written today: refused.
    const [c] = await place([{}]);
    expect(
      await run(
        pharmacist(),
        store.CloseInput,
        store.CLOSE_NEED,
        store.closePrescriptionNotCollected,
        {
          lineId: c,
          reasonCode: "not_collected",
        },
      ),
    ).toMatchObject({ ok: false, code: "conflict" });
  });

  it("S31: a bought-outside line confirmed filled; who said so is stored and the line is closed", async () => {
    const [a] = await place([{}]);
    await notSupplied(pharmacist(), a!, "buying_outside");
    const r = await run(tech(), store.FilledInput, store.CLOSE_NEED, store.confirmFilledElsewhere, {
      lineId: a,
      saidBy: "other_pharmacy",
      name: "Fixture Pharmacy",
    });
    expect(r.ok).toBe(true);
    const ev = await one<{ reason_code: string; reason_note: string }>(
      `SELECT reason_code, reason_note FROM public.pharmacy_line_events WHERE prescription_id = $1 AND kind = 'filled_elsewhere'`,
      [a],
    );
    expect(ev).toEqual({ reason_code: "other_pharmacy", reason_note: "Fixture Pharmacy" });
    expect(await statusOf(a!)).toMatchObject({
      kind: "closed",
      outcome: "closed",
      reasonCode: "filled_elsewhere",
    });
  });

  it("S32: written before the first point went live — out of scope until brought into the queue", async () => {
    const [a] = await place([{}], { createdAt: new Date(Date.now() - 60 * DAY) });
    expect((await queueRows()).some((r) => r.firstLineId === a)).toBe(false);
    expect(await review(a!)).toMatchObject({ scope: "out", beforeGoLive: true });
    expect(await accept(pharmacist(), a!)).toMatchObject({ ok: false, code: "conflict" });
    const brought = await run(
      pharmacist(),
      store.LineInput,
      store.DISPENSE_NEED,
      store.bringIntoQueue,
      { lineId: a },
    );
    expect(brought.ok).toBe(true);
    expect((await queueRows()).find((r) => r.firstLineId === a)).toMatchObject({ earlier: true });
  });

  it("S33: inpatient supply off — a pharmacist-first ward prescription is review-only; a standard one never appears", async () => {
    const [pf] = await place([{ edits: [{ field: "dose", from: "a", to: "b" }] }], {
      encounterId: f.ward,
    });
    const [std] = await place([{}], { encounterId: f.ward });
    const rows = await queueRows();
    expect(rows.find((r) => r.firstLineId === pf)).toMatchObject({
      origin: "ward",
      lane: "pharmacist_first",
    });
    expect(rows.some((r) => r.firstLineId === std)).toBe(false);
    expect((await review(pf!)).scope).toBe("review_only");
    const decision = await run(
      pharmacist(),
      store.DecisionsInput,
      store.DISPENSE_NEED,
      store.saveLineDecisions,
      {
        decisions: [{ lineId: pf, kind: "full", quantity: 5 }],
      },
    );
    expect(decision).toMatchObject({ ok: false });
    if (!decision.ok)
      expect(decision.error).toBe(
        "Ward doses come from ward stock, which MedSync does not count yet.",
      );
    expect(await accept(pharmacist(), pf!)).toMatchObject({ ok: true });
    expect(await stage(pf!)).toBe("reviewed");
    expect((await queueRows()).some((r) => r.firstLineId === pf)).toBe(false);
  });

  it("S34: a nurse, a receptionist and another hospital's pharmacist are refused at every action", async () => {
    const [a] = await place([{}]);
    const sent = await query(pharmacist(), a!);
    if (!sent.ok) throw new Error(sent.error);
    const outsiders = [
      actor(f.nurse!, "NURSE"),
      actor(f.reception!, "RECEPTION"),
      actor(f.pharmacistB!, "PHARMACIST", f.pointB!, f.hB!),
    ];
    const calls: [
      z.ZodType<unknown>,
      PharmacyNeed,
      (ctx: PharmacyCtx, i: never) => Promise<{ id: string }>,
      Record<string, unknown>,
    ][] = [
      [store.LineInput, store.REVIEW_NEED, store.acceptLine, { lineId: a }],
      [store.LineInput, store.REVIEW_NEED, store.acceptRemainingLines, { lineId: a }],
      [
        store.DeclineInput,
        store.REVIEW_NEED,
        store.declineLine,
        { lineId: a, reasonCode: "incomplete" },
      ],
      [
        store.DecisionsInput,
        store.DISPENSE_NEED,
        store.saveLineDecisions,
        { decisions: [{ lineId: a, kind: "full", quantity: 1 }] },
      ],
      [
        store.PaymentInput,
        store.DISPENSE_NEED,
        store.setPaymentStatus,
        { lineId: a, status: "paid" },
      ],
      [store.LineInput, store.DISPENSE_NEED, store.bringIntoQueue, { lineId: a }],
      [
        store.WithoutReviewInput,
        store.DISPENSE_NEED,
        store.recordSupplyWithoutReview,
        { lineId: a, reasonCode: "no_pharmacist" },
      ],
      [
        store.QueryInput,
        store.QUERY_NEED,
        store.sendQuery,
        { lineId: a, typeCode: "dose", proposal: "Fixture" },
      ],
      [
        store.PhoneInput,
        store.QUERY_NEED,
        store.logPhoneAnswer,
        { queryId: sent.id, clinicianUserId: f.doctor, said: "keep", reasonCode: "intended" },
      ],
      [
        store.WithdrawInput,
        store.QUERY_NEED,
        store.withdrawQuery,
        { queryId: sent.id, reasonCode: "sent_in_error" },
      ],
      [
        store.NotSuppliedInput,
        store.DISPENSE_NEED,
        store.recordNotSupplied,
        { lineId: a, outcome: "owed", reasonCode: "out_point" },
      ],
      [store.LineInput, store.DISPENSE_NEED, store.changeOpenOutcome, { lineId: a }],
      [
        store.FilledInput,
        store.CLOSE_NEED,
        store.confirmFilledElsewhere,
        { lineId: a, saidBy: "patient" },
      ],
      [
        store.CloseInput,
        store.CLOSE_NEED,
        store.closeLine,
        { lineId: a, reasonCode: "patient_declined" },
      ],
      [
        store.CloseInput,
        store.CLOSE_NEED,
        store.closePrescriptionNotCollected,
        { lineId: a, reasonCode: "not_collected" },
      ],
      [store.LineInput, store.DISPENSE_NEED, store.printSlip, { lineId: a }],
    ];
    const before = await one<{ n: number }>(
      `SELECT count(*)::int AS n FROM public.pharmacy_line_events`,
    );
    for (const who of outsiders)
      for (const [schema, need, write, raw] of calls) {
        const r = await run(
          who,
          schema,
          need,
          write as (ctx: PharmacyCtx, i: unknown) => Promise<{ id: string }>,
          raw,
        );
        expect(r.ok, `${who.cadreCode} ${write.name}`).toBe(false);
      }
    const after = await one<{ n: number }>(
      `SELECT count(*)::int AS n FROM public.pharmacy_line_events`,
    );
    expect(after.n).toBe(before.n);
    expect(await stage(a!)).toBe("queried");
  });

  it("Law 2: no pharmacy write touches a prescription row", async () => {
    const { n } = await one<{ n: number }>(
      `SELECT count(*)::int AS n FROM public.audit_log
        WHERE table_name = 'prescriptions' AND actor_id IN ($1, $2)`,
      [f.pharmacist, f.tech],
    );
    expect(n).toBe(0);
  });
});
