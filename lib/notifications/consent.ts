import "server-only";

import { and, desc, eq, isNull } from "drizzle-orm";

import { db } from "@/db";
import { consentRecords } from "@/db/schema/consent-records";
import { consentVersions } from "@/db/schema/consent-versions";

/**
 * `sms_communication` consent (Gate E, ADR 0090; PRD §5.2). One read, one
 * write, used by the patient signup, the settings row and (Gate F) the
 * inbound `STOP` keyword.
 *
 * A consent is a `consent_records` row against the active
 * `consent_versions` text; withdrawing sets `revoked_at` (migration 0061)
 * and never deletes — the record proves what was agreed and for how long.
 * Re-granting clears `revoked_at` on the same row: the unique
 * (user, type, version) index forbids a second.
 */

/** Lab Phase 5 (PR-12): the results consents reuse these helpers with their own type. */
type ConsentKind = "sms_communication" | "results_in_app" | "results_sms";

export interface SmsConsentVersion {
  version: string;
  body: string;
  bodySha256: string;
  effectiveDate: string;
}

/** The active text, or null before migration 0061 seeded v1.0. */
export async function fetchSmsConsentVersion(
  consentType: ConsentKind = "sms_communication",
): Promise<SmsConsentVersion | null> {
  const [row] = await db
    .select({
      version: consentVersions.version,
      body: consentVersions.body,
      bodySha256: consentVersions.bodySha256,
      effectiveDate: consentVersions.effectiveDate,
    })
    .from(consentVersions)
    .where(eq(consentVersions.consentType, consentType))
    .orderBy(desc(consentVersions.effectiveDate))
    .limit(1);
  return row ?? null;
}

/** True when a live (un-revoked) `sms_communication` record exists — the dispatcher's own test. */
export async function hasSmsConsent(
  userId: string,
  consentType: ConsentKind = "sms_communication",
): Promise<boolean> {
  const [row] = await db
    .select({ id: consentRecords.id })
    .from(consentRecords)
    .where(
      and(
        eq(consentRecords.userId, userId),
        eq(consentRecords.consentType, consentType),
        isNull(consentRecords.revokedAt),
      ),
    )
    .limit(1);
  return !!row;
}

/**
 * Grant (insert, or clear `revoked_at` on the same version) or withdraw
 * (stamp `revoked_at` on every live row of the type). Idempotent both ways.
 */
export async function setSmsConsent(
  userId: string,
  on: boolean,
  version: SmsConsentVersion,
  meta: { ip?: string | null; userAgent?: string | null } = {},
  consentType: ConsentKind = "sms_communication",
): Promise<void> {
  const now = new Date();
  if (!on) {
    await db
      .update(consentRecords)
      .set({ revokedAt: now })
      .where(
        and(
          eq(consentRecords.userId, userId),
          eq(consentRecords.consentType, consentType),
          isNull(consentRecords.revokedAt),
        ),
      );
    return;
  }
  await db
    .insert(consentRecords)
    .values({
      userId,
      consentType,
      version: version.version,
      consentTextSha256: version.bodySha256,
      acceptedAt: now,
      acceptedIp: meta.ip ?? null,
      acceptedUserAgent: meta.userAgent ?? null,
    })
    .onConflictDoUpdate({
      target: [consentRecords.userId, consentRecords.consentType, consentRecords.version],
      set: { revokedAt: null, acceptedAt: now },
    });
}

/** Lab Phase 5 (A5): signing the results consent notice publishes its wording as a consent version. */
export async function publishConsentVersion(
  consentType: ConsentKind,
  version: string,
  body: string,
) {
  const { createHash } = await import("node:crypto");
  await db
    .insert(consentVersions)
    .values({
      consentType,
      version,
      effectiveDate: new Date().toLocaleDateString("en-CA", { timeZone: "Africa/Kampala" }),
      body,
      bodySha256: createHash("sha256").update(body).digest("hex"),
    })
    .onConflictDoNothing();
}
