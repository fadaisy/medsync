# 0518 — Refunds need a second person; hospital cancellations refund automatically

Date: 2026-11-16 · Status: accepted (owner, in chat; GATE A signature pending)

## Decision

- **Patient cancellations:** cancelling a paid visit before the hospital's cut-off (24 hours by default) creates a refund **request**. The hospital's accounts supervisor (a new `hospital_designations` role) approves or declines it, and never the person who asked (PA6, D-PA-05).
- **Hospital cancellations:** when the hospital cancels (closure, holiday, doctor away without cover), the refund is approved automatically (D-PA-06).
- **Limits:** a refund never exceeds what is left on its receipt. Money goes back to the same Mobile Money once, and only after approval.
- **After the cut-off:** this is decided by D-PA-07, the owner's own choice; the recommendation is a 30-day credit, then a refund on request.

## Why

A refund moves money out of the hospital's account. A second person is the standard control. Automatic refunds for the hospital's own cancellations keep the patient from carrying the hospital's decision.
