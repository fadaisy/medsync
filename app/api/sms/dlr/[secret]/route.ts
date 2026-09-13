import { NextResponse } from "next/server";
import { and, eq, inArray } from "drizzle-orm";
import { z } from "zod";

import { db } from "@/db";
import { notificationDispatches } from "@/db/schema/notifications";
import { webhookAuthorised } from "@/lib/channels/webhook-auth";
import { env } from "@/lib/env";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";

/**
 * Africa's Talking delivery report (Gate E, ADR 0090).
 *
 * AT posts `application/x-www-form-urlencoded` — `id`, `status`,
 * `phoneNumber`, `networkCode`, and on failure `failureReason` — unsigned.
 * The secret is the path segment (`SMS_WEBHOOK_SECRET`, configured as the
 * callback URL in the AT dashboard) plus the optional `AT_CALLBACK_IPS`
 * allowlist (`lib/channels/webhook-auth.ts`); a wrong one is a 404, not a hint. `id` is the `messageId` the transport recorded as
 * `provider_message_id`, so the report is a single conditional UPDATE and
 * is idempotent: a second `Success` for a delivered row changes nothing.
 *
 * Statuses (AT's words):
 *   Success                      → delivered
 *   Failed | Rejected | Expired  → failed, failure_reason = status(+reason)
 *   Sent | Submitted | Buffered  → in flight; nothing to record
 *
 * The phone number is NEVER logged or stored — the row already knows whom
 * it went to. Always 200 to AT once the secret matched, even for an id we
 * do not hold (a legacy `appointment_reminders` send, or a test message):
 * a non-200 makes AT retry a report about nothing.
 */

const Report = z.object({
  id: z.string().min(1).max(200),
  status: z.string().min(1).max(40),
  failureReason: z.string().max(200).optional(),
});

const DELIVERED = new Set(["Success"]);
const FAILED = new Set(["Failed", "Rejected", "Expired"]);

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
  const parsed = Report.safeParse({
    id: form.get("id") ?? undefined,
    status: form.get("status") ?? undefined,
    failureReason: form.get("failureReason") ?? undefined,
  });
  if (!parsed.success) return NextResponse.json({ error: "invalid report" }, { status: 400 });
  const { id, status, failureReason } = parsed.data;

  const now = new Date();
  let updated = 0;
  if (DELIVERED.has(status)) {
    updated = (
      await db
        .update(notificationDispatches)
        .set({ state: "delivered", deliveredAt: now, updatedAt: now })
        .where(
          and(
            eq(notificationDispatches.providerMessageId, id),
            eq(notificationDispatches.channel, "sms"),
            eq(notificationDispatches.state, "sent"),
          ),
        )
        .returning({ id: notificationDispatches.id })
    ).length;
  } else if (FAILED.has(status)) {
    updated = (
      await db
        .update(notificationDispatches)
        .set({
          state: "failed",
          failureReason:
            `dlr_${status.toLowerCase()}${failureReason ? `: ${failureReason}` : ""}`.slice(0, 300),
          updatedAt: now,
        })
        .where(
          and(
            eq(notificationDispatches.providerMessageId, id),
            eq(notificationDispatches.channel, "sms"),
            inArray(notificationDispatches.state, ["sent", "delivered"]),
          ),
        )
        .returning({ id: notificationDispatches.id })
    ).length;
  }

  // Status and a provider id only — never the phone.
  logger.info("sms.dlr.received", { status, updated });
  return NextResponse.json({ ok: true, updated });
}
