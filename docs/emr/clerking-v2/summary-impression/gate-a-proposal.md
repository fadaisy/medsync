# GATE A (Summary and Impression): proposal for the CSO

**Status:** awaiting signatures. Nothing clinical runs until signed (SI10).

**Read with:**

- `STOP-REPORTS.md` (STOP 0): discovery Q1–Q12, the baseline and the disagreements with the prompt;
- `signoff-pack.md`: every profile by category, the must-not-miss reasons, the 100 rules with their `why` and suggestion lists, the REF-DX entries, the named scales, the 187 proposed terms and the decisions in the catalogue, generated from the catalogue itself;
- `CATALOGUE-REVIEW.md`: the catalogue build's own review.

## 1. Port plan

| Piece              | Built as                                                                                                                                                                                           | Reuses                                                                                      |
| ------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| Step 08 Summary    | `components/clerking/summary/summary-step.tsx`: header and status, one-liner, composed paragraph with step tags and the inspector, In my words, What goes in, Not asked yet, Not recorded, review  | the v2 shell, `Chip`, `YesNoRow`, `StatusWord`, `onHistory` (the history write path)        |
| Step 09 Impression | `components/clerking/impression/impression-step.tsx`: leading card (filled, deferred, empty), differential list, suggestions, also this visit, add                                                 | `DiagnosisPicker`, extended with "Already on this visit" and "Add "…" as typed, not coded"  |
| Evidence matrix    | `components/clerking/impression/matrix.tsx`: a real `<table>`, sticky first column, buttons in cells, arrow-key grid                                                                               | nothing (new)                                                                               |
| Details            | `components/clerking/impression/details.tsx`: see D-SI-16                                                                                                                                          | `EmrDialog` on tablet and phone                                                             |
| Note blocks        | `summary` and `impression` block keys in `lib/clerking/compose.ts`; `SECTION_BLOCK.summary = "summary"`; the "Summary: …" line leaves the examination block                                        | the note pane                                                                               |
| Engines (pure)     | `lib/clerking/summary/{compose,review}.ts`; `lib/clerking/impression/{catalogue,board,evidence,suggest,ask,compose,basis}.ts`                                                                      | the examination evaluator (`lib/clerking/exam/context.ts` `evalCond`), extended (Section 4) |
| Catalogue          | `data/clerking/clerking-diagnosis-catalogue.v1.json` + `dx-signoff.v1.json`; served at `/api/clerking/dx-catalogue?v=<sha16>`; `npm run clerking:catalogue-check` validates all three catalogues   | the loader, route and hash pattern of the other two catalogues                              |
| Server             | `lib/emr/write/facts.ts` (duplicate guard, demotion guard), `lib/emr/write/diagnoses.ts` (`setLeadingDiagnosis`, `requestDiagnosisCosign`, `decideDiagnosisCosign`), actions in `lib/emr/actions/` | `withPatientWrite`, `updateProblemStatus`, `markFactEnteredInError`, `placeOrders`          |

## 2. Payload (the v2 draft, `schema: 2`, gains two sections)

```ts
summary?: {
  mode: "composed" | "words";
  words?: string;                        // ≤ 20 000, clinical free text
  syndrome?: string;                     // ≤ 120, never parsed or coded
  include?: Record<FindingRef, boolean>; // only where it differs from the default
  review?: { by: string; at: string; inputsHash: string; snapshot: SummarySnapshot };
  text?: string;                         // written at signing only (D-SI-20)
};
impression?: {
  order: string[];                                            // differential, condition logical ids
  likelihood: Record<string, "likely" | "possible" | "unlikely">;
  reasons: Record<string, string>;                            // must-not-miss marked unlikely
  evidence: Record<string, Record<FindingRef, { w: "for" | "against"; by: string; at: string }>>;
  meta: Record<string, { onset?: "acute" | "chronic" | "acute_on_chronic"; severity?: string; reasoning?: string }>;
  catalogueVersion: string;
  snapshot?: SignedDiagnosis[];                                // written at signing only (D-SI-20)
};
```

