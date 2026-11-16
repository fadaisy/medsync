import "server-only";

import type { VisitPay } from "@patient-core/ticket-view";

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
