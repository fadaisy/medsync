# MedSync — Resus · CIRCULATION: Clinical Findings & Action Catalog

### Emergency-medicine-grade content for the Circulation (C) step of the ABCDE resus surface

> **Source.** Committed verbatim from the CSO-supplied catalog (encoding normalised to UTF-8). The structured encoding lives in `lib/resus/reference/circulation-catalog.ts`; web cross-verification of the load-bearing anchors + the prescribing-tool dose routing is recorded in [docs/resus-circulation-gate-a-proposal.md](../resus-circulation-gate-a-proposal.md) §A.
>
> **Guideline basis (current — verify at build):** **ERC & AHA Guidelines 2025 / ILCOR 2025 CoSTR** (peri-arrest, cardiac); **Resuscitation Council UK ABCDE — Circulation**; **Surviving Sepsis Campaign 2026** (sepsis/septic shock); **damage-control resuscitation** (ATLS 10th ed; CRASH-2/CRASH-3; PROPPR; 2024–2025 major-haemorrhage literature); shock classification (distributive/hypovolaemic/cardiogenic/obstructive). The **2025 cycle supersedes 2020/2021.**
>
> **Clinical-safety status:** decision-support, not autonomous — the surface presents the guideline-correct assessment + action options and records what the clinician does. Procedures (central access, pericardiocentesis, chest drain, thrombolysis) by a **skilled operator**; the app records + prompts escalation. Drug doses via the smart prescribing tool (verified at build). **CSO sign-off required.** Encode facts; cite sources; no copyrighted artwork.

---

## 0. CIRCULATION ASSESSMENT — THE GOVERNING PRINCIPLES

