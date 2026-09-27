# Clerking desk v2 — gate record

Gate record for PROMPT-CLERKING-DESK-V2 on `feat/clerking-v2` (cut from `release/emr` at `1f5937c`).

## STOP 0 — Discovery and baseline (2026-09-27)

| Q | Answer |
|---|---|
| Q1 | `release/emr` is not in `main`, so the branch is cut from `release/emr`. `1f5937c` and `ab94c92` are live: production's only EMR draft uses `tpl.clerking.adult_opd` |
| Q2 | Route `app/doctor/encounters/[encounterId]/page.tsx` (flag-gated, lazy desk) → `_desk/desk-page.tsx` → `lib/emr/read/desk.ts` `loadDesk` (775) → `_desk/desk-client.tsx` (860) → `components/emr/desk/*` (sections 1078, model 755, desk-view 418, sign 372). Content: `NoteContent {header, sections{narrative, items, fields}}` (`lib/emr/note-rules.ts:29`), encrypted in `lib/emr/write/notes.ts:143` with revision concurrency. Templates and sign rules are data (`data/emr/note-templates.v1.json`, zod in `lib/emr/notes.ts`). Template choice: `templateFor` in `desk.ts:146` |
| Q3 | Vocabulary = `symptom_catalog` (0042 + 0045 seeds; 89 tokens) ∪ CFC finding concepts (35), merged by `loadFindingIndex` (`lib/emr/read/terms.ts:73`). Token map: 54 exact, 25 broader, 17 new (`catalogue-token-map.csv`) |
| Q4 | Chroma worktree: 299 uncommitted files; 152 of 154 Chroma colour tokens in its `globals.css`; not in `release/emr` |
| Q5 | Medication statements: no dose, frequency, adherence or detailed source (H1). Allergy manifestations use a 7-value CHECK (mapping H2). Family history only through `recordProblem.subjectRelation` (H3) |
| Q6 | `soc.tobacco` and `soc.alcohol` exist in CFC v1; there is no pack-years or drinking-pattern concept (H4) |
| Q7 | `scoreNews2` (`lib/triage/scoring/news2.ts:29`) and the bands (`lib/triage/constants.ts:28-114`) are pure and importable. Vitals render at `context-rail.tsx:67` and `sections.tsx:628` |
| Q8 | Flags are env vars per hospital (`lib/emr/feature.ts`). There is no hospital-settings table for the EMR (H6) |
| Q9 | `RestrictedMark` (`components/emr/chips.tsx:103`). Print is opt-in per restricted item (`print/_lib/load.ts:31`). Binary `sensitivity` (H5) |
| Q10 | axe-core ^4.13, vitest ^4.1.7 + jsdom. **No Playwright** (H7) |
| Q11 | Ctrl/⌘+Enter, `/`, `?`, `j`/`k` (`desk-client.tsx:260`, `model.ts:609`) (H9) |
| Q12 | Production: 1 EMR draft (Test Hospital-1, adult_opd), 0 signed EMR notes, 10 legacy clerkings, 2 NCD drafts |

**Catalogue** (checked by script):

- 96 symptoms, 65 families, 766 options;
- 13 review-of-systems groups placing 92 symptoms;
- 129 red flags (105 danger, 20 risk factor, 4 exposure);
- 75 rules (44 urgent), 19 reference entries, all resolved (none undefined, none unused);
- 19 sources, 7 verified;
- 51 rules rest only on unverified sources (CLINICAL-METHODS, OPERATIONAL or unchecked guidelines).

**Baseline:**

- about 4.1 screens at 1440 wide (3,688 CSS px, from the production capture of 27 Sep);
- 81 review-of-systems chips, all "Not asked", menstrual items shown to a man;
- the history is mostly typed;
- the full negative review takes 13 taps;
- NEWS2 is not shown.

**Failing tests:** `tests/clerking/baseline.test.ts` covers C2, C3 and C6: 3 of 3 expected to fail. They are `it.fails`, so the suite stays green and each flips when fixed.

**Proposal for GATE A:** `gate-a-proposal.md`, with harmonisations H1–H12 and appendices A–C generated from the catalogue.
