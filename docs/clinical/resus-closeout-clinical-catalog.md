# MedSync — Resus · Close-out: Clinical Catalog

### Handover, level of care, capability-aware destination, boarding, after-death tasks, Utstein data, debrief, idle episodes

> **Status:** CSO-signed at GATE A (2026-09-23; `docs/resus-v2-gate-a-proposal.md` §12). Source:
> `docs/resus-v2/resus-desk-v2-clinical-reference.md` Sections 10–12 and 14, re-verified 2026-09-23.
>
> **Posture:** the level-of-care recommender **suggests**; the leader chooses. Choosing below the suggestion
> needs a reason (it builds a record of unmet critical-care need); choosing above does not.

## Source key

| Code       | Source                                                                                                                                             |
| ---------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| ICS-LOC21  | Intensive Care Society, Levels of Adult Critical Care, 2nd ed. (2021) — https://ics.ac.uk/asset/0C68F8B6-D1ED-4B87-8A828592EFDD8021/               |
| RCP-NEWS2  | RCP NEWS2 clinical response chart — https://s3.amazonaws.com/nationalearlywarningscore/news_target.pdf                                             |
| RCUK-ALS25 | RCUK 2025 Adult ALS — https://www.resus.org.uk/professional-library/2025-resuscitation-guidelines/adult-advanced-life-support-guidelines           |
| RCUK-PRC25 | RCUK 2025 Post-resuscitation care — https://www.resus.org.uk/professional-library/2025-resuscitation-guidelines/post-resuscitation-care-guidelines |
| RCUK-ETH25 | RCUK 2025 Ethics — https://www.resus.org.uk/professional-library/2025-resuscitation-guidelines/ethics-guidelines                                   |
| UTS-IH19   | Utstein IHCA template 2019 — https://www.ahajournals.org/doi/10.1161/CIR.0000000000000710                                                          |

## 1. Handover

| ID       | Rule                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      | Source     |
| -------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------- |
| CO-HO-01 | A structured handover tool is used; the desk drafts an **SBAR** from the record, editable before signing                                                                                                                                                                                                                                                                                                                                                                                                  | RCUK-ALS25 |
| CO-HO-02 | **S** — who, trigger, current state and mode (stabilised / post-ROSC), treatment-limitation decision if any. **B** — AMPLE, weight if recorded. **A** — final A–E states with key findings; last vitals set + trend + NEWS2; arrest summary if any (first rhythm, shocks, drugs, time to ROSC, total CPR time, sustained or not); lines, tubes, devices. **R** — outstanding actions carried forward, targets (post-ROSC bundle), pending investigations, suggested vs chosen level of care, escort needs | design     |
| CO-HO-03 | The draft is deterministic: the same record gives the same text (snapshot-tested)                                                                                                                                                                                                                                                                                                                                                                                                                         | design     |

## 2. Levels of care (ICS 2021 — care a patient **needs**, not where they are)

| Level | Meaning (paraphrased)                                                                                                                                                       | ICS examples                                                                                                                                                         |
| ----- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Ward  | Needs met on an acute ward, incl. patients at risk of deterioration                                                                                                         | DKA improving without organ support; ED hypotension that responded to fluids                                                                                         |
| L1    | Enhanced care: more observation/intervention incl. basic single-organ support; step-down; outreach-dependent                                                                | vasopressor (peripheral/central) but otherwise stable; NIV/CPAP for single-organ failure; close monitoring after major surgery (arterial line)                       |
| L2    | Basic support for ≥ 2 organs, or one organ at an advanced level (other than advanced respiratory); L1 needs + severe agitation; major uncorrected physiological abnormality | NIV/CPAP + vasopressor; RRT outside a renal setting; L1 needs + hyperactive delirium; BMI > 40 on NIV/CPAP or a vasopressor                                          |
| L3    | Advanced respiratory support alone; ≥ 2 organs at an advanced level; chronic organ impairment + acute failure of another; L2 needs + delirium                               | mechanical ventilation; RRT + vasopressor or respiratory support; NIV/CPAP + vasopressor with agitation or at risk of escalation; BMI > 40 on NIV/CPAP + vasopressor |

## 3. NEWS2 response (reuses the triage engine's verified `scoreNews2`; no re-implementation)

| ID         | Score                         | Response                                                                                                                                                     | Source    |
| ---------- | ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------- |
| CO-NEWS-01 | **≥ 7**                       | Emergency response; continuous monitoring; assessment by a critical-care-competent team incl. advanced airway skills; consider transfer to level 2 or 3 care | RCP-NEWS2 |
| CO-NEWS-02 | **5 or more** (below 7)       | Urgent response threshold; at least hourly observations                                                                                                      | RCP-NEWS2 |
| CO-NEWS-03 | **3 in any single parameter** | At least hourly; the nurse informs the medical team, who decide whether to escalate                                                                          | RCP-NEWS2 |
| CO-NEWS-04 | **1–4**                       | At least 4–6-hourly                                                                                                                                          | RCP-NEWS2 |
| CO-NEWS-05 | **0**                         | At least 12-hourly                                                                                                                                           | RCP-NEWS2 |

