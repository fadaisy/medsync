# ADR 0194 — Bed state and bed assignment

**Status:** Proposed — 2026-09-29.

## Context

There is no bed assignment or occupancy on `main`: no table has a `bed_id`. The live bed board needs each bed's
state, a way to put a patient in a bed and take them out, and a way for nurses to mark a bed as being cleaned or
held.

## Decision

1. **Five states, derived, in this order:**
   - **Occupied**: the bed has an open `bed_assignments` row (patient, optional encounter, started, by whom).
   - **Out**: the bed's `closed_at` (the register's closure, set by the layout or the register).
   - **Cleaning, Reserved or Free**: the latest `bed_state_events` row since the last assignment on that bed
     ended; with none, **Free**. Events are append-only.
2. **Integrity.** One open assignment per bed and one per patient (partial unique indexes). An occupied bed
   cannot be archived, closed or given another patient.
3. **Who may act** (`set_bed_state`, `assign_bed`, `release_bed` in `ha-services-hub`): the hospital admin
   (scoped) or a superadmin; the ward's in-charge or acting in-charge; a nurse with an open nursing assignment
   on that ward and an active nursing affiliation at the hospital. Nobody else, and nurses of another ward
   cannot. Out of service stays with the admin (the layout or the register). Reserved needs a reason.
4. **Assigning.** The board offers the ward's receiving intakes (`patient_intakes.receiving_ward_id`, open
   statuses) that have a patient and are not already in a bed; the intake's encounter is recorded when there is
   one. Releasing needs a reason and may set the bed to Cleaning or Free in the same step.
5. **What the board shows.** Every bed carries its state word (Occ, Free, Clean, Res, Out) as well as its
   tint: Occupied a teal tint, Free the card, Cleaning a sky tint (the "in progress" tag hue: workflow states
   are never red, amber or green, `DESIGN-medsync.md`), Reserved grey with a dashed edge, Out hatched. A patient
   shows only as name and MRN, to the hospital admin and that ward's staff.
6. **Live.** Changes to assignments, state events and closures broadcast `{ kind, ward_id, at }` (no patient
   data) on the private topic `ward-beds:<hospital>`, which hospital admins and active clinical staff of that
   hospital may join; a message re-reads the server. Without the channel the board re-reads every 15 s.

## Consequences

- Occupancy is now a real number with an engine; the hub's "no occupancy without its engine" test names the
  engine (`lib/wards/board.ts`).
- Admissions, transfers and discharges can later write the same two tables.

## Alternatives considered

- **A state column on `hospital_beds`:** loses who and when, and mixes register edits with ward work.
- **Occupancy from nursing assignments:** they pair a nurse and a patient, not a patient and a bed.
