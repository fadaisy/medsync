/**
 * pt-withdraw-waitlist — leave the line (Gate E, ADR 0090).
 *
 * Input: waitlist_entry_id. The caller must be the entry's patient or its
 * creator (a booking agent). A `waiting` or `offered` entry becomes
 * `withdrawn`; withdrawing an OFFER passes the place to the next person in
 * line at once (`releaseCapacity` on the released appointment) rather than
 * letting the offer sit until it expires. Anything else is a no-op 200.
 */
import { z } from "npm:zod@4.4.3";

import { getCaller, serviceClient } from "../_shared/auth.ts";
import { preflight } from "../_shared/cors.ts";
import {
  badRequest,
  forbidden,
  methodNotAllowed,
  notFound,
  ok,
  serverError,
  unauthorized,
} from "../_shared/errors.ts";
import { makeLogger } from "../_shared/logger.ts";
import { cancelPendingDispatches, releaseCapacity } from "../_shared/waitlist.ts";

const log = makeLogger("pt-withdraw-waitlist");

const InputSchema = z.object({ waitlist_entry_id: z.string().uuid() });

Deno.serve(async (request: Request) => {
  const origin = request.headers.get("origin");
  const requestId = request.headers.get("x-request-id") ?? crypto.randomUUID();
  const init = { origin, requestId };
  const pre = preflight(request);
  if (pre) return pre;
  if (request.method !== "POST") return methodNotAllowed(init);

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return badRequest("Body must be JSON", init);
  }
  const parsed = InputSchema.safeParse(body);
  if (!parsed.success) return badRequest("Invalid input", init, parsed.error.flatten());

  const caller = await getCaller(request);
  if (!caller) return unauthorized(init);
  const sb = serviceClient();

  const { data: entry, error } = await sb
    .from("waitlist_entries")
    .select("id, state, patient_user_id, created_by_user_id, released_appointment_id")
    .eq("id", parsed.data.waitlist_entry_id)
    .maybeSingle();
  if (error) return serverError(error.message, init);
  if (!entry) return notFound(init, "waitlist entry not found");
  if (entry.patient_user_id !== caller.id && entry.created_by_user_id !== caller.id) {
    return forbidden(init, "this is not your waitlist entry");
  }
  if (entry.state !== "waiting" && entry.state !== "offered") {
    return ok({ waitlist_entry_id: entry.id, state: entry.state }, init);
  }

  const { data: flipped, error: updateError } = await sb
    .from("waitlist_entries")
    .update({ state: "withdrawn" })
    .eq("id", entry.id)
    .in("state", ["waiting", "offered"])
    .select("id")
    .maybeSingle();
  if (updateError) return serverError(updateError.message, init);

  if (flipped && entry.state === "offered") {
    await cancelPendingDispatches(sb, "waitlist_entry", entry.id, "offer_withdrawn");
    if (entry.released_appointment_id) {
      await releaseCapacity(sb, entry.released_appointment_id, log, requestId);
    }
  }

  log.info("waitlist withdrawn", { requestId, waitlist_entry_id: entry.id });
  return ok({ waitlist_entry_id: entry.id, state: "withdrawn" }, init);
});
