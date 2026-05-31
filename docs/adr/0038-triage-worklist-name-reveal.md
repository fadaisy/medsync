# ADR 0038 — Patient names are revealed (audited) on the triage worklist

**Status:** Accepted — CLINICAL-SAFETY / PRIVACY artifact, pending CSO sign-off (2026-05-31)
**Context:** The triage worklist originally showed `patient_code` only — names stayed encrypted, surfaced solely through the per-patient audited decrypt (`fetchNursePatientSummaryAudited`). The CSO requested that patient **names** appear on the worklist (alongside the code) so triaging staff can identify the person in front of them. Names are PHI (AES-256-GCM at rest); revealing them is a privacy-boundary change, so it is recorded here.

## Decision

The triage worklist decrypts and shows each identified patient's name. This is gated and audited:

1. **Access is gated first.** `requireTriageScope` admits only a clinical cadre scoped to the hospital + department, with `triage_patient` authority. The worklist only lists patients with an **open intake (`awaiting_triage` / `arrived` / `triaged`) in that clinician's department** — the legitimate clinical basis for identifying them.
2. **Decryption is server-side only.** Names are decrypted in `fetchTriageWorklist` (server-only) via `lib/encryption.decrypt`; ciphertext never reaches the browser. A decrypt failure logs and falls back to code-only (never crashes the list).
3. **Every reveal is audited.** One `clinical_phi_access_log` row per identified patient shown, `access_basis = 'department_recent'`, `surface = 'triage_worklist'`, attributed to the triaging clinician. The forensic trail is complete.
4. **Unidentified patients stay unnamed.** Emergency walk-ins with only a `patient_unknown_label` (no profile) show that label; nothing is fabricated.

## Why this is acceptable

- Triage is an inherently identifying clinical act — you cannot safely triage an anonymous code. Knowing who you are assessing is the legitimate purpose.
- The patient is, by construction, in the triaging clinician's own department awaiting (or having had) triage — the tightest possible scope.
- The reveal is fully audited at per-patient granularity, so the access is accountable, not silent.

## The deviation, stated plainly

This departs from the prior "lists are code-only; names only behind a per-patient click" convention (the doctor/nurse panels still follow that). The triage worklist is the one surface where list-level name reveal is justified by the clinical task. We do **not** generalise this to other lists.

## Consequences

**Positive:** triaging staff identify patients directly; the audit trail captures every reveal; access is department-scoped + authority-gated.
**Negative:** the worklist generates one PHI-access-log row per identified patient per load (acceptable volume — a department's triage queue is small; the audit is the point). If a department's queue ever grew large, this would be revisited (e.g. reveal-on-expand). No migration needed — the existing `clinical_phi_access_log` + `department_recent` basis are reused.

## Related

- ADR 0028 (patient-access-basis — the audited-decrypt model this conforms to)
- ADR 0035–0037 (the triage engine + authority)
- `lib/triage/worklist.ts` (the audited reveal), `lib/encryption.ts`, `clinical_phi_access_log`
