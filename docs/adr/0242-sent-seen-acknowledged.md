# ADR 0242 — Critical alerts: sent, seen and acknowledged, and only an acknowledgement closes one

**Status:** Accepted — 2026-10-11 (owner, also the CSO; [GATE A](../lab/phase-1/gate-a-proposal.md) D-LAB1-01 to D-LAB1-04, D-LAB1-06, D-LAB1-14, D-LAB1-29). Built on `feat/lab-safety-floor` behind `LAB_CRITICALS`; migrations 0102–0106 are GATED and owner-applied. No clinical value is set by this decision.

## Context

"Sent" is easily read as "the doctor knows". It does not mean that, and neither does "opened".

## Decision

1. An alert is **open** (sub-state sent, not sent, or escalated to a level) or **acknowledged**. No other state can be
   represented (a DB CHECK, CA-2).
2. **Seen** is recorded once per recipient when they open the detail. It is never shown as an acknowledgement; the lab
   still reads "Sent · waiting" (CA-5).
3. Only an acknowledgement closes an alert, by a clinician who may order at the hospital (nurses never). It records the
   actor, the time, the response and an optional note, and it writes the report's review row (CA-6, CA-7, CA-12). A
   double tap returns the first acknowledgement (CA-8, S10).
4. **Phone:** a call logged with read-back to an ordering clinician acknowledges by phone at the call's time (CA-9). The
   doctor sees "The lab recorded your phone acknowledgement…" and can say "Not me", which reopens the alert at its level.
   A phone acknowledgement is not the doctor's review of the report. A call to a nurse is "Ward informed. The clock keeps
   running." (S8).
5. **Corrections:** amending an alerted result opens a linked correction alert to every earlier recipient and the
   acknowledger. It needs its own acknowledgement (CA-10, S12).
6. A repeat critical for the same patient and test is a new alert (CA-13). A deceased patient's alert is still created
   and routed (CA-11).
7. Batch acknowledgement on Results to review skips any report with an open alert.
8. Who sees an alert: its recipients, and any ordering clinician with an access basis for the patient (D-LAB1-29).

## Consequences

- No screen says or implies the doctor knows before the acknowledgement (copy in `content/lab-criticals.ts`, draft until
  the CSO signs Appendix A).
- One tap for a doctor to acknowledge; Acknowledge sits in a 48 px footer on phones.
