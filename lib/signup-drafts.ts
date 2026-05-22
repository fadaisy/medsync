/**
 * Server-side persistence for multi-step signup forms.
 *
 * Why server-side: forms collect identifiers that may be PII or PHI
 * (NIN, phone), the user may resume on a different device after a
 * dropped connection, and a multi-step staff signup has too much state
 * to keep in URL params. localStorage handles none of these.
 *
 * Owner key:
 *   - Pre-account: lowercased email (the form's first field).
 *   - Mid-flow with account: the user's auth.uid().
 *
 * Sensitive payload fields (NIN, phone, registration number) are
 * encrypted via lib/encryption.ts BEFORE the payload is handed to
 * saveDraft. The drafts table treats payload as opaque JSON.
 *
 * TTL: 14 days from last touch. cleanupExpiredDrafts() can be invoked
 * by a cron / scheduled function (GATE F task).
 *
 * RLS notes:
 *   - Authenticated users: RLS auto-scopes to their auth.uid() (policy
 *     in 0009).
 *   - Pre-account: there is NO anon RLS path. The functions below use
 *     the service-role client; the access_token returned to the client
 *     in a signed cookie is what authorises later resumes.
 */

import "server-only";

import type { DraftKind } from "@/db/schema/signup-drafts";
import { and, eq, lt } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { z } from "zod";

import { DRAFT_KINDS, signupDrafts } from "@/db/schema/signup-drafts";
import { env } from "@/lib/env";
import { logger } from "@/lib/logger";

const sql = postgres(env.DATABASE_URL, { prepare: false, max: 1 });
const db = drizzle(sql);

const OwnerKeySchema = z.string().min(1).max(200);
const DraftKindSchema = z.enum(DRAFT_KINDS);
const PayloadSchema = z.record(z.string(), z.unknown());

export interface DraftRecord {
  id: string;
  draftKind: DraftKind;
  ownerKey: string;
  payload: Record<string, unknown>;
  currentStep: string | null;
  updatedAt: Date;
  expiresAt: Date;
}

/**
 * Save or upsert a draft. UNIQUE INDEX on (draft_kind, owner_key)
 * means a second call for the same key replaces the prior payload.
 */
export async function saveDraft(args: {
  kind: DraftKind;
  ownerKey: string;
  payload: Record<string, unknown>;
  currentStep?: string;
  accessToken?: string;
}): Promise<DraftRecord> {
  const parsed = z
    .object({
      kind: DraftKindSchema,
      ownerKey: OwnerKeySchema,
      payload: PayloadSchema,
      currentStep: z.string().optional(),
      accessToken: z.string().optional(),
    })
    .parse(args);

  const existing = await db
    .select()
    .from(signupDrafts)
    .where(and(eq(signupDrafts.draftKind, parsed.kind), eq(signupDrafts.ownerKey, parsed.ownerKey)))
    .limit(1);

  if (existing.length > 0) {
    const updated = await db
      .update(signupDrafts)
      .set({
        payload: parsed.payload,
        currentStep: parsed.currentStep ?? existing[0]!.currentStep,
        ...(parsed.accessToken ? { accessToken: parsed.accessToken } : {}),
      })
      .where(eq(signupDrafts.id, existing[0]!.id))
      .returning();
    logger.debug("signup-draft.upserted", { kind: parsed.kind, currentStep: parsed.currentStep });
    return rowToRecord(updated[0]!);
  }

  const inserted = await db
    .insert(signupDrafts)
    .values({
      draftKind: parsed.kind,
      ownerKey: parsed.ownerKey,
      payload: parsed.payload,
      currentStep: parsed.currentStep,
      accessToken: parsed.accessToken,
    })
    .returning();
  logger.debug("signup-draft.created", { kind: parsed.kind, currentStep: parsed.currentStep });
  return rowToRecord(inserted[0]!);
}

export async function loadDraft(args: {
  kind: DraftKind;
  ownerKey: string;
}): Promise<DraftRecord | null> {
  const parsed = z.object({ kind: DraftKindSchema, ownerKey: OwnerKeySchema }).parse(args);
  const rows = await db
    .select()
    .from(signupDrafts)
    .where(and(eq(signupDrafts.draftKind, parsed.kind), eq(signupDrafts.ownerKey, parsed.ownerKey)))
    .limit(1);
  return rows.length > 0 ? rowToRecord(rows[0]!) : null;
}

export async function clearDraft(args: { kind: DraftKind; ownerKey: string }): Promise<void> {
  const parsed = z.object({ kind: DraftKindSchema, ownerKey: OwnerKeySchema }).parse(args);
  await db
    .delete(signupDrafts)
    .where(
      and(eq(signupDrafts.draftKind, parsed.kind), eq(signupDrafts.ownerKey, parsed.ownerKey)),
    );
  logger.debug("signup-draft.cleared", { kind: parsed.kind });
}

/**
 * Sweep expired drafts. Invoke from a scheduled function (GATE F).
 * Returns the number of rows removed.
 */
export async function cleanupExpiredDrafts(): Promise<number> {
  const deleted = await db
    .delete(signupDrafts)
    .where(lt(signupDrafts.expiresAt, new Date()))
    .returning({ id: signupDrafts.id });
  logger.info("signup-draft.cleanup", { removed: deleted.length });
  return deleted.length;
}

type Row = typeof signupDrafts.$inferSelect;
function rowToRecord(row: Row): DraftRecord {
  return {
    id: row.id,
    draftKind: row.draftKind as DraftKind,
    ownerKey: row.ownerKey,
    payload: row.payload as Record<string, unknown>,
    currentStep: row.currentStep,
    updatedAt: row.updatedAt,
    expiresAt: row.expiresAt,
  };
}
