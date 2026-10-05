/**
 * The registry's SMS boundary (E3, §10.6 interlock 3). It wraps the repository's `SmsSender`
 * (lib/notifications/sink.ts) and is the only way a registry message leaves: it re-reads the person
 * in the sending transaction and refuses a synthetic person whatever the transport, then writes
 * one `ncd_sms_log` row per attempt with the number's keyed hash, never the number.
 *
 * Transports: a logging mock (the only one active in this build). The Africa's Talking sender is
 * used only when the facility's `live_sms_enabled` is on, never under test.
 */
import "server-only";

import type { SmsSender } from "@/lib/notifications/sink";
import { eq } from "drizzle-orm";

import { ncdPerson, ncdSmsLog } from "@/db/schema";
import { createAfricasTalkingSender } from "@/lib/notifications/africastalking";
import { isGsmSafe, SMS_MAX_BODY_CHARS } from "@/lib/notifications/sink";

import type { NcdTx } from "../db";

export type Transport = { name: string; sender: SmsSender };
export type Delivery = { result: "logged" | "sent" | "failed" | "blocked"; reason: string | null };

/** The logging mock: records what would have gone, sends nothing. */
export function loggingTransport(): Transport & { outbox: { toE164: string; body: string }[] } {
  const outbox: { toE164: string; body: string }[] = [];
  return {
    name: "logging_mock",
    outbox,
    sender: {
      async send(m) {
        outbox.push(m);
        return { ok: true };
      },
    },
  };
}

/** Live sending stays off unless the facility turned it on, and never in tests. */
export function transportFor(settings: { liveSmsEnabled: boolean }): Transport {
  if (settings.liveSmsEnabled && process.env.NODE_ENV !== "test") {
    const live = createAfricasTalkingSender();
    if (live) return { name: "africastalking", sender: live };
  }
  return loggingTransport();
}

export const SYNTHETIC_REASON = "Synthetic person: never dispatched";

/** Send one message through `transport`, guarded and logged. */
export async function sendGuarded(
  tx: NcdTx,
  transport: Transport,
  m: { facilityId: string; personId: string; reminderId: string | null; toE164: string; toHmac: string | null; body: string },
): Promise<Delivery> {
  const [p] = await tx.select({ synthetic: ncdPerson.isSynthetic }).from(ncdPerson).where(eq(ncdPerson.id, m.personId));
  let d: Delivery;
  if (!p || p.synthetic) d = { result: "blocked", reason: p ? SYNTHETIC_REASON : "Person not found" };
  else if (!isGsmSafe(m.body) || m.body.length > SMS_MAX_BODY_CHARS) d = { result: "blocked", reason: "Message does not fit one SMS part" };
  else {
    const r = await transport.sender.send({ toE164: m.toE164, body: m.body }).catch((e: unknown) => ({ ok: false as const, reason: e instanceof Error ? e.message : "send failed" }));
    d = r.ok ? { result: transport.name === "logging_mock" ? "logged" : "sent", reason: null } : { result: "failed", reason: r.reason };
  }
  await tx.insert(ncdSmsLog).values({
    facilityId: m.facilityId,
    personId: m.personId,
    reminderId: m.reminderId,
    toHmac: m.toHmac,
    body: m.body,
    transport: transport.name,
    result: d.result,
    reason: d.reason,
  });
  return d;
}
