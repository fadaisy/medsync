# CFC addenda v1.2 and v1.3: the migrations (proposal for the CSO)

For Fadhul (owner and CSO). Two additive, GATED seed migrations, so that clerking findings chart as facts instead of staying only in the signed note.

| Migration                             | What                                                                                                                                                   | Rows              |
| ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------- |
| `0082_cfc_v1_2_clerking_findings.sql` | The history addendum (`docs/emr/clerking-v2/cfc-v1.2-addendum.md`): one finding concept per catalogue symptom not yet charted, and two social concepts | 84 + 2            |
| `0083_cfc_v1_3_examination.sql`       | The examination addendum: finding, device, observation and history concepts from the examination token map, and `new_confusion` added to `obs.avpu`    | 165, and 1 answer |

**How they are made.** `scripts/emr/gen-seed.ts` generates both from signed data files (`data/emr/clinical-fact-concepts.v1.2.json`, `…v1.3.json`), as it generates 0072, and `tests/emr/seed.test.ts` holds every generated file byte-for-byte. 0072 is not touched: it is generated from v1 and v1.1 only, as shipped.

**Additive and re-runnable.** Inserts use `ON CONFLICT DO NOTHING`; the `obs.avpu` answer is added only if absent. No table, column or policy changes.

**Order.** Apply after 0076 (0082 uses the 17 symptom-catalogue codes 0076 adds; `symptom_code` references `symptom_catalog`), then 0082, then 0083. The history catalogue's 0076 must be applied before deploying clerking v2 anyway.

**Deploy safety.** The code that charts these concepts can ship before the migrations run: signing charts only concepts already seeded in `clinical_concepts` (M5) and keeps the rest in the note, as today.

## Decisions

| #   | Decision                                      | Recommendation                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| --- | --------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| M1  | Which concepts carry a symptom-catalogue code | **Only when the code means exactly that finding** (the v1.1 rule for broader screens). Applied to v1.2: 49 keep their code; 35 carry none because the code is a broader screen (23), covers two symptoms (10: rectal bleeding / black stools, urethral / vaginal discharge, hearing loss / tinnitus, sore throat / hoarse voice, muscle pain / weakness), or is narrower (change in periods → dysmenorrhoea). This also removes the seven duplicate codes that would break the 0071 unique index. The history token map sends those 35 symptoms to their own concept. |
| M2  | The history addendum v1.2                     | Sign the 84 findings and 2 social concepts as proposed (appendix A), with M1. Restricted classes map to `restricted` (H5).                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| M3  | The examination addendum v1.3                 | Sign the 165 concepts as proposed (appendix B), including 4 restricted (HIV-associated signs, Kaposi-like lesion, external genitalia, scrotum and testes), and `new_confusion` on `obs.avpu`. The ACVPU C interim (C kept in the set's context) then ends: C is written as `obs.avpu` `new_confusion`.                                                                                                                                                                                                                                                                |
| M4  | Qualifiers of presence findings               | **Make them readable.** Today the CFC read contract drops `qualifiers` from presence findings (central cyanosis, non-blanching, a lung zone), so engines cannot read them. Add `qualifiers` to the finding projection (read-only passthrough, catalogue option ids).                                                                                                                                                                                                                                                                                                  |
| M5  | Deploy order safety                           | Signing charts only concepts present in `clinical_concepts`; the rest stay in the note and are counted in the warning. One query per signing.                                                                                                                                                                                                                                                                                                                                                                                                                         |

**Signed:** Fadhul (owner and CSO), in session, 2026-09-28: M1 to M5 as recommended; both addenda as proposed.

## Built (2026-09-28)

| Piece                 | Where                                                                                                                                                                       |
| --------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Signed data           | `data/emr/clinical-fact-concepts.v1.2.json` (86 concepts, 49 with a code, 35 listed in `broaderRosScreens`), `…v1.3.json` (165 concepts, `answerExtensions` for `obs.avpu`) |
| Generator             | `scripts/emr/gen-seed.ts`: 0072 from v1 and v1.1 only (byte-identical), one migration per addendum, the typed registry from all four                                        |
| Migrations (GATED)    | `0082_cfc_v1_2_clerking_findings.sql`, `0083_cfc_v1_3_examination.sql`                                                                                                      |
| History token map     | `data/clerking/token-map.v1.json`: the 35 symptoms without a code map to their own concept (M1)                                                                             |
| Examination token map | `data/clerking/exam-token-map.v1.json` (141 items, 81 option-level findings); `lib/clerking/exam/commit.ts` charts from it by value type                                    |
| ACVPU C               | written as `obs.avpu` `new_confusion`; the loader still reads `acvpu` from a set's context for sets saved before                                                            |
| M4                    | `qualifiers` on findings (`FindingFact`, the projection, the schema); qualifiers may hold option lists                                                                      |
| M5                    | signing charts only concepts present in `clinical_concepts`; the rest stay in the note and are counted                                                                      |

**Verified:** PGlite replays every migration (0082 after 0076: codes resolve against `symptom_catalog`, one code one concept; both re-run as no-ops; `obs.avpu` gains the answer once); signing charts history (`sx.cough`) and examination findings (`sign.chest_crackles`) and never fails on a concept not yet seeded; the CFC round trip passes for all 455 concepts.

**Apply order (owner):** 0076 → 0082 → 0083, then deploy. Deploying first is safe (M5): findings stay in the note until the migrations run.

Appendix: `cfc-v1.2-v1.3-appendix.md` (generated).
