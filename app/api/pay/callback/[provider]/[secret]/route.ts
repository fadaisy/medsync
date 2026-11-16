import { NextResponse } from "next/server";
import { sql } from "drizzle-orm";

import { db } from "@/db";
import { webhookAuthorised } from "@/lib/channels/webhook-auth";
import { env } from "@/lib/env";
import { rowsOf } from "@/lib/exchange/store";
import { logger } from "@/lib/logger";
import { sandboxAdapter } from "@/supabase/functions/_shared/payments";

export const dynamic = "force-dynamic";

/**
 * The payment provider's callback (patient app v2 §8.2; ADR 0517, PA4 exactly once).
 *
 * POST /api/pay/callback/<provider>/<secret> with the provider's raw body and signature header. A Next route,
 * like the SMS and USSD webhooks, because every Edge Function verifies a Supabase JWT and a provider has none.
 * Trust is the secret path segment AND the provider's signature over the raw body. Verified events go to
 * `pay_apply_event` (migration 0299), which records each event once and issues at most one receipt.
 * Unverified bodies are refused and logged by size only (MR12). A verified event always answers 200,
 * duplicates included, so the provider stops retrying.
 *
 * Only the sandbox exists until D-PA-01; a real provider's adapter joins here when it is built.
 */
export async function POST(
  request: Request,
  ctx: { params: Promise<{ provider: string; secret: string }> },
) {
  const { provider, secret } = await ctx.params;
  if (!webhookAuthorised(request, secret, env.PAY_WEBHOOK_SECRET)) {
    return new NextResponse(null, { status: 404 });
  }
  if (
    provider !== "sandbox" ||
    process.env.PAY_SANDBOX_ALLOWED !== "1" ||
    !env.PAY_SANDBOX_SECRET
  ) {
    return new NextResponse(null, { status: 404 });
  }
  const adapter = sandboxAdapter(env.PAY_SANDBOX_SECRET);

  const raw = await request.text();
  const headers: Record<string, string | null> = {};
  request.headers.forEach((v, k) => (headers[k.toLowerCase()] = v));
  const event = await adapter.verifyCallback(raw, headers);
  if (!event) {
    logger.warn("pay.callback.unverified", { provider, bytes: raw.length });
    return NextResponse.json({ error: "signature did not verify" }, { status: 401 });
  }

  const [row] = rowsOf<{ result: string }>(
    await db.execute(sql`SELECT public.pay_apply_event(${provider}, ${event.eventId}, ${event.providerRef},
      ${event.outcome}, ${event.amountUgx}::int, true, ${event.reason}) AS result`),
  );
  logger.info("pay.callback", { provider, result: row?.result });
  return NextResponse.json({ ok: true, result: row?.result ?? null });
}
