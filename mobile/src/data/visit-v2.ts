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
import { normaliseUgMsisdn, paymentChip, promptView, ticketPayLine } from "@patient-core/payments";

import { callEdge, requestId } from "@/lib/edge";
import { supabase } from "@/lib/supabase";

export interface VisitPay {
  appointmentId: string;
  billId: string;
  status: BillStatus;
  totalUgx: number;
  paidUgx: number;
  refundedUgx: number;
  method: Network | "counter" | null;
  receiptNumber: number | null;
  paidChannel: Channel | null;
}

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

/** The payment line for a visit: the bill if there is one, else the fee quoted at booking (not yet billed). */
export function payLineFor(visit: { quotedFeeUgx: number | null }, pay: VisitPay | undefined) {
  if (pay) {
    return ticketPayLine(
      { status: pay.status, totalUgx: pay.totalUgx, paidUgx: pay.paidUgx, refundedUgx: pay.refundedUgx },
      pay.method && pay.receiptNumber !== null ? { method: pay.method, number: pay.receiptNumber } : null,
    );
  }
  return visit.quotedFeeUgx && visit.quotedFeeUgx > 0
    ? ({ kind: "to_pay", amountUgx: visit.quotedFeeUgx } as const)
    : ({ kind: "free" } as const);
}

export function chipFor(pay: VisitPay | undefined) {
  return pay ? paymentChip({ status: pay.status, totalUgx: pay.totalUgx }, pay.paidChannel) : "at_hospital";
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

/* ─── The v2 ticket's view of a visit ───────────────────────────────────────── */

const WEEKDAY = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const MONTH = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
/** Hospital time: Kampala is UTC+3 all year, so a visit reads the same wherever the phone thinks it is. */
const KAMPALA_MS = 3 * 3600_000;
const inKampala = (iso: string) => new Date(new Date(iso).getTime() + KAMPALA_MS);
const hhmm = (iso: string) => {
  const d = inKampala(iso);
  return `${String(d.getUTCHours()).padStart(2, "0")}:${String(d.getUTCMinutes()).padStart(2, "0")}`;
};

/** "K7M42Q" → "K7M 42Q": the desk code in two groups of three. */
export function groupCode(code: string | null): string {
  if (!code) return "—";
  const c = code.replace(/\s+/g, "").toUpperCase();
  return c.length === 6 ? `${c.slice(0, 3)} ${c.slice(3)}` : c;
}

export function ticketFor(
  v: AppointmentRow & { quotedFeeUgx?: number | null },
  pay: VisitPay | undefined,
  patientName: string,
): TicketV2Props {
  const d = inKampala(v.startsAtIso);
  const session = v.sessionId !== null;
  const window =
    session && v.arrivalWindowStartIso && v.arrivalWindowEndIso
      ? `${hhmm(v.arrivalWindowStartIso)} to ${hhmm(v.arrivalWindowEndIso)}`
      : hhmm(v.startsAtIso);
  const initials = v.hospitalName
    .split(/\s+/)
    .filter((w) => /^[A-Za-z]/.test(w))
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join("");
  return {
    hospitalName: v.hospitalName,
    hospitalInitials: initials || "H",
    day: String(d.getUTCDate()),
    dayLine: `${WEEKDAY[d.getUTCDay()]} · ${MONTH[d.getUTCMonth()]}`,
    window,
    doctorTime: !session,
    clinic: v.departmentName,
    room: null,
    patient: v.forMember ?? patientName,
    block: null,
    pay: payLineFor({ quotedFeeUgx: v.quotedFeeUgx ?? null }, pay),
    code: groupCode(v.bookingCode),
  };
}

/** The signed-in patient's own mobile number, for the pay choice (D-PA-03). Null when the account has none. */
export async function myMobile(): Promise<string | null> {
  const { data } = await supabase.auth.getSession();
  const phone = data.session?.user.phone ?? null;
  return phone && normaliseUgMsisdn(phone) ? phone : null;
}
