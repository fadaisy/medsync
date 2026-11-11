import "server-only";

import { randomUUID } from "node:crypto";
import type { DemoPatient, DemoState, PointKey } from "./state";
import type { Admin } from "@/lib/pharmacy/golive/store";
import { sql } from "drizzle-orm";

import { asClinicalWriter } from "@/lib/emr/db";
import { rowsOf } from "@/lib/exchange/store";
import * as dt from "@/lib/pharmacy/downtime-store";
import { getPharmacyReadiness, openRequest } from "@/lib/pharmacy/golive/read";
import * as gl from "@/lib/pharmacy/golive/store";
import * as rf from "@/lib/pharmacy/refill-store";
import { localDate } from "@/lib/pharmacy/stock/ledger";
import { addDays } from "@/lib/pharmacy/stores/ledger";
import * as supply from "@/lib/pharmacy/supply/store";
import {
  at,
  bump,
  chiefActor,
  DAY,
  DEMO_DOSE,
  demoAccount,
  demoHead,
  one,
  pharmacyActor,
  q,
  signSet,
  write,
} from "./state";

type Six<T> = [T, T, T, T, T, T];
type Eight<T> = [T, T, T, T, T, T, T, T];
/**
 * Sections 13–14 (ADR 0450). Network: the NCD and ART clinic patients' repeat medicines, last month's first supplies,
 * refill requests on every tab of the refills board (never routed to a partner: Step 6 is not built), renewals for the
 * doctor, saved collectors, and the packs these read. Go-live: briefings, a drill and an in-charge per point, pilot
 * notes, the points' switch-on decisions and one waiting switch-off request. Legal answers are never written.
 */

const MIN = 60_000;
const SUPPLY = 28; // units per supply, and the days each covers (demo values)

/** The packs the refills board, the patient's page and the doctor's renewals read. Every number is a demo value. */
async function packs(s: DemoState) {
  await signSet(s, "repeat_rules", {
    repeatList: [
      "amlodipine",
      "enalapril",
      "losartan",
      "hydrochlorothiazide",
      "atorvastatin",
      "aspirin",
      "metformin",
      "glibenclamide",
      "tld",
      "dolutegravir",
      "co_trimoxazole",
    ],
    neverRepeat: [],
    maxSupplies: 5,
    maxPeriodDays: 365,
    minIntervalDays: 14,
    toleranceDays: 2,
  });
  await signSet(s, "hold_rules", {
    holdDays: 7,
    extensions: 1,
    holdLongerMaxDays: 21,
    missThreshold: 2,
  });
  await signSet(s, "refill_timing", { requestWindowDays: 5, lateWindowDays: 7 });
  await signSet(s, "renewal_decline_reasons", {
    items: [
      { code: "review_visit_needed", words: "Demo reason: the patient needs a review visit first" },
      {
        code: "medicine_changed",
        words: "Demo reason: the medicine was changed at the last visit",
      },
      { code: "not_continued", words: "Demo reason: the medicine is not to be continued" },
    ],
  });
  return (
    await one<{ version: number }>(
      s,
      sql`SELECT max(version)::int AS version FROM pharmacy_signed_sets
        WHERE hospital_id = ${s.h} AND kind = 'repeat_rules' AND status = 'signed'`,
    )
  ).version;
}

