import "server-only";

import { timingSafeEqual } from "node:crypto";

import { env } from "@/lib/env";

/**
 * Africa's Talking does not sign its callbacks (PRD §4.7 wants them
 * authenticated; this is how). Two gates, both in `docs/ops-channels.md`:
 *
 *   1. The secret path segment — `/api/ussd/<USSD_WEBHOOK_SECRET>`,
 *      `/api/sms/inbound/<SMS_WEBHOOK_SECRET>`, `/api/sms/dlr/<…>` — compared
 *      in constant time. A wrong one is a 404, not a hint.
 *   2. `AT_CALLBACK_IPS` — an optional comma-separated allowlist of AT's
 *      published source IPs, checked against the FIRST hop of
 *      `x-forwarded-for` (Vercel sets it from the TCP peer). Enforced only
 *      when set, so a staging box with no list still works.
 */
export function secretMatches(supplied: string, expected: string | undefined): boolean {
  if (!expected) return false;
  const a = Buffer.from(supplied);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

/** True when no allowlist is set, or the request's first-hop IP is on it. */
export function callbackIpAllowed(request: Request): boolean {
  const list = (env.AT_CALLBACK_IPS ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  if (list.length === 0) return true;
  const ip = (request.headers.get("x-forwarded-for") ?? "").split(",")[0]?.trim() ?? "";
  return list.includes(ip);
}

/** Both gates at once; the caller answers 404 on false. */
export function webhookAuthorised(
  request: Request,
  suppliedSecret: string,
  expectedSecret: string | undefined,
): boolean {
  return secretMatches(suppliedSecret, expectedSecret) && callbackIpAllowed(request);
}
