/**
 * PROMPT-CLERKING-SUMMARY-IMPRESSION §3 on the PGlite lane: the defects found in production
 * (28 Sep 2026), as tests that fail today (`it.fails`). Each flips to `it` in the phase that
 * fixes it. EMR_PGLITE=1.
 */
import type { Lane } from "./_pglite";
import type { EmrActor } from "@/lib/emr/actor";
import type { WriteCtx } from "@/lib/emr/write/context";
import { beforeAll, describe, expect, it } from "vitest";

import { withPatientWrite } from "@/lib/emr/write/context";
import * as facts from "@/lib/emr/write/facts";
import { encrypt, generateKey } from "@/lib/encryption";
import {
  bootLane,
  department,
  encounter,
  hospital,
  intake,
  laneOn,
  patient,
  staff,
} from "./_pglite";

const key = () => `k-${crypto.randomUUID()}`;

describe.skipIf(!laneOn)("Summary and Impression baseline (PGlite lane)", () => {
  let lane: Lane;
  let h: string;
  let dept: string;
  let mo: EmrActor;
  let intern: EmrActor;
  let p: string;
  let enc: string;
  let diabetes: string;

  const actor = async (cadre: string): Promise<EmrActor> => {
    const s = await staff(lane.pg, { hospitalId: h, departmentId: dept, cadre });
    return {
      userId: s.userId,
      fullName: null,
      hospitalId: h,
      departmentId: dept,
      affiliationId: s.affiliationId,
      cadreCode: cadre,
      isClinical: true,
      surface: "doctor",
    };
  };
  const as = <T>(a: EmrActor, fn: (ctx: WriteCtx) => Promise<T>) =>
    withPatientWrite(a, p, fn, { database: lane.db });

  beforeAll(async () => {
    process.env.MEDSYNC_PHI_KEY ??= generateKey();
    lane = await bootLane();
    h = await hospital(lane.pg);
    dept = await department(lane.pg, h);
    mo = await actor("MEDICAL_OFFICER");
    intern = await actor("INTERN_DOCTOR");
    p = await patient(lane.pg);
    await lane.pg.query(
      `INSERT INTO public.patient_profiles (id, first_name_encrypted, surname_encrypted, sex, date_of_birth, id_type,
         phone_encrypted, district_id)
       VALUES ($1, $2, $3, 'male', '1950-03-01', 'none', $4, (SELECT id FROM public.districts LIMIT 1))`,
      [p, encrypt("Patient"), encrypt("Three-3"), encrypt("0700000000")],
    );
    enc = await encounter(lane.pg, {
      hospitalId: h,
      patientUserId: p,
      clinicianUserId: mo.userId,
      departmentId: dept,
    });
    await intake(lane.pg, { hospitalId: h, patientUserId: p });
    diabetes = (
      await lane.pg.query<{ id: string }>(
        `SELECT id FROM public.diagnosis_terms WHERE display ILIKE 'Diabetes, type not yet determined%' LIMIT 1`,
      )
    ).rows[0]!.id;
  }, 180_000);

  it.fails(
    "S-3: the same diagnosis twice on one visit is rejected as 'Already on this visit'",
    async () => {
      const record = (rank: "primary" | "secondary") =>
        as(mo, (ctx) =>
          facts.recordEncounterDiagnosis(ctx, {
            patientUserId: p,
            encounterId: enc,
            clientKey: key(),
            termId: diabetes,
            verification: "provisional",
            rank,
          }),
        );
      await record("primary");
      await expect(record("secondary")).rejects.toMatchObject({
        code: "conflict",
        message: expect.stringContaining("Already on this visit"),
      });
    },
  );

  it.fails(
    "S-4: an intern's Final is visibly pending, with a confirm_diagnosis co-signature request",
    async () => {
      const r = await as(intern, (ctx) =>
        facts.recordEncounterDiagnosis(ctx, {
          patientUserId: p,
          encounterId: enc,
          clientKey: key(),
          text: "Hypothermia, cause not yet known",
          verification: "confirmed",
          rank: "secondary",
        }),
      );
      const req = await lane.pg.query<{ n: number }>(
        `SELECT count(*)::int AS n FROM public.clinical_cosign_requests
        WHERE patient_user_id = $1 AND action_kind = 'confirm_diagnosis' AND state = 'pending_review'
          AND action_payload->>'conditionId' = $2`,
        [p, r.id],
      );
      expect(req.rows[0]!.n).toBe(1);
    },
  );
});
