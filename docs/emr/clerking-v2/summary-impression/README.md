# Pack: clerking desk v2, Summary and Impression (steps 08 and 09)

**Built:** 28 Sep 2026, cloud session.
**Owner and CSO:** Usama Fadhul.

**Status:** draft. Nothing here is signed; nothing has been built in the repo.

## What is here

| File                                    | What it is                                                                                                                                                                                                                                                                                                                                               |
| --------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `PROMPT-CLERKING-SUMMARY-IMPRESSION.md` | The gated Claude Code build prompt (Phases 0 to 7, each ending in a STOP).                                                                                                                                                                                                                                                                               |
| `clerking-diagnosis-catalogue.v1.json`  | **MS-EMR-DX-CAT-001**, the diagnosis reasoning catalogue. Each profile holds suggested evidence for and against, what has not been asked or examined, tests to decide, must-not-miss, time-critical, onset, severity and problem-list behaviour. It also holds the differential suggestion rules, the engine rules, the composer and the open decisions. |
| `diagnosis-terms.v1.1-addendum.json`    | 187 proposed new terms for REF-DX-TERMS, in its exact shape. **ICD-11 codes are unverified** (see `CATALOGUE-REVIEW.md`).                                                                                                                                                                                                                                |
| `test-catalogue.v1.1-addendum.json`     | 62 proposed tests for the default test menu.                                                                                                                                                                                                                                                                                                             |
| `CATALOGUE-REVIEW.md`                   | Build counts, the ICD-11 check, the independent clinical review and what changed after it, and the gaps found in the history and examination catalogues.                                                                                                                                                                                                 |
| `prototype/`                            | `Prototype2.dc.html` (the design authority), `Prototype.dc.html` and the shared parts.                                                                                                                                                                                                                                                                   |
| `catalogue-build/`                      | The generator and validator. See "Rebuild" below.                                                                                                                                                                                                                                                                                                        |

## How it was made

1. **Mock-ups and prototypes.**
   - Three Summary directions and three Impression directions were mocked up.
   - The CSO chose Summary A (composed statement) with B's one-liner, and Impression B (reasoning board) with A's row fixes.
   - That became Prototype 1, then Prototype 2 (the detailed one).
2. **Catalogue.** Built over the repo's own ids:
   - REF-DX-TERMS (85 terms) plus the proposed additions;
   - the history catalogue (symptoms, red flags, past, family, medicines, social);
   - the examination catalogue (items, options, classifiers, vitals, REF-EX);
   - the test catalogue.
3. **Authoring.** Profiles were written by body system against a validator that resolves every id. The differential rules lift the 17 archived per-complaint lists (tag `archive/clerkship-v1`) without their scores.
4. **Review.** An ICD-11 code check and an independent clinical review followed; see `CATALOGUE-REVIEW.md`.

## Rebuild

```bash
cd catalogue-build
MEDSYNC_REPO=/path/to/medsync python3 extract_refs.py   # ids from the repo's catalogues
MEDSYNC_REPO=/path/to/medsync python3 build.py          # validates, writes out/, prints counts
```

## First message to give Claude Code

> Read `docs/emr/clerking-v2/summary-impression/README.md`, then the prompt. Run Phase 0 only (discovery, no product changes) and STOP.
