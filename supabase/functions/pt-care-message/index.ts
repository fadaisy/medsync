/**
 * pt-care-message — the patient writes to their care team (patient app v2 §5.8; D-MR-06). Input:
 * { clientKey, body }. One thread per enrolment; the same clientKey is the same message. Out of the team's
 * hours (weekdays 8 am to 5 pm, Kampala) an automatic reply points to Help: messages are not for emergencies.
 * Sending is never gated by payment; the team's proactive replies follow the programme (MR9 as amended).
 * Push text never carries the message (MR12). Behind CARE_MODE=1 (MR11).
 */
import { z } from "npm:zod@4.4.3";

import { getCaller, serviceClient } from "../_shared/auth.ts";
import { preflight } from "../_shared/cors.ts";
import {
  badRequest,
  conflict,
  forbidden,
  methodNotAllowed,
  ok,
  serverError,
  unauthorized,
} from "../_shared/errors.ts";
import { makeLogger } from "../_shared/logger.ts";

const log = makeLogger("pt-care-message");
const InputSchema = z.object({
  clientKey: z.string().min(8).max(80),
  body: z.string().trim().min(1).max(1000),
});

/** Weekdays 08:00–17:00 in Kampala (UTC+3, no daylight saving). */
export function inTeamHours(now: Date): boolean {
  const k = new Date(now.getTime() + 3 * 3600_000);
  const day = k.getUTCDay();
  const h = k.getUTCHours();
  return day >= 1 && day <= 5 && h >= 8 && h < 17;
}

const AUTO_REPLY =
  "Thank you. The team replies on weekdays, 8 am to 5 pm. If you feel very unwell now, press Help.";

Deno.serve(async (request: Request) => {
  const requestId = request.headers.get("x-request-id") ?? crypto.randomUUID();
  const init = { origin: request.headers.get("origin"), requestId };
  const pre = preflight(request);
  if (pre) return pre;
  if (request.method !== "POST") return methodNotAllowed(init);
  if (Deno.env.get("CARE_MODE") !== "1") return conflict("Care mode is not switched on.", init);

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

  const { data: id, error } = await sb.rpc("care_patient_message", {
    p_patient: caller.id,
    p_client_key: parsed.data.clientKey,
    p_body: parsed.data.body,
  });
  if (error) {
    if (error.code === "42501")
      return forbidden(init, "Messages open when your hospital enrols you in a programme.");
    log.error("send failed", { requestId, reason: error.message });
    return serverError("could not send", init);
  }
  let autoReply = false;
  if (!inTeamHours(new Date())) {
    const { data: msg } = await sb
      .from("care_messages")
      .select("enrolment_id")
      .eq("id", id)
      .maybeSingle();
    // One automatic reply per 12 hours is enough.
    const since = new Date(Date.now() - 12 * 3600_000).toISOString();
    const { data: recent } = msg
      ? await sb
          .from("care_messages")
          .select("id")
          .eq("enrolment_id", msg.enrolment_id)
          .eq("kind", "auto_reply")
          .gte("created_at", since)
          .limit(1)
          .maybeSingle()
      : { data: null };
    if (msg && !recent) {
      await sb.from("care_messages").insert({
        enrolment_id: msg.enrolment_id,
        from_patient: false,
        kind: "auto_reply",
        body: AUTO_REPLY,
      });
      autoReply = true;
    }
  }
  return ok({ messageId: id, autoReply }, init);
});
