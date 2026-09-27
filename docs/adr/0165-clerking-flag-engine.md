# ADR 0165 — The clerking flag engine: rule language, references, levels, badges, snapshot at signing

**Status:** Accepted — 2026-09-27. GATE A (D-CV-04, D-CV-05, D-CV-15).

## Decision

1. **Flags are decision support only.** They are derived from answers and never stored as facts; they never block, order, write to the plan or change triage.
2. **The rule language** (`lib/clerking/flags.ts`):
   - atoms and combinators as the catalogue defines them;
   - numbers only through `REF-FLAG-*` reference entries;
   - a rule fires only when it is signed and none of its references is withheld.
3. **NEWS2 is reused from the triage engine** (`lib/triage/scoring/news2.ts`), never re-implemented.
4. **Levels:** urgent means act during this visit; caution means address or plan.
   - Badges read as symptom words.
   - Badges with the same words merge, and the most severe level wins.
   - Risk factors and exposures never make a badge of their own.
   - Restricted flags show only to clinicians with access.
5. **At signing,** the badge list (text, level, rule ids) is written into the note's canonical content with the catalogue version, so the record shows what the clinician saw.
6. **The D-CV-04 corrections are in the catalogue as signed:**
   - (a) ACS on its features, not the pain score;
   - (b) any one cauda equina flag is urgent;
   - (c) the VHF screen does not wait for bleeding;
   - (e) NEWS2 ≥ 5 is urgent, with an emergency tier at ≥ 7;
   - (f) iron never silences melaena;
   - (g) only danger answers badge.

## Consequences

- All 75 rules are tested both ways, with positives and negatives generated from each rule's own condition.
- A recompute takes 0.25 ms (p95).
