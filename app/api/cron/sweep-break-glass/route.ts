import { NextResponse } from "next/server";
import { and, isNull, lte } from "drizzle-orm";

import { db } from "@/db";
import { saBreakGlassGrants } from "@/db/schema/sa-break-glass-grants";
import { env } from "@/lib/env";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";

/**
 * Sweep expired `sa_break_glass_grants` rows — marks `revoked_at`,
 * leaves `revoked_by` NULL (system), `revocation_reason='auto-expired'`.
 *
 * Wired to Vercel Cron via `vercel.json`. Same `CRON_SECRET` Bearer
 * auth as the drafts sweeper. Idempotent.
 *
 * Why not a DB trigger / cron extension: keeping all sweeps in one
 * place (the Next.js cron routes) makes observability + Sentry
 * coverage uniform.
 */
export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization") ?? "";
  const supplied = authHeader.toLowerCase().startsWith("bearer ") ? authHeader.slice(7).trim() : "";

  if (!env.CRON_SECRET) {
    logger.error("cron.sweep-break-glass.missing_secret");
    return NextResponse.json(
      { error: "CRON_SECRET not configured on the server." },
      { status: 503 },
    );
  }
  if (!supplied || supplied !== env.CRON_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const now = new Date();
    const expired = await db
      .update(saBreakGlassGrants)
      .set({
        revokedAt: now,
        revokedBy: null,
        revocationReason: "auto-expired",
      })
      .where(and(lte(saBreakGlassGrants.expiresAt, now), isNull(saBreakGlassGrants.revokedAt)))
      .returning({ id: saBreakGlassGrants.id });

    logger.info("cron.sweep-break-glass.ran", { revoked: expired.length });
    return NextResponse.json({ ok: true, revoked: expired.length });
  } catch (e) {
    logger.error("cron.sweep-break-glass.failed", { reason: String(e) });
    return NextResponse.json({ error: "Sweep failed" }, { status: 500 });
  }
}
