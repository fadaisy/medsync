import type { BookingReceipt } from "@/lib/booking";
import type { EdgeResult } from "@/lib/edge";
import { DEFAULT_TIME_ZONE, localDateKey } from "@shared/slots";

import { formatDateLong, formatTime } from "@/lib/booking";
import { callEdge } from "@/lib/edge";
import { supabase } from "@/lib/supabase";

/**
 * Gate E (ADR 0090) — the notification verbs and the waitlist, from the
 * phone. Every write is an Edge Function (`callEdge`); the reads are
 * PostgREST under RLS: `waitlist_entries` (own / created-by), and the
 * patient's own `notification_dispatches` (the cancelled-day payload).
 */

/* ─── confirm, rebook ─────────────────────────────────────────────── */

/** "Confirm I'm coming" — answers the T-24h request; no SMS fallback follows. */
export function confirmAttendance(
  appointmentId: string,
): Promise<EdgeResult<{ appointment_id: string; confirmed_by_patient_at: string }>> {
  return callEdge("pt-confirm-attendance", { appointment_id: appointmentId });
}

/** The T-24h request is open: confirmed, unanswered, inside the last day. */
export const CONFIRM_WINDOW_MS = 24 * 3_600_000;
export function confirmationPending(
  row: { status: string; confirmedByPatientAtIso: string | null; startsAtIso: string },
  now = new Date(),
): boolean {
  const startsMs = new Date(row.startsAtIso).getTime();
  return (
    row.status === "confirmed" &&
    row.confirmedByPatientAtIso === null &&
    startsMs > now.getTime() &&
    startsMs - now.getTime() <= CONFIRM_WINDOW_MS
  );
}

/** One tap onto the pre-selected next clinic day after the clinic cancelled a day. */
export function acceptRebooking(input: {
  cancelledAppointmentId: string;
  sessionId: string;
}): Promise<EdgeResult<BookingReceipt & { cancelled_appointment_id: string }>> {
  return callEdge("pt-accept-rebooking", {
    cancelled_appointment_id: input.cancelledAppointmentId,
    session_id: input.sessionId,
  });
}

/**
 * What the `session_cancelled` message told this patient: the next
 * equivalent day, read back from the dispatch row's payload so the screen
 * and the message agree. Null when no later day was open at the time.
 */
export async function fetchRebookingOffer(
  cancelledAppointmentId: string,
): Promise<{ sessionId: string; startsAtIso: string } | null> {
  const { data } = await supabase
    .from("notification_dispatches")
    .select("payload")
    .eq("kind", "session_cancelled")
    .eq("related_kind", "appointment")
    .eq("related_id", cancelledAppointmentId)
    .limit(1)
    .maybeSingle();
  const p = data?.payload as
    | { next_session_id?: string | null; next_session_starts_at?: string | null }
    | undefined;
  return p?.next_session_id && p.next_session_starts_at
    ? { sessionId: p.next_session_id, startsAtIso: p.next_session_starts_at }
    : null;
}

/* ─── the waitlist ────────────────────────────────────────────────── */

export interface WaitlistEntry {
  id: string;
  /** 'waiting' | 'offered' */
  state: string;
  serviceLineName: string;
  hospitalName: string;
  preferredFrom: string;
  preferredTo: string | null;
  offeredStartsAtIso: string | null;
  offerExpiresAtIso: string | null;
  /** The household member's label when the entry is for them; null = the patient's own. */
  forMember: string | null;
}

interface WaitlistRow {
  id: string;
  state: string;
  preferred_from: string;
  preferred_to: string | null;
  offered_starts_at: string | null;
  offer_expires_at: string | null;
  provisional_patient_id: string | null;
  service_lines: { name: string } | { name: string }[] | null;
  hospitals: { name: string } | { name: string }[] | null;
}

const one = <T>(v: T | T[] | null): T | null => (Array.isArray(v) ? (v[0] ?? null) : v);

