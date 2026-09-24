"use server";

import { z } from "zod";

import { arrestCallTarget } from "@/lib/resus/v2-rules";
import { loadHeader, resusScopeOrNull } from "./common";

/**
 * Where the arrest is, for the arrest alarm banner: the episode's department (the
 * same place label as the arrest call), scoped to the caller's hospital. No PHI.
 */
export async function arrestAlarmPlaceV2(input: {
  episodeId: string;
}): Promise<{ ok: true; placeLabel: string } | { ok: false }> {
  const parsed = z.object({ episodeId: z.string().uuid() }).safeParse(input);
  if (!parsed.success) return { ok: false };
  const scope = await resusScopeOrNull();
  if (!scope) return { ok: false };
  const header = await loadHeader(scope, parsed.data.episodeId);
  return header ? { ok: true, placeLabel: arrestCallTarget(header).placeLabel } : { ok: false };
}
