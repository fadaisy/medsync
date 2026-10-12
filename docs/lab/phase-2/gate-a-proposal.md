# Lab Phase 2: GATE A proposal (both prompts)

Written 12 Oct 2026 for Fadhul (owner and CSO). It covers `PROMPT-LAB-PHASE-2.md` (the catalogue) and
`PROMPT-LAB-PHASE-2-ONE-MENU.md` (one menu, one record), built together on `feat/lab-one-menu`.

**How this gate was passed.** The owner told the build session to go through every gate using Claude's
recommendations (12 Oct 2026). So every decision below is recorded as "accepted as recommended", and the build
goes ahead. That instruction covers design decisions only. It signs **no clinical value and no clinical
wording**:

- every range, scheme, cut-off, elevation, the HIV algorithm, the eGFR and IFCC constants and the concept
  addendum land as **drafts**, signed later in the product by the laboratory lead and the CSO;
- every string in Appendix A is `draft` in `content/lab-phase-2.ts`, so all eight flags stay off in production
  until the CSO signs it (the CF-3 gate in `workspaceLiveFor`);
- migrations are written, never applied; the owner applies them.

Principle for the build (the owner's "ponytail" instruction): the smallest design that meets every law. Where a
prompt lists several tables and one existing table or pattern already does the job, this proposal reuses it and
says so in §1.

---

## 1. Where this proposal differs from the prompts (and why)

| #   | Prompt says                                                                                                                       | Built instead                                                                                                                                                                                                    | Why                                                                                                                                    |
| --- | --------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| P1  | Tables per signed thing (schemes, rows, categories, adjustments, flag basis, elevation, HIV algorithm, NCD mappings, REF entries) | **One table, `lab_signed_configs`**: hospital (or none, for global), kind, key, version, status, payload (JSON, validated by Zod per kind), two signatures, in force from. Phase 1's two-signature rules, reused | One signing path, one freeze trigger, one sign-off screen. The payload shapes are in §3                                                |
| P2  | `component_methods` table                                                                                                         | `method_code` and `idms_traceable` on Phase 1's `lab_component_measures`                                                                                                                                         | Measures are already versioned, immutable and snapshotted per result: a method change is a new version, and ME-1's snapshot comes free |
| P3  | `clinical_question` column (280 chars)                                                                                            | The order's existing encrypted **reason** text is the clinical question (it already exists, is encrypted and is shown with the order)                                                                            | No second field that could disagree with the first                                                                                     |
| P4  | `clinical_context_access_events`                                                                                                  | `clinical_phi_access_log` with surface `lab_working_diagnosis` (the identity reveal's own table, Q9)                                                                                                             | Reuse the audit the prompt asks to copy                                                                                                |
| P5  | `obs.blood_group` becomes ABO only (CC-6)                                                                                         | New `obs.abo_group` plus `obs.rhd_type`; `obs.blood_group` kept for history (STOP 0 A2)                                                                                                                          | Never change a signed concept's meaning under old results                                                                              |
| P6  | `obs.hiv_test` holds the algorithm outcome (AL-4)                                                                                 | New `obs.hiv_algorithm_outcome`; `obs.hiv_test` keeps its single-test meaning (STOP 0 A2)                                                                                                                        | Same                                                                                                                                   |
| P7  | (Research) Xpert grade and RIF in `obs.tb_xpert`                                                                                  | New `obs.tb_xpert_mtb` (grade, with "trace") plus `obs.tb_xpert_rif`; `obs.tb_xpert` kept for history                                                                                                            | Same                                                                                                                                   |
| P8  | Research answer codes (`neg`, `1plus`, …)                                                                                         | Live codes kept; research codes mapped onto them; only answers new in meaning are added (STOP 0 A1)                                                                                                              | The signed NCD pack reads the live codes                                                                                               |
| P9  | CrAg not restricted (CC-8, D-LAB2-24)                                                                                             | CrAg stays restricted (class `hiv`), as the registry has it today                                                                                                                                                | Loosening privacy needs a reason; keeping it costs nothing                                                                             |
| P10 | Research file under `docs/lab/phase-2/`                                                                                           | It stays at `docs/lab/catalogue-research/` (already committed there; the importer reads it by hash)                                                                                                              | The repo wins; no duplicate copy                                                                                                       |
| P11 | `diagnostic_reports.kind = 'point_of_care'`                                                                                       | A report is bedside when it carries a `device_id`; `kind` stays `lab`                                                                                                                                            | Every existing reader that switches on `kind` keeps working                                                                            |
| P12 | `lab.profile.manage`                                                                                                              | Folded into `lab.manage` (Step 0 decides, as the prompt allows)                                                                                                                                                  | One permission for set-up                                                                                                              |
| P13 | Label numbers already exist (G4)                                                                                                  | New `lab_labels` table: one number per order, issued when first printed, voidable                                                                                                                                | Nothing generates a label number today                                                                                                 |
| P14 | Raising a priority to Immediate later sets `emergency` (PY-2)                                                                     | Not possible: orders are immutable and no event changes priority. The emergency state is fixed at placement                                                                                                      | Nothing to build until a priority change exists                                                                                        |
| P15 | Two-signature HIV algorithm per hospital                                                                                          | Per hospital, as proposed                                                                                                                                                                                        | —                                                                                                                                      |
| P16 | eGFR, IFCC constants "from a signed REF entry"                                                                                    | `lab_signed_configs` kind `ref`, global (no hospital); the draft payload is filled from the source page, the CSO signs                                                                                           | —                                                                                                                                      |
| P17 | Viral load scheme "Uganda MoH" (D-LAB2-01)                                                                                        | WHO 2023 (LD-05, the owner's signed decision), with the source on every result                                                                                                                                   | A signed decision beats a recommendation                                                                                               |

## 2. Decisions (all accepted as recommended, 12 Oct 2026, on the owner's instruction)

**From the first STOP 0:** A1 keep live answer codes; A2 new concepts for new shapes (P5–P7); A3 CrAg stays
restricted, the pregnancy test becomes restricted for all ages (CD-08, CC-8); A7 the altitude adjustment
shifts every cut-off of the anaemia scheme (the same as subtracting it from the observed value; DS-6 tests both);
categories have no gaps (each lower limit inclusive, the next category starts exactly there); the adjustment table
is stored in the scheme's unit; A10 the importer cuts no published band: every band arrives as a draft labelled
by its source, overlapping sources show **Two sources disagree**, and LD-01 and LD-06 are shown to the lead
as guidance for the choice.

**D-LAB2-01 to D-LAB2-28 and E-LAB2-01 to E-LAB2-07:** as the one-menu prompt §14 recommends, with P17 for
viral load. **LD-01 to LD-12, CD-01 to CD-09, F-1 to F-4:** as `DECISIONS.md` (owner-signed earlier).

## 3. Schema diff (migrations 0107–0111; additive; GATED, owner-applied)

**0107 `lab_catalogue_v2`**

- `ucum_units` + `{copies}/mL`, `{log_copies}/mL`, `ng/L`, `mg/L{FEU}`, `mg/L{DDU}`, `[pH]`, `d`, `{count}`.
- `lab_signed_configs` (P1): `id, hospital_id NULL, kind, key, version, status draft|signed|superseded, payload
jsonb, sources jsonb, authored_by, lead_signed_by/at, cso_signed_by/at, exception_note, in_force_from,
superseded_at`. One signed per (hospital, kind, key); payload frozen once out of draft (trigger); the same
  two-different-people check as 0104. Kinds and payloads:
  - `scheme` (key = concept): `{unit, label, source, categories:[{code,label,abnormal}], rows:[{sex, ageFromDays,
ageToDays, context, methods:["lab"|"bedside"], bounds:[{category, from, fromInclusive, to, toInclusive}],
source}], adjustments?: {elevation:{unit, mode:"add_to_cutoffs", table:[{fromM,toM,amount}], source}}}`
  - `flag_basis` (key = concept): `{basis:"reference"|"scheme"}`
  - `elevation` (key `hospital`): `{metres, source}`
  - `hiv_algorithm` (key `serial`): `{assays:[{step, kit}], rules:[{t1,t2,t3,outcome}], retestDays, circular}`
  - `ncd_mapping` (key = registry field): `{concept, unit, methods, windowDays}`
  - `ref` (global; key `REF-EGFR-CKDEPI-2021`, `REF-HBA1C-IFCC`): `{constants…, source}`
  - `addendum` (global; key `cfc-1.6.0`): `{hash}` (the data file's SHA-256)
- `reference_range_bands` + `provenance jsonb` (citation, where, link, population, method, confidence, reason,
  strand), `verification text`, `check_note text`, `checked_by`, `checked_at`, `rejected_reason text`.
  `reference_range_versions` + `import_hash`.
- `lab_component_measures` + `method_code text`, `idms_traceable boolean` (P2).
- `lab_settings` + `report_egfr`, `payment_mode` (`off|inform|hold`), `high_risk_procedure` (link or title).
- `test_catalogue` + `restricted_class` (set per CC-8 with P9), `offering_code`.
- `analyser_profiles`: `hospital, model, bench, kind (five_part|three_part|chemistry|other), state
(draft|in_use|retired), mappings jsonb [{code, concept, visibility clinician|lab_only|never}], open_checks
jsonb, verified_concepts text[], activated_by/at`.
- `lab_result_snapshots` + `interpretation jsonb` (basis, config id and version, category, abnormal,
  adjustments, context, reference band for information, fallback reason), `profile_id`, `method_code`,
  `lab_only boolean`.
- `research_imports`: `hash, hospital, imported_by, imported_at, report jsonb`.

**0108 `cfc_v1_6_lab_catalogue`** (generated by `scripts/emr/gen-seed.ts` from
`data/emr/clinical-fact-concepts.v1.6.json`): the new concepts, answer extensions on existing concepts, the
four new tests (`test.coag_screen`, `test.rpr`, `test.tpha`, `test.dual_hiv_syphilis_rdt`), and D-dimer's unit
change (F-2). Existing tests' component lists are **not** changed in the migration: with `labCatalogueV2` on,
the v2 component lists (from the data file, through the analyser profile for FBC) are used; with it off,
Phase 1's lists stand (S18). New tests and components stay out of every menu until the addendum's config is
signed (CC-1).

**0109 `lab_one_menu`**

- `lab_labels` (P13): `label_no` (sequence, `L` + 8 digits), `order_id`, `hospital_id`, `patient_user_id`,
  `issued_by/at`, `voided_by/at`, `void_reason`; only the void fields may be set, once.
- `lab_payment_events` (append-only): `order_id, hospital_id, state, receipt_no, insurer, authorisation_no,
reason, approver_id, actor, at`. The current state is the newest event, or the state computed at placement.
- `lab_identity_checks` (append-only): `order_id, label_no, outcome, method scan|typed, wristband, actor, at`.
- `lab_high_risk_events` (append-only): `encounter_id, kind flag|clear, source rule|manual, reason, actor, at`.
- `specimens` + `label_no` (already a column) is now written; `payment_state` at collection.
- `specimen_events` + `profile_id`, `received_via` (`scan|click`), `procedure_followed_at`.
- Realtime: trigger on `specimens` and `specimen_events` sends `{specimenId, event, at}` to `lab:<hospital>`;
  a `realtime.messages` policy lets lab staff of that hospital listen.

**0110 `lab_bedside`**: `devices` + `state` (`not_verified|in_use|retired`), `test_code`, `ward_id`,
`verified_by/at`, kinds `rdt_kit` and `dipstick`; `poct_lots (hospital, device_id, lot, use_by)`;
`poct_operators (hospital, user, granted_by/at, revoked_at)`; `diagnostic_reports` + `device_id`, `lot_id`
(bedside when set, P11).

**0111 `ncd_lab_feed`**: `ncd_visit` + `lab_refs jsonb` (report id and version per field); outside results keep
using the registry's own typed columns, which already store the original value and unit, plus
`outside_lab_name`.

## 4. The interpretation resolver (DS-\*), as a decision table

| Step | Question                                                       | Yes                                     | No                                                    |
| ---- | -------------------------------------------------------------- | --------------------------------------- | ----------------------------------------------------- |
| 1    | Is a flag basis signed for this concept, and is it `scheme`?   | go to 2                                 | reference interval (Phase 1 RR-\*)                    |
| 2    | Is the scheme signed and its unit the component's unit?        | go to 3                                 | fallback `no_scheme_for_patient`                      |
| 3    | Is a row's method this result's method (`lab` or `bedside`)?   | go to 4                                 | fallback `method_not_covered`                         |
| 4    | Sex and age known, and a row covers them (RR-4)?               | go to 5                                 | fallback `sex_or_age_missing` / `no_band_for_age`     |
| 5    | Does a row match the pregnancy context from the record?        | that row                                | the non-pregnant row, marked "pregnancy not recorded" |
| 6    | Is the hospital's elevation signed and does the scheme adjust? | add the table's amount to every cut-off | no adjustment, marked "altitude not adjusted"         |
| 7    | Which category holds the value (bounds as signed)?             | that category; flag = its `abnormal`    | (cannot happen: categories have no gaps)              |

A fallback goes to the reference interval with the reason stored and shown, and never to another
population's category (DS-4). The reference band is always resolved too and shown "for information".

Worked examples (invented fixture numbers, as in the tests; no signed value):

| Patient                                   | Fixture scheme                         | Result                                                          |
| ----------------------------------------- | -------------------------------------- | --------------------------------------------------------------- |
| Woman, 34, not pregnant, hospital 1,200 m | cut-offs 10/8 with +1.0 at 1,000–1,499 | value 10.4 sits below 11.0 → "moderate", "adjusted for 1,200 m" |
| Same, pregnant 22 weeks                   | trimester-2 row                        | the trimester-2 row's category                                  |
| Same, pregnancy not recorded              | non-pregnant row                       | category plus "pregnancy not recorded"                          |
| Girl, 9                                   | rows from 15 years only                | reference interval, "no scheme for this patient"                |
| Bedside glucose                           | rows name `lab` only                   | reference interval if any, "method not covered"; no category    |

## 5. Payment (PY-\*)

At placement the state is `emergency` when the priority is `immediate` or `emergency` or the order came from
the resus desk; otherwise `not_required` when the hospital's payment mode is `off`; otherwise `awaiting`. The
cashier moves `awaiting` to `paid`, `insured` or `waived`. Nothing moves `emergency`. `canCollect` is true for
every state but `awaiting`; `awaiting` is true in `inform` mode with a reason and false in `hold` mode.
**Proof of never-held:** `emergency` is decided from the order's own immutable columns, so no setting, role or
later event can produce `awaiting` for it; a property test runs every combination.

## 6. Identity at collection (ID-\*)

The label is issued when first printed for an order (`lab_labels`). `checkLabel` returns `match`,
`other_patient` (with that patient's two identifiers), `other_order_same_patient`, `unknown_label` or
`voided_label`. With the check on, `collectSpecimen` needs a `match` written in the same transaction, else the
server refuses. No override. **Void and print new** voids the old number and issues a new one.

## 7. RLS and realtime

Every new table: RLS on, no client INSERT, UPDATE or DELETE (writes go through server actions as the clinical
writer); reads scoped to the hospital through the existing `accessible_patient_ids()` for patient rows and
hospital membership for configuration. The cashier's query is a SECURITY DEFINER function that returns
identifiers, order number, unrestricted test names and a restricted count only, and checks
`lab.payment.record` (the RECEPTION cadre, added to the lab permission map as 1.1.0). The probe table at STOP 2
runs every object against the actors in the prompt §7. `lab:<hospital>` carries ids and event names only.

## 8. Rollout

`labCatalogueV2` → `labOneMenu` → `labCollectionCheck` and `labHighRiskWarning` → `labBench` → `labPayment`
(only where the hospital charges) → `labBedside` → `ncdLabFeed` (D-LAB2-28). Env variables `LAB_CATALOGUE_V2`,
`LAB_ONE_MENU`, `LAB_PAYMENT`, `LAB_COLLECTION_CHECK`, `LAB_BENCH`, `LAB_HIGH_RISK`, `LAB_BEDSIDE`,
`NCD_LAB_FEED`, each "1" or a list of hospital ids, all needing `LAB_WORKSPACE` except the NCD feed.

## 9. Queries the owner can run in production (Q10, Q11, Q12, CC-5)

```sql
-- D-dimer, troponin and blood-group results
SELECT concept_id, value_unit, count(*) FROM clinical_observations
 WHERE concept_id IN ('obs.d_dimer','obs.troponin','obs.blood_group') GROUP BY 1, 2;
-- Women 15-49 with lab orders in 90 days, and how many have a pregnancy record
SELECT count(DISTINCT o.patient_user_id) AS women,
       count(DISTINCT p.patient_user_id) AS with_pregnancy_record
  FROM encounter_orders o JOIN patient_profiles pp ON pp.id = o.patient_user_id
  LEFT JOIN pregnancy_episodes p ON p.patient_user_id = o.patient_user_id
 WHERE o.created_at > now() - interval '90 days' AND pp.sex = 'female'
   AND age(pp.date_of_birth) BETWEEN interval '15 years' AND interval '50 years';
```

## 10. Appendix A copy

Every string in the one-menu prompt's Appendix A goes into `content/lab-phase-2.ts` word for word, with status
`draft`. The production gate keeps all eight flags off until the CSO marks it `signed`.

## 11. Hazard log (Appendix B, seeded; each control's test is named at the step that builds it)

| #   | Hazard                                       | Control                                                                | Proven by                    | Residual                                           |
| --- | -------------------------------------------- | ---------------------------------------------------------------------- | ---------------------------- | -------------------------------------------------- |
| 1   | Tube labelled for another patient            | Label check before collected; no override                              | ID-1, ID-2, S32              | Check off at a hospital                            |
| 2   | Old label reused after a reprint             | Void and print new; voided number refused                              | ID-5, S33                    | Reprint of the same number is allowed              |
| 3   | Emergency held for payment                   | `emergency` fixed at placement; `canCollect` true                      | PY-3 property test, S26, S27 | None                                               |
| 4   | Cashier sees a restricted test               | Definer function returns a count                                       | PY-5, S30                    | None                                               |
| 5   | "In the lab" while the analyser is down      | Read from the hub's events at order time; unknown says so              | OM-2, OM-3, S19, S22         | Hub not updated by staff                           |
| 6   | Not-offered test ordered                     | Refused in `placeOrders`                                               | OM-4, S20                    | None                                               |
| 7   | Referred specimen lost                       | To refer list                                                          | OM-7, S23                    | **Open until Phase 4** (send-out flow)             |
| 8   | Scan receives the wrong specimen             | Lookup scoped to the hospital; same words for another hospital         | SR-1, SR-2, S39              | Mis-scan of a right-hospital label                 |
| 9   | Live worklist silently stops                 | Polling fallback with an amber line                                    | LV-3, S42                    | None                                               |
| 10  | Working diagnosis reveals a restricted class | Masked unless the order's tests share the class; every reveal logged   | CX-3, CX-4, S44              | None                                               |
| 11  | High-risk specimen reaches the open bench    | Warning on six surfaces; receipt needs Procedure followed              | HR-3, SR-3, S34, S45         | Rule not fired (clinician did not record bleeding) |
| 12  | High-risk warning cleared wrongly            | Only a clinician, with a reason, as an event                           | HR-2, S35                    | None                                               |
| 13  | Expired strip or unverified device           | Refused on the server                                                  | PC-2, PC-3, PC-10, S47, S48  | Lot typed wrongly                                  |
| 14  | Bedside glucose read as a diabetes diagnosis | Schemes name methods; bedside gets no category                         | PC-5, DS-3, S46              | None                                               |
| 15  | Meter HI or LO typed as a number             | Coded answers; numbers refused for them                                | PC-6, S49                    | None                                               |
| 16  | GRAN mapped to neutrophils                   | Mapping refused                                                        | AP-3, S6                     | None                                               |
| 17  | Research-use parameter released              | Blocklist; never stored                                                | AP-2, AP-6, S6               | Blocklist incomplete (manual gap)                  |
| 18  | Scheme change rewrites old results           | Interpretation snapshotted at release                                  | DS-9, S12                    | None                                               |
| 19  | Wrong elevation misclassifies anaemia        | Elevation signed by the CSO with its source; shown on each result      | DS-6, DS-7, S8, S11          | Wrong figure signed                                |
| 20  | Pregnancy wrong or missing                   | From the record only; "pregnancy not recorded" shown                   | DS-5, S9                     | Pregnancy not recorded                             |
| 21  | eGFR read as stable function in AKI          | Signed caveat always shown                                             | EG-5, S13                    | Clinician ignores the caveat                       |
| 22  | eGFR from a non-traceable creatinine         | Needs the declared IDMS-traceable method                               | EG-1, EG-2, S13              | Method declared wrongly                            |
| 23  | Unverified draft signed (Lugada CD4)         | Verification blocks sign-off until checked                             | RI-5, S2                     | None                                               |
| 24  | Sources averaged or silently chosen          | Both shown; the lead rejects one with a reason; overlap blocks signing | RI-6, S3                     | None                                               |
| 25  | Troponin split hides old results             | Old concept kept and shown                                             | CC-4                         | None                                               |
| 26  | FEU and DDU mixed                            | Separate concepts and units; no conversion                             | CC-5, RR-6                   | None                                               |
| 27  | NCD field from another unit or old version   | Unit must match; newest released version read live                     | NF-2, NF-3, S56, S60         | None                                               |
| 28  | Outside result counted in lab reports        | Kept in the registry, never in lab tables                              | NF-7, S59                    | None                                               |
| 29  | HIV algorithm change re-derives old outcomes | Version stored on each outcome                                         | AL-4, S15                    | None                                               |
| 30  | Dual RDT's HIV line read as a diagnosis      | It feeds the algorithm only                                            | CC-7, S16                    | None                                               |

## 12. Test plan

Pure engines (vitest, every rule id in the test name), PGlite lane for the data layer and the write paths
(`tests/emr-db`, `EMR_PGLITE=1`), the harness for screens and axe at 1440 and 390 px. Red-scarcity tests
extended to every new component.

## 13. ADRs

0251 catalogue v2 (addendum v1.6, splits, kept answer codes, restricted class per test, analyser profiles) ·
0252 decision schemes, flag basis and the signed configuration (elevation, pregnancy, IFCC, viral load) ·
0253 research import · 0254 methods and eGFR · 0255 one menu · 0256 payment and the never-held rule ·
0257 labels, identity at collection, scan to receive and the live channel · 0258 clinical question, revealed
working diagnosis and the high-risk warning · 0259 bedside results, the NCD feed and the HIV algorithm.

## 14. Signature

Decisions accepted as recommended on the owner's instruction to proceed through every gate, 12 Oct 2026.
Clinical values and wording: **not signed** (they are signed in the product, §0).
