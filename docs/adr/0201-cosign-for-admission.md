# ADR 0201 — Co-sign for an admission: proceed and request

**Status:** Proposed — 2026-10-03. **The owner's call.**

## Context

0030 seeds `clinical_cosign_policies` for `admit_patient`: interns and clinical officers `cosign_required`, medical
officers and above `allowed`. Nothing has ever raised such a request. Blocking an admission at night until a senior
signs would delay a bed for a sick patient.

## Decision

1. **The admission goes ahead** and, when the closer's cadre needs it, a `clinical_cosign_requests` row
   (`action_kind 'admit_patient'`, PHI-free payload `{ admissionId, encounterId }`) is raised in the same close. The
   dialog says "A senior co-sign will be requested." A warning, not a block, as ADR 0139's warnings.
2. **No policy row** for the cadre reads as `cosign_required` (request, never refuse).
3. The patient summary can be shared before the co-sign.
4. `discharge_patient` is for discharge from the ward (the follow-up prompt); going home from a visit raises none.

## Consequences

- Seniors see admissions to review in their co-sign queue with the other kinds.
