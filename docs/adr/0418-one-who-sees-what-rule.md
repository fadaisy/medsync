# ADR 0418 — One "who sees what you log" rule

**Status:** Accepted — 2026-10-25 (GATE A, docs/patient-web/gate-a-proposal.md; signed by Fadhul, CSO, in chat: "do what's recommended"). Narrows ADR 0413 (move tracker, formerly 0354) until a monitoring engine and its consent exist.

## Decision

- What the patient adds under My health (conditions, allergies, family history) goes to the care team, unconfirmed until a clinician checks it (ADR 0414).
- Readings, medicines, mood, movement, food and water: "Only you. Show it at your visit."
- Visit records: you and the clinicians who treat you.
- The phone changes its words in the same release (its own PR).

## Open

Migration 0188 lets the care team read movement rows. Either the Move words say so, or 0188's care-team read is not applied. Until the CSO chooses, Move keeps the phone's current words as a draft.
