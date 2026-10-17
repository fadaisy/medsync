# Step 9 gap report: selective autoverification

17 Oct 2026. Prompt Step 9 builds autoverification (§5.8, §5.9; AV-1..AV-10) for one test on one analyser **only
if** an analyser is live on the Phase 4 bridge after its signed shadow run, delta checks have been live on that test
for the period D-LAB5-14 sets (three months), and QC is current on that analyser (Q14). **None of the three holds:**
Phase 4 Step 10 stopped at its own gap report (`docs/lab/phase-4/analyser-gap.md`: no maker's interface document), so
no result in MedSync has ever arrived from an analyser, and delta checks (Step 4) are built but not yet live anywhere.
Step 9 therefore stops here. **No `labAutoverify` flag, table, rule set or service identity is written.** Nothing
releases a result without a person.

## Why this order is not negotiable

Autoverification is safe only on results that a machine produced and nobody typed (AV-2 check 1). A rule that
releases typed results would release a transcription error with the authority of a rule. ISO 15189:2022 7.4.1.5
asks for criteria that are defined, approved, validated before use and reviewed, records that show a result was
released automatically, and a way to suspend it at once. CLSI AUTO15 (2019) excludes blood bank and microbiology and
expects analyser flags to stop a result. CAP GEN.43875, .43878, .43887 and .43890 ask for validation before use and
after every change, rule identity on the record, and rapid suspension. Every one of these depends on an interfaced
analyser that does not exist here yet.

## AV-2, check by check: what MedSync already has

| AV-2 check                                                       | Built and live (phase)                                                                          | Missing                                                          |
| ---------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| 1. Every component from the analyser, unedited                   | `lab_result_snapshots` has the column for it                                                    | The analyser bridge (Phase 4 Step 10); `interfaced` is never set |
| 2. QC accepted and current today; no QC hold                     | `qcStatusFor` and the QC hold (Phase 3)                                                         | QC tied to an interfaced analyser's own runs                     |
| 3. No analyser flag or message                                   | Nothing                                                                                         | Flags arrive only with the interface document's codes            |
| 4. Inside the measuring range and the snapshotted range          | Reference ranges snapshotted on every value (Phase 1, Phase 2 catalogue v2); entry-check limits | Analytical measuring range per analyser (from the maker)         |
| 5. No critical value                                             | Signed critical limits and the alert path (Phase 1)                                             | Nothing                                                          |
| 6. Every delta, panel and pattern rule passed                    | Delta checks with recorded decisions (Phase 5 Step 4)                                           | Three months live on the test (D-LAB5-14)                        |
| 7. Specimen received, no rejection, no open NC, in time, indices | Specimen events, rejection, nonconformities (Phases 1, 3)                                       | Serum indices from the analyser                                  |
| 8. Patient not excluded (first result, PR-3 groups)              | `previousResult` (delta engine) and the never-shown floor (Step 6)                              | Rule-set exclusions                                              |

## What the build will be, once the preconditions hold

- **Data (one migration):** `autoverify_rule_sets` as a new `lab_signed_configs` kind (test, analyser, the AV-2 limits
  that may only narrow, the exclusions, the shadow period and count, the daily review sample size, the revalidation
  interval; lead signs, CSO countersigns); `autoverify_states` (off, shadow, on, suspended, append-only events with
  reason and actor); `autoverify_decisions` (one row per evaluated result: rule set version, every check with its
  value, the decision, and in shadow what the technologist then did).
- **Engine (pure, `lib/lab/autoverify.ts`):** `evaluate(result, ruleSet, context)` returns every check's value and the
  first failing check by name, so S44 names it; `promotable(shadowRows)` is true only with zero rows where the rule
  would release and the technologist changed or held (AV-3, S50); `suspendTriggers` lists the AV-5 events.
- **Release by rule (AV-6):** a release event by the service identity `svc.autoverify` through the same
  `releaseResults` write, carrying the rule set version; downstream it is an ordinary release. The patient still sees
  it only after a clinician's review (PR-2, S54).
- **Suspension (AV-4, AV-5):** "Suspend now" for anyone who may release, effective for the next result; resume needs
  `lab.manage` and a passed QC run. Automatic on QC rejection, the analyser down or the bridge silent, a mapping change,
  a range change, a delta-rule change; a rule-set change returns it to shadow.
- **Daily review (AV-7) and revalidation (AV-8):** a signed number of released-by-rule results drawn each day; any change
  opens an amendment and suspends the rule set.
- **Never (AV-10):** blood bank, microbiology, typed, referred, bedside or qualitative results.

## Decisions already recorded (GATE A)

D-LAB5-14 (readiness: interfaced only, three months of live delta checks, analyser past its Phase 4 shadow, then a
four-week or 500-result shadow, whichever is later, with zero changed), D-LAB5-15 (scope: normal results only),
D-LAB5-16 (suspension), D-LAB5-17 (daily review sample, revalidation at least yearly).

## To resume Step 9

1. Finish Phase 4 Step 10: the maker's LIS document for the first analyser, the bridge, its GATE S and shadow run.
2. Switch delta checks on for the chosen test and keep them live for three months (D-LAB5-14), with the monthly review
   of how often each rule flags (DL-8).
3. Choose one test on that analyser with current QC; the laboratory lead drafts the rule set; the CSO countersigns.
4. Build as above, run S44–S54, then the shadow, and report STOP 9 with the shadow comparison and the signatures.
