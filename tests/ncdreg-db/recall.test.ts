/**
 * Recall on the PGlite lane: the SMS dispatcher end to end (E3, E5, E6, D1, §10.6 interlock 3).
 * A facility approved for patient data holds real persons (the only ones the dispatcher may reach);
 * a second, unapproved facility holds synthetic persons. The only transport is a mock SmsSender.
 */
import { randomUUID } from "node:crypto";
import type { Lane } from "../emr-db/_pglite";
import type { NcdFacility } from "./_ncd";
import type { NcdContext } from "@/lib/ncdreg/context";
import type { Transport } from "@/lib/ncdreg/recall/transport";
import { beforeAll, describe, expect, it } from "vitest";

import { decideGoLive, requestGoLive } from "@/lib/ncdreg/admin";
import { withNcd } from "@/lib/ncdreg/db";
import { dispatchReminders } from "@/lib/ncdreg/recall/dispatcher";
import {
  approveTemplate,
  ensureTemplates,
  listTemplates,
  submitTemplate,
} from "@/lib/ncdreg/recall/templates";
import { loggingTransport, sendGuarded, SYNTHETIC_REASON } from "@/lib/ncdreg/recall/transport";
import { searchPersons } from "@/lib/ncdreg/search";
import { ctxFor, enrol, ok, randomName } from "./_engine";
import { assign, bootLane, laneOn, ncdFacility } from "./_ncd";

const DAY = "2026-10-05";
const at = (hhmm: string) => `${DAY}T${hhmm}:00+03:00`;

