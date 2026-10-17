import { NextResponse } from "next/server";
import { sql } from "drizzle-orm";

import { db } from "@/db";
import { bearer } from "@/lib/exchange/http";
import { authenticate, SCOPE } from "@/lib/exchange/store";

export const dynamic = "force-dynamic";

/** A machine's own configuration and nothing else (AB-6): name, zone, scopes. No patient, no other sender. */
export async function GET(request: Request) {
  const token = bearer(request);
  const url = new URL(request.url);
  const senderId = url.searchParams.get("sender") ?? "";
  const hospitalId = url.searchParams.get("hospital") ?? "";
  if (!token) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const cfg = await db.transaction(async (tx) => {
    const who = await authenticate(tx, {
      token,
      scope: SCOPE.config,
      senderId,
      hospitalId,
      now: new Date(),
    });
    if (!who) return null;
    const r = (await tx.execute(
      sql`SELECT * FROM private.exchange_sender_config(${who.senderId}::uuid)`,
    )) as unknown;
    return (Array.isArray(r) ? r : (r as { rows: unknown[] }).rows)[0] ?? null;
  });
  return cfg
    ? NextResponse.json(cfg)
    : NextResponse.json({ error: "unauthorized" }, { status: 401 });
}
