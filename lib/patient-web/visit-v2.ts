import "server-only";

import type { VisitPay } from "@patient-core/ticket-view";
import type { MoneyBill, MoneyReceipt, MoneyRefund } from "@patient-core/visit-money";

import { createClient } from "@/lib/supabase/server";

/**
 * Patient app v2 Visit mode reads on the web (Step 5), under the patient's own session and RLS: the one payment
 * status per visit (PA5, `payment_status`) and Questions for the doctor (`visit_questions`). Both fail soft:
 * before migrations 0299/0300 are applied the pages show no payment line and no questions, never an error.
 */
export async function loadPayStatus(appointmentIds: string[]): Promise<Map<string, VisitPay>> {
  const out = new Map<string, VisitPay>();
  if (appointmentIds.length === 0) return out;
  const sb = await createClient();
  const { data, error } = await sb
    .from("payment_status")
    .select(
      "appointment_id, bill_id, status, total_ugx, paid_ugx, refunded_ugx, method, receipt_number, paid_channel, kind",
    )
    .in("appointment_id", appointmentIds)
    .eq("kind", "visit");
  if (error || !data) return out;
  for (const r of data as Record<string, unknown>[]) {
    out.set(r.appointment_id as string, {
      appointmentId: r.appointment_id as string,
      billId: r.bill_id as string,
      status: r.status as VisitPay["status"],
      totalUgx: r.total_ugx as number,
      paidUgx: r.paid_ugx as number,
      refundedUgx: r.refunded_ugx as number,
      method: (r.method as VisitPay["method"]) ?? null,
      receiptNumber: (r.receipt_number as number | null) ?? null,
      paidChannel: (r.paid_channel as VisitPay["paidChannel"]) ?? null,
    });
  }
  return out;
}

export interface VisitQuestion {
  id: string;
  body: string;
  suggested: boolean;
  asked: boolean;
}

export async function loadQuestions(appointmentId: string): Promise<VisitQuestion[]> {
  const sb = await createClient();
  const { data, error } = await sb
    .from("visit_questions")
    .select("id, body, suggested, asked_at, created_at")
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

/** The signed-in patient's own mobile number for the pay choice (D-PA-03); null when the account has none. */
export async function myMobile(): Promise<string | null> {
  const sb = await createClient();
  const { data } = await sb.auth.getUser();
  return data.user?.phone ? data.user.phone : null;
}

export interface MoneyRows {
  bills: MoneyBill[];
  receipts: MoneyReceipt[];
  refunds: MoneyRefund[];
  cutoffHours: number | null;
}

/**
 * Every bill, receipt and refund on one visit (P2 to P5), under RLS: the patient and their household payer read
 * their own; nobody else. Fails soft to empty before 0299 (and to no cut-off before 0302).
 */
export async function loadVisitMoney(
  appointmentId: string,
  hospitalId: string,
): Promise<MoneyRows> {
  const empty: MoneyRows = { bills: [], receipts: [], refunds: [], cutoffHours: null };
  const sb = await createClient();
  const { data: bills, error } = await sb
    .from("bills")
    .select("id, kind, status, total_ugx, paid_ugx, refunded_ugx, bill_items(label, amount_ugx)")
    .eq("appointment_id", appointmentId);
  if (error || !bills) return empty;
  const ids = bills.map((b) => b.id as string);
  const [{ data: receipts }, { data: rule }] = await Promise.all([
    ids.length
      ? sb
          .from("receipts")
          .select(
            "id, number, bill_id, issued_at, total_ugx, method, reference, payer_user_id, item_label",
          )
          .in("bill_id", ids)
      : Promise.resolve({ data: [] as Record<string, unknown>[] }),
    sb
      .from("hospital_refund_rules")
      .select("refund_cutoff_hours")
      .eq("hospital_id", hospitalId)
      .maybeSingle(),
  ]);
  const rIds = (receipts ?? []).map((r) => r.id as string);
  const { data: refunds } = rIds.length
    ? await sb.from("refund_requests").select("receipt_id, status").in("receipt_id", rIds)
    : { data: [] as Record<string, unknown>[] };
  return {
    bills: (bills as Record<string, unknown>[])
      .filter((b) => b.kind === "visit" || b.kind === "top_up")
      .map((b) => ({
        id: b.id as string,
        kind: b.kind as MoneyBill["kind"],
        status: b.status as MoneyBill["status"],
        totalUgx: b.total_ugx as number,
        paidUgx: b.paid_ugx as number,
        refundedUgx: b.refunded_ugx as number,
        items: ((b.bill_items as { label: string; amount_ugx: number }[] | null) ?? []).map(
          (i) => ({
            label: i.label,
            amountUgx: i.amount_ugx,
          }),
        ),
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
    cutoffHours: (rule?.refund_cutoff_hours as number | undefined) ?? null,
  };
}
