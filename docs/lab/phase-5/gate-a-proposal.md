# Lab Phase 5: GATE A proposal

17 Oct 2026, branch `feat/lab-beyond-lis`. Built from STOP 0 (`STOP-REPORTS.md`), the prompt and the research
notes. **No clinical number is proposed anywhere in this document.** Every limit, window, plain-language text, alert
list entry and release rule is signed data entered in the product; this proposal decides the shapes, the rules and
who signs.

## 1. Wireframes

The canvas (_Lab Phase 5 UI Preview_, artboards 1–12) is the wireframe for every screen in §5 of the prompt, with
the differences in prompt §5.13 and these annotations:

| Artboard | Screen                                   | Annotations                                                                                                                                                                                                                              |
| -------- | ---------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1        | Patient: my results (390 px first)       | Lives at `/patient/results` in the existing tab bar (Home · Visits · **Results** · Me). Header: hospital, name and patient code. "Not ready to show yet" lists only groups the patient may see (PR-3). The existing Emergency pill stays |
| 2        | Patient: one result                      | Range line in SVG with a text alternative; band and dot differ in shape and lightness; "Ask your doctor what this means" where no plain words are signed                                                                                 |
| 3        | Results-ready SMS and settings           | Switches are `<button role="switch">`; "Who else can see my results" reads only (links are made at the hospital)                                                                                                                         |
| 4        | Doctor: review and release               | A **The patient sees it** column on the doctor's results; the critical panel and the hold dialog are centred `EditorDialog`s (no side sheet; owner rule)                                                                                 |
| 5        | What patients see, and when              | `/lab/setup/patient-release`, `lab.manage` drafts, the CSO signs                                                                                                                                                                         |
| 6        | Result entry with a delta check          | Inside the existing result entry: the "Last time" column, an amber delta block (`role="alert"` once) and the decision in a centred dialog; Release stays disabled until every fired rule has a decision                                  |
| 7        | Delta check rules                        | `/lab/setup/delta`; "Try it on past results" is read-only                                                                                                                                                                                |
| 8, 9     | Autoverification, released by rule       | **Not built** (Step 9 gap); nav item hidden                                                                                                                                                                                              |
| 10–12    | IPC lab alerts, alert list, surveillance | A new workspace `/ipc` (top-level desk like `/referral-governance`), gated by designations; the side panel is a centred dialog                                                                                                           |

## 2. Decisions

### 2.1 The prompt's decisions (Section 14)

Every D-LAB5 and E-LAB5 decision as recommended in the prompt, **D-LAB5-01 to D-LAB5-26 and E-LAB5-01 to
E-LAB5-03**, with these readings of the repo:

- D-LAB5-03: the floor is the four restricted classes, pregnancy tests (`test.pregnancy_urine`, already
  `sexual_reproductive_health`), and any test whose new `patient_group` is `tissue` or `cytology` (none exist yet).
  Hepatitis B and C and syphilis are offered as additions at signing (syphilis is already
  `sexual_reproductive_health`).
- D-LAB5-14, D-LAB5-15, D-LAB5-16, D-LAB5-17: recorded; Step 9 is a gap report because no analyser is live on a
  bridge.
- D-LAB5-24: recorded; Step 10 is a gap report because no microbiology module exists.

### 2.2 Additions from STOP 0 (A-decisions)

