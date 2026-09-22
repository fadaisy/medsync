import "server-only";

import { asc, desc, eq, sql } from "drizzle-orm";

import { db } from "@/db";
import { emergencyContacts, patientSymptomCatalogVersions } from "@/db/schema/emergency";
import { hospitals } from "@/db/schema/hospitals";
import { users } from "@/db/schema/users";

/**
 * Superadmin governance reads (ADR 0098 rulings 2 and 8; PRD §9.3). Both
 * tables are reference data, not PHI, so there is no tenant to pin: the
 * console lists every row and the four-eyes Edge Functions own every write.
 */

export interface EmergencyContactRow {
  id: string;
  key: string;
  scope: string;
  district: string | null;
  facilityName: string | null;
  label: string;
  /** Null for a "to source" row — a runbook item, not a button. */
  number: string | null;
  kind: string;
  priority: number;
  verificationStatus: string;
  verifiedByName: string | null;
  verifiedAt: Date | null;
  basis: string | null;
  active: boolean;
}

/** Every contact, national first, then by priority. */
export async function listEmergencyContacts(): Promise<EmergencyContactRow[]> {
  return db
    .select({
      id: emergencyContacts.id,
      key: emergencyContacts.key,
      scope: emergencyContacts.scope,
      district: emergencyContacts.district,
      facilityName: hospitals.name,
      label: emergencyContacts.label,
      number: emergencyContacts.number,
      kind: emergencyContacts.kind,
      priority: emergencyContacts.priority,
      verificationStatus: emergencyContacts.verificationStatus,
      verifiedByName: users.fullName,
      verifiedAt: emergencyContacts.verifiedAt,
      basis: emergencyContacts.basis,
      active: emergencyContacts.active,
    })
    .from(emergencyContacts)
    .leftJoin(hospitals, eq(hospitals.id, emergencyContacts.facilityId))
    .leftJoin(users, eq(users.id, emergencyContacts.verifiedByUserId))
    .orderBy(
      sql`case ${emergencyContacts.scope} when 'national' then 0 when 'district' then 1 else 2 end`,
      asc(emergencyContacts.priority),
      asc(emergencyContacts.label),
    );
}

export interface CatalogVersionRow {
  version: string;
  status: string;
  checksum: string;
  itemCount: number;
  signedByName: string | null;
  signedAt: Date | null;
  signoffArtifactRef: string | null;
  createdAt: Date;
}

/** Every registered catalog version, newest first. */
export async function listCatalogVersions(): Promise<CatalogVersionRow[]> {
  return db
    .select({
      version: patientSymptomCatalogVersions.version,
      status: patientSymptomCatalogVersions.status,
      checksum: patientSymptomCatalogVersions.checksum,
      itemCount: patientSymptomCatalogVersions.itemCount,
      signedByName: users.fullName,
      signedAt: patientSymptomCatalogVersions.signedAt,
      signoffArtifactRef: patientSymptomCatalogVersions.signoffArtifactRef,
      createdAt: patientSymptomCatalogVersions.createdAt,
    })
    .from(patientSymptomCatalogVersions)
    .leftJoin(users, eq(users.id, patientSymptomCatalogVersions.signedByUserId))
    .orderBy(desc(patientSymptomCatalogVersions.createdAt));
}
