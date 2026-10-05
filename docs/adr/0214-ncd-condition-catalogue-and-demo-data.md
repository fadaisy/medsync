# ADR 0214 — A condition catalogue as data, and a removable demo data mode

**Status:** Proposed — 2026-10-05. NCDSync build (§5.6, §10).

## Decision

1. Conditions are records in a versioned catalogue: two full modules (rule-based outcomes) and eight core modules
   (clinician-recorded control, nothing derived). Adding a condition needs a catalogue record and nothing else; a test
   takes a throwaway module through registration, a visit, the generic indicators and the visit form. A test also fails
   if any registry code outside the standard names a condition code as a string literal.
2. A draft core module can be enabled only before go-live; after go-live only an approved one can (server and trigger).
3. Demo data is written from the catalogue file through the normal command path as the `demo_loader` principal (the
   switching user's authority, confined to synthetic rows by policy). Command ids are UUID v5 of (load, key, position), so
   a replay is a no-op. Removal deletes every record of the load's synthetic persons in one transaction and verifies none
   remain; no human role can delete, and a trigger refuses deleting any non-synthetic person's row. The audit log keeps its
   entries. Condition settings return to what they were.
4. Demo data turns on only before go-live; go-live is refused while any synthetic person exists; no SMS is ever sent to a
   synthetic person; no report can be signed while demo data is on; exports are marked or refused.

## Consequences

- A facility can preview every screen on realistic data and remove it without residue before patient data arrives.