- `FindingRef` is a typed id, never a label: `sym:<id>`, `sym:<id>#<red flag>`, `ex:<item>`, `ex:<item>.<attr>=<option>`, `vs:<id>`, `pmh:<id>`, `fh:<id>`, `med:<id>`, `soc:<id>=<option>`.
- Keys are condition **logical** ids (D-SI-19), so a status change does not orphan the reasoning.
- Accepted evidence carries who and when; removing it deletes the key in the next draft revision (the draft is versioned by `revision`, and signing freezes it).
- The trust boundary (`ContentV2Keys`) gains both keys with Zod schemas; unknown keys are still stripped.
- **Old drafts:** an s12 narrative opens in "In my words" with the text and "Continue in the composed format". s13 items render as today; differentials without a likelihood show none. Nothing is migrated silently.

## 3. Server actions and migrations

| Action                           | Proposal                                                                                                                                                                                                                             |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `recordEncounterDiagnosis`       | **Duplicate guard (S-3):** an active, current encounter diagnosis on the same visit with the same `termId`, or the same normalised typed text (decrypted in the write, a handful of rows), is `conflict` "Already on this visit".    |
| `setLeadingDiagnosis` (new)      | One transaction, two versions: the old primary becomes secondary + `differential` (likelihood Likely in the draft), then the chosen one becomes primary + `provisional`. Demote first, then promote. Two audit rows, one client key. |
| `moveToDifferential` (new, thin) | One version: primary → secondary + `differential`. Leaves no leading diagnosis.                                                                                                                                                      |
| `requestDiagnosisCosign` (new)   | A junior's Final: writes Working, opens `confirm_diagnosis` with `{conditionLogicalId, encounterId}` (PHI-free), returns "Final · awaiting senior co-signature".                                                                     |
| `decideDiagnosisCosign` (new)    | In the co-signature inbox. Approve: `updateProblemStatus(verification: confirmed)` and close the request, one transaction. Return: close with the note; the diagnosis stays Working.                                                 |
| Guards added                     | Demoting or moving a confirmed diagnosis needs `canWriteFinalDiagnosis` (D-SI-21). `placeOrders` rejects a reason condition that is not current or is entered in error.                                                              |
| Unchanged                        | `updateProblemStatus`, `markFactEnteredInError`, `saveNoteDraft` (payload gains the two sections; revision check as today), `signNote` (adds the snapshot, D-SI-20), `placeOrders`, the history and examination write paths.         |

**Migrations (both GATED, applied by the owner):**

- **0084 `cosign_confirm_diagnosis`:** re-creates `cosign_action_kind_check` with the ten current kinds plus `confirm_diagnosis`. No new column: the condition is named in `action_payload`. `cosign_note_link` already requires `note_id` null for it. Drizzle copy and the parity test updated.
- **0085 `ref_dx_terms_v1_1`:** seeds the 187 proposed terms from the addendum into `diagnosis_terms`, all with `icd11_code` null ("As typed, not coded") until verified (D-SI-26). Keyed `uuidV5("diagnosis_terms:" + id)`, `ON CONFLICT DO NOTHING`, generated by `scripts/emr/gen-seed.ts` with a drift test.

## 4. Engine: the one evaluator, extended

`lib/clerking/exam/context.ts` `evalCond` gains, with tests for each kind both ways:

| Atom                                | Meaning                                                                                                                                                                      |
| ----------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `{symptom, red_flag}` (no `answer`) | The red flag answered yes (213 uses that never fire today).                                                                                                                  |
| `{item, any_of}` (no `attribute`)   | The item's own finding value is one of the options (26 uses).                                                                                                                |
| `{vital, part}`                     | `vs.bp` systolic or diastolic alone against a number or an object reference.                                                                                                 |
| `{family_condition, answer}`        | `history.family[id].answer`.                                                                                                                                                 |
| `{medicine, answer: taking}`        | A recorded current medicine matches the quick pick (id, then label).                                                                                                         |
| `{medicine, answer: not_taking}`    | True only when "takes none, including herbal" is recorded. A list without the medicine is not "not taking" (not asked is never no).                                          |
| `{social, any_of}`                  | `history.social[id]` is (or, for lists, includes) one of the options.                                                                                                        |
| `{news2_total, ref}`                | The saved set's NEWS2 total at or above the reference.                                                                                                                       |
| `REF-DX-*`, `REF-FLAG-*` references | Resolved from the diagnosis catalogue, then the examination, then the history catalogue.                                                                                     |
| `grid`, `panel` (already evaluated) | Admitted into the diagnosis catalogue's language (Section 6 of the prompt); profile updates for GBS, limb ischaemia, PAD and dissection are listed for signature in D-SI-30. |

