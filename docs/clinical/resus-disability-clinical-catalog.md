# MedSync — Resus · DISABILITY: Clinical Findings & Action Catalog

### Emergency-medicine-grade content for the Disability (D) step of the ABCDE resus surface

> **Purpose.** The complete clinical content for the **Disability (D)** step: every assessable finding, what it means, and how a finding (or combination) triggers a specific action — for the same findings→action→state engine as airway/breathing/circulation, with correct neurological-emergency medicine. This is the **medicine**; `resus-disability-step-kickoff.md` is the build. **D is assessed only after A, B, and C are secure** — and most reduced consciousness is _caused_ by A/B/C problems (hypoxia, hypercapnia, hypoperfusion), so **D problems often resolve by fixing A/B/C; return to A on deterioration.**
>
> **Guideline basis (current — verify at build):** **Resuscitation Council UK ABCDE — Disability**; **ERC & AHA Guidelines 2025 / ILCOR 2025 CoSTR**; **American Epilepsy Society status epilepticus guideline + 2025 SE management updates** (benzodiazepine first-line, the three-stage algorithm); GCS (Teasdale); neurological-emergency literature (raised ICP, stroke, hypoglycaemia). The **2025 cycle supersedes 2020/2021.**
>
> **Clinical-safety status:** decision-support, not autonomous — the surface presents the guideline-correct assessment + action options and records what the clinician does; drugs via the smart prescribing tool (verified at build). Procedures (definitive airway for GCS ≤8, neurosurgery) by a skilled operator; the app records + prompts escalation. **CSO sign-off required.** Encode facts; cite sources; no copyrighted artwork.

---

## 0. DISABILITY ASSESSMENT — THE GOVERNING PRINCIPLES

1. **D after A, B, C — but only once they're secure.** And critically: **most reduced consciousness is secondary to A/B/C** (hypoxia, hypercapnia, hypoperfusion/shock, hypoglycaemia) — so **always re-confirm A/B/C are optimised before attributing reduced GCS to a primary brain problem.** Deterioration → return to A.
2. **The aim of D:** rapidly assess conscious level, pupils, glucose, and focal/seizure signs — and treat the **immediately reversible + the catastrophic**: **hypoglycaemia, opioid toxicity, status epilepticus, and raised intracranial pressure / herniation** — before moving to E.
3. **GCS ≤8 → the airway is at risk → back to A** (the patient may not protect their airway — consider a definitive airway). "GCS 8 → intubate" is the classic teaching (a threshold for airway protection, with clinical judgement).
4. **⚠️ "DON'T EVER FORGET GLUCOSE" — check capillary blood glucose in EVERY patient with altered consciousness.** **Hypoglycaemia is instantly reversible and perfectly mimics stroke, sepsis, intoxication, and coma** — a missed hypoglycaemia is an unforgivable, lethal error. It is the single most important D action.
5. **Reassess** — a **falling GCS is a return-to-A trigger** and a neurosurgical emergency until proven otherwise.

> **⚠️ DISABILITY TRAPS / must-not-miss (build prominently):**
>
> - **Hypoglycaemia mimics everything** — always check glucose; treat <3.0 (or <4.0 symptomatic) immediately; recheck.
> - **Reduced GCS is usually an A/B/C problem first** — fix oxygenation/perfusion/glucose before assuming a primary neuro cause.
> - **Cushing's response (hypertension + bradycardia + irregular breathing) = raised ICP / impending herniation** — a neurosurgical emergency; do NOT treat the "hypertension" as primary.
> - **Unequal/fixed/dilated pupil(s) = herniation / mass / bleed until proven otherwise** — urgent CT + neurosurgery.
> - **Benzodiazepine UNDERdosing is the dominant error in status epilepticus** — give the FULL guideline first-line dose; underdosing → refractory status + higher mortality, and adequate dosing does NOT increase respiratory complications vs placebo (the seizure itself is the danger). **Dose it properly.**
> - **A seizing patient who "stops" but doesn't wake up may be in non-convulsive status** — altered consciousness post-seizure that doesn't improve needs escalation/EEG.
> - **Pinpoint pupils + reduced consciousness + low RR = opioid toxicity** — naloxone (and back to B).

---

## 1. THE ASSESSMENT — what the user records (the finding catalog)

**CONSCIOUSNESS / PUPILS / GLUCOSE / FOCAL & SEIZURE / CAUSE-SCREEN.** Each item is a recordable finding with meaning. (Findings→actions §2; combinations §3.)

