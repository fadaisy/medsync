import type { StartValues } from "@/data/readings";
import { manipulateAsync, SaveFormat } from "expo-image-manipulator";
import * as ImagePicker from "expo-image-picker";

import { supabase } from "@/lib/supabase";

/**
 * "Take a photo" in Log a reading (ADR 0352): the camera, the photo shrunk to
 * 1024 px, then `/api/mobile/reading-photo`, where Claude reads the numbers
 * off the device's screen. Nothing is stored anywhere; the numbers only fill
 * the boxes for the patient to check.
 */
const ORIGIN = process.env.EXPO_PUBLIC_WEB_ORIGIN;
const URL = ORIGIN ? `${ORIGIN.replace(/\/$/, "")}/api/mobile/reading-photo` : null;

export type PhotoKind = "bp" | "sugar" | "weight";

export type PhotoResult =
  | { ok: true; values: Partial<StartValues> }
  | { ok: false; message: string }
  | { ok: false; cancelled: true };

const NO_READ =
  "Couldn't read the numbers. Try again with the screen filling the photo, or type them.";

export async function readingFromPhoto(kind: PhotoKind): Promise<PhotoResult> {
  if (!URL) return { ok: false, message: "Photos can't be read in this build. Type the numbers." };
  const perm = await ImagePicker.requestCameraPermissionsAsync();
  if (!perm.granted) return { ok: false, message: "Allow the camera in Settings to take a photo." };
  const shot = await ImagePicker.launchCameraAsync({ mediaTypes: ["images"], quality: 0.8 });
  const asset = shot.canceled ? null : shot.assets[0];
  if (!asset) return { ok: false, cancelled: true };

  const small = await manipulateAsync(asset.uri, [{ resize: { width: 1024 } }], {
    compress: 0.7,
    format: SaveFormat.JPEG,
    base64: true,
  });
  if (!small.base64) return { ok: false, message: NO_READ };

  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) return { ok: false, message: "Sign in again." };
  try {
    const res = await fetch(URL, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ kind, mime: "image/jpeg", image: small.base64 }),
    });
    const body = (await res.json().catch(() => null)) as {
      ok?: boolean;
      top?: string;
      bottom?: string;
      pulse?: string;
      value?: string;
      error?: string;
    } | null;
    if (!res.ok || !body) return { ok: false, message: body?.error ?? NO_READ };
    if (!body.ok) return { ok: false, message: NO_READ };
    if (kind === "bp")
      return {
        ok: true,
        values: {
          ...(body.top ? { top: body.top } : {}),
          ...(body.bottom ? { bottom: body.bottom } : {}),
          ...(body.pulse ? { pulse: body.pulse } : {}),
        },
      };
    return { ok: true, values: body.value ? { [kind]: body.value } : {} };
  } catch {
    return {
      ok: false,
      message: "Couldn't reach MedSync. Check your connection, or type the numbers.",
    };
  }
}
