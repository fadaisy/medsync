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
import type { MoneyBill, MoneyReceipt, MoneyRefund } from "@patient-core/visit-money";
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
  /** A top-up bill on this visit (P3); without it, the visit's own fee. */
  billId?: string;
  network: Network;
  msisdn: string;
  idempotencyKey?: string;
}): Promise<{ ok: true; view: PromptView } | { ok: false; error: string }> {
  if (!normaliseUgMsisdn(input.msisdn)) return { ok: false, error: "That is not a Ugandan mobile number." };
  const res = await callEdge<{ status: string; view: PromptView }>("pt-pay-intent", {
    appointmentId: input.appointmentId,
    ...(input.billId ? { billId: input.billId } : {}),
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

/* ─── The money on one visit (Step 6, §5.4 P2 to P5) ──────────────────────────── */

export interface MoneyRows {
  bills: MoneyBill[];
  receipts: MoneyReceipt[];
  refunds: MoneyRefund[];
  cutoffHours: number | null;
}

/** Bills, receipts and refunds on one visit, under RLS. Fails soft to empty before 0299 (no cut-off before 0302). */
export async function loadVisitMoney(appointmentId: string, hospitalId: string): Promise<MoneyRows> {
  const empty: MoneyRows = { bills: [], receipts: [], refunds: [], cutoffHours: null };
  const { data: bills, error } = await supabase
    .from("bills")
    .select("id, kind, status, total_ugx, paid_ugx, refunded_ugx, bill_items(label, amount_ugx)")
    .eq("appointment_id", appointmentId);
  if (error || !bills) return empty;
  const ids = (bills as { id: string }[]).map((b) => b.id);
  const { data: receipts } = ids.length
    ? await supabase
        .from("receipts")
        .select("id, number, bill_id, issued_at, total_ugx, method, reference, payer_user_id, item_label")
        .in("bill_id", ids)
    : { data: [] };
  const rIds = ((receipts ?? []) as { id: string }[]).map((r) => r.id);
  const [{ data: refunds }, { data: rule }] = await Promise.all([
    rIds.length
      ? supabase.from("refund_requests").select("receipt_id, status").in("receipt_id", rIds)
      : Promise.resolve({ data: [] }),
    supabase.from("hospital_refund_rules").select("refund_cutoff_hours").eq("hospital_id", hospitalId).maybeSingle(),
  ]);
  return {
    bills: (bills as Record<string, unknown>[])
      .filter((b) => b.kind === "visit" || b.kind === "top_up")
      .map((b) => ({
        id: b.id as string,
        kind: b.kind as MoneyBill["kind"],
        status: b.status as BillStatus,
        totalUgx: b.total_ugx as number,
        paidUgx: b.paid_ugx as number,
        refundedUgx: b.refunded_ugx as number,
        items: ((b.bill_items as { label: string; amount_ugx: number }[] | null) ?? []).map((i) => ({
          label: i.label,
          amountUgx: i.amount_ugx,
        })),
      })),
    receipts: ((receipts ?? []) as Record<string, unknown>[]).map((r) => ({
      id: r.id as string,
      number: r.number as number,
      billId: r.bill_id as string,
      issuedAtIso: r.issued_at as string,
      totalUgx: r.total_ugx as number,
      method: r.method as MoneyReceipt["method"],
      reference: (r.reference as string | null) ?? null,
      payerUserId: (r.payer_user_id as string | null) ?? null,
      itemLabel: r.item_label as string,
    })),
    refunds: ((refunds ?? []) as Record<string, unknown>[]).map((r) => ({
      receiptId: r.receipt_id as string,
      status: r.status as MoneyRefund["status"],
    })),
    cutoffHours: ((rule as { refund_cutoff_hours?: number } | null)?.refund_cutoff_hours as number | undefined) ?? null,
  };
}

/** After cancelling a paid visit: ask for the money back (`pt-refund-request`). The server sets the amount (S15). */
export async function askRefund(appointmentId: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const res = await callEdge("pt-refund-request", { appointmentId });
  return res.ok ? { ok: true } : { ok: false, error: res.error };
}

/** A visit the clinic moved by cancelling its day (Gate E): the one code the offer card branches on. */
export function movedByClinic(v: Pick<AppointmentRow, "cancelledReason">): boolean {
  return v.cancelledReason === "session_cancelled";
}
