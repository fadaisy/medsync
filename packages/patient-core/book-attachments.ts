/**
 * What a patient sends with "Ask for a day" besides words (migration 0186/0187, ADR 0404): the pure half of the
 * phone's `data/attachments.ts`, moved verbatim. The bucket's own list of types, and the object path in the
 * uploader's folder under the appointment.
 */
export type AttachmentKind = "photo" | "video" | "voice";

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
  "audio/wav": "wav",
  "audio/x-wav": "wav",
};

/** The type the bucket takes for this file, or null for one it refuses. */
export function storedMime(kind: AttachmentKind, mime: string | null | undefined): string | null {
  // A browser's recorder names codecs ("audio/webm;codecs=opus"); the bucket lists the bare type.
  const bare = mime?.split(";")[0]?.trim() || null;
  if (bare && EXT[bare]) return bare;
  if (!bare) return kind === "photo" ? "image/jpeg" : kind === "video" ? "video/mp4" : "audio/mp4";
  return null;
}

/** The object path: the uploader's folder, then the appointment, then a fresh name. */
export function attachmentPath(userId: string, appointmentId: string, mime: string, id: string) {
  return `${userId}/${appointmentId}/${id}.${EXT[mime] ?? "bin"}`;
}
