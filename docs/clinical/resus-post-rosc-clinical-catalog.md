# MedSync — Resus · Post-ROSC mode: Clinical Catalog

### The resus-phase post-resuscitation bundle, targets and the post-ROSC survey pins

> **Status:** CSO-signed at GATE A (2026-09-23; `docs/resus-v2-gate-a-proposal.md` §12). Source:
> `docs/resus-v2/resus-desk-v2-clinical-reference.md` Section 7, re-verified 2026-09-23.
>
> **Posture:** decision support. The bundle is a checklist of what the team does; each item can be **done**,
> **not indicated**, or **not available here** (a distinct state that feeds capability data). The desk makes no
> prognostic statement anywhere.
>
> **When it shows:** from the moment ROSC is recorded (RCUK: care starts "immediately after sustained ROSC,
> regardless of location"; "sustained" here means circulation that is holding, not the 20-minute Utstein
> reporting definition — CSO-confirmed reading).

## Source key

| Code       | Source                                                                                                                                                                     |
| ---------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| RCUK-PRC25 | RCUK 2025 Post-resuscitation care (adapts ERC-ESICM 2025) — https://www.resus.org.uk/professional-library/2025-resuscitation-guidelines/post-resuscitation-care-guidelines |
| RCUK-SC25  | RCUK 2025 Special circumstances — https://www.resus.org.uk/professional-library/2025-resuscitation-guidelines/special-circumstances-guidelines                             |
| RCUK-ETH25 | RCUK 2025 Ethics — https://www.resus.org.uk/professional-library/2025-resuscitation-guidelines/ethics-guidelines                                                           |

## Bundle

| ID          | Domain | Item (checklist text)                                                                                                                                                                             | Target / number        | Source                 |
| ----------- | ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------- | ---------------------- |
| PR-A-01     | A      | Comatose, or another indication for sedation/ventilation → tracheal intubation by an experienced operator, confirmed by waveform capnography                                                      | —                      | RCUK-PRC25             |
| PR-A-02     | A      | No skilled intubator available → keep / insert a supraglottic or basic airway until one is                                                                                                        | —                      | RCUK-PRC25             |
| PR-A-03     | A      | Brief arrest with immediate return of normal cerebral function and breathing: airway support may not be needed; give O₂ if SpO₂ < 94 %                                                            | SpO₂ < 94 %            | RCUK-PRC25             |
| PR-B-01     | B      | Maximum available O₂ until SpO₂ is reliable or PaO₂ measured, then titrate                                                                                                                        | —                      | RCUK-PRC25             |
| PR-B-02     | B      | Titrate to **SpO₂ 94–98 %** (D2)                                                                                                                                                                  | 94–98 %                | RCUK-PRC25             |
| PR-B-03     | B      | Or **PaO₂ 10–13 kPa (75–100 mmHg)**; avoid hypoxaemia **PaO₂ < 8 kPa (60 mmHg)** and hyperoxaemia                                                                                                 | 10–13 kPa; < 8 kPa     | RCUK-PRC25             |
| PR-B-04     | B      | Caveat, always shown with the SpO₂ target: pulse oximetry can overestimate saturation in darker skin tones, and low-flow states give poor signal                                                  | —                      | RCUK-PRC25             |
| PR-B-05     | B      | Normocapnia **PaCO₂ 4.7–6.0 kPa (35–45 mmHg)**; ABG + ETCO₂ if ventilated                                                                                                                         | 4.7–6.0 kPa            | RCUK-PRC25             |
| PR-B-06     | B      | Lung-protective ventilation **Vt 6–8 mL/kg ideal body weight**                                                                                                                                    | 6–8 mL/kg IBW          | RCUK-PRC25             |
| PR-C-01     | C      | 12-lead ECG                                                                                                                                                                                       | —                      | RCUK-PRC25             |
| PR-C-02     | C      | Blood pressure target **MAP ≥ 65 mmHg and SBP > 100 mmHg** (house default D3: satisfies RCUK "SBP > 100 or MAP > 60–65"; the AHA MAP ≥ 65 figure could not be re-read and is not cited on screen) | MAP ≥ 65 and SBP > 100 | RCUK-PRC25 (D3)        |
| PR-C-03     | C      | Arterial line; echo as soon as possible; fluids / noradrenaline / dobutamine by need — infusions are category-level, **no rate shown**                                                            | —                      | RCUK-PRC25             |
| PR-C-04     | C      | Avoid hypo- and hyperkalaemia; **no routine steroids**; **no routine antiarrhythmic prophylaxis**                                                                                                 | —                      | RCUK-PRC25             |
| PR-C-05     | C      | Clear ST elevation or high suspicion of coronary occlusion → **immediate coronary angiography**                                                                                                   | —                      | RCUK-PRC25             |
| PR-C-06     | C      | Sustained ROSC + ST elevation → angiography ± PCI **within 120 min** of diagnosis; **consider fibrinolysis** in non-PCI-capable settings if a longer delay is expected                            | ≤ 120 min              | RCUK-SC25              |
| PR-C-07     | C      | Without ST elevation: consider immediate angiography if unstable or ongoing ischaemia; if stable with no high probability of occlusion, cath-lab evaluation can be delayed                        | —                      | RCUK-SC25              |
| PR-D-01     | D      | GCS; **obeys commands (motor 6)?** Yes / No — comatose. Drives the level-of-care suggestion (R1, R2)                                                                                              | motor 6                | RCUK-PRC25             |
| PR-D-02     | D      | Glucose by the standard protocol (no post-ROSC glucose number is encoded)                                                                                                                         | NOT ENCODED            | RCUK-PRC25             |
| PR-D-03     | D      | Seizures: **levetiracetam or sodium valproate** first-line plus sedation; EEG where available; **no seizure prophylaxis**; short-acting sedation                                                  | —                      | RCUK-PRC25             |
| PR-E-01     | E      | Comatose: actively prevent fever, target **≤ 37.5 °C** (for 36–72 h in ICU)                                                                                                                       | ≤ 37.5 °C              | RCUK-PRC25             |
| PR-E-02     | E      | Do **not** actively rewarm a comatose patient at **32–36 °C**; no routine rapid large-volume cold IV fluids                                                                                       | 32–36 °C               | RCUK-PRC25             |
| PR-E-03     | E      | Head-up 30°; no routine prophylactic antibiotics (low threshold if pneumonia suspected)                                                                                                           | 30°                    | RCUK-PRC25             |
| PR-CAUSE-01 | Cause  | Echo + dual-phase whole-body CT (head, neck, chest, abdomen, pelvis, CTPA) when a non-coronary cause is suspected or pre-arrest symptoms point elsewhere; CT after a negative angiogram           | —                      | RCUK-PRC25             |
| PR-NEVER-01 | —      | **Neuroprognostication is never done in resus** (multimodal, ≥ 72 h after ROSC, in ICU). The desk shows no prognostic statement; withdrawal-of-therapy discussion is separate from prognosis      | ≥ 72 h (text)          | RCUK-PRC25             |
| PR-FAM-01   | Family | Information for the patient and co-survivors; offer family presence with a trained team member designated to support them                                                                         | —                      | RCUK-PRC25, RCUK-ETH25 |

