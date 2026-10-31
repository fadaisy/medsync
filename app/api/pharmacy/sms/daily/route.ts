import type { EmrDb } from "@/lib/emr/db";
import { sql } from "drizzle-orm";
import { NextResponse } from "next/server";

import { db } from "@/db";
import { env } from "@/lib/env";
import { logger } from "@/lib/logger";
import { pharmacyTiersFor } from "@/lib/pharmacy/feature";
import { smsSender } from "@/lib/pharmacy/sms-sender";
import { runDaily } from "@/lib/pharmacy/sms/store";
import { q } from "@/lib/pharmacy/wards/sql";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * The pharmacy's daily reminders (08:00 Kampala = 05:00 UTC). Same `CRON_SECRET` Bearer auth as the other crons.
 * For each hospital with the pharmacy on: work out today's queue, then send it when SMS is connected.
 */
export async function GET(request: Request) {
  const auth = request.headers.get("authorization") ?? "";
  const supplied = auth.toLowerCase().startsWith("bearer ") ? auth.slice(7).trim() : "";
  if (!env.CRON_SECRET) return NextResponse.json({ error: "CRON_SECRET not configured on the server." }, { status: 503 });
  if (!supplied || supplied !== env.CRON_SECRET) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const conn = db as unknown as EmrDb;
  const hospitals = (await q<{ id: string }>(conn, sql`SELECT DISTINCT hospital_id AS id FROM public.pharmacy_locations`))
    .map((h) => h.id)
    .filter((h) => pharmacyTiersFor(h).core);
  const sender = smsSender();
  const out = [];
  for (const h of hospitals)
    try {
      out.push({ hospital: h, ...(await runDaily(conn, h, sender)) });
    } catch (e) {
      logger.error("cron.pharmacy-sms.failed", { hospital: h, error: e instanceof Error ? e.name : "unknown" });
    }
  return NextResponse.json({ ok: true, connected: !!sender, hospitals: out });
}
