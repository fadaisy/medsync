/**
 * pt-emergency-event — the Emergency Pathway's audit trail (PRD
 * MS-PRD-SYM-001 §9.6: "emergency interrupt shown, emergency declined, call
 * tapped (number id only)"; ADR 0098 ruling 5's actions).
 *
 * BEST-EFFORT, BY DESIGN. Every branch of this function ends in `ok`: a
 * patient who just tapped "Call 112" must never see an error, a spinner or
 * a retry because a log row could not be written. The failure is logged
 * (redacted) and that is all. The one write with meaning — a declined
 * interrupt marks the report `emergency_declined`, which is what opens the
 * same-day door (`pt-request-same-day`) — is inside the same net.
 *
 * The caller is OPTIONAL: the sheet opens signed out (ruling 7), so an
 * anonymous tap is attributed to the system actor. Nothing here is PHI: an
 * event name, a catalog item key, a contact id (`hospital:<id>` for the
 * synthetic own-hospital number) and a submission id.
 */

import type { SaAuditAction, SaAuditTargetKind } from "../_shared/sa-audit.ts";
import { z } from "npm:zod@4.4.3";

import { getCaller, serviceClient } from "../_shared/auth.ts";
import { preflight } from "../_shared/cors.ts";
import { badRequest, methodNotAllowed, ok } from "../_shared/errors.ts";
import { makeLogger } from "../_shared/logger.ts";
import { networkContext, recordSaAudit } from "../_shared/sa-audit.ts";
import { systemActorId } from "../_shared/system-actor.ts";

const log = makeLogger("pt-emergency-event");

const InputSchema = z.object({
  event: z.enum(["interrupt_shown", "declined", "call_tapped"]),
  /** The catalog item that raised the interrupt — vocabulary, not PHI. */
  item_key: z.string().max(64).optional(),
  /** `emergency_contacts.id`, or `hospital:<uuid>` for the own-hospital number. */
  contact_id: z.string().max(64).optional(),
  submission_id: z.string().uuid().optional(),
});

const ACTION: Record<z.infer<typeof InputSchema>["event"], SaAuditAction> = {
  interrupt_shown: "emergency_interrupt_shown",
  declined: "emergency_declined",
  call_tapped: "emergency_call_tapped",
};

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
  const input = parsed.data;

  // From here on nothing fails the caller — see the header.
  try {
    const caller = await getCaller(request);
    // Signed out, the only event with anything to record is a call tap
    // (contact id, no PHI); the interrupt and its decline belong to a
    // report, which needs a session. Anything else is acknowledged and
    // dropped — no anonymous fire-hose into sa_audit_log.
    if (!caller && input.event !== "call_tapped") return ok({ recorded: false }, init);
    const actorId = caller?.id ?? systemActorId();
    const sb = serviceClient();

    // A decline is the one event with a consequence: the report becomes
    // `emergency_declined` — only the caller's own, only while nothing
    // else has claimed it (a booked report stays booked).
    let declinedOwnReport = false;
    if (input.event === "declined" && input.submission_id && caller) {
      const { error } = await sb
        .from("symptom_submissions")
        .update({ outcome: "emergency_declined" })
        .eq("id", input.submission_id)
        .eq("outcome", "abandoned")
        .or(`patient_user_id.eq.${caller.id},reporter_user_id.eq.${caller.id}`);
      if (error) {
        log.warn("decline outcome not recorded", { requestId, reason: error.message });
      } else {
        declinedOwnReport = true;
      }
    }

    if (!actorId) {
      // No human and no system actor configured: there is nobody to audit as.
      log.warn("emergency event not audited: no actor", { requestId, event: input.event });
      return ok({ recorded: false }, init);
    }

    // Target, most specific first: the report, else the number, else the actor.
    const [targetKind, targetId]: [SaAuditTargetKind, string] = input.submission_id
      ? ["symptom_submission", input.submission_id]
      : input.contact_id
        ? ["emergency_contact", input.contact_id]
        : ["user", actorId];

    const { ipAddress, userAgent } = networkContext(request);
    await recordSaAudit({
      actorId,
      action: ACTION[input.event],
      targetKind,
      targetId,
      reason: `Emergency pathway: ${input.event.replace("_", " ")}${caller ? "" : " (signed out)"}.`,
      requestId,
      ipAddress,
      userAgent,
      beforeData: null,
      afterData: {
        event: input.event,
        item_key: input.item_key ?? null,
        contact_id: input.contact_id ?? null,
        submission_id: input.submission_id ?? null,
        signed_in: caller !== null,
        declined_own_report: declinedOwnReport,
      },
    });

    log.info("emergency event", { requestId, event: input.event, signed_in: caller !== null });
    return ok({ recorded: true }, init);
  } catch (e) {
    // A call tap is never blocked by a log row (PRD §8.7 "friction kills").
    log.error("emergency event failed; answering ok regardless", {
      requestId,
      event: input.event,
      reason: String(e),
    });
    return ok({ recorded: false }, init);
  }
});
