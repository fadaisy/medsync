import { timingSafeEqual } from "node:crypto";
import type { EmrDb } from "@/lib/emr/db";
import { NextResponse } from "next/server";

import { db } from "@/db";
import { optOutReply } from "@/lib/pharmacy/sms/store";

export const dynamic = "force-dynamic";

/**
 * Replies from the SMS provider (Africa's Talking posts `from` and `text` as a form). A reply of STOP stops further
 * messages to that number. The callback URL carries `?key=` matching `PHARMACY_SMS_INBOUND_KEY`; unset → refused.
 */
export async function POST(request: Request) {
  const want = process.env.PHARMACY_SMS_INBOUND_KEY ?? "";
  const got = new URL(request.url).searchParams.get("key") ?? "";
  if (!want) return NextResponse.json({ error: "Not configured" }, { status: 503 });
  if (got.length !== want.length || !timingSafeEqual(Buffer.from(got), Buffer.from(want)))
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const form = await request.formData().catch(() => null);
  const from = String(form?.get("from") ?? "");
  const text = String(form?.get("text") ?? "")
    .trim()
    .toUpperCase();
  if (!/^\+?\d{9,15}$/.test(from))
    return NextResponse.json({ error: "Bad request" }, { status: 400 });
  const stopped = /^(STOP|STOPP|UNSUBSCRIBE)\b/.test(text)
    ? await optOutReply(db as unknown as EmrDb, from)
    : 0;
  return NextResponse.json({ ok: true, stopped });
}
