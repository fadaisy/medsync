/**
 * pt-join-waitlist — "Tell me if a place opens" (Gate E, ADR 0090; PRD §3.3.3).
 *
 * Inputs:
 *   - service_line_id     the clinic (any hospital, ADR 0086)
 *   - reason              the Appendix A reason the booking will carry
 *   - preferred_from      YYYY-MM-DD, the first day that suits
 *   - preferred_to?       YYYY-MM-DD, the last; absent = any later day
 *   - for_provisional_id? a household member (a live booking_agents link)
 *
 * One live entry per (line, person) — a second join answers 409 with the
 * existing entry, so a retry creates nothing twice. No hold, no promise:
 * the entry is a place in a FIFO line; capacity that frees up is offered
 * in order by `releaseCapacity`, and the offer is accepted through the
 * booking core.
 */
import { z } from "npm:zod@4.4.3";

import { getCaller, serviceClient } from "../_shared/auth.ts";
import { preflight } from "../_shared/cors.ts";
import {
  badRequest,
  conflict,
  forbidden,
  methodNotAllowed,
  notFound,
  ok,
  serverError,
  unauthorized,
} from "../_shared/errors.ts";
import { makeLogger } from "../_shared/logger.ts";
import { networkContext, recordSaAudit } from "../_shared/sa-audit.ts";
import { PATIENT_REASON_CODES } from "../_shared/sessions-sql.ts";

const log = makeLogger("pt-join-waitlist");

const DAY = /^\d{4}-\d{2}-\d{2}$/;

const InputSchema = z
  .object({
    service_line_id: z.string().uuid(),
    reason: z.enum([...PATIENT_REASON_CODES, "other"]),
    preferred_from: z.string().regex(DAY, "YYYY-MM-DD"),
    preferred_to: z.string().regex(DAY, "YYYY-MM-DD").optional(),
    for_provisional_id: z.string().uuid().optional(),
  })
  .refine((i) => !i.preferred_to || i.preferred_to >= i.preferred_from, {
    message: "preferred_to must not be before preferred_from.",
  });

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

  const caller = await getCaller(request);
  if (!caller) return unauthorized(init);
  const sb = serviceClient();

  const { data: self } = await sb
    .from("patient_profiles")
    .select("id")
    .eq("id", caller.id)
    .maybeSingle();
  if (!self) return forbidden(init, "only patients can join a waitlist through this surface");

  const { data: line, error: lineError } = await sb
    .from("service_lines")
    .select("id, hospital_id, reason_codes, confidential, active, hospitals!inner(state)")
    .eq("id", input.service_line_id)
    .eq("active", true)
    .eq("hospitals.state", "active")
    .maybeSingle();
  if (lineError) return serverError(lineError.message, init);
  if (!line) return notFound(init, "That clinic is not open for booking.");
  if (!(line.reason_codes as string[]).includes(input.reason)) {
    return badRequest("That clinic does not take this reason.", init);
  }

  // A household member (Gate D): a live agent link, never a confidential line.
  let member: { patient_user_id: string | null; provisional_patient_id: string | null } = {
    patient_user_id: caller.id,
    provisional_patient_id: null,
  };
  if (input.for_provisional_id) {
    if (line.confidential) return forbidden(init, "This clinic cannot be booked for someone else.");
    const { data: link } = await sb
      .from("booking_agents")
      .select("id")
      .eq("agent_user_id", caller.id)
      .eq("provisional_patient_id", input.for_provisional_id)
      .is("revoked_at", null)
      .maybeSingle();
    if (!link) return forbidden(init, "That person is not on your household list.");
    member = { patient_user_id: null, provisional_patient_id: input.for_provisional_id };
  }

  const { data: entry, error: insertError } = await sb
    .from("waitlist_entries")
    .insert({
      hospital_id: line.hospital_id,
      service_line_id: line.id,
      ...member,
      created_by_user_id: caller.id,
      reason: input.reason,
      preferred_from: input.preferred_from,
      preferred_to: input.preferred_to ?? null,
    })
    .select("id, state, preferred_from, preferred_to, created_at")
    .single();
  if (insertError) {
    if (insertError.code === "23505") {
      const { data: existing } = await sb
        .from("waitlist_entries")
        .select("id, state, preferred_from, preferred_to, created_at")
        .eq("service_line_id", line.id)
        .in("state", ["waiting", "offered"])
        .match(
          member.patient_user_id
            ? { patient_user_id: member.patient_user_id }
            : { provisional_patient_id: member.provisional_patient_id },
        )
        .maybeSingle();
      return conflict("You are already on this clinic's waiting list.", init, {
        entry: existing ?? null,
      });
    }
    log.error("waitlist insert failed", { requestId, reason: insertError.message });
    return serverError("could not join the waitlist", init);
  }

  const { ipAddress, userAgent } = networkContext(request);
  try {
    await recordSaAudit({
      actorId: caller.id,
      action: "join_waitlist",
      targetKind: "waitlist_entry",
      targetId: entry.id,
      reason: `patient joined waitlist (${input.reason})`,
      requestId,
      ipAddress,
      userAgent,
      afterData: {
        hospital_id: line.hospital_id,
        service_line_id: line.id,
        ...member,
        preferred_from: input.preferred_from,
        preferred_to: input.preferred_to ?? null,
      },
    });
  } catch (e) {
    log.warn("sa_audit failed (entry already created)", { requestId, reason: String(e) });
  }

  // Honest position: how many live entries were created before this one.
  const { count } = await sb
    .from("waitlist_entries")
    .select("id", { count: "exact", head: true })
    .eq("service_line_id", line.id)
    .in("state", ["waiting", "offered"])
    .lt("created_at", entry.created_at);

  log.info("waitlist joined", { requestId, waitlist_entry_id: entry.id });
  return ok(
    {
      waitlist_entry_id: entry.id,
      state: entry.state,
      preferred_from: entry.preferred_from,
      preferred_to: entry.preferred_to,
      position: (count ?? 0) + 1,
    },
    init,
  );
});
