# ADR 0107 — Resus Desk v2: episode lifecycle (phase, boarding, close-out, idle, administrative close)

**Status:** Accepted — 2026-09-24 (CSO decisions D14, D16 at GATE A; E4)
**Context:** v1 episodes had `state` (active | concluded | cancelled) but no way to finish one well: the close sheet
asked for a disposition only, there was no outcome, a patient waiting for a bed kept the desk "live", and forgotten
episodes ran on indefinitely (the live header read 112 days, P1).

## Decision

1. **`state` stays the lifecycle truth; a stored `phase`** (survey | arrest | post_rosc | boarding) says which mode an
   active episode shows. It is written in the same transaction as the event that changes it, and a
   projection-consistency test proves it equals what the timeline implies (E4). Transitions live in
   `lib/resus/closeout/lifecycle.ts` (LC-\*).
2. **Close-out sheet** (End resus): outcome (stabilised, sustained ROSC, ROSC not sustained, died after CPR, died —
   CPR not attempted, transferred out), level of care and destination (ADR 0108), a deterministic SBAR draft, and the
   encounter seam (open or link the encounter when the encounter engine is live, else `pending_encounter_handoff`).
   "End resus" mid-arrest never blocks — it opens at "How did the arrest end?". Closing writes the Utstein arrest
   records (ADR 0110).
3. **Boarding:** a destination with no bed moves the episode to `boarding` — a slim desk with a banner, vitals and
   notes; **Re-activate** returns it to the survey.
4. **Cancel** (opened in error) from any active phase with a reason.
5. **Idle:** `last_activity_at` is bumped by a timeline trigger (the audit trigger ignores that column). Idle ≥ 2 h
   is flagged amber on the board and header ("Needs closing"); at 12 h one `clinical_resus_idle` notice per episode
   goes to the in-charge (claim-then-send, so it is sent once); from 24 h an in-charge or head of department may
   **close administratively** with a reason (`closure_kind = administrative`). Nothing is ever closed automatically.
6. **After close** the episode is read-only (no post-close clinical addendum in v2, D16); the debrief and after-death
   tasks are separate records editable for 24 h.
7. **Legacy episodes** are backfilled (`last_activity_at`, `phase`) and otherwise untouched; idle ones surface under
   "Needs closing".

## Consequences

**Positive:** every episode ends with an outcome, a destination and a handover; forgotten episodes become visible and
closable by the right person; the board reflects reality. **Negative:** the 12 h notice is sent when the board is
rendered (only daily crons are available, Q5), so a hospital that never opens the board gets it from the daily sweep
only; post-close corrections need a new clinical-addendum decision.

## Related

`docs/resus-v2-gate-a-proposal.md` §1, §9; `lib/resus/closeout/{lifecycle,idle,handover}.ts`,
`app/nurse/resus/_v2/actions-closeout.ts`, `supabase/migrations/0068_resus_desk_v2.sql`, ADR 0046.
