# Clerking desk v2 — gate record

Gate record for PROMPT-CLERKING-DESK-V2 on `feat/clerking-v2` (cut from `release/emr` at `1f5937c`).

## STOP 0 — Discovery and baseline (2026-09-27)

| Q   | Answer                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Q1  | `release/emr` is not in `main`, so the branch is cut from `release/emr`. `1f5937c` and `ab94c92` are live: production's only EMR draft uses `tpl.clerking.adult_opd`                                                                                                                                                                                                                                                                                                                                                                                                                   |
| Q2  | Route `app/doctor/encounters/[encounterId]/page.tsx` (flag-gated, lazy desk) → `_desk/desk-page.tsx` → `lib/emr/read/desk.ts` `loadDesk` (775) → `_desk/desk-client.tsx` (860) → `components/emr/desk/*` (sections 1078, model 755, desk-view 418, sign 372). Content: `NoteContent {header, sections{narrative, items, fields}}` (`lib/emr/note-rules.ts:29`), encrypted in `lib/emr/write/notes.ts:143` with revision concurrency. Templates and sign rules are data (`data/emr/note-templates.v1.json`, zod in `lib/emr/notes.ts`). Template choice: `templateFor` in `desk.ts:146` |
| Q3  | Vocabulary = `symptom_catalog` (0042 + 0045 seeds; 89 tokens) ∪ CFC finding concepts (35), merged by `loadFindingIndex` (`lib/emr/read/terms.ts:73`). Token map: 54 exact, 25 broader, 17 new (`catalogue-token-map.csv`)                                                                                                                                                                                                                                                                                                                                                              |
| Q4  | Chroma worktree: 299 uncommitted files; 152 of 154 Chroma colour tokens in its `globals.css`; not in `release/emr`                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| Q5  | Medication statements: no dose, frequency, adherence or detailed source (H1). Allergy manifestations use a 7-value CHECK (mapping H2). Family history only through `recordProblem.subjectRelation` (H3)                                                                                                                                                                                                                                                                                                                                                                                |
| Q6  | `soc.tobacco` and `soc.alcohol` exist in CFC v1; there is no pack-years or drinking-pattern concept (H4)                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| Q7  | `scoreNews2` (`lib/triage/scoring/news2.ts:29`) and the bands (`lib/triage/constants.ts:28-114`) are pure and importable. Vitals render at `context-rail.tsx:67` and `sections.tsx:628`                                                                                                                                                                                                                                                                                                                                                                                                |
| Q8  | Flags are env vars per hospital (`lib/emr/feature.ts`). There is no hospital-settings table for the EMR (H6)                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| Q9  | `RestrictedMark` (`components/emr/chips.tsx:103`). Print is opt-in per restricted item (`print/_lib/load.ts:31`). Binary `sensitivity` (H5)                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| Q10 | axe-core ^4.13, vitest ^4.1.7 + jsdom. **No Playwright** (H7)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| Q11 | Ctrl/⌘+Enter, `/`, `?`, `j`/`k` (`desk-client.tsx:260`, `model.ts:609`) (H9)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| Q12 | Production: 1 EMR draft (Test Hospital-1, adult_opd), 0 signed EMR notes, 10 legacy clerkings, 2 NCD drafts                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |

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

## STOP 1 — GATE A signed (2026-09-27)

Fadhul (owner and CSO) signed in session, as recommended:

- D-CV-01 to D-CV-16;
- D-CV-11 as **build on today's tokens; Chroma ships as its own release**;
- H1–H12, including migration 0076 (GATED);
- **all 75 flag rules and 19 reference values as drafted.**

The signature is recorded in `data/clerking/catalogue-signoff.v1.json`, pinned to the catalogue's SHA-256. The engine fires a rule only if it is signed there, and never if its reference is withheld (Law 7). The runtime catalogue is `data/clerking/clerking-history-catalogue.v1.json`, byte-identical to the handoff copy; a test holds them equal.

## STOP 2 — Catalogue and engines (2026-09-27)

**Built**, pure (no I/O) and shared by the server and the browser, in `lib/clerking/`:

