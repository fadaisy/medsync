# ADR 0150 — Departments & services is the single editor of hospital structure

**Status:** Accepted — 2026-09-26. Signed under the owner's blanket GATE A sign-off (Fadhul, CSO and owner). Spec: `docs/hospital-services/gate-a-proposal.md`.

## Context

Departments, wards, clinics, tests and emergency values were edited in four places: the onboarding checklist, Scheduling, the hospital profile and seed data. Staff sign-up, triage queues, booking, ordering and the Emergency sheet each read a different subset, so an admin could not see what a patient or a clinician would see.

## Decision

1. `/hospital-admin/departments` becomes **Departments & services**, with seven tabs as sub-routes: Departments, Wards & beds, Clinics, Diagnostics, Emergency & support, Availability, Hours & places. The current tab carries the plum underline; on a phone the tabs become a `<select>`.
2. **Every write goes through one Edge Function, `ha-services-hub`,** as named ops (30). Each op runs Zod → auth → role → scope → `plan()` (reads only) → `recordSaAudit` first → `apply()`. Two existing functions are extended rather than duplicated: `ha-upsert-session-template` (clinic days) and `ha-set-hospital-emergency-settings` (non-routing fields only, such as coordinates).
3. **Other surfaces link here instead of editing.** The onboarding checklist's Departments and Wards tasks become links. The Services task is removed. The profile's emergency form shows the routing values read-only with a link (ADR 0158).
4. The shell gains an amber "unavailable" badge on the nav item and ⌘K groups for Departments, Wards, Clinics and Tests.

## Consequences

- One place to answer "what does this hospital run, where and when".
- `finaliseSetupAction` now requires a live start department (ADR 0152) instead of the old checklist department rows.
- The hub is large (seven views). Each tab is its own route, so a tab loads only its own data.
