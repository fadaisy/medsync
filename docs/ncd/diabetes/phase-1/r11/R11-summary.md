# R11 review: summary

Independent read of `k_r10.py` (V01 to V16), `k_signed.py`, `k_sources.py`, `k_ug2026.py` and their test patients. Every finding was shown on a patient run through `build.py`'s `run_vignette`. Six of them were also run on the app's TS runtime (`runDiabetesPack`, `r11/ts_check.ts`), and both gave the same results. Findings are in `R11-review.json`. The scratch scripts are in this folder: `t1.py` to `t12.py`, plus `grid11.py`, which is R10's monotonicity grid re-run on this build.

The build passes (0 errors, floor 0 silent). An empty record fires nothing at any site or age. An ordinary well patient gets nothing same-day.

## Counts

| Severity | Count |
|---|---|
| Critical | 1 |
| Major | 11 |
| Minor | 11 |

## V01 to V16

| Item | Holds? | Note |
|---|---|---|
| V01 | Yes, in part | All five rules now read 'acutely unwell'. The child with no glucose gets the interrupt. But the displays of 13, 23 and 23D still name only vomiting or pain, and three items fire for one event (W14). |
| V02 | Yes | The surrogates stand down under a relaxed or 'avoid symptoms' plan. Bands read only beside a target that is shown, and a low band always shows. A new contradiction comes from UG-16 and D-DM-40 instead (W03, W04). |
| V03 | Yes | |
| **V04** | **No** | 23R stands down on acetone or dehydration, but 24B also stands down on normal ketones, so the worse patient gets nothing (W01, critical). Abdominal pain is still not covered (W14). |
| V05 | Yes | 'Creatinine not in steady state' raises the sick-day flags and the eGFR caveat. |
| V06 | Yes | |
| V07 | Yes | Superseded by the UG-03 wording, which brings in a new contradiction (W11). |
| V08 | Yes | |
| V09, V10, V11 | Yes | |
| V12 | No | D-DM-41 promises 'same day' for a vomiting insulin-treated adult. W01's patient gets nothing. |
| **V13** | **No** | Removing `tgt_tight_su_ins` lets a sulfonylurea user have the tight target (W02). R10's own V13 patient still has no HbA1c target (W13). |
| V14 | Yes | |
| V15, V16 | Yes | |

## Top findings in plain words

1. **Critical (W01).** Take a person on insulin who is vomiting, has a glucose of 5 to 9 and normal blood ketones. That person gets a same-day review. If the same person is also dehydrated, or smells of acetone, they get nothing at all. The review rule hands the patient to the interrupt rule, and the interrupt rule stands down because the ketones are normal. R10's grid, re-run, finds 16 cells like this.
2. **Targets that contradict each other.**
   - A sulfonylurea user can again be given the tight HbA1c target below 6.5%. The target's own wording says it never applies to them (W02).
   - The new 2026 target for people aged 60 and over (HbA1c below 8%) ignores the agreed plan. It shows under 'avoid symptoms', next to a tight 6.5% target, and it replaces an agreed general target (W03).
   - The older-adult floor says a fasting glucose of 4.1 on gliclazide is 'not at target', while the band beside it says 'at target'. At a district site, where only the meter is used, the floor never fires (W04).
   - Inpatients see the outpatient fasting target (below 7.0, 'above target' at 8.0) next to the 2026 inpatient range of 5.6 to 10 (W09).
3. **Pregnancy.**
   - A woman with gestational diabetes is told to lose 7% of her body weight under 'prediabetes' (W05).
   - The pregnancy ketoacidosis rule treats an unanswered pregnancy question as 'not pregnant', even though the patient has symptoms (W07).
   - A pregnant woman with no recorded gestation gets no screening prompt (W12).
   - Previous gestational diabetes was signed as a restricted fact (D-DM-30) but is not restricted in the content (W08).
4. **Under 16.** The ketoacidosis and hyperosmolar interrupts now tell staff to 'start intravenous fluids before transfer' for children (W06).
5. **Diagnosis.**
   - A point-of-care HbA1c still diagnoses, through the WHO set in `metNowSets` (W10).
   - INCID-02 says 'confirm it' when both diagnostic sets are already met on a symptomatic fasting value (W11).
