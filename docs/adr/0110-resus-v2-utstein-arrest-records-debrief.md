# ADR 0110 — Resus Desk v2: Utstein arrest records and the team debrief

**Status:** Accepted — 2026-09-24 (CSO-signed `docs/clinical/resus-closeout-clinical-catalog.md` CO-UTS-\*,
CO-DBF-\*; D16, D25)
**Context:** In-hospital cardiac arrest outcomes in Uganda are largely unmeasured. Utstein-style reporting needs the
same core times and outcomes for every arrest, and teams improve through structured debriefs — v1 recorded neither.

## Decision

1. **Arrest records are a projection of the timeline** (`lib/resus/utstein/project.ts`): for each arrest sequence —
   time of collapse / recognition, CPR start, first rhythm, first shock, first adrenaline, airway, any ROSC,
   sustained ROSC (20 min), end of event, and the outcome at close. The projection is pure and runs on close-out; a
   missing value stays missing (never inferred).
2. **Immutable snapshots** in `resus_arrest_records`: a trigger rejects UPDATE and DELETE; a correction inserts a
   superseding row. Survival to discharge is left for the encounter to fill.
3. **The team debrief** (`resus_debriefs`, one per episode) is a separate record: per-arrest metrics from the record
   (CO-DBF-\*: time to first shock, first adrenaline and advanced airway; adrenaline intervals inside 3–5 min; CPR
   cycles closed on time; capnography use; reversible causes addressed; compressor swaps per check) plus what went
   well, what to improve, actions, equipment issues and a team welfare check; draft → submitted, immutable after
   submit, editable for 24 h after close. It holds no blame fields and names no patient.
4. **After-death tasks** (`resus_after_death_tasks`) are append-only history rows, latest per task wins, for 24 h.

## Consequences

**Positive:** every arrest yields a comparable Utstein core record and an optional debrief, from data the team
already entered. **Negative:** the Utstein 20-minute sustained-ROSC definition and the new-attempt rule were not
re-readable by automation and are to be re-read before go-live (D25); registry export is out of scope.

## Related

`lib/resus/utstein/project.ts`, `lib/resus/debrief/metrics.ts`, `app/nurse/resus/_v2/actions-closeout.ts`,
ADR 0104, ADR 0107.