## 4. Recommender rules (suggestion + reasons; the leader chooses)

The suggestion is the **highest** level any matching rule gives. Each reason carries its rule ID and source.

| ID     | Condition (from the record)                                                                     | Suggested level                                | Source                           |
| ------ | ----------------------------------------------------------------------------------------------- | ---------------------------------------------- | -------------------------------- |
| CO-R1  | Post-ROSC and not obeying commands, or intubated after arrest                                   | **L3**                                         | RCUK-PRC25, ICS-LOC21            |
| CO-R2  | Post-ROSC, awake (obeys commands), brief arrest, stable                                         | **≥ L2** with continuous ECG and cause work-up | CSO decision (D6)                |
| CO-R3  | Invasive mechanical ventilation, or an ETT in situ at close-out                                 | **L3**                                         | ICS-LOC21                        |
| CO-R4  | NIV/CPAP + vasopressor + agitation/delirium, or at risk of escalation                           | **L3**                                         | ICS-LOC21                        |
| CO-R5  | NIV/CPAP + vasopressor                                                                          | **L2**                                         | ICS-LOC21                        |
| CO-R6  | L1-type needs + hyperactive delirium                                                            | **L2**                                         | ICS-LOC21                        |
| CO-R7  | NIV/CPAP alone (single organ)                                                                   | **L1**                                         | ICS-LOC21                        |
| CO-R8  | Vasopressor alone, otherwise stable                                                             | **L1**                                         | ICS-LOC21                        |
| CO-R9  | Refractory anaphylaxis (no improvement after 2 IM doses → IV adrenaline infusion)               | **≥ L2**                                       | existing signed anaphylaxis text |
| CO-R10 | GCS ≤ 8 needing airway protection; status epilepticus needing anaesthetic infusion / intubation | **L3**                                         | existing D engine, ICS-LOC21     |
| CO-R11 | NEWS2 ≥ 7 persisting at close-out                                                               | consider **L2/L3** (suggests L2)               | RCP-NEWS2                        |
| CO-R12 | Stabilised, no organ support, NEWS2 < 5 and no single parameter scoring 3                       | **Ward** (with the NEWS2 monitoring frequency) | ICS-LOC21, RCP-NEWS2             |
| CO-R13 | RRT needed (recorded) with a vasopressor or respiratory support                                 | **L3**                                         | ICS-LOC21                        |
| CO-R14 | RRT needed alone, outside a renal setting                                                       | **L2**                                         | ICS-LOC21                        |
| CO-R15 | BMI > 40 context and NIV/CPAP **or** a vasopressor                                              | **L2**                                         | ICS-LOC21                        |
| CO-R16 | BMI > 40 context and NIV/CPAP **and** a vasopressor                                             | **L3**                                         | ICS-LOC21                        |

No matching rule → no suggestion ("insufficient data — choose"), never a silent Ward.

**Additional destinations flagged alongside the level:**

| ID        | Trigger                                                                                      | Destination                     |
| --------- | -------------------------------------------------------------------------------------------- | ------------------------------- |
| CO-DST-01 | STEMI / suspected coronary occlusion recorded (C `ecg_ischaemia`, PR-C-05)                   | Cath lab                        |
| CO-DST-02 | Uncontrolled haemorrhage / surgical source (C haemorrhagic shock type, E occult haemorrhage) | Theatre                         |
| CO-DST-03 | Pregnancy-related cause (pregnancy confirmed/postpartum context)                             | Obstetric theatre / labour ward |
| CO-DST-04 | Head injury, or suspected non-coronary arrest cause                                          | CT before the unit              |

Condition-specific triggers not listed (severe DKA markers, eclampsia on magnesium, severe TBI) are **NOT
ENCODED** until the CSO verifies thresholds.

**Capability mapping.** Each unit declares what it can deliver: continuous ECG, arterial line, vasopressors,
NIV/CPAP, invasive ventilation, RRT; adult/paediatric. Required capabilities per level:

| Level | Required capabilities (any unit declaring all of them qualifies)            |
| ----- | --------------------------------------------------------------------------- |
| Ward  | none                                                                        |
| L1    | continuous ECG, vasopressors                                                |
| L2    | continuous ECG, arterial line, vasopressors, NIV/CPAP                       |
| L3    | continuous ECG, arterial line, vasopressors, NIV/CPAP, invasive ventilation |

RRT-driven rules add `rrt`. No qualifying unit → suggest **transfer to a higher-level facility**. Below-suggestion
reasons: `no_bed`, `ceiling_of_care`, `family_declined`, `transfer_arranged`, `clinical_judgement` (free text).

## 5. Boarding