### 1.1 Neurological / disability state (the top-level finding — drives everything)

| Finding                                          | Meaning                                                                                             |
| ------------------------------------------------ | --------------------------------------------------------------------------------------------------- |
| **Alert + oriented (GCS 15 / AVPU A)**           | Normal conscious level. Reassess.                                                                   |
| **Mild–moderate impairment (GCS 9–14 / V or P)** | Reduced — find + treat the cause (A/B/C/glucose first); monitor closely.                            |
| **Severe impairment / coma (GCS ≤8 / U)**        | **Airway at risk → back to A (definitive airway); emergency** — find the cause urgently.            |
| **Active seizure / status epilepticus**          | Convulsive activity (≥5 min or recurrent without recovery = status) → **time-critical, treat now.** |
| **Signs of raised ICP / herniation**             | Cushing's, unequal/fixed pupil, posturing, falling GCS → **neurosurgical emergency.**               |

### 1.2 CONSCIOUS LEVEL

- **AVPU** (rapid): **A**lert / responds to **V**oice / responds to **P**ain / **U**nresponsive. (P or U → GCS ≤8.)
- **GCS** (detailed, /15): **Eye opening /4** (spontaneous 4, to voice 3, to pain 2, none 1); **Verbal /5** (oriented 5, confused 4, words 3, sounds 2, none 1); **Motor /6** (obeys 6, localises 5, withdraws 4, abnormal flexion 3, extension 2, none 1). Record the **components** (not just the total — trend each); note if intubated (verbal not testable — "T").
- **Trend:** **a falling GCS is the key danger sign** (record serial GCS with time).

### 1.3 PUPILS

- **Size** (mm), **equality**, **reaction to light** (brisk / sluggish / fixed).
- **Unequal (anisocoria) / fixed / dilated** → **raised ICP, herniation (uncal → CN III palsy → fixed dilated pupil), mass, bleed** → urgent.
- **Bilateral pinpoint** → **opioid toxicity** (also pontine lesion, organophosphate).
- **Bilateral fixed dilated** → severe brainstem injury / hypoxia / certain drugs / (caution: reversible causes).

### 1.4 GLUCOSE ("Don't Ever Forget Glucose")

- **Capillary blood glucose — in EVERY altered-consciousness patient.** **<3.0 mmol/L = severe hypoglycaemia (immediate); <4.0 + symptoms = treat;** **>15 + ketones/acidosis → DKA/HHS** (a cause of reduced consciousness); record the value + time. **Recheck after treatment.**

### 1.5 FOCAL SIGNS / SEIZURE / POSTURE

- **Lateralising/focal deficit:** unilateral limb weakness, facial droop, dysphasia (→ **stroke** — time-critical; note onset time), gaze deviation.
- **Seizure activity:** generalised tonic-clonic, focal, subtle/non-convulsive; duration; recurrent without recovery (**status: ≥5 min convulsive, or recurrent without regaining consciousness**).
- **Abnormal posturing:** **decorticate (flexion)** or **decerebrate (extension)** — severe brain injury / raised ICP.
- **Meningism:** neck stiffness, photophobia (→ meningitis/SAH — overlaps E for rash).

### 1.6 CAUSE-SCREEN (why is consciousness reduced? — the differential to record/consider)

A structured prompt (the reversible + the dangerous): **hypoxia / hypercapnia (A/B), hypoperfusion-shock (C), HYPOGLYCAEMIA, drugs/toxins (opioids, benzos, alcohol, CO), intracranial (stroke/bleed/SAH/mass/raised ICP), seizure/post-ictal/non-convulsive status, infection (meningitis/encephalitis/sepsis), metabolic (Na⁺, Ca²⁺, uraemia, hepatic, endocrine — Addisonian, myxoedema, thyroid), hypo/hyperthermia (E), hypertensive encephalopathy/eclampsia.** (Mnemonics: AEIOU-TIPS / the reversible causes.)

---

## 2. FINDINGS → ACTIONS (each finding triggers candidate actions; reversible-first, escalate)

Decision-support options the clinician performs/confirms; each carries a state (`indicated/in_progress/performed/not_indicated/deferred/failed`). Drugs via the prescribing tool, doses verified at build. Tiered like the other steps.

### Tier 1 — Basic / always-available

