/**
 * Patient app v2, Visit mode data on the phone (Step 4). Reuses `@/data/visits` loaders; adds what v2 shows:
 * the one payment status per visit (PA5, `payment_status` view, read only), paying through `pt-pay-intent`
 * (the server decides the provider; the sandbox moves no money), Questions for the doctor (`visit_questions`,
 * RLS: the patient writes, the nurse and doctor read, the desk never does), and the ticket's view of a visit.
 * Every read fails soft: before migrations 0299/0300 are applied the screens show no payment line and no
 * questions, never an error in the patient's way.
 */
import type { TicketV2Props } from "@/components/tide/v2";
import type { AppointmentRow } from "@/lib/booking";
import type { BillStatus, Channel, Network, PromptView } from "@patient-core/payments";
import type { VisitPay } from "@patient-core/ticket-view";
import { normaliseUgMsisdn, promptView } from "@patient-core/payments";
import {
  chipFor as sharedChip,
  payLineFor as sharedPayLine,
  ticketView,
} from "@patient-core/ticket-view";

import { callEdge, requestId } from "@/lib/edge";
import { supabase } from "@/lib/supabase";

export type { VisitPay } from "@patient-core/ticket-view";

/** The one payment status per visit (PA5). Missing view or no rows: an empty map, never an error. */
export async function loadPayStatus(appointmentIds: string[]): Promise<Map<string, VisitPay>> {
  const out = new Map<string, VisitPay>();
  if (appointmentIds.length === 0) return out;
  const { data, error } = await supabase
    .from("payment_status")
    .select("appointment_id, bill_id, status, total_ugx, paid_ugx, refunded_ugx, method, receipt_number, paid_channel, kind")
    .in("appointment_id", appointmentIds)
    .eq("kind", "visit");
  if (error || !data) return out;
  for (const r of data as Record<string, unknown>[]) {
    out.set(r.appointment_id as string, {
      appointmentId: r.appointment_id as string,
      billId: r.bill_id as string,
      status: r.status as BillStatus,
      totalUgx: r.total_ugx as number,
      paidUgx: r.paid_ugx as number,
      refundedUgx: r.refunded_ugx as number,
      method: (r.method as VisitPay["method"]) ?? null,
      receiptNumber: (r.receipt_number as number | null) ?? null,
      paidChannel: (r.paid_channel as Channel | null) ?? null,
    });
  }
  return out;
}

/** The payment line and chip: the shared rule (@patient-core/ticket-view). */
export function payLineFor(visit: { quotedFeeUgx: number | null }, pay: VisitPay | undefined) {
  return sharedPayLine(visit.quotedFeeUgx, pay);
}

export function chipFor(pay: VisitPay | undefined) {
  return pay ? sharedChip(pay.totalUgx, pay) : "at_hospital";
}

/**
 * Pay a visit's fee by Mobile Money. The key is made once per attempt by the caller, so a retry is the same
 * attempt (PA4). Returns what the wait screen says. The booking is never touched (PA2).
 */
export async function payVisit(input: {
  appointmentId: string;
  network: Network;
  msisdn: string;
  idempotencyKey?: string;
}): Promise<{ ok: true; view: PromptView } | { ok: false; error: string }> {
  if (!normaliseUgMsisdn(input.msisdn)) return { ok: false, error: "That is not a Ugandan mobile number." };
  const res = await callEdge<{ status: string; view: PromptView }>("pt-pay-intent", {
    appointmentId: input.appointmentId,
    idempotencyKey: input.idempotencyKey ?? requestId(),
    network: input.network,
    msisdn: input.msisdn,
  });
  if (!res.ok) return { ok: false, error: res.error };
  return { ok: true, view: res.data.view ?? promptView(res.data.status as never) };
}

/* ─── Questions for the doctor (§5.5; D-PA-10) ───────────────────────────────── */

export interface VisitQuestion {
  id: string;
  body: string;
  suggested: boolean;
  asked: boolean;
}

export async function loadQuestions(appointmentId: string): Promise<VisitQuestion[]> {
  const { data, error } = await supabase
    .from("visit_questions")
    .select("id, body, suggested, asked_at, removed_at, created_at")
    .eq("appointment_id", appointmentId)
    .is("removed_at", null)
    .order("created_at");
  if (error || !data) return [];
  return (data as Record<string, unknown>[]).map((r) => ({
    id: r.id as string,
    body: r.body as string,
    suggested: Boolean(r.suggested),
    asked: r.asked_at !== null,
  }));
}

export async function addQuestion(appointmentId: string, body: string, suggested = false): Promise<boolean> {
  const text = body.trim();
  if (text.length < 1 || text.length > 280) return false;
  const { data: session } = await supabase.auth.getSession();
  const me = session.session?.user.id;
  if (!me) return false;
  const { error } = await supabase
    .from("visit_questions")
    .insert({ appointment_id: appointmentId, author_user_id: me, body: text, suggested });
  return !error;
}

export async function markQuestion(id: string, change: "asked" | "not_asked" | "remove"): Promise<boolean> {
  const now = new Date().toISOString();
  const patch =
    change === "asked" ? { asked_at: now } : change === "not_asked" ? { asked_at: null } : { removed_at: now };
  const { error } = await supabase.from("visit_questions").update(patch).eq("id", id);
  return !error;
}

/* ─── The v2 ticket's view of a visit: the shared rule ─────────────────────────── */

export { groupCode } from "@patient-core/ticket-view";

export function ticketFor(
  v: AppointmentRow & { quotedFeeUgx?: number | null },
  pay: VisitPay | undefined,
  patientName: string,
): TicketV2Props {
  return ticketView(v, pay, patientName);
}

/** The signed-in patient's own mobile number, for the pay choice (D-PA-03). Null when the account has none. */
export async function myMobile(): Promise<string | null> {
  const { data } = await supabase.auth.getSession();
  const phone = data.session?.user.phone ?? null;
  return phone && normaliseUgMsisdn(phone) ? phone : null;
}
