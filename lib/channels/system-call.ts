import "server-only";

import { env } from "@/lib/env";
import { logger } from "@/lib/logger";

/**
 * Call a `system-*` Edge Function as MedSync's own server (Gate F, ADR
 * 0091): the project's service-role key is the Bearer token — it never
 * leaves the server env — and the function refuses anything else. The
 * envelope is flattened like `lib/supabase/edge.ts` does; the HTTP status
 * comes back too, because 404 ("not this phone's code") and 409 ("not in a
 * state for that") are answers the USSD screen and the SMS reply distinguish.
 */
export type SystemCallResult<T> =
  | { ok: true; data: T }
  | { ok: false; status: number; error: string; details?: unknown };

export async function callSystem<T = unknown>(
  name: string,
  body: Record<string, unknown>,
  requestId: string,
): Promise<SystemCallResult<T>> {
  try {
    const res = await fetch(`${env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/${name}`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
        "x-request-id": requestId,
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(8_000),
    });
    const text = await res.text();
    let parsed: { data?: T; error?: string | { message?: string; details?: unknown } } = {};
    try {
      parsed = JSON.parse(text);
    } catch {
      /* not JSON */
    }
    if (!res.ok) {
      const error =
        typeof parsed.error === "string"
          ? parsed.error
          : (parsed.error?.message ?? `${name} returned ${res.status}.`);
      logger.warn(`channels.${name}.failed`, { status: res.status, requestId });
      return {
        ok: false,
        status: res.status,
        error,
        details: typeof parsed.error === "object" ? parsed.error?.details : undefined,
      };
    }
    return { ok: true, data: (parsed.data ?? (parsed as unknown)) as T };
  } catch (e) {
    logger.error(`channels.${name}.network`, { reason: String(e), requestId });
    return { ok: false, status: 0, error: "unreachable" };
  }
}
