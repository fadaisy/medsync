/**
 * What a visit owes, what was paid and where a refund is, the same on the phone and the web (patient app v2
 * §5.4, P2 to P5; PA5). Pure: both apps read the rows under the patient's own RLS and hand them here.
 * Payment states are never red (MR5). A confidential clinic's receipt already says "Clinic visit" (the engine
 * writes it; MR7). The patient never sees another person's name here: a household payer reads "You" or
 * "A household member" (D-PA-09).
 */
import type { BillStatus, Network, RefundStatus } from "./payments";

export interface MoneyBill {
  id: string;
  kind: "visit" | "top_up";
  status: BillStatus;
  totalUgx: number;
  paidUgx: number;
  refundedUgx: number;
  items: { label: string; amountUgx: number }[];
}

export interface MoneyReceipt {
  id: string;
  number: number;
  billId: string;
  issuedAtIso: string;
  totalUgx: number;
  method: Network | "counter";
  reference: string | null;
  payerUserId: string | null;
  itemLabel: string;
}

export interface MoneyRefund {
  receiptId: string;
  status: RefundStatus;
}

export interface MoneyInput {
  appointmentStatus: string;
  startsAtIso: string;
  bills: MoneyBill[];
  receipts: MoneyReceipt[];
  refunds: MoneyRefund[];
  /** The signed-in person. */
  meUserId: string;
  /** The person the visit is for. */
  patientUserId: string | null;
  hospitalName: string;
  /** The hospital's refund cut-off, when the patient can read it (0302); null hides the rule line. */
  cutoffHours: number | null;
  now: Date;
}

export interface DueBill {
  billId: string;
  kind: "visit" | "top_up";
  /** A visit bill after check-in (P2), or any top-up (P3). */
  onTheDay: boolean;
  toPayUgx: number;
  /** Top-up only: what was paid at booking. */
  paidAtBookingUgx: number | null;
}

export interface ReceiptLine {
  id: string;
  number: number;
  hospital: string;
  issuedAt: string;
  items: { label: string; amountUgx: number }[];
  totalUgx: number;
  method: Network | "counter";
  reference: string | null;
  payer: "you" | "household" | "hospital";
  forSomeoneElse: boolean;
}

export interface VisitMoney {
  due: DueBill[];
  receipts: ReceiptLine[];
  /** The refund tracker, once a refund was asked for. */
  refund: { status: RefundStatus; network: Network | "counter" } | null;
  /** A cancelled, paid visit with no refund asked for yet: offer "Ask for your refund". */
  canAskRefund: boolean;
  /** Before cancelling a paid upcoming visit: the money and the cut-off (P5), when the cut-off is known. */
  cancelRule: { paidUgx: number; cutoffIso: string } | null;
}

const CHECKED_IN = new Set(["arrived", "in_progress", "completed"]);
const UPCOMING = new Set(["requested", "pending_approval", "confirmed"]);

/** "16 Nov 2026, 14:05" in Kampala time (UTC+3, no daylight saving). */
export function kampalaStamp(iso: string): string {
  const d = new Date(new Date(iso).getTime() + 3 * 3600_000);
  const months = [
    "Jan",
    "Feb",
    "Mar",
    "Apr",
    "May",
    "Jun",
    "Jul",
    "Aug",
    "Sep",
    "Oct",
    "Nov",
    "Dec",
  ];
  const hh = String(d.getUTCHours()).padStart(2, "0");
  const mm = String(d.getUTCMinutes()).padStart(2, "0");
  return `${d.getUTCDate()} ${months[d.getUTCMonth()]} ${d.getUTCFullYear()}, ${hh}:${mm}`;
}

export function visitMoney(m: MoneyInput): VisitMoney {
  const visitBill = m.bills.find((b) => b.kind === "visit") ?? null;
  const open = (b: MoneyBill) => b.status === "open" || b.status === "part_paid";

  const due: DueBill[] = [];
  const live = m.appointmentStatus !== "cancelled" && m.appointmentStatus !== "no_show";
  if (live) {
    if (visitBill && open(visitBill) && CHECKED_IN.has(m.appointmentStatus)) {
      due.push({
        billId: visitBill.id,
        kind: "visit",
        onTheDay: true,
        toPayUgx: visitBill.totalUgx - visitBill.paidUgx,
        paidAtBookingUgx: null,
      });
    }
    for (const b of m.bills) {
      if (b.kind !== "top_up" || !open(b)) continue;
      due.push({
        billId: b.id,
        kind: "top_up",
        onTheDay: true,
        toPayUgx: b.totalUgx - b.paidUgx,
        paidAtBookingUgx: visitBill?.paidUgx ?? 0,
      });
    }
  }

  const billById = new Map(m.bills.map((b) => [b.id, b]));
  const receipts: ReceiptLine[] = [...m.receipts]
    .sort((a, b) => a.number - b.number)
    .map((r) => {
      const b = billById.get(r.billId);
      const items =
        r.itemLabel === "Clinic visit" || !b || b.items.length === 0
          ? [{ label: r.itemLabel, amountUgx: r.totalUgx }]
          : b.items;
      return {
        id: r.id,
        number: r.number,
        hospital: m.hospitalName,
        issuedAt: kampalaStamp(r.issuedAtIso),
        items,
        totalUgx: r.totalUgx,
        method: r.method,
        reference: r.reference,
        payer:
          r.payerUserId === null ? "hospital" : r.payerUserId === m.meUserId ? "you" : "household",
        forSomeoneElse: m.patientUserId !== null && m.patientUserId !== m.meUserId,
      };
    });

  const visitReceipt = visitBill
    ? (m.receipts.find((r) => r.billId === visitBill.id) ?? null)
    : null;
  const ref = visitReceipt
    ? (m.refunds.find((r) => r.receiptId === visitReceipt.id) ?? null)
    : null;
  const refund = ref && visitReceipt ? { status: ref.status, network: visitReceipt.method } : null;

  const paid = visitBill ? visitBill.paidUgx - visitBill.refundedUgx : 0;
  const canAskRefund =
    m.appointmentStatus === "cancelled" && paid > 0 && visitReceipt !== null && ref === null;

  let cancelRule: VisitMoney["cancelRule"] = null;
  if (UPCOMING.has(m.appointmentStatus) && paid > 0 && m.cutoffHours !== null) {
    const cutoff = new Date(new Date(m.startsAtIso).getTime() - m.cutoffHours * 3600_000);
    if (cutoff.getTime() > m.now.getTime()) {
      cancelRule = { paidUgx: paid, cutoffIso: cutoff.toISOString() };
    }
  }

  return { due, receipts, refund, canAskRefund, cancelRule };
}
