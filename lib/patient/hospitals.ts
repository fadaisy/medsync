import "server-only";

import { and, asc, eq, ilike, or, sql } from "drizzle-orm";

import { db } from "@/db";
import { hospitalDepartments } from "@/db/schema/hospital-departments";
import { hospitals } from "@/db/schema/hospitals";

/**
 * Public-facing hospital directory queries for the patient workspace.
 * Only `state = 'active'` hospitals are returned — the patient should
 * never see in-progress applications or suspended facilities.
 */

export interface DirectoryHospital {
  id: string;
  name: string;
  slug: string;
  level: string;
  region: string | null;
  district: string | null;
  departmentCount: number;
}

export const HOSPITAL_LEVEL_LABEL: Record<string, string> = {
  national_referral: "National referral",
  regional: "Regional referral",
  district: "District hospital",
  hc4: "Health centre IV",
  hc3: "Health centre III",
  private: "Private hospital",
};

export async function listDirectoryHospitals(opts: {
  search?: string;
  limit?: number;
}): Promise<DirectoryHospital[]> {
  const q = (opts.search ?? "").trim();
  const limit = opts.limit ?? 60;

  const conditions = [eq(hospitals.state, "active")];
  if (q) {
    const pattern = `%${q}%`;
    const term = or(
      ilike(hospitals.name, pattern),
      ilike(hospitals.district, pattern),
      ilike(hospitals.region, pattern),
    );
    if (term) conditions.push(term);
  }

  const rows = await db
    .select({
      id: hospitals.id,
      name: hospitals.name,
      slug: hospitals.slug,
      level: hospitals.level,
      region: hospitals.region,
      district: hospitals.district,
      departmentCount: sql<number>`count(${hospitalDepartments.id})::int`,
    })
    .from(hospitals)
    .leftJoin(hospitalDepartments, eq(hospitalDepartments.hospitalId, hospitals.id))
    .where(and(...conditions))
    .groupBy(hospitals.id)
    .orderBy(asc(hospitals.name))
    .limit(limit);

  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    slug: r.slug,
    level: r.level,
    region: r.region,
    district: r.district,
    departmentCount: r.departmentCount ?? 0,
  }));
}