describe.skipIf(!laneOn)("recall: reminders re-checked at send time", () => {
  let lane: Lane;
  let real: NcdFacility;
  let demo: NcdFacility;
  let phoneN = 100;
  const phone = () => `0772 ${String(phoneN++).padStart(3, "0")} 456`;

  const sys = (f: NcdFacility, hhmm = "10:00") =>
    ctxFor(lane.db, f, { userId: null }, { principal: "system", at: at(hhmm) });

  async function settings(f: NcdFacility) {
    await lane.pg.query(
      `INSERT INTO public.ncd_facility_settings (facility_id, hospital_display_name, clinic_phone) VALUES ($1, 'Lane Hospital', '0414 000 000')
       ON CONFLICT (facility_id) DO UPDATE SET hospital_display_name = EXCLUDED.hospital_display_name, clinic_phone = EXCLUDED.clinic_phone`,
      [f.facilityId],
    );
  }

  async function approveEnglish(f: NcdFacility) {
    const lead = await ctxFor(lane.db, f, "registry_lead");
    const second = await ctxFor(lane.db, f, "head_of_department");
    await ensureTemplates(lead);
    for (const t of (await listTemplates(lead)).filter(
      (x) => x.language === "en" && x.status !== "approved",
    )) {
      await submitTemplate(lead, t.id);
      await approveTemplate(lead, t.id);
      await approveTemplate(second, t.id);
    }
  }

  async function realPerson(): Promise<string> {
    const c = await ctxFor(lane.db, real, "clinician");
    const identity = {
      givenName: randomName(),
      familyName: randomName(),
      sex: "female" as const,
      ageYears: 55,
      phone1: phone(),
    };
    const { token } = await searchPersons(c, {
      givenName: identity.givenName,
      familyName: identity.familyName,
      sex: "female",
      birthYear: null,
      phones: [identity.phone1],
      hospitalNumber: null,
      nationalId: null,
    });
    const personId = randomUUID();
    await ok(c, "person.enrol", {
      personId,
      searchToken: token,
      identity,
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
      isSynthetic: false,
    });
    return personId;
  }

  /** An appointment through the real path (closing a visit with a next date; D-22: a will-return call books none). */
  async function appointment(f: NcdFacility, personId: string, date: string) {
    const clin = await ctxFor(lane.db, f, "clinician");
    await ok(clin, "visit.record", {
      visitId: randomUUID(),
      personId,
      visitDate: clin.today,
      visitType: "scheduled",
      isHistorical: false,
      weightKg: 70,
      bp: [[130, 80]],
      nextAppointmentDate: date,
    });
    return reminders(personId);
  }

  async function reminders(personId: string) {
    const { rows } = await lane.pg.query<{
      id: string;
      kind: string;
      seq: number;
      status: string;
      status_reason: string | null;
      due_on: string;
    }>(
      `SELECT id, kind, seq, status, status_reason, due_on::text FROM public.ncd_reminder WHERE person_id = $1 ORDER BY kind, seq`,
      [personId],
    );
    return rows;
  }
  const before = async (personId: string) =>
    (await reminders(personId)).find((r) => r.kind === "before")!;

  beforeAll(async () => {
    lane = await bootLane();
    real = await ncdFacility(lane.pg, "Recall approved facility");
    demo = await ncdFacility(lane.pg, "Recall demo facility");
    for (const f of [real, demo]) {
      await assign(lane.pg, f.facilityId, f.users.head_of_department, "registry_lead");
      await settings(f);
    }
    const req = await requestGoLive(await ctxFor(lane.db, real, "registry_lead"), "recall lane");
    await decideGoLive(await ctxFor(lane.db, real, "clinical_safety_officer"), req.id, true);
  }, 180_000);

  it("E5: template approval needs two different users holding sms_template_approve", async () => {
    const lead = await ctxFor(lane.db, demo, "registry_lead");
    const second = await ctxFor(lane.db, demo, "head_of_department");
    const officer = await ctxFor(lane.db, demo, "registry_officer");
    await ensureTemplates(lead);
    const t = (await listTemplates(lead)).find(
      (x) => x.language === "en" && x.purpose === "missed_visit",
    )!;
    expect(t.status).toBe("draft");
    await expect(approveTemplate(lead, t.id)).rejects.toThrow(/awaiting approval/);
    await submitTemplate(lead, t.id);
    const first = await approveTemplate(lead, t.id);
    expect(first).toMatchObject({
      status: "pending_review",
      firstApprover: demo.users.registry_lead,
    });
    await expect(approveTemplate(lead, t.id)).rejects.toThrow(/different person/);
    await expect(approveTemplate(officer, t.id)).rejects.toThrow(/sms_template_approve/);
    const done = await approveTemplate(second, t.id);
    expect(done).toMatchObject({
      status: "approved",
      firstApprover: demo.users.registry_lead,
      approvedBy: demo.users.head_of_department,
    });
    // The table's CHECK holds the same rule underneath the code.
    await expect(
      lane.pg.query(
        `UPDATE public.ncd_sms_template SET approved_by = first_approver WHERE id = $1`,
        [t.id],
      ),
    ).rejects.toThrow();
    // Luganda slots stay empty and cannot be submitted: no translation is written.
    const lg = (await listTemplates(lead)).filter((x) => x.language === "lg");
    expect(lg.every((x) => x.body === "" && x.status === "pending_review")).toBe(true);
    await expect(approveTemplate(lead, lg[0]!.id)).rejects.toThrow(/empty/);
  });

  it("E4: saving a template body with a banned term is refused", async () => {
    const lead = await ctxFor(lane.db, demo, "registry_lead");
    const { saveTemplateBody } = await import("@/lib/ncdreg/recall/templates");
    const t = (await listTemplates(lead)).find(
      (x) => x.language === "en" && x.purpose === "appointment_reminder",
    )!;
    await expect(
      saveTemplateBody(lead, t.id, "Bring your insulin to [HOSPITAL NAME]"),
    ).rejects.toThrow(/insulin/);
  });

  it("E5: the dispatcher sends only approved templates", async () => {
    const p = await realPerson();
    await appointment(real, p, "2026-10-07");
    const mock = loggingTransport();
    await dispatchReminders(await sys(real), { transport: mock });
    expect(await before(p)).toMatchObject({
      status: "blocked",
      status_reason: "No approved template",
    });
    expect(mock.outbox).toEqual([]);

    await approveEnglish(real);
    const q = await realPerson();
    await appointment(real, q, "2026-10-07");
    const s = await dispatchReminders(await sys(real), { transport: mock });
    expect(s.sent).toBe(1);
    expect(await before(q)).toMatchObject({ status: "sent" });
    expect(mock.outbox).toHaveLength(1);
    expect(mock.outbox[0]!.toE164).toMatch(/^\+2567/);
    expect(mock.outbox[0]!.body).toBe(
      "You have an appointment at Lane Hospital on 07 Oct 2026. Reply STOP to opt out.",
    );
    // The log keeps the keyed hash, never the number.
    const { rows } = await lane.pg.query<{
      to_hmac: string;
      result: string;
      body: string;
      phone1_hmac: string;
    }>(
      `SELECT l.to_hmac, l.result, l.body, p.phone1_hmac FROM public.ncd_sms_log l JOIN public.ncd_person p ON p.id = l.person_id WHERE l.person_id = $1`,
      [q],
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]!.result).toBe("logged");
    expect(rows[0]!.to_hmac).toBe(rows[0]!.phone1_hmac);
    expect(rows[0]!.body).not.toMatch(/\d{6}/);
  });

  it("E3: outside 08:00 to 18:00 facility time nothing is sent and the reminder stays pending", async () => {
    const p = await realPerson();
    await appointment(real, p, "2026-10-07");
    const mock = loggingTransport();
    for (const hhmm of ["07:59", "18:00", "21:30"]) {
      const s = await dispatchReminders(await sys(real, hhmm), { transport: mock });
      expect(s.outsideWindow).toBe(true);
    }
    expect(mock.outbox).toEqual([]);
    expect(await before(p)).toMatchObject({ status: "pending" });
    await dispatchReminders(await sys(real, "08:00"), { transport: mock });
    expect(await before(p)).toMatchObject({ status: "sent" });
    expect(mock.outbox).toHaveLength(1);
  });

  it("D1: a reminder scheduled before a death is not sent after it", async () => {
    const p = await realPerson();
    const scheduled = await appointment(real, p, "2026-10-07");
    expect(scheduled.every((r) => r.status === "pending")).toBe(true);
    const clin = await ctxFor(lane.db, real, "clinician");
    await ok(clin, "event.record", {
      eventId: randomUUID(),
      personId: p,
      type: "death",
      eventDate: DAY,
      reportingUnit: "ncd_clinic",
      death: { place: "home", source: "family_call" },
    });
    expect((await reminders(p)).every((r) => r.status === "cancelled")).toBe(true);
    // Even a reminder that is still pending (scheduled before the event, never cancelled) is
    // re-checked against status at send time.
    await lane.pg.query(
      `UPDATE public.ncd_reminder SET status = 'pending', status_reason = NULL WHERE person_id = $1`,
      [p],
    );
    await lane.pg.query(
      `UPDATE public.ncd_appointment SET status = 'pending' WHERE person_id = $1`,
      [p],
    );
    const mock = loggingTransport();
    await dispatchReminders(await sys(real), { transport: mock });
    expect(await before(p)).toMatchObject({
      status: "cancelled",
      status_reason: "Status at send time: death",
    });
    expect(mock.outbox).toEqual([]);
  });

  it("E6: an opt-out is honoured at send time", async () => {
    const p = await realPerson();
    await appointment(real, p, "2026-10-07");
    const clin = await ctxFor(lane.db, real, "clinician");
    await ok(clin, "person.update", {
      personId: p,
      reason: "Asked to stop messages",
      optOutSms: true,
    });
    const mock = loggingTransport();
    await dispatchReminders(await sys(real), { transport: mock });
    expect(await before(p)).toMatchObject({ status: "blocked", status_reason: "Opted out of SMS" });
    expect(mock.outbox).toEqual([]);
  });

  it("interlock 3: a synthetic person is never dispatched, whatever the transport, and the reason is logged", async () => {
    await approveEnglish(demo);
    const clin = await ctxFor(lane.db, demo, "clinician");
    const { personId } = await enrol(clin, { phone: phone() });
    await appointment(demo, personId, "2026-10-07");
    const calls: string[] = [];
    const live: Transport = {
      name: "africastalking",
      sender: { send: async (m) => (calls.push(m.toE164), { ok: true }) },
    };
    await dispatchReminders(await sys(demo), { transport: live });
    expect(await before(personId)).toMatchObject({
      status: "blocked",
      status_reason: SYNTHETIC_REASON,
    });
    // Straight at the boundary too, with another transport: refused before the sender is called.
    const system: NcdContext = await sys(demo);
    const d = await withNcd(
      system,
      "app",
      (tx) =>
        sendGuarded(tx, loggingTransport(), {
          facilityId: demo.facilityId,
          personId,
          reminderId: null,
          toE164: "+256772000000",
          toHmac: null,
          body: "Test",
        }),
      lane.db,
    );
    expect(d).toEqual({ result: "blocked", reason: SYNTHETIC_REASON });
    expect(calls).toEqual([]);
    const { rows } = await lane.pg.query<{ result: string; reason: string; transport: string }>(
      `SELECT result, reason, transport FROM public.ncd_sms_log WHERE person_id = $1 ORDER BY created_at`,
      [personId],
    );
    expect(rows.map((r) => [r.result, r.reason])).toEqual([
      ["blocked", SYNTHETIC_REASON],
      ["blocked", SYNTHETIC_REASON],
    ]);
    expect(rows.map((r) => r.transport).sort()).toEqual(["africastalking", "logging_mock"]);
  });
});
