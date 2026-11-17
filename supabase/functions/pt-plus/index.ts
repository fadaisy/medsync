/**
 * pt-plus — Tether Plus for the signed-in patient (patient app v2 §5.9; ADR 0523).
 * Input, one of:
 *   { action: "trial", tier }                                          the 30-day trial, once, no card (0300).
 *   { action: "pay", tier, period, network, msisdn, idempotencyKey }   a period through the one engine (0303).
 * The amount is the server's approved price, never the client's. Tether is the merchant; until Tether's own
 * merchant agreement is signed only the sandbox runs (PAY_SANDBOX_ALLOWED), and real money stays off
 * (`mobilePayments`). Plus never changes safety (MR9): this function touches no care, alert or result.
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
import { adapterFor, ProviderUnavailable } from "../_shared/pay-provider.ts";
import { maskMsisdn, normaliseUgMsisdn, promptView } from "../_shared/payments.ts";

const log = makeLogger("pt-plus");
const Tier = z.enum(["plus_family", "plus_care", "family_care"]);
const InputSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("trial"), tier: Tier }),
  z.object({
    action: z.literal("pay"),
    tier: Tier,
    period: z.enum(["monthly", "quarterly", "yearly"]),
    network: z.enum(["mtn", "airtel"]),
    msisdn: z.string().min(9).max(20),
    idempotencyKey: z.uuid(),
  }),
]);

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

  if (input.action === "trial") {
    const { error } = await sb.rpc("membership_start_trial", {
      p_user: caller.id,
      p_tier: input.tier,
    });
    if (error)
      return conflict(
        /trial already used/.test(error.message) ? "You have had your free month." : error.message,
        init,
      );
    return ok({ status: "trial" }, init);
  }

  const msisdn = normaliseUgMsisdn(input.msisdn);
  if (!msisdn) return badRequest("That is not a Ugandan mobile number.", init);
  // Tether's own merchant account: the sandbox until the agreement is signed (payments-setup, "Open").
  const provider = (Deno.env.get("PLUS_PAY_PROVIDER") ?? "sandbox") as "sandbox";
  let adapter;
  try {
    adapter = adapterFor(provider);
  } catch (e) {
    if (e instanceof ProviderUnavailable) return conflict(e.message, init);
    throw e;
  }
  const { data: billId, error: billErr } = await sb.rpc("pay_bill_membership", {
    p_user: caller.id,
    p_tier: input.tier,
    p_period: input.period,
  });
  if (billErr || !billId) return conflict(billErr?.message ?? "No price for that yet.", init);
  await sb.rpc("pay_expire_stale");
  const { data: intent, error: intentErr } = await sb.rpc("pay_intent_start", {
    p_bill: billId,
    p_key: input.idempotencyKey,
    p_channel: "app",
    p_network: input.network,
    p_msisdn_masked: maskMsisdn(msisdn),
    p_payer: caller.id,
    p_provider: adapter.name,
  });
  if (intentErr) return serverError("could not start the payment", init);
  if (intent.status !== "created")
    return ok({ status: intent.status, view: promptView(intent.status) }, init);
  let providerRef: string;
  try {
    ({ providerRef } = await adapter.requestToPay({
      idempotencyKey: input.idempotencyKey,
      amountUgx: intent.amount_ugx,
      msisdn,
      network: input.network,
      narration: "Tether Plus",
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
    return ok({ status: "failed", view: "nothing_taken" }, init);
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
  log.info("plus", { requestId, status });
  return ok({ status, view: promptView(status as "prompted") }, init);
});