/** Section 13: /pharmacy/refills (every tab but the partner one), /doctor/renewals, the NCD and ART patients' medicines. */
export async function networkSection(s: DemoState): Promise<void> {
  const ruleVersion = await packs(s);
  const today = localDate(s.now);
  const ago = (minutes: number) => new Date(s.now.getTime() - minutes * MIN);
  const ncd = s.patients.filter((p) => p.clinic === "ncd");
  const art = s.patients.filter((p) => p.clinic === "art");
  const prescriberOf = (p: DemoPatient) =>
    p.point === "art"
      ? { id: s.people.doctors[3]!, cadre: "MEDICAL_OFFICER" }
      : { id: s.people.doctors[2]!, cadre: "CONSULTANT" };
  // Who hands over: the ART clinic has its own pharmacist; the NCD clinic pharmacy's pharmacist is the chief.
  const pharmacist = (k: PointKey) =>
    k === "art"
      ? pharmacyActor(s, s.people.pharmacists[5]!, "PHARMACIST", "art")
      : chiefActor(s, k);
  // The cadre's own name, as the pharmacy actor carries it (never a literal title).
  const cadreName = chiefActor(s, null).cadreName;
  const tech = (k: PointKey) =>
    pharmacyActor(s, s.people.techs[Object.keys(s.points).indexOf(k)]!, "PHARMACY_TECH", k);

  /**
   * A clinic prescription with repeats and its first supply `first` days ago, written as the refills tests write them:
   * the line, its authorisation, then the hand-over, supply and movement in one transaction (Law 3), and the line events.
   */
  const line = async (
    p: DemoPatient,
    medicineId: string,
    o: { first: number; n?: number; interval?: number; expiredDaysAgo?: number },
  ) => {
    const m = s.medicines.find((x) => x.id === medicineId)!;
    const shelf = s.stock.get(medicineId)?.get(p.point);
    if (!shelf) throw new Error(`The demo has no ${medicineId} at the ${p.point} point.`);
    const by = prescriberOf(p);
    const written = (o.expiredDaysAgo ? at(s, 100, 9) : at(s, o.first + 1, 9)).toISOString();
    const rx = (
      await one<{ id: string }>(
        s,
        sql`INSERT INTO prescriptions (hospital_id, patient_user_id, prescriber_user_id, prescriber_cadre, drug_id, drug_name,
            dose, route, frequency, is_emergency, state, placement_id, created_at, updated_at)
          VALUES (${s.h}, ${p.id}, ${by.id}, ${by.cadre}, ${m.id}, ${m.name}, ${DEMO_DOSE}, 'oral', ${DEMO_DOSE}, false,
            'active', gen_random_uuid(), ${written}::timestamptz, ${written}::timestamptz) RETURNING id`,
      )
    ).id;
    await s.db
      .execute(sql`INSERT INTO prescription_repeat_authorisations (hospital_id, patient_user_id, prescription_id,
        further_supplies, min_interval_days, not_after, review_by, rule_version, prescriber_user_id, prescriber_cadre,
        authorised_at)
      VALUES (${s.h}, ${p.id}, ${rx}, ${o.n ?? 3}, ${o.interval ?? SUPPLY},
        ${o.expiredDaysAgo ? addDays(today, -o.expiredDaysAgo) : addDays(today, 150)},
        ${o.expiredDaysAgo ? null : addDays(today, 90)}, ${ruleVersion}, ${by.id}, ${by.cadre}, ${written}::timestamptz)`);
    const when = at(s, o.first, 10).toISOString();
    const point = s.points[p.point].id;
    const actor = pharmacist(p.point).userId;
    const batch = shelf.batches.at(-1)!;
    await s.db.transaction(async (tx) => {
      const [h] = rowsOf<{ id: string }>(
        await tx.execute(sql`INSERT INTO pharmacy_handovers (hospital_id, dispensing_point_id, patient_user_id, collector,
            identity_route, second_identifier, label_mode, payment_status, actor_user_id, actor_cadre, client_key,
            supplied_at, entered_at)
          VALUES (${s.h}, ${point}, ${p.id}, 'patient', 'two_identifiers', 'date_of_birth', 'printed', 'paid', ${actor},
            ${cadreName}, ${`pharmacy-demo-${randomUUID()}`}, ${when}::timestamptz, ${when}::timestamptz) RETURNING id`),
      );
      const [sp] = rowsOf<{ id: string }>(
        await tx.execute(sql`INSERT INTO pharmacy_supplies (handover_id, hospital_id, dispensing_point_id,
            supplying_hospital_id, patient_user_id, prescription_id, product_id, batch_id, quantity, issue_unit,
            days_covered, supplied_at)
          VALUES (${h!.id}, ${s.h}, ${point}, ${s.h}, ${p.id}, ${rx}, ${shelf.productId}, ${batch}, ${SUPPLY}, ${m.unit},
            ${SUPPLY}, ${when}::timestamptz) RETURNING id`),
      );
      await tx.execute(sql`INSERT INTO pharmacy_stock_movements (hospital_id, dispensing_point_id, batch_id, kind, quantity,
          effective_at, actor_user_id, source_kind, source_id)
        VALUES (${s.h}, ${point}, ${batch}, 'supplied', ${-SUPPLY}, ${when}::timestamptz, ${actor}, 'supply', ${sp!.id})`);
      await tx.execute(sql`INSERT INTO pharmacy_line_events (hospital_id, prescription_id, patient_user_id,
          dispensing_point_id, kind, lane, quantity_supplied, quantity_not_supplied, handover_id, actor_user_id, actor_cadre,
          occurred_at, effective_at)
        VALUES (${s.h}, ${rx}, ${p.id}, ${point}, 'accepted', 'standard', NULL, NULL, NULL, ${actor}, ${cadreName},
            ${when}::timestamptz - interval '20 minutes', ${when}::timestamptz - interval '20 minutes'),
          (${s.h}, ${rx}, ${p.id}, ${point}, 'supplied', NULL, ${SUPPLY}, 0, ${h!.id}, ${actor}, ${cadreName},
            ${when}::timestamptz, ${when}::timestamptz)`);
    });
    bump(s, "repeat_lines");
    return rx;
  };

  /** A saved collector, by the patient on their own page. */
  const collector = async (p: DemoPatient, nn: number, relationship: string) =>
    (
      await asClinicalWriter(
        { userId: p.id, hospitalId: s.h },
        (tx) =>
          rf.saveCollector(
            { tx, hospitalId: s.h, userId: p.id, cadre: null, now: at(s, 20, 11) },
            p.id,
            {
              name: `Demo collector ${String(nn).padStart(2, "0")}`,
              relationship,
            },
          ),
        s.db,
      )
    ).id;

  /** A refill request, by the patient in the app or recorded at the window or by phone; its line ids by prescription. */
  const ask = async (
    p: DemoPatient,
    lineIds: string[],
    channel: "app" | "window" | "phone",
    now: Date,
    o: { collectorId?: string; note?: string } = {},
  ) => {
    const raw = {
      clientKey: randomUUID(),
      patientUserId: p.id,
      lineIds,
      note: o.note,
      collector: o.collectorId ? { kind: "named", collectorId: o.collectorId } : { kind: "self" },
      pointId: s.points[p.point].id,
    };
    const r =
      channel === "app"
        ? await asClinicalWriter(
            { userId: p.id, hospitalId: s.h },
            (tx) =>
              rf.requestRefill(
                { tx, hospitalId: s.h, userId: p.id, cadre: null, now },
                rf.RequestRefillInput.parse(raw),
                "app",
              ),
            s.db,
          )
        : await write(
            s,
            tech(p.point),
            rf.RequestRefillInput,
            rf.DISPENSE_POINT,
            (ctx, input) => rf.requestRefill(rf.writerOf(ctx), input, channel),
            raw,
            now,
          );
    bump(s, "refill_requests");
    const rows = await q<{ id: string; rx: string }>(
      s,
      sql`SELECT id, prescription_id AS rx FROM pharmacy_refill_request_lines WHERE request_id = ${r.id}`,
    );
    return new Map(rows.map((x) => [x.rx, x.id]));
  };

  const setAside = async (p: DemoPatient, refillLine: string, medicineId: string, now: Date) => {
    await write(
      s,
      tech(p.point),
      rf.SetAsideInput,
      rf.DISPENSE_POINT,
      rf.setAsideRefill,
      {
        lineId: refillLine,
        productId: s.stock.get(medicineId)!.get(p.point)!.productId,
        quantity: SUPPLY,
      },
      now,
    );
    bump(s, "refills_set_aside");
  };

  /** The hand-over of a prepared refill: the date of birth typed, then the hand-over, as the window does it. */
  const handOver = async (p: DemoPatient, refillLines: string[], rx: string, now: Date) => {
    const clientKey = randomUUID();
    const [y, mo, d] = p.dob.split("-");
    const check = await write(
      s,
      pharmacist(p.point),
      supply.IdentifierInput,
      supply.DISPENSE_LIVE,
      supply.checkSecondIdentifier,
      {
        clientKey,
        lineId: rx,
        kind: "date_of_birth",
        typed: `${d}/${mo}/${y}`,
      },
      now,
    );
    if ((check as { result?: string }).result !== "match")
      throw new Error("The demo patient's date of birth did not match.");
    await write(
      s,
      pharmacist(p.point),
      rf.HandOverInput,
      rf.DISPENSE_POINT,
      rf.handOverPrepared,
      {
        clientKey,
        lineIds: refillLines,
        identity: { route: "two_identifiers", nameAttested: true },
        payment: { status: "paid" },
      },
      now,
    );
    bump(s, "refills_collected");
  };

  // ─── NCD clinic: blood pressure, diabetes and lipids ───────────────────
  if (ncd.length < 8) throw new Error("The demo expected eight NCD clinic patients.");
  const [n0, n1, n2, n3, n4, n5, n6, n7] = ncd as Eight<DemoPatient>;

  // To prepare: two medicines asked for in the app this morning; one at the window.
  {
    const a = await line(n0, "amlodipine", { first: 30 });
    const b = await line(n0, "metformin", { first: 30 });
    await ask(n0, [a, b], "app", ago(95));
    const c = await line(n1, "losartan", { first: 33 });
    await ask(n1, [c], "window", ago(50));
  }
  // Prepared: asked yesterday for a named collector, set aside yesterday afternoon.
  {
    const a = await line(n2, "enalapril", { first: 31 });
    const who = await collector(n2, 1, "Daughter");
    const l = await ask(n2, [a], "app", at(s, 1, 8), { collectorId: who });
    await setAside(n2, l.get(a)!, "enalapril", at(s, 1, 14));
  }
  // Collected today: asked two days ago, set aside yesterday, handed over this morning.
  {
    const a = await line(n3, "hydrochlorothiazide", { first: 32 });
    const b = await line(n3, "atorvastatin", { first: 32 });
    const l = await ask(n3, [a, b], "app", at(s, 2, 9));
    await setAside(n3, l.get(a)!, "hydrochlorothiazide", at(s, 1, 10));
    await setAside(n3, l.get(b)!, "atorvastatin", at(s, 1, 10));
    await handOver(n3, [l.get(a)!, l.get(b)!], a, ago(30));
  }
  // Not collected: asked by phone and set aside nine days ago, held seven days, never collected.
  {
    const a = await line(n4, "glibenclamide", { first: 33, interval: 21 });
    const l = await ask(n4, [a], "phone", at(s, 9, 9));
    await setAside(n4, l.get(a)!, "glibenclamide", at(s, 9, 12));
  }
  // Needs the clinic: asked too early (supplied ten days ago).
  {
    const a = await line(n5, "aspirin", { first: 10 });
    await ask(n5, [a], "app", ago(70), { note: "Demo note: travelling upcountry next week." });
  }
  // Needs the clinic: the one repeat used a week ago, asked again today: a renewal request for the doctor.
  {
    const a = await line(n6, "amlodipine", { first: 33, n: 1 });
    const l = await ask(n6, [a], "window", at(s, 7, 9));
    await setAside(n6, l.get(a)!, "amlodipine", at(s, 7, 10));
    await handOver(n6, [l.get(a)!], a, at(s, 7, 11));
    await ask(n6, [a], "app", ago(40));
  }
  // The patient's own page: one ready to collect, one they may ask for, one not yet due; a saved collector.
  {
    const a = await line(n7, "amlodipine", { first: 30 });
    await line(n7, "metformin", { first: 29 });
    await line(n7, "atorvastatin", { first: 14 });
    await collector(n7, 2, "Son");
    const l = await ask(n7, [a], "app", ago(120));
    await setAside(n7, l.get(a)!, "amlodipine", ago(60));
  }

  // ─── ART clinic: antiretroviral therapy and its prophylaxis ────────────
  if (art.length < 6) throw new Error("The demo expected six ART clinic patients.");
  const [a0, a1, a2, a3, a4, a5] = art as Six<DemoPatient>;
  {
    const x = await line(a0, "tld", { first: 30 });
    const who = await collector(a0, 3, "Brother");
    await ask(a0, [x], "phone", ago(80), { collectorId: who });
  }
  {
    const x = await line(a1, "tld", { first: 31 });
    const y = await line(a1, "co_trimoxazole", { first: 31 });
    await ask(a1, [x, y], "app", ago(65));
  }
  {
    const x = await line(a2, "tld", { first: 29 });
    const l = await ask(a2, [x], "window", ago(110));
    await setAside(a2, l.get(x)!, "tld", ago(90));
  }
  {
    const x = await line(a3, "tld", { first: 32 });
    const l = await ask(a3, [x], "app", at(s, 1, 9));
    await setAside(a3, l.get(x)!, "tld", at(s, 1, 15));
    await handOver(a3, [l.get(x)!], x, ago(20));
  }
  // Expired: the authorisation ended five days ago; asking today becomes a renewal request.
  {
    const x = await line(a4, "tld", { first: 30, expiredDaysAgo: 5 });
    await ask(a4, [x], "app", ago(55));
  }
  // The pharmacist asks the clinic to renew (a review is due), with a note.
  {
    const x = await line(a5, "co_trimoxazole", { first: 27 });
    await write(
      s,
      pharmacyActor(s, s.people.pharmacists[5]!, "PHARMACIST", null),
      rf.AskClinicInput,
      rf.ASK_CLINIC,
      (ctx, input) => rf.askClinicToRenew(rf.writerOf(ctx), input),
      { lineId: x, note: "Demo note: the patient's regimen review is due at the clinic." },
      ago(45),
    );
    bump(s, "renewal_requests");
  }
}