- **Any reduced consciousness** → **RE-CONFIRM + optimise A, B, C** (most reduced GCS is secondary); **high-flow O₂**, ensure perfusion; **CHECK CAPILLARY GLUCOSE NOW**; position/protect airway; **continuous monitoring** (incl. GCS trend); IV access (if not already).
- **GCS ≤8 / not protecting airway** → **back to A → prepare definitive airway (RSI/intubation), call skilled help**; nurse safely (recovery position if appropriate meanwhile).
- **Serial GCS + pupils** (the trend is the monitoring).

### Tier 2 — Cause-specific (clinician-directed; drugs via prescribing tool, doses verified)

- **HYPOGLYCAEMIA (<3.0 / <4.0 symptomatic)** → **IV glucose** (e.g. 10% glucose) **OR IM glucagon if no IV access**; **recheck glucose**; treat the cause; (give thiamine if malnourished/alcohol — Wernicke's). _(The highest-yield, instantly-reversible action.)_
- **OPIOID TOXICITY (pinpoint pupils + low RR + reduced GCS)** → **naloxone** (titrated IV/IM/IO; short half-life → re-dose/infusion) + support ventilation (back to B). _(Caution: precipitates withdrawal.)_
- **STATUS EPILEPTICUS / active seizure** → **first-line BENZODIAZEPINE at the FULL guideline dose** — e.g. **IV lorazepam 4 mg** (may repeat once after 5–10 min), OR **IM/buccal/intranasal midazolam 10 mg** (if no IV access), OR **IV/PR diazepam 10 mg**; **DO NOT underdose** (the dominant error → refractory status). **If seizing after 2 adequate benzo doses → urgent second-line** (IV levetiracetam / valproate / fosphenytoin) + senior/anaesthetic/ICU; **refractory → anaesthesia (propofol/midazolam infusion) + continuous EEG.** Check + treat glucose; protect airway. _(Doses verified at build.)_
- **RAISED ICP / HERNIATION (Cushing's, unequal/fixed pupil, posturing, falling GCS)** → **immediate senior + neurosurgical referral + urgent CT head**; head-up 30°, optimise oxygenation/CO₂/BP, treat the cause; **consider osmotherapy (hypertonic saline / mannitol) per protocol/neurosurgery**; definitive airway. **Do NOT treat the Cushing's hypertension as primary.**
- **STROKE (focal deficit, time-critical)** → **urgent CT head + activate stroke pathway** (thrombolysis/thrombectomy window — note onset time); glucose; BP per stroke protocol; senior/stroke team.
- **DKA / HHS (high glucose + reduced consciousness)** → DKA/HHS pathway (fluids, insulin, K⁺, find the precipitant) — overlaps C/metabolic.
- **ECLAMPSIA (seizure in pregnancy/postpartum)** → **magnesium sulfate** (loading + maintenance per obstetric protocol — NOT first a benzo for eclamptic seizures) + control BP + urgent obstetric/senior; deliver per obstetrics.
- **Benzodiazepine toxicity (if clearly the cause)** → **flumazenil cautiously** (seizure risk — esp. mixed overdose/dependence; senior decision).
- **Suspected meningitis/encephalitis** → don't delay antibiotics/antivirals (sepsis overlap); senior.

### Tier 3 — Advanced / escalation (skilled operator)

- **Definitive airway (RSI/intubation)** for GCS ≤8 / airway-at-risk / to facilitate CT in the agitated/seizing patient.
- **Neurosurgical intervention** (evacuation, EVD/ICP monitoring) for raised ICP/bleed; **stroke thrombectomy**; **continuous EEG + anaesthesia** for refractory status; **ICU** for ongoing neuroprotection.
- (Cardiac arrest → arrest pathway, next module.)

### Cross-cutting

- **CHECK GLUCOSE in every altered patient** — non-negotiable, first.
- **Re-confirm A/B/C optimised** before attributing to a primary neuro cause.
- **After EVERY intervention → reassess (GCS, pupils, glucose) before proceeding to E;** a falling GCS → return to A.
- **Escalate raised-ICP / stroke / refractory-status pre-emptively** — time-critical.

---

## 3. COMBINATIONS & ESCALATION LOGIC (the "smart" part)

Reason on **combinations + trajectory**, not single findings:

- **Reduced GCS + LOW glucose** → **HYPOGLYCAEMIA** → IV glucose / IM glucagon → recheck → (often rapidly reverses; if not, reconsider). _(Check this FIRST in any altered patient.)_
- **Reduced GCS + pinpoint pupils + low RR (± known opioids)** → **OPIOID TOXICITY** → naloxone + ventilatory support (back to B).
- **Active convulsion ≥5 min / recurrent without recovery** → **STATUS EPILEPTICUS** → full-dose benzodiazepine now (don't underdose) → second-line if persists → anaesthesia/EEG; check glucose; protect airway.
- **Hypertension + BRADYCARDIA + irregular breathing (± falling GCS, unequal pupil, posturing)** → **RAISED ICP / HERNIATION (Cushing's)** → neurosurgery + CT + ICP measures; do NOT treat the BP as primary.
- **Unequal / fixed dilated pupil + reduced/falling GCS** → **herniation / mass / bleed** → urgent CT + neurosurgery + airway.
- **Acute focal deficit (weakness/droop/dysphasia) + known onset time** → **STROKE** → CT + stroke pathway (thrombolysis/thrombectomy window); glucose; senior.
- **Seizure in pregnancy / ≤6 wk postpartum (± severe hypertension/headache)** → **ECLAMPSIA** → **magnesium sulfate** (not benzo-first) + BP control + obstetric emergency.
- **Reduced GCS + fever + (rash/neck stiffness)** → **meningitis/encephalitis/sepsis** → don't delay antimicrobials; senior (E for rash).
- **Reduced GCS + the A/B/C picture abnormal** → **the cause is likely A/B/C** → optimise oxygenation/perfusion/glucose first, reassess GCS.
- **Seizure stopped but NOT waking up** → consider **non-convulsive status** → escalate/EEG.
- **GCS ≤8 (any cause)** → **back to A → definitive airway.**
- **Unresponsive + no pulse / no signs of life** → **cardiac arrest → ALS arrest pathway (next module) + CPR.**

> **Severity/urgency output:** classify D as **alert / mild-moderate impairment / severe-impairment-coma (GCS≤8) / active-seizure-status / raised-ICP-herniation**, surface the matched reversible-first actions (glucose always), and enforce GCS≤8→back-to-A + treat-before-proceeding to E + reassess.

---

## 4. WHAT THE DISABILITY STEP MUST CAPTURE (for the record)

- Findings recorded (AVPU, **GCS with components + serial/trend**, pupils [size/equality/reaction], **glucose value**, focal deficit + onset time, seizure activity + duration, posturing, cause-screen), with time.
- The neuro-state classification + the suspected cause.
- Each action: what, by whom (role/cadre), time, state; glucose treatment (+ recheck value); naloxone; benzodiazepine (drug/dose/route/time — and whether full guideline dose) + second-line; magnesium (eclampsia); osmotherapy; via the prescribing tool; procedures (definitive airway, CT, neurosurgery referral — record-capable).
- Escalation calls (neurosurgery/stroke/ICU/obstetrics/anaesthetics — who/when); CT/EEG.
- Reassessment (GCS/pupils/glucose) after each intervention (the loop); falling-GCS→return-to-A events.
- All append-only/timestamped on the resus timeline (medico-legal).

## 5. DEFERRED / FLAG (don't over-build)

- **Full status-epilepticus second/third-line algorithm tooling, detailed stroke-pathway/thrombolysis workflow, ICP-monitoring/osmotherapy protocols, RSI procedural tooling** are deeper sub-modules — the D step must **record** these + key parameters and **prompt escalation**, but the exhaustive workflow can be later. Capture + decision-support + escalation now.
- **Paediatric** (age/weight-based GCS [paediatric GCS for pre-verbal], weight-based glucose [2 mL/kg of 10%], weight-based benzo/naloxone; febrile seizure nuances) — route by age/weight per the vitals + drug catalogs; **never adult flat doses in a child.** **Obstetric** (eclampsia → magnesium-first) — flag the branches.

## 6. SOURCES (cite; verify at build)

Resuscitation Council UK — ABCDE/Disability; ERC & AHA Guidelines 2025 (ILCOR 2025 CoSTR); American Epilepsy Society convulsive status epilepticus guideline + 2025 SE management updates (benzodiazepine first-line, three-stage algorithm, underdosing evidence — ESETT); GCS (Teasdale & Jennett); neurological-emergency literature (raised ICP/herniation, stroke pathways, hypoglycaemia). **2025 supersedes earlier; re-verify doses + thresholds at build; CSO sign-off.**

---

> _Committed verbatim from the CSO-supplied catalog (encoding normalised to Unicode; clinical content unchanged) as the GATE A clinical source for the Disability step. See [`docs/resus-disability-gate-a-proposal.md`](../resus-disability-gate-a-proposal.md) for the engineering proposal + reuse confirmation + verification notes._
