/**
 * pt-refund-request — after a patient cancels a paid visit, ask for the money back (patient app v2 §5.4 P5).
 * Input: { appointmentId }. The visit must already be cancelled. Before the hospital's cut-off the refund
 * waits for the accounts supervisor (PA6, D-PA-05); after it, the hospital's D-PA-07 rule applies and this
 * answers "after_cutoff". The amount is what is left on the receipt, never a client number (S15).
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
import { refundEligibility } from "../_shared/payments.ts";

const log = makeLogger("pt-refund-request");
const InputSchema = z.object({ appointmentId: z.uuid() });

Deno.serve(async (request: Request) => {
  const requestId = request.headers.get("x-request-id") ?? crypto.randomUUID();
  const init = { origin: request.headers.get("origin"), requestId };
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

  const { data: appt } = await sb
    .from("appointments")
    .select("id, hospital_id, patient_user_id, status, starts_at")
    .eq("id", parsed.data.appointmentId)
    .maybeSingle();
  if (!appt) return notFound(init);
  if (appt.patient_user_id !== caller.id) return forbidden(init);
  if (appt.status !== "cancelled") return conflict("Cancel the visit first.", init);

  const { data: bill } = await sb
    .from("bills")
    .select("id, paid_ugx, refunded_ugx")
    .eq("appointment_id", appt.id)
    .eq("kind", "visit")
    .maybeSingle();
  const { data: receipt } = bill
    ? await sb
        .from("receipts")
        .select("id")
        .eq("bill_id", bill.id)
        .order("issued_at")
        .limit(1)
        .maybeSingle()
    : { data: null };
  const { data: account } = await sb
    .from("hospital_payment_accounts")
    .select("refund_cutoff_hours")
    .eq("hospital_id", appt.hospital_id)
    .maybeSingle();

  const verdict = refundEligibility({
    paidUgx: bill?.paid_ugx ?? 0,
    refundedUgx: bill?.refunded_ugx ?? 0,
    visitStartsAt: new Date(appt.starts_at),
    now: new Date(),
    cutoffHours: account?.refund_cutoff_hours ?? 24,
    cancelledBy: "patient",
  });
  if (!verdict.eligible || !receipt)
    return ok({ refund: null, why: verdict.eligible ? "not_paid" : verdict.why }, init);

  const { data: refund, error } = await sb.rpc("pay_refund_request", {
    p_receipt: receipt.id,
    p_amount: verdict.amountUgx,
    p_reason: "patient_cancel",
    p_requested_by: caller.id,
  });
  if (error) {
    if (/over the receipt/.test(error.message))
      return conflict("A refund is already on its way.", init);
    log.error("refund request failed", { requestId, reason: error.message });
    return serverError("could not ask for the refund", init);
  }
  return ok(
    { refund: { id: refund.id, status: refund.status, amountUgx: refund.amount_ugx } },
    init,
  );
});
