# ADR 0153 — Heads and in-charges are effective-dated, with acting cover

**Status:** Accepted — 2026-09-26. Signed under the owner's blanket GATE A sign-off (Fadhul, CSO and owner). Spec: `docs/hospital-services/gate-a-proposal.md`.

## Context

Heads of department and ward in-charges change. Audit and the EMR need to know who held the role on a given day, and cover ("acting") is routine.

## Decision

- **`department_heads`**: `starts_at`, `ends_at`, `acting`. A partial unique index allows one open substantive head and one open acting head per department. A lab section's in-charge is the head of that unit.
- **Ward in-charge reuses `ward_in_charge_assignments`** (0031) plus `acting`. The index becomes `ward_in_charge_one_open` on (ward, acting).
- **Eligibility is a pure rule** (`headEligible`, `inChargeEligible`). The person must hold an active affiliation at this hospital. An in-charge must hold a nurse or midwife cadre (`NURSE_CADRE_CODES`).
- Ending a role sets `ends_at` and never deletes the row.

## Consequences

- A head can edit their own department (D-SVC-16): `update_department`, `add_unit` and availability reports are open to the current head, and the function checks the caller's open head row. There is no head-facing UI yet; this is a seam.