1. **C after A and B — but only once they're secure.** Perfusion is meaningless without an airway and oxygenation. Deterioration → return to A.
2. **The aim of C:** recognise **shock** (inadequate tissue perfusion) and treat the immediate life-threats — **haemorrhage, the shock states (hypovolaemic/distributive/cardiogenic/obstructive), and peri-arrest cardiac causes** — _before_ moving to D.
3. **Look–Feel–Measure;** judge **perfusion** (the end-organ reality), not just the blood pressure number.
4. **Hypotension is a LATE sign.** The body compensates (tachycardia, vasoconstriction, narrowing pulse pressure) and defends BP until it suddenly can't — **compensated shock is pre-collapse.** Treat the tachycardia/tachypnoea/rising shock index, don't wait for the BP to fall. **This is even more true in children and pregnant women** (they compensate hard, then crash).
5. **Find and stop the bleeding** — "blood on the floor and four more" (chest, abdomen, pelvis, long bones, external/floor). **Haemorrhage control is time-critical** (every minute of delay to transfusion/control increases mortality).
6. **IV access early (×2 large-bore); IO if access fails** (don't delay). Bloods at cannulation. **Reassess after every fluid bolus / intervention.** Call for help early.

> **⚠️ CIRCULATION TRAPS / must-not-miss (build prominently):**
>
> - **A normal BP does NOT exclude shock** — compensated shock maintains BP; look at HR, RR, cap refill, lactate, shock index, mentation. Shock Index (HR/SBP) **>0.9 = occult shock**, ≥1.0 strong.
> - **Hypotension is late + ominous** — by the time SBP drops, large volume is already lost (in trauma, ~30%+).
> - **Fluids are not always the answer:** **cardiogenic** and **obstructive** shock can be **worsened by aggressive fluids** — match the fluid strategy to the shock type.
> - **In haemorrhagic/trauma shock: permissive hypotension + blood, NOT crystalloid floods** — large crystalloid volumes cause dilutional coagulopathy + worsen bleeding (the "lethal diamond": hypothermia, acidosis, coagulopathy, hypocalcaemia).
> - **⚠️ Paediatric/tropical caution (Uganda-critical — FEAST trial):** in children with **severe febrile illness** (malaria, sepsis) who are **not frankly hypotensive**, **aggressive fluid bolusing INCREASED mortality** — bolus fluids cautiously in the febrile non-hypotensive child; in severe anaemia (malaria/sickle) **blood is superior to crystalloid/albumin bolus.** Do NOT blindly apply adult 30 mL/kg flooding to the febrile African child.
> - **Tamponade/tension pneumothorax (obstructive shock)** present with shock + raised JVP — fluids won't fix them; **decompress/drain.**

---

## 1. THE ASSESSMENT — what the user records (the finding catalog)

**LOOK / FEEL / MEASURE.** Each item is a recordable finding with meaning. (Findings→actions §2; combinations §3.)

### 1.1 Perfusion / circulatory state (the top-level finding — drives everything)

| Finding                                 | Meaning                                                                                                                                              |
| --------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Well perfused — stable**              | Normal HR/BP/cap refill/mentation/urine; no shock. Reassess.                                                                                         |
| **Compensated shock**                   | Tachycardia + tachypnoea + narrowing pulse pressure + delayed cap refill, **BP still normal** — pre-collapse; treat NOW, don't wait for hypotension. |
| **Decompensated shock**                 | Hypotension (SBP ≤90 / MAP <65) + poor perfusion — emergency; the type must be identified.                                                           |
| **Peri-arrest / haemodynamic collapse** | Profound hypotension, barely-palpable/absent peripheral pulses, altered consciousness — **immediate.**                                               |
| **Cardiac arrest (no pulse)**           | → arrest pathway (next module) + CPR.                                                                                                                |

### 1.2 LOOK

- **Colour / skin:** pallor, mottling (knees/peripheries — poor perfusion), cyanosis, sweating/clamminess, flushing (distributive/anaphylaxis/early sepsis "warm shock").
- **Level of consciousness / agitation** (cerebral hypoperfusion → confusion, agitation, drowsiness).
- **Obvious haemorrhage** (external wounds, "blood on the floor"); abdominal distension (intra-abdominal bleed/AAA); pelvic instability; long-bone deformity (femoral).
- **JVP / neck veins:** **raised** (cardiogenic, tamponade, tension pneumothorax, RV failure/PE); **flat/empty** (hypovolaemia).
- **Urine output** (catheter — a perfusion marker; oliguria <0.5 mL/kg/h).
- **Visible signs by type:** urticaria/angioedema (anaphylaxis), fever/rash (sepsis), chest signs (cardiac/PE).

### 1.3 FEEL

- **Pulse:** **rate** (tachy >100 / brady <60), **rhythm** (regular/irregular — AF/arrhythmia), **volume/character** (thready/weak = low output; bounding = early sepsis/distributive), **central vs peripheral** (peripheral lost first in shock — a weak/absent radial with a present carotid suggests significant hypotension).
- **Capillary refill time:** **>2s prolonged; >3–4s = poor perfusion.**
- **Peripheral temperature / gradient:** cold peripheries with a warm core = vasoconstriction (hypovolaemic/cardiogenic); warm peripheries = distributive (early sepsis/anaphylaxis/neurogenic).
- **Abdomen** (peritonism, distension, pulsatile mass), **pelvis** (don't spring repeatedly — instability), **long bones**.

### 1.4 MEASURE

- **Heart rate** (per the vitals catalog — age-banded in children).
- **Blood pressure:** **systolic, diastolic, MAP.** **SBP ≤90 or MAP <65 = hypotension/shock band;** remember it's LATE.
- **Shock Index (HR ÷ SBP):** normal 0.5–0.7; **>0.9 occult shock; ≥1.0 strong flag.** (Obstetric: **Modified SI = HR/MAP >1.7**.)
- **Pulse pressure (SBP − DBP):** **narrow (<25% SBP) → hypovolaemia/low stroke volume;** wide → distributive/sepsis/AR.
- **12-lead ECG:** rhythm (arrhythmia), ischaemia/STEMI, signs of PE (S1Q3T3, RV strain), tamponade (low voltages/electrical alternans).
- **Point-of-care: lactate** (>2 = hypoperfusion; >4 = severe — sepsis/shock severity), **VBG/ABG, glucose, Hb (POC), β-hCG (any woman of reproductive age — ectopic), bedside ultrasound (FAST/echo/IVC — free fluid, tamponade, RV strain, volume status).**
- **Bloods at cannulation:** FBC, U&E, glucose, lactate, **group & save / crossmatch**, coagulation, cultures (if septic), VBG.

---

## 2. FINDINGS → ACTIONS (each finding triggers candidate actions; least-invasive first, escalate if it fails)

Decision-support options the clinician performs/confirms; each carries a state (`indicated / in_progress / performed / not_indicated / deferred / failed`). Drugs via the prescribing tool, doses verified at build. Tiered like airway/breathing.

### Tier 1 — Basic / always-available

- **Any shock / circulatory compromise** → **IV access ×2 large-bore (14–16G); IO if access fails within ~2 attempts** (don't delay). **Bloods at cannulation** (incl. group&save/crossmatch, lactate). **Continuous monitoring** (ECG, BP, SpO₂); **catheterise** for urine output; **12-lead ECG.**
- **Position:** lay flat / legs raised (hypovolaemic/distributive); **sit up if pulmonary oedema** (cardiogenic) — position by type.
- **Control external haemorrhage:** **direct pressure, pressure dressing, tourniquet (limb), pelvic binder, wound packing** — immediately on finding it.
- **High-flow O₂** (shock increases oxygen demand) — coordinate with B.

### Tier 2 — Cause/type-specific resuscitation (match the strategy to the shock type — the core clinical reasoning)

- **Hypovolaemic — NON-haemorrhagic (dehydration, GI losses, DKA, burns):** **balanced crystalloid boluses** (adult ~250–500 mL, reassess; classic 30 mL/kg in sepsis-overlap) — **reassess after each bolus** (HR, BP, cap refill, lactate, urine, lungs).
- **Hypovolaemic — HAEMORRHAGIC (trauma/GI bleed/ruptured AAA/ectopic/PPH):** **STOP THE BLEEDING + balanced blood-product resuscitation.** **Permissive hypotension** (target SBP ~80–90, palpable radial — EXCEPT in TBI, where maintain perfusion); **minimise crystalloid** (avoid dilutional coagulopathy); **activate Major Haemorrhage Protocol** (balanced ~1:1:1 RBC:plasma:platelets / whole blood); **TXA early** (1 g IV over 10 min then 1 g over 8 h, within 3 h of trauma); maintain **normothermia, pH, normocalcaemia** (avoid the lethal diamond); **definitive control** (surgery/IR/endoscopy) — call early; consider crossmatch/emergency O-neg.
- **Distributive — SEPTIC shock (Surviving Sepsis 2026):** **sepsis bundle within the first hour** — **cultures + early broad-spectrum antibiotics**, **crystalloid 30 mL/kg** for hypotension/lactate ≥4 (reassess responsiveness), **measure + trend lactate**; **vasopressors if MAP <65 despite fluids** — **noradrenaline (norepinephrine) FIRST-LINE, target MAP ≥65** (60–65 if ≥65y); **peripheral pressors are safe — do NOT delay for central access**; add **vasopressin** (0.03 u/min) or **adrenaline** if refractory; consider **hydrocortisone** in refractory shock; source control.
- **Distributive — ANAPHYLAXIS:** **IM adrenaline FIRST** (500 mcg 1:1000 IM, repeat 5 min) + high-flow O₂ + **IV fluid bolus** + remove trigger; refractory → adrenaline infusion + senior/ICU. (Ties to breathing/airway.)
- **Distributive — NEUROGENIC (spinal injury):** fluids + **vasopressors** (and treat bradycardia — atropine) — loss of sympathetic tone; maintain perfusion; C-spine care.
- **Cardiogenic shock (MI, arrhythmia, acute valve/pump failure):** **CAUTION with fluids** (can worsen pulmonary oedema) — small/judicious if any; **treat the cause** — **STEMI → activate PCI/reperfusion**, arrhythmia → peri-arrest algorithm, **inotropes (e.g. dobutamine) ± vasopressors**, consider mechanical support (IABP/ECMO) — cardiology/ICU; sit up, O₂, treat oedema.
- **Obstructive shock — fluids won't fix; relieve the obstruction:** **tension pneumothorax → needle/finger decompression + chest drain** (with B); **cardiac tamponade → pericardiocentesis** (Beck's triad: hypotension + raised JVP + muffled heart sounds); **massive PE → thrombolysis/embolectomy** (judicious fluids — over-filling worsens RV); senior/critical care.

### Tier 3 — Advanced / escalation (skilled operator)

- **Central venous access + arterial line** (vasopressor titration, monitoring) — but **don't delay peripheral pressors** for it.
- **Vasopressor/inotrope infusions** titrated to MAP (noradrenaline first-line for most shock; type-specific).
- **Definitive haemorrhage control** (theatre/IR/endoscopy/REBOA where available); **massive transfusion** continued + guided (CCT/TEG/ROTEM where available).
- **Pericardiocentesis / thrombolysis / PCI / mechanical circulatory support** per cause — escalate to the relevant specialty/critical care immediately.
- (Cardiac arrest → arrest pathway, next module.)

### Cross-cutting

- **After EVERY fluid bolus / intervention → reassess perfusion** (HR, BP, MAP, cap refill, lactate, urine, lungs for fluid overload) **before proceeding to D.**
- **Stop the bleeding the moment you find it;** match fluid/blood strategy to shock type (don't flood cardiogenic/obstructive/haemorrhagic).
- **Undifferentiated shock → use bedside ultrasound + the picture to find the type;** treat reversible obstructive causes early.

---

## 3. COMBINATIONS & ESCALATION LOGIC (the "smart" part)

Reason on **combinations + trajectory + shock TYPE**, not single numbers:

- **Tachycardia + narrow pulse pressure + delayed cap refill + cool peripheries + (normal-then-falling) BP + obvious/suspected bleeding** → **HAEMORRHAGIC shock** → stop bleeding + permissive hypotension + blood/MHP + TXA; minimise crystalloid; definitive control.
- **Tachycardia + hypotension + WARM peripheries + bounding pulse + fever/rash + raised lactate** → **SEPTIC (distributive) shock** → sepsis bundle (cultures + antibiotics + 30 mL/kg fluid) + noradrenaline to MAP ≥65 if refractory.
- **Hypotension + urticaria/angioedema + wheeze/airway + trigger** → **ANAPHYLAXIS** → IM adrenaline FIRST + fluids + O₂.
- **Hypotension + RAISED JVP + (lungs clear) + muffled heart sounds** → **TAMPONADE (obstructive)** → pericardiocentesis (NOT fluid floods); echo.
- **Hypotension + RAISED JVP + unilateral absent breath sounds + hyper-resonance + tracheal deviation** → **TENSION PNEUMOTHORAX (obstructive)** → immediate decompression (with B).
- **Hypotension + RAISED JVP + pulmonary oedema (crackles) + chest pain/ECG ischaemia** → **CARDIOGENIC shock** → CAUTION fluids; PCI/reperfusion for STEMI; inotropes; cardiology.
- **Sudden hypotension + hypoxia + raised JVP + tachycardia + risk factors (+ S1Q3T3)** → **massive PE (obstructive)** → thrombolysis consideration; judicious fluids; senior.
- **Hypotension + bradycardia + warm peripheries + spinal injury/level** → **NEUROGENIC shock** → fluids + vasopressors + atropine for bradycardia.
- **Woman of reproductive age + shock + abdominal pain (± PV bleed)** → **ectopic until excluded** (β-hCG, ultrasound) → resuscitate + urgent surgery; **(pregnant/postpartum + shock → obstetric haemorrhage / consider concealed)** → MHP + obstetric emergency.
- **Compensated picture (tachycardia + narrow pulse pressure + delayed cap refill, BP still normal)** → **treat as shock NOW** — do not wait for hypotension (esp. children/pregnant).
- **Febrile child, not frankly hypotensive** → **cautious fluids (FEAST) — do NOT flood;** severe anaemia → blood.
- **No pulse / no signs of life** → **cardiac arrest → ALS arrest pathway (next module) + CPR.**

> **Severity/urgency output:** classify C as **well-perfused / compensated shock / decompensated shock / peri-arrest collapse / arrest**, **identify the shock type** (drives the type-specific actions + urgency ordering), and enforce treat-before-proceeding to D + reassess-after-bolus.

---

## 4. WHAT THE CIRCULATION STEP MUST CAPTURE (for the record)

- Findings recorded (look/feel/measure incl. HR, BP, MAP, shock index, pulse pressure, cap refill, peripheral temp, JVP, ECG, lactate, urine output, ultrasound findings), with time.
- The circulatory-state classification + **the shock type identified**.
- Each action: what, by whom (role/cadre), time, state; IV/IO access; fluids (type, volume, time — and response); blood products (type, units, time, MHP activation); drugs (via prescribing tool — TXA, vasopressors, antibiotics, adrenaline — dose/route/time); procedures (decompression, pericardiocentesis, central line, tourniquet, binder — record-capable); haemorrhage-control measures.
- Escalation calls (surgery/cardiology/ICU/obstetrics — who/when); ECG/imaging.
- Reassessment findings after each bolus/intervention (the loop, incl. checking for fluid overload).
- All append-only/timestamped on the resus timeline (medico-legal).

## 5. DEFERRED / FLAG (don't over-build)

- **Full massive-transfusion-protocol workflow, vasopressor-infusion titration tooling, central-line/pericardiocentesis/REBOA procedural guidance, detailed arrhythmia algorithms** are deeper sub-modules — the circulation step must **record** these + key parameters and **prompt escalation**, but the exhaustive procedural/infusion workflow can be later. Capture + decision-support + escalation now.
- **Peri-arrest arrhythmia algorithms** (brady/tachy) flagged from ECG — full algorithm later (with the arrest module).
- **Paediatric** (age-banded HR/BP, weight-based fluids 10–20 mL/kg with the **FEAST caution**, weight-based drugs) — route by age/weight per the vitals + drug catalogs; **don't apply adult flooding to the febrile child.** **Obstetric** (MSI, concealed haemorrhage, peripartum) — flag the branches.

## 6. SOURCES (cite; verify at build)

ERC & AHA Guidelines 2025 (ILCOR 2025 CoSTR); Resuscitation Council UK — ABCDE/Circulation; Surviving Sepsis Campaign 2026 (SCCM); damage-control resuscitation literature (ATLS 10th ed; CRASH-2, CRASH-3, PROPPR, PATCH-Trauma; 2024–2025 major-haemorrhage reviews); shock classification + vasopressor evidence (Surviving Sepsis; norepinephrine first-line); **FEAST trial** (paediatric febrile fluid bolus caution). **2025/2026 supersedes earlier; re-verify doses + targets at build; CSO sign-off.**
