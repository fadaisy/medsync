/**
 * P5 gate, PGlite lane: B1, B3, B4, B7, B8, B9, D1 (status part), G2 and the §5.5 hard blocks,
 * through the command path.
 */
import { randomUUID } from "node:crypto";
import type { Lane } from "../emr-db/_pglite";
import type { NcdFacility } from "./_ncd";
import type { NcdContext } from "@/lib/ncdreg/context";
import { beforeAll, describe, expect, it } from "vitest";

import { personView, visitView } from "@/lib/ncdreg/read/views";
import { ctxFor, enrol, ok, refused, run } from "./_engine";
import { bootLane, laneOn, ncdFacility } from "./_ncd";

const at = (c: NcdContext, iso: string): NcdContext => ({
  ...c,
  today: iso,
  enteredAt: new Date(`${iso}T09:00:00+03:00`),
});

describe.skipIf(!laneOn)("visit capture", () => {
  let lane: Lane;
  let f: NcdFacility;
  let nurse: NcdContext;
  let clin: NcdContext;
  beforeAll(async () => {
    lane = await bootLane();
    f = await ncdFacility(lane.pg, "Visit facility");
    nurse = await ctxFor(lane.db, f, "triage_nurse");
    clin = await ctxFor(lane.db, f, "clinician");
  }, 120_000);
  const q = <T>(s: string, p: unknown[] = []) => lane.pg.query<T>(s, p).then((r) => r.rows);

  it("B8: only the four actions move the stage, each change audited; B1: each part records who and when", async () => {
    const { personId } = await enrol(clin, {
      conditions: [{ condition: "diabetes" }, { condition: "hypertension" }],
    });
    const visitId = randomUUID();
    await ok(nurse, "visit.arrive", { visitId, personId, visitType: "scheduled" });
    const stage = async () =>
      (
        await q<{ stage: string }>(`SELECT stage FROM public.ncd_visit WHERE id = $1`, [visitId])
      )[0]!.stage;
    expect(await stage()).toBe("waiting");
    await ok(nurse, "visit.save_nurse", {
      visitId,
      personId,
      weightKg: 80,
      bp: [
        [150, 95],
        [146, 91],
      ],
      glucose: { value: 9.2, unit: "mmol", type: "fasting", method: "capillary" },
    });
    expect(await stage()).toBe("measurements_taken");
    await ok(clin, "visit.start_clinician", { visitId, personId });
    expect(await stage()).toBe("with_clinician");
    await ok(clin, "visit.close", {
      visitId,
      personId,
      medicines: { codes: ["metformin", "amlodipine"], confirmedUnchanged: false },
      missedDoses: "none",
      hypoglycaemia: "none",
      medicinesObtained: "full",
      nextAppointmentDate: "2026-11-30",
    });
    expect(await stage()).toBe("closed");
    const [v] = await q<Record<string, unknown>>(
      `SELECT nurse_saved_by, nurse_saved_at IS NOT NULL AS n_at, clinician_saved_by, closed_by, visit_systolic, visit_diastolic FROM public.ncd_visit WHERE id = $1`,
      [visitId],
    );
    expect(v).toMatchObject({
      nurse_saved_by: f.users.triage_nurse,
      n_at: true,
      clinician_saved_by: f.users.clinician,
      closed_by: f.users.clinician,
      visit_systolic: 148,
      visit_diastolic: 93,
    });
    const audits = await q<{ n: number }>(
      `SELECT count(*)::int AS n FROM public.audit_log WHERE table_name = 'ncd_visit' AND record_id = $1`,
      [visitId],
    );
    expect(audits[0]!.n).toBeGreaterThanOrEqual(4);
  });

  it("B1: either role can complete both parts", async () => {
    const { personId } = await enrol(clin, { conditions: [{ condition: "hypertension" }] });
    const visitId = randomUUID();
    await ok(nurse, "visit.save_nurse", { visitId, personId, weightKg: 70, bp: [[128, 78]] });
    await ok(nurse, "visit.close", {
      visitId,
      personId,
      medicines: { codes: [], confirmedUnchanged: true },
      missedDoses: "none",
      medicinesObtained: "not_applicable",
      nextAppointmentDate: "2026-12-01",
    });
  });

  it("B4: a visit cannot close without a next appointment or a disposition; a disposition records the transfer", async () => {
    const { personId } = await enrol(clin, { conditions: [{ condition: "hypertension" }] });
    const visitId = randomUUID();
    await ok(clin, "visit.arrive", { visitId, personId, visitType: "scheduled" });
    refused(await run(clin, "visit.close", { visitId, personId }), "invalid");
    refused(
      await run(clin, "visit.close", { visitId, personId, nextAppointmentDate: "2026-10-05" }),
      "invalid",
    );
    await ok(clin, "visit.close", { visitId, personId, disposition: "transfer_out" });
    expect((await personView(clin, personId, { audit: false }))!.status).toBe("transferred_out");
  });

  it("B3: medicines carry forward from the last closed visit; B7: a late HbA1c is versioned without reopening", async () => {
    const { personId } = await enrol(at(clin, "2026-08-01"), {
      conditions: [{ condition: "diabetes" }],
    });
    const v1 = randomUUID();
    await ok(at(clin, "2026-08-01"), "visit.record", {
      visitId: v1,
      personId,
      visitDate: "2026-08-01",
      visitType: "scheduled",
      isHistorical: false,
      weightKg: 70,
      bp: [[130, 80]],
      medicines: { codes: ["metformin", "atorvastatin"], confirmedUnchanged: false },
      nextAppointmentDate: "2026-10-01",
    });
    const v2 = randomUUID();
    await ok(clin, "visit.arrive", { visitId: v2, personId, visitType: "scheduled" });
    const view = await visitView(clin, v2);
    expect(view!.carried).toMatchObject({
      codes: ["metformin", "atorvastatin"],
      from: "2026-08-01",
    });
    await ok(clin, "visit.add_lab", {
      visitId: v1,
      personId,
      hba1c: { percent: 7.4, resultDate: "2026-08-03" },
    });
    const [row] = await q<{ hba1c_percent: string; status: string; version: number }>(
      `SELECT hba1c_percent::text, status, version FROM public.ncd_visit WHERE id = $1`,
      [v1],
    );
    expect(row).toEqual({ hba1c_percent: "7.4", status: "closed", version: expect.any(Number) });
    const versions = await q<{ reason: string }>(
      `SELECT reason FROM public.ncd_record_version WHERE record_id = $1`,
      [v1],
    );
    expect(versions.map((x) => x.reason)).toEqual(["Late laboratory result"]);
  });

  it("B9: control for a rule module is refused; HbA1c for a person without the module is refused", async () => {
    const { personId, registrations } = await enrol(clin, {
      conditions: [{ condition: "hypertension" }],
    });
    const visitId = randomUUID();
    await ok(clin, "visit.arrive", { visitId, personId, visitType: "scheduled" });
    refused(
      await run(clin, "visit.save_clinician", {
        visitId,
        personId,
        conditionFields: [
          { registrationId: registrations[0]!.registrationId, recordedControl: "controlled" },
        ],
      }),
      "invalid",
    );
    refused(
      await run(clin, "visit.save_clinician", {
        visitId,
        personId,
        hba1c: { percent: 7, resultDate: "2026-10-05" },
      }),
      "invalid",
    );
  });

  it("D1: a death ends active status at once and cancels every pending appointment and reminder", async () => {
    const { personId } = await enrol(at(clin, "2026-09-01"), {
      conditions: [{ condition: "hypertension" }],
    });
    await ok(at(clin, "2026-09-01"), "visit.record", {
      visitId: randomUUID(),
      personId,
      visitDate: "2026-09-01",
      visitType: "scheduled",
      isHistorical: false,
      bp: [[130, 80]],
      nextAppointmentDate: "2026-11-01",
    });
    expect(
      (
        await q(`SELECT 1 FROM public.ncd_reminder WHERE person_id = $1 AND status = 'pending'`, [
          personId,
        ])
      ).length,
    ).toBe(3);
    refused(
      await run(clin, "event.record", {
        eventId: randomUUID(),
        personId,
        type: "death",
        eventDate: "2026-08-15",
        reportingUnit: "medical_ward",
        death: { place: "home", source: "family_call" },
      }),
      "invalid",
    );
    await ok(clin, "event.record", {
      eventId: randomUUID(),
      personId,
      type: "death",
      eventDate: "2026-10-02",
      reportingUnit: "medical_ward",
      death: { place: "home", source: "family_call", cause: "unknown" },
    });
    expect((await personView(clin, personId, { audit: false }))!.status).toBe("died");
    expect(
      await q(
        `SELECT status FROM public.ncd_reminder WHERE person_id = $1 AND status = 'pending'`,
        [personId],
      ),
    ).toEqual([]);
    expect(
      await q(
        `SELECT status FROM public.ncd_appointment WHERE person_id = $1 AND status = 'pending'`,
        [personId],
      ),
    ).toEqual([]);
    // §5.5: no visit after a recorded death.
    refused(
      await run(clin, "visit.arrive", {
        visitId: randomUUID(),
        personId,
        visitType: "unscheduled",
      }),
      "invalid",
    );
  });

  it("G2: an edit is versioned with who, when and why; nothing is overwritten silently", async () => {
    const { personId } = await enrol(clin, { conditions: [{ condition: "hypertension" }] });
    refused(
      await run(clin, "person.update", { personId, reason: "", identity: { village: "Kisenyi" } }),
      "invalid",
    );
    await ok(clin, "person.update", {
      personId,
      reason: "Moved house",
      identity: { village: "Kisenyi" },
    });
    const [v] = await q<{ reason: string; changed_by: string; version: number }>(
      `SELECT reason, changed_by, version FROM public.ncd_record_version WHERE record_id = $1`,
      [personId],
    );
    expect(v).toEqual({ reason: "Moved house", changed_by: f.users.clinician, version: 1 });
  });

  it("§5.5 hard blocks: negative values, future dates, a visit before registration unless historical", async () => {
    const { personId } = await enrol(clin, { conditions: [{ condition: "hypertension" }] });
    refused(
      await run(clin, "visit.save_nurse", { visitId: randomUUID(), personId, weightKg: -3 }),
      "invalid",
    );
    refused(
      await run(clin, "visit.record", {
        visitId: randomUUID(),
        personId,
        visitDate: "2027-01-01",
        visitType: "scheduled",
        isHistorical: false,
        nextAppointmentDate: "2027-02-01",
      }),
      "invalid",
    );
    refused(
      await run(clin, "visit.record", {
        visitId: randomUUID(),
        personId,
        visitDate: "2026-01-01",
        visitType: "scheduled",
        isHistorical: false,
        nextAppointmentDate: "2026-02-01",
      }),
      "invalid",
    );
    refused(
      await run(clin, "review.save", {
        reviewId: randomUUID(),
        personId,
        reviewDate: "2027-01-01",
        data: { component: "lipids", totalCholesterol: 5 },
      }),
      "invalid",
    );
    refused(
      await run(clin, "event.record", {
        eventId: randomUUID(),
        personId,
        type: "admission",
        eventDate: "2027-01-01",
        reportingUnit: "ncd_clinic",
        admissionReason: "other",
      }),
      "invalid",
    );
  });

  it("§5.5 confirm, never block: an out-of-range value is refused until confirmed, then saved", async () => {
    const { personId } = await enrol(clin, { conditions: [{ condition: "hypertension" }] });
    const visitId = randomUUID();
    const r = await run(nurse, "visit.save_nurse", {
      visitId,
      personId,
      weightKg: 70,
      bp: [[320, 80]],
    });
    refused(r, "needs_confirmation");
    await ok(nurse, "visit.save_nurse", {
      visitId,
      personId,
      weightKg: 70,
      bp: [[320, 80]],
      confirmations: ["systolic"],
    });
  });

  it("C2: eGFR, kidney categories and foot risk are calculated on save with their formula versions", async () => {
    const { personId } = await enrol(clin, {
      conditions: [{ condition: "diabetes" }],
      sex: "male",
      ageYears: 50,
    });
    const r = await ok(clin, "review.save", {
      reviewId: randomUUID(),
      personId,
      reviewDate: "2026-10-05",
      data: {
        component: "kidney",
        creatinine: 1,
        creatinineUnit: "mgdl",
        urineTest: "acr",
        acrMgMmol: 12,
      },
    });
    expect(r.derived).toMatchObject({
      egfr: 92,
      kdigoG: "G1",
      kdigoA: "A2",
      egfrFormula: "ckd-epi-2021-cr",
    });
    const f2 = await ok(clin, "review.save", {
      reviewId: randomUUID(),
      personId,
      reviewDate: "2026-10-05",
      data: {
        component: "feet",
        lossOfProtectiveSensation: true,
        absentPulses: true,
        deformity: false,
        currentUlcer: false,
        previousUlcer: false,
        amputation: "none",
      },
    });
    expect(f2.derived).toMatchObject({ footRisk: 2 });
    // "Other annual items" are offered to a person with diabetes; eyes are not offered to hypertension alone.
    await ok(clin, "review.save", {
      reviewId: randomUUID(),
      personId,
      reviewDate: "2026-10-05",
      data: { component: "other", ecgDone: true, lvh: "no" },
    });
    const ht = await enrol(clin, { conditions: [{ condition: "hypertension" }] });
    refused(
      await run(clin, "review.save", {
        reviewId: randomUUID(),
        personId: ht.personId,
        reviewDate: "2026-10-05",
        data: { component: "eyes", examined: false },
      }),
      "invalid",
    );
  });
});