| Module         | Job                                                                                                                   |
| -------------- | --------------------------------------------------------------------------------------------------------------------- |
| `catalogue.ts` | Zod schema, indexes, resolved property lists (overrides, extra families, extra properties, hidden), sex applicability |
| `answers.ts`   | Payload v2 answer model and its updates                                                                               |
| `linkage.ts`   | Linked answers, derived and never stored                                                                              |
| `flags.ts`     | The rule language; the sign-off gate; NEWS2 through `lib/triage/scoring/news2.ts`; badge merging                      |
| `compose.ts`   | The note, by the catalogue's composer rules                                                                           |
| `status.ts`    | Section and system statuses                                                                                           |

**Also:** the `npm run clerking:catalogue-check` script, which validates the schema, the sign-off hash and every id and reference, and prints the counts.

**Tests:** `tests/clerking/engines.test.ts`, **111 passing**, plus the 3 baseline `it.fails`.

- **Rule coverage: 75 of 75, both ways.**
  - 69 symptom rules get a positive and a negative case generated from each rule's own `when` tree, so coverage cannot fall behind the data.
  - The 6 record rules (medicines 1, allergies 2, vital signs 3) are written by hand.
- **Law 7:** a withheld rule, a withheld reference, or an empty sign-off fires nothing.
- **D-CV-04 corrections:**
  - (a) ACS regardless of the pain score, and 12–72 hours is caution;
  - (b) a single cauda equina flag is urgent;
  - (c) fever plus an exposure fires without bleeding, and animal contact only in outbreak mode;
  - (e) NEWS2 5 is urgent;
  - (f) iron never silences melaena;
  - (g) risk factors never make a badge;
  - restricted flags are filtered by access.
- **Property tests:**
  - linked answers and the review of systems never disagree (300 random histories);
  - every yes appears in the note and no not-asked item appears as a negative (150);
  - statuses are monotonic;
  - merging is idempotent.
- **Catalogue:** 96 of 96 symptoms render a property editor; adding a symptom to a fixture catalogue needs no code; the runtime catalogue is byte-identical to the handed-over copy and to the signed hash.
- **C2 and C3 are fixed in the engines:** a man sees no gynaecology and no menstrual items, and the complaint answers the review of systems.

**Recompute:** flags, badges, note and statuses for the chest-pain fixture take a p95 of **0.25 ms** (1.0 ms at a 4× throttle, against a 16 ms budget).

**Badges against the prototype, after the D-CV-04 corrections** (for you to confirm):

- **Patient Three-3**
  - urgent: Temperature 32.5 °C, **NEWS2 5** (urgent, was caution: correction e);
  - caution: Pain at night or at rest, Weight loss, **Change in bowel habit** (new: FLAG-BOWEL-CHANGE, NG12 FIT), Bone pain 7/10, Misses amlodipine.
- **Chest-pain variant:** all of the above, plus
  - urgent **Chest pain** (ACS features within the window, not the 10/10 score: correction a);
  - caution **Chest pain 10/10**, from FLAG-PAIN-SEVERE, which applies to every pain as the catalogue is written. It is shown separately because it has different words.

**Composer:** the house-style snapshots are in `tests/clerking/__snapshots__/engines.test.ts.snap`, for you to sign (D-CV-16). The fixes made while reading them:

- no capitals mid-sentence;
- "radiates to the …";
- properties a symptom adds carry their label ("last episode now");
- a symptom in two systems is written once;
- "(for example …)" hints are dropped from running text.

## Data and server layer (before any screen, Law 1) — 2026-09-27

**Built:**

- **Migration 0076 (GATED):**
  - medicine details (H1);
  - `hospital_clinical_settings` with RLS, audit and outbreak mode (H6);
  - 17 shared tokens (H10).
- **`tpl.clerking.adult_v2`** in its own signed file (H11), with the `history_complaint_present` check.
- **Payload v2** validated at the action boundary.
- **Signing commits:**
  - complaints and review-of-systems answers, with catalogue qualifiers;
  - `soc.tobacco`;
  - family history, one condition per relative, never `self`, written at signing (H13, a documented change from "at once").
- **`convertDraftToV2`,** for "Continue in the new format".
- **The `CLERKING_V2` flag.** The loader picks the v2 form and adds the record block (vitals for NEWS2, medicines with H1 fields, allergies mapped to catalogue reactions, outbreak mode).
- **The cached catalogue route.**
- **Outbreak mode** on the hospital admin's profile page, with a required reason, audited.

**Lane:** `tests/emr-db/clerking-v2.test.ts`, 6 of 6. Also green: scenarios, write-notes and drizzle-parity (170).

