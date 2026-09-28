# ADR 0176 — CFC addenda v1.2 and v1.3 as generated seed migrations; one code, one meaning

**Status:** Accepted — 2026-09-28. M1–M5 signed by the CSO (`docs/emr/cfc/cfc-migrations-proposal.md`).

## Decision

1. **Each addendum is signed data and its own generated migration.** `scripts/emr/gen-seed.ts` generates 0072 from CFC v1 and v1.1 only (unchanged, byte-for-byte) and one additive, GATED migration per addendum: `0082` (v1.2, clerking history) and `0083` (v1.3, examination). `lib/facts/catalogue.generated.ts` is the registry of all four. `tests/emr/seed.test.ts` holds every generated file.
2. **One code, one meaning (M1).** A concept carries a `symptom_catalog` code only when the code means exactly that finding. A broader screen, a code covering two symptoms, or a narrower code is listed in `broaderRosScreens` and the concept carries none; the clerking token map sends those symptoms to the concept itself. This keeps `clinical_concepts_symptom_code_uidx` and stops a broad token from charting a narrower finding.
3. **Answer extensions** (`answerExtensions`) add answers to existing concepts with an idempotent `UPDATE` (ACVPU C as `new_confusion`).
4. **Qualifiers are part of the finding contract (M4):** `FindingFact.qualifiers` carries the catalogue's option ids; observation and finding qualifiers may hold option lists.
5. **Signing charts only seeded concepts (M5):** one query per signing; the rest stay in the note and are counted. Code may therefore ship before the owner applies a seed migration.

## Consequences

- Apply order: 0076 → 0082 → 0083 (`symptom_code` references `symptom_catalog` codes that 0076 adds).
- Later addenda follow the same pattern: a data file, an `ADDENDA` entry, a generated migration.