| #   | Decision              | Recommendation                                                                                                                                                                                                                                                                                 |
| --- | --------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A1  | Reviewed (PR-2)       | A `seen` or `acted` acknowledgement of the **current** report version by a clinician who may acknowledge it (`requireResponsible`). `forwarded` is not review. Phase 1's per-version rule means an amendment needs review again                                                                |
| A2  | Hold seam             | The Phase 1 seam does not exist; `patient_holds` with append-only `patient_hold_events` is new                                                                                                                                                                                                 |
| A3  | Identity (PR-10)      | The patient account is the record (`patient_user_id`); results are those of that user, at any hospital; header identifiers are the name and the patient code                                                                                                                                   |
| A4  | Patient assurance     | Patients stay AAL1 (as found); the Results area asks for a fresh sign-in after the idle limit (operational, 30 minutes)                                                                                                                                                                        |
| A5  | Consent               | Two new consent types in the existing `consent_versions` / `consent_records`: `results_in_app` and `results_sms`. Wording signed by the data protection lead                                                                                                                                   |
| A6  | Guardians             | New `guardian_links` (verified at the hospital by staff). Nothing for under-18s until the minors rule is signed (PR-11); `booking_agents` stays adults-only                                                                                                                                    |
| A7  | Rules as signed data  | Release table, plain words, minors rule, SMS template, delta, panel and pattern rules are **new kinds in `lab_signed_configs`** (versioned, lead slot then CSO). The IPC alert list is a new kind signed by the IPC lead, countersigned by a laboratory lead (a new second slot `lab_counter`) |
| A8  | Delta countersign     | The CSO countersigns **each** delta, panel and pattern rule (the store signs per key), not a set                                                                                                                                                                                               |
| A9  | Method groups         | No method group exists: compare two results only when their `method_code` matches, or the rule says "across methods"                                                                                                                                                                           |
| A10 | Context (DL-5)        | List rows of the existing `procedures` table between the two results; transfusion waits for blood bank                                                                                                                                                                                         |
| A11 | Mislabel              | Nonconformity source `delta` added; `mislabel_confirmed` opens one with code `mislabel`                                                                                                                                                                                                        |
| A12 | IPC roles             | `hospital_designations` gains `ipc_link_nurse` and `surveillance_focal_person`; `ipc.manage` is the `ipc_lead` designation; the ward in-charge is `ward_in_charge_assignments`                                                                                                                 |
| A13 | IPC workspace         | `/ipc`, a top-level desk (the `/referral-governance` pattern): Lab alerts, Alert list, Surveillance                                                                                                                                                                                            |
| A14 | Alert triggers today  | Xpert MTB/RIF answers and the outbreak referral; other list entries can be signed but show "Test not on this menu"                                                                                                                                                                             |
| A15 | SMS delivery          | The existing Africa's Talking module and `notification_dispatches` (no body column) with kind `results_ready`; inbound STOP already writes `sms_opt_outs` and also ends `results_sms`                                                                                                          |
| A16 | Floor in the database | `test_catalogue.patient_group` (nullable) and `private.never_shown(test_id)`; the patient's results read is a `SECURITY DEFINER` function that applies the floor, consent, review, told and hold before the engine adds the signed rules                                                       |
| A17 | Flags                 | `LAB_DELTA_CHECKS`, `IPC_LAB_FEED`, `PATIENT_RESULTS`, `PATIENT_RESULTS_SMS` (per hospital, off). No `labAutoverify` or `ipcMicroFeed` until there is code for them                                                                                                                            |
| A18 | Playwright            | Not added (no new dependency): the headless-Chrome harness with axe stands in, as in Phases 3 and 4                                                                                                                                                                                            |
| A19 | Lab demo data         | A lab-only demo loader (owner request): a hospital explicitly marked demo, every row labelled demo, removable, never on a real hospital                                                                                                                                                        |

## 3. `visibleToPatient` (PR-1) as a decision table

Evaluated in this order; the first failing row is the reason.

