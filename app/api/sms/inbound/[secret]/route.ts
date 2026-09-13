import type { SmsReplyKey } from "@/supabase/functions/_shared/dispatches";
import { NextResponse } from "next/server";
import { and, eq, gt, sql } from "drizzle-orm";
import { z } from "zod";

import { db } from "@/db";
import { inboundSms } from "@/db/schema/channels";
import { notificationDispatches } from "@/db/schema/notifications";
import { appointments } from "@/db/schema/scheduling";
import { parseKeyword } from "@/lib/channels/sms-keywords";
import { callSystem } from "@/lib/channels/system-call";
import { webhookAuthorised } from "@/lib/channels/webhook-auth";
import { blindIndex, encrypt } from "@/lib/encryption";
import { env } from "@/lib/env";
import { logger } from "@/lib/logger";
import { dispatchRows, toDispatchInsertRow } from "@/lib/notifications/dispatches";

export const dynamic = "force-dynamic";

/**
 * Africa's Talking inbound SMS (Gate F, ADR 0091; PRD §3.3.7 "keyword-based,
 * not conversational"). AT POSTs form-encoded { from, to, text, date, id,
 * linkId }, unsigned: auth is the secret path segment (`SMS_WEBHOOK_SECRET`)
 * plus the optional IP allowlist. A miss is a 404.
 *
 *   YES <code> / CONFIRM <code>  → system-ussd-act confirm
 *   CANCEL <code>                → system-ussd-act cancel
 *   STOP                         → system-ussd-act stop: sms_opt_outs (by
 *                                  phone) + the account's consent revoked,
 *                                  audited; one reply, then silence
 *   anything else                → one reply with the three keywords
 *
 * Idempotent on AT's `id`: the `inbound_sms` INSERT is the lock — a
 * redelivered webhook inserts nothing and does nothing. The reply is a
 * `notification_dispatches` row (kind `sms_reply`, a KEY in the payload,
 * rendered by the dispatcher from lib/channels/strings.ts) so its cost is
 * attributed like every other SMS; `hospital_id` is the visit's when there
 * is one, else NULL (the platform's).
 *
 * Rate limit: 10 inbound per phone per hour. The one that crosses the line
 * gets the "too many" reply; the rest are recorded and not answered — a
 * flood must not be answered message for message at 35 shillings each.
 *
 * The phone is encrypted and blind-indexed; never logged.
 */

const Inbound = z.object({
  id: z.string().min(1).max(120),
  from: z.string().regex(/^\+?\d{9,15}$/),
  text: z.string().max(1000).default(""),
});

const INBOUND_PER_PHONE_PER_HOUR = 10;

export async function POST(request: Request, ctx: { params: Promise<{ secret: string }> }) {
  const { secret } = await ctx.params;
  if (!webhookAuthorised(request, secret, env.SMS_WEBHOOK_SECRET)) {
    return new NextResponse(null, { status: 404 });
  }

  let form: URLSearchParams;
  try {
    form = new URLSearchParams(await request.text());
  } catch {
    return NextResponse.json({ error: "unreadable body" }, { status: 400 });
  }
  const parsed = Inbound.safeParse({
    id: form.get("id") ?? undefined,
    from: form.get("from") ?? undefined,
    text: form.get("text") ?? "",
  });
  // Always 200 once the secret matched: a non-200 makes AT retry a message about nothing.
  if (!parsed.success) return NextResponse.json({ ok: true, ignored: "invalid" });
  const phone = parsed.data.from.startsWith("+") ? parsed.data.from : `+${parsed.data.from}`;
  const requestId = `sms-${parsed.data.id.slice(0, 24)}-${Date.now().toString(36)}`;

  try {
    const now = new Date();
    const phoneHmac = blindIndex(phone);
    const phoneEncrypted = encrypt(phone);
    const keyword = parseKeyword(parsed.data.text);

    // The lock: one row per AT id. A redelivery inserts nothing → done.
    const inserted = await db
      .insert(inboundSms)
      .values({
        providerMessageId: parsed.data.id,
        phoneEncrypted,
        phoneHmac,
        keyword: keyword.keyword,
        bookingCode: "code" in keyword ? keyword.code : null,
        outcome: "pending",
      })
      .onConflictDoNothing({ target: inboundSms.providerMessageId })
      .returning({ id: inboundSms.id });
    const row = inserted[0];
    if (!row) return NextResponse.json({ ok: true, replayed: true });

    // The per-phone gate, counted after this row: the crossing message hears
    // why once; everything past it is recorded and not answered.
    const [count] = await db
      .select({ n: sql<number>`count(*)::int` })
      .from(inboundSms)
      .where(
        and(
          eq(inboundSms.phoneHmac, phoneHmac),
          gt(inboundSms.receivedAt, new Date(now.getTime() - 3_600_000)),
        ),
      );
    const n = count?.n ?? 0;
    if (n > INBOUND_PER_PHONE_PER_HOUR) {
      await db.update(inboundSms).set({ outcome: "dropped_rate" }).where(eq(inboundSms.id, row.id));
      logger.warn("sms.inbound.rate_limited", { requestId });
      return NextResponse.json({ ok: true, dropped: true });
    }

    let reply: SmsReplyKey;
    let hospitalId: string | null = null;
    let code: string | null = null;
    if (n === INBOUND_PER_PHONE_PER_HOUR) {
      reply = "too_many";
    } else if (keyword.keyword === "stop") {
      reply = "stopped";
      await callSystem(
        "system-ussd-act",
        { action: "stop", phone_e164: phone, channel: "sms" },
        requestId,
      );
    } else if (keyword.keyword === "confirm" || keyword.keyword === "cancel") {
      code = keyword.code;
      const res = await callSystem<{ appointment_id: string }>(
        "system-ussd-act",
        { action: keyword.keyword, booking_code: code, phone_e164: phone, channel: "sms" },
        requestId,
      );
      if (res.ok) {
        reply = keyword.keyword === "confirm" ? "confirmed" : "cancelled";
        hospitalId = await hospitalOf(res.data.appointment_id);
      } else if (res.status === 409) {
        reply = keyword.keyword === "confirm" ? "not_confirmable" : "not_cancellable";
      } else {
        reply = "unknown_code";
      }
    } else {
      reply = "help";
    }

    // The reply, through the dispatcher — once, SMS, cost attributed.
    const rows = dispatchRows({
      kind: "sms_reply",
      hospitalId,
      recipient: { phoneEncrypted },
      nowIso: now.toISOString(),
      inboundSmsId: row.id,
      reply,
      bookingCode: code,
    });
    await db
      .insert(notificationDispatches)
      .values(rows.map(toDispatchInsertRow))
      .onConflictDoNothing({ target: notificationDispatches.idempotencyKey });
    await db.update(inboundSms).set({ outcome: reply }).where(eq(inboundSms.id, row.id));

    logger.info("sms.inbound.handled", { requestId, keyword: keyword.keyword, reply });
    return NextResponse.json({ ok: true, reply });
  } catch (e) {
    logger.error("sms.inbound.failed", { requestId, reason: String(e) });
    // 200 all the same: AT retrying will only hit the idempotency lock.
    return NextResponse.json({ ok: false });
  }
}

async function hospitalOf(appointmentId: string): Promise<string | null> {
  const [row] = await db
    .select({ hospitalId: appointments.hospitalId })
    .from(appointments)
    .where(eq(appointments.id, appointmentId))
    .limit(1);
  return row?.hospitalId ?? null;
}
