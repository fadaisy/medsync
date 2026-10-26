# Pharmacy Phase 3: STOP 0 report and GATE A proposal

Branch `feat/pharmacy-clinical` (worktree `~/Desktop/medsync-pharmclose`), cut from `origin/main`. That commit has Phase 1, Phase 2 (PR #250) and Tide on it. Written 25 Oct 2026. Numbers claimed: migrations 0210–0229, ADRs 0390–0401.

## STOP 0 (answered from the repo; Q12 and Q13 need production and the pilot site)

| Q           | Finding                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Q1          | Phase 1 is merged with all three merges, so Step 9 (the patient list) is built. Phase 2 is merged too, so the reaction-to-batch link is real.                                                                                                                                                                                                                                                                                                                                                                             |
| Q2 (P2)     | The check store is `prescriptions.check_answers` (jsonb, 0088), and a confirm reason is required when it is not empty. One more check fits with no schema change.                                                                                                                                                                                                                                                                                                                                                         |
| Q3 (P4, P5) | `allergies` (0071) is versioned and append-only, with `verification` (unconfirmed, confirmed or refuted; refuted needs a reason), `allergy_type` (allergy or intolerance), `criticality` (including unable_to_assess), `substance_kind` (ingredient or class), `substance_code` and `sensitivity` (restricted). **D-PH3-13 needs no migration:** confirming or refuting is a new version. **Gap:** the prescribing allergy check does not read `verification`, so a refuted entry still fires. Phase 3 fixes that (AR-4). |
| Q4 (P6)     | `drugClass` lives in the formulary, and no signature is recorded for it. So class-level entries wait for the drug-class map (CC-5).                                                                                                                                                                                                                                                                                                                                                                                       |
| Q5 (P7)     | Medicines before admission are `medication_statements`, with `reconciliation` set to Continue, Held or Stopped (0088).                                                                                                                                                                                                                                                                                                                                                                                                    |
| Q7 (P10)    | `medication_administration_records.emr_prescription_id` (0088) links each charted dose to its line, with `administered_at`.                                                                                                                                                                                                                                                                                                                                                                                               |
| Q8 (P11)    | **There is no discharge event.** `admissions` (0091) ends at arrived or cancelled. D-PH3-16 therefore takes its fallback: a discharge prescription marker, or **Prepare medicines for home** on the plan.                                                                                                                                                                                                                                                                                                                 |
| Q9 (P12)    | Prescriptions carry `indication` (0039) and `duration` (0074). There is no stop date; the AMS review stores the one a prescriber types.                                                                                                                                                                                                                                                                                                                                                                                   |
| Q6, Q11     | The lab's culture orders and the hub's committees are read at Step 7 (stewardship), which is outside the first merge.                                                                                                                                                                                                                                                                                                                                                                                                     |
| Q12, Q13    | Production counts and the pilot site's NDA form are owner inputs and are **not invented**. The candidate files hold 78 interaction pairs, 384 AWaRe rows, the PCNE domains and the 38 NDA form fields.                                                                                                                                                                                                                                                                                                                    |
| Q14         | The CDP harness, axe and the PGlite lane are used, without Playwright (D-TW-14).                                                                                                                                                                                                                                                                                                                                                                                                                                          |

## GATE A

- **Content (CC-1 to CC-5).** New tables `pharmacy_content_entries` and `pharmacy_content_signatures`. Signatures are append-only, and each signer proves their second factor through `pharmacy_attestations`. `pharmacy_content_imports` makes the import idempotent, keyed on the file's hash. Only `in_force` entries are read.
- **Interactions (IX-1 to IX-10).** A pure engine over a snapshot of the patient's current medicines:
  - active lines;
  - doses charted within the signed look-back;
  - supplies within the signed look-back;
  - Continue medicines before admission.

  Answers go in `check_answers`. `pharmacyChecksState.interactionsChecked` becomes `none` or `partial` with a count, and is never complete.

- **Interventions (IV-1 to IV-5).** Reports are projections over Phase 1 queries. `pharmacy_query_pcne` is append-only and hidden until the PCNE permission is on record.
- **Later merges, per the prompt:** stewardship and reactions (Steps 7 and 8), and reconciliation (Step 9).
- **Permission map v4:** no new `pharmacy.*` permission. AMS committee and infection prevention rights come from hub assignments.
- **Packs and strings:** every Appendix D pack is unsigned until signed in Clinical content. Every Appendix B string goes into `content/pharmacy-clinical.ts` as draft. The hazard log is Appendix C.

## Decisions to sign

- D-PH3-01 to D-PH3-25 and E-PH3-01 to E-PH3-04, as recommended in Section 14 of the prompt. **No clinical value is proposed:** pairs, intervals, windows and mappings are signed later as content, entry by entry.
- **D-PH3-13 as found:** the existing columns are reused, and no entry changes meaning.
- **D-PH3-16 as found:** there is no discharge event, so the trigger is a discharge prescription marker or **Prepare medicines for home**.
- **D-PH3-26 (signers):** the CSO signs alone by recorded exception until a pharmacist reviewer and an AMS chair are named (ADR 0281 precedent). The pack shows that exception.

## Signatures

Signed by Fadhul (CSO), 25 Oct 2026, in session:

- D-PH3-01 to D-PH3-25 and E-PH3-01 to E-PH3-04, as recommended;
- D-PH3-13 and D-PH3-16 as found;
- D-PH3-26.

**Scope chosen by the owner:** the first merge (Steps 2 to 6) now, and a stop before stewardship, reactions and reconciliation.
