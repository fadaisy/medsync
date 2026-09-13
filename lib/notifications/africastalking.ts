import "server-only";

import type { SmsSender, SmsSendResult } from "@/lib/notifications/sink";

import { env } from "@/lib/env";
import { isGsmSafe, SMS_MAX_BODY_CHARS } from "@/lib/notifications/sink";

/**
 * Africa's Talking SMS transport — the only channel that reaches a Ugandan
 * feature phone, and the only one with a live rung on the ladder in
 * ./sink.ts.
 *
 * Classic form-encoded endpoint, one recipient per call:
 *
 *   POST https://api.africastalking.com/version1/messaging
 *   apiKey: <key>            Content-Type: application/x-www-form-urlencoded
 *   username=&to=+2567…&message=&from=<senderId>
 *
 * `username: "sandbox"` is Africa's Talking' own convention for the test
 * account, and it is served from a different host — honour it, or a
 * sandbox key silently bills nothing against a live URL and looks broken.
 *
 * Native `fetch`, no SDK: the SDK is a dependency for one POST.
 *
 * Nothing here logs a phone number. Failures surface the provider's own
 * status text verbatim so `appointment_reminders.failure_reason` says what
 * Africa's Talking actually said, not what we guessed it meant.
 */

const LIVE_BASE = "https://api.africastalking.com/version1/messaging";
const SANDBOX_BASE = "https://api.sandbox.africastalking.com/version1/messaging";

/** Provider statuses that mean the message was accepted for delivery. */
const ACCEPTED_STATUS_CODES = new Set([100, 101, 102]);

/** One send may not hold a serverless function open indefinitely. */
const REQUEST_TIMEOUT_MS = 10_000;

interface AfricasTalkingRecipient {
  statusCode?: number;
  status?: string;
  messageId?: string;
  cost?: string;
}

/** "UGX 35.0000" → { amount: "35.0000", currency: "UGX" }; anything else → undefined. */
export function parseCost(cost: string | undefined): { amount: string; currency: string } | undefined {
  const m = /^([A-Z]{3})\s+(\d+(?:\.\d+)?)$/.exec((cost ?? "").trim());
  return m ? { currency: m[1] as string, amount: m[2] as string } : undefined;
}

/**
 * Build the sender, or `null` when the account is not configured. Null is
 * a deliberate return rather than a throw: the caller decides whether an
 * unconfigured account is fatal (the reminder cron says yes, loudly —
 * silently succeeding while no patient is reminded is the worse failure).
 */
export function createAfricasTalkingSender(): SmsSender | null {
  const username = env.AFRICASTALKING_USERNAME;
  const apiKey = env.AFRICASTALKING_API_KEY;
  if (!username || !apiKey) return null;

  const endpoint = username === "sandbox" ? SANDBOX_BASE : LIVE_BASE;
  const senderId = env.AFRICASTALKING_SENDER_ID;

  return {
    async send({ toE164, body }): Promise<SmsSendResult> {
      // Trust boundary: everything below spends money, so validate here
      // as well as in the composer.
      if (!/^\+\d{9,15}$/.test(toE164)) return { ok: false, reason: "recipient_not_e164" };
      if (!body.trim()) return { ok: false, reason: "empty_body" };
      if (body.length > SMS_MAX_BODY_CHARS || !isGsmSafe(body)) {
        return { ok: false, reason: "body_would_multi_part" };
      }

      const form = new URLSearchParams({ username, to: toE164, message: body });
      if (senderId) form.set("from", senderId);

      let response: Response;
      try {
        response = await fetch(endpoint, {
          method: "POST",
          headers: {
            apiKey,
            Accept: "application/json",
            "Content-Type": "application/x-www-form-urlencoded",
          },
          body: form.toString(),
          signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        });
      } catch (e) {
        return { ok: false, reason: `transport_error: ${String(e)}` };
      }

      const text = await response.text();
      if (!response.ok) {
        return { ok: false, reason: `http_${response.status}: ${text.slice(0, 200)}` };
      }

      let recipient: AfricasTalkingRecipient | undefined;
      try {
        const parsed = JSON.parse(text) as {
          SMSMessageData?: { Recipients?: AfricasTalkingRecipient[] };
        };
        recipient = parsed.SMSMessageData?.Recipients?.[0];
      } catch {
        return { ok: false, reason: `unparseable_response: ${text.slice(0, 200)}` };
      }

      // A 200 with no recipient is Africa's Talking declining the whole
      // batch (bad sender id, blacklisted number). Never treat it as sent.
      if (!recipient) return { ok: false, reason: `no_recipient: ${text.slice(0, 200)}` };
      if (!ACCEPTED_STATUS_CODES.has(recipient.statusCode ?? -1)) {
        return {
          ok: false,
          reason: `${recipient.statusCode ?? "no_status"}: ${recipient.status ?? "unknown"}`,
        };
      }
      return {
        ok: true,
        ...(recipient.messageId ? { providerMessageId: recipient.messageId } : {}),
        ...(parseCost(recipient.cost) ? { cost: parseCost(recipient.cost) } : {}),
      };
    },
  };
}
