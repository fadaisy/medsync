# ADR 0245 — Messages off the platform: place only, approved templates, a banned-term scan

**Status:** Accepted — 2026-10-11 (owner, also the CSO; [GATE A](../lab/phase-1/gate-a-proposal.md) D-LAB1-17, E-LAB1-05). Built on `feat/lab-safety-floor` behind `LAB_CRITICALS` and `lab_settings.sms_live`; migrations 0102–0106 are GATED and owner-applied. No clinical value is set by this decision.

## Context

An SMS or a realtime payload outside the app must not reveal a patient.

## Decision

1. An SMS takes only the kind of alert, the place and the lab's phone number (MS-1). Templates are per hospital
   (`lab_sms_templates.hospital_id`) and are used only once approved by two different people.
2. Every draft template, rendered for every fixture, is scanned for banned terms in CI. The scan is proven to fail on a
   fixture that names a patient (MS-2).
3. SMS is sent only when `lab_settings.sms_live` is on, from an approved template, to staff numbers. It is never sent for
   a restricted report (MS-3). The transport is a logging one until Africa's Talking is configured. Turning `sms_live` on
   is the hospital's confirmation that the staff numbers on file are right (there is no verification today).
4. The realtime payload is the alert id, its kind and a time, on the user's own topic (MS-4, migration 0106).
5. A delivery failure is an event (`notified … failed`), never a rollback (CA-3, S6).

## Consequences

No PHI leaves the platform by message. Push notifications are not built.