/** Section 14: the hospital admin's Pharmacy page and each point's going-live page. No legal answer is written. */
export async function goliveSection(s: DemoState): Promise<void> {
  const keys = Object.keys(s.points) as PointKey[];
  // Two demo hospital admins hold the go-live record, so no decision is put in a real person's name.
  const first: Admin = { userId: await demoAccount(s, "Demo hospital admin 1"), hospitalId: s.h };
  const second: Admin = { userId: await demoAccount(s, "Demo hospital admin 2"), hospitalId: s.h };
  const as = <T>(a: Admin, fn: Parameters<typeof asClinicalWriter<T>>[1]) =>
    asClinicalWriter(a, fn, s.db);
  const liveAt = new Date(
    (
      await one<{ live: string | Date }>(
        s,
        sql`SELECT min(live_at) AS live FROM pharmacy_dispensing_points WHERE hospital_id = ${s.h}`,
      )
    ).live,
  );
  const before = (days: number) => localDate(new Date(liveAt.getTime() - days * DAY));

  // Briefings: the pharmacy team and the prescribers hospital-wide, and each point's own team.
  await as(first, async (tx) => {
    await gl.recordBriefing(
      tx,
      first,
      {
        pointId: null,
        audience: "pharmacy",
        heldOn: before(6),
        notes: "Demo briefing: the dispensing queue, labels and the hand-over.",
      },
      s.now,
    );
    await gl.recordBriefing(
      tx,
      first,
      {
        pointId: null,
        audience: "prescribers",
        heldOn: before(5),
        notes: "Demo briefing: what the pharmacy sees and how its queries reach the prescriber.",
      },
      s.now,
    );
    for (const k of keys)
      await gl.recordBriefing(
        tx,
        first,
        {
          pointId: s.points[k].id,
          audience: "pharmacy",
          heldOn: before(3),
          notes: `Demo briefing for the ${s.points[k].name.toLowerCase()} team.`,
        },
        s.now,
      );
  });
  bump(s, "briefings", 2 + keys.length);

  // An in-charge on every point (its pharmacist; the chief, acting, where only technicians work), and its settings.
  for (const [i, k] of keys.entries()) {
    await demoHead(s, s.points[k].id, s.people.pharmacists[i] ?? s.people.chief, {
      acting: i >= s.people.pharmacists.length,
      startsAt: new Date(liveAt.getTime() - 7 * DAY).toISOString(),
      setBy: first.userId,
    });
    await as(first, (tx) =>
      gl.updatePointSettings(tx, first, {
        pointId: s.points[k].id,
        phone: "+256 700 000000",
        labelMode: "printed",
        countFreshnessDays: 30,
      }),
    );
  }
  bump(s, "in_charges", keys.length);

  // A downtime drill at every point, two days before it went live.
  for (const [i, k] of keys.entries())
    await write(
      s,
      pharmacyActor(s, s.people.techs[i]!, "PHARMACY_TECH", k),
      dt.DrillInput,
      dt.SHEETS_NEED,
      dt.recordDrill,
      {
        heldOn: before(2),
        participants: "Demo pharmacy technician and demo pharmacist",
        whatWasDone: "Demo drill: printed the downtime sheets and filled three rows by hand.",
        problems: null,
      },
    );
  bump(s, "drills", keys.length);

  // The switch-on decisions as 0129 keeps them (one admin asks, another approves), inserted as the go-live tests do.
  // The demo loader switched the points on, so the snapshot is the readiness as it stands, legal answers missing.
  for (const k of keys) {
    const r = await s.db.transaction((tx) => getPharmacyReadiness(tx, s.h, s.points[k].id, s.now));
    const approved = new Date(r!.point.liveAt!);
    await s.db
      .execute(sql`INSERT INTO pharmacy_golive (hospital_id, dispensing_point_id, action, conditions, requested_by,
        requested_at, approved_by, approved_at)
      VALUES (${s.h}, ${s.points[k].id}, 'switch_on', ${JSON.stringify({
        conditions: r!.readiness.conditions,
        pilotNote: r!.readiness.pilotNote,
        demo: "Switched on by the demo loader, not through the readiness check. Legal answers are not on record.",
      })}::jsonb, ${first.userId}, ${new Date(approved.getTime() - DAY).toISOString()}::timestamptz, ${second.userId},
        ${approved.toISOString()}::timestamptz)`);
  }
  bump(s, "golive_decisions", keys.length);

  // Pilot notes on two points, one by each admin, so every point has a note on another point by someone else.
  await as(first, (tx) =>
    gl.recordPilotNote(
      tx,
      first,
      {
        pointId: s.points.opd.id,
        note: "Demo pilot note: the first two weeks at the main outpatient window ran with steady queue times.",
      },
      s.now,
    ),
  );
  await as(second, (tx) =>
    gl.recordPilotNote(
      tx,
      second,
      {
        pointId: s.points.inpatient.id,
        note: "Demo pilot note: ward lines reached the inpatient queue and the counts held.",
      },
      s.now,
    ),
  );
  bump(s, "pilot_notes", 2);

  // One request waiting for a second admin (not after an earlier load left one): the private wing off for shelving.
  if (!(await openRequest(s.db, s.points.private.id))) {
    await as(first, (tx) =>
      gl.requestSwitchOff(
        tx,
        first,
        {
          pointId: s.points.private.id,
          reason: "Demo request: the private wing pharmacy closes for two days of shelving work.",
        },
        s.now,
      ),
    );
    bump(s, "golive_requests");
  }
}
