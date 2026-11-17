/**
 * The visit ticket's view of a booking, the same on the phone and the web (patient app v2 §5.3, W2; ADR 0420:
 * one rule, imported by both apps). Hospital time is Kampala, UTC+3 all year, so the ticket reads the same
 * wherever the device thinks it is. The payment line comes from the one payment status (PA5) or, before a bill
 * exists, from the fee quoted at booking.
 */
import type { BillStatus, Channel, Network, PaymentChip, TicketPayLine } from "./payments";

import { paymentChip, ticketPayLine } from "./payments";

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

export interface TicketView {
  hospitalName: string;
  hospitalInitials: string;
  day: string;
  dayLine: string;
  window: string;
  doctorTime: boolean;
  clinic: string;
  room: string | null;
  patient: string;
  block: string | null;
  pay: TicketPayLine;
  code: string;
}

/** The booking fields the ticket needs; both apps' rows have them. */
export interface TicketSource {
  startsAtIso: string;
  sessionId: string | null;
  arrivalWindowStartIso?: string | null;
  arrivalWindowEndIso?: string | null;
  departmentName: string;
  hospitalName: string;
  bookingCode: string | null;
  forMember: string | null;
  quotedFeeUgx?: number | null;
}

const WEEKDAY = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const MONTH = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];
export const WEEKDAY_SHORT = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"];

/** A Date whose UTC fields read Kampala wall-clock time. */
export const inKampala = (iso: string) => new Date(new Date(iso).getTime() + 3 * 3600_000);
export const kampalaClock = (iso: string) => {
  const d = inKampala(iso);
  return `${String(d.getUTCHours()).padStart(2, "0")}:${String(d.getUTCMinutes()).padStart(2, "0")}`;
};

/** "k7m42q" → "K7M 42Q": the desk code in two groups of three. */
export function groupCode(code: string | null): string {
  if (!code) return "—";
  const c = code.replace(/\s+/g, "").toUpperCase();
  return c.length === 6 ? `${c.slice(0, 3)} ${c.slice(3)}` : c;
}

export function payLineFor(
  quotedFeeUgx: number | null | undefined,
  pay: VisitPay | undefined,
): TicketPayLine {
  if (pay) {
    return ticketPayLine(
      {
        status: pay.status,
        totalUgx: pay.totalUgx,
        paidUgx: pay.paidUgx,
        refundedUgx: pay.refundedUgx,
      },
      pay.method && pay.receiptNumber !== null
        ? { method: pay.method, number: pay.receiptNumber }
        : null,
    );
  }
  return quotedFeeUgx && quotedFeeUgx > 0
    ? { kind: "to_pay", amountUgx: quotedFeeUgx }
    : { kind: "free" };
}

export function chipFor(
  quotedFeeUgx: number | null | undefined,
  pay: VisitPay | undefined,
): PaymentChip {
  if (!quotedFeeUgx && !pay) return "none";
  return pay
    ? paymentChip({ status: pay.status, totalUgx: pay.totalUgx }, pay.paidChannel)
    : "at_hospital";
}

export function ticketView(
  v: TicketSource,
  pay: VisitPay | undefined,
  patientName: string,
): TicketView {
  const d = inKampala(v.startsAtIso);
  const session = v.sessionId !== null;
  const window =
    session && v.arrivalWindowStartIso && v.arrivalWindowEndIso
      ? `${kampalaClock(v.arrivalWindowStartIso)} to ${kampalaClock(v.arrivalWindowEndIso)}`
      : kampalaClock(v.startsAtIso);
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
    pay: payLineFor(v.quotedFeeUgx, pay),
    code: groupCode(v.bookingCode),
  };
}
