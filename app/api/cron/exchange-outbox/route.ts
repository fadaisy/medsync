import { NextResponse } from "next/server";

import { db } from "@/db";
import { secretMatches } from "@/lib/channels/webhook-auth";
import { env } from "@/lib/env";
import { drainOutbox, sweepUnprocessed } from "@/lib/exchange/store";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";

/**
 * The exchange worker (Lab Phase 4 EX-4, EX-5; A10): every minute by pg_cron (the 0106 pattern), with the
 * CRON_SECRET bearer (compared in constant time). It processes any stored message whose processing never ran,
 * then drains the outbox. No partner's outbound connection exists yet (Step 9 is a gap report), so a due message
 * is recorded as not sent, retried with back-off, and dead after the limit, never silently dropped.
 */
async function run(request: Request) {
  const header = request.headers.get("authorization") ?? "";
  const supplied = header.toLowerCase().startsWith("bearer ") ? header.slice(7).trim() : "";
  if (!env.CRON_SECRET)
    return NextResponse.json(
      { error: "CRON_SECRET not configured on the server." },
      { status: 503 },
    );
  if (!secretMatches(supplied, env.CRON_SECRET))
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const now = new Date();
  try {
    const swept = await db.transaction((tx) => sweepUnprocessed(tx, now));
    const out = await db.transaction((tx) =>
      drainOutbox(
        tx,
        async () => ({
          ok: false,
          error: "No outbound partner connection is configured (Step 9).",
        }),
        now,
      ),
    );
    return NextResponse.json({ swept, ...out });
  } catch (e) {
    logger.error("cron.exchange-outbox.failed", { kind: e instanceof Error ? e.name : "unknown" });
    return NextResponse.json({ error: "failed" }, { status: 500 });
  }
}

export const POST = run;
export const GET = run;