/** The patient's live entries (own, and the ones they made for a member), oldest first. */
export async function fetchWaitlist(
  memberLabels: ReadonlyMap<string, string> = new Map(),
): Promise<WaitlistEntry[]> {
  const { data, error } = await supabase
    .from("waitlist_entries")
    .select(
      "id, state, preferred_from, preferred_to, offered_starts_at, offer_expires_at, " +
        "provisional_patient_id, service_lines(name), hospitals(name)",
    )
    .in("state", ["waiting", "offered"])
    .order("created_at")
    .overrideTypes<WaitlistRow[], { merge: false }>();
  if (error) throw new Error("Couldn't load your waiting list.");
  return (data ?? []).map((r) => ({
    id: r.id,
    state: r.state,
    serviceLineName: one(r.service_lines)?.name ?? "Clinic",
    hospitalName: one(r.hospitals)?.name ?? "Your hospital",
    preferredFrom: r.preferred_from,
    preferredTo: r.preferred_to,
    offeredStartsAtIso: r.offered_starts_at,
    offerExpiresAtIso: r.offer_expires_at,
    forMember: (r.provisional_patient_id && memberLabels.get(r.provisional_patient_id)) || null,
  }));
}

export function joinWaitlist(input: {
  serviceLineId: string;
  reason: string;
  preferredFrom: string;
  preferredTo?: string;
  forProvisionalId?: string;
}): Promise<EdgeResult<{ waitlist_entry_id: string; position: number }>> {
  return callEdge("pt-join-waitlist", {
    service_line_id: input.serviceLineId,
    reason: input.reason,
    preferred_from: input.preferredFrom,
    ...(input.preferredTo ? { preferred_to: input.preferredTo } : {}),
    ...(input.forProvisionalId ? { for_provisional_id: input.forProvisionalId } : {}),
  });
}

export function withdrawWaitlist(
  entryId: string,
): Promise<EdgeResult<{ waitlist_entry_id: string; state: string }>> {
  return callEdge("pt-withdraw-waitlist", { waitlist_entry_id: entryId });
}

/** "Take this place" — books through the core; the entry id is the idempotency key. */
export function acceptWaitlistOffer(
  entryId: string,
): Promise<EdgeResult<BookingReceipt & { waitlist_entry_id: string }>> {
  return callEdge("pt-accept-waitlist-offer", { waitlist_entry_id: entryId });
}

/**
 * "3:40 PM today" / "9:00 AM tomorrow" / "9:00 AM on Tuesday 22 September" —
 * when an offer closes, in full words, on the clinic's calendar.
 */
export function formatOfferExpiry(iso: string, now = new Date()): string {
  const day = localDateKey(new Date(iso), DEFAULT_TIME_ZONE);
  const today = localDateKey(now, DEFAULT_TIME_ZONE);
  const tomorrow = localDateKey(new Date(now.getTime() + 86_400_000), DEFAULT_TIME_ZONE);
  const when =
    day === today ? "today" : day === tomorrow ? "tomorrow" : `on ${formatDateLong(iso)}`;
  return `${formatTime(iso)} ${when}`;
}

/** "YYYY-MM-DD" on the clinic's calendar — the waitlist window's ends. */
export function ymd(at: Date): string {
  return localDateKey(at, DEFAULT_TIME_ZONE);
}

/* ─── push acks ───────────────────────────────────────────────────── */

/** The phone saw the push: stops the SMS fallback. Fire-and-forget; never throws. */
export async function ackNotification(dispatchId: string): Promise<void> {
  await callEdge("pt-ack-notification", { dispatch_id: dispatchId }).catch(() => undefined);
}

/* ─── SMS consent (PRD §5.2) ──────────────────────────────────────── */

/** True when a live `sms_communication` record exists for the signed-in patient. */
export async function fetchSmsConsent(): Promise<boolean> {
  const { data } = await supabase
    .from("consent_records")
    .select("id")
    .eq("consent_type", "sms_communication")
    .is("revoked_at", null)
    .limit(1)
    .maybeSingle();
  return !!data;
}

export function setSmsConsent(on: boolean): Promise<EdgeResult<{ on: boolean }>> {
  return callEdge("pt-set-sms-consent", { on });
}
