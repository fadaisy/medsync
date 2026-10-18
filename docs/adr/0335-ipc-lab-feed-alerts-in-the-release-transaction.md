# ADR 0335 — The IPC feed raises alerts in the release transaction and shows the minimum dataset

**Status:** Accepted — 17 Oct 2026 (owner, also the CSO, signing Lab Phase 5 [GATE A](../lab/phase-5/gate-a-proposal.md) as recommended). Built on `feat/lab-beyond-lis`; migrations 0154–0157 are GATED and owner-applied.

## Context

Infection prevention needs to know within minutes that a released result needs precautions, without reading the whole chart.

## Decision

1. Alerts come from the signed alert list (IPC lead signs, a laboratory lead countersigns, the surveillance focal person checks the IDSR route). They are raised in the same transaction as the release (`raiseIpcAlerts`) or an outbreak referral; one alert per patient per condition per episode; an amendment that removes the answer closes it.
2. IPC sees the condition, two identifiers, the place and the precaution, not the result or the chart; a restricted class is opened through the alert only, and the view is recorded.
3. Only IPC's recorded action sets the patient flag (precautions started) or clears it (with a reason). Readmission and moves of a flagged patient raise an alert by trigger. Unanswered alerts escalate on the minute tick.
4. MedSync counts lab-confirmed results per IDSR item and epi-week; the focal person reports. Precautions are suggested text, never ordered.

## Consequences

Lane `lab-ipc` S11 to S20. "Live" is a page refresh (A21).
