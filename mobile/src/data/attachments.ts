import { requestId } from "@/lib/edge";
import { supabase } from "@/lib/supabase";

/**
 * What a patient sends with "Ask for a day" besides words: photos, a short
 * video, voice notes (migration 0172, ADR 0345). They wait on the phone until
 * the request is made, then go to the private `appointment-attachments`
 * bucket under `<uploader>/<appointment>/` with one row each, under RLS.
 */
export type AttachmentKind = "photo" | "video" | "voice";

export interface Attachment {
  /** Local only: the list key. */
  id: string;
  kind: AttachmentKind;
  uri: string;
  mime: string;
  durationMs: number | null;
}

export const MAX_MEDIA = 6;
export const MAX_VOICE = 3;

const EXT: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/heic": "heic",
  "image/heif": "heif",
  "image/webp": "webp",
  "video/mp4": "mp4",
  "video/quicktime": "mov",
  "audio/mp4": "m4a",
  "audio/m4a": "m4a",
  "audio/x-m4a": "m4a",
  "audio/aac": "aac",
  "audio/mpeg": "mp3",
  "audio/webm": "webm",
};

/** The type the bucket takes for this file, or null for one it refuses (0172's list). */
export function storedMime(kind: AttachmentKind, mime: string | null | undefined): string | null {
  if (mime && EXT[mime]) return mime;
  // A picker that names no type: the phone's usual one for that kind.
  if (!mime) return kind === "photo" ? "image/jpeg" : kind === "video" ? "video/mp4" : "audio/mp4";
  return null;
}

/** The object path: the uploader's folder, then the appointment, then a fresh name. */
export function attachmentPath(userId: string, appointmentId: string, mime: string, id: string) {
  return `${userId}/${appointmentId}/${id}.${EXT[mime] ?? "bin"}`;
}

/**
 * Send each file after the request exists. One failing does not stop the
 * others; the count of those that did not go is what the ticket says.
 */
export async function sendAttachments(
  appointmentId: string,
  list: readonly Attachment[],
): Promise<{ failed: number }> {
  if (!list.length) return { failed: 0 };
  const { data } = await supabase.auth.getUser();
  const userId = data.user?.id;
  if (!userId) return { failed: list.length };
  let failed = 0;
  for (const a of list) {
    try {
      const path = attachmentPath(userId, appointmentId, a.mime, requestId());
      const body = await (await fetch(a.uri)).arrayBuffer();
      const up = await supabase.storage
        .from("appointment-attachments")
        .upload(path, body, { contentType: a.mime, upsert: false });
      if (up.error) throw up.error;
      const row = await supabase.from("appointment_attachments").insert({
        appointment_id: appointmentId,
        uploaded_by: userId,
        kind: a.kind,
        storage_path: path,
        mime: a.mime,
        bytes: body.byteLength,
        duration_ms: a.durationMs,
      });
      if (row.error) throw row.error;
    } catch (e) {
      if (__DEV__) console.warn("[attachments] one file did not send:", e);
      failed++;
    }
  }
  return { failed };
}
