"use client";

import type { BookPay, BookSubmit, BookWho } from "@/components/tide/v2-book-web";
import type { PatientReasonCode } from "@/supabase/functions/_shared/sessions-sql";
import type { DayOption } from "@patient-core/book-days";

import { BookOnePage } from "@/components/tide/v2-book-web";
import { requestDayAction } from "@/lib/patient-web/book-actions";
import { payVisitAction } from "@/lib/patient-web/visit-v2-actions";

/**
 * W1 wired to the booking slice's own action (S9: the same rules, one idempotency key per attempt) and to
 * `pt-pay-intent` after the booking exists (PA2).
 */
export function BookV2({
  hospitalId,
  hospitalName,
  emergencyLine,
  who,
  reason,
  reasonLabel,
  days,
  savedMsisdn,
  submissionId,
}: {
  hospitalId: string;
  hospitalName: string;
  emergencyLine: string;
  who: BookWho[];
  reason: PatientReasonCode;
  reasonLabel: string;
  days: DayOption[];
  savedMsisdn: string | null;
  submissionId: string | null;
}) {
  const submit: BookSubmit = async ({ member, session }) => {
    const res = await requestDayAction({
      hospitalId,
      reason,
      note: "",
      idempotencyKey: crypto.randomUUID(),
      submissionId,
      forProvisionalId: member,
      sessionId: session.slot ? null : session.id,
      slot: session.slot ?? null,
    });
    return res.ok
      ? { ok: true, appointmentId: res.receipt.appointment_id, code: res.receipt.booking_code }
      : { ok: false, error: res.error };
  };
  const pay: BookPay = async (input) => {
    const res = await payVisitAction({ ...input, idempotencyKey: crypto.randomUUID() });
    return res.ok ? { ok: true, view: res.view } : { ok: false, error: res.error };
  };
  return (
    <BookOnePage
      hospitalName={hospitalName}
      emergencyLine={emergencyLine}
      who={who}
      reasons={[{ code: reason, label: reasonLabel }]}
      days={days}
      savedMsisdn={savedMsisdn}
      submit={submit}
      pay={pay}
      visitsHref="/patient/visits"
    />
  );
}
