# ADR 0173 — The intimate-examination gate and restricted genital findings

**Status:** Accepted — 2026-09-28. E7, D-EX-12, HX10, TM2 signed by the CSO.

## Decision

1. **Rectal and genital items are locked** (`inert`, announced "locked, needs consent and chaperone") until the gate records a reason, consent (verbal, or a best-interests decision) and a chaperone (offered and present with name and role, offered and declined, or not offered in an emergency). A relative may stay but is not a chaperone. A refusal offers "Not examined: patient declined".
2. **No new table or migration.** The gate record lives in the draft; the save that records it is audited by the `clinical_notes` audit trigger (actor and time); signing writes it into the note ("Chaperone: Sr N. Akello, nurse. Verbal consent.").
3. **Restriction.** Genital findings are `sexual_reproductive_health`; rectal findings stay standard. TM2 also restricts Kaposi-like lesions wherever recorded, testicular atrophy, "responding to unseen stimuli", and the history's scrotal symptom. Restricted items and options carry a lock, appear in clinical views only, and never reach patient-facing text (composer property test).

## Consequences

- A readable "gate completed" event would need a new `clinical_note_events.kind` (a CHECK change); not taken.