Unsigned profiles, rules, references and scales are never evaluated (SI10): `profileIsLive`, `ruleIsLive`, `refIsLive`, `scaleIsLive` read `dx-signoff.v1.json`.

## 5. Composer wording (draft for signature)

### 5.1 Summary block (`composer.summary`)

Order: one-liner, history positives, pertinent negatives, examination, vital signs and NEWS2, allergies.

| Part                | Wording                                                                                                                                                                                                                       |
| ------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| One-liner           | "A {age}-year-old {man \| woman \| person}{ with {included background}}, with an {acute \| subacute \| chronic} {duration} illness{: {syndrome}}." Age missing: "A {man} of unrecorded age". Onset missing: the clause drops. |
| History positives   | "{He \| She \| The patient} reports {complaint leads}." Each lead as the history composer writes it ("cold intolerance for 3 days, getting worse"). Then "Also {review-of-systems positives}."                                |
| Pertinent negatives | "{He} reports no {a, b or c}." Only answers recorded as No.                                                                                                                                                                   |
| Examination         | "On examination {he} is {consciousness}, with {included findings in examination order}." Clauses exactly as the examination composer writes them.                                                                             |
| Vital signs         | "{Included vital signs, with their numbers and arrows}. NEWS2 {total}{ (incomplete)}."                                                                                                                                        |
| Allergies           | "Allergies: {name}{, uncoded}{, reaction}." or "No known drug allergies." or "Allergy status not recorded." Always present.                                                                                                   |

Patient-facing text drops restricted items (background, positives, negatives, findings) with no trace.

### 5.2 Impression block (`composer.impression`)

| Part              | Wording                                                                                                                                                            |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Leading           | "{display} (primary; {working \| final \| final, awaiting senior co-signature}; {onset}{; {severity} (your grading)})." + " For: …." + " Against: …." + reasoning. |
| Differential      | "Differential: 1. {display}{ (must not miss)}, {likely \| possible \| unlikely}{ ({reason})}{ [n for, m against]}." One number per row, in displayed order.        |
| Also this visit   | "Also this visit: {display}{ ({ICD-11 code})}, {working \| final}{, on problem list}."                                                                             |
| Not yet explained | "Not yet explained: {findings}." Only when any remain.                                                                                                             |
| Deferred          | "Diagnosis deferred: {reason}."                                                                                                                                    |

Only accepted evidence is written. Counts in "[n for, m against]" are accepted marks only; a row with none shows no brackets.

### 5.3 The six fixtures (expected text; Phase 2 pins the engines to it)

**Fixture 1, Patient Three-3, hypothermia** (76, male; diabetes; cold intolerance 3 days getting worse, tiredness 3 days, loss of appetite 2 days; T 32.5 °C, pulse 54, BP 110/73, RR 12, SpO₂ 95 % on air, cool peripheries, capillary refill 3 s, dry mucous membranes, glucose 5.8; allergy cephalosporins, uncoded; syndrome typed "hypothermia with bradycardia").

> A 76-year-old man with diabetes, with an acute 3-day illness: hypothermia with bradycardia. He reports cold intolerance for 3 days, getting worse, tiredness for 3 days and loss of appetite for 2 days. On examination he is alert, with cool peripheries, capillary refill 3 seconds and dry mucous membranes. Temperature 32.5 °C ↓, pulse 54 ↓, BP 110/73 ↓, SpO₂ 95 % on room air. NEWS2 5. Allergies: cephalosporins, uncoded.

Pulse 54 is in the NEWS2 zero band, so under the prompt's default it would be listed but unticked; it appears here because of D-SI-25.

Suggestions (DDX-HYPOTHERMIA, then DDX-BRADYCARDIA; must-not-miss first within a rule; eight shown): sepsis, myxoedema coma, hypoglycaemia (diabetes), hypoglycaemia (no diabetes), accidental hypothermia, adrenal insufficiency, opioid or sedative toxicity, Wernicke encephalopathy; "Show 9 more". Hypoglycaemia carries "− Suggested: glucose 5.8" (never stored until accepted).

