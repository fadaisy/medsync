# Summary and Impression: stop reports

One section per STOP of `PROMPT-CLERKING-SUMMARY-IMPRESSION.md`. Newest last.

---

## STOP 0: discovery and baseline

**Run:** 28 Sep 2026, cloud session, branch `claude/amazing-goodall-s0b6rz` (from `main` at `56d2892`, which holds the examination build, PR #183, and the Chroma reskin, PR #186). The prompt names `feat/clerking-summary-impression`; this session's designated branch is used instead (Q1 below).

**Pack received:** the prompt, `clerking-diagnosis-catalogue.v1.json` (sha256 `148ddcb4…abb`), `diagnosis-terms.v1.1-addendum.json`, `CATALOGUE-REVIEW.md` and `README.md`. The re-upload is byte-identical to the first (Markdown differs only by the repo's formatter).

**Not received:** `prototype/` (Prototype 2, the design authority), `test-catalogue.v1.1-addendum.json` and `catalogue-build/`. Everything below is built from the prompt's written specification (Sections 4 and 5), which is detailed enough for every screen; where only the prototype could answer, the proposal says so.

### Catalogue counts (MS-EMR-DX-CAT-001, 1.0.0-draft)

| Item                                   | Count                                                                                                                              |
| -------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| Profiles                               | 272 (85 on existing REF-DX-TERMS ids, 187 on the addendum)                                                                         |
| Must-not-miss / time-critical          | 89 / 86                                                                                                                            |
| Restricted profiles                    | 28 (mental_health 9, hiv 8, tb 6, sexual_reproductive_health 5)                                                                    |
| Differential rules / engine rules      | 100 / 13                                                                                                                           |
| REF-DX entries / named scales          | 14 / 10                                                                                                                            |
| New sources                            | 24 (all `verified: false`)                                                                                                         |
| Decisions                              | 10 (D-DX-01 to 10)                                                                                                                 |
| Tests referenced                       | 97: 35 in `data/emr/test-catalogue.v1.json`, 62 proposed (the catalogue's D-DX-05 says 61; the addendum file was not received)     |
| Evidence atoms (`suggest_for`/against) | 1,781 / 125                                                                                                                        |
| Ask targets                            | 2,285: exam item 675, symptom 591, past condition 267, red flag 263, social 146, vital 143, medicine 138, classifier 38, family 24 |

Every profile id resolves to REF-DX-TERMS or the addendum; no addendum id collides with an existing term.

### Where the prompt and the repo disagree (the repo wins)

1. **Two evaluators, not one.** `lib/clerking/flags.ts:125` (history flags, symptom-scoped) and `lib/clerking/exam/context.ts:205` (`evalCond`, which already reads history atoms). The diagnosis engine extends the second.
2. **Atoms the catalogue uses that never fire today:**
   - `{symptom, red_flag}` with no `answer` (213 uses): the evaluator compares against `answer`. The catalogue means "answered yes".
   - `{item, any_of}` with no `attribute` (26 uses, e.g. `ex.general.mobility`).
   - `vital` with `part` (39 uses): `part` is ignored; `vs.bp` + `gte_ref` reads systolic-or-diastolic.
   - `REF-DX-*` references (14) and `REF-FLAG-NG12-*` in `patient age_gte` do not resolve in the exam `ref()`.
   - Missing outright: `family_condition` (16), `medicine` taking/not_taking (53), `social any_of` (42), `news2_total` (4).
   - `grid` and `panel` exist in the evaluator; the catalogue emits none yet.
3. **Signing does not snapshot composed text.** The examination stays structured in `content.exam` and is recomposed on read. A signed v2 note re-derives its Impression with the live `p.diagnoses` (`clerking-desk.tsx:430-431`, `model.ts:124-126`), so **a diagnosis added after signing appears in the signed note's Impression**. Proposed fix at GATE A (D-SI-20).
4. **Condition ids.** The desk holds version ids only (`DeskDiagnosis.id`); `syncRecorded` and `placeOrders` store version ids. The draft's `impression` section needs logical ids, so the desk read must expose `logicalId` (D-SI-19).
5. **REF-DX-TERMS shape.** The addendum adds `restricted_class`, which v1 terms and the `diagnosis_terms` table lack. The class stays in the data files; the table keeps `sensitivity` only.
6. **No text id in the database.** `diagnosis_terms` stores only `uuidV5("diagnosis_terms:" + id)`. The profile-by-term lookup uses the same generator (D-SI-22).
7. **"One audit row"** cannot hold for a swap: two condition versions write two `audit_conditions` rows (trigger, `0071:740-742`). Both carry one client key.
8. **Line numbers.** The v1 branch is `clerking-desk.tsx:528-554`; `deriveDesk` is `model.ts:172-251`; the "Required" counting is `note-rules.ts:100-147`. The rest are correct.
9. **Draft trust boundary.** `ContentV2Keys` (`lib/clerking/payload.ts:150-158`) is a plain `z.object`, so unknown keys are stripped: `summary` and `impression` must be added there or they are silently lost.

### Q1. Branch state

- The examination v2 build is on `main` (`b92f5fd`, PR #183): `lib/clerking/exam/*` (12 modules), `components/clerking/exam/`, the exam catalogue and its sign-off (signed 27 Sep 2026), migration 0083.
- `clerkingV2LiveFor` (`lib/emr/feature.ts:41-45`) needs `CLERKING_V2` (`1` or hospital ids), `EMR_V1` and `ENCOUNTER_ENGINE_LIVE=1`. Nothing committed turns it on; production settings live in Vercel (the owner's). Migrations 0076 → 0082 → 0083 are applied per the owner.

### Q2. s12 and s13 today; S-1 to S-10

| #    | Verdict                                                                                                                                                                                                                                                                                                                 |
| ---- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| S-1  | **Confirmed.** `status.ts:129` returns "Auto" (always open); `compose.ts:465` maps `summary` to the exam block; `model.ts:121-122` appends "Summary: …" to the examination text; `BLURB.summary` says "Drafted from your entries." Failing tests: `tests/clerking/summary-impression-baseline.test.ts` (3, `it.fails`). |
| S-2  | **Confirmed.** Status chips precede the picker (`sections.tsx:842-850`) and reset after the pick (`:889`); rows are read-only (`:814-829`).                                                                                                                                                                             |
| S-3  | **Confirmed.** No duplicate guard (Q3). Failing test: `tests/emr-db/summary-impression.test.ts` "S-3" (PGlite, `it.fails`).                                                                                                                                                                                             |
| S-4  | **Confirmed.** `facts.ts:872-876` downgrades to Working with a transient warning; the copy at `sections.tsx:871-875` promises a co-signature that never happens (only an intern's whole note gets `sign_note`). Failing test: same file, "S-4".                                                                         |
| S-5  | **Confirmed.** No reorder, likelihood, removal or leading change from the step.                                                                                                                                                                                                                                         |
| S-6  | **Confirmed.** No evidence stored anywhere.                                                                                                                                                                                                                                                                             |
| S-7  | **Confirmed.** "must_not_miss" exists only in the pack.                                                                                                                                                                                                                                                                 |
| S-8  | **Confirmed.** The exam suggestions (`lib/clerking/exam/suggest.ts`) are driven by the history only.                                                                                                                                                                                                                    |
| S-9  | **Confirmed.** The defer form shows only when the list is empty (`:900`); the deferred chip has no remove; a hidden deferral still counts once a diagnosis exists.                                                                                                                                                      |
| S-10 | **Confirmed.** "Required" counts only the s13 mirror, which `syncRecorded` fills after a refresh and only with a draft. The mirror only adds, keyed on version id: after a status change or entered-in-error the stale item stays and counts, and a second item is added.                                               |

Production counts (drafts with an s12 narrative; signed notes with more than one diagnosis; duplicate active diagnoses) need the production database. They are the owner's to run with a read-only script in the pattern of `scripts/emr/legacy-counts.ts`; this build adds `scripts/emr/si-counts.ts` for it (Phase 6).

### Q3. `recordEncounterDiagnosis` (`lib/emr/write/facts.ts:861-925`)

- Only the client-key replay protects it. The problem-list copy can duplicate too.
- A second explicit primary throws `conflict` "This visit already has a primary diagnosis…" (`:877-882`); no database index enforces one primary.
- Typed text is encrypted with a random IV, so the typed-text duplicate check decrypts in TypeScript within the visit (a handful of rows).
- Typed diagnoses are always `standard` (the action has no `restricted` field).
- IDSR: notifiable terms add "Notification pending (IDSR)" (`:912-922`); unchanged by this build.

### Q4. Co-signature

- `clinical_cosign_requests.action_kind` is checked in SQL (`0071:351-355`, ten kinds, no diagnosis kind). `cosign_note_link` requires `note_id` exactly for `sign_note`.
- The inbox is `app/doctor/cosign-queue/page.tsx` (seniors); non-note kinds use `ReviewForm` → `reviewCosignRequestAction`, which only flips state.
- **Migration 0084 (GATED)** would: re-create the check with `confirm_diagnosis` added; carry `{conditionLogicalId, encounterId}` in `action_payload` (PHI-free); update the Drizzle copy and the parity test. Approval calls `updateProblemStatus(verification: confirmed)` in the same transaction.
- Inconsistency found: `cosignNote` requires `SENIOR_CADRES` (no clinical officer), while `canWriteFinalDiagnosis` is true for a clinical officer. D-SI-23 proposes the approver rule.
- Free numbers: next is **0084**. 0077–0079 are unused but must stay unused (the runner sorts by filename).

### Q5. `updateProblemStatus` and swaps

- One version can change rank and verification together. Two versions can be written in one `withPatientWrite` transaction; demote first, then promote (`currentPrimary` sees same-transaction rows).
- Gap: nothing stops a junior demoting a senior's Final to a differential (D-SI-21 proposes a guard).

### Q6. Evaluator atoms

See "disagreements" 1–2 above. NEWS2 comes from `scoreNews2` (`lib/triage/scoring/news2.ts:29`) on the saved set (`news2Latest`).

### Q7. Course

- `course` exists in 17 of 65 property families (34 of 96 symptoms): the shared set `worse` "Getting worse", `same` "No change", `better` "Getting better", `intermittent` "Comes and goes" (15 families), plus `focal_neuro` (improving, same, worsening, resolved) and `confusion` (fluctuating, steady, improving).
- Missing from pain (9 symptoms), cough, fever and 45 other families. D-SI-24 proposes the v1.3 history addendum.
- Durations: `SymptomEntry.duration {value, unit}` on complaints and review answers; `durationDays` (month 30, year 365) gives the onset band.

### Q8. REF-DX-TERMS seed path

- `scripts/emr/gen-seed.ts`, `UUID_NAMESPACE = "b08c11db-6eac-493f-8712-c8642d0d45ae"`; terms keyed `uuidV5("diagnosis_terms:" + id)`; seeded only in 0072 (`ON CONFLICT DO NOTHING`).
- `ADDENDA` handles only CFC concept addenda. A terms addendum needs a new seed source, a builder, the drift test and a GATED migration after 0084.
- ICD-11 in the addendum: 150 `to-code`, 37 `unverified-proposed`, 0 verified.

### Q9. Restricted access

- `canSeeRestricted: true` is hard-coded (`desk-load.ts:310`).
- Access is `private.patient_access_basis` (`0071:1056-1110`) via `resolveEmrAccess`: **binary per patient, no class dimension**. Row sensitivity is `standard | restricted` only. RLS hides restricted rows only from the patient role.
- The four classes exist only in the catalogue enums. **No per-class rule exists.** D-SI-18 proposes the v1 rule.

### Q10. `placeOrders` reasons

`lib/emr/write/orders.ts:244-276` checks only that the reason condition exists for the patient: a differential is allowed, and so is an entered-in-error or superseded version. This build sends the current version and adds a currency check (Phase 5).

### Q11. "Required n of 3"

`requiredCount` (`components/emr/desk/model.ts:524-528`) counts `validateForSigning`: `req.complaint`, `req.impression` (s13 has a diagnosis or a reasoned deferral) and `req.plan`. It reads the mirror only (S-10).

### Q12. Keys

- v2 keys (`components/clerking/model.ts:541-564`, bound in `desk-client.tsx:297-379`): Ctrl/⌘+Enter, `?`, `/` (complaint search), `]` `j` `[` `k`, `0`–`9`, and `y` `n` `d` inside yes/no rows. Step 07 adds `[ ] { } a p e x g`.
- Conflicts with Section 5.7: `/` must become step-aware; `d` must extend to differential rows; a drawer with `role="dialog"` suppresses desk keys, so it needs its own `l p u`. Free: `r`, `m`, `l`, `u`, Alt+↑/↓, Space, arrows in the matrix.

### Other findings

- Draft saving (`saveNoteDraft`) has a revision check; signing HMACs the whole content, so anything in `summary` and `impression` is covered by the signature once the keys are allowed.
- `DiagnosisPicker` offers "as typed" only when Enter finds nothing; the prompt's "Add "…" as typed, not coded" row must be added.
- The history write path is `onHistory` with the pure updaters in `lib/clerking/answers.ts`; the examination path is `onExam` → `withExam`; vital signs go through `recordObservations`.
- No preview route exists for the desk, so screenshots need the running app with a database. The cloud session has none; Playwright screenshots in later phases run against a fixture route added for the purpose (`/styleguide/clerking-si/[screen]`, development only).

### Baseline

- `npx vitest run tests/clerking/summary-impression-baseline.test.ts`: 3 expected failures (S-1).
- `EMR_PGLITE=1 npx vitest run tests/emr-db/summary-impression.test.ts`: 2 expected failures (S-3, S-4).
- Tap counts in the current UI (from the code paths): record a leading diagnosis = pick status (1) + search result (1) = 2 taps, but only as a flat list; three differentials = 6 taps with no likelihood possible; reviewing a summary is not possible (nothing to review).
- Screenshots of the current steps 08 and 09 need the running app with production-like data; not available in the cloud session (see above).

---

## STOP 1: GATE A

- **Signed** 28 Sep 2026 by the CSO (Usama Fadhul): every decision in `gate-a-proposal.md` §8 as recommended, the composer wording and the catalogue (272 profiles, 100 rules, 14 REF-DX entries, 10 named scales). Recorded in `data/clerking/dx-signoff.v1.json` in Phase 2.
- **Build from the written specification:** Prototype 2, the test addendum and `catalogue-build/` were not received.
- **ICD-11:** not verified (WHO hosts blocked); the 187 terms ship uncoded (D-SI-26).

---

## STOP 2: catalogue and engines

**Built (pure, no I/O):**

- `data/clerking/clerking-diagnosis-catalogue.v1.json` 1.0.1-draft: the pack's 1.0.0 plus the signed D-SI-30 amendment (areflexia on GBS, absent foot pulses on acute limb ischaemia and PAD, inter-arm difference on aortic dissection). `data/clerking/dx-signoff.v1.json` (all signed, none withheld) and `data/clerking/summary-reference.v1.json` (`REF-SI-ONSET`, D-SI-02).
- `lib/clerking/impression/`: `catalogue` (Zod, indexes, the SI10 gate), `facts` (typed finding refs, recorded findings, restricted-class gating, `canSee`), `board`, `evidence`, `suggest`, `ask`, `compose`, `basis`, `check` (the cross-catalogue check), `load` (loader, term map, served payload).
- `lib/clerking/summary/`: `compose` (one-liner, sentences with step tags, inclusion defaults, gaps) and `review` (hash, snapshot, diff).
- `lib/clerking/exam/context.ts` `evalCond` extended, not duplicated: red flag with no answer (213 uses), item without attribute (26), vital `part` (39), `family_condition`, `medicine`, `social`, `news2_total`, `patient age_lt` (found by the atom coverage test: 1 use that never fired), grid `all_cells`, and REF-DX / REF-FLAG resolution. All 547 existing clerking tests still pass.
- Draft schemas: `summary` and `impression` added to `ContentV2Keys` (they would otherwise be stripped at the trust boundary).
- `/api/clerking/dx-catalogue` serves the catalogue and the term map, immutable by hash.
- `npm run clerking:catalogue-check` now validates all three catalogues, the REF-DX-TERMS addendum and the test menu, enforces the restricted-fact rule, and runs in CI.

**Numbers**

| Measure                                                    | Result                                                                                                                                                         |
| ---------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| New tests                                                  | 243 (`si-rules` 202, `si-engines` 37, `si-check` 4), all green; full suite 7,644 passed                                                                        |
| Rule coverage                                              | 100 of 100 rules fire on every `any` branch and suggest their diagnoses; silent on an empty record and on every near miss                                      |
| Atom coverage                                              | 1,910 of 1,910 evidence atoms can be made true and are false when unrecorded (age and sex excepted: always on the record)                                      |
| Property tests                                             | pinning never violated (200 seeded move sequences); never two leading diagnoses; accepted marks ⊆ matrix cells; the summary never contains an unincluded vital |
| Catalogue check                                            | 0 problems; 97 tests referenced (35 on the menu, 62 proposed); ICD-11 verified 0 of 187                                                                        |
| Catalogue size                                             | 862 KB raw; served minified 116 KB gzipped                                                                                                                     |
| Recompute (summary + unexplained + suggestions, fixture 1) | median 0.54 ms, p95 0.76 ms in Node (about 2–3 ms at 4× throttle; budget 16 ms)                                                                                |
| Matrix, 12 diagnoses, all rows                             | median 0.28 ms, p95 0.50 ms (budget 50 ms)                                                                                                                     |

**Fixture snapshots** (`tests/clerking/__snapshots__/si-engines.test.ts.snap`):

- Fixture 1 summary: "A 76-year-old man with diabetes, with an acute 3-day illness: hypothermia with bradycardia. He reports cold intolerance for 3 days, getting worse, tiredness for 3 days and loss of appetite for 2 days. On examination he is alert, with cool or mottled, cool peripheries and capillary refill delayed, time 3 seconds. Temperature 32.5 °C ↓, BP 110/73 ↓, SpO₂ 95 % ↓. NEWS2 5. Allergies: cephalosporins, uncoded."
- Fixture 1 impression: "Hypothermia, cause not yet known (primary; working; acute). For: temperature 32.5 °C and cool or mottled, cool peripheries. Differential: 1. Sepsis (must not miss), likely [1 for, 0 against]. 2. Myxoedema coma (must not miss), possible. 3. Hypoglycaemia in a person with diabetes (must not miss), unlikely (glucose 5.8 mmol/L on arrival, no insulin taken) [0 for, 1 against]. Also this visit: Diabetes, type not yet determined, working, on problem list. Not yet explained: …"
- Fixture 1 suggestions (first eight): sepsis, myxoedema coma, hypoglycaemia (with and without diabetes), accidental hypothermia, adrenal insufficiency, opioid or sedative toxicity, Wernicke; hypothyroidism follows; "Hypothermia, cause not yet known" is offered for the leading slot only.
- Fixture 2: ACS, aortic dissection, PE and pneumothorax suggested as must-not-miss; asks include "BP difference between arms", "Calves" and "Coughing blood".
- Fixture 3: cryptococcal and TB meningitis suggested only to a viewer with access; the patient-facing summary drops HIV and antiretrovirals.
- Fixture 4: cholangitis, severe malaria and liver abscess suggested.
- Fixture 5: "Diagnosis deferred: awaiting the blood film."; an intern's Final reads "(primary; final, awaiting senior co-signature; acute)".

**Differences from the gate-a-proposal wording (reported, not hidden):**

1. **Hypoglycaemia "against: glucose 5.8"** (prompt fixture 1) is not produced: the signed catalogue has no glucose atom against hypoglycaemia (the review removed low-glucose atoms elsewhere). The catalogue wins on content; adding one is a catalogue change for the CSO.
2. **Pulse 54** is in the NEWS2 zero band, so it enters the summary only when a profile on the board marks it (D-SI-25), as signed.
3. **"Dry mucous membranes"** is not in the examination catalogue (no such finding or option); fixture 1 records the rest. An examination-catalogue gap for the next addendum.
4. **Examination clauses** are the examination composer's own ("cool or mottled, cool peripheries", "capillary refill delayed, time 3 seconds"), as SI4 requires; the summary does not rewrite them.
5. **Chest pain (fixture 2):** DDX-BP-RAISED (a vital-sign rule) fires before DDX-CHEST-PAIN (a complaint rule), so hypertension leads the chips; within the first eight chips all four chest-pain must-not-miss diagnoses still appear. This is the signed ordering (D-SI-12).

---

## STOP 3: Summary (step 08, behind `CLERKING_V2`)

**Built:**

- `components/clerking/summary/summary-step.tsx`: the status pill in the step header ("Composed, not reviewed", "Reviewed by you", "Changed since review"); "Changed since your review at HH:MM" with Added, Left out and Edited; the one-liner (Who, Onset from `REF-SI-ONSET`, Course or a dashed "Not recorded" that opens the complaint, the syndrome in the clinician's words, at most 120 characters); Composed or In my words (the first switch copies the composed text; "Compare" when the composed text has moved on; an old s12 narrative opens here with "Continue in the composed format"); the paragraph with mono step tags that open the inspector under it (its tickboxes are the same inclusion state); What goes in (three columns, "n of m", the allergy row locked "always in"); Not asked yet (answered in place through the history step's own updaters, examination targets open the examination at the item); Not recorded, so not stated; Reset to composed; Mark as reviewed / Review again (`r` on this step).
- `components/clerking/si-model.ts`: the drafts' `summary` and `impression` sections, the visit's diagnoses as the board reads them, and the review state (pure).
- The note: a Summary block between Examination and Impression, highlighted on step 08; the old "Summary: …" line has left the examination block. A signed note shows its signed summary text (or its old narrative), never a recomposition.
- The section bar: "Composed", "Reviewed" or "Changed" on step 08; "Not reviewed", "Reviewed" or "Changed" elsewhere. "Auto" is gone.
- The desk payload gains the diagnosis catalogue's URL and sign-off; the client fetches it once, like the other two.
- A development-only fixture route, `/styleguide/clerking-si/[screen]` (off unless `MEDSYNC_FIXTURES=1`; synthetic Patient Three-3; no database), for screenshots and axe (D-SI-29).

**Checks**

| Check                                     | Result                                                                                                                                                                                                                               |
| ----------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| S-1 tests (`summary-impression-baseline`) | 3 of 3 now pass (were `it.fails`)                                                                                                                                                                                                    |
| Step 08 interaction tests (jsdom)         | 6 of 6: composed on screen and in the note; reviewed in 1 tap; any change invalidates and lists it; allergy locked; the syndrome is the clinician's; Not asked yet writes `ros`; an old narrative opens in In my words with no write |
| Review-invalidation matrix (engine)       | inclusion, syndrome, mode and words each flip Reviewed to Changed; no change keeps it; the diff is exact                                                                                                                             |
| Red scarcity                              | extended: step 08 may paint red only for a vital scoring 3 in NEWS2, in one named constant, with its arrow (as the rail)                                                                                                             |
| axe (1440 light, 1440 dark, 390 light)    | 0 violations after renaming a duplicate region name (one moderate, fixed)                                                                                                                                                            |
| Page scroll at 1440×900                   | none; the centre card scrolls inside its column                                                                                                                                                                                      |
| Tap budget, review a composed summary     | 1                                                                                                                                                                                                                                    |
| Flag off                                  | unchanged: the v1 desk renders from `components/emr/desk`, which this phase does not touch; its UI tests pass (`tests/emr/ui`)                                                                                                       |

**Screenshots:** `screens/08-summary-1440-light.png`, `08-summary-1440-dark.png`, `08-summary-390-light.png`. They are compared against the written specification; Prototype 2 was not received.

**Notes**

- The screenshots found and fixed one defect: a "no" answer named by a diagnosis reached the one-liner's background ("with hypertension and no diabetes"); background now takes only what the patient has.
- The inspector stays inline on the phone rather than becoming a bottom sheet: it already sits under the paragraph and never covers it (C8, ADR 0161).
- The cloud environment holds real Supabase credentials. The dev server for screenshots ran with them replaced by dead local values, so nothing touched the project.

## STOP 4: Impression (step 09) and the server actions

**Built, the step:**

- `components/clerking/impression/impression-step.tsx`: the leading card in its three states (filled: the teal star, Working or Final, "Final (senior)" for a junior, the name and its sub-line, "Final · awaiting senior co-signature", Supports it and Not yet explained by any diagnosis, the meta line, Move to differential and Details; deferred: the reason and Undo; empty: the guidance and "Defer the diagnosis, with the reason"); the differential list (up and down within the pinned or unpinned group, the Must not miss pill, "n for · m against", the basis line, Details, Make leading, Remove, Likely, Possible or Unlikely, and the reason field for a must-not-miss marked Unlikely); Also considered with these findings (decision support, added as Possible); Also this visit; Add a diagnosis ("Add as" Leading, Differential or Also this visit; "Already on this visit" rows disabled; "Add "…" as typed, not coded"). Keys: `/`, `m`, `l p u`, Alt+↑/↓, `d`.
- `components/clerking/impression/matrix.tsx`: the evidence matrix from 834 px (a real table; arrow keys; Space or Enter cycles; `a` accepts a column; the column footer "n + · m −" and "Accept suggested (k)"; the findings that matter first, "Show all recorded findings").
- `components/clerking/impression/details.tsx`: Details in place of the note column at 1280 px and up (D-SI-16), a centred dialog below; Evidence, Not asked yet, Onset, Severity, Tests that would help decide (Add to plan, In plan, "Not on this hospital's test menu"), Why is it unlikely?, Your reasoning.
- The note gets the composed Impression block (`composer.impression`); signing waits on every must-not-miss reason, by name in the sign bar ("Required 3 of 3 · Sepsis: a must-not-miss marked unlikely needs a reason"), and step 09 reads "Reason needed".
- The live desk's handlers: add (`recordEncounterDiagnosis`), Working or Final (`updateProblemStatus`, or `requestDiagnosisCosign` for a junior), Make leading (`setLeadingDiagnosis`, both versions in one action), Move to differential (`moveToDifferential`), Remove (`markFactEnteredInError` with its reason), Add to plan (`placeOrders` with the diagnosis as its reason). The desk read now carries each order's test and reason diagnoses, so "In plan" is exact.
- The fixture route walks end to end: diagnoses and orders live in the page the way the server returns them.

**Built, the server** (one subagent, merged; details in its commits):

- `lib/emr/write/diagnoses.ts`, `lib/emr/actions/diagnoses.ts`: `setLeadingDiagnosis`, `moveToDifferential`, `requestDiagnosisCosign`, `decideDiagnosisCosign`; the D-SI-21 guard (a senior demotes or moves a Final diagnosis).
- `recordEncounterDiagnosis`: one of each diagnosis per visit (S-3, "Already on this visit"); a junior's Final is stored Working and opens a `confirm_diagnosis` request in the same transaction (S-4, D-SI-09), replacing the silent downgrade. Entered in error cancels the open request.
- `placeOrders` refuses a superseded or voided reason diagnosis (Q10).
- The desk's diagnoses by logical id with term, restricted, problem-list and co-signature state (D-SI-19); `syncRecorded` mirrors by logical id; `signNote` writes `impression.snapshot` before the HMAC (D-SI-20).
- The co-signature queue shows diagnosis requests with Approve and Return; a restricted one reads "Restricted diagnosis: open the visit to read it".
- **Migrations, GATED, for the owner:** `0084_cosign_confirm_diagnosis.sql` (adds `confirm_diagnosis` to the co-sign kinds) and `0085_ref_dx_terms_v1_1.sql` (the 187 addendum terms, uncoded, `ON CONFLICT DO NOTHING`, generated by `gen-seed.ts`). **0084 must be applied before this branch is deployed:** the v1 desk's "Final (senior)" now opens the request too.

**Checks**

| Check                                                       | Result                                                                                                                                                                                                                                                                                                                                                               |
| ----------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| S-3, S-4 (PGlite)                                           | pass (were `it.fails`); the whole lane 361 of 361                                                                                                                                                                                                                                                                                                                    |
| Step 09 interaction tests (jsdom)                           | 9 of 9: deferral and Undo; a suggestion added as Possible in one tap and never twice; three differentials in 3 taps; must-not-miss pinned until reasoned and holding signing; removal only with a reason; a junior's Final co-signed; accept a column in 1 tap; no matrix below 834 px and Details in a dialog below 1280 px; an unexplained finding linked in 1 tap |
| Full unit suite                                             | 7,670 passed, 536 skipped                                                                                                                                                                                                                                                                                                                                            |
| axe (list, matrix, Details; 1440 light and dark, 1024, 390) | 0 violations after two fixes (a heading-level gap in the dialog; a reason field's id repeated when list and Details show it together)                                                                                                                                                                                                                                |
| Tap budgets (Playwright on the fixture)                     | leading from search 2 (≤ 3); three differentials with likelihood 3 (≤ 6); accept all suggested evidence for one diagnosis 1; mark a must-not-miss unlikely 1                                                                                                                                                                                                         |
| Page scroll at 1440×900                                     | none                                                                                                                                                                                                                                                                                                                                                                 |

**Screenshots:** `screens/09-impression-{1440-light,1440-dark,390-light,empty-1440-light}.png`, `09-impression-matrix-{1440-light,1440-dark}.png`, `09-impression-details-{1440-light,390-light}.png`.

**Defects the walk found and fixed**

1. A suggestion whose term is not seeded yet goes in as typed words; the board did not recognise those words as the profile, so the chip stayed and could add the same diagnosis again. Typed words now match the profile's name, the chip leaves, and a second add is refused on screen as on the server.
2. Marking a must-not-miss Unlikely released it at once; SI5 keeps it on top until the reason has three words. The engine test encoded the wrong reading and is corrected.
3. A symptom and the same words as a red flag showed as two "Weight loss" chips; one chip per wording now links both.
4. The sign bar read "Required 3 of 3" while a missing reason held signing; it now names the diagnosis.

**Differences from the written specification**

- "Not asked yet" answers read Yes then No, as every history step's answer row does; the spec lists No then Yes. Consistency with the desk wins; say if the order should change everywhere.
- Details at 1280 px and up replaces the note column as a region with "Back to the note", not a `role="dialog"` drawer over it (D-SI-16 as signed).
- `setLeadingDiagnosis` keeps a Final diagnosis Final when it is promoted; the spec says promote as Working, which would quietly take away a senior's Final.
- For the CSO: `dx.ectopic_pregnancy` in the addendum is `standard`, outside the rule that restricts pregnancy terms for patients under 18 (D-CFC-09). It is seeded as the data says.

## STOP 5: evidence, suggestions, asks

**Built in this phase** (the matrix, Details evidence and the suggestion box shipped with step 09 at STOP 4; this phase proves them on the prompt's patients and fixes what the walks found):

- The fixture route serves the prompt's patients 1 to 4 (`/styleguide/clerking-si/impression-f1` … `-f4`, and `summary-…`), built from the engine fixtures as whole desk payloads (`tests/clerking/si-desk-fixtures.ts`); `-noaccess` is the same patient for a viewer without restricted access.
- "Not asked yet" merges a symptom's own question with a red flag that needs the symptom first: fixture 1 showed "Fever" twice (myxoedema coma asks fever; sepsis asks fever's confusion). One row now names both; a Yes turns it into the red flag's question for sepsis alone.
- A score in the evidence carries its value: "GCS 14/15", "AMTS 7/10", "GCS-P 12" (it read "GCS").
- Fixture 4's tenderness zone was "ruq", not a zone of the abdomen map ("Right hypochondrium"); the note read "in the ruq". The fixture is corrected; no rule in the diagnosis catalogue reads zones.
- Performance: the matrix's rows are memoised (a tap re-renders the one row it changed; one delegated click handler), the columns are built once per change and shared by the summary and step 09, and "Show all recorded findings" is built only when asked for.

**End to end, patients 1 to 4** (Playwright on the production build, 1440×900; leading from search, three differentials from the suggestions, the first ask answered No on the Summary step, the leading diagnosis's suggested evidence accepted in the matrix):

| Patient                 | Leading (taps) | Three differentials (taps)                                            | Ask answered and routed                                       | Accept column (taps) | Impression block after accepting                                                                                                              |
| ----------------------- | -------------- | --------------------------------------------------------------------- | ------------------------------------------------------------- | -------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| 1 Hypothermia           | 2              | 3: sepsis, myxoedema coma, hypoglycaemia (diabetes)                   | "Falls or unsteadiness" → Systems review; gone from the list  | 1                    | "Hypothermia, cause not yet known (primary; working). For: temperature 32.5 °C. Differential: 1. Sepsis (must not miss), possible. …"         |
| 2 Chest pain            | 2              | 3: aortic dissection, PE, pneumothorax                                | "Fainting (with chest pain)" → the complaint's red flag       | 1                    | "Acute coronary syndrome (primary; working). For: chest pain (2 hours), sweating and brought on by exertion. … Not yet explained: pulse 104." |
| 3 Fever, neck stiffness | 2              | 4 (one "Show more"): cryptococcal and TB meningitis, cerebral malaria | "Neck stiffness (with headache)" → the complaint's red flag   | 1                    | "Bacterial meningitis (primary; working). For: neck stiffness, GCS 14/15 and temperature 38.9 °C. …"                                          |
| 4 Jaundice with fever   | 2              | 4 (one "Show more"): sepsis, severe malaria, liver abscess            | "Fever (with yellow eyes or skin)" → the complaint's red flag | 1                    | "Acute cholangitis (primary; working). For: jaundice, temperature 38.6 °C and tenderness, in the right hypochondrium. …"                      |

Asks as expected by the prompt: patient 2 "BP difference between arms", "Calves" and "Coughing blood" (engine test); patient 4 "Abdominal pain · for Acute cholangitis, Sepsis, Liver abscess" among them. Add to plan, walked on patient 4: Details → "Add to plan" on abdominal ultrasound → "In plan", the Plan block holds it, and the leading card reads "1 test in plan".

**Restricted filtering, two viewers** (patient 3, HIV on antiretrovirals; the same page with and without restricted access):

| Surface                 | With access                       | Without                                                                                                                                                              |
| ----------------------- | --------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Suggestions             | 57                                | 50: pulmonary TB, acute HIV infection, TB meningitis, cryptococcal meningitis, cerebral toxoplasmosis, alcohol withdrawal and alcohol intoxication are never offered |
| Matrix rows (all shown) | —                                 | "HIV" and "Antiretrovirals" absent                                                                                                                                   |
| Summary                 | "A 34-year-old woman with HIV, …" | "A 34-year-old woman, …"                                                                                                                                             |
| Anything only without   | —                                 | nothing                                                                                                                                                              |

In production the desk opens only for a viewer with an EMR access basis, who holds every class (D-SI-18); the second viewer here proves the filter that patient-facing and unscoped surfaces rely on.

**Matrix performance** (production build, headless Chromium on this machine; "script" is render and commit, "frame" adds style, layout and headless software paint):

| Measure (12 diagnoses × 39 findings, Patient Three-3)                            | 1×: script median / p95 | 4× throttle: script median / p95 | Budget        |
| -------------------------------------------------------------------------------- | ----------------------- | -------------------------------- | ------------- |
| Open the matrix                                                                  | 12.3 / 15.2 ms          | 66 / 82 ms                       | < 50 ms p95   |
| A tap on a cell (the whole desk updates)                                         | 11.5 / 14.8 ms          | 64 / 88 ms                       | —             |
| Engine recompute after a tap (summary, board, columns, unexplained, suggestions) | about 2.4 ms in Node    | about 10 ms                      | < 16 ms at 4× |

The matrix meets its budget at 1× and not at 4×: opening it builds about 470 cells at once. Before the memoised rows a tap took 82 ms of script at 4×; the matrix's share of a tap fell from 54 ms to 7 ms in the profile. What remains is the whole desk rendering again on each change (rail, step bar, note, flags); memoising those is Phase 7 hardening. Paint is not reported against the budget: headless Chromium paints in software, a phone paints on its GPU.

**Screenshots:** `screens/09-f1-matrix-1440-light.png` … `09-f4-matrix-1440-light.png`, with `09-impression-matrix-*` and `09-impression-details-*` from STOP 4.

**For the owner and the CSO (D-SI-12)**

Suggestions follow signed rule order: rules fired by a red flag, a vital sign or an examination finding first, in catalogue order, then complaint-only rules. On patients 3 and 4 the specific rule's diagnoses sit behind the general fever rule's 18: cryptococcal meningitis is 34th and cholangitis 19th, behind "Show more", while sepsis and severe malaria lead. Recommendation for a GATE decision: order fired rules by how many findings they need (a combination rule such as DDX-FEVER-JAUNDICE or DDX-FEVER-NEURO before a single-finding one), still never by likelihood (SI2). Not changed here: it is a signed decision.

## STOP 6: note, signing, audit, old drafts

**Built in this phase**

- **D-SI-06 on the server.** `signNote` refuses a v2 note while a must-not-miss on the visit is Unlikely without a reason of three words: the same board and rule as the sign bar (`lib/clerking/impression/sign.ts`, with the profile matching moved to `lib/clerking/impression/recorded.ts` so the desk and the server share it). The message names the diagnosis: "Not ready to sign: Sepsis: a must-not-miss marked unlikely needs a reason."
- **Problem-list offers.** "Also this visit"'s Problem list tick now writes: `recordProblem` with the term (or the words), provisional unless the diagnosis is already Final. Before this it rendered with no handler.
- **D-SI-24, the history v1.3 addendum.** The shared course (Getting worse, No change, Getting better, Comes and goes) added after onset to the 48 property families that lacked it; `focal_neuro` and `confusion` keep their own. Recorded as an amendment in `data/clerking/catalogue-signoff.v1.json` with the new hash (`e2eb4601…`); the pinned-hash test applies it to the handed-over copy. The one-liner's Course now fills whenever a complaint records it.
- **`scripts/emr/si-counts.ts`** (`npm run emr:si-counts`): the §14 baseline in a read-only transaction, counts only (duplicate coded diagnoses on a visit, visits with a signed v2 note and more than one diagnosis, open v2 drafts, open `confirm_diagnosis` requests). The owner runs it against production.
- The fixture route's `-old` variant: a draft saved before this build (the old s12 words, neither new key).

**The signed-note snapshot** (PGlite, D-SI-20): signing writes `impression.snapshot`, each diagnosis's logical and version id, display, code (verified only), rank, status, sensitivity and co-signature state, into the content before the HMAC. The HMAC verifies over it, and a diagnosis added after signing changes neither the content nor the HMAC. The client writes `summary.text` and `impression.text` into the content before it asks to sign.

**Co-signature round trip** (PGlite): an intern's Final is stored Working with a `confirm_diagnosis` request (PHI-free payload: logical id and visit); asking again returns the open request; a senior asks nothing (they confirm directly). A clinical officer and the intern may not approve; the consultant's approval writes a Final version and closes the request; a retried approval replays and a second decision conflicts. Return needs a note and leaves the diagnosis Working; entered in error cancels an open request. The review queue shows "Final diagnosis" requests, and a restricted one reads "Restricted diagnosis: open the visit to read it".

**Old drafts** (`screens/08-summary-old-draft-1440-light.png`, `09-impression-old-draft-1440-light.png`): the old words open in "In my words" under "Written in the previous format. Your words go into the note." with "Continue in the composed format"; nothing is migrated until the clinician chooses. The Impression builds its board from the record, with no reasoning yet. A signed note shows its signed text, never a recomposition.

**Patient-facing** (`tests/clerking/si-patient-facing.test.ts`): no patient page and no print a patient takes home (visit summary, referral, prescription, lab request, label) reads a clinical note or a composer. The syndrome, likelihood, reasons, evidence and composed text cannot leave the clinical views, and those prints withhold a restricted problem unless the clinician includes it. Nothing in this build sends SMS or push. The patient audience of the composer drops restricted diagnoses and findings (patient 3: cryptococcal meningitis and HIV absent).

**Audit** (PGlite, §12): one visit's adds, swap, removal with its reason, co-signature request and approval, and two draft saves (a review; an accepted mark) leave audit rows on `conditions` (7 or more inserts), `clinical_cosign_requests` (insert and update) and `clinical_notes` (insert and update). Every row names its actor; the three clinicians appear. The review and accepted evidence are draft content, audited with each save.

**Checks:** unit suite 7,674 passed; PGlite lane 364 of 364 (three new: D-SI-06 on the server, the audit rows, the counts script); `clerking:catalogue-check` ok on all three catalogues.