| ID        | Rule                                                                                                                      | Source    |
| --------- | ------------------------------------------------------------------------------------------------------------------------- | --------- |
| CO-BRD-01 | Destination decided but the patient cannot leave yet → phase **boarding**; the resus clock stops, a boarding clock starts | design    |
| CO-BRD-02 | Monitoring cadence prompt follows the NEWS2 response (CO-NEWS-01..05)                                                     | RCP-NEWS2 |
| CO-BRD-03 | Deterioration → **Re-activate resus** (back to the survey, same episode)                                                  | design    |
| CO-BRD-04 | Boarding time = disposition decision → leaving resus                                                                      | design    |

## 6. After-death tasks (a separate record, editable up to 24 h after close — D16)

| ID        | Task                                                                                                                          | Source          |
| --------- | ----------------------------------------------------------------------------------------------------------------------------- | --------------- |
| CO-ADT-01 | Family informed (who, when, where; offered to see the patient; cultural and religious needs)                                  | RCUK-ETH25      |
| CO-ADT-02 | Senior / consultant informed                                                                                                  | design          |
| CO-ADT-03 | Reportable-death screen (per D10); if reportable, leave lines, tubes and devices in place                                     | CSO/legal (D10) |
| CO-ADT-04 | Last offices                                                                                                                  | design          |
| CO-ADT-05 | Property handed over                                                                                                          | design          |
| CO-ADT-06 | Certificate of cause of death (pending intent to the encounter record; not built)                                             | design          |
| CO-ADT-07 | Mortuary transfer                                                                                                             | design          |
| CO-ADT-08 | **Immediate team debrief**                                                                                                    | RCUK-ETH25      |
| CO-ADT-09 | Staff welfare check                                                                                                           | design          |
| CO-ADT-10 | Utstein data completed                                                                                                        | UTS-IH19        |
| CO-ADT-11 | Organ donation after cardiac arrest — hidden unless the hospital enables it; must follow local legal and ethical requirements | RCUK-PRC25      |

## 7. Utstein IHCA core data (immutable snapshot per arrest, written at close)

| ID        | Field                                                                                            |
| --------- | ------------------------------------------------------------------------------------------------ |
| CO-UTS-01 | Monitored at the time of arrest; witnessed                                                       |
| CO-UTS-02 | Time of arrest (collapse); time CPR started                                                      |
| CO-UTS-03 | First documented rhythm                                                                          |
| CO-UTS-04 | Defibrillator applied; shocks given; time of first shock                                         |
| CO-UTS-05 | Time of first adrenaline                                                                         |
| CO-UTS-06 | Airway used (highest level)                                                                      |
| CO-UTS-07 | ECPR (capability-gated)                                                                          |
| CO-UTS-08 | Any ROSC; sustained ROSC (20 min); time CPR stopped; reason CPR stopped (survived event vs died) |
| CO-UTS-09 | A prior not-for-CPR / treatment-limitation decision, if one existed                              |

Survival to discharge / 30 days and neurological outcome link later through the inpatient module.
⚠ The 2019 template's full core list could not be re-read (publisher 403): verify against the paper before
data are exported.

## 8. Data-driven debrief (pre-computed, RCUK-ALS25 "data-driven and performance-focused")

| ID        | Metric                                                            |
| --------- | ----------------------------------------------------------------- |
| CO-DBF-01 | Time to first shock (from arrest)                                 |
| CO-DBF-02 | Time to first adrenaline (from arrest)                            |
| CO-DBF-03 | Adrenaline interval adherence (share of intervals inside 3–5 min) |
| CO-DBF-04 | Rhythm-check interval adherence (share of cycles ≤ 2:15)          |
| CO-DBF-05 | Time to advanced airway; capnography used                         |
| CO-DBF-06 | Reversible causes addressed (tiles not left `not_assessed`)       |
| CO-DBF-07 | Compressor rotation (swaps per rhythm check)                      |

## 9. Idle episodes (D14 — nothing auto-closes)

| ID         | Rule                                                                                                                                                                   |
| ---------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| CO-IDLE-01 | No activity ≥ **2 h** → flagged on the board and in the header ("No activity 2 d 16 h — close or continue?")                                                           |
| CO-IDLE-02 | ≥ **12 h** → in-app notice to the opener, current leader and ward in-charges (once per episode)                                                                        |
| CO-IDLE-03 | ≥ **24 h** → administrative close enabled for the in-charge / head of department, reason required; excluded from clinical statistics, included in data-quality reports |

## Verification (2026-09-23)

ICS-LOC21 (official ICS copy), RCP-NEWS2 and RCUK-PRC25 / ETH25 values matched verbatim. NEWS2's middle band is
"5 or more" (evaluated after ≥ 7). ICS's BMI > 40 cases were added as CO-R15 / CO-R16. ICS also lists long-term
advanced respiratory support and tracheostomy weaning as L2 — out of the resus scope, not encoded. UTS-IH19 not
re-readable (see ⚠ above).
