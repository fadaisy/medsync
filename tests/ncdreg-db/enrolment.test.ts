/**
 * P4 gate, PGlite lane: A1–A7 through the command path, and the command path's idempotency (§9).
 * A1 search token; A2 tiers enforced server-side; A3 only the registry number; A4 several
 * registrations, the second of a condition refused by the command; A5 notice and preferences;
 * A6 historical flag; A7 four-eyes merge with tombstone and no orphans.
 */
import { randomUUID } from "node:crypto";
import type { Lane } from "../emr-db/_pglite";
import type { NcdFacility } from "./_ncd";
import type { NcdContext } from "@/lib/ncdreg/context";
import { beforeAll, describe, expect, it } from "vitest";

import { searchPersons } from "@/lib/ncdreg/search";
import { ctxFor, enrol, ok, randomName, refused, run } from "./_engine";
import { bootLane, laneOn, ncdFacility } from "./_ncd";

const identity = (o: Record<string, unknown> = {}) => ({
  givenName: randomName(),
  familyName: randomName(),
  sex: "female",
  ageYears: 44,
  ...o,
});
const enrolPayload = (token: string, o: Record<string, unknown> = {}) => ({
  personId: randomUUID(),
  searchToken: token,
  identity: identity(),
  registrations: [
    {
      registrationId: randomUUID(),
      condition: "hypertension",
      subtype: "primary",
      diagnosisYear: 2024,
      basisOfDiagnosis: "repeated_office_bp",
    },
  ],
  baseline: { heightCm: 160, knownCvd: [] },
  privacy: { version: "0.1-draft", acknowledged: true },
  smsAllowed: false,
  callsAllowed: true,
  isSynthetic: true,
  dismissedCandidates: [] as string[],
  confirmations: [],
  ...o,
});

