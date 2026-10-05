/**
 * NCD fixtures on the PGlite lane (tests/emr-db/_pglite.ts). A facility with one user per NCD role
 * derived the way production derives them: cadres for nurse / clinician / registry officer, the admin
 * roster for administrator, `ncd_staff_role` rows (written as the owner) for the rest.
 */
import { randomUUID } from "node:crypto";
import type { Pg, PgQueryable } from "../emr-db/_pglite";
import type { NcdRole } from "@/lib/ncdreg/capabilities";

import { department, hospital, staff, superadmin } from "../emr-db/_pglite";

export { bootLane, laneOn } from "../emr-db/_pglite";

export type NcdFacility = {
  facilityId: string;
  departmentId: string;
  users: Record<NcdRole, string>;
  superadminId: string;
};

export async function assign(pg: PgQueryable, facilityId: string, userId: string, role: NcdRole) {
  await pg.query(
    `INSERT INTO public.ncd_staff_role (facility_id, user_id, ncd_role) VALUES ($1, $2, $3)`,
    [facilityId, userId, role],
  );
}

export async function ncdFacility(pg: Pg, name = "NCD lane hospital"): Promise<NcdFacility> {
  const facilityId = await hospital(pg, name);
  const departmentId = await department(pg, facilityId, "Medicine");
  const s = (cadre: string) =>
    staff(pg, { hospitalId: facilityId, departmentId, cadre }).then((x) => x.userId);
  const triage_nurse = await s("NURSE");
  const clinician = await s("MEDICAL_OFFICER");
  const registry_officer = await s("RECEPTION");
  const registry_lead = await s("CONSULTANT");
  const head_of_department = await s("SENIOR_CONSULTANT");
  const auditor = await s("RECEPTION");
  const clinical_safety_officer = await s("CONSULTANT");
  const administrator = (
    await pg.query<{ id: string }>(`INSERT INTO auth.users (email) VALUES ($1) RETURNING id`, [
      `admin-${randomUUID().slice(0, 8)}@lane.test`,
    ])
  ).rows[0]!.id;
  await pg.query(
    `INSERT INTO public.hospital_admin_roster (hospital_id, user_id, designation, designated_by) VALUES ($1, $2, 'backup', $2)`,
    [facilityId, administrator],
  );
  await pg.query(
    `INSERT INTO public.user_roles (user_id, role, hospital_id) VALUES ($1, 'hospital_admin', $2)`,
    [administrator, facilityId],
  );
  // Assigned roles stand alone in the probe matrix: these users hold only the assigned role.
  for (const [u, r] of [
    [registry_lead, "registry_lead"],
    [head_of_department, "head_of_department"],
    [auditor, "auditor"],
    [clinical_safety_officer, "clinical_safety_officer"],
  ] as const) {
    await pg.query(`UPDATE public.staff_affiliations SET state = 'suspended' WHERE user_id = $1`, [
      u,
    ]);
    await assign(pg, facilityId, u, r);
  }
  const superadminId = await superadmin(pg);
  await pg.query(
    `INSERT INTO public.staff_affiliations (user_id, hospital_id, department_id, cadre_id, role_id, employment_type, state, approved_at)
     SELECT $1, $2, $3, c.id, (SELECT id FROM public.roles LIMIT 1), 'full_time', 'active', now()
       FROM public.cadres c WHERE c.code = 'MEDICAL_OFFICER'`,
    [superadminId, facilityId, departmentId],
  );
  return {
    facilityId,
    departmentId,
    superadminId,
    users: {
      triage_nurse,
      clinician,
      registry_officer,
      registry_lead,
      head_of_department,
      administrator,
      auditor,
      clinical_safety_officer,
    },
  };
}

export type NcdActor = {
  userId: string | null;
  facilityId: string | null;
  principal?: "user" | "system" | "demo_loader";
  role?: "medsync_ncd_app" | "medsync_ncd_analytics" | "anon";
};

/** Run `fn` as `actor` in a transaction that is always rolled back. */
export async function asNcd<T>(
  pg: Pg,
  actor: NcdActor,
  fn: (tx: PgQueryable) => Promise<T>,
): Promise<T> {
  let out: T | undefined;
  let err: unknown;
  await pg
    .transaction(async (tx) => {
      await tx.query(
        `SELECT set_config('app.user_id', $1, true), set_config('app.hospital_id', $2, true),
                set_config('app.ncd_principal', $3, true), set_config('request.jwt.claim.sub', $1, true)`,
        [actor.userId ?? "", actor.facilityId ?? "", actor.principal ?? "user"],
      );
      await tx.query(`SET LOCAL ROLE ${actor.role ?? "medsync_ncd_app"}`);
      try {
        out = await fn(tx);
      } catch (e) {
        err = e;
      }
      await tx.rollback();
    })
    .catch(() => undefined);
  if (err) throw err;
  return out as T;
}
