/**
 * Lab Phase 3, Step 11: S53 — every signing action refuses an author signing their own draft when a second person
 * could sign (D-LAB1-12 carried into every Phase 3 signature, §12). Table-driven over the eight signed kinds Phase 3
 * added and the HMIS 105 signature. The written exception still works where no second person exists. Drafts are
 * inserted with empty payloads on purpose: who may sign is decided before what is signed, so a refused signer never
 * learns more than the refusal. Runs with EMR_PGLITE=1.
 */
import { randomUUID } from "node:crypto";
import type { Lane, Pg } from "./_pglite";
import { beforeAll, describe, expect, it } from "vitest";

import { signConfig } from "@/lib/lab/catalogue-v2";
import { signHmis } from "@/lib/lab/hmis-store";
import { authUser, bootLane, hospital, laneOn, superadmin } from "./_pglite";

const KINDS = [
  { kind: "qc_plan", second: "cso" },
  { kind: "qc_policy", second: "cso" },
  { kind: "hmis_mapping", second: "focal" },
  { kind: "kit_qc_rule", second: null },
  { kind: "acceptance_plan", second: null },
  { kind: "device_qc_rule", second: null },
  { kind: "competency_validity", second: null },
  { kind: "register_config", second: null },
] as const;
const NOTE = "Fixture: no one else can sign here";

