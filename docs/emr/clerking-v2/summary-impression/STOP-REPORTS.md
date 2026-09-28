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
