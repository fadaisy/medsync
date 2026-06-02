# MedSync — Resus · AIRWAY: Clinical Findings & Action Catalog

### Emergency-medicine-grade content for the Airway step of the ABCDE resus surface

> **Purpose.** The complete clinical content for the **Airway (A)** step: every assessable finding, what it means, and how a finding (or combination) triggers a specific action — so the findings→action engine is clinically correct. This is the **medicine**; `resus-airway-step-kickoff.md` is the build. Part of the ABCDE resus surface (`resuscitation-abcde-clinical-reference.md`).
>
> **Authoritative source.** Committed verbatim from the CSO-supplied catalog (encoding normalised to UTF-8). The web-verification of its load-bearing anchors (DAS 2025, doses, LEMON/MOANS/RODS, choking, capnography) is recorded in [docs/resus-airway-gate-a-proposal.md](../resus-airway-gate-a-proposal.md) §A.6.
>
> **Guideline basis (current — verify at build):** **Difficult Airway Society (DAS) 2025 guidelines** for unanticipated difficult tracheal intubation in adults (BJA, Nov 2025; Plan A→B→C→D, first-pass success, CICO→eFONA); **Resuscitation Council UK ABCDE — Airway** + RCUK 2025 First Aid/BLS; ERC/AHA 2025; ASA 2022 difficult-airway practice guidelines; validated assessment mnemonics **LEMON / MOANS / RODS**. The **2025 cycle supersedes 2020/2021/2015** — reference 2025.
>
> **Clinical-safety status:** decision-support, not autonomous — the surface presents the guideline-correct assessment + action options and records what the clinician does. Advanced airway acts (intubation, eFONA) are performed by a **skilled operator**; the app records, never instructs a procedure beyond decision-support. **CSO sign-off required.** Encode facts; cite sources; no copyrighted algorithm artwork.

---

## 0. AIRWAY ASSESSMENT — THE GOVERNING PRINCIPLES

1. **Airway is FIRST and most time-critical** — a complete obstruction causes hypoxic brain injury and death within minutes. Assess and secure the airway before anything else.
2. **The "talking patient" rule:** a patient speaking in a **normal voice, full sentences** has (for now) a patent airway, is moving air, and is perfusing the brain. _But this can change_ — re-assess.
3. **Look→Listen→Feel** is the assessment method; **patency + protection + patency-over-time (trajectory)** is what you're judging.
4. **Treat before proceeding:** any airway problem is managed _now_, before moving to Breathing. After any airway intervention, **reassess from the top.**
5. **Progression is the alarm:** voice change → weak/altered cough → difficulty swallowing → **drooling** → **stridor** = an increasingly compromised, increasingly difficult airway. **Respiratory distress and rising O₂ requirements are LATE signs** — do not wait for them.
6. **Call for skilled airway help EARLY** (anaesthetics/ICU/ENT) when the airway is threatened — it is harder to rescue late. C-spine control throughout if trauma.
7. **Do the least invasive thing that works; escalate stepwise (DAS Plan A→B→C→D) if it fails.** Aim for **first-pass success** at each level.

> **A patent airway now does not mean a safe airway** — judge the trajectory and the threat.

---

## 1. THE ASSESSMENT — what the user records (the finding catalog)

Organised as **LOOK / LISTEN / FEEL + rapid difficulty-screen**. Each item below is a recordable finding with its clinical meaning. (Findings → actions in §2; combinations in §3.)

### 1.1 First-glance / patency state (the top-level finding — drives everything)

| Finding                             | Meaning                                                                                                                                                                       |
| ----------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Patent — talking normally**       | Airway open + protected (for now); air moving; brain perfused. Lowest concern; still reassess.                                                                                |
| **Patent but at risk / threatened** | Open now but trajectory or pathology threatens it (e.g. expanding haematoma, burns, angioedema, decreasing consciousness, hoarse voice). High vigilance — pre-emptive action. |
| **Partially obstructed**            | Noisy breathing (stridor/gurgling/snoring), increased work, some air movement. Urgent.                                                                                        |
| **Completely obstructed**           | **Silent** (no air movement), see-saw/paradoxical chest–abdomen motion, no breath felt — **immediate life threat.**                                                           |
| **Apnoeic / no airway effort**      | Not breathing — assess for cardiac arrest (→ arrest pathway) or peri-arrest respiratory failure.                                                                              |

