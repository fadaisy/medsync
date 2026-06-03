# MedSync — Resus · EXPOSURE: Clinical Findings & Action Catalog

### Emergency-medicine-grade content for the Exposure (E) step of the ABCDE resus surface

> **Purpose.** The complete clinical content for the **Exposure (E)** step — the final ABCDE step: every assessable finding, what it means, and how a finding (or combination) triggers a specific action — for the same findings→action→state engine as A/B/C/D, with correct "what got missed" emergency medicine. This is the **medicine**; `resus-exposure-step-kickoff.md` is the build. **E is done after A, B, C, D — then you RETURN TO A and cycle the whole assessment.** E is the **"expose and examine head-to-toe to find what the first four steps missed"** step.
>
> **Guideline basis (current — verify at build):** **Resuscitation Council UK ABCDE — Exposure**; **ERC & AHA Guidelines 2025 / ILCOR 2025 CoSTR**; **accidental-hypothermia guidance (ICAR MedCom 2021 update; ECLS for severe/arrest)**; **Wilderness Medical Society heat-illness guidelines**; meningococcal-sepsis / non-blanching-rash guidance; ATLS (log-roll, secondary survey, AMPLE). The **2025 cycle supersedes 2020/2021.**
>
> **Clinical-safety status:** decision-support, not autonomous — the surface presents the guideline-correct assessment + action options and records what the clinician does; drugs via the smart prescribing tool (verified at build). Procedures (active rewarming, ECLS) by a skilled operator; the app records + prompts escalation. **CSO sign-off required.** Encode facts; cite sources; no copyrighted artwork.

---

## 0. EXPOSURE ASSESSMENT — THE GOVERNING PRINCIPLES

1. **E is last in the primary survey, then you cycle.** After exposure, **RETURN TO A** and reassess the whole ABCDE — a resuscitation is a continuous loop, not a single pass.
2. **The aim of E:** **fully expose the patient to find what A–D missed** — rashes, bleeding, wounds, injuries, drug patches, swelling — and **check the temperature**, while **respecting dignity and preventing hypothermia.**
3. **Expose fully but minimise heat loss:** undress to examine, then **cover the patient and keep them warm** (especially the trauma/critically-ill patient — hypothermia worsens coagulopathy and outcome). Expose → examine → re-cover.
4. **Full head-to-toe + the back (log-roll in trauma, with C-spine control).** "What's on the back" is classically missed (wounds, bleeding, spinal injury).
5. **Take the history + check the chart** (AMPLE): **A**llergies, **M**edications (and the drug chart / patches), **P**ast history, **L**ast meal, **E**vents. Ask the patient, family, paramedics, notes.
6. **Treat what you find, then return to A and reassess.**

