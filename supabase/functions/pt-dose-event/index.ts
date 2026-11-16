/**
 * pt-dose-event — tick a dose from the plan: taken, skipped (with a reason) or snoozed (patient app v2 §5.6,
 * §8.1; MR3 no amounts, MR13 offline queue, S18 once per client key). Input: { clientKey, planVersionId,
 * medicineKey, dueAt, status, skipReason? }. The medicine must be on the patient's own plan version; nothing
 * here carries a dose. Behind CARE_MODE=1 (MR11).
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

const log = makeLogger("pt-dose-event");

const InputSchema = z
  .object({
    clientKey: z.string().min(8).max(80),
    planVersionId: z.uuid(),
    medicineKey: z.string().min(1).max(80),
    dueAt: z.iso.datetime(),
    status: z.enum(["taken", "skipped", "snoozed"]),
    skipReason: z.enum(["felt_unwell", "ran_out", "forgot", "side_effects", "other"]).optional(),
  })
  .refine((d) => d.status === "skipped" || !d.skipReason, {
    message: "A reason goes with a skip only",
  });

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
  const d = parsed.data;

  const caller = await getCaller(request);
  if (!caller) return unauthorized(init);
  const sb = serviceClient();

  const { data: plan } = await sb
    .from("care_plan_versions")
    .select("id, items, care_enrolments!inner(patient_user_id)")
    .eq("id", d.planVersionId)
    .maybeSingle();
  const owner = (plan?.care_enrolments as { patient_user_id: string } | undefined)?.patient_user_id;
  if (!plan || owner !== caller.id) return forbidden(init);
  const keys = new Set((plan.items as { key?: string }[]).map((i) => i.key));
  if (!keys.has(d.medicineKey)) return badRequest("That medicine is not on your plan.", init);

  const { data, error } = await sb.rpc("care_record_dose", {
    p_patient: caller.id,
    p_client_key: d.clientKey,
    p_plan_version: d.planVersionId,
    p_medicine_key: d.medicineKey,
    p_due_at: d.dueAt,
    p_status: d.status,
    p_skip_reason: d.skipReason ?? null,
  });
  const row = (data as { dose_event_id: string; created: boolean }[] | null)?.[0];
  if (error || !row) {
    log.error("save failed", { requestId, reason: error?.message });
    return serverError("could not save the tick", init);
  }
  return ok(row, init);
});
