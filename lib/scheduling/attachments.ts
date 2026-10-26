import "server-only";

import type { BookingAttachment } from "@/components/medsync/booking-attachments";
import { asc, inArray } from "drizzle-orm";

import { db } from "@/db";
import { appointmentAttachments } from "@/db/schema/appointment-attachments";
import { logger } from "@/lib/logger";
import { createServiceClient } from "@/lib/supabase/service";

const BUCKET = "appointment-attachments";
/** Long enough to look and listen on one page load; a stale link then just stops working. */
const SIGNED_FOR_SECONDS = 3600;

/**
 * The photos, videos and voice notes sent with these bookings (migration
 * 0186, ADR 0406), each with a one-hour signed URL, by appointment id in the
 * order they were sent. Callers are the staff scheduling loaders, which have
 * already scoped the appointments to the viewer; they show the result only
 * where the identity reveal was audited (`toPatientIdentity`).
 *
 * Never throws into a page: a failed read or signing logs and leaves the
 * booking with nothing attached, as if none was sent.
 */
export async function loadBookingAttachments(
  appointmentIds: ReadonlyArray<string | null | undefined>,
): Promise<Map<string, BookingAttachment[]>> {
  const out = new Map<string, BookingAttachment[]>();
  const ids = [...new Set(appointmentIds.filter((x): x is string => !!x))];
  if (!ids.length) return out;
  try {
    const rows = await db
      .select({
        id: appointmentAttachments.id,
        appointmentId: appointmentAttachments.appointmentId,
        kind: appointmentAttachments.kind,
        storagePath: appointmentAttachments.storagePath,
        mime: appointmentAttachments.mime,
        durationMs: appointmentAttachments.durationMs,
      })
      .from(appointmentAttachments)
      .where(inArray(appointmentAttachments.appointmentId, ids))
      .orderBy(asc(appointmentAttachments.createdAt));
    if (!rows.length) return out;

    const { data, error } = await createServiceClient()
      .storage.from(BUCKET)
      .createSignedUrls(
        rows.map((r) => r.storagePath),
        SIGNED_FOR_SECONDS,
      );
    if (error) throw error;
    const urls = new Map(
      (data ?? []).flatMap((d) => (d.path && d.signedUrl ? [[d.path, d.signedUrl] as const] : [])),
    );

    for (const r of rows) {
      const url = urls.get(r.storagePath);
      if (!url) continue;
      const list = out.get(r.appointmentId) ?? [];
      list.push({ id: r.id, kind: r.kind, url, mime: r.mime, durationMs: r.durationMs });
      out.set(r.appointmentId, list);
    }
  } catch (e) {
    logger.warn("scheduling.attachments.load_failed", { reason: String(e), count: ids.length });
    return new Map();
  }
  return out;
}
