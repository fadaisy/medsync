# ADR 0151 — One store per fact: the hub reuses the stores that already exist

**Status:** Accepted — 2026-09-26. Signed under the owner's blanket GATE A sign-off (Fadhul, CSO and owner). Spec: `docs/hospital-services/gate-a-proposal.md`.

## Context

The prompt proposed new tables for clinics, in-charges and emergency values. The repo already had stores for most of them, read by live features (booking, the nurse workspace, the Emergency sheet).

## Decision

One store per fact (gate-a-proposal §1):

- **Reused and extended:** `hospital_departments`, `hospital_wards`, `service_lines` (clinics), `session_templates` (clinic days), `ward_in_charge_assignments` (0031, plus `acting`), and the pathway columns on `hospitals`.
- **New:** `hospital_places`, `department_heads`, `hospital_beds`, `diagnostic_offerings`, `capability_values`, `availability_events`, `public_holidays`, `service_closures`, `hospital_services_state`.
- **Presets are data files**, not tables (ADR 0160).
- **Migration `0080_hospital_services_hub.sql` is GATED and additive.** It backfills every existing department as live, so no reader changes behaviour on apply.

## Consequences

- Booking, reception and USSD keep reading `service_lines`. They gain filters for live departments, `audience` and archive state, and nothing else changes for them.
- EMR (0071) joins its per-hospital test rows to `diagnostic_offerings` **by code** and reads availability through `getOrderingAvailability`. This was agreed with the EMR session and is reconciled at merge.
