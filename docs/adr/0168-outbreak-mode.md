# ADR 0168 — Outbreak mode

**Status:** Accepted — 2026-09-27. GATE A D-CV-06, H6.

## Decision

1. **Storage:** `hospital_clinical_settings` (migration 0076, GATED), one row per hospital.
   - `outbreak_mode` with a required reason when on;
   - readable by the hospital's active clinical staff;
   - written only by the server (the hospital admin's profile page) and audited by `audit_log_changes`.
2. **While on:**
   - the clerking desk's outbreak screen fires: fever plus at least the referenced number of case-definition symptoms (WHO list, each group counted once);
   - contact with sick or dead animals counts as an exposure;
   - unexplained bleeding is screened.
3. **Always on, whatever the setting:** fever with contact, a burial or travel from an outbreak area.
4. **Who sets it:** the hospital admin, until an IPC focal-person role exists; that role then takes it over.

## Consequences

The VHF flags feed the notifiable-diagnosis confirm sheet and the IPC work. They never isolate or notify on their own.
