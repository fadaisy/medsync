# ADR 0181 — A junior's Final diagnosis is a co-signature request (`confirm_diagnosis`)

**Status:** Accepted — 2026-09-28. GATE A (summary and impression) signed by the CSO (D-SI-09, D-SI-23). Migration
0084 is GATED and applied by the owner.

## Context

A junior's "Final" was silently stored as Working (S-4): nobody saw that it needed a senior, and nobody was asked.

## Decision

1. **Visible and asked.** A junior who picks "Final (senior)" stores Working and opens a `confirm_diagnosis`
   co-signature request in the same transaction; the desk shows "Final · awaiting senior co-signature". For a
   diagnosis already on the visit, `requestDiagnosisCosign` opens it. One open request per diagnosis.
2. **PHI-free request.** The payload is the condition's logical id and the visit, nothing else.
3. **Who approves (D-SI-23).** A senior who passes both the co-signature inbox's seniority and final-diagnosis
   authority, never the requester. Approval writes a Final version and closes the request; Return needs a note and
   leaves it Working; entered in error cancels an open request.
4. **Migration 0084** adds `confirm_diagnosis` to the co-sign kinds. **Apply it before deploying**: without it the
   request is refused and a junior's Final fails (v1 and v2 desks alike).

## Consequences

- The co-sign queue shows "Final diagnosis" requests; a restricted one reads "Restricted diagnosis: open the visit to
  read it".
- A senior never asks; their Final is written directly.
