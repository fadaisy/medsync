/**
 * pt-pay-intent — pay a visit's fee with Mobile Money (patient app v2 §5.4 P1, P2, P4; PA1–PA5).
 * Input: { appointmentId?, billId?, idempotencyKey, network, msisdn }: a visit (its fee), a visit's top-up bill
 * (P3), or a care programme bill alone (ADR 0519).
 *
 * The caller is the patient, or a booking agent for them (D-PA-09). The amount is never sent by the client:
 * the bill comes from the booking's fee snapshot (0299 `pay_bill_for_appointment`). The same idempotency key
 * returns the same attempt (PA4). The PIN is entered in the phone's own Mobile Money prompt, never here.
 * Paying never blocks or changes the booking (PA2): a failure or timeout leaves it as "Pays at the hospital".
 *
 * Sandbox: the provider's callback is delivered inline (no money moves, no external call). A real provider
 * answers later at /api/pay/callback/<provider>/<secret> (a Next route).
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
import { maskMsisdn, normaliseUgMsisdn, promptNarration, promptView } from "../_shared/payments.ts";

const log = makeLogger("pt-pay-intent");

const InputSchema = z
  .object({
    appointmentId: z.uuid().optional(),
    idempotencyKey: z.uuid(),
    network: z.enum(["mtn", "airtel"]),
    msisdn: z.string().min(9).max(20),
    billId: z.uuid().optional(),
  })
  .refine((d) => d.appointmentId || d.billId, { message: "A visit or a bill is needed" });

const PAYABLE = new Set([
  "requested",
  "pending_approval",
  "confirmed",
  "arrived",
  "in_progress",
  "completed",
]);

/** Who the money is for and where it goes: from a visit, or from a programme bill (ADR 0519). */
interface Subject {
  hospitalId: string;
  hospitalName: string;
  patientUserId: string | null;
  provisionalPatientId: string | null;
  appointmentId: string | null;
}

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
  const msisdn = normaliseUgMsisdn(input.msisdn);
  if (!msisdn) return badRequest("That is not a Ugandan mobile number.", init);

  const caller = await getCaller(request);
  if (!caller) return unauthorized(init);
  const sb = serviceClient();

  let subject: Subject;
  if (input.appointmentId) {
    const { data: appt, error: apptErr } = await sb
      .from("appointments")
      .select("id, hospital_id, patient_user_id, provisional_patient_id, status, hospitals(name)")
      .eq("id", input.appointmentId)
      .maybeSingle();
    if (apptErr) return serverError("could not read the visit", init);
    if (!appt) return notFound(init);
    if (!PAYABLE.has(appt.status)) return conflict("This visit can no longer be paid.", init);
    subject = {
      hospitalId: appt.hospital_id,
      hospitalName: (appt.hospitals as { name: string } | null)?.name ?? "Hospital",
      patientUserId: appt.patient_user_id,
      provisionalPatientId: appt.provisional_patient_id,
      appointmentId: appt.id,
    };
  } else {
    const { data: b } = await sb
      .from("bills")
      .select("id, kind, hospital_id, patient_user_id, provisional_patient_id, hospitals(name)")
      .eq("id", input.billId!)
      .maybeSingle();
    if (!b || b.kind !== "programme") return notFound(init);
    subject = {
      hospitalId: b.hospital_id,
      hospitalName: (b.hospitals as { name: string } | null)?.name ?? "Hospital",
      patientUserId: b.patient_user_id,
      provisionalPatientId: b.provisional_patient_id,
      appointmentId: null,
    };
  }

  if (subject.patientUserId !== caller.id) {
    let agent = sb
      .from("booking_agents")
      .select("id")
      .eq("agent_user_id", caller.id)
      .is("revoked_at", null);
    agent = subject.patientUserId
      ? agent.eq("patient_user_id", subject.patientUserId)
      : agent.eq("provisional_patient_id", subject.provisionalPatientId);
    const { data: link } = await agent.limit(1).maybeSingle();
    if (!link) return forbidden(init);
    const { data: allowed } = await sb.rpc("entitlement_allows", {
      p_user: caller.id,
      p_feature: "pay_for_household",
    });
    if (!allowed) return forbidden(init, "Paying for a household member comes with Plus Family.");
  }

  const { data: account } = await sb
    .from("hospital_payment_accounts")
    .select("provider, enabled, networks")
    .eq("hospital_id", subject.hospitalId)
    .maybeSingle();
  if (!account?.enabled)
    return conflict("This hospital takes payment at the cash office for now.", init);
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

  let billId = input.billId ?? null;
  if (billId && subject.appointmentId) {
    const { data: b } = await sb
      .from("bills")
      .select("id, appointment_id")
      .eq("id", billId)
      .maybeSingle();
    if (!b || b.appointment_id !== subject.appointmentId) return notFound(init);
  } else if (!billId) {
    const { data, error } = await sb.rpc("pay_bill_for_appointment", {
      p_appointment: subject.appointmentId,
    });
    if (error) return serverError("could not make the bill", init);
    billId = data as string | null;
    if (!billId) return badRequest("This visit has no fee.", init);
  }

  const { data: intent, error: intentErr } = await sb.rpc("pay_intent_start", {
    p_bill: billId,
    p_key: input.idempotencyKey,
    p_channel: "app",
    p_network: input.network,
    p_msisdn_masked: maskMsisdn(msisdn),
    p_payer: caller.id,
    p_provider: adapter.name,
  });
  if (intentErr) {
    if (/household/.test(intentErr.message)) return forbidden(init);
    if (/bill is/.test(intentErr.message)) return conflict("This bill is already settled.", init);
    log.error("intent failed", { requestId, reason: intentErr.message });
    return serverError("could not start the payment", init);
  }
  if (intent.status !== "created") {
    return ok(
      { intentId: intent.id, status: intent.status, view: promptView(intent.status) },
      init,
    );
  }

  const hospitalName = subject.hospitalName;
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
  log.info("intent", { requestId, intent: intent.id, status });
  return ok({ intentId: intent.id, status, view: promptView(status as "prompted") }, init);
});
