/**
 * ha-pay-desk — the reception desk's side of paying (patient app v2 §5.4 P2, P3; PA2, PA5).
 * Callable by reception (or the hospital admin) at the visit's hospital, nobody else.
 *
 * Input, one of:
 *   { action: "prompt", appointmentId, idempotencyKey, network, msisdn }  P2: send a Mobile Money prompt to the
 *     patient's phone after check-in. The PIN goes in the phone's own prompt, never here.
 *   { action: "counter", appointmentId, billId?, idempotencyKey }          Paid in cash at the counter: the same
 *     engine writes the one receipt, so the desk and the patient's ticket read Paid from one view (S16).
 *   { action: "top_up", appointmentId, amountUgx, label? }                 P3: a specialist saw them on a mixed-grade
 *     day; the difference arrives as a bill in the app.
 *
 * The amount for a prompt or the counter is never sent by the client: it is what is left on the bill. Paying
 * never changes the booking (PA2). Nothing here moves real money until `mobilePayments` (D-PA-01).
 */
import { z } from "npm:zod@4.4.3";

import { getCaller, hasRole, serviceClient } from "../_shared/auth.ts";
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
import { isReceptionAt } from "../_shared/hospital-admin-scope.ts";
import { makeLogger } from "../_shared/logger.ts";
import { adapterFor, ProviderUnavailable } from "../_shared/pay-provider.ts";
import { maskMsisdn, normaliseUgMsisdn, promptNarration, promptView } from "../_shared/payments.ts";

const log = makeLogger("ha-pay-desk");

const InputSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("prompt"),
    appointmentId: z.uuid(),
    idempotencyKey: z.uuid(),
    network: z.enum(["mtn", "airtel"]),
    msisdn: z.string().min(9).max(20),
  }),
  z.object({
    action: z.literal("counter"),
    appointmentId: z.uuid(),
    billId: z.uuid().optional(),
    idempotencyKey: z.uuid(),
  }),
  z.object({
    action: z.literal("top_up"),
    appointmentId: z.uuid(),
    amountUgx: z.number().int().positive().max(5_000_000),
    label: z.string().min(1).max(80).optional(),
  }),
]);

