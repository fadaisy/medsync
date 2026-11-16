"use server";

import type { Network, PromptView } from "@patient-core/payments";
import { revalidatePath } from "next/cache";
import { normaliseUgMsisdn, promptView } from "@patient-core/payments";
import { z } from "zod";

import { requirePatientScope } from "@/lib/patient/scope";
import { callEdge } from "@/lib/supabase/edge";
import { createClient } from "@/lib/supabase/server";

/**
 * Patient app v2 Visit mode writes on the web (Step 5). Questions for the doctor go through the patient's own
 * session (RLS: only the visit's patient or their booking agent writes; the desk never reads). Paying goes
 * through `pt-pay-intent`; the server decides the provider, and the booking is never touched (PA2).
 */
type Result<T = object> = ({ ok: true } & T) | { ok: false; error: string };

const refresh = () => revalidatePath("/pw/patient", "layout");

export async function addQuestionAction(
  appointmentId: string,
  body: string,
  suggested: boolean,
): Promise<Result> {
  const scope = await requirePatientScope();
  const parsed = z
    .object({ id: z.uuid(), body: z.string().trim().min(1).max(280) })
    .safeParse({ id: appointmentId, body });
  if (!parsed.success) return { ok: false, error: "A question is 1 to 280 characters." };
  const sb = await createClient();
  const { error } = await sb.from("visit_questions").insert({
    appointment_id: parsed.data.id,
    author_user_id: scope.userId,
    body: parsed.data.body,
    suggested,
  });
  if (error) return { ok: false, error: "The question could not be saved. Try again." };
  refresh();
  return { ok: true };
}

export async function markQuestionAction(
  id: string,
  change: "asked" | "not_asked" | "remove",
): Promise<Result> {
  await requirePatientScope();
  if (!z.uuid().safeParse(id).success) return { ok: false, error: "That question was not found." };
  const now = new Date().toISOString();
  const patch =
    change === "asked"
      ? { asked_at: now }
      : change === "not_asked"
        ? { asked_at: null }
        : { removed_at: now };
  const sb = await createClient();
  const { error } = await sb.from("visit_questions").update(patch).eq("id", id);
  if (error) return { ok: false, error: "That could not be changed. Try again." };
  refresh();
  return { ok: true };
}

export async function payVisitAction(input: {
  appointmentId: string;
  /** A top-up bill on this visit (P3); without it, the visit's own fee. */
  billId?: string;
  network: Network;
  msisdn: string;
  idempotencyKey: string;
}): Promise<Result<{ view: PromptView }>> {
  await requirePatientScope();
  if (!normaliseUgMsisdn(input.msisdn))
    return { ok: false, error: "That is not a Ugandan mobile number." };
  const res = await callEdge<{ data?: { status: string; view: PromptView } }>(
    "pt-pay-intent",
    {
      appointmentId: input.appointmentId,
      ...(input.billId ? { billId: input.billId } : {}),
      idempotencyKey: input.idempotencyKey,
      network: input.network,
      msisdn: input.msisdn,
    },
    "patient-web.pay",
  );
  if (!res.ok) return { ok: false, error: res.error };
  const d = res.data?.data;
  refresh();
  return { ok: true, view: d?.view ?? promptView((d?.status ?? "failed") as never) };
}

/** After cancelling a paid visit: ask for the money back (`pt-refund-request`, P5). The server sets the amount. */
export async function askRefundAction(appointmentId: string): Promise<Result<{ status: string }>> {
  await requirePatientScope();
  if (!z.uuid().safeParse(appointmentId).success)
    return { ok: false, error: "That visit was not found." };
  const res = await callEdge<{ data?: { status?: string } }>(
    "pt-refund-request",
    { appointmentId },
    "patient-web.refund",
  );
  if (!res.ok) return { ok: false, error: res.error };
  refresh();
  return { ok: true, status: res.data?.data?.status ?? "waiting" };
}

/** "Keep" on a moved visit: take the next open day the clinic offered (`pt-accept-rebooking`, Gate E). */
export async function acceptOfferAction(
  cancelledAppointmentId: string,
  sessionId: string,
): Promise<Result> {
  await requirePatientScope();
  if (!z.uuid().safeParse(cancelledAppointmentId).success || !z.uuid().safeParse(sessionId).success)
    return { ok: false, error: "That offer was not found." };
  const res = await callEdge(
    "pt-accept-rebooking",
    { cancelled_appointment_id: cancelledAppointmentId, session_id: sessionId },
    "patient-web.rebook",
  );
  if (!res.ok) return { ok: false, error: res.error };
  refresh();
  return { ok: true };
}
