/**
 * Adversarial review, PGlite lane. Each `it` asserts the SAFE behaviour; a failure is a finding.
 */
import { randomUUID } from "node:crypto";
import type { Lane } from "../emr-db/_pglite";
import type { NcdFacility } from "../ncdreg-db/_ncd";
import type { NcdContext } from "@/lib/ncdreg/context";
import { beforeAll, describe, expect, it } from "vitest";

import { assignRole } from "@/lib/ncdreg/admin";
import { resolveContext } from "@/lib/ncdreg/context";
import { turnOff, turnOn } from "@/lib/ncdreg/demo/service";
import { patientsList, personDetails } from "@/lib/ncdreg/read/views";
import { searchPersons } from "@/lib/ncdreg/search";
import { ctxFor, enrol, ok, randomName, run } from "../ncdreg-db/_engine";
import { asNcd, bootLane, laneOn, ncdFacility } from "../ncdreg-db/_ncd";

const DAY0 = "2026-10-05";
const at = (c: NcdContext, hhmm = "10:00"): NcdContext => ({
  ...c,
  today: DAY0,
  enteredAt: new Date(`${DAY0}T${hhmm}:00+03:00`),
});
const facts = {
  givenName: "x",
  familyName: "y",
  sex: null,
  birthYear: null,
  phones: [],
  hospitalNumber: null,
  nationalId: null,
};