const PAYABLE = new Set(["confirmed", "arrived", "in_progress", "completed"]);

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
  const input = parsed.data;

  const caller = await getCaller(request);
  if (!caller) return unauthorized(init);
  const sb = serviceClient();

  const { data: appt } = await sb
    .from("appointments")
    .select("id, hospital_id, status, hospitals(name)")
    .eq("id", input.appointmentId)
    .maybeSingle();
  if (!appt) return notFound(init);
  const desk =
    (await isReceptionAt(caller.id, appt.hospital_id)) ||
    (await hasRole(caller.id, "hospital_admin", appt.hospital_id));
  if (!desk) return forbidden(init, "reception at this hospital only");
  if (!PAYABLE.has(appt.status)) return conflict("This visit can no longer be paid.", init);
  const hospitalName = (appt.hospitals as { name: string } | null)?.name ?? "Hospital";

  if (input.action === "top_up") {
    const { data, error } = await sb.rpc("pay_bill_top_up", {
      p_appointment: appt.id,
      p_amount: input.amountUgx,
      p_label: input.label ?? "Top-up · specialist",
    });
    if (error) return conflict(error.message, init);
    log.info("top_up", { requestId, bill: data });
    return ok({ billId: data }, init);
  }

  // The bill: the one named (a top-up), else the visit's own, made from the booking's fee snapshot.
  let billId: string | null = input.action === "counter" ? (input.billId ?? null) : null;
  if (billId) {
    const { data: b } = await sb
      .from("bills")
      .select("id, appointment_id")
      .eq("id", billId)
      .maybeSingle();
    if (!b || b.appointment_id !== appt.id) return notFound(init);
  } else {
    const { data, error } = await sb.rpc("pay_bill_for_appointment", { p_appointment: appt.id });
    if (error) return serverError("could not make the bill", init);
    billId = data as string | null;
    if (!billId) return badRequest("This visit has no fee.", init);
  }

  if (input.action === "counter") {
    const { data: intent, error } = await sb.rpc("pay_intent_start", {
      p_bill: billId,
      p_key: input.idempotencyKey,
      p_channel: "counter",
      p_network: null,
      p_msisdn_masked: null,
      p_payer: null,
      p_provider: "counter",
    });
    if (error) {
      if (/bill is/.test(error.message)) return conflict("This bill is already settled.", init);
      return serverError("could not record the payment", init);
    }
    if (intent.status === "created") {
      const ref = `counter_${intent.id}`;
      await sb.rpc("pay_intent_prompted", { p_intent: intent.id, p_provider_ref: ref });
      await sb.rpc("pay_apply_event", {
        p_provider: "counter",
        p_event_id: ref,
        p_provider_ref: ref,
        p_outcome: "succeeded",
        p_amount: intent.amount_ugx,
        p_verified: true,
        p_reason: null,
      });
    }
    const { data: status } = await sb
      .from("payment_status")
      .select("status, receipt_number")
      .eq("bill_id", billId)
      .maybeSingle();
    return ok({ billId, status: status?.status, receiptNumber: status?.receipt_number }, init);
  }

  // P2: a prompt to the patient's phone.
  const msisdn = normaliseUgMsisdn(input.msisdn);
  if (!msisdn) return badRequest("That is not a Ugandan mobile number.", init);
  const { data: account } = await sb
    .from("hospital_payment_accounts")
    .select("provider, enabled, networks")
    .eq("hospital_id", appt.hospital_id)
    .maybeSingle();
  if (!account?.enabled) return conflict("Mobile Money is not set up for this hospital.", init);
  if (!(account.networks as string[]).includes(input.network)) {
    return badRequest("This hospital does not take that network yet.", init);
  }
  let adapter;
  try {
    adapter = adapterFor(account.provider);
  } catch (e) {
    if (e instanceof ProviderUnavailable) return conflict(e.message, init);
    throw e;
  }
  await sb.rpc("pay_expire_stale");
  const { data: intent, error: intentErr } = await sb.rpc("pay_intent_start", {
    p_bill: billId,
    p_key: input.idempotencyKey,
    p_channel: "phone_prompt",
    p_network: input.network,
    p_msisdn_masked: maskMsisdn(msisdn),
    p_payer: null,
    p_provider: adapter.name,
  });
  if (intentErr) {
    if (/bill is/.test(intentErr.message)) return conflict("This bill is already settled.", init);
    return serverError("could not start the payment", init);
  }
  if (intent.status !== "created") {
    return ok(
      { intentId: intent.id, status: intent.status, view: promptView(intent.status) },
      init,
    );
  }
  let providerRef: string;
  try {
    ({ providerRef } = await adapter.requestToPay({
      idempotencyKey: input.idempotencyKey,
      amountUgx: intent.amount_ugx,
      msisdn,
      network: input.network,
      narration: promptNarration(hospitalName),
    }));
  } catch (e) {
    log.error("provider refused", { requestId, reason: (e as Error).message });
    await sb.rpc("pay_apply_event", {
      p_provider: adapter.name,
      p_event_id: `local_${intent.id}`,
      p_provider_ref: `local_${intent.id}`,
      p_outcome: "failed",
      p_amount: null,
      p_verified: true,
      p_reason: "provider_error",
    });
    return ok({ intentId: intent.id, status: "failed", view: "nothing_taken" }, init);
  }
  await sb.rpc("pay_intent_prompted", { p_intent: intent.id, p_provider_ref: providerRef });

  let status = "prompted";
  if (adapter.name === "sandbox" && adapter.callbackFor) {
    const cb = await adapter.callbackFor(providerRef);
    const event = cb
      ? await adapter.verifyCallback(cb.body, { "x-sandbox-signature": cb.signature })
      : null;
    if (event) {
      const { data: result } = await sb.rpc("pay_apply_event", {
        p_provider: "sandbox",
        p_event_id: event.eventId,
        p_provider_ref: event.providerRef,
        p_outcome: event.outcome,
        p_amount: event.amountUgx,
        p_verified: true,
        p_reason: event.reason,
      });
      status = result === "paid" ? "succeeded" : event.outcome === "failed" ? "failed" : status;
    }
  }
  log.info("desk prompt", { requestId, intent: intent.id, status });
  return ok({ intentId: intent.id, status, view: promptView(status as "prompted") }, init);
});
