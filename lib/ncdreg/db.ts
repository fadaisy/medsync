/**
 * The NCD module's only way into the database (§8.1, ADR 0209). Mirrors lib/emr/db.ts (ADR 0131):
 * identity travels as transaction-local GUCs, so nothing leaks on the pooler. Unlike the EMR writer,
 * NCD writes also run under a role with no BYPASSRLS, so the row-level policies decide every read
 * AND every write:
 *
 * - `app`        → `medsync_ncd_app`: the capability-scoped policies of migration 0093.
 * - `analytics`  → `medsync_ncd_analytics`: no identifier column is even granted (dashboards, indicators).
 *
 * `request.jwt.claim.sub` is set too, so `audit_log_changes()` stamps the real author.
 * Takes an optional database so the PGlite lane can inject its own.
 */
import type { Principal } from "./capabilities";
import type * as schema from "@/db/schema";
import type { ExtractTablesWithRelations } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT, PgTransaction } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

type Schema = typeof schema;
export type NcdDb = PgDatabase<PgQueryResultHKT, Schema>;
export type NcdTx = PgTransaction<PgQueryResultHKT, Schema, ExtractTablesWithRelations<Schema>>;

export type NcdIdentity = {
  /** The person acting; for `system` it may be null. For `demo_loader`, the user who switched demo data on. */
  userId: string | null;
  facilityId: string;
  principal: Principal;
};

export async function defaultDb(): Promise<NcdDb> {
  return (await import("@/db")).db as unknown as NcdDb;
}

export async function withNcd<T>(
  id: NcdIdentity,
  role: "app" | "analytics",
  fn: (tx: NcdTx) => Promise<T>,
  database?: NcdDb,
): Promise<T> {
  const conn = database ?? (await defaultDb());
  return conn.transaction(async (tx) => {
    await tx.execute(
      sql`SELECT set_config('app.user_id', ${id.userId ?? ""}, true),
                 set_config('app.hospital_id', ${id.facilityId}, true),
                 set_config('app.ncd_principal', ${id.principal}, true),
                 set_config('request.jwt.claim.sub', ${id.userId ?? ""}, true)`,
    );
    await tx.execute(
      role === "app"
        ? sql`SET LOCAL ROLE medsync_ncd_app`
        : sql`SET LOCAL ROLE medsync_ncd_analytics`,
    );
    return fn(tx);
  });
}

/** Rows from a raw query, typed. postgres-js returns an array; PGlite returns `{ rows }`. */
export async function rows<T>(tx: NcdTx, q: ReturnType<typeof sql>): Promise<T[]> {
  const r = (await tx.execute(q)) as unknown;
  return (Array.isArray(r) ? r : ((r as { rows?: T[] }).rows ?? [])) as T[];
}
