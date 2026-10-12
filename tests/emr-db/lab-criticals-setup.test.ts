/**
 * Lab Phase 1, Step 4: critical-results set-up on the PGlite lane. Contacts are clinicians who may
 * acknowledge; response times are drafted, signed by the lead and then the CSO (two people, D-LAB1-12)
 * and only then in force; SMS templates need two different approvers and refuse patient detail.
 * Minutes are FIXTURE values, invented. Runs with EMR_PGLITE=1.
 */
import type { Lane, Pg } from "./_pglite";
import { beforeAll, describe, expect, it } from "vitest";

import { departmentsWithoutLevel1 } from "@/lib/lab/criticals/readiness";
import {
  approveSmsTemplate,
  editSmsTemplate,
  ensureSmsTemplates,
  saveLabSettings,
  saveResponseDraft,
  setContacts,
  signResponseVersion,
} from "@/lib/lab/criticals/setup";
import { signedTimes } from "@/lib/lab/criticals/store";
import { bootLane, clinician, department, encounter, hospital, laneOn, patient } from "./_pglite";

const NOW = new Date("2026-10-11T08:00:00Z");

describe.skipIf(!laneOn)("Lab Phase 1 critical-results set-up", () => {
  let lane: Lane;
  let pg: Pg;
  let h: string;
  let hOther: string;
  let ward: string;
  let lead: string;
  let lead2: string;
  let cso: string;
  let doctor: string;
  let nurse: string;
  const tx = <T>(fn: (t: Parameters<Parameters<Lane["db"]["transaction"]>[0]>[0]) => Promise<T>) =>
    lane.db.transaction(fn);

  beforeAll(async () => {
    lane = await bootLane();
    pg = lane.pg;
    h = await hospital(pg, "Set-up");
    hOther = await hospital(pg, "Other");
    ward = await department(pg, h, "Ward 4A");
    const lab = await department(pg, h, "Laboratory");
    lead = (await clinician(pg, { hospitalId: h, departmentId: lab, cadre: "LAB_TECHNOLOGIST" }))
      .userId;
    lead2 = (await clinician(pg, { hospitalId: h, departmentId: lab, cadre: "LAB_TECHNOLOGIST" }))
      .userId;
    cso = (await clinician(pg, { hospitalId: h, departmentId: ward, cadre: "CONSULTANT" })).userId;
    doctor = (await clinician(pg, { hospitalId: h, departmentId: ward })).userId;
    nurse = (await clinician(pg, { hospitalId: h, departmentId: ward, cadre: "NURSE" })).userId;
  }, 240_000);

  it("settings are one row per hospital", async () => {
    await tx((t) =>
      saveLabSettings(
        t,
        { userId: lead, hospitalId: h },
        { labPhone: "Ext 214", secondCheck: false, smsLive: false },
        NOW,
      ),
    );
    await tx((t) =>
      saveLabSettings(
        t,
        { userId: lead, hospitalId: h },
        { labPhone: "Ext 215", secondCheck: true, smsLive: false },
        NOW,
      ),
    );
    expect(
      (
        await pg.query(`SELECT lab_phone, second_check FROM lab_settings WHERE hospital_id = $1`, [
          h,
        ])
      ).rows,
    ).toEqual([{ lab_phone: "Ext 215", second_check: true }]);
  });

  it("contacts: clinicians who may acknowledge, at this hospital, in order; replaced as a list", async () => {
    await expect(
      tx((t) =>
        setContacts(
          t,
          { userId: lead, hospitalId: h },
          { departmentId: ward, level: 1, userIds: [nurse] },
          NOW,
        ),
      ),
    ).rejects.toThrow(/may acknowledge/);
    await expect(
      tx((t) =>
        setContacts(
          t,
          { userId: lead, hospitalId: hOther },
          { departmentId: ward, level: 1, userIds: [doctor] },
          NOW,
        ),
      ),
    ).rejects.toThrow(/not at this hospital/);
    await expect(
      tx((t) =>
        setContacts(
          t,
          { userId: lead, hospitalId: h },
          { departmentId: null, level: 1, userIds: [doctor] },
          NOW,
        ),
      ),
    ).rejects.toThrow(/department/);
    await tx((t) =>
      setContacts(
        t,
        { userId: lead, hospitalId: h },
        { departmentId: ward, level: 1, userIds: [cso, doctor] },
        NOW,
      ),
    );
    await tx((t) =>
      setContacts(
        t,
        { userId: lead, hospitalId: h },
        { departmentId: ward, level: 1, userIds: [doctor, cso] },
        NOW,
      ),
    );
    expect(
      (
        await pg.query(
          `SELECT user_id FROM critical_contacts WHERE hospital_id = $1 AND level = 1 ORDER BY position`,
          [h],
        )
      ).rows,
    ).toEqual([{ user_id: doctor }, { user_id: cso }]);
  });

  it("response times: not in force until the lead and then a different CSO sign; edits never touch a signature", async () => {
    const draft = {
      ackWithinMin: 30,
      level1AfterMin: 20,
      level2AfterMin: null,
      source: "fixture: invented for tests",
    };
    await expect(
      tx((t) =>
        saveResponseDraft(
          t,
          { userId: lead, hospitalId: h },
          { ...draft, level1AfterMin: null, level2AfterMin: 5 },
        ),
      ),
    ).rejects.toThrow(/level 1 before level 2/);
    const v1 = await tx((t) => saveResponseDraft(t, { userId: lead, hospitalId: h }, draft));
    expect(
      await tx((t) =>
        saveResponseDraft(t, { userId: lead, hospitalId: h }, { ...draft, ackWithinMin: 25 }),
      ),
    ).toBe(v1); // same draft
    // D-LAB1-12: the author does not sign their own draft without a recorded exception.
    await expect(
      tx((t) =>
        signResponseVersion(
          t,
          { userId: lead, hospitalId: h, as: "lead" },
          { versionId: v1, exceptionNote: null },
          NOW,
        ),
      ),
    ).rejects.toThrow(/another lead/);
    await expect(
      tx((t) =>
        signResponseVersion(
          t,
          { userId: cso, hospitalId: h, as: "cso" },
          { versionId: v1, exceptionNote: null },
          NOW,
        ),
      ),
    ).rejects.toThrow(/lead signs first/);
    await tx((t) =>
      signResponseVersion(
        t,
        { userId: lead2, hospitalId: h, as: "lead" },
        { versionId: v1, exceptionNote: null },
        NOW,
      ),
    );
    expect(await tx((t) => signedTimes(t, h))).toBeNull();
    // An edit after the lead signed opens a new draft; the signed draft keeps its signature.
    const v2 = await tx((t) =>
      saveResponseDraft(t, { userId: lead, hospitalId: h }, { ...draft, ackWithinMin: 40 }),
    );
    expect(v2).not.toBe(v1);
    await expect(
      tx((t) =>
        signResponseVersion(
          t,
          { userId: lead2, hospitalId: h, as: "cso" },
          { versionId: v1, exceptionNote: null },
          NOW,
        ),
      ),
    ).rejects.toThrow(/different person/);
    await tx((t) =>
      signResponseVersion(
        t,
        { userId: cso, hospitalId: h, as: "cso" },
        { versionId: v1, exceptionNote: null },
        NOW,
      ),
    );
    expect(await tx((t) => signedTimes(t, h))).toEqual({
      ackWithinMin: 25,
      level1AfterMin: 20,
      level2AfterMin: null,
    });
    // The next signed set supersedes it.
    await tx((t) =>
      signResponseVersion(
        t,
        { userId: lead2, hospitalId: h, as: "lead" },
        { versionId: v2, exceptionNote: null },
        NOW,
      ),
    );
    await tx((t) =>
      signResponseVersion(
        t,
        { userId: cso, hospitalId: h, as: "cso" },
        { versionId: v2, exceptionNote: null },
        NOW,
      ),
    );
    expect(await tx((t) => signedTimes(t, h))).toMatchObject({ ackWithinMin: 40 });
    expect(
      (await pg.query(`SELECT status FROM critical_response_versions WHERE id = $1`, [v1])).rows[0],
    ).toEqual({ status: "superseded" });
  });

  it("SMS templates: seeded from the drafts, refused with patient detail, approved by two different people", async () => {
    await tx((t) => ensureSmsTemplates(t, { userId: lead, hospitalId: h }, NOW));
    await tx((t) => ensureSmsTemplates(t, { userId: lead, hospitalId: h }, NOW));
    expect(
      Number(
        (
          await pg.query<{ n: number }>(
            `SELECT count(*) n FROM lab_sms_templates WHERE hospital_id = $1`,
            [h],
          )
        ).rows[0]!.n,
      ),
    ).toBe(2);
    await expect(
      tx((t) =>
        editSmsTemplate(
          t,
          { userId: lead, hospitalId: h },
          { kind: "level0", body: "MedSync: potassium 6.9 mmol/L on {place}." },
          NOW,
        ),
      ),
    ).rejects.toThrow(/may not name/);
    await expect(
      tx((t) =>
        editSmsTemplate(
          t,
          { userId: lead, hospitalId: h },
          { kind: "level0", body: "MedSync: result for {patient} on {place}." },
          NOW,
        ),
      ),
    ).rejects.toThrow(/Use only/);
    const [t1] = (
      await pg.query<{ id: string }>(
        `SELECT id FROM lab_sms_templates WHERE hospital_id = $1 AND kind = 'level0'`,
        [h],
      )
    ).rows;
    expect(
      await tx((t) => approveSmsTemplate(t, { userId: lead, hospitalId: h }, t1!.id, NOW)),
    ).toBe("pending_review");
    await expect(
      tx((t) => approveSmsTemplate(t, { userId: lead, hospitalId: h }, t1!.id, NOW)),
    ).rejects.toThrow(/different person/);
    expect(
      await tx((t) => approveSmsTemplate(t, { userId: lead2, hospitalId: h }, t1!.id, NOW)),
    ).toBe("approved");
    // Another hospital's approver cannot touch it.
    await expect(
      tx((t) => approveSmsTemplate(t, { userId: lead, hospitalId: hOther }, t1!.id, NOW)),
    ).rejects.toThrow(/not found/);
  });

  it("S19: a department with an encounter in 30 days and no level-1 contact refuses the flag in production", async () => {
    const h2 = await hospital(pg, "Readiness");
    const w = await department(pg, h2, "Ward R");
    await department(pg, h2, "Ward quiet");
    const doc = (await clinician(pg, { hospitalId: h2, departmentId: w })).userId;
    await encounter(pg, {
      hospitalId: h2,
      patientUserId: await patient(pg),
      clinicianUserId: doc,
      departmentId: w,
    });
    const now = new Date();
    expect((await departmentsWithoutLevel1(h2, now, lane.db)).map((d) => d.id)).toEqual([w]);
    await tx((t) =>
      setContacts(
        t,
        { userId: doc, hospitalId: h2 },
        { departmentId: w, level: 1, userIds: [doc] },
        NOW,
      ),
    );
    expect(await departmentsWithoutLevel1(h2, now, lane.db)).toEqual([]);
  });
});
