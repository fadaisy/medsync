/**
 * pt-care-reading — save a reading from the phone's offline queue or the web, once (patient app v2 §5.7, §8.1;
 * MR13 offline first, S18 no duplicates, S19 a danger reading tells the team).
 * Input: { clientKey, kind, top?, bottom?, value?, context?, recordedAt? }.
 *
 * The same clientKey is the same reading: a retry returns it and raises nothing twice. A reading in danger by
 * the server's copy of the patient's rule (S2) raises an alert for the care team when the patient is enrolled,
 * whether or not a programme fee is paid (MR9). The app has already opened the danger flow; this never
 * replaces Help. Behind CARE_MODE=1 on the functions (MR11, Gate CG).
 */
import { z } from "npm:zod@4.4.3";

import { getCaller, serviceClient } from "../_shared/auth.ts";
import { preflight } from "../_shared/cors.ts";
import {
  badRequest,
  conflict,
  methodNotAllowed,
  ok,
  serverError,
  unauthorized,
} from "../_shared/errors.ts";
import { makeLogger } from "../_shared/logger.ts";
import thresholds from "../_shared/patient-thresholds.v0.json" with { type: "json" };
import { dangerOf } from "../_shared/reading-danger.ts";

const log = makeLogger("pt-care-reading");

const key = z.string().min(8).max(80);
const at = z.iso.datetime().optional();
const InputSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("bp"),
    clientKey: key,
    top: z.number().min(30).max(300),
    bottom: z.number().min(20).max(200),
    recordedAt: at,
  }),
  z.object({
    kind: z.literal("sugar"),
    clientKey: key,
    value: z.number().min(0.5).max(40),
    context: z.enum(["fasting", "lunch", "supper", "after", "bedtime", "random"]),
    recordedAt: at,
  }),
  z.object({
    kind: z.literal("pulse"),
    clientKey: key,
    value: z.number().min(20).max(250),
    recordedAt: at,
  }),
  z.object({
    kind: z.literal("weight"),
    clientKey: key,
    value: z.number().min(2).max(400),
    recordedAt: at,
  }),
]);

const STORED = {
  bp: { kind: "bp", unit: "mmHg" },
  sugar: { kind: "glucose", unit: "mmol/L" },
  pulse: { kind: "pulse", unit: "bpm" },
  weight: { kind: "weight", unit: "kg" },
} as const;

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
  const r = parsed.data;

  const caller = await getCaller(request);
  if (!caller) return unauthorized(init);
  const sb = serviceClient();

  const { data, error } = await sb.rpc("care_record_reading", {
    p_patient: caller.id,
    p_client_key: r.clientKey,
    p_kind: STORED[r.kind].kind,
    p_v1: r.kind === "bp" ? r.top : r.value,
    p_v2: r.kind === "bp" ? r.bottom : null,
    p_unit: STORED[r.kind].unit,
    p_note: r.kind === "sugar" ? `context:${r.context}` : null,
    p_recorded_at: r.recordedAt ?? null,
  });
  const row = (data as { reading_id: string; created: boolean }[] | null)?.[0];
  if (error || !row) {
    log.error("save failed", { requestId, reason: error?.message });
    return serverError("could not save the reading", init);
  }

  const danger = dangerOf(
    r.kind === "bp"
      ? { kind: "bp", top: r.top, bottom: r.bottom }
      : { kind: r.kind, value: r.value },
    thresholds,
  );
  let teamTold = false;
  if (danger) {
    const { data: alertId } = await sb.rpc("care_raise_alert", {
      p_reading: row.reading_id,
      p_kind: danger,
      p_rules_version: thresholds.version,
    });
    teamTold = Boolean(alertId);
  }
  // No values in the log (MR12).
  log.info("reading", {
    requestId,
    kind: r.kind,
    created: row.created,
    danger: Boolean(danger),
    teamTold,
  });
  return ok({ readingId: row.reading_id, created: row.created, danger, teamTold }, init);
});