| #   | Check                                                                          | Reason code     | Patient line                                 | Doctor chip                                                       |
| --- | ------------------------------------------------------------------------------ | --------------- | -------------------------------------------- | ----------------------------------------------------------------- |
| 1   | Test in a never-shown group                                                    | `never_shown`   | (absent everywhere)                          | In person only (lock)                                             |
| 2   | Patient under 18 and the minors rule unsigned, or the viewer not allowed by it | `minor`         | (absent)                                     | Patient is under 18                                               |
| 3   | Results consent off                                                            | `no_consent`    | (Results area shows the consent switch only) | Patient has not agreed to see results (dashed)                    |
| 4   | Not released (preliminary, cancelled, amendment pending)                       | `not_released`  | Waiting for the lab                          | —                                                                 |
| 5   | Group's signed release rule says "not in app"                                  | `group_rule`    | (absent)                                     | In person only                                                    |
| 6   | Not reviewed (A1)                                                              | `not_reviewed`  | Your doctor looks at this first…             | When you mark it reviewed                                         |
| 7   | Critical without a `patient_told` event                                        | `not_told`      | Your doctor looks at this first…             | After you have spoken to them (amber)                             |
| 8   | Active hold                                                                    | `held`          | Not ready to show yet                        | Held until {date} (amber)                                         |
| 9   | Amended after the patient saw it, correction not acknowledged                  | `being_checked` | This result is being checked                 | —                                                                 |
| 10  | Otherwise                                                                      | `visible`       | the card                                     | Seen by the patient {time} or When you mark it reviewed → visible |

Worked examples (fixtures in `tests/lab/phase-5/patient-release.test.ts`): routine reviewed → visible; routine
unreviewed → `not_reviewed`; critical reviewed, not told → `not_told`; told → visible; held → `held`; corrected →
`being_checked` then visible; referred (group of its test) with a stated turnaround → "Sent to another lab…" while
not released; bedside → its test's group with "Measured on the ward"; HIV viral load → `never_shown`; pregnancy →
`never_shown`; age 10 with no signed rule → `minor`; age 15 with a signed rule allowing the routine group to the
guardian → visible to the guardian; consent off → `no_consent`.

## 4. Release table, floor, plain words

- **Release table** (one signed `patient_release` config per hospital): per group (routine, critical, referred,
  bedside, corrected after seen): in app (after review / after told / never), SMS (yes or no), plus the hold maximum
  in days and the aged-result window in days (both signed; the prompt recommends 7 days for the aged window). The
  never-shown groups appear read-only as "In person only".
- **Floor**: in code (`NEVER_SHOWN_CLASSES`, `NEVER_SHOWN_TEST_CODES`, `NEVER_SHOWN_GROUPS`) and in the database
  (`private.never_shown`); configuration may add tests (a signed list of test codes) and never remove.
- **Plain words** (`plain_words`, key `{concept}:{language}`): what this test is, a short line, action lines per
  band (within, higher, lower, no range), optional harm anchor (only with a signed threshold source), readability
  method and score, translator and back-translator for non-English. A banned-phrase lint runs at save (the list is
  itself signed data; the lint ships with the shape, not with phrases).

## 5. SMS

Template (Appendix A "Results-ready SMS") signed per language (`sms_template`). Sent only when a result becomes
visible for a group whose rule allows SMS, to a patient with `results_sms` consent and a verified phone, at most one
per batching window (operational, 60 minutes), between 06:00 and 19:00 Kampala time (later results wait). Never for
the floor. STOP through the existing inbound route also ends `results_sms`. Sender ID: the deployment's
`AFRICASTALKING_SENDER_ID`, which must be neutral (owner to confirm registration, Q11).

## 6. Delta model

- Rule (`delta_rule`, key = rule id): concept, type (`absolute`, `percent`, `rate_absolute`, `rate_percent`,
  `rcv`), limit (one value or rise and fall), look-back window in hours, basis (`rcv` with CVA source, CVI source
  and Z; `local_patient_percentile` with the data period; `clinical` with the approver), applicability (age band,
  specimen), signed meaning, source line. Signed by the laboratory lead, countersigned by the CSO (A8). A rule
  without a signed limit never runs.
- **RCV calculator**: RCV = √2 × Z × √(CVA² + CVI²). Arithmetic illustration only, **not a proposed limit**: with
  CVA 2.0 %, CVI 1.5 % and Z 1.96, √(4 + 2.25) = 2.5, and RCV = 1.414 × 1.96 × 2.5 = 6.93 %. This lab's CVA comes
  from its Phase 3 QC runs for that analyser and level (a production read at configuration time); CVI from the named
  EFLM entry. The log-normal form (asymmetric) is offered for skewed analytes.
