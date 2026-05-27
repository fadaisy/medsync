import "server-only";

import { eq } from "drizzle-orm";

import { db } from "@/db";
import { patientProfiles } from "@/db/schema/patient-profiles";
import { decrypt } from "@/lib/encryption";
import { logger } from "@/lib/logger";

/**
 * Patient profile read model — decrypts contact PII for display in
 * the patient's own Profile surface. Identity fields are returned in
 * cleartext for the read view but the server action layer (`actions.ts`)
 * blocks edits to them.
 */

export interface PatientProfileView {
  // Identity (read-only)
  patientCode: string;
  firstName: string;
  surname: string;
  sex: string;
  dateOfBirth: string; // ISO date 'YYYY-MM-DD'
  idType: string;
  idNumberLast4: string | null;

  // Editable contact
  phone: string;
  villageAddress: string | null;
  preferredLanguage: string | null;
  knownConditions: string[];

  // NoK (editable as a group)
  nokName: string | null;
  nokRelationship: string | null;
  nokPhone: string | null;
}

export async function fetchPatientProfileView(
  patientUserId: string,
): Promise<PatientProfileView | null> {
  const [row] = await db
    .select({
      patientCode: patientProfiles.patientCode,
      firstNameEncrypted: patientProfiles.firstNameEncrypted,
      surnameEncrypted: patientProfiles.surnameEncrypted,
      sex: patientProfiles.sex,
      dateOfBirth: patientProfiles.dateOfBirth,
      idType: patientProfiles.idType,
      idNumberEncrypted: patientProfiles.idNumberEncrypted,
      phoneEncrypted: patientProfiles.phoneEncrypted,
      villageAddressEncrypted: patientProfiles.villageAddressEncrypted,
      preferredLanguage: patientProfiles.preferredLanguage,
      knownConditions: patientProfiles.knownConditions,
      nokNameEncrypted: patientProfiles.nokNameEncrypted,
      nokRelationship: patientProfiles.nokRelationship,
      nokPhoneEncrypted: patientProfiles.nokPhoneEncrypted,
    })
    .from(patientProfiles)
    .where(eq(patientProfiles.id, patientUserId))
    .limit(1);

  if (!row) return null;

  try {
    const idNumber = row.idNumberEncrypted ? decrypt(row.idNumberEncrypted) : null;
    return {
      patientCode: row.patientCode,
      firstName: decrypt(row.firstNameEncrypted),
      surname: decrypt(row.surnameEncrypted),
      sex: row.sex,
      dateOfBirth: row.dateOfBirth,
      idType: row.idType,
      idNumberLast4: idNumber ? idNumber.slice(-4) : null,
      phone: decrypt(row.phoneEncrypted),
      villageAddress: row.villageAddressEncrypted ? decrypt(row.villageAddressEncrypted) : null,
      preferredLanguage: row.preferredLanguage,
      knownConditions: row.knownConditions ?? [],
      nokName: row.nokNameEncrypted ? decrypt(row.nokNameEncrypted) : null,
      nokRelationship: row.nokRelationship,
      nokPhone: row.nokPhoneEncrypted ? decrypt(row.nokPhoneEncrypted) : null,
    };
  } catch (err) {
    logger.error("patient.profile.decrypt_failed", { reason: String(err) });
    return null;
  }
}

export const SEX_LABEL: Record<string, string> = {
  male: "Male",
  female: "Female",
  intersex: "Intersex",
  prefer_not_say: "Prefer not to say",
};

export const ID_TYPE_LABEL: Record<string, string> = {
  nin: "National ID (NIN)",
  passport: "Passport",
  none: "No ID on file",
};

export const NOK_RELATIONSHIP_LABEL: Record<string, string> = {
  spouse: "Spouse",
  parent: "Parent",
  child: "Child",
  sibling: "Sibling",
  guardian: "Guardian",
  friend: "Friend",
  other: "Other",
};