### 1.2 LOOK

- **See-saw / paradoxical respiration** (chest in–abdomen out) → obstruction.
- **Accessory muscle use, tracheal tug, intercostal/suprasternal recession** → increased airway/respiratory effort.
- **Central cyanosis** (lips/tongue) → severe hypoxaemia (a late sign).
- **Visible foreign body / vomit / blood / secretions** in the mouth/pharynx.
- **Facial, mouth, or neck trauma; burns to face/neck; soot in nostrils/mouth; singed nasal hair** → impending airway compromise (burn/inhalation).
- **Swelling:** lips/tongue/face (angioedema, anaphylaxis), neck (haematoma, infection — Ludwig's angina, abscess), post-surgical neck swelling.
- **Reduced conscious level / GCS ≤8** → cannot protect own airway (tongue/soft-tissue obstruction, aspiration risk).
- **Drooling / inability to swallow secretions / tripod position** → supraglottic pathology (epiglottitis, severe infection) — significant.

### 1.3 LISTEN

| Sound                                           | Meaning                                                                                            |
| ----------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| **Normal speech, full sentences**               | Patent (reassuring).                                                                               |
| **Hoarse voice / "hot potato" (muffled) voice** | Laryngeal/supraglottic pathology or oedema — **threatened airway.**                                |
| **Stridor — inspiratory**                       | **Upper-airway obstruction** (larynx/above) — urgent; biphasic/expiratory suggests lower/tracheal. |
| **Snoring**                                     | Tongue/soft-palate obstruction — usually reduced consciousness.                                    |
| **Gurgling**                                    | Liquid (secretions/blood/vomit) in the airway — needs suction.                                     |
| **Crowing**                                     | Laryngeal spasm.                                                                                   |
| **Silence + effort**                            | **Complete obstruction** — immediate.                                                              |
| **Silence + no effort**                         | Apnoea / arrest.                                                                                   |
| **Cough — weakening**                           | Progressive obstruction / fatiguing — alarm.                                                       |

### 1.4 FEEL

- **Airflow at mouth/nose** (present / reduced / absent).
- **Tracheal position** (central / deviated — deviation points to tension pneumothorax or large intrathoracic process — a B finding, but felt here).
- **Surgical emphysema** (crepitus — airway/lung injury).
- **Symmetry of chest movement** with breaths (overlaps B).

### 1.5 RAPID DIFFICULTY SCREEN (anticipate a difficult airway — DAS 2025 / LEMON–MOANS–RODS)

Recordable risk flags that **change the plan** (call for skilled help earlier, prepare adjuncts/eFONA):

- **LEMON (difficult laryngoscopy/intubation):** **L**ook externally (facial/neck trauma, obesity, large tongue, short neck, beard); **E**valuate **3-3-2** (mouth opening <3 fingers, hyoid–chin <3, thyroid–mouth <2 = harder); **M**allampati 3–4; **O**bstruction/Obesity (stridor, mass, swelling); **N**eck mobility reduced (C-spine collar, arthritis, fixed flexion).
- **MOANS (difficult bag-mask ventilation):** **M**ask seal poor (beard, blood, facial injury); **O**bese/Obstruction; **A**ged >55; **N**o teeth; **S**noring/OSA.
- **RODS (difficult supraglottic airway):** **R**estricted mouth opening; **O**bstruction; **D**istorted airway (tumour/trauma); **S**tiff lungs (high airway pressures).
- **Physiologically difficult airway (DAS 2025 emphasis):** hypoxaemia, hypotension, metabolic acidosis, RV failure → peri-intubation arrest risk; flag for peroxygenation + haemodynamic optimisation before any intubation.
- **History flags:** previous difficult intubation, prior neck radiotherapy/surgery, OSA, known airway pathology.

---

## 2. FINDINGS → ACTIONS (each finding triggers candidate actions; least-invasive-first, escalate if fails)

Actions are **decision-support options** the clinician performs/confirms; each carries a state (build: "performed / in progress / indicated-not-done / not indicated / deferred"). Doses/specifics verified at build.

### Tier 1 — Basic / always-available

- **Patent + talking** → _Action:_ **apply high-flow O₂ 15 L/min reservoir mask** (target SpO₂ 94–98%; 88–92% if hypercapnic risk); position of comfort; **continue monitoring + reassess.**
- **Snoring / tongue obstruction / reduced GCS** → **head-tilt/chin-lift** (no trauma) OR **jaw thrust** (trauma/C-spine); reassess airflow.
- **Gurgling / visible secretions, blood, vomit** → **suction** (rigid Yankauer); reassess.
- **Obstruction persists after manoeuvres, no gag (unconscious)** → **oropharyngeal (Guedel) airway**; reassess.
- **Obstruction, gag present / clenched jaw (and no base-of-skull fracture)** → **nasopharyngeal airway**; reassess.
- **Unconscious, breathing, no trauma, airway otherwise unsupported** → **recovery position**.
- **Visible foreign body** → remove if clearly visible/reachable (suction/Magill under vision); **choking with effective cough** → encourage cough; **ineffective cough/severe obstruction** → back blows/abdominal thrusts (conscious) → CPR if unconscious.

### Tier 2 — Pharmacological / cause-specific (clinician-directed)

- **Anaphylaxis / angioedema with airway swelling** → **IM adrenaline** (adult 500 micrograms / 0.5 mL 1:1000, repeat after 5 min if needed) + O₂ + adjuncts + prepare advanced airway + senior/ICU; **call early** (dose verified at build).
- **Inflammatory oedema / infective swelling (e.g. croup, some obstructions)** → **steroids ± nebulised adrenaline** (cause-dependent — clinician decision; time for effect in non-immediate cases); **epiglottitis/supraglottitis** → **do NOT distress the patient, senior anaesthetic + ENT immediately, controlled airway in theatre** (avoid instrumentation that precipitates total obstruction).
- **Burns/inhalation injury with airway risk** → **early intubation before oedema closes the airway** (a closing window — escalate immediately; don't wait).
- **Laryngospasm** → high-flow O₂, jaw thrust + CPAP, deepen anaesthesia / consider small-dose neuromuscular blockade (clinician).

### Tier 3 — Advanced airway (skilled operator; DAS 2025 Plan A→B→C→D)

- **Simple measures fail OR airway protection needed (GCS ≤8, ongoing aspiration, can't maintain patency)** → **call skilled airway operator (anaesthetics/ICU)** and prepare for advanced airway.
- **Plan A — facemask ventilation + tracheal intubation** (optimise: head/neck position, blade/videolaryngoscope, bougie/stylet, external laryngeal manipulation, optimal NMB, suction, best operator); **aim first-pass success;** limit attempts.
- **Plan B/C — supraglottic airway / facemask ventilation** if intubation fails (oxygenate, don't persist with repeated laryngoscopy); stop, think, communicate.
- **Plan D — CICO ("cannot intubate, cannot oxygenate") → emergency front-of-neck airway (eFONA) without delay**; confirm placement with **capnography**.
- **Peroxygenation + haemodynamic optimisation** (physiologically difficult airway) before intubation; **confirm ANY advanced airway with waveform capnography.**
- **C-spine immobilisation** maintained throughout if trauma.

### Cross-cutting

- **After EVERY action → reassess airway (look/listen/feel) before proceeding to B.**
- **Threatened airway (any 1.1 "at risk" / progression signs)** → escalate **pre-emptively** (call skilled help) even while patent — late rescue is harder.

---

## 3. COMBINATIONS & ESCALATION LOGIC (the "smart" part — how combinations trigger responses)

The engine should reason on **combinations + trajectory**, not single findings in isolation:

- **Silent + paradoxical movement + no airflow** → **complete obstruction** → immediate: open airway (manoeuvre), suction, adjunct, **call for skilled help NOW**, prepare advanced airway; if foreign body → choking algorithm.
- **Stridor + drooling + muffled voice + tripod + (child) distress** → **supraglottic obstruction (e.g. epiglottitis)** → **do not distress/instrument; immediate senior anaesthetic + ENT; controlled airway in theatre; O₂; steroids ± neb adrenaline per cause.**
- **Facial/neck burns + soot + singed nasal hair + hoarse voice** → **inhalation injury, closing airway** → **early definitive airway before oedema obstructs** → escalate immediately.
- **Lip/tongue swelling + urticaria + wheeze + hypotension after a trigger** → **anaphylaxis** → **IM adrenaline first**, O₂, fluids, prepare advanced airway, senior/ICU.
- **Reduced GCS (≤8) + snoring + no gag** → **cannot protect airway** → jaw thrust + adjunct + suction; **definitive airway (intubation) for protection**; recheck glucose (D), find cause.
- **Expanding neck haematoma (post-op/trauma/anticoagulated) + voice change** → **threatened airway** → senior airway + surgical help; may need wound opening + definitive airway urgently.
- **Progression over minutes** (voice change → weak cough → drooling → stridor) → **treat as an increasingly compromised airway** → escalate the plan a level; don't wait for desaturation (late sign).
- **Any difficulty flags (LEMON/MOANS/RODS positive) + need for airway** → **anticipate difficulty: call most skilled operator, prepare adjuncts + eFONA kit, plan A→D before starting, optimise physiology first.**
- **Apnoea + no pulse / no signs of life** → **NOT an airway problem alone — cardiac arrest → ALS arrest pathway (next module) + CPR.**

> **Severity/urgency output:** the engine should classify the airway as **secure / threatened / partially obstructed / completely obstructed / apnoeic-arrest**, surface the matched actions prominently for the worse states, and **insist on reassessment + treat-before-proceeding.**

---

## 4. WHAT THE AIRWAY STEP MUST CAPTURE (for the record)

- The findings recorded (look/listen/feel + difficulty screen), with time.
- The airway state classification (secure → arrest).
- Each action: what, by whom (role/cadre), time, and its state.
- O₂ delivery (device, flow, target, achieved SpO₂).
- Escalation calls (who called, who/what summoned, time).
- Advanced-airway details if done (device, attempts, confirmation by capnography, complications) — though full advanced-airway/RSI tooling may be its own depth later; record-capable now.
- Reassessment findings after each action (the loop).
- All append-only/timestamped on the resus timeline (medico-legal).

## 5. DEFERRED / FLAG (don't over-build the first airway step)

- **Full RSI (rapid sequence induction) drug-and-checklist tooling**, detailed videolaryngoscopy/eFONA procedural guidance, and ventilator setup are **deeper sub-modules** — the airway step must let a clinician **record** that these were done and the key parameters, and **prompt the escalation**, but the full procedural tooling can be its own later build. Capture + decision-support now; exhaustive procedural workflow later. (Confirm scope at build.)
- Paediatric airway specifics (sizes, weight-based, croup/epiglottitis nuances) — flag the paediatric branch; the engine routes by age (per the vitals catalog) and paediatric airway detail can be expanded.

## 6. SOURCES (cite; verify at build)

DAS 2025 guidelines for unanticipated difficult tracheal intubation in adults (BJA 2025); Resuscitation Council UK — ABCDE/Airway + 2025 First Aid/BLS; ERC & AHA Guidelines 2025; ASA 2022 difficult-airway practice guidelines; LEMON/MOANS/RODS (validated assessment mnemonics); management-of-airway-obstruction literature (progression/late-signs principle). **2025 supersedes 2020/2021/2015.**
