# ADR 0219 — A diagnosis shows its complications and what goes with it

**Status:** Accepted — 2026-10-08 (owner). Shows nothing until the CSO signs the association typing
(`data/clerking/dx-associations.v1.json`, review in `docs/emr/dx-associations-review.md`).

## Context

The owner: "a diagnosis can have associations, for example diabetes can come with its complications; let's add this
into the workflow". The diagnosis catalogue's `related` lists (1,377 pairs) are an untyped "see also" that mixes
complications, conditions that commonly co-exist, and alternative diagnoses; used as they are, step 09 would offer a
differential (pneumonia → TB, PCP) as an association.

## Decision (owner, 2026-10-08)

1. **Typing, signed by the CSO:** every `related` pair is a complication, goes with it, or excluded (an alternative,
   a cause, a placeholder, or ambiguous): 315, 152 and 910. No pair outside `related`. A draft typing offers nothing.
2. **Under each diagnosis on step 09,** an "Associated with …" fold lists its complications and what goes with it,
   each with what the record already supports (the profile's own `suggest_for`, judged as the evidence matrix judges
   it) or what would check for it (`tests_to_decide`). Supported first, then must-not-miss. Folded unless something
   is supported.
3. **Nothing is added by itself.** "Add" puts it on the visit as "Also this visit" and links it; "Link" links one
   already there.
4. **The link lives in this visit's Impression** (`meta.with` on the parent), not in the record: the note reads
   "Type 2 diabetes (…). With: diabetic retinopathy." and "Diabetic retinopathy, working, with type 2 diabetes."
   Both stay separate diagnoses. A record-level link can follow if this proves itself.