- Outcomes: `physiological_or_treatment`, `transfusion_or_dialysis`, `confirmed_same_patient`,
  `contamination_suspected`, `previous_specimen_suspect`, `recollect`, `mislabel_confirmed`, each with a required
  note and the prompt "Check the previous specimen too".
- Panel rules (`panel_rule`: k of N components) and pattern rules (`pattern_rule`, described in words with the
  lab's own thresholds) inform the same way. **DL-8 trial results on this lab's data**: a production read; the
  trial runs in the product at configuration time and writes nothing.

## 7. Autoverification (Step 9, gap)

AV-2's eight checks, AV-3 states, AV-5 triggers, the shadow plan and the review sample are mapped to ISO 15189:2022
7.4.1.5 (criteria approved, validated, reviewed, identifiable, rapid suspension), CLSI AUTO15 (exclusions,
analyser flags) and CAP GEN.43875/.43878/.43887/.43890 in `autoverify-gap.md`. Nothing is built: there is no
analyser interface.

## 8. IPC alert list seed (for the IPC lead and the laboratory lead to edit and sign)

Each entry's precaution comes from CDC Isolation Precautions Appendix A and must be reconciled with the Uganda IPC
Guidelines 2025 Chapters 5–6 by the IPC lead (not obtained, Q17). IDSR routes come from `idsr-transcription.md` and
must be checked by the surveillance focal person.

| Trigger                                                 | Precaution (CDC App. A)                                                | IPC alert | IDSR route                                                                                                            | On this menu   |
| ------------------------------------------------------- | ---------------------------------------------------------------------- | --------- | --------------------------------------------------------------------------------------------------------------------- | -------------- |
| Xpert MTB/RIF: MTB detected (any RIF)                   | Airborne; stop per policy (improving on therapy and 3 negative smears) | Yes       | `programme_route` (TB programme)                                                                                      | Yes            |
| Xpert MTB/RIF: MTB detected, RIF detected               | Airborne; side room preferred (Uganda 2025 p. 30, per research)        | Yes       | `weekly_item`: HMIS 033b row 15 "Rifampicin resistant TB cases" (DR)                                                  | Yes            |
| Outbreak referral created (Phase 4 RF-7, suspected VHF) | Isolation, case by case with health authorities                        | Yes       | `notify_now`: Table 2 #1                                                                                              | Yes (referral) |
| Cholera rapid test or culture positive                  | Contact if incontinent; "Screening result: confirm" for the rapid test | Yes       | `notify_now`: Table 2 #8; weekly CH                                                                                   | **No**         |
| Measles IgM or PCR positive                             | Airborne, 4 days after rash                                            | Yes       | `notify_now`: Table 2 #16; weekly ME                                                                                  | **No**         |
| _C. difficile_ toxin positive                           | Contact, duration of illness                                           | Yes       | `none`                                                                                                                | **No**         |
| Influenza / SARS-CoV-2 positive                         | Droplet or per policy                                                  | Yes       | `notify_now` only for "Influenza due to new subtype" (#13) and "SARS e.g. COVID-19" (#26) as the focal person decides | **No**         |

Recipients: the IPC link nurses (designation) and the in-charge of the patient's ward (from the open admission);
`notify_now` and `weekly_item` also go to the surveillance focal person. Minimum dataset (IC-5), escalation after
the signed window (operational, 60 minutes), the patient flag (IC-8) and readmission alerts (IC-9) as in the prompt.

## 9. Gate CG: the results section of the governance artifact (for later signature; no mobile build)

A future mobile app may show only what `visibleToPatient` returns, through the same server function; it may cache
nothing beyond the session in encrypted storage, cleared at sign-out; push notifications carry the SMS template's
content only (no test, no value); the never-shown floor and the minors rule apply unchanged; every view is audited
as on the web. **Not signed now**; the owner signs it with the rest of Gate CG.

## 10. Schema diff (migrations 0154–0157) and RLS probe plan

| Migration            | Objects                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| -------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 0154 patient release | `test_catalogue.patient_group` (+ floor CHECK); `private.never_shown(uuid)`; `patient_told_events`, `patient_holds`, `patient_hold_events`, `patient_result_views`, `guardian_links`, `records_requests`, `clinician_notes_to_patient` (append-only where marked); consent types `results_in_app`, `results_sms`; `public.patient_results_for_me()` (definer, floor + consent + review + told + hold); signed kinds `patient_release`, `plain_words`, `minors_rule`, `sms_template`, `patient_floor_additions` |
| 0155 delta           | `delta_flags`, `delta_outcomes` (append-only); signed kinds `delta_rule`, `panel_rule`, `pattern_rule`; NC source `delta`                                                                                                                                                                                                                                                                                                                                                                                      |
| 0156 IPC             | designations `ipc_link_nurse`, `surveillance_focal_person`; signed kind `ipc_alert_entry` (second slot `lab_counter`); `ipc_alerts`, `ipc_alert_actions`, `patient_ipc_flag_events` (append-only), `ipc_list_checks`; live events                                                                                                                                                                                                                                                                              |
| 0157 lab demo        | `lab_demo_marks` (hospital marked demo, rows created by the loader, for removal)                                                                                                                                                                                                                                                                                                                                                                                                                               |

RLS probes (every object × every actor as in prompt §7): patient (own visible results only, never the floor),
guardian (none until the minors rule), clinician (patient-sees state, holds, told events, notes), lab staff (delta
flags and outcomes), laboratory lead, CSO, IPC link nurse (alerts with the minimum dataset; no values), ward
in-charge (their ward), surveillance focal person (IDSR counts and routed alerts), hospital admin (aggregates only),
another hospital's staff, superadmin without break-glass, anonymous, and every client INSERT, UPDATE or DELETE
(denied), plus UPDATE and DELETE on every append-only table (denied, service role included).

## 11. Sign-off packs

Appendix C's templates, pre-filled only from the sources: `idsr-transcription.md` (IDSR items), §8 above
(precautions, with CDC App. A as the cited source). No value is pre-filled for limits, windows, texts or rules.

## 12. Appendix A copy

All strings go into `content/lab-phase-5.ts` with status **draft**; the CSO signs patient and clinician text, the
IPC lead the IPC text. The flags stay off in production while it is a draft.

## 13. Hazard log, tests, rollout, guides, ADRs

- Hazard log: `hazard-log.md` (the 28 seeded hazards, completed, with additions).
- Test plan: every rule ID in `tests/lab/phase-5/*` (pure) and the PGlite lanes `tests/emr-db/lab-phase5-*.test.ts`;
  S1–S43 at their steps; S44–S58 gap reports.
- Rollout per flag: D-LAB5-26's order; `PATIENT_RESULTS` only after Q7 and Q8 clear, with a pilot group of
  consenting adults.
- User guides: patients, clinicians, lab, IPC (Step 11).
- ADRs 0328–0336: one gate (`visibleToPatient`) and the floor; review before release, holds and access requests;
  consent, children and guardians; plain words as signed data; the content-free SMS; delta checks as decision
  support; autoverification (gap, decisions recorded); the IPC feed; the microbiology seam (gap) and the lab demo
  loader.

## 14. Signatures

| Decision                                                                       | Signed                                                                                                        |
| ------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------- |
| D-LAB5-01 to D-LAB5-26, E-LAB5-01 to E-LAB5-03                                 | **Signed as recommended** by the owner (Fadhul, CSO), instruction of 17 Oct 2026 ("use your recommendations") |
| A1 to A19                                                                      | **Signed as recommended**, same instruction                                                                   |
| Release table, plain words, minors rule, SMS template, delta rules, alert list | **Not signed**: data entered and signed in the product by the named signers                                   |
| Legal opinion (Q7), privacy notice, terms, PDPO registration (Q8)              | **Open**: patient access stays closed in production until all are in place                                    |
