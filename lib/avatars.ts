import "server-only";

import sharp from "sharp";

import { logger } from "@/lib/logger";
import { createServiceClient } from "@/lib/supabase/service";

/**
 * Photographs (ADR 0085 §1).
 *
 * One private bucket (`avatars`, migration 0056), one column
 * (`users.avatar_path`), signed URLs only. The server downscales every
 * upload to a 512×512 cover JPEG so the 2 MB bucket cap is never the
 * user's problem and no client does canvas work.
 *
 * A photo is optional and never blocks an account: every failure path
 * here logs and returns null.
 */

export const AVATAR_BUCKET = "avatars";
export const AVATAR_MAX_BYTES = 8 * 1024 * 1024;
export const AVATAR_TYPES: ReadonlySet<string> = new Set(["image/jpeg", "image/png", "image/webp"]);

/** Pure — what `storeAvatar` checks before touching sharp or Storage. */
export function validateAvatarFile(file: {
  type: string;
  size: number;
}): { ok: true } | { ok: false; reason: "type" | "size" | "empty" } {
  if (file.size <= 0) return { ok: false, reason: "empty" };
  if (!AVATAR_TYPES.has(file.type)) return { ok: false, reason: "type" };
  if (file.size > AVATAR_MAX_BYTES) return { ok: false, reason: "size" };
  return { ok: true };
}

/**
 * Downscale, upload to `avatars/<userId>/<uuid>.jpg` and point
 * `users.avatar_path` at it. Returns the storage key, or null.
 */
export async function storeAvatar(userId: string, file: File): Promise<string | null> {
  const check = validateAvatarFile(file);
  if (!check.ok) {
    logger.warn("avatar.rejected", { reason: check.reason });
    return null;
  }
  try {
    const jpeg = await sharp(Buffer.from(await file.arrayBuffer()))
      .rotate()
      .resize(512, 512, { fit: "cover" })
      .jpeg({ quality: 85 })
      .toBuffer();

    const key = `${userId}/${crypto.randomUUID()}.jpg`;
    const service = createServiceClient();
    const { error: uploadError } = await service.storage
      .from(AVATAR_BUCKET)
      .upload(key, jpeg, { contentType: "image/jpeg", upsert: false });
    if (uploadError) {
      logger.warn("avatar.upload_failed", { reason: uploadError.message });
      return null;
    }
    const { data: before } = await service
      .from("users")
      .select("avatar_path")
      .eq("id", userId)
      .maybeSingle();
    const { error: updateError } = await service
      .from("users")
      .update({ avatar_path: key })
      .eq("id", userId);
    if (updateError) {
      logger.warn("avatar.path_update_failed", { reason: updateError.message });
      return null;
    }
    // The replaced object is dead weight in a 2 MB-capped bucket; best effort.
    const old = before?.avatar_path as string | null | undefined;
    if (old && old !== key) {
      await service.storage
        .from(AVATAR_BUCKET)
        .remove([old])
        .catch(() => undefined);
    }
    return key;
  } catch (err) {
    logger.warn("avatar.store_failed", { reason: String(err) });
    return null;
  }
}

/** One-hour signed URL for display, or null when there is no photo. */
export async function signedAvatarUrl(path: string | null): Promise<string | null> {
  if (!path) return null;
  const { data, error } = await createServiceClient()
    .storage.from(AVATAR_BUCKET)
    .createSignedUrl(path, 3600);
  if (error) {
    logger.warn("avatar.sign_failed", { reason: error.message });
    return null;
  }
  return data.signedUrl;
}
