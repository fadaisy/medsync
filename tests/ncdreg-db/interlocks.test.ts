/**
 * P4 gate, PGlite lane: the go-live interlock (§8.3), the draft-module rule (I4), definition
 * versions with a second approver (I2), and role assignment limits (D-11, D-16).
 */
import { randomUUID } from "node:crypto";
import type { Lane } from "../emr-db/_pglite";
import type { NcdFacility } from "./_ncd";
import { beforeAll, describe, expect, it } from "vitest";

import {
  assignRole,
  decideDefinition,
  decideGoLive,
  facilityStatus,
  proposeDefinition,
  requestGoLive,
  setConditionEnabled,
} from "@/lib/ncdreg/admin";
import { searchPersons } from "@/lib/ncdreg/search";
import { ctxFor, enrol, ok, randomName, refused, run } from "./_engine";
import { bootLane, laneOn, ncdFacility } from "./_ncd";

const realEnrol = (token: string, o: Record<string, unknown> = {}) => ({
  personId: randomUUID(),
  searchToken: token,
  identity: { givenName: randomName(), familyName: randomName(), sex: "male", ageYears: 60 },
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
  ...o,
});

describe.skipIf(!laneOn)("go-live interlock and administration", () => {
  let lane: Lane;
  let f: NcdFacility;
  beforeAll(async () => {
    lane = await bootLane();
    f = await ncdFacility(lane.pg, "Interlock facility");
  }, 120_000);
  /** realEnrol with a search token for exactly its names (tokens are bound to the names searched). */
  const signedReal = async (
    c: Awaited<ReturnType<typeof ctxFor>>,
    o: Record<string, unknown> = {},
  ) => {
    const p = realEnrol("", o);
    const { token } = await searchPersons(c, {
      givenName: p.identity.givenName,
      familyName: p.identity.familyName,
      sex: null,
      birthYear: null,
      phones: [],
      hospitalNumber: null,
      nationalId: null,
    });
    return { ...p, searchToken: token };
  };

  it("before go-live: a real person is refused, by the server and by the database", async () => {
    const c = await ctxFor(lane.db, f, "clinician");
    refused(await run(c, "person.enrol", await signedReal(c)), "interlock");
    await expect(
      lane.pg.query(
        `INSERT INTO public.ncd_person (facility_id, registry_number, is_synthetic, given_name_ciphertext, family_name_ciphertext, sex, birth_year, privacy_notice_version, privacy_notice_ack_at)
         VALUES ($1, 'NCD-2026-00001', false, 'x', 'y', 'male', 1970, 'v', now())`,
        [f.facilityId],
      ),
    ).rejects.toThrow(/not approved for patient data/);
  });

  it("the DEMO- series is refused for a person who is not synthetic (before go-live, everything real is)", async () => {
    await expect(
      lane.pg.query(
        `INSERT INTO public.ncd_person (facility_id, registry_number, is_synthetic, given_name_ciphertext, family_name_ciphertext, sex, birth_year, privacy_notice_version, privacy_notice_ack_at)
         VALUES ($1, 'DEMO-99999', false, 'x', 'y', 'male', 1970, 'v', now())`,
        [f.facilityId],
      ),
    ).rejects.toThrow(/DEMO- series|not approved/);
  });

  it("I4: a draft core module can be enabled before go-live", async () => {
    const lead = await ctxFor(lane.db, f, "registry_lead");
    await setConditionEnabled(lead, "asthma", true, "pilot");
    expect((await facilityStatus(lead)).draftCoreEnabled).toEqual(["asthma"]);
    const clin = await ctxFor(lane.db, f, "clinician");
    await expect(setConditionEnabled(clin, "asthma", false, "x")).rejects.toThrow(
      /condition_catalogue_manage/,
    );
  });

  it("go-live is refused while synthetic persons exist, and while a draft core module is enabled", async () => {
    const lead = await ctxFor(lane.db, f, "registry_lead");
    await enrol(await ctxFor(lane.db, f, "clinician"));
    await expect(requestGoLive(lead, null)).rejects.toThrow(/synthetic record/);
    expect((await facilityStatus(await ctxFor(lane.db, f, "administrator"))).syntheticPersons).toBe(
      1,
    );
    // Clear the synthetic person as the owner (the delete guard allows it: the person is synthetic).
    await lane.pg.exec(`
      DELETE FROM public.ncd_name_index WHERE facility_id = '${f.facilityId}';
      DELETE FROM public.ncd_query WHERE facility_id = '${f.facilityId}';
      DELETE FROM public.ncd_command_log WHERE facility_id = '${f.facilityId}';
      DELETE FROM public.ncd_registration WHERE facility_id = '${f.facilityId}';
      DELETE FROM public.ncd_person WHERE facility_id = '${f.facilityId}';`);
    await expect(requestGoLive(lead, null)).rejects.toThrow(/draft core module/);
    await setConditionEnabled(lead, "asthma", false, "not for go-live");
  });

  it("go-live: same-user approval refused, non-CSO refused, CSO approves; then the switches flip", async () => {
    const lead = await ctxFor(lane.db, f, "registry_lead");
    const req = await requestGoLive(lead, "ready");
    await expect(decideGoLive(lead, req.id, true)).rejects.toThrow(/clinical_safety_approve/);
    const cso = await ctxFor(lane.db, f, "clinical_safety_officer");
    await decideGoLive(cso, req.id, true);
    expect((await facilityStatus(lead)).approved).toBe(true);
    // After go-live: real persons are accepted, synthetic refused, draft core modules cannot be enabled.
    const c = await ctxFor(lane.db, f, "clinician");
    const r = await ok(c, "person.enrol", await signedReal(c));
    expect(String(r.registryNumber)).toMatch(/^NCD-2026-\d{5}$/);
    refused(
      await run(c, "person.enrol", { ...(await signedReal(c)), isSynthetic: true }),
      "interlock",
    );
    await expect(setConditionEnabled(lead, "epilepsy", true, "x")).rejects.toThrow(/draft module/);
    // §8.3: the DEMO- series cannot be typed for a real person.
    await expect(
      lane.pg.query(
        `INSERT INTO public.ncd_person (facility_id, registry_number, is_synthetic, given_name_ciphertext, family_name_ciphertext, sex, birth_year, privacy_notice_version, privacy_notice_ack_at)
         VALUES ($1, 'DEMO-99999', false, 'x', 'y', 'male', 1970, 'v', now())`,
        [f.facilityId],
      ),
    ).rejects.toThrow(/DEMO- series/);
    await expect(
      lane.pg.query(
        `INSERT INTO public.ncd_condition_setting (facility_id, condition_code, enabled, module_level, module_status, module_version, version) VALUES ($1, 'epilepsy', true, 'core', 'draft', 'x', 99)`,
        [f.facilityId],
      ),
    ).rejects.toThrow(/draft core module/);
  });

  it("the database refuses a go-live approval by the requester or by someone without clinical safety approval", async () => {
    const g = await ncdFacility(lane.pg, "Interlock facility 2");
    const { rows } = await lane.pg.query<{ id: string }>(
      `INSERT INTO public.ncd_go_live_request (facility_id, requested_by) VALUES ($1, $2) RETURNING id`,
      [g.facilityId, g.users.registry_lead],
    );
    const id = rows[0]!.id;
    await expect(
      lane.pg.query(
        `UPDATE public.ncd_go_live_request SET status = 'approved', decided_by = $2 WHERE id = $1`,
        [id, g.users.registry_lead],
      ),
    ).rejects.toThrow();
    await expect(
      lane.pg.query(
        `UPDATE public.ncd_go_live_request SET status = 'approved', decided_by = $2 WHERE id = $1`,
        [id, g.users.clinician],
      ),
    ).rejects.toThrow(/clinical safety/);
  });

  it("I2: a definition change needs a different approver; history is never rewritten", async () => {
    const lead = await ctxFor(lane.db, f, "registry_lead");
    const v1 = await proposeDefinition(lead, "medicine", {
      add: [{ code: "dapagliflozin", label: "Dapagliflozin" }],
    });
    await expect(decideDefinition(lead, v1.id, true)).rejects.toThrow(/second person/);
    const g = f.users.clinician;
    await lane.pg.query(
      `INSERT INTO public.ncd_staff_role (facility_id, user_id, ncd_role) VALUES ($1, $2, 'registry_lead')`,
      [f.facilityId, g],
    );
    const lead2 = await ctxFor(lane.db, f, { userId: g });
    await decideDefinition(lead2, v1.id, true);
    const v2 = await proposeDefinition(lead, "medicine", {
      add: [{ code: "empagliflozin", label: "Empagliflozin" }],
    });
    expect(v2.version).toBe("medicine-f2");
    const { rows } = await lane.pg.query(
      `SELECT version, status FROM public.ncd_definition_version WHERE facility_id = $1 ORDER BY version`,
      [f.facilityId],
    );
    expect(rows).toEqual([
      { version: "medicine-f1", status: "approved" },
      { version: "medicine-f2", status: "proposed" },
    ]);
  });

  it("roles: the administrator assigns a registry lead; nobody in the app can assign the CSO role; superadmin holds nothing", async () => {
    const admin = await ctxFor(lane.db, f, "administrator");
    await assignRole(admin, f.users.triage_nurse, "auditor");
    await expect(
      assignRole(admin, f.users.triage_nurse, "clinical_safety_officer" as never),
    ).rejects.toThrow(/not assignable/);
    const sa = await ctxFor(lane.db, f, { userId: f.superadminId });
    expect(sa.roles).toEqual([]);
    // The administrator cannot give a superadmin a registry role (they are not staff here for NCD).
    await expect(assignRole(admin, f.superadminId, "registry_lead")).rejects.toThrow(/staff/);
  });

  it("0094: a superadmin holds only roles assigned explicitly, by the database owner, at that hospital", async () => {
    // Owner path (SQL editor): the superadmin is on staff here as a doctor, yet gets only the assigned role.
    await lane.pg.query(
      `INSERT INTO public.ncd_staff_role (facility_id, user_id, ncd_role, granted_by) VALUES ($1, $2, 'clinical_safety_officer', $2)`,
      [f.facilityId, f.superadminId],
    );
    const sa = await ctxFor(lane.db, f, { userId: f.superadminId });
    expect(sa.roles).toEqual(["clinical_safety_officer"]);
    expect([...sa.caps]).toContain("clinical_safety_approve");
    expect([...sa.caps]).not.toContain("identifier_reveal");
    // Nothing at another hospital.
    const g = await ncdFacility(lane.pg, "Second facility for 0094");
    expect((await ctxFor(lane.db, g, { userId: f.superadminId })).roles).toEqual([]);
    // Revoked: back to nothing.
    await lane.pg.query(`UPDATE public.ncd_staff_role SET revoked_at = now() WHERE user_id = $1`, [
      f.superadminId,
    ]);
    expect((await ctxFor(lane.db, f, { userId: f.superadminId })).roles).toEqual([]);
  });
});
