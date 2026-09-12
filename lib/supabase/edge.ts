import { env } from "@/lib/env";
import { logger } from "@/lib/logger";
import { createClient } from "@/lib/supabase/server";

/**
 * The one caller for Supabase Edge Functions invoked from a Server
 * Action. Attaches the caller's JWT, stamps `x-request-id` (support
 * correlates the Next log line with the function's log line by it),
 * and flattens the `{ error: string | { message } }` envelope into a
 * single staff-facing string.
 *
 * `logPrefix` is the surface doing the calling — "nurse",
 * "clinician.schedule" — so log keys stay `<prefix>.<function>.failed`
 * / `.network`, unchanged per surface.
 *
 * The parsed response envelope comes back as `data`; callers that only
 * need success ignore it. Scope checks, zod parsing, revalidation and
 * audit reasons stay in the action files — this only does transport.
 */
export async function callEdge<T = unknown>(
  name: string,
  body: Record<string, unknown>,
  logPrefix: string,
): Promise<{ ok: true; data: T } | { ok: false; error: string }> {
  const supabase = await createClient();
  const { data: session } = await supabase.auth.getSession();
  const token = session.session?.access_token;
  if (!token) return { ok: false, error: "Not authenticated." };

  try {
    const res = await fetch(`${env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/${name}`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${token}`,
        "x-request-id": crypto.randomUUID(),
      },
      body: JSON.stringify(body),
    });
    const text = await res.text();
    if (!res.ok) {
      let detail = text;
      try {
        const parsed = JSON.parse(text) as { error?: string | { message?: string } };
        if (typeof parsed.error === "string") detail = parsed.error;
        else if (parsed.error?.message) detail = parsed.error.message;
      } catch {
        /* keep raw */
      }
      logger.warn(`${logPrefix}.${name}.failed`, { status: res.status });
      return { ok: false, error: detail || `Edge Function returned ${res.status}.` };
    }
    try {
      return { ok: true, data: JSON.parse(text) as T };
    } catch {
      // 2xx with an empty or non-JSON body: the write landed. Never
      // report that as a failure — a clinician retrying an audited
      // write that already succeeded is the worse outcome.
      return { ok: true, data: undefined as T };
    }
  } catch (e) {
    logger.error(`${logPrefix}.${name}.network`, { reason: String(e) });
    return { ok: false, error: `Couldn't reach ${name}.` };
  }
}
