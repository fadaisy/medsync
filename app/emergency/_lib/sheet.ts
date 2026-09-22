import "server-only";

import type { EmergencySheet, EmergencySheetContact } from "@/lib/emergency/queries";
import { eq } from "drizzle-orm";

import { db } from "@/db";
import { hospitals } from "@/db/schema/hospitals";
import { patientProfiles } from "@/db/schema/patient-profiles";
import { fetchEmergencySheet } from "@/lib/emergency/queries";
import { logger } from "@/lib/logger";
import { createClient } from "@/lib/supabase/server";

/**
 * What every Emergency Pathway page needs (ADR 0098 rulings 7–8): who is
 * here, which hospital is theirs, and what the sheet may dial. Reads the
 * session WITHOUT redirecting — signed-out must render; a bystander is the
 * caller this pathway exists for. Never throws: with the emergency tables
 * not yet migrated (0066 is GATED) the sheet falls back to the hospital's
 * registered `emergency_phone` (ADR 0084 §3, the one trusted number), and
 * with nothing at all it renders the no-number state — never a fabricated
 * number.
 */
export interface EmergencyContext {
  signedIn: boolean;
  hospitalId: string | null;
  hospitalName: string | null;
  sheet: EmergencySheet;
  /** Non-production: unverified contacts ride along under the Unsigned watermark. */
  drafts: boolean;
}

export const isProduction = () =>
  (process.env.MEDSYNC_ENV ?? process.env.VERCEL_ENV) === "production";

export async function loadEmergencyContext(): Promise<EmergencyContext> {
  // Not wrapped: `cookies()` is what makes the route dynamic, and its
  // bailout must propagate; `getUser()` reports failure as data, not a throw.
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  const userId = auth.user?.id ?? null;

  let hospital: {
    id: string;
    name: string;
    district: string | null;
    emergencyPhone: string | null;
  } | null = null;
  if (userId) {
    try {
      const [row] = await db
        .select({
          id: hospitals.id,
          name: hospitals.name,
          district: hospitals.district,
          emergencyPhone: hospitals.emergencyPhone,
        })
        .from(patientProfiles)
        .innerJoin(hospitals, eq(hospitals.id, patientProfiles.primaryFacilityId))
        .where(eq(patientProfiles.id, userId))
        .limit(1);
      hospital = row ?? null;
    } catch (e) {
      logger.warn("emergency.context.hospital_failed", { reason: String(e) });
    }
  }

  const drafts = !isProduction();
  let sheet: EmergencySheet;
  try {
    sheet = await fetchEmergencySheet({
      hospitalId: hospital?.id ?? null,
      district: hospital?.district ?? null,
      includeDrafts: drafts,
    });
  } catch (e) {
    // Migration 0066 not applied, or the read failed: the hospital's own
    // number still stands, and calling is never flagged.
    logger.warn("emergency.context.sheet_failed", { reason: String(e) });
    const own: EmergencySheetContact[] = hospital?.emergencyPhone
      ? [
          {
            id: `hospital:${hospital.id}`,
            label: `${hospital.name} emergency entrance`,
            number: hospital.emergencyPhone,
            kind: "general",
            scope: "facility",
            priority: 0,
            verificationStatus: "verified",
          },
        ]
      : [];
    sheet = { contacts: own, facilities: [], own: null };
  }

  return {
    signedIn: userId !== null,
    hospitalId: hospital?.id ?? null,
    hospitalName: hospital?.name ?? null,
    sheet,
    drafts,
  };
}

export const KIND_LABEL: Record<EmergencySheetContact["kind"], string> = {
  general: "Emergency line",
  ambulance: "Ambulance",
  crisis: "Crisis support",
  sv: "Sexual violence support",
};

/** Production renders `verified` only (ruling 8); the primary is the first by priority — the own-hospital row sorts first. */
export function splitContacts(contacts: readonly EmergencySheetContact[]) {
  const verified = contacts.filter((c) => c.verificationStatus === "verified");
  return {
    primary: verified[0] ?? null,
    secondaries: verified.slice(1, 4),
    drafts: contacts.filter((c) => c.verificationStatus !== "verified"),
  };
}