> **⚠️ EXPOSURE TRAPS / must-not-miss (build prominently):**
>
> - **NON-BLANCHING rash (petechiae/purpura) = meningococcal sepsis / meningitis until proven otherwise** — a medical emergency; **do NOT delay antibiotics** (sepsis overlap with C). Test with the "glass/tumbler test" (doesn't blanch on pressure).
> - **HYPOTHERMIA mimics + coexists with much, and SEPSIS is high on the differential for unexplained hypothermia** — don't dismiss a low temperature; "cold sepsis" carries a worse prognosis.
> - **Occult haemorrhage hides on the back, in the pelvis, abdomen, and thighs** — exposure + log-roll finds it; don't miss the bleeding the first four steps didn't show.
> - **In hypothermic cardiac arrest: "not dead until warm and dead"** — continue CPR and rewarm; meaningful survival is possible from profound hypothermia.
> - **Transdermal drug patches** (opioid/GTN/hyoscine) are easily missed and can explain the clinical picture — look for and remove where relevant.
> - **Re-covering matters:** leaving a critically ill/trauma patient exposed causes iatrogenic hypothermia → coagulopathy — cover them after examining.

---

## 1. THE ASSESSMENT — what the user records (the finding catalog)

**EXPOSE & EXAMINE (head-to-toe + back) / TEMPERATURE / HISTORY & CHART.** Each item is a recordable finding with meaning. (Findings→actions §2; combinations §3.)

### 1.1 Exposure state (the top-level finding — drives priority)

| Finding                                 | Meaning                                                                                                                                   |
| --------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| **No new critical finding on exposure** | Full survey done, nothing immediately life-threatening missed; re-cover, return to A.                                                     |
| **Significant finding on exposure**     | Rash, bleeding, injury, swelling, patch etc. found — assess + treat per finding.                                                          |
| **Temperature extreme**                 | **Hypothermia (≤35°C)** or **hyperthermia / heatstroke** — treat actively.                                                                |
| **Critical finding on exposure**        | **Non-blanching rash (meningococcaemia), major occult haemorrhage, limb-threat, anaphylaxis signs** — emergency; treat now + return to A. |

### 1.2 SKIN / RASH

- **Non-blanching rash (petechiae / purpura)** → **meningococcal sepsis / meningitis** (glass test) → emergency, don't delay antibiotics.
- **Urticaria / angioedema / flushing** → anaphylaxis (back to A/B/C → IM adrenaline).
- **Mottling / pallor / cyanosis** → poor perfusion (C).
- **Erythema / blistering / desquamation** → burns, severe drug reaction (SJS/TEN), cellulitis/necrotising fasciitis (pain out of proportion, crepitus → surgical emergency).
- **Track marks / injection sites** → IVDU (overdose, sepsis source).
- **Jaundice** → hepatic; **needle/IV/line sites** → infection source.

### 1.3 BLEEDING / WOUNDS / INJURY (the occult-haemorrhage hunt)

- **External haemorrhage** (any site → control it, back to C); **wounds** (entry/exit, lacerations, surgical sites → dehiscence/bleeding).
- **Bruising / haematoma** (flank → retroperitoneal; periumbilical/flank ecchymosis; expanding); **abdominal distension / peritonism / pulsatile mass** (intra-abdominal bleed / AAA).
- **Pelvic instability** (don't spring repeatedly), **long-bone deformity** (femoral → litres of concealed blood).
- **The BACK (log-roll, C-spine control):** wounds, bleeding, spinal tenderness/step — classically missed.
- **Limb:** swelling/erythema/tenderness (DVT), cold/pale/pulseless (limb-threatening ischaemia/compartment syndrome).

### 1.4 TEMPERATURE

- **Core temperature** (low-reading thermometer if cold). **Hypothermia: mild 32–35°C, moderate 28–32°C, severe <28°C.** **Hyperthermia / heatstroke: >40°C with CNS dysfunction.**
- **Hypothermia causes:** environmental exposure, **sepsis** (high on the differential — cold sepsis), hypothyroidism, hypoglycaemia, alcohol/drugs, elderly/immobile, trauma (iatrogenic + injury).
- **Hyperthermia causes:** heatstroke (exertional/classic), **sepsis**, serotonin syndrome / neuroleptic malignant syndrome (drug history — D overlap), thyroid storm, malignant hyperthermia (anaesthetic).

### 1.5 HISTORY & CHART (AMPLE — the "what do we now know" layer)

- **AMPLE:** **A**llergies, **M**edications (incl. anticoagulants, insulin, opioids — and **transdermal patches**), **P**ast medical/surgical history, **L**ast meal/menstrual period (β-hCG), **E**vents/Environment (mechanism, timeline, exposure, toxins).
- **Drug chart review** (what's been given/charted — incl. the resus drugs so far); **collateral** (family, paramedics, old notes, medication list); **lines/drains/devices** present.

---

## 2. FINDINGS → ACTIONS (each finding triggers candidate actions; treat + return to A)

Decision-support options the clinician performs/confirms; each carries a state (`indicated/in_progress/performed/not_indicated/deferred/failed`). Drugs via the prescribing tool, doses verified at build. Tiered like the other steps.

### Tier 1 — Basic / always-available

- **Every patient** → **expose adequately to examine** (head-to-toe), **then COVER + keep warm** (prevent iatrogenic hypothermia — esp. trauma/critically-ill); **measure temperature**; **respect dignity** throughout; **take AMPLE history + review the chart**; **continuous monitoring** continues.
- **Trauma** → **log-roll with C-spine control** to examine the back; maintain warming (warmed blankets/fluids).
- **After E** → **RETURN TO A** and reassess the whole ABCDE.

### Tier 2 — Cause-specific (clinician-directed; drugs via prescribing tool, doses verified)

- **NON-BLANCHING rash / meningococcal sepsis** → **do NOT delay broad-spectrum antibiotics** (sepsis bundle — overlaps C); senior; consider isolation/prophylaxis for contacts; resuscitate.
- **Anaphylaxis signs (urticaria/angioedema + airway/breathing/circulation)** → **IM adrenaline** (back to A/B/C) + O₂ + fluids + remove trigger.
- **HYPOTHERMIA** → **handle gently** (jostling can precipitate VF); **remove wet clothing**; **passive rewarming** (warm dry blankets, warm environment) for all; **active external rewarming** (forced-air/warming devices; warming packs to **groin + axillae**) for moderate; **warmed IV fluids to ~40°C** (don't use room-temp — worsens heat loss; do little to warm but prevent further loss); **active internal / ECLS (ECMO/bypass)** for **severe / haemodynamically unstable / hypothermic arrest** (ECLS is the treatment of choice — survival can approach 100% in some series); **fluid-resuscitate** (hypovolaemic from cold diuresis); if **fails to rewarm ~1°C/hr → reconsider sepsis/hypothyroidism**; **treat the cause (esp. sepsis).** _(Hypothermic arrest: see §arrest stub — continue CPR, rewarm to >32°C before considering termination; "not dead until warm and dead"; termination considerations include K>12.)_
- **HYPERTHERMIA / HEATSTROKE** → **active cooling** (remove from heat, undress, evaporative + cold packs to groin/axillae/neck, cold-water immersion for exertional heatstroke, cooled IV fluids; target controlled cooling); treat the **specific cause** — **serotonin syndrome / NMS** (stop the drug, benzodiazepines, specific agents — D/drug overlap), **thyroid storm**, **malignant hyperthermia (dantrolene)**; senior/ICU; manage complications (seizures, rhabdomyolysis, DIC).
- **Occult / major haemorrhage found** → **control + back to C** (pressure/binder/tourniquet, MHP/blood, TXA, definitive control); **limb-threatening ischaemia / compartment syndrome / necrotising fasciitis** → **urgent surgical referral.**
- **Transdermal drug patch / toxin found** → **remove**; treat per toxin (e.g. opioid patch + low GCS/RR → naloxone, back to D/B).

### Tier 3 — Advanced / escalation (skilled operator)

- **ECLS (ECMO / cardiopulmonary bypass)** for severe hypothermia / hypothermic arrest — transfer to the capable centre/team.
- **Surgical / specialty** for occult haemorrhage source, limb-threat, necrotising infection; **ICU** for heatstroke/severe-hypothermia complications.
- (Cardiac arrest → arrest pathway, next module — with the hypothermia modifier.)

### Cross-cutting

- **Expose → examine → re-cover/keep warm** — never leave the critically ill exposed.
- **Treat what you find, then RETURN TO A** and cycle the whole assessment.
- **Escalate the critical findings** (meningococcaemia, occult haemorrhage, severe temperature extreme, limb-threat) immediately.

---

## 3. COMBINATIONS & ESCALATION LOGIC (the "smart" part)

Reason on **combinations + the whole picture**, not single findings:

- **Non-blanching rash + fever + (reduced GCS/neck stiffness) + shock** → **MENINGOCOCCAL SEPSIS / meningitis** → don't delay antibiotics + sepsis bundle + senior + resuscitate (C/D overlap).
- **Low core temp + altered mental status + (no clear environmental cause)** → **consider SEPSIS (cold sepsis) + hypothyroidism/hypoglycaemia** → rewarm + septic screen/antibiotics + glucose + treat cause; if not rewarming ~1°C/hr → reconsider sepsis/hypothyroid.
- **Severe hypothermia + haemodynamic instability / arrest** → **ECLS (treatment of choice)** + gentle handling + warmed fluids; **arrest → continue CPR, rewarm >32°C before termination ("not dead until warm and dead"), K>12 a termination consideration** (→ arrest stub + hypothermia modifier).
- **High temp + CNS dysfunction (+ exertion / drug history)** → **HEATSTROKE vs serotonin syndrome / NMS / thyroid storm** → active cooling + cause-specific treatment (stop offending drug, benzodiazepines, dantrolene for MH) + ICU.
- **Trauma + shock but C "looked controlled"** → **log-roll + expose → find the occult haemorrhage** (back/pelvis/abdomen/thigh) → control + back to C (MHP/TXA/surgery).
- **Urticaria/angioedema + airway/breathing/circulation + trigger** → **anaphylaxis** → IM adrenaline (back to A/B/C).
- **Low GCS/RR + transdermal opioid patch found** → remove patch + **naloxone** (back to D/B).
- **Painful, swollen, erythematous area + pain out of proportion + crepitus / systemic toxicity** → **necrotising fasciitis** → urgent surgery + antibiotics.
- **After treating any finding** → **RETURN TO A** and reassess.
- **No pulse / no signs of life** → **cardiac arrest → ALS arrest pathway (next module) + CPR** (apply the hypothermia modifier if cold).

> **Severity/urgency output:** classify E as **no-new-critical-finding / significant-finding / temperature-extreme / critical-finding**, surface the matched actions, enforce **expose→examine→re-cover-keep-warm** + **return-to-A-and-cycle** + treat-before-moving-on.

---

## 4. WHAT THE EXPOSURE STEP MUST CAPTURE (for the record)

- Findings recorded (skin/rash incl. blanching status, bleeding/wounds/injury incl. the back/log-roll, **core temperature**, limb findings, patches/lines, **AMPLE history**, drug-chart review), with time.
- The exposure-state classification + the suspected diagnosis.
- Each action: what, by whom (role/cadre), time, state; warming/cooling measures (method, target, time); antibiotics/adrenaline/naloxone (via prescribing tool); haemorrhage control; procedures (log-roll, ECLS referral, surgical referral — record-capable); re-covering/dignity.
- AMPLE history captured (allergies feed the prescribing-tool allergy check; medications/patches; events).
- Escalation calls (surgery/ICU/ECLS-centre/infectious-diseases — who/when).
- Reassessment + the **return-to-A** event (the loop).
- All append-only/timestamped on the resus timeline (medico-legal).

## 5. DEFERRED / FLAG (don't over-build)

- **Full hypothermia/ECLS pathway, detailed heatstroke-cooling protocol, burns-resuscitation (TBSA/Parkland), necrotising-fasciitis/surgical pathways, secondary-survey tooling, toxidrome/poisoning workflow** are deeper sub-modules — the E step must **record** these + key parameters and **prompt escalation**, but the exhaustive workflow can be later. Capture + decision-support + escalation now.
- **Paediatric** (rapid heat loss — keep warm; non-blanching rash equally critical; weight-based everything; NAI awareness on exposure — injuries that don't fit the history) — route by age/weight; flag. **Obstetric** (expose respecting the gravid patient; consider concealed haemorrhage; eclampsia/temperature) — flag.

## 6. SOURCES (cite; verify at build)

Resuscitation Council UK — ABCDE/Exposure; ERC & AHA Guidelines 2025 (ILCOR 2025 CoSTR); accidental-hypothermia guidance (ICAR MedCom 2021 update; ECLS as treatment of choice for severe/unstable/arrest; "not dead until warm and dead"); Wilderness Medical Society heat-illness clinical practice guidelines; meningococcal sepsis / non-blanching rash guidance; ATLS (log-roll, secondary survey, AMPLE). **2025 supersedes earlier; re-verify thresholds + doses at build; CSO sign-off.**

---

> _Committed verbatim from the CSO-supplied catalog (encoding normalised to Unicode; clinical content unchanged) as the GATE A clinical source for the Exposure step. See [`docs/resus-exposure-gate-a-proposal.md`](../resus-exposure-gate-a-proposal.md) for the engineering proposal + reuse confirmation + the return-to-A loop design._
