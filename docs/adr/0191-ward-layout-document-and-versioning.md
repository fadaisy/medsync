# ADR 0191 — The ward layout document and its versions

**Status:** Proposed — 2026-09-29.

## Context

The hospital admin draws each ward on a 2D floor plan (the ward builder, `docs/wards/ward-builder/`): beds as
they stand, walls, curtains, glass, windows and doors, rooms and bays, fixtures, and the services at each bed.
Publishing the plan makes its beds the ward's bed register and gives staff a live bed board on the same plan.
A plan is edited for a while before it is right, and wards change over the years, so the plan needs a working
copy and a history.

## Decision

1. **A layout is one JSON document per version**, stored in `ward_layouts`: the floor size, rooms, dividers,
   doors, fixtures and bed placements (`lib/wards/layout-schema.ts`, the shape in
   `supabase/functions/_shared/ward-layout.ts` so the Edge Function and the app validate with the same code).
   Walls and curtains have no identity anyone refers to, so they live in the document, not one row each; beds
   do, so a bed in the document carries its register id (`bedId`) once published.
2. **Units.** One grid cell is 0.5 m, recorded as `cell_mm = 500`. Every coordinate is a whole cell. The floor
   size is per ward, 4 to 60 m a side; the default floor (21 × 16 m) and every item size are prototype values,
   marked proposed.
3. **States.** Each version is `draft`, `published` or `superseded`. A ward has at most one draft and one
   published version (partial unique indexes). A new draft takes the next `version`; each save of the draft
   bumps its `revision`, and a save that names a stale revision is refused, so a second window cannot overwrite
   the first.
4. **Published is append-only.** Publishing turns the draft into the published version and the previous
   published into superseded; nothing else changes a published or superseded row, and neither can be deleted
   (a trigger). The draft is a working copy: it is saved as the admin works and is not written to the row-image
   audit log; each publish is (the admin, the time, the diff summary and the warnings that were shown).
5. **Limits.** At most 200 beds and 1,000 items in a layout; every coordinate inside the floor; keys unique.
6. **Rollout.** The builder, the board and the nurse bed board are behind `WARD_BUILDER` (`1`, or a list of
   hospital ids), off until the owner applies migrations 0090 and 0091. Off, every page is unchanged.

## Consequences

- Rendering a ward is one read; the plan is versioned without a table per shape.
- A query "which rooms have hand-wash" reads documents, not rows. Anything that must be queried across wards
  (bed services) is normalised instead (ADR 0193).
- History is kept for ever; nothing is lost when a ward is re-laid.

## Alternatives considered

- **One row per wall, room and fixture:** identity nobody uses, and a publish would rewrite hundreds of rows.
- **Only a published layout, no draft:** every drag would change the live board.
