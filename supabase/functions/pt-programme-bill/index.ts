/**
 * pt-programme-bill — the bill for a care programme period, ready to pay with pt-pay-intent (ADR 0519;
 * business model §4). Input: { period, sponsor? }. The patient's live enrolment decides the programme and its
 * add-ons; the amount comes only from the hospital's approved price list, never from the client. Tether's share
 * is worked out here with `tetherShare` and settled by the provider's split, so Tether never holds the
 * hospital's money (ADR 0516). Not paying never turns off safety: alerts, Help, results and the plan carry on.
 * Behind CARE_MODE=1 (MR11).
 */
import { z } from "npm:zod@4.4.3";

import { getCaller, serviceClient } from "../_shared/auth.ts";
import { PERIOD_MONTHS, tetherShare } from "../_shared/care-pricing.ts";
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

const log = makeLogger("pt-programme-bill");
const InputSchema = z.object({ period: z.enum(["monthly", "quarterly", "yearly"]) });

/** The provider's collection rate assumed for Tether's share until D-PA-01 fixes the real one. */
const COLLECTION_RATE = Number(Deno.env.get("PAY_COLLECTION_RATE") ?? "0.035");

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
  const { period } = parsed.data;

  const caller = await getCaller(request);
  if (!caller) return unauthorized(init);
  const sb = serviceClient();

  const { data: enrolment } = await sb
    .from("care_enrolments")
    .select(
      "id, programme_id, addon_ids, care_programmes(monthly_ugx, quarterly_ugx, yearly_ugx, approved_at)",
    )
    .eq("patient_user_id", caller.id)
    .is("ended_at", null)
    .order("started_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  const prog = enrolment?.care_programmes as
    | { monthly_ugx: number; quarterly_ugx: number; yearly_ugx: number; approved_at: string | null }
    | null
    | undefined;
  if (!enrolment || !prog?.approved_at)
    return conflict("Your hospital has not set a programme fee.", init);

  const { data: paid } = await sb
    .from("care_programme_status")
    .select("paid_through")
    .eq("enrolment_id", enrolment.id)
    .maybeSingle();
  const today = new Date().toISOString().slice(0, 10);
  const startsOn = paid?.paid_through && paid.paid_through > today ? paid.paid_through : today;

  const base =
    period === "monthly"
      ? prog.monthly_ugx
      : period === "quarterly"
        ? prog.quarterly_ugx
        : prog.yearly_ugx;
  const share = tetherShare(base, COLLECTION_RATE, PERIOD_MONTHS[period]);
  const { data: billId, error } = await sb.rpc("care_programme_bill", {
    p_enrolment: enrolment.id,
    p_period: period,
    p_starts_on: startsOn,
    p_platform_share: share,
  });
  if (error) {
    log.error("bill failed", { requestId, reason: error.message });
    return serverError("could not make the bill", init);
  }
  return ok({ billId, startsOn, period }, init);
});
