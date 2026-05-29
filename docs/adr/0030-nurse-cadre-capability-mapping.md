# ADR 0030 — Nurse cadre → capability mapping (clinical-safety artifact)

**Status:** Accepted — pending CSO sign-off (2026-05-27)
**Context:** [`docs/nurse-workspace-gate-a-proposal.md`](../nurse-workspace-gate-a-proposal.md). The doctor workspace established cadre-tailored capability + co-sign as the clinical-safety model (ADR 0027). This ADR extends the same model to nursing, grounded in UNMC structure + Ugandan ward practice. **The §2 matrix in the proposal is the source of truth and must be reviewed with a clinician (CSO) before any policy override or production go-live.**

## Decision

### 1. The in-charge is an overlay, not a cadre

"Nurse-in-Charge" / "Ward Sister" is **not** a UNMC cadre — it's a current `ward_in_charge_assignments` row that layers ward-management capabilities (assignment board, escalation queue, oversight reviews) on top of the nurse's actual cadre + grade (typically REGISTERED+). A registered nurse is in-charge today; tomorrow it might be a different nurse on the same ward. This avoids inventing a cadre that doesn't exist.

### 2. Grade-level overlay enforced in the application layer

`clinical_cosign_policies` is keyed by `cadre_code`, not `(cadre_code, grade_code)`. The seeded default for `NURSE` × `high_alert_med_administration` is `allowed` (the registered-level expectation). The application layer reads `staff_affiliations.cadre_grade_id`; if the nurse holds the `ENROLLED` grade, `high_alert_med_administration` downgrades to `cosign_required` and `independent_complex_procedure` to `blocked`. This keeps the policy table small while preserving the grade distinction operationally.

**If a hospital needs grade-level policy granularity** (e.g. registered midwives in maternity get high-alert allowed but registered nurses elsewhere don't), the additive answer is a `cadre_grade_code` column on `clinical_cosign_policies` — flagged but not built.

### 3. High-alert list ships with the prescribing engine

The default high-alert seed (insulin / opioids / anticoagulants / concentrated electrolytes / oxytocics / NMBs / chemo / paeds IV) is a clinical-safety list that belongs with the prescribing engine — that engine will populate `is_high_alert` on MAR rows from the formulary. Migration 0031 ships the **policy mechanism** (co-sign on `high_alert_med_administration`); the MAR row carries an `is_high_alert` boolean that the future prescribing engine populates per drug. For MVP the nurse manually flags high-alert via the form checkbox; the safety-routing fires regardless of source.

### 4. Co-sign vs single-RN check

Per ISMP guidance + the kickoff: enrolled-nurse high-alert administration **routes for co-sign** (a registered nurse or in-charge witnesses + approves; recorded as a `clinical_cosign_requests` row consumed by the future approve-and-administer flow). Registered-nurse high-alert administration uses a **single-RN check** (the form requires explicit 5-rights confirmation but no separate cosign row). Hospitals override per ward via `clinical_cosign_policies`.

### 5. "Complex procedure" is a coarse boolean today

The MVP scopes `independent_complex_procedure` as a single action_kind rather than per-procedure. When the future procedures-catalogue lands (catheterisation, blood transfusion start, NG tube insertion, etc.), this can become per-procedure granularity — additive, no schema change to the policy table beyond a procedure-name column.

### 6. Nurses never prescribe

The MAR consumes prescriptions; the doctor workspace's prescribing safety scaffold (ADR 0027) is the only path that creates them. For MVP the prescription seam is `prescription_id text` on MAR rows — null when freehand-recorded against the patient. When the prescribing engine lands, the column becomes a real FK with backfill.

## What this is NOT

- Not a substitute for ward policy. The defaults in §2 of the proposal are _defaults_; per-ward / per-department overrides live in `clinical_cosign_policies`.
- Not a substitute for clinical judgment. The matrix gates UI affordances and routes co-sign — it does not (and cannot) decide whether a specific administration is clinically appropriate.
- Not a full nursing observation set. `clinical_observations.observation_kind` covers the high-frequency bedside set today; specialty observation bundles (ICU, partograph, paediatric early warning) land with the specialty surfaces.

## Consequences

- The MAR's safety scaffold works end-to-end **without** a real prescribing engine — high-alert routing fires whenever the nurse flags it.
- Enrolled nurses can't independently administer high-alert meds (server-enforced via the Edge Function's cosign-routing branch). A senior nurse / in-charge approves before the MAR row lands.
- The in-charge surface (`/nurse/assignments`) only renders for current in-charge holders. Sidebar visibility AND server enforcement honour this.
- Future grade-level policy granularity = adding a `cadre_grade_code` column to `clinical_cosign_policies` (additive).
- Future per-procedure co-sign = a new policy column (additive).

## Related

- [ADR 0027 — Doctor cadre→capability mapping](0027-doctor-cadre-capability-mapping.md) — the parent pattern.
- [ADR 0028 — Patient access basis](0028-patient-access-basis.md) — nursing extends with `assigned` / `ward_census` / `in_charge` bases; audit log is shared.
- [ADR 0026 — Patient self-tracking](0026-patient-workspace-self-tracking.md) — flagged `clinical_observations` as the future clinician-recorded observation table; this ADR lands it.