describe.skipIf(!laneOn)("Lab Phase 3 signatures (S53)", () => {
  let lane: Lane;
  let pg: Pg;
  let h: string;
  let solo: string;
  const u: Record<string, string> = {};
  const one = async <T = Record<string, unknown>>(sql: string, params: unknown[] = []) =>
    (await pg.query<T>(sql, params)).rows[0] as T;
  const sign = (
    userId: string,
    as: "lead" | "cso" | "focal",
    configId: string,
    note: string | null,
    hospitalId = h,
  ) =>
    lane.db.transaction((t) =>
      signConfig(t, { userId, hospitalId, as }, { configId, exceptionNote: note }, new Date()),
    );
  const draft = async (kind: string, author: string, hospitalId = h, payload = "{}") =>
    (
      await one<{ id: string }>(
        `INSERT INTO lab_signed_configs (hospital_id, kind, key, version, payload, authored_by)
         VALUES ($1, $2, $3, 1, $4::jsonb, $5) RETURNING id`,
        [hospitalId, kind, `fx-${randomUUID().slice(0, 8)}`, payload, author],
      )
    ).id;
  const labWithLeads = async (hospitalId: string, leads: string[]) => {
    const lab = (
      await one<{ id: string }>(
        `INSERT INTO hospital_departments (hospital_id, name, slug, catalogue_code) VALUES ($1, 'Laboratory', $2, 'LABORATORY') RETURNING id`,
        [hospitalId, `lab-${randomUUID().slice(0, 8)}`],
      )
    ).id;
    // One open head per department: the first heads the Laboratory, each other one a section of it.
    for (const [n, l] of leads.entries()) {
      const dept =
        n === 0
          ? lab
          : (
              await one<{ id: string }>(
                `INSERT INTO hospital_departments (hospital_id, name, slug, parent_id) VALUES ($1, 'Section', $2, $3) RETURNING id`,
                [hospitalId, `sec-${randomUUID().slice(0, 8)}`, lab],
              )
            ).id;
      await pg.query(
        `INSERT INTO department_heads (hospital_id, department_id, user_id) VALUES ($1, $2, $3)`,
        [hospitalId, dept, l],
      );
    }
  };

  beforeAll(async () => {
    lane = await bootLane();
    pg = lane.pg;
    h = await hospital(pg, "Signing");
    solo = await hospital(pg, "One lead");
    for (const k of ["leadA", "leadB", "focalA", "focalB", "inChargeA", "inChargeB", "soloLead"])
      u[k] = await authUser(pg, k);
    u.csoA = await superadmin(pg);
    u.csoB = await superadmin(pg);
    await labWithLeads(h, [u.leadA!, u.leadB!]);
    await labWithLeads(solo, [u.soloLead!]);
    for (const [role, user] of [
      ["focal", u.focalA],
      ["focal", u.focalB],
      ["in_charge", u.inChargeA],
      ["in_charge", u.inChargeB],
    ] as const)
      await pg.query(
        `INSERT INTO hmis_designations (hospital_id, role, user_id, starts_on, set_by) VALUES ($1, $2, $3, '2026-01-01', $3)`,
        [h, role, user],
      );
  });

  it.each(KINDS)(
    "S53: $kind — the author is refused as lead while another lead can sign; the second slot likewise",
    async ({ kind, second }) => {
      const id = await draft(kind, u.leadA!);
      await expect(sign(u.leadA!, "lead", id, null)).rejects.toThrow(/You wrote this draft/);
      await expect(sign(u.leadA!, "lead", id, NOTE)).rejects.toThrow(
        /another lead can sign it: they sign it/,
      );
      // The other lead passes the person check (the empty fixture payload is what stops them).
      await expect(sign(u.leadB!, "lead", id, null)).rejects.toThrow(/incomplete/);
      if (!second) return;
      await pg.query(
        `UPDATE lab_signed_configs SET lead_signed_by = $2, lead_signed_at = now() WHERE id = $1`,
        [id, u.leadB],
      );
      // The person who signed as lead cannot also take the second slot, even with a note, while another can.
      await expect(sign(u.leadB!, second, id, NOTE)).rejects.toThrow(
        new RegExp(
          `another ${second === "cso" ? "CSO" : "HMIS focal person"} can sign: they sign it`,
        ),
      );
      const other = second === "cso" ? u.csoA! : u.focalA!;
      await expect(sign(other, second, id, null)).rejects.toThrow(/incomplete/);
    },
  );

  it("S53: the HMIS 105 — the In-Charge who checked it is refused while another In-Charge is designated", async () => {
    const mapping = (
      await one<{ id: string }>(
        `INSERT INTO lab_signed_configs (hospital_id, kind, key, version, status, payload, authored_by, lead_signed_by,
           lead_signed_at, cso_signed_by, cso_signed_at, in_force_from)
         VALUES ($1, 'hmis_mapping', 'fx-mapping', 1, 'signed', '{}', $2, $2, now(), $3, now(), now()) RETURNING id`,
        [h, u.leadA, u.focalA],
      )
    ).id;
    await pg.query(
      `INSERT INTO lab_hmis_reports (hospital_id, month, state, mapping_config_id, mapping_version, form_hash, checked_by, checked_at)
       VALUES ($1, '2026-09-01', 'checked', $2, 1, $3, $4, now())`,
      [h, mapping, "0".repeat(64), u.inChargeA],
    );
    const signAs = (userId: string) =>
      lane.db.transaction((t) =>
        signHmis(
          t,
          { userId, hospitalId: h },
          { month: "2026-09", revision: 1, freshSecondFactor: true },
          new Date(),
        ),
      );
    await expect(signAs(u.inChargeA!)).rejects.toThrow(
      /You checked this report: another In-Charge signs it/,
    );
    await expect(signAs(u.inChargeB!)).resolves.toBeTruthy();
  });

  it("S53: where no second person exists, the author signs with the written exception", async () => {
    const id = await draft(
      "register_config",
      u.soloLead!,
      solo,
      JSON.stringify({ columns: [{ key: "labNo", label: "Lab no." }] }),
    );
    await expect(sign(u.soloLead!, "lead", id, null, solo)).rejects.toThrow(/You wrote this draft/);
    await sign(u.soloLead!, "lead", id, NOTE, solo);
    expect(
      await one(`SELECT status, exception_note FROM lab_signed_configs WHERE id = $1`, [id]),
    ).toEqual({ status: "signed", exception_note: NOTE });
  });
});
