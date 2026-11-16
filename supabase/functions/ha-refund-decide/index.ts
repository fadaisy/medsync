/**
 * ha-refund-decide — the accounts supervisor approves or declines a refund, then the money goes back to the
 * same Mobile Money (patient app v2 §5.4 P5; PA6, D-PA-05, D-PA-06). Input: { refundId, approve }.
 * The SQL decides who may decide (a current `accounts_supervisor` designation, never the person who asked).
 * A refund that is already approved (a hospital cancellation, automatic) is sent with approve: true.
 * The cash office's approvals screen (its own prompt) will call this; nothing here is a patient surface.
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
import { adapterFor, ProviderUnavailable } from "../_shared/pay-provider.ts";

const log = makeLogger("ha-refund-decide");
const InputSchema = z.object({ refundId: z.uuid(), approve: z.boolean() });

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

  const { data: current } = await sb
    .from("refund_requests")
    .select(
      "id, status, amount_ugx, receipt_id, receipts(intent_id, payment_intents(provider, provider_ref))",
    )
    .eq("id", parsed.data.refundId)
    .maybeSingle();
  if (!current) return notFound(init);

  let status = current.status as string;
  if (status === "waiting") {
    const { data, error } = await sb.rpc("pay_refund_decide", {
      p_refund: current.id,
      p_actor: caller.id,
      p_approve: parsed.data.approve,
    });
    if (error) {
      if (error.code === "42501") return forbidden(init, error.message);
      return conflict(error.message, init);
    }
    status = data.status;
  }
  if (status !== "approved" || !parsed.data.approve) return ok({ status }, init);

  const intent = (
    current.receipts as { payment_intents: { provider: string; provider_ref: string } } | null
  )?.payment_intents;
  if (!intent) return serverError("no payment to refund", init);
  try {
    const sent = await adapterFor(intent.provider as "sandbox").refund(
      intent.provider_ref,
      current.amount_ugx,
      current.id,
    );
    const { data } = await sb.rpc("pay_refund_sent", {
      p_refund: current.id,
      p_provider_ref: sent.refundRef,
      p_ok: sent.ok,
    });
    return ok({ status: data?.status ?? status }, init);
  } catch (e) {
    if (e instanceof ProviderUnavailable) return conflict(e.message, init);
    log.error("refund send failed", { requestId, reason: (e as Error).message });
    return serverError("the refund could not be sent", init);
  }
});
