import { timingSafeEqual } from "node:crypto";
import type { EmrDb } from "@/lib/emr/db";
import { NextResponse } from "next/server";

import { db } from "@/db";
import { deliveryReport } from "@/lib/pharmacy/sms/store";

export const dynamic = "force-dynamic";

/**
 * Delivery reports from the SMS provider (Africa's Talking posts `id`, `status`, `failureReason` as a form). Success
 * marks the message delivered; Failed or Rejected marks it failed. The callback URL carries `?key=` matching
 * `PHARMACY_SMS_INBOUND_KEY` (the same key as replies); unset → refused.
 */
export async function POST(request: Request) {
  const want = process.env.PHARMACY_SMS_INBOUND_KEY ?? "";
  const got = new URL(request.url).searchParams.get("key") ?? "";
  if (!want) return NextResponse.json({ error: "Not configured" }, { status: 503 });
  if (got.length !== want.length || !timingSafeEqual(Buffer.from(got), Buffer.from(want)))
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const form = await request.formData().catch(() => null);
  const id = String(form?.get("id") ?? "");
  const status = String(form?.get("status") ?? "");
  if (!/^[\w-]{4,80}$/.test(id))
    return NextResponse.json({ error: "Bad request" }, { status: 400 });
  // Buffered / Sent / Submitted are not final: nothing changes until the final report.
  if (status !== "Success" && status !== "Failed" && status !== "Rejected")
    return NextResponse.json({ ok: true, moved: 0 });
  const reason = String(form?.get("failureReason") ?? "").replace(/([a-z])([A-Z])/g, "$1 $2");
  const moved = await deliveryReport(db as unknown as EmrDb, id, status === "Success", reason);
  return NextResponse.json({ ok: true, moved });
}
