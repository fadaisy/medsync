# ADR 0248 — Downtime: reserved form numbers, back-entry with the form's times, and drills

**Status:** Accepted — 2026-10-11 (owner, also the CSO; [GATE A](../lab/phase-1/gate-a-proposal.md) D-LAB1-23, E-LAB1-06). Built on `feat/lab-safety-floor` behind `LAB_DOWNTIME`; migrations 0102–0106 are GATED and owner-applied. No clinical value is set by this decision.

## Context

When MedSync is down the lab works on paper. A back-entered result that carries the entry time misleads the ward about
when the value was true.

## Decision

1. A downtime period is a record (start, end, reason), entered afterwards (DT-1).
2. Printed forms are numbered from a run reserved on the server first, under an advisory lock. Two printers never share
   a number, and a number is entered once (DT-2, S37, S39). One form per A4 sheet, print CSS only, black on white.
3. Back-entry keeps the form's collection and result times, who released it on paper, the server's entry time and the
   form number. The report's effective time is the collection time. The doctor's review reads "Entered after downtime ·
   Resulted 11:41 · entered 12:21 · paper form DT-00001" (DT-3, S38).
4. A future time is refused. A time outside a recorded downtime needs a reason (DT-4, S40).
5. With no MedSync order, the paper request is transcribed on the patient's open visit as the named requesting
   clinician's order, intent `downtime_form`. A patient with no visit here must be registered at reception first (S43).
6. Ranges and limits in force at the form's collection are applied (DT-5, S42). A paper critical phoned with read-back
   is created acknowledged by phone at the call's time. With no call, a live alert opens (DT-6, S41).
7. Turnaround and Released today use the form's times (DT-7). A drill writes a drill record and nothing else (DT-8, S44).

## Consequences

The paper itself can still be lost (hazard 18, medium). The count of printed forms not yet entered is shown in the
navigation.
