# MedSync — Resus · BREATHING: Clinical Findings & Action Catalog

### Emergency-medicine-grade content for the Breathing (B) step of the ABCDE resus surface

> **Purpose.** The complete clinical content for the **Breathing (B)** step: every assessable finding, what it means, and how a finding (or combination) triggers a specific action — so the findings→action→state engine (the airway pattern) is populated with correct respiratory medicine. This is the **medicine**; `resus-breathing-step-kickoff.md` is the engineering. Part of the ABCDE resus surface; **B is assessed only after A is secure** (return to A if the patient deteriorates).
>
> **Authoritative source.** Committed verbatim from the CSO-supplied catalog (encoding normalised to UTF-8). Web-verification of the load-bearing doses + anchors is recorded in [docs/resus-breathing-gate-a-proposal.md](../resus-breathing-gate-a-proposal.md) §A.
>
> **Guideline basis (current — verify at build):** **ERC & AHA Guidelines 2025** (ILCOR 2025 CoSTR — the deteriorating/peri-arrest patient); **Resuscitation Council UK ABCDE — Breathing**; **GINA 2025/2026** + the **BTS/NICE/SIGN joint asthma guideline (2024)** for acute asthma; tension-pneumothorax evidence (ATLS 10th ed / ETC; 2025 meta-analysis on needle decompression site/length; NAEMSP 2024); anaphylaxis (Resuscitation Council UK). The **2025 cycle supersedes 2020/2021** — reference 2025.
>
> **Clinical-safety status:** decision-support, not autonomous — the surface presents the guideline-correct assessment + action options and records what the clinician does. Procedures (decompression, chest drain, assisted/mechanical ventilation) are performed by a **skilled operator**; the app records + prompts escalation, never instructs the procedure. **CSO sign-off required.** Encode dose facts as cited constants; cite sources; no copyrighted algorithm artwork.

---

## 0. BREATHING ASSESSMENT — THE GOVERNING PRINCIPLES

1. **B comes after A — but only once A is secure.** Adequate oxygenation and ventilation are useless if the airway is obstructed. If the patient deteriorates at any point, **return to A.**
2. **The aim of B:** detect and treat the life-threatening breathing problems — in the classic order they're taught: **tension pneumothorax, (open pneumothorax / massive haemothorax / flail chest in trauma), acute severe/life-threatening asthma or COPD, severe pneumonia, pulmonary oedema, pulmonary embolism, anaphylaxis** — _before_ moving to C.
3. **Look→Listen→Feel + Measure** (RR, SpO₂, and where available capnography/ABG). **Respiratory rate is the single most sensitive, most neglected early-warning sign** — count it, don't estimate.
4. **Treat life-threats immediately on detection** (e.g. tension pneumothorax is decompressed _before_ you finish the survey) — do not wait, do not wait for imaging for a clinical tension pneumothorax.
5. **High-flow O₂ 15 L/min via non-rebreathe reservoir mask** to any critically ill patient initially; **target SpO₂ 94–98%** (88–92% if known/at-risk hypercapnic/CO₂ retainer — clinician-set). Titrate down after stabilising.
6. **Reassess after every intervention** (it takes minutes for effect); call for skilled help (anaesthetics/ICU/critical care) early for failing ventilation.