Impression, after the clinician adds a leading diagnosis, three differentials and diabetes, and accepts some evidence:

> Hypothermia, cause not yet known (primary; working; acute). For: temperature 32.5 °C, cool peripheries.
> Differential: 1. Sepsis (must not miss), likely [2 for, 0 against]. 2. Myxoedema coma (must not miss), possible [1 for, 0 against]. 3. Hypoglycaemia in diabetes (must not miss), unlikely (glucose 5.8 mmol/L on arrival, no insulin taken) [0 for, 1 against].
> Also this visit: Diabetes mellitus, type not yet determined, working, on problem list.
> Not yet explained: tiredness, loss of appetite.

**Fixture 2, chest pain** (58, male; exertional chest pain with sweating, 2 hours; BP 150/95, pulse 104; no syndrome typed):

> A 58-year-old man, with an acute 2-hour illness. He reports chest pain for 2 hours{, and the chest-pain clauses and red flags exactly as the history composer writes them, including the exertion and sweating red flags}. Pulse 104 ↑, BP 150/95 ↑. NEWS2 1 (incomplete). Allergy status not recorded.

Suggestions: acute coronary syndrome, aortic dissection, pulmonary embolism, pneumothorax pinned (must not miss); asks "BP in both arms", "calves", "haemoptysis" under "Not asked yet".

**Fixture 3, fever with neck stiffness** (34, female; HIV, on antiretrovirals; fever and headache 2 days; neck stiffness; GCS 14).

Clinical text:

> A 34-year-old woman with HIV, taking antiretrovirals, with an acute 2-day illness. She reports fever for 2 days and headache for 2 days. On examination she is drowsy (GCS 14), with neck stiffness. …

Patient-facing text: the same with "with HIV, taking antiretrovirals" removed. Suggestions for a viewer with access: bacterial meningitis, cryptococcal meningitis, TB meningitis, cerebral malaria. Without access: cryptococcal and TB meningitis are not suggested and their rule `why` is not shown.

**Fixture 4, jaundice with fever:** suggestions cholangitis, severe malaria, liver abscess (with sepsis and sickle cell crisis from DDX-FEVER-JAUNDICE); asks "dark urine", "pale stools", "alcohol".

**Fixture 5, empty and intern:** the empty leading state; "Diagnosis deferred: awaiting the blood film." when deferred; an intern choosing Final writes Working and shows "Final · awaiting senior co-signature", and the block reads "{display} (primary; final, awaiting senior co-signature; acute)."

**Fixture 6, duplicate:** "Diabetes mellitus, type not yet determined" added twice: the picker shows "Already on this visit" and the server returns `conflict` "Already on this visit" (S-3 test turns green).

## 6. Test plan

| Layer                   | What                                                                                                                                                                                        |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Catalogue check         | All three catalogues and the addenda: ids across catalogues, hashes, the restricted-fact rule, counts (`npm run clerking:catalogue-check`, run in CI).                                      |
| Engines (vitest)        | Section 7 of the prompt: snapshots for the six fixtures; each of the 100 rules with a firing and a non-firing fixture; every atom kind both ways; the property tests; restricted filtering. |
| Database lane (PGlite)  | S-3 and S-4 green; the swap (two versions, one primary, audit rows); the demotion guard; `confirm_diagnosis` round trip on migration 0084; the order currency check.                        |
| Components (fixtures)   | Pure `*View` components rendered from fixtures; red-scarcity tests extended to every new component; axe on the fixture route.                                                               |
| End to end (Playwright) | Fixtures 1–4 on the development fixture route: suggestions, asks answered and routed, evidence accepted, note text; tap budgets; matrix performance.                                        |

## 7. Clinical sign-off pack

`signoff-pack.md` holds the tables the CSO signs: 272 profiles by category (must-not-miss, time-critical, severity, asks, tests), the 89 must-not-miss reasons, the 100 rules, 14 REF-DX entries, 10 named scales, the 187 proposed terms, the 62 tests referenced but not on the menu, and D-DX-01 to 10.

**ICD-11:** the WHO browser (`icd.who.int`, `id.who.int`) is blocked by this environment's network policy. No code has been read on the WHO browser, so **none is verified**, and none is written from memory. D-SI-26 proposes shipping the terms uncoded.

**Tests:** the test addendum was not received; D-SI-27 covers it.

