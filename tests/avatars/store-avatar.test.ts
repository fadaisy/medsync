import { describe, expect, test } from "vitest";

import { AVATAR_MAX_BYTES, validateAvatarFile } from "@/lib/avatars";

/** The pure gate `storeAvatar` runs before sharp or Storage see a byte. */
describe("lib/avatars — validateAvatarFile", () => {
  test("accepts a JPEG under the cap", () => {
    expect(validateAvatarFile({ type: "image/jpeg", size: 1024 })).toEqual({ ok: true });
  });

  test("accepts PNG and WebP", () => {
    expect(validateAvatarFile({ type: "image/png", size: 10 }).ok).toBe(true);
    expect(validateAvatarFile({ type: "image/webp", size: 10 }).ok).toBe(true);
  });

  test("rejects GIF and PDF by type", () => {
    expect(validateAvatarFile({ type: "image/gif", size: 10 })).toEqual({
      ok: false,
      reason: "type",
    });
    expect(validateAvatarFile({ type: "application/pdf", size: 10 })).toEqual({
      ok: false,
      reason: "type",
    });
  });

  test("rejects anything over 8 MB, accepts exactly 8 MB", () => {
    expect(validateAvatarFile({ type: "image/jpeg", size: AVATAR_MAX_BYTES + 1 })).toEqual({
      ok: false,
      reason: "size",
    });
    expect(validateAvatarFile({ type: "image/jpeg", size: AVATAR_MAX_BYTES }).ok).toBe(true);
  });

  test("rejects an empty file", () => {
    expect(validateAvatarFile({ type: "image/jpeg", size: 0 })).toEqual({
      ok: false,
      reason: "empty",
    });
  });
});