**Found and fixed on the way (pre-existing):**

- `deathsFor` ignored the lane database.
- Typed (uncoded) medicines read "Medicine not named" on the chart and the desk; the loader now decrypts names for rows the reader was shown.

**Charting:** 12 of 96 symptoms chart as facts, because the CFC has 35 finding concepts. The rest are kept in the signed note with their ids.

- **Proposed:** a CFC v1.2 addendum of 84 finding concepts plus `soc.tobacco_pack_years` and `soc.alcohol_pattern` (`cfc-v1.2-addendum.md`, `cfc-v1.2-proposal.json`), for your signature.

## STOP 3–4 — Shell, Complaint and History (2026-09-27, commit 815ca47)

**Built in `components/clerking/`:**

- the shell: safety bar with a NEWS2 chip, the section bar with statuses, the centre card with Previous/Next, and the left rail (NEWS2 per row, the score-3 message, missing inputs, "Record a new set");
- the Flags panel: octagon or triangle, "urgent" / "needs attention" names, merged badges, links to sections;
- the note pane: composer blocks, the current block marked, the edit lock;
- the sign bar;
- Complaint: historian, language and interpreter, cards, search over synonyms and local terms, quick picks, uncatalogued text;
- the PropertyEditor (every kind; exclusive options; tap again clears; the 0–10 strip in caution from the signed reference);
- History: the story and the also-asked rows;
- keys `[` `]` `1`–`0` `y` `n` `d` `/` `?` (with `j`/`k` kept);
- tablet and phone pop-ups (ADR 0161, no sheets);
- the "Continue in the new format" notice for v1 drafts.

**With the flag off,** the v1 `DeskView` path is unchanged (test).

**Tests:** 370 of 370 across tests/clerking, tests/emr/ui and tests/design.

- The C2, C3 and C6 baselines now pass; their `it.fails` markers are removed.
- Red scarcity: in the clerking components, red is allowed only in the Flags panel's urgent constant and the rail's NEWS2 score-3 constants, each paired with an octagon or a number.

**Budget:** the back-pain complaint takes **18 taps**, against a budget of 20.

**Open for Phase 7:**

- the browser check (no page scroll at 1440×900, screenshots against the prototype, axe);
- the sign dialog's count of v2 findings and step-status truncation (both handed to Phases 5–6).

## STOP 5–6 — Systems, the Details pop-up, Past, Family and Social history (2026-09-27, commit c62465f)

**Built:**

