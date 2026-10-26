# ADR 0435: Renewal requests in the doctor's workspace

**Status:** Accepted, 26 Oct 2026. Pharmacy Phase 4 GATE A (signed by the CSO, D-PH4-29), Step 4.

## Context

A refill the repeats do not cover needs a prescriber's answer. It is not a task inside a visit, and it must not be lost or closed by a timer.

## Decision

- **Its own record.** `prescription_renewal_requests` (0230) has a reason, and its answers go in `prescription_renewal_events`: renewed, visit needed, declined or withdrawn. One answer closes it.
- **Its own lane.** The workspace's "Renewal requests" lane (key `r`) has its own flow source with no encounter. It is shown only with `PHARMACY_REPEATS` on and to a prescribing cadre. The page is `/doctor/renewals`.
- **Answered by someone who may prescribe:**
  - Renew places a new prescription on the source visit and links it;
  - Book a visit closes it as visit needed;
  - Decline needs a reason from the signed list.
- **Never closes by itself.** A request stays listed until it is answered.

## Consequences

- While the decline reasons are unsigned, Decline is absent.
- Renew needs an open visit for the patient.
