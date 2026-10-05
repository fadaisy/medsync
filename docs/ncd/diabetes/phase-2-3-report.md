# Phases 2 and 3: the engine and the content, in shadow (STOP 2, STOP 3)

Signed at GATE A on 2026-10-05 for the shadow build (`gate-a-signoff.json`). Nothing here is shown to a clinician.

## How the pack lives in the repo (a harmonisation, recorded)

The prompt describes merging the pack into the v0.1.0 catalog object. Phase 0 showed why that would break both: the live evaluator differs from the pack's on `atLeast`, blocking caveats, `notWhen`, dark items, pregnancy, ages and folding, and 94 of 192 pack features do not exist live. So the pack lives **beside** the live catalog:

| | Live v0.1.0 (`lib/ncd/catalog`, `lib/ncd/engine`) | Pack 0.4.0-draft (`lib/ncd/pack`, `data/ncd/diabetes-pack.json`) |
|---|---|---|
| What runs it | The existing NCD clerkship surface (`NCD_CLERKSHIP_LIVE`) | `runProtocol`, a line-for-line port of the pack's reference evaluator |
| Shown to | Whoever the live flag already shows it to | Nobody (shadow, `NCD_DM_PACK_SHADOW=1`) |
| Feature codes | Live codes | Pack codes; live capture is translated (`lib/ncd/pack/shadow.ts`) only where the meaning is the same |

The v0.1.0 catalog and its 100+ tests are untouched. Replacing the live surface's engine with the pack is the go-live step, with the Phase 0 rulings (P0-06, P0-07, P0-08, P0-13…) applied then.

## Phase 2: schema and evaluator

- `lib/ncd/pack/types.ts`: the pack's shape, with every GATE A schema extension (S-DM-02, 04–10, 12–16) typed under `x` as the pack writes it.
- `lib/ncd/pack/engine.ts`: four states with the signed `atLeast` rule (P0-04); direction-aware blocking caveats everywhere outside the acute lane (P0-05, N8); `notWhen`, `cautions`, `needsBeforeActing`; `enabled`/`enabledBy` (dark is reported, never shown); `requiresCapability`/`unlessCapability`; effective age bands from a numeric age (P0-01); pregnancy and postpartum unknown (D-DM-36); `lessTreatment`; target `supersedes` and band `forTarget`; one interrupt per event folded by `acuteOrder`.
- The pack's own builder now emits the runtime file the engine reads, so the Python reference and the TypeScript engine always run on the same data.

| Test | Result |
|---|---|
| Four-state truth tables (AND, OR, atLeast) | pass |
| Empty record fires nothing, stages nothing, bands nothing (both sites, four bands, established or not) | pass |
| Effective bands (16, 10–15, under 10) | pass |
| Dark items never in `fired` | pass |
| Flag-off behaviour | unchanged: the shadow hook is a no-op unless `NCD_DM_PACK_SHADOW=1` and the NCD flag are both on, and cannot fail a save |

## Phase 3: content, parity, mutation, shadow

- Content: pack 0.4.0-draft with the GATE A signatures applied (`tools/build/k_signed.py`): the Uganda criteria set from UCG 2023 as printed (default; WHO HEARTS-D alongside; either counts as met for referrals), UCG's gestational set beside WHO 2013 (default, P0-26), UCG risk-based pregnancy screening, UCG's post-meal target, the treatment-review prompts on (no dose) in UCG's words, the WHO PEN referral on, SGLT2/GLP-1 prompts at referral sites only.

| Acceptance | Target | Result |
|---|---|---|
| Vignette parity with the reference evaluator's `computed`, field by field (diagnosis per set, fired items with urgency, dark, withheld, bands, stages, risk, targets, classification, caveats, gaps, cautions, interrupt and folded actions, restricted classes, pregnancy state) | all | **165 of 165** |
| Mutation: removing any acute-route rule, red flag or blocking caveat changes at least one patient | all | **all** (the test first found 10 rules and 7 caveats no patient exercised; DMV-149 to DMV-165 added) |
| Escalation floor (D-DM-41) on the TypeScript engine: 25,088 men, 480 women | 0 / 0 / 0 | **0 below the floor, 0 noisy, 0 ordering faults** |
| N1 numeric predicates without a matching REF entry | 0 | 0 |
| N10 labels missing a number their predicates test | 0 | 0 |
| N5 strings that look like a dose | 0 | 0 |
| N9 restricted items without neutral text, or leaking a restricted word | 0 | 0 |
| N11 dark items without the decision that switches them on | 0 | 0 |

Shadow: on each NCD draft save, when `NCD_DM_PACK_SHADOW=1`, the pack runs on the translated capture and logs `ncd.pack.shadow` with the interrupt, fired rule ids and counts. No value and no free text is logged (tested).

## Checks

| Check | Result |
|---|---|
| `tests/ncd` + `tests/emr` | 55 files passed, 25 skipped; 3,511 tests passed, 390 skipped |
| Pack tests (`tests/ncd/pack-*`) | parity 165, engine, content, grid, mutation, shadow: all pass (about 4 s) |
| `npm run typecheck` | pass, with `NODE_OPTIONS=--max-old-space-size=6144`: the repo now exceeds the default heap on an 8 GB machine; the 1 MB pack is read from disk, not imported, to stay out of the type-checker and any bundle |
| eslint (changed files) | clean |
| Pack builder `build.py --check` | 0 errors, 0 warnings, 165 vignettes |

## Open, carried forward

- Go-live items: the tenth review's answers (V01–V16) need an independent read; the four-eyes second reviewer (D-NCD-17).
- `data/ncd/diabetes-pack.json` must be added to `outputFileTracingIncludes` for any route that runs the pack outside a server action's draft save (none yet).
- The live surface still runs v0.1.0; replacing it is the go-live step.