describe.skipIf(!laneOn)("enrolment and identity", () => {
  let lane: Lane;
  let f: NcdFacility;
  beforeAll(async () => {
    lane = await bootLane();
    f = await ncdFacility(lane.pg, "Enrolment facility");
  }, 120_000);

  const token = async (who: Parameters<typeof ctxFor>[2] = "clinician") => {
    const c = await ctxFor(lane.db, f, who);
    return {
      c,
      token: (
        await searchPersons(c, {
          givenName: "x",
          familyName: "y",
          sex: null,
          birthYear: null,
          phones: [],
          hospitalNumber: null,
          nationalId: null,
        })
      ).token,
    };
  };

  /** A search for exactly the names being enrolled (the token is bound to them). */
  const signed = async <P extends { identity: { givenName: string; familyName: string } }>(
    c: NcdContext,
    p: P,
  ) => ({
    ...p,
    searchToken: (
      await searchPersons(c, {
        givenName: p.identity.givenName,
        familyName: p.identity.familyName,
        sex: null,
        birthYear: null,
        phones: [],
        hospitalNumber: null,
        nationalId: null,
      })
    ).token,
  });
  const runE = async (c: NcdContext, p: ReturnType<typeof enrolPayload>, id?: string) =>
    run(c, "person.enrol", await signed(c, p), id);
  const okE = async (c: NcdContext, p: ReturnType<typeof enrolPayload>) =>
    ok(c, "person.enrol", await signed(c, p));

  it("A1: create is rejected server-side without a search token, or with a forged or stale one", async () => {
    const c = await ctxFor(lane.db, f, "clinician");
    refused(await run(c, "person.enrol", enrolPayload("1234567890.deadbeef")), "forbidden");
    const p = await signed(c, enrolPayload(""));
    const tomorrow = { ...c, enteredAt: new Date(c.enteredAt.getTime() + 25 * 3600 * 1000) };
    refused(await run(tomorrow, "person.enrol", p), "forbidden");
    // Another user's token is not this user's.
    const other = await ctxFor(lane.db, f, "registry_officer");
    refused(await run(other, "person.enrol", p), "forbidden");
    // A token for other names does not unlock this enrolment.
    const { token: t } = await token();
    refused(await run(c, "person.enrol", enrolPayload(t)), "forbidden");
    await okE(c, p);
  });

  it("A3: nothing but the system-issued number is mandatory (no phone, no ID, no hospital number)", async () => {
    const { c, token: t } = await token();
    const r = await okE(c, enrolPayload(t));
    expect(String(r.registryNumber)).toMatch(/^DEMO-M-/); // synthetic before go-live
  });

  it("A2: a probable duplicate blocks enrolment until linked or dismissed; possible ones do not", async () => {
    const { c, token: t } = await token();
    const fam = randomName();
    const first = enrolPayload(t, {
      identity: identity({ givenName: "Esther", familyName: fam, phone1: "0772 555 001" }),
    });
    await okE(c, first);
    const again = enrolPayload(t, {
      identity: identity({ familyName: fam, phone1: "0772 555 001", givenName: "Ester" }),
    });
    const r = await runE(c, again);
    refused(r, "duplicates");
    if (!r.ok)
      expect((r.detail?.candidates as { personId: string; tier: string }[])[0]).toMatchObject({
        personId: first.personId,
        tier: "probable",
      });
    await okE(c, { ...again, dismissedCandidates: [first.personId] });
    // The decision is recorded: who dismissed which candidate, at which tier.
    const { rows: log } = await lane.pg.query<{ user_id: string; detail: unknown }>(
      `SELECT user_id, detail FROM public.ncd_access_event WHERE action = 'dismiss_candidates' AND person_id = $1`,
      [again.personId],
    );
    expect(log).toEqual([
      {
        user_id: f.users.clinician,
        detail: { dismissed: [{ personId: first.personId, tier: "probable" }] },
      },
    ]);
  });

  it("A4: several registrations on different dates; a second of one condition is refused; disabled modules refused", async () => {
    const c = await ctxFor(lane.db, f, "clinician");
    const { personId } = await enrol(c, { conditions: [{ condition: "hypertension" }] });
    await ok(
      { ...c, today: "2026-11-01", enteredAt: new Date("2026-11-01T09:00:00+03:00") },
      "registration.add",
      {
        personId,
        registrationId: randomUUID(),
        condition: "diabetes",
        subtype: "type_2",
        diagnosisYear: 2026,
        basisOfDiagnosis: "hba1c",
      },
    );
    refused(
      await run(c, "registration.add", {
        personId,
        registrationId: randomUUID(),
        condition: "hypertension",
        subtype: "primary",
        diagnosisYear: 2020,
        basisOfDiagnosis: "unknown",
      }),
      "conflict",
    );
    refused(
      await run(c, "registration.add", {
        personId,
        registrationId: randomUUID(),
        condition: "asthma",
        subtype: "unknown",
        diagnosisYear: 2020,
        basisOfDiagnosis: "unknown",
      }),
      "invalid",
    );
    const { rows } = await lane.pg.query<{ condition_code: string; registration_date: string }>(
      `SELECT condition_code, registration_date::text FROM public.ncd_registration WHERE person_id = $1 ORDER BY registration_date`,
      [personId],
    );
    expect(rows).toEqual([
      { condition_code: "hypertension", registration_date: "2026-10-05" },
      { condition_code: "diabetes", registration_date: "2026-11-01" },
    ]);
  });

  it("hard blocks: under 18, future date of birth", async () => {
    const { c, token: t } = await token();
    refused(await runE(c, enrolPayload(t, { identity: identity({ ageYears: 17 }) })), "invalid");
    refused(
      await runE(
        c,
        enrolPayload(t, {
          identity: { ...identity(), ageYears: undefined, dateOfBirth: "2030-01-01" },
        }),
      ),
      "invalid",
    );
  });

  it("A5: notice version, acknowledgement time and contact preferences are recorded", async () => {
    const { c, token: t } = await token();
    const p = enrolPayload(t, { smsAllowed: false, callsAllowed: true });
    await okE(c, p);
    const { rows } = await lane.pg.query(
      `SELECT privacy_notice_version, privacy_notice_ack_at IS NOT NULL AS ack, sms_allowed, calls_allowed FROM public.ncd_person WHERE id = $1`,
      [p.personId],
    );
    expect(rows[0]).toEqual({
      privacy_notice_version: "0.1-draft",
      ack: true,
      sms_allowed: false,
      calls_allowed: true,
    });
  });

  it("A6: legacy back-entry flags the visit historical; clinicians cannot back-enter", async () => {
    const lead = await ctxFor(lane.db, f, "registry_officer");
    const clin = await ctxFor(lane.db, f, "clinician");
    const { personId } = await enrol(clin, { conditions: [{ condition: "hypertension" }] });
    const v = {
      visitId: randomUUID(),
      personId,
      visitDate: "2026-06-01",
      visitType: "scheduled",
      isHistorical: true,
      bp: [[130, 80]],
      weightKg: 60,
      nextAppointmentDate: "2026-08-01",
    };
    refused(await run(clin, "visit.record", { ...v, visitId: randomUUID() }), "forbidden");
    await ok(lead, "visit.record", v);
    const { rows } = await lane.pg.query(
      `SELECT is_historical, status FROM public.ncd_visit WHERE id = $1`,
      [v.visitId],
    );
    expect(rows[0]).toEqual({ is_historical: true, status: "closed" });
  });

  it("idempotency: a replayed command is a no-op that returns the original result", async () => {
    const { c, token: t } = await token();
    const id = randomUUID();
    const p = enrolPayload(t);
    const a = await runE(c, p, id);
    const b = await runE(c, p, id);
    expect(a.ok && b.ok).toBe(true);
    if (a.ok && b.ok) {
      expect(b.replayed).toBe(true);
      expect(b.result).toEqual(a.result);
    }
    const { rows } = await lane.pg.query(
      `SELECT count(*)::int AS n FROM public.ncd_person WHERE id = $1`,
      [p.personId],
    );
    expect(rows[0]).toEqual({ n: 1 });
    refused(
      await run(
        c,
        "visit.arrive",
        { visitId: randomUUID(), personId: p.personId, visitType: "scheduled" },
        id,
      ),
      "conflict",
    );
  });

  it("A7: merge needs a different approver, moves every child row, keeps a tombstone, earlier registration survives", async () => {
    const clin = await ctxFor(lane.db, f, "clinician");
    const officer = await ctxFor(lane.db, f, "registry_officer");
    const lead = await ctxFor(lane.db, f, "registry_lead");
    const a = await enrol(clin, { conditions: [{ condition: "hypertension" }] });
    const later = {
      ...clin,
      today: "2026-10-20",
      enteredAt: new Date("2026-10-20T09:00:00+03:00"),
    };
    const b = await enrol(later, {
      conditions: [{ condition: "hypertension" }, { condition: "diabetes" }],
    });
    const vb = randomUUID();
    await ok(later, "visit.record", {
      visitId: vb,
      personId: b.personId,
      visitDate: "2026-10-20",
      visitType: "scheduled",
      isHistorical: false,
      bp: [[150, 95]],
      nextAppointmentDate: "2026-12-01",
    });
    const mergeId = randomUUID();
    await ok(officer, "merge.request", {
      mergeId,
      personId: a.personId,
      loserPersonId: b.personId,
      reason: "Same person, two cards",
    });
    // The requester cannot approve; an officer cannot approve at all.
    refused(
      await run(officer, "merge.decide", { mergeId, personId: a.personId, approve: true }),
      "forbidden",
    );
    await ok(lead, "merge.decide", { mergeId, personId: a.personId, approve: true });
    const q = (s: string) => lane.pg.query(s, [b.personId]).then((r) => r.rows);
    for (const t of [
      "ncd_registration",
      "ncd_visit",
      "ncd_appointment",
      "ncd_reminder",
      "ncd_name_index",
      "ncd_query",
    ])
      expect(await q(`SELECT 1 FROM public.${t} WHERE person_id = $1`), `${t} orphans`).toEqual([]);
    expect((await q(`SELECT merged_into_id FROM public.ncd_person WHERE id = $1`))[0]).toEqual({
      merged_into_id: a.personId,
    });
    const regs = await lane.pg.query<{
      condition_code: string;
      superseded: boolean;
      registration_date: string;
    }>(
      `SELECT condition_code, superseded_by_id IS NOT NULL AS superseded, registration_date::text FROM public.ncd_registration WHERE person_id = $1 ORDER BY condition_code, registration_date`,
      [a.personId],
    );
    expect(regs.rows).toEqual([
      { condition_code: "diabetes", superseded: false, registration_date: "2026-10-20" },
      { condition_code: "hypertension", superseded: false, registration_date: "2026-10-05" },
      { condition_code: "hypertension", superseded: true, registration_date: "2026-10-20" },
    ]);
    const queries = await lane.pg.query(
      `SELECT rule_id FROM public.ncd_query WHERE person_id = $1 AND status = 'open'`,
      [a.personId],
    );
    expect(queries.rows.map((r) => (r as { rule_id: string }).rule_id)).toContain(
      "merge_duplicate_registration",
    );
  });
});
