# GATE A (Summary and Impression): proposal for the CSO

**Status:** awaiting signatures. Nothing clinical runs until signed (SI10). Companion files in this folder:

- `STOP-REPORTS.md`: Phase 0 discovery, baseline and counts;
- `signoff-pack.md`: every profile, rule, reference, scale, proposed term and decision, generated from the catalogue;
- `CATALOGUE-REVIEW.md`: the catalogue build's own review.

## 1. Port plan

| Piece              | Built as                                                                                                                                                                                       | Reuses                                                                               |
| ------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| Step 08 Summary    | `components/clerking/summary/summary-step.tsx`: one-liner, composed paragraph with step tags and the inspector, In my words, What goes in (three columns), Not asked yet, Not recorded, review | the v2 shell, `Chip`, `YesNoRow`, `StatusWord`, the history write path (`onHistory`) |
| Step 09 Impression | `components/clerking/impression/impression-step.tsx`: leading card (filled, deferred, empty), differential list, suggestions, also this visit, add                                             | `DiagnosisPicker` (extended with "Already on this visit" and "as typed, not coded")  |
| Evidence matrix    | `impression/matrix.tsx`: a real `<table>`, sticky first column, buttons in cells, arrow-key grid                                                                                               | nothing (new)                                                                        |
| Details drawer     | `impression/details.tsx`: `EmrDialog` in its right-hand variant on desktop and a full-height sheet on a phone                                                                                  | `EmrDialog`                                                                          |
| Note blocks        | `summary` and `impression` block keys in `lib/clerking/compose.ts`; `SECTION_BLOCK.summary = "summary"`                                                                                        | the note pane                                                                        |
| Engines (pure)     | `lib/clerking/summary/{compose,review}.ts`, `lib/clerking/impression/{catalogue,board,evidence,suggest,ask,compose,basis}.ts`                                                                  | the one condition evaluator (`lib/clerking/exam/context.ts` `evalCond`), extended    |
| Catalogue          | `data/clerking/clerking-diagnosis-catalogue.v1.json` + `dx-signoff.v1.json`, served at `/api/clerking/dx-catalogue?v=<sha16>`                                                                  | the loader and route pattern of the other two catalogues                             |

**Drawer placement.** ADR 0161 says pop-ups are centred dialogs and nothing slides in from an edge except the phone menu. The prompt's drawer (380 px over the note column) is an edge sheet. **Proposed (D-SI-16):** the Details panel replaces the note column's content in place (the note column is already the right-hand column) with a back control, so nothing slides over anything; on tablet and phone it is the centred `EmrDialog` (`sheet="tall"` on a phone), as every other pop-up.

## 2. Payload (draft `schema: 2`)

```ts
summary?: {
  mode: "composed" | "words";
  words?: string;                       // ≤ 20 000
  syndrome?: string;                    // ≤ 120, never parsed
  include?: Record<FindingRef, boolean>;// only where it differs from the default
  review?: { by: string; at: string; inputsHash: string; snapshot: SummarySnapshot };
};
impression?: {
  order: string[];                                  // condition logical ids, differential
  likelihood: Record<string, "likely" | "possible" | "unlikely">;
  reasons: Record<string, string>;                  // must-not-miss marked unlikely
  evidence: Record<string, Record<FindingRef, "for" | "against">>; // accepted only
  meta: Record<string, { onset?: string; severity?: string; reasoning?: string }>;
  catalogueVersion: string;
};
```

`FindingRef` is a typed id: `sym.*`, `sym.*#<red flag>`, `ex.*`, `ex.*.<attr>=<option>`, `vs.*`, `pmh:*`, `fh:*`, `med:*`, `soc:*`. Never a label.

**Old drafts.** An s12 narrative opens in "In my words" with the text and "Continue in the composed format". s13 items render as today; nothing is migrated silently.

## 3. Server actions

| Action                         | Proposal                                                                                                                                                      |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `recordEncounterDiagnosis`     | add the duplicate guard (S-3): an active encounter diagnosis with the same `termId`, or the same normalised typed text, is `conflict` "Already on this visit" |
| `setLeadingDiagnosis` (new)    | one transaction, two versions: the old primary becomes secondary/differential, the chosen one primary/provisional                                             |
| `requestDiagnosisCosign` (new) | `confirm_diagnosis` on `clinical_cosign_requests` (migration **0084**, GATED); approval writes Final through `updateProblemStatus`                            |
| unchanged                      | `updateProblemStatus`, `markFactEnteredInError`, `saveNoteDraft` (payload gains the two sections), `signNote`, `placeOrders`                                  |

## 4. Decisions (Section 15 of the prompt, with the proposal's additions)

See the table at the end of `STOP-REPORTS.md` (STOP 1) for the signatures.