- **Systems.** Rows by system are sex-appropriate, with statuses in words and a summary line.
  - "Nothing else" skips linked items.
  - Linked items are read-only and open the complaint.
  - "Add details" / "Details" with a one-line summary.
  - The centred pop-up ("Review of systems · {system}", the symptom, its summary, the patient's name and MRN, the property editor, "Change the answer to no", "Done") traps focus and returns it.
- **Past history:**
  - conditions with "known for" and "Confirm on the problem list" (D-CV-09);
  - operations and transfusions;
  - medicine cards, which write through the record at once (`recordMedicationStatements`, `updateMedicineDetails`, a stop with a reason);
  - allergy cards: reaction, severity and source write new versions; "Code it"; "Not an allergy" with a reason; "Still true today"; NKDA.
- **Family:** conditions and relatives, committed at signing (H13).
- **Social:** tobacco with derived pack-years, alcohol, other substances (locked), living, activity, occupation, travel and diet.
- **The sign pop-up** now counts what a v2 note commits, and step statuses wrap instead of truncating.

**Deviations, accepted:**

- The restricted quick picks (antiretrovirals, TB treatment, co-trimoxazole) write restricted rows. Law 10: the medication line gained a flag that can only raise sensitivity.
- "Code it" saves the coded allergy first, then marks the uncoded original entered in error as a duplicate, so a failure leaves both listed, never neither.
- "Not known" records no reaction.

**For you to sign:**

- the "Not an allergy" reasons ("Has taken it since without a reaction", "A side effect, not an allergy", "Recorded in error", "Other");
- the composer sentence "No regular medicines, including herbal."

**Law 10, print:** no printout carries note content; a test scans every print route.

**Budget:** a full negative review of systems takes **12 taps**, against a budget of 13 or fewer.

## STOP 7 — Hardening, final (2026-09-27)

Measured in a production build of the branch (the scratch harness mounts the real desk client with the Patient Three-3 fixture; writes are blocked).

### PROMPT §14 — final numbers

| Metric                                                                    | Baseline (P0)                                       | Target              | Result                                                                                                                            |
| ------------------------------------------------------------------------- | --------------------------------------------------- | ------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| Page-level scroll at 1440×900                                             | about 4.1 screens (3,688 CSS px)                    | none                | **0 px** on every section, light and dark (1440×900 and 1440×1024)                                                                |
| Sex-inappropriate review-of-systems items shown                           | menstrual items shown to a man (C2)                 | 0                   | **0**: engine and view tests; the C2 baseline now passes                                                                          |
| Complaint and system disagreements possible                               | yes (C3)                                            | 0                   | **0**: linked answers are derived (property test, 300 random histories)                                                           |
| Required keystrokes, Complaint to Social (standard visit, story excluded) | the complaint's duration and the history were typed | 0                   | **0**: every required answer is a tap (quick pick, chips, steppers)                                                               |
| Taps, full negative review of systems                                     | 13                                                  | ≤ 13                | **12** (one "Nothing else" per system shown to a man)                                                                             |
| Taps, back-pain complaint with properties                                 | —                                                   | ≤ 20                | **18**                                                                                                                            |
| Standard visit time, clinician trial median                               | not measured                                        | lower than baseline | **Not run:** needs 3–5 clinicians (protocol in `clinician-trial.md`)                                                              |
| Catalogue symptoms rendering a property editor                            | —                                                   | 96 of 96            | **96 of 96**                                                                                                                      |
| Flag rules with positive and negative tests                               | —                                                   | 75 of 75            | **75 of 75**                                                                                                                      |
| Rules firing with an unsigned reference                                   | —                                                   | 0                   | **0** (sign-off gate test)                                                                                                        |
| Badges equal to the prototype after the D-CV-04 corrections               | —                                                   | yes                 | **yes**; the differences are listed at STOP 2 for you to confirm                                                                  |
| NEWS2 parameters scoring 3 left unmarked on the desk                      | all (C6)                                            | 0                   | **0**: rail message, per-row badge, Flags panel                                                                                   |
| axe serious or critical                                                   | 0 on the v1 desk                                    | 0                   | **0**, over 32 browser runs (Complaint, Details pop-up, Past history, Social × 4 viewports × light and dark) plus the jsdom tests |
| Red-scarcity tests                                                        | —                                                   | green               | **green**                                                                                                                         |
| JS added to the clerking route / catalogue gzipped                        | —                                                   | ≤ 60 KB / report    | **28.0 KB gz** (the v2 modules bundled alone) / **31.9 KB gz**, fetched once and cached for a year                                |
| v1 drafts still openable                                                  | 1 in production                                     | all                 | **all**: the v1 desk is unchanged, plus "Continue in the new format"                                                              |

### Performance

- **Section switch:** p95 **18.7 ms** (budget 100).
- **Pop-up open:** p95 **21.4 ms** (budget 120).
- **Flag and note recompute:** p95 **0.25 ms**, or 1.0 ms at a 4× throttle (budget 16).
- **Not measured, because it needs the dev project:** TTFB of the clerking route.

### Checks

- **Full suite:** **6,896 passed, 0 failed** (173 skipped on the environment).
- tsc 0; typecheck:functions 0; ESLint 0 errors (the 2 warnings are the existing `scripts/embed-bench.mjs`).
- The production build of the branch passes.
- The catalogue check passes.

**Found and fixed in Phase 7:** contrast on the current step and the current note block. The plum tokens already invert in dark mode, and `dark:` overrides had inverted them back, which failed contrast. The current note block now scrolls into view.

### Open, for you

1. **Apply 0076, then deploy.** The desk reads 0076's medicine columns even with `CLERKING_V2` off.
2. **Sign the CFC v1.2 finding addendum** (`cfc-v1.2-addendum.md`, 84 concepts) so all 96 symptoms chart; today 12 do.
3. **Run the clinician trial** (`clinician-trial.md`).
4. **Signatures:** the new "Not an allergy" reasons; the composer snapshots (D-CV-16); the badge differences listed at STOP 2.
5. **Chroma** ships as its own release (D-CV-11); this desk then restyles by a token swap.
