"use server";

import type { DeskSnapshot } from "./types";
import { z } from "zod";

import { resusScopeOrNull } from "@/app/nurse/resus/_v2/common";
import { loadDeskSnapshotV2 } from "@/lib/resus/desk-v2-loader";

/**
 * Resus Desk v2 — re-read the mutable non-event parts of the desk (episode
 * row, team, after-close records) so they never go stale in-session. Scoped to
 * the caller's hospital (AAL2 via resusScopeOrNull); no patient-name reveal,
 * so it writes no audit row. Null when the id is malformed or out of scope, or
 * the session lapsed — a background poll never redirects the desk away (R2).
 */
export async function fetchDeskSnapshotV2(input: {
  episodeId: string;
}): Promise<DeskSnapshot | null> {
  const id = z.string().uuid().safeParse(input.episodeId);
  if (!id.success) return null;
  const scope = await resusScopeOrNull();
  if (!scope) return null;
  return loadDeskSnapshotV2({ hospitalId: scope.hospitalId, episodeId: id.data });
}
