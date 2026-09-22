import { supabase } from "@/lib/supabase";

/**
 * The one caller for Supabase Edge Functions from this app.
 *
 * Every write in MedSync goes through a function, never through the client:
 * the anon key in this binary grants nothing a patient could not already do,
 * and the privileged mutation runs server-side where the caller's scope is
 * re-checked. This helper is the whole transport layer for that.
 *
 * It is `lib/supabase/edge.ts` from the web app, minus the pieces that do not
 * exist here (a server-side Supabase client, a logger) and plus the pieces a
 * phone needs. The one thing it copies exactly is the error handling, because
 * the four functions this app calls write PATIENT-FACING sentences on purpose:
 *
 *   "You can ask for a day up to 14 days from now. Choose from the days the
 *    clinic has open."
 *   "Someone just took this slot — pick another and try again."
 *   "This department isn't open for same-day visits right now …"
 *
 * Those sentences are the only useful thing a refused patient is told.
 * Replacing them with "something went wrong" throws that away, so the
 * message comes back VERBATIM and screens render it as-is.
 */

export type EdgeResult<T> =
  | { ok: true; data: T }
  /**
   * The server's own sentence. Render it; do not rewrite it. `code` is the
   * function's `error.code` when it sent one (`call_only`, `rate_limited`,
   * `no_same_day_slot`) or `"offline"` when the request never left the
   * phone; `status` is the HTTP status. The Emergency Pathway branches on
   * these — a refused pre-alert keeps the call button up, an offline one
   * queues — and nothing else needs them.
   */
  | { ok: false; error: string; code?: string; status?: number };

/**
 * `supabase.ts` throws at import when this is missing, and this module imports
 * it — so by the time anything calls `callEdge` the value is real.
 */
const FUNCTIONS_URL = `${process.env.EXPO_PUBLIC_SUPABASE_URL}/functions/v1`;

/**
 * A correlation id for support: the same string appears in this app's request
 * and in the function's log line, so "it failed at about two o'clock" becomes
 * one grep. The `mob-` prefix says which client sent it.
 *
 * ponytail: not a UUID. Hermes ships no `crypto.randomUUID` and the only fixes
 * are a new dependency or a polyfill, for a value that is a log key and never
 * a secret — time plus 40 bits of randomness cannot realistically collide
 * inside one hospital's logs. Ceiling: two requests in the same millisecond
 * from the same device drawing the same random suffix. Upgrade path: if
 * `expo-crypto` ever arrives for another reason, swap the body for
 * `Crypto.randomUUID()` and nothing else moves.
 */
export function requestId(): string {
  return `mob-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

/**
 * POST `body` to the named Edge Function as the signed-in patient — or, with
 * no session, as the anonymous caller. The gateway's `verify_jwt` accepts
 * the anon key as a Bearer, and the functions whose caller is OPTIONAL
 * (`pt-emergency-sheet`, `pt-create-pre-arrival`, `pt-pre-arrival-status`,
 * `pt-emergency-event` — ADR 0098 ruling 7: the Emergency sheet opens signed
 * out) read `getCaller` as null and carry on. A function that requires a
 * caller answers 401 with its own sentence, which is rendered like any other.
 *
 * `data` is the payload out of the function's `{ ok: true, data }` envelope —
 * so `requestAppointment` hands back `{ appointment_id, status }`, not the
 * wrapper around it.
 *
 * `getSession()` rather than `getUser()`: it reads the stored session and
 * refreshes an expired token on the way, without the network round trip
 * `getUser()` always spends. The function validates the JWT itself, which is
 * the check that actually matters.
 */
export async function callEdge<T = unknown>(
  name: string,
  body: Record<string, unknown>,
): Promise<EdgeResult<T>> {
  const { data: session } = await supabase.auth.getSession();
  const token = session.session?.access_token ?? process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

  try {
    const res = await fetch(`${FUNCTIONS_URL}/${name}`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${token}`,
        "x-request-id": requestId(),
      },
      body: JSON.stringify(body),
    });
    const text = await res.text();

    if (!res.ok) {
      // `_shared/errors.ts` always sends `{ ok: false, error: { code, message } }`.
      // The string form is handled too because the web helper handles it, and
      // a helper that understands only one of the two shapes is how a real
      // sentence turns into a raw JSON blob on a patient's screen.
      let detail = text;
      let code: string | undefined;
      try {
        const parsed = JSON.parse(text) as {
          error?: string | { code?: string; message?: string };
        };
        if (typeof parsed.error === "string") detail = parsed.error;
        else if (parsed.error?.message) detail = parsed.error.message;
        if (typeof parsed.error === "object") code = parsed.error?.code;
      } catch {
        /* not JSON — keep the raw body */
      }
      return {
        ok: false,
        error: detail || `MedSync couldn't complete that (${res.status}).`,
        code,
        status: res.status,
      };
    }

    try {
      const envelope = JSON.parse(text) as { data?: T };
      // `?? envelope` so a function that ever returns a bare payload still works.
      return { ok: true, data: (envelope?.data ?? envelope) as T };
    } catch {
      // 2xx with an empty or non-JSON body: the write landed. Never report
      // that as a failure — a patient retrying a booking that already
      // succeeded ends up with two, and the second takes someone else's slot.
      return { ok: true, data: undefined as T };
    }
  } catch {
    // No connection, DNS, a captive portal at the hospital gate. Deliberately
    // the same sentence sign-in already uses for the same condition, and
    // deliberately not "Couldn't reach pt-request-appointment" — a function
    // name is not something a patient can act on.
    return {
      ok: false,
      error: "Couldn't reach MedSync. Check your connection and try again.",
      code: "offline",
    };
  }
}
