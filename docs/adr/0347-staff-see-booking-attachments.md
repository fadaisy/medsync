# ADR 0347 — Staff see and play what a patient sent with a booking

**Status:** Accepted, 2026-10-18. Owner decision. It follows ADR 0345 (photos, videos and voice notes on "Ask for a day", migration 0172) and ADR 0346 (voice notes as wav).

## Context

Patients can send photos, short videos and voice notes with a booking. They were stored and readable under RLS, but no staff screen showed them.

## Decision

1. **Where.** The shared patient card (`PatientIdentityCard`) shows "Sent 2 photos · 1 voice note · View". The link opens the centred dialog (ADR 0161), with photos at size and the browser's own players for video and sound. This appears on:
   - reception's Expected page (both views, through `fetchExpectedArrivals`);
   - the doctor's pending and queue rails;
   - the clinician's schedule detail.

   In the clinician's list, each row is a button, so the card shows the words only. The calendar's event cards show nothing.
2. **Only with an audited reveal.** A photo or a voice identifies a person as surely as a name. So the files are attached only where the name came through the audited reveal:
   - `toPatientIdentity` attaches them only when `displayName` is set;
   - reception attaches them only after `auditNameReveals` succeeds.

   Where the audit fails, the files fail closed with the name.
3. **Signed for one hour.** `lib/scheduling/attachments.ts` reads `appointment_attachments` for appointments the loader has already scoped to the viewer. It signs each object with the service client for an hour. A failure logs, and the booking shows nothing attached; it never breaks the page.
4. **Descriptive only** (ADR 0095). Nothing orders, filters, flags or scores a booking by what was sent. The card states what came and nothing more.

## Consequences

- An open page's links stop working after an hour. A refresh signs them again.
- The files are not yet in the encounter record or the clerking desk. They are shown with the booking only.
