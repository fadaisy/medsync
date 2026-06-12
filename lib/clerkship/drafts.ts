import "server-only";

import { and, eq } from "drizzle-orm";

import { db } from "@/db";
import { clerkshipDrafts } from "@/db/schema/clerkship-drafts";
import { clerkshipDraftsLive } from "@/lib/encounter/feature";

/**
 * Clerkship working-draft persistence (W3). A mutable per-(encounter, author)
 * scratchpad, SEPARATE from the append-only version history, so autosave never
 * spams the system-of-record. All access is gated on CLERKSHIP_DRAFTS_LIVE: when
 * off (or migration 0048 unapplied) every function is an inert no-op, so the app
 * runs safely without the table. Uses the privileged server client; the caller
 * resolves + passes the authenticated author.
 */

export interface LoadedDraft {
  payload: unknown;
  updatedAt: Date;
}

/** The current author's draft for this encounter, or null (incl. when gated off). */
export async function loadClerkshipDraft(
  encounterId: string,
  authorId: string,
): Promise<LoadedDraft | null> {
  if (!clerkshipDraftsLive()) return null;
  const [row] = await db
    .select({ payload: clerkshipDrafts.payload, updatedAt: clerkshipDrafts.updatedAt })
    .from(clerkshipDrafts)
    .where(
      and(eq(clerkshipDrafts.encounterId, encounterId), eq(clerkshipDrafts.authorId, authorId)),
    )
    .limit(1);
  return row ?? null;
}

/** Upsert the author's working draft (debounced autosave). No-op when gated off. */
export async function upsertClerkshipDraft(
  encounterId: string,
  authorId: string,
  payload: unknown,
): Promise<void> {
  if (!clerkshipDraftsLive()) return;
  await db
    .insert(clerkshipDrafts)
    .values({ encounterId, authorId, payload })
    .onConflictDoUpdate({
      target: [clerkshipDrafts.encounterId, clerkshipDrafts.authorId],
      set: { payload, updatedAt: new Date() },
    });
}

/** Drop the author's working draft (after a successful save, or on discard). */
export async function deleteClerkshipDraft(encounterId: string, authorId: string): Promise<void> {
  if (!clerkshipDraftsLive()) return;
  await db
    .delete(clerkshipDrafts)
    .where(
      and(eq(clerkshipDrafts.encounterId, encounterId), eq(clerkshipDrafts.authorId, authorId)),
    );
}
