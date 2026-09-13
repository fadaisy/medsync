import "server-only";

import { and, asc, eq, exists, gt, gte, ilike, isNull, lt, or, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";

import { db } from "@/db";
import { clinicSessions } from "@/db/schema/clinic-sessions";
import { hospitalDepartments } from "@/db/schema/hospital-departments";
import { hospitals } from "@/db/schema/hospitals";
import { availabilityBlocks } from "@/db/schema/scheduling";
import { serviceLines } from "@/db/schema/service-lines";

/**
 * Public-facing hospital directory queries for the patient workspace.
 * Only `state = 'active'` hospitals are returned — the patient should
 * never see in-progress applications or suspended facilities. Active IS
 * the verification (the registration flow ends there), which is what the
 * directory's "Verified" pill says.
 */

export interface DirectoryHospital {
  id: string;
  name: string;
  slug: string;
  level: string;
  region: string | null;
  district: string | null;
  departmentCount: number;
  /**
   * PRD §3.3.1's honesty rule: true only when the hospital has published
   * something a patient could actually book in the next 14 days — a clinic
   * day, or a bookable availability block. Otherwise "No days open".
   */
  acceptingBookings: boolean;
}

export const HOSPITAL_LEVEL_LABEL: Record<string, string> = {
  national_referral: "National referral",
  regional: "Regional referral",
  district: "District hospital",
  hc4: "Health centre IV",
  hc3: "Health centre III",
  private: "Private hospital",
};

/** The same 14 days `/patient/book` derives over (ADR 0084 §8). */
const LOOKAHEAD_DAYS = 14;

export async function listDirectoryHospitals(opts: {
  search?: string;
  limit?: number;
}): Promise<DirectoryHospital[]> {
  const q = (opts.search ?? "").trim();
  const limit = opts.limit ?? 60;
  const now = new Date();
  const until = new Date(now.getTime() + LOOKAHEAD_DAYS * 86_400_000);

  const conditions = [eq(hospitals.state, "active")];
  if (q) {
    const pattern = `%${q}%`;
    // Aliased: the outer query joins the same table for its count.
    const dept = alias(hospitalDepartments, "matched_department");
    // A patient searches for the clinic they were told to attend at least
    // as often as for the hospital's name — so a department or a service
    // line ("Diabetes Clinic") finds the hospital that runs it.
    const term = or(
      ilike(hospitals.name, pattern),
      ilike(hospitals.district, pattern),
      ilike(hospitals.region, pattern),
      exists(
        db
          .select({ one: sql`1` })
          .from(dept)
          .where(and(eq(dept.hospitalId, hospitals.id), ilike(dept.name, pattern))),
      ),
      exists(
        db
          .select({ one: sql`1` })
          .from(serviceLines)
          .where(
            and(
              eq(serviceLines.hospitalId, hospitals.id),
              eq(serviceLines.active, true),
              ilike(serviceLines.name, pattern),
            ),
          ),
      ),
    );
    if (term) conditions.push(term);
  }

  // One correlated EXISTS per hospital, not the slot engine: the directory
  // needs a yes/no, and a bookable block overlapping the window is the same
  // "something is declared" the engine starts from. It can over-promise by
  // one clinic whose every slot is taken; it never says "open" about a
  // hospital that declared nothing.
  const publishedSession = exists(
    db
      .select({ one: sql`1` })
      .from(clinicSessions)
      .where(
        and(
          eq(clinicSessions.hospitalId, hospitals.id),
          eq(clinicSessions.status, "published"),
          gt(clinicSessions.startsAt, now),
          lt(clinicSessions.startsAt, until),
        ),
      ),
  );
  const bookableBlock = exists(
    db
      .select({ one: sql`1` })
      .from(availabilityBlocks)
      .where(
        and(
          eq(availabilityBlocks.hospitalId, hospitals.id),
          eq(availabilityBlocks.kind, "bookable"),
          eq(availabilityBlocks.state, "active"),
          or(
            and(gte(availabilityBlocks.endsAt, now), lt(availabilityBlocks.startsAt, until)),
            and(
              eq(availabilityBlocks.recurrence, "weekly"),
              or(
                isNull(availabilityBlocks.recurrenceUntil),
                gte(availabilityBlocks.recurrenceUntil, now),
              ),
            ),
          ),
        ),
      ),
  );

  const rows = await db
    .select({
      id: hospitals.id,
      name: hospitals.name,
      slug: hospitals.slug,
      level: hospitals.level,
      region: hospitals.region,
      district: hospitals.district,
      departmentCount: sql<number>`count(${hospitalDepartments.id})::int`,
      acceptingBookings: sql<boolean>`(${publishedSession} OR ${bookableBlock})`,
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
    acceptingBookings: r.acceptingBookings === true,
  }));
}
