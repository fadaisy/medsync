# ADR 0155 — Confidential clinics are never named outside the hospital

**Status:** Accepted — 2026-09-26. Signed under the owner's blanket GATE A sign-off (Fadhul, CSO and owner). Spec: `docs/hospital-services/gate-a-proposal.md`.

## Context

An SMS that says "your HIV clinic appointment" discloses a diagnosis to whoever reads the phone.

## Decision

- Confidential is **on by default** for HIV/ART, TB, mental health, family planning and SRH (catalogue A.2). An admin can change it per clinic, and the panel says "Patient messages won't name this clinic."
- The USSD directory and the public capability profile leave confidential clinics out. The network profile names them only as "Clinic" (ADR 0159).
- Booking messages already honoured `service_lines.confidential`. That is unchanged.

## Consequences

- Confidential clinics are bookable by their own patients and by staff, but never advertised.