**REF-DX notes for D-DX-03:** the NEWS2-aligned values match the NEWS2 bands (HR 91/131, "below 41", RR 21/"below 9", SpO₂ 92 on scale 1). `REF-DX-HYPOTHERMIA-TEMP` 35 °C is the conventional threshold. `REF-DX-HYPERPYREXIA` 40 °C is used only as a trigger to consider heat stroke and severe infection (its name suggests a definition of hyperpyrexia, which is usually set higher); confirm the value against the source for that use.

## 8. Decisions (Fadhul signs)

### From the prompt (Section 15)

| #       | Decision                        | Recommendation                                                                                                                                   |
| ------- | ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| D-SI-01 | Design authority                | The prompt's written specification (Prototype 2 was not received), the catalogue for content, the repo on mechanics.                             |
| D-SI-02 | Onset words                     | Acute < 3 weeks, Subacute 3–12 weeks, Chronic > 12 weeks, from the longest recorded complaint duration. `REF-SI-ONSET`, draft until signed.      |
| D-SI-03 | Syndrome                        | Free text, ≤ 120 characters, never parsed, never suggested.                                                                                      |
| D-SI-04 | Evidence                        | Suggested marks dotted, never stored until accepted.                                                                                             |
| D-SI-05 | Leading = primary               | One per visit; swaps are one action; Move to differential leaves no leading diagnosis.                                                           |
| D-SI-06 | Must-not-miss reason at signing | Signing blocked while any must-not-miss is Unlikely without a reason; the Sign bar names it.                                                     |
| D-SI-07 | Likelihood words                | Likely, Possible, Unlikely. No numbers, scores or colours.                                                                                       |
| D-SI-08 | Unreviewed summary at signing   | A prompt, not a block. Summary stays optional.                                                                                                   |
| D-SI-09 | Diagnosis co-signature          | Working stored, "Final · awaiting senior co-signature" shown, `confirm_diagnosis` raised (migration 0084); approval writes Final.                |
| D-SI-10 | Reasoning storage               | In the signed note content. No new table now.                                                                                                    |
| D-SI-11 | Not asked yet                   | History targets answered in place; examination targets navigate (refined by D-SI-17).                                                            |
| D-SI-12 | Suggestion display              | ≤ 8 chips, rule order, must-not-miss first within a rule, restricted filtered; symptom-level terms offered for the leading slot only when empty. |
| D-SI-13 | Remove reasons                  | Added by mistake, Duplicate, Ruled out (text), Other (text).                                                                                     |
| D-SI-14 | Matrix on phones                | None below 834 px; evidence lists in Details.                                                                                                    |
| D-SI-15 | Terms and tests                 | GATED seed migrations after signature (refined by D-SI-26 and D-SI-27).                                                                          |

### Added by Phase 0

