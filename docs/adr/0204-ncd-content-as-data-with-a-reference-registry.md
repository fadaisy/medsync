# ADR 0204 — NCD clinical content as data, with a reference registry

**Status:** Accepted for the shadow build — 2026-10-05 (GATE A, `docs/ncd/diabetes/gate-a-signoff.json`). Go-live needs the
items under Consequences.

## Context

The diabetes knowledge pack (MS-NCD-DM-PACK-001) carries about 170 rules, steps and therapy flags, three
criteria sets and 351 numbers. Phase 0 showed it cannot be merged into the live v0.1.0 catalog
(`lib/ncd/catalog`): the two evaluators differ on `atLeast`, blocking caveats, `notWhen`, dark items,
pregnancy, ages and folding, and 94 of the pack's 192 features do not exist live.

## Decision

1. **The pack is data and lives beside the live catalog.** `data/ncd/diabetes-pack.json` is emitted by the
   pack's own builder (`docs/ncd/diabetes/pack-0.3.0-draft/tools/build`); `lib/ncd/pack/engine.ts` is a
   line-for-line port of the builder's reference evaluator. The Python and the TypeScript always run the same
   file, and the parity test holds them equal on every synthetic patient, field by field.
2. **One number, one place (N1).** Every threshold a predicate tests names a `REF-DM-*` entry in the pack's
   registry (`refs`): value, unit, the claim it was read from, its status and whether it still needs the CSO.
   A predicate with no entry, or an entry whose number is not in its quoted claim, fails the build.
   Labels state the numbers they test (N10).
3. **Read from disk, not imported.** The 1 MB file is read with `fs`, so it stays out of the type-checker and
   any bundle. A route that runs it lists it in `outputFileTracingIncludes`.
4. **Shadow first.** The pack runs on each NCD draft save only when `NCD_DM_PACK_SHADOW=1` and the NCD flag are
   on, logs ids and counts (`ncd.pack.shadow`), and cannot fail the save. Nothing is shown to a clinician.
5. **The formulary follows the pack's classes** (P0-22): `oral_glucose_lowering` becomes the parent of the
   biguanide, sulfonylurea, SGLT2, DPP-4 and thiazolidinedione classes, so existing links still list every
   drug; new names carry no dose.

## Consequences

- Changing a number is a one-entry edit in the pack, rebuilt and re-signed; nothing in TypeScript holds it.
- Two NCD engines exist until go-live, when the pack's engine replaces v0.1.0 on the live surface with the
  Phase 0 rulings applied.
- Go-live: an independent read of the tenth review's fixes (V01–V16), a four-eyes second reviewer (D-NCD-17),
  a vignette for each of the 51 items no synthetic patient fires (`docs/ncd/diabetes/phase-6/shadow-report.md`),
  and the 18 references still marked for CSO input.