> **⚠️ THE PRE-ARREST TRAPS (must-not-miss, build prominently):**
>
> - **A "normal" or rising pCO₂ in an acute asthma/severe-breathing patient is a SIGN OF LIFE-THREATENING DETERIORATION, not reassurance** — a tiring patient stops hyperventilating, so a previously-low CO₂ climbs to normal then high → impending respiratory arrest. Escalate, don't relax.
> - **A "silent chest"** (no wheeze because there's too little air movement to generate it) is **worse** than a loud wheeze — it means minimal ventilation → peri-arrest.
> - **A falling respiratory rate / poor respiratory effort / exhaustion / drowsiness** in a previously tachypnoeic distressed patient = **the patient is tiring → peri-arrest**, not "improving."
> - **Normal SpO₂ with a high RR / high work of breathing** = compensating hard, _will_ fail — don't be reassured by the saturation alone.
> - **Cyanosis is a LATE sign.** Don't wait for it.

---

## 1. THE ASSESSMENT — what the user records (the finding catalog)

**LOOK / LISTEN / FEEL / MEASURE.** Each item is a recordable finding with its clinical meaning. (Findings→actions §2; combinations §3.)

### 1.1 Breathing-state (the top-level finding — drives everything)

| Finding                                  | Meaning                                                                                                   |
| ---------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| **Adequate — breathing normally**        | RR + depth + sats adequate; no distress. Lowest concern; reassess.                                        |
| **Respiratory distress — compensating**  | Increased work (tachypnoea, accessory muscles) maintaining sats — urgent; will fail if untreated.         |
| **Respiratory failure — decompensating** | Inadequate oxygenation/ventilation despite effort (falling sats, rising CO₂) — emergency.                 |
| **Peri-arrest / inadequate effort**      | Exhaustion, falling RR, silent chest, agonal/poor effort, drowsy — **immediate; pre-respiratory-arrest.** |
| **Apnoeic / not breathing normally**     | → assess for cardiac arrest (arrest pathway) + start ventilation/CPR.                                     |

### 1.2 LOOK

- **Respiratory rate** (count it): **normal 12–20**; **RR ≥ 25 (or ≥ 30)** = significant distress/life-threatening band; **RR ≤ 8 or falling** = depression/exhaustion → peri-arrest.
- **Work of breathing:** accessory muscle use (sternocleidomastoid, scalenes), intercostal/subcostal/suprasternal recession, tracheal tug, nasal flaring, pursed-lip breathing, inability to speak in full sentences (counts breaths between words), tripod position.
- **Chest expansion:** symmetry (unilateral reduced → pneumothorax, effusion, consolidation, collapse), depth (shallow), paradoxical/flail segment (trauma).
- **Colour:** central cyanosis (lips/tongue — late, severe hypoxaemia).
- **Distress/exhaustion/consciousness:** agitation (hypoxia) → drowsiness/exhaustion (hypercapnia/tiring — ominous).
- **Chest wall:** wounds (open "sucking" chest wound), bruising, deformity, surgical emphysema (crepitus), raised JVP/distended neck veins (tension pneumothorax, tamponade, right-heart strain in PE).
- **SpO₂ reading + O₂ delivery** (device + flow + whether on air or oxygen).

### 1.3 LISTEN

| Sound / finding                               | Meaning                                                                  |
| --------------------------------------------- | ------------------------------------------------------------------------ |
| **Speaking full sentences**                   | Reassuring (adequate ventilation for now).                               |
| **Cannot complete sentences in one breath**   | Severe — acute severe asthma / significant distress.                     |
| **Wheeze (expiratory, polyphonic)**           | Bronchospasm — asthma, COPD, anaphylaxis.                                |
| **Silent chest**                              | **Life-threatening** — too little air movement to wheeze → peri-arrest.  |
| **Crackles/crepitations**                     | Pulmonary oedema (basal, fine), pneumonia (localised, coarse), fibrosis. |
| **Reduced/absent breath sounds (unilateral)** | Pneumothorax, large effusion/haemothorax, collapse, consolidation.       |
| **Bronchial breathing**                       | Consolidation (pneumonia).                                               |
| **Stridor**                                   | Upper-airway (an A finding — but heard here).                            |
| **Gurgling**                                  | Secretions/aspiration (back to A).                                       |

### 1.4 FEEL & PERCUSS

- **Tracheal position:** central (normal); **deviated AWAY from a silent hyper-resonant side → tension pneumothorax** (late/unreliable sign — don't wait for it if other signs present); deviated _toward_ → collapse.
- **Chest expansion** (hands): symmetry; reduced side = pathology side.
- **Percussion:** **hyper-resonant → pneumothorax (air);** **stony dull → pleural effusion / haemothorax (fluid/blood);** dull → consolidation/collapse.
- **Tactile findings:** surgical emphysema (crepitus under skin — airway/lung injury), chest-wall tenderness/crepitus (fractures, flail).

### 1.5 MEASURE

- **SpO₂** (target 94–98%; 88–92% hypercapnic-risk). **<92% on air = life-threatening band in asthma; <90% = severe hypoxaemia.**
- **Capnography / EtCO₂** (if available/intubated) — ventilation adequacy + waveform; rising EtCO₂ with falling RR = tiring.
- **ABG/VBG** (where available): **PaO₂ <8 kPa / 60 mmHg = severe hypoxaemia (type 1 RF)**; **rising/normalising PaCO₂ in acute asthma = pre-arrest trap**; pH (acidosis); lactate.
- **PEF (peak expiratory flow)** in known asthma where feasible (PEF 33–50% best/predicted = acute severe; <33% = life-threatening) — context-dependent, don't delay treatment.
- **Bedside imaging:** CXR / lung ultrasound (POCUS) where available — **but never delay treating a clinical tension pneumothorax for imaging.**

---

## 2. FINDINGS → ACTIONS (each finding triggers candidate actions; least-invasive first, escalate if it fails)

Actions are **decision-support options** the clinician performs/confirms; each carries a state (`indicated / in_progress / performed / not_indicated / deferred / failed`). Doses verified at build. Tiered like airway.

### Tier 1 — Basic / always-available

- **Any critically ill / hypoxaemic patient** → **high-flow O₂ 15 L/min via non-rebreathe reservoir mask**; target SpO₂ 94–98% (88–92% if hypercapnic risk — clinician-set); titrate after stabilising. **Sit upright** if tolerated and no contraindication (trauma/hypotension).
- **Inadequate breathing / poor effort / peri-arrest / apnoea** → **assisted ventilation with bag-valve-mask + O₂** (two-person technique); prepare for advanced airway; **call for skilled help NOW**; if no pulse/not breathing → arrest pathway + CPR.
- **Attach continuous monitoring** (SpO₂, ECG, RR, capnography if available).

### Tier 2 — Cause-specific (clinician-directed; category-level + key doses as cited constants)

- **Tension pneumothorax (clinical diagnosis — DO NOT wait for imaging)** → **immediate chest decompression: needle/finger thoracostomy, followed by intercostal chest drain.** _(Site/needle-length per current guidance — ATLS vs ETC differ; needle thoracostomy has a high failure rate from chest-wall thickness — finger/simple thoracostomy increasingly preferred and a chest drain is definitive. **Decompress BEFORE intubating/positive-pressure ventilating** where possible — PPV worsens tension.)_ — skilled operator; app records + prompts.
- **Open ("sucking") chest wound (trauma)** → three-sided occlusive dressing / vented chest seal + chest drain (away from the wound).
- **Massive haemothorax (trauma)** → large-bore chest drain + activate major-haemorrhage/blood + surgical referral (a C overlap).
- **Acute severe / life-threatening asthma** → **oxygen-driven nebulised salbutamol** (5 mg, repeated / back-to-back / continuous in life-threatening) **+ nebulised ipratropium bromide 500 micrograms** **+ systemic steroid (hydrocortisone 100 mg IV or prednisolone 40–50 mg PO)**; **life-threatening → add IV magnesium sulphate (1.2–2 g over 20 min), senior + ICU**; **no sedatives**; ABG if any life-threatening feature; consider ventilatory support if deteriorating. _(Doses verified at build.)_
- **COPD exacerbation** → controlled O₂ (target 88–92%), nebulised bronchodilators (air- or O₂-driven per protocol), steroids ± antibiotics; **consider NIV (BiPAP)** for hypercapnic respiratory failure with acidosis; senior review.
- **Acute pulmonary oedema** → sit up, high-flow O₂, **consider GTN, IV diuretic (furosemide), CPAP/NIV**, treat the cause (ACS/arrhythmia); senior/cardiology.
- **Severe pneumonia / sepsis** → O₂, **sepsis bundle (cultures, early antibiotics, fluids, lactate)**, escalate.
- **Pulmonary embolism (massive/high-risk)** → O₂, haemodynamic support, **consider thrombolysis** if arrest/peri-arrest with high suspicion; senior/critical care.
- **Anaphylaxis (bronchospasm + airway/circulation + trigger)** → **IM adrenaline 500 micrograms (0.5 mL 1:1000) anterolateral thigh, repeat after 5 min if needed**, O₂, nebulised bronchodilator for wheeze, IV fluids, remove trigger (adrenaline FIRST, before salbutamol, if anaphylaxis + asthma). _(Dose verified at build.)_

### Tier 3 — Advanced / ventilatory support (skilled operator)

- **Failing oxygenation/ventilation, exhaustion, rising CO₂, silent chest not responding** → **escalate to advanced airway + invasive ventilation (RSI/intubation), call anaesthetics/ICU/critical care immediately.**
- **Non-invasive ventilation (CPAP for type-1 RF / pulmonary oedema; BiPAP for type-2/hypercapnic COPD)** per cause + protocol.
- **Confirm any advanced airway with waveform capnography;** lung-protective ventilation per critical-care.
- (Cardiac arrest from a respiratory cause → arrest pathway, next module.)

### Cross-cutting

- **After EVERY action → reassess B (look/listen/feel/measure) before proceeding to C.**
- **Decompress tension / treat the immediate life-threat the moment it's found** — don't complete the survey first.
- **Threatened/failing ventilation → escalate pre-emptively** (skilled help) — late rescue is harder.

---

## 3. COMBINATIONS & ESCALATION LOGIC (the "smart" part)

Reason on **combinations + trajectory**, not single findings:

- **Unilateral absent breath sounds + hyper-resonance + tracheal deviation away + distended neck veins + haemodynamic compromise (± trauma/penetrating chest)** → **TENSION PNEUMOTHORAX** → **immediate needle/finger decompression then chest drain; decompress before PPV/intubation; do NOT wait for imaging.**
- **Unilateral absent breath sounds + stony dullness + (trauma) shock** → **massive haemothorax** → chest drain + blood/major-haemorrhage + surgery (C overlap).
- **Wheeze + can't complete sentences + RR ≥ 25 + SpO₂ <92% + tachycardia** → **acute severe/life-threatening asthma** → O₂ + back-to-back/continuous neb salbutamol + ipratropium + steroid + (life-threatening) IV magnesium + senior/ICU.
- **Previously wheezy/distressed patient now: silent chest OR falling RR OR drowsy OR normalising/rising CO₂ OR exhaustion** → **LIFE-THREATENING — peri-respiratory-arrest** → senior + ICU immediately, prepare for ventilatory support/intubation; **do NOT mistake for improvement.**
- **Bibasal crackles + raised JVP + frothy/pink sputum + orthopnoea + hypertension** → **acute pulmonary oedema** → sit up, O₂, GTN/diuretic/CPAP, treat cause; cardiology.
- **Bronchospasm + urticaria + facial/lip swelling + hypotension after a trigger** → **anaphylaxis** → **IM adrenaline FIRST**, O₂, fluids, neb bronchodilator.
- **Fever + bronchial breathing/coarse crackles + raised RR + hypotension/raised lactate** → **severe pneumonia / sepsis** → O₂ + sepsis bundle.
- **Sudden pleuritic chest pain + breathlessness + hypoxia + raised JVP + tachycardia (+ risk factors)** → **PE** → O₂, support, consider thrombolysis if peri-arrest; senior.
- **Normal SpO₂ but RR 30 + accessory muscles** → compensating, **will fail** → treat the cause, escalate, don't be reassured.
- **Apnoea / agonal + no pulse / no signs of life** → **cardiac arrest → ALS arrest pathway (next module) + CPR.**

> **Severity/urgency output:** classify B as **adequate / distress-compensating / failure-decompensating / peri-arrest / apnoeic** — drives action prominence (urgency ordering) and the treat-before-proceeding gate to C.

---

## 4. WHAT THE BREATHING STEP MUST CAPTURE (for the record)

- Findings recorded (look/listen/feel/measure incl. RR, SpO₂, percussion, breath sounds, tracheal position, capnography/ABG/PEF where done), with time.
- The breathing-state classification (adequate → apnoeic).
- Each action: what, by whom (role/cadre), time, state; O₂ delivery (device/flow/target/achieved SpO₂); nebs/drugs (dose/route/time); procedures (decompression, chest drain, NIV, intubation — device, side, confirmation by capnography, complications — record-capable).
- Escalation calls (who/when).
- Reassessment findings after each action (the loop).
- All append-only/timestamped on the resus timeline (medico-legal).

## 5. DEFERRED / FLAG (don't over-build)

- **Full ventilator setup / detailed NIV titration / RSI drug-checklist and chest-drain procedural tooling** are deeper sub-modules — the breathing step must let a clinician **record** these and the key parameters and **prompt escalation**, but the exhaustive procedural workflow can be later. Capture + decision-support + escalation now.
- **Paediatric breathing** (age-banded RR/SpO₂ per the vitals catalog; bronchiolitis/croup nuances; weight-based doses) — flag the paediatric branch; the engine routes by age. Paediatric resp distress signs (grunting, head-bobbing, marked recession) are red flags.
- **Obstetric** — physiological breathlessness vs pathology; lower threshold; PE risk (prothrombotic) — flag.

## 6. SOURCES (cite; verify at build)

ERC & AHA Guidelines 2025 (ILCOR 2025 CoSTR); Resuscitation Council UK — ABCDE/Breathing; GINA 2025/2026; BTS/NICE/SIGN asthma (2024); ATLS 10th ed & ETC (tension pneumothorax); 2025 meta-analysis on needle decompression site/length (World J Emerg Surg); NAEMSP 2024 traumatic pneumothorax; Resuscitation Council UK anaphylaxis. **2025 supersedes 2020/2021.**
