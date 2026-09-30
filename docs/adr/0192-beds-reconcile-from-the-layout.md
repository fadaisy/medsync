# ADR 0192 — Beds reconcile from the published layout

**Status:** Proposed — 2026-09-29.

## Context

`hospital_beds` (0080) is the bed register: an optional list that may never hold more active beds than the
ward's `bed_count`. Bed ids are what an assignment, a handover or a report will point at. Publishing a layout
must turn its beds into register rows without losing any id, and without leaving the register half-changed.

## Decision

1. **The register stays the source of bed identity.** `hospital_beds` rows are never deleted. A bed removed
   from a layout is archived on publish.
2. **Matching.** Each bed in the published document is matched, in this order: by its `bedId`; else by its
   label to an active register bed nothing else claimed; else by its label to an archived bed, which is
   restored (archived labels stay taken in the register, and bed 5 coming back is bed 5); else a new row. The
   ids of new and restored beds are written back into the published document.
3. **What publish writes** (`publish_ward_layout`): position, rotation, room, label, type and services of
   every bed; `status: out` sets `closed_at` and `closed_reason`, `in` clears them; active beds missing from
   the document are archived; `hospital_wards.bed_count` becomes the number of beds in the layout (a closed
   bed still counts, as today). The previous published version becomes superseded.
4. **Refusals.** Archiving a bed with an open assignment is refused, naming the beds. The integrity checks
   (duplicate bed numbers, a bed on a bed) and an invalid document refuse too. Nothing else blocks (ADR 0196).
5. **One transaction.** The pure `reconcile()` (`lib/wards/reconcile.ts`) plans the change; one SQL function,
   `public.ward_layout_publish(jsonb)`, applies the plan in one transaction under row locks. It re-checks
   occupancy and the draft's revision, so a bed assigned between the plan and the write still refuses. Labels
   are moved through temporary values, so two beds may swap numbers. The deferred STR-5 trigger still holds at
   commit.
6. **The count for laid-out wards.** `bed_count` supersedes the manual count only for a ward with a published
   layout: there, the ward form shows the count as set by the layout, `generate_beds` is refused, and a bed
   cannot be restored from the archive by hand. Closing, reopening and renaming a bed in the register still
   work, and the next draft starts from the register's current labels and closures.

## Consequences

- Emergency capacity (ICU, HDU, isolation and NICU beds) and every other reader of `bed_count` stay right with
  no change.
- A register larger than a first layout loses beds to the archive on publish; the confirm step lists them, and
  _Start from the register_ lays every existing bed out first.

## Alternatives considered

- **Several supabase-js calls from the Edge Function:** no transaction; a failure halfway would leave the
  register and the count apart.
- **Keep `bed_count` manual and warn:** two numbers for one fact.