describe.skipIf(!laneOn)("review attacks", () => {
  let lane: Lane;
  let f: NcdFacility;
  let personId: string;

  beforeAll(async () => {
    lane = await bootLane();
    f = await ncdFacility(lane.pg, "Review facility");
    const clin = await ctxFor(lane.db, f, "clinician");
    const names = { givenName: randomName(), familyName: randomName() };
    const { token } = await searchPersons(clin, { ...facts, ...names });
    personId = randomUUID();
    await ok(clin, "person.enrol", {
      personId,
      searchToken: token,
      identity: {
        ...names,
        sex: "female",
        ageYears: 50,
        hospitalNumber: "MUL-12345",
        nokName: "Kin Name",
        village: "Kisenyi",
      },
      registrations: [
        {
          registrationId: randomUUID(),
          condition: "hypertension",
          subtype: "primary",
          diagnosisYear: 2020,
          basisOfDiagnosis: "unknown",
        },
      ],
      privacy: { version: "0.1-draft", acknowledged: true },
      smsAllowed: true,
      callsAllowed: true,
      isSynthetic: true,
    });
  }, 300_000);

  it("head of department (no person_search, no identifier_reveal) cannot read hospital number, next of kin or village", async () => {
    const hod = await ctxFor(lane.db, f, "head_of_department");
    expect(hod.caps.has("identifier_reveal")).toBe(false);
    const d = await personDetails(hod, personId).catch(() => null);
    expect(d?.hospitalNumber ?? null).toBeNull();
    expect(d?.nokName ?? null).toBeNull();
    const list = await patientsList(hod).catch(() => null);
    expect(list?.rows.length ?? 0).toBe(0);
  });

  it("an administrator cannot grant themselves a registry lead role (and with it identifiers)", async () => {
    const admin = await ctxFor(lane.db, f, "administrator");
    await assignRole(admin, f.users.administrator, "registry_lead").catch(() => undefined);
    const again = await ctxFor(lane.db, f, "administrator");
    expect(again.caps.has("identifier_reveal")).toBe(false);
    const d = await personDetails(again, personId).catch(() => null);
    expect(d?.hospitalNumber ?? null).toBeNull();
  });

  it("layer 2: the app role cannot INSERT an already-approved go-live request (bypassing CSO and the synthetic check)", async () => {
    const approved = await asNcd(
      lane.pg,
      { userId: f.users.registry_lead, facilityId: f.facilityId },
      async (tx) => {
        await tx.query(
          `INSERT INTO public.ncd_go_live_request (facility_id, status, requested_by, decided_by) VALUES ($1, 'approved', $2, $3)`,
          [f.facilityId, f.users.registry_lead, f.users.triage_nurse],
        );
        return (
          await tx.query<{ a: boolean }>(`SELECT private.ncd_facility_approved($1) AS a`, [
            f.facilityId,
          ])
        ).rows[0]!.a;
      },
    ).catch(() => false);
    expect(approved).toBe(false);
  });

  it("a visit cannot be linked to another person's appointment", async () => {
    const clin = await ctxFor(lane.db, f, "clinician");
    const a = await enrol(clin);
    const b = await enrol(clin);
    await ok(clin, "visit.record", {
      visitId: randomUUID(),
      personId: a.personId,
      visitDate: "2026-10-05",
      visitType: "scheduled",
      isHistorical: false,
      bp: [[130, 80]],
      nextAppointmentDate: "2026-11-05",
    });
    const appt = (
      await lane.pg.query<{ id: string }>(
        `SELECT id FROM public.ncd_appointment WHERE person_id = $1`,
        [a.personId],
      )
    ).rows[0]!.id;
    const r = await run(clin, "visit.arrive", {
      visitId: randomUUID(),
      personId: b.personId,
      appointmentId: appt,
      visitType: "scheduled",
    });
    expect(r.ok).toBe(false);
  });

  it("a command id reused for another person is not silently reported as applied", async () => {
    const clin = await ctxFor(lane.db, f, "clinician");
    const a = await enrol(clin);
    const b = await enrol(clin);
    const id = randomUUID();
    await ok(
      clin,
      "person.update",
      { personId: a.personId, reason: "fix", baseline: { heightCm: 170 } },
      id,
    );
    const r = await run(
      clin,
      "person.update",
      { personId: b.personId, reason: "fix", baseline: { heightCm: 150 } },
      id,
    );
    expect(r.ok && r.replayed).toBe(false);
  });

  it("one search token does not unlock unlimited enrolments", async () => {
    const clin = await ctxFor(lane.db, f, "clinician");
    const { token } = await searchPersons(clin, facts);
    const body = () => ({
      personId: randomUUID(),
      searchToken: token,
      identity: { givenName: randomName(), familyName: randomName(), sex: "male", ageYears: 40 },
      registrations: [
        {
          registrationId: randomUUID(),
          condition: "hypertension",
          subtype: "primary",
          diagnosisYear: 2020,
          basisOfDiagnosis: "unknown",
        },
      ],
      privacy: { version: "0.1-draft", acknowledged: true },
      smsAllowed: false,
      callsAllowed: true,
      isSynthetic: true,
    });
    const results = [
      await run(clin, "person.enrol", body()),
      await run(clin, "person.enrol", body()),
      await run(clin, "person.enrol", body()),
    ];
    expect(results.filter((r) => r.ok).length).toBeLessThanOrEqual(1);
  });

  it("A7: merging two persons who both have an open same-day-duplicate query succeeds", async () => {
    const clin = await ctxFor(lane.db, f, "clinician");
    const officer = await ctxFor(lane.db, f, "registry_officer");
    const lead = await ctxFor(lane.db, f, "registry_lead");
    const a = await enrol(clin);
    const b = await enrol(clin);
    for (const p of [a, b])
      for (let i = 0; i < 2; i++)
        await ok(clin, "visit.arrive", {
          visitId: randomUUID(),
          personId: p.personId,
          visitType: "unscheduled",
        });
    const mergeId = randomUUID();
    await ok(officer, "merge.request", {
      mergeId,
      personId: a.personId,
      loserPersonId: b.personId,
      reason: "Same person",
    });
    const r = await run(lead, "merge.decide", { mergeId, personId: a.personId, approve: true });
    expect(r, JSON.stringify(r)).toMatchObject({ ok: true });
  });

  it("I6/§10.5: a demo person's visits do not survive turning demo data off via a merge into a hand-entered synthetic person", async () => {
    const g = await ncdFacility(lane.pg, "Review demo facility");
    const lead = at(await ctxFor(lane.db, g, "registry_lead"), "07:30");
    const loadId = (await turnOn(lead, "scenario")).id;
    const clin = at(await ctxFor(lane.db, g, "clinician"));
    const hand = await enrol(clin, { conditions: [{ condition: "hypertension" }] });
    const demoPerson = (
      await lane.pg.query<{ id: string }>(
        `SELECT p.id FROM public.ncd_person p WHERE p.demo_load_id = $1 AND EXISTS (SELECT 1 FROM public.ncd_visit v WHERE v.person_id = p.id AND v.status = 'closed') LIMIT 1`,
        [loadId],
      )
    ).rows[0]!.id;
    const officer = at(await ctxFor(lane.db, g, "registry_officer"));
    const mergeId = randomUUID();
    // Fixed: a merge across demo loads is refused at request (and again at decision).
    const req = await run(officer, "merge.request", {
      mergeId,
      personId: hand.personId,
      loserPersonId: demoPerson,
      reason: "Same person",
    });
    expect(req.ok).toBe(false);
    await turnOff(at(lead, "17:00"), true);
    const left = (
      await lane.pg.query<{ n: number }>(
        `SELECT count(*)::int AS n FROM public.ncd_visit WHERE person_id = $1 AND principal = 'demo_loader'`,
        [hand.personId],
      )
    ).rows[0]!.n;
    expect(left).toBe(0);
  }, 600_000);

  it("continueLoad (demoContinueAction) needs demo_data_manage", async () => {
    const auditor = await ctxFor(lane.db, f, "auditor");
    const { continueLoad } = await import("@/lib/ncdreg/demo/service");
    await expect(continueLoad(auditor, 1)).rejects.toThrow();
  });

  it("superadmin with no explicit assignment resolves to no NCD role", async () => {
    const sa = await resolveContext(
      { userId: f.superadminId, facilityId: f.facilityId, principal: "user" },
      { db: lane.db },
    );
    expect(sa.roles).toEqual([]);
  });
});