## Post-ROSC survey pins (after "Continue survey (post-ROSC)")

| ID       | Step | Pinned target                                                        |
| -------- | ---- | -------------------------------------------------------------------- |
| PR-PIN-B | B    | SpO₂ 94–98 % (with the oximetry caveat) · PaCO₂ 4.7–6.0 kPa          |
| PR-PIN-C | C    | MAP ≥ 65 and SBP > 100 · 12-lead ECG · STEMI → angiography ≤ 120 min |
| PR-PIN-D | D    | Obeys commands? · glucose · seizures (levetiracetam / valproate)     |
| PR-PIN-E | E    | Prevent fever ≤ 37.5 °C · do not rewarm 32–36 °C                     |

## Divergences (AHA 2025 Part 11 could not be re-read — every official route returned 403)

| Topic       | RCUK / ERC-ESICM 2025                                   | AHA 2025 (from the CSO reference, unverified here) | House default                                     |
| ----------- | ------------------------------------------------------- | -------------------------------------------------- | ------------------------------------------------- |
| SpO₂        | 94–98 %                                                 | 90–98 % (secondary source)                         | **94–98 %** (D2)                                  |
| BP          | SBP > 100 or MAP > 60–65                                | MAP ≥ 65                                           | **MAP ≥ 65 and SBP > 100** (D3)                   |
| Temperature | prevent fever ≤ 37.5 °C, 36–72 h; don't rewarm 32–36 °C | control 32–37.5 °C ≥ 36 h                          | resus phase: prevent fever, don't rewarm 32–36 °C |

No AHA number is displayed.

## Verification (2026-09-23)

Every RCUK-PRC25 and RCUK-SC25 value above matched the primary page verbatim. The RCUK-ETH25 family-presence
wording is "a trained team member who can be designated to this task" (the catalog follows it).
