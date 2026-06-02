# ADR 0044 — Resuscitation record: append-only, versioned, reconstructable

**Status:** Accepted — CLINICAL-SAFETY / medico-legal artifact (CSO authorised the GATE-A schema, 2026-06-02)
**Context:** The ABCDE resuscitation surface records, second-by-second, everything a team does during a resuscitation: assessments, actions, drugs (name+dose+route+time), fluids, procedures, vitals, decisions, role changes, mobilisation, the arrest seam. This is the medico-legal record for the debrief and any subsequent review — it must be impossible to silently edit or delete, and it must be reconstructable to its state at any past instant.

## Decision

A two-part record (migration `0038_resus_abcde.sql`):

1. **`resus_episodes`** — the mutable header (state, disposition, outcome, arrest stamp, links to triage_record / intake / patient / encounter). Normal update semantics + `set_updated_at` + the `audit_log_changes` trigger.
2. **`resus_timeline_events`** — the immutable log. **Hard append-only**: a `BEFORE UPDATE/DELETE` trigger raises (`resus_timeline_block_mutation`) AND `REVOKE UPDATE, DELETE` from PUBLIC/anon/authenticated — the same defence-in-depth as `sa_audit_log` (ADR 0007). A correction is a **new event** whose `supersedes_event_id` points at the row it replaces; the original is retained forever and only hidden from the active VIEW.

**Reconstruction is pure** (`lib/resus/timeline.ts`, 9 tests): `reconstructTimeline(events, {asOf})` derives the active view by hiding any event a later correction supersedes — and with `asOf` (system time) replays the record exactly as it stood at a past instant. Supersession is derived purely from `supersedes_event_id` pointers, so the table needs no mutable status column and can stay hard append-only. `recorded_at` (clinical/bedside time) and `created_at` (system/write time) are kept distinct.

**RLS:** SELECT scoped through the parent episode — superadmin, the patient, the recorder, and any active clinical staff at the episode's hospital (`cadres.is_clinical=true` keeps reception out). Writes are service-role only (server actions own authority + audit). PHI narrative is AES-256-GCM (`narrative_encrypted`); every write also lands an `sa_audit_log` row.

## Consequences

**Positive:** the resus record is tamper-evident and reconstructable for the debrief/medico-legal review; corrections are transparent (both versions preserved); the immutability mirrors a pattern already trusted in the codebase (sa_audit_log). **Negative:** "editing" is always an append (more rows); the active-view computation is in app code (pure + tested) rather than a DB view — chosen so the table can be hard-locked.

## Related

- `supabase/migrations/0038_resus_abcde.sql`, `db/schema/resus.ts`, `lib/resus/timeline.ts`, `lib/resus/record.ts`, `tests/resus/timeline.test.ts`
- ADR 0007 (audit append-only lockdown), ADR 0008 (PHI encryption); `docs/resus-abcde-gate-a-proposal.md` §B/§C
