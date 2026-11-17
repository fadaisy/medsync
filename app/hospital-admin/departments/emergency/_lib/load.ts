import "server-only";

import type { HelpPreview, Location } from "./model";
import { eq } from "drizzle-orm";

import { db } from "@/db";
import { hospitals } from "@/db/schema/hospitals";
import { preAlertLive } from "@/lib/emergency/feature";
import { fetchEmergencySheet } from "@/lib/emergency/queries";
import { logger } from "@/lib/logger";

/**
 * The hospital's map point and what the public Help screen shows for it. The preview reads the Help screen's own
 * query (fetchEmergencySheet) as production does, verified contacts only (ADR 0098 ruling 8), so the admin sees
 * what a member of the public sees and not a second account of it. Never throws: with the emergency tables not
 * yet migrated (0066 is gated) the preview says it could not be read.
 */
export async function loadEmergencyExtras(
  hospitalId: string,
): Promise<{ location: Location; help: HelpPreview }> {
  const [h] = await db
    .select({
      name: hospitals.name,
      latitude: hospitals.latitude,
      longitude: hospitals.longitude,
      ambulanceNumber: hospitals.ambulanceNumber,
    })
    .from(hospitals)
    .where(eq(hospitals.id, hospitalId))
    .limit(1);
  const location = { latitude: h?.latitude ?? null, longitude: h?.longitude ?? null };
  const base: HelpPreview = {
    name: h?.name ?? "",
    preAlertLive: preAlertLive(),
    preAlertEnabled: false,
    emergencyLine: null,
    ambulanceVerified: null,
    ambulanceWaiting: false,
    directions: null,
    failed: false,
  };
  try {
    // No district: then every facility-scope contact in the answer is this hospital's own.
    const sheet = await fetchEmergencySheet({ hospitalId, district: null, includeDrafts: false });
    const own = sheet.own;
    const ambulance = sheet.contacts.find((c) => c.kind === "ambulance" && c.scope === "facility");
    return {
      location,
      help: {
        ...base,
        name: own?.name ?? base.name,
        preAlertEnabled: own?.preAlertEnabled ?? false,
        emergencyLine: own?.emergencyPhone ?? null,
        ambulanceVerified: ambulance?.number ?? null,
        ambulanceWaiting: !ambulance && !!h?.ambulanceNumber,
        directions: own?.emergencyEntranceDirections ?? null,
      },
    };
  } catch (e) {
    logger.warn("hospital-admin.emergency.preview_failed", { reason: String(e) });
    return { location, help: { ...base, failed: true } };
  }
}
