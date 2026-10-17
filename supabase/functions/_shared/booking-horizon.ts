/**
 * How far ahead a patient may see and hold a booking, in days (ADR 0344,
 * which widens ADR 0084 §8's 14 at the owner's request, 18 Oct 2026).
 *
 * One number for every surface that shows or takes a patient's day: the
 * clinicians' open slots (pt-bookable-clinicians), the request itself
 * (pt-request-appointment), how far clinic days are generated
 * (ha-upsert-session-template) and the phone's calendar. Zero imports, so the
 * Next app, the Deno functions and the phone all read the same file.
 *
 * ADR 0084 §8's evidence stands: 9.1% no-show at 0–2 weeks against 38.3% at
 * 6 months. Reminders and the confirmation request carry the longer horizon.
 */
export const PATIENT_BOOKING_HORIZON_DAYS = 60;