| #       | Decision                         | Recommendation                                                                                                                                                                                                                                                                                                    |
| ------- | -------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| D-SI-16 | Details placement                | ADR 0161: nothing slides in from an edge. Desktop: Details **replaces the note column's content in place** with a Back control. Tablet and phone: the centred `EmrDialog` (full-height on a phone). This overrides the prompt's 380 px overlay and 480 px right sheet.                                            |
| D-SI-17 | Ask routing by kind              | Symptom, red flag, past and family: No / Yes in place. Social: the item's own options in place (single-choice items; occupation navigates). Medicine: opens Past history (the list has no per-medicine "no"). Examination, vital and classifier: navigate to step 07.                                             |
| D-SI-18 | Restricted access (v1 rule)      | No per-class rule exists. A viewer has access to all four classes when they have an EMR access basis for the patient in a clinical workspace; reception, patients and unscoped staff never. One function (`canSeeClass`) holds the rule, so per-class grants later change one place (a future ADR and migration). |
| D-SI-19 | Logical ids                      | The desk read exposes `logicalId`; the draft keys on it. The s13 mirror is fixed (S-10): replaced by logical id, entered-in-error removed.                                                                                                                                                                        |
| D-SI-20 | Signing snapshot                 | Signing writes `summary.text` and `impression.snapshot` (each diagnosis's logical and version id, display, code, rank, status, sensitivity) into the content before the HMAC, so a signed note never changes when the record does (fixes the leak in STOP 0).                                                     |
| D-SI-21 | Demotion guard                   | Demoting or moving a confirmed diagnosis needs `canWriteFinalDiagnosis`.                                                                                                                                                                                                                                          |
| D-SI-22 | Profile lookup                   | By term uuid through a generated map (`uuidV5("diagnosis_terms:" + id)`, the seed's own generator).                                                                                                                                                                                                               |
| D-SI-23 | Who approves `confirm_diagnosis` | A senior who passes both the co-signature inbox's seniority and `canWriteFinalDiagnosis`.                                                                                                                                                                                                                         |
| D-SI-24 | Course                           | Add the shared `course` options (Getting worse, No change, Getting better, Comes and goes) to the 48 property families that lack it, as the history catalogue v1.3 addendum, re-signed with this gate. Until then the one-liner shows "Not recorded".                                                             |
| D-SI-25 | Vital signs included by default  | Outside the NEWS2 zero band, **or** beyond a signed REF-DX threshold that a profile on the board uses (so pulse 54 goes in when bradycardia is weighed).                                                                                                                                                          |
| D-SI-26 | ICD-11 while WHO is blocked      | Seed all 187 terms uncoded now (migration 0085, "As typed, not coded"); add codes by a later migration once each is read on the WHO browser. Never ship an unverified code.                                                                                                                                       |
| D-SI-27 | Tests not on the menu            | The 62 tests stay unorderable ("Not on this hospital's test menu") until the test addendum is received, signed and merged.                                                                                                                                                                                        |
| D-SI-28 | Branch                           | Build on the session branch `claude/amazing-goodall-s0b6rz`; a pull request to `main` when the owner asks.                                                                                                                                                                                                        |
| D-SI-29 | Screenshots                      | A development-only fixture route (`/styleguide/clerking-si/[screen]`) renders both steps from fixtures, for screenshots, axe and Playwright.                                                                                                                                                                      |
| D-SI-30 | Grid and panel evidence          | Add four atoms to four profiles: areflexia (reflex grid, all absent) on GBS; absent foot pulses (pulse grid) on acute limb ischaemia and PAD; inter-arm systolic difference (both-arms panel, `REF-EX` threshold) on aortic dissection. Give `inter_arm_difference` result ids.                                   |

### From the catalogue (D-DX-01 to 10)

As listed in `signoff-pack.md` §8, each with the catalogue's recommendation: adopt the evidence model (01); sign must-not-miss and time-critical by category (02); sign the REF-DX entries after the note in Section 7 (03); merge the terms per D-SI-26 (04); merge the tests per D-SI-27 (05); reason at least three words, no countersign (06); restricted suggestions only with access (07); lift the archived lists without scores (08); severities and scales as choices only (09); obstetric and paediatric reasoning out of scope (10).

### From `CATALOGUE-REVIEW.md` §5

| #   | Item                                                                                                                                                                                  | Recommendation                                                                                                                                           |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| R-1 | Must-not-miss list (89) and the reviewers' calls (appendicitis, DILI, pre-eclampsia, leukaemia in; AF, RHD, aortic stenosis, pericardial effusion, asthma and COPD exacerbations out) | Confirm as listed.                                                                                                                                       |
| R-2 | Time-critical (86)                                                                                                                                                                    | Sign as listed.                                                                                                                                          |
| R-3 | Cross-class restricted evidence (7)                                                                                                                                                   | Allow; shown only to viewers holding both classes (under D-SI-18, the same viewers).                                                                     |
| R-4 | Restricted-fact trade-off (post-TB lung disease, aspergillosis, bronchiectasis, DILI, adrenal insufficiency)                                                                          | Accept for v1: no new evidence atoms are written without their own sign-off. Revisit with the next catalogue version.                                    |
| R-5 | Rabies exposure misses dog bites                                                                                                                                                      | Accept for v1; "animal bite or scratch" goes into the history v1.3 addendum list.                                                                        |
| R-6 | Pregnancy status                                                                                                                                                                      | Use the record's pregnancy status where known (`pregnant: false` suppresses pregnancy-related suggestions); with it unknown, the sex rule alone applies. |

## 9. Signatures

| Signed by  | Role | Date | Scope |
| ---------- | ---- | ---- | ----- |
| _awaiting_ | CSO  |      |       |
