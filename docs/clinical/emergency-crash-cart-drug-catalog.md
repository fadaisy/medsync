# MedSync — Emergency & Crash-Cart Drug Catalog

### Reference content for the smart prescribing tool (emergency/resus scope)

> **Source.** Committed verbatim from the CSO-supplied catalog (encoding normalised to UTF-8). The structured encoding lives in `lib/prescribing/reference/emergency-drug-catalog.ts`; web cross-verification of the load-bearing doses is recorded in [docs/smart-prescribing-gate-a-proposal.md](../smart-prescribing-gate-a-proposal.md) §A.
>
> **Guideline basis (current — VERIFY EVERY DOSE AT BUILD against the primary source):** **2025 AHA Guidelines for CPR & ECC / ACLS (Part 9 Adult ALS, Oct 2025)**, **ERC 2025 / ILCOR 2025 CoSTR**, Resuscitation Council UK (ALS + anaphylaxis), GINA 2025/2026 + BTS/NICE/SIGN 2024 (asthma), ANZCOR 11.5. The **2025 cycle supersedes 2020/2021.**
>
> **⚠️ CLINICAL-SAFETY — READ FIRST.** Drug doses are the **highest-risk content in the entire system.** Every dose/concentration/route/interval below MUST be **re-verified at build against the cited primary source** and **signed off by the Clinical Safety Officer (Fadhul)** before any clinical use. Doses here are encoded as **facts** for the engine; they are NOT a substitute for the clinician's judgement, the patient's weight/allergies/contraindications, or the official chart. **Adult doses unless stated; paediatric dosing is weight-based and routed separately (see §6).** This tool is **decision-support** — the clinician prescribes/confirms; the app records. Never reproduce copyrighted chart artwork.

---

## 0. HOW THIS CATALOG IS STRUCTURED (for the engine)

Each drug is a structured record the prescribing engine consumes:

- **Name** (generic; common brand in parentheses), **class**, **emergency indication(s)**.
- **Dose** (adult), **concentration/presentation** (the crash-cart form), **route(s)**, **interval/repeat/max**.
- **Key cautions / contraindications**, **monitoring**, **the ABCDE step / scenario it maps to** (so a recommendation can resolve to it).
- **Tier:** **Cardiac-arrest (ALS)** · **Peri-arrest / arrhythmia** · **Airway/Breathing emergency** · **Circulation/shock** · **Disability/metabolic** · **Reversal/antidote** · **RSI (record-only here)**.

> **Concentration safety:** the crash-cart concentration matters as much as the dose (e.g. adrenaline 1:1000 vs 1:10 000). The engine must surface the **correct concentration + volume** for the chosen indication, not just the milligram dose — this is a major real-world error source.

---

## 1. CARDIAC-ARREST DRUGS (ALS algorithm — full arrest module is later, but stock the catalog now)

> _(Verify against AHA 2025 / ERC 2025 / Resus Council ALS at build.)_

- **Adrenaline (epinephrine) — cardiac arrest.** Class: vasopressor/sympathomimetic. **Dose: 1 mg IV/IO every 3–5 minutes** during CPR. **Concentration: use 1:10 000 (0.1 mg/mL) — the 10 mL prefilled syringe** for IV/IO (NOT the 1:1000). Non-shockable (PEA/asystole): give as soon as feasible. Shockable (VF/pVT): after the 3rd shock. _(Distinct from the IM anaphylaxis dose — §3 — a critical do-not-confuse.)_
- **Amiodarone — shockable arrest (VF/pVT) refractory to defibrillation.** Class: antiarrhythmic. **Dose: 300 mg IV/IO bolus after the 3rd shock; further 150 mg IV/IO after the 5th shock.** Presentation: 150 mg/3 mL ampoules.
- **Lidocaine (lignocaine) — alternative to amiodarone in shockable arrest.** **Dose: 1–1.5 mg/kg IV/IO; may repeat 0.5–0.75 mg/kg.** (AHA lists amiodarone OR lidocaine.)
- **Atropine — NOT routinely recommended in cardiac arrest** (removed from the arrest algorithm for asystole/PEA — no benefit). Retained for **symptomatic bradycardia** (§2).
- **Sodium bicarbonate — NOT routine;** consider for specific situations (hyperkalaemia, tricyclic/sodium-channel-blocker overdose, pre-existing severe metabolic acidosis). Dose per indication (e.g. 1 mmol/kg). 8.4% presentation.
- **Calcium chloride — NOT routine;** consider for hyperkalaemia, hypocalcaemia, calcium-channel-blocker toxicity, hypermagnesaemia. (10% calcium chloride.)
- **Magnesium sulfate — arrest:** for **torsades de pointes / hypomagnesaemia** (2 g IV/IO); not routine otherwise.
- **(Vasopressin — evolving evidence; not first-line; AHA allows it but offers no advantage over adrenaline. Vasopressin+steroids reviewed.)**
- **Access note (AHA/ANZCOR 2025): IV is preferred over IO; if IV not rapidly achieved within ~2 attempts, IO is reasonable.** Adrenaline/lidocaine/atropine _can_ be given via ETT if no IV/IO (higher doses), but this is a last resort.

## 2. PERI-ARREST / ARRHYTHMIA DRUGS

> _(Full peri-arrest brady/tachy algorithms are a later module; stock the catalog.)_

- **Atropine — symptomatic bradycardia.** **Dose: 500 micrograms IV, repeat every 3–5 min, max 3 mg.** (Muscarinic antagonist.)
- **Adenosine — SVT (regular narrow-complex tachycardia).** **Dose: 6 mg rapid IV push (large-bore, flush); then 12 mg; (then 12–18 mg per protocol).** Warn: transient asystole/flushing/chest tightness. Caution in asthma.
- **Amiodarone — peri-arrest tachyarrhythmia.** e.g. 300 mg IV over 20–60 min (stable broad-complex / AF with adverse features), then infusion.
- **Isoprenaline / adrenaline / dopamine infusions — bradycardia unresponsive to atropine** (per protocol; pacing also).
- **Beta-blocker / diltiazem / verapamil — rate control** in specific stable SVT/AF (per protocol; cautions).
- **Magnesium sulfate — torsades; also severe asthma (§3).**

## 3. AIRWAY / BREATHING EMERGENCY DRUGS (these tie directly to the ABCDE-B recommendations)

> **This is the set the Breathing step's recommendations resolve to** — verify against GINA 2025/26, BTS/NICE/SIGN 2024, Resus Council anaphylaxis.

- **Adrenaline (epinephrine) — ANAPHYLAXIS.** **Dose: 500 micrograms (0.5 mL of 1:1000) IM, anterolateral thigh; repeat after 5 minutes if no improvement.** **Concentration: 1:1000 (1 mg/mL) IM — NOT the 1:10 000 IV arrest concentration.** Refractory → adrenaline infusion (senior/ICU). _(The single most important do-not-confuse in the catalog: IM 1:1000 for anaphylaxis vs IV 1:10 000 for arrest.)_
- **Salbutamol — acute asthma / bronchospasm.** **Dose: 5 mg nebulised (oxygen-driven); repeat back-to-back / continuous (5 mg up to every 15–30 min, or 10 mg/hr continuous) in life-threatening.** (Also pMDI + spacer in milder.)
- **Ipratropium bromide — acute severe / life-threatening asthma.** **Dose: 500 micrograms nebulised (oxygen-driven), with salbutamol** (additive; up to every 4–6 h).
- **Systemic corticosteroid — acute asthma/COPD, anaphylaxis (after adrenaline).** **→ Hydrocortisone 100 mg IV** OR **Prednisolone 40–50 mg PO** (equivalent; PO if able to swallow). _(This is the exact recommendation from the Breathing step — the tool offers both options.)_ Steroids take 4–6 h to act — give early.
- **Magnesium sulfate — life-threatening asthma.** **Dose: 1.2–2 g IV infusion over 20 minutes** (single dose; senior/ICU).
- **GTN (glyceryl trinitrate) — acute pulmonary oedema / cardiac chest pain.** Sublingual / IV infusion (titrated; caution if hypotensive).
- **Furosemide — acute pulmonary oedema.** IV (dose per patient/renal function).
- **Naloxone — opioid-induced respiratory depression** (also §5).

## 4. CIRCULATION / SHOCK DRUGS

- **IV fluids — balanced crystalloid** (Hartmann's/Plasma-Lyte/0.9% saline) — resuscitation boluses (e.g. 250–500 mL, reassess; cautious in cardiogenic/heart failure). _(A "drug" in the emergency sense — record volume/time.)_
- **Tranexamic acid (TXA) — major haemorrhage/trauma.** **Dose: 1 g IV over 10 min, then 1 g over 8 h** (early — time-critical; within 3 h of trauma).
- **Adrenaline / noradrenaline / dopamine / dobutamine — vasopressor/inotrope infusions** for shock (per protocol; central access ideally; titrated to MAP ≥65).
- **Glucose / dextrose — see §5** (hypoglycaemia as a shock/altered-consciousness cause).
- **Blood products / major-haemorrhage protocol** — activate (not a single drug; record activation + units).
- **Hydrocortisone — adrenal crisis / refractory shock** (100 mg IV).

## 5. DISABILITY / METABOLIC / REVERSAL & ANTIDOTES

- **Glucose (dextrose) — HYPOGLYCAEMIA (<3.0 mmol/L; altered consciousness "Don't Ever Forget Glucose").** **IV: e.g. 10% glucose 100–200 mL (or per protocol);** **IM glucagon 1 mg if no IV access.** Recheck glucose.
- **Naloxone — opioid toxicity / respiratory depression.** **Dose: 400 micrograms IV/IM/IO (titrate; repeat); infusion if needed.** Short half-life — re-dose. (Caution: precipitates withdrawal.)
- **Flumazenil — benzodiazepine reversal** — **use cautiously** (seizure risk, esp. mixed overdose/dependence); senior decision.
- **Benzodiazepine — SEIZURES / status epilepticus.** e.g. **lorazepam 4 mg IV**, OR **diazepam 10 mg IV/PR**, OR **midazolam 10 mg IM/buccal** (first-line; repeat once; then status pathway). _(First-line for seizures in D.)_
- **Magnesium sulfate — eclampsia (obstetric seizure/severe pre-eclampsia)** — loading + maintenance per obstetric protocol.
- **Glucose/thiamine — consider in altered consciousness** (Wernicke's risk in malnourished/alcohol).
- **Antidotes (stock per protocol):** N-acetylcysteine (paracetamol), atropine + pralidoxime (organophosphate), etc. — emergency antidote list per the facility.

## 6. RSI / INDUCTION & PAEDIATRIC (record-aware now; full tooling later)

- **RSI drugs (record-only here — full RSI checklist tooling is a later sub-module):** an induction agent (e.g. ketamine / etomidate / propofol) + a neuromuscular blocker (e.g. rocuronium / suxamethonium) — doses weight-based; the prescribing tool should let a skilled operator **record** what was given (drug/dose/time), not drive the RSI procedure here. Flag for the later RSI module.
- **PAEDIATRIC dosing is WEIGHT-BASED (mg/kg) and MUST route separately** — e.g. arrest adrenaline **10 micrograms/kg IV/IO** (NOT the adult 1 mg flat dose), fluids 10–20 mL/kg boluses, glucose 2 mL/kg of 10%, etc. The engine **must route by age/weight** (per the vitals catalog's paediatric branch) and **never apply an adult flat dose to a child.** Paediatric doses verified at build; consider a length/weight-based tool (e.g. Broselow-type) later.

---

## 7. THE ACCOUNTABILITY MODEL (emergency drugs are GRABBED & GIVEN, not dispensed)

This is the model that ties to the future pharmacy:

- In an emergency, a drug is **taken from the crash cart and administered at the point of care** — there is **no prescribe → pharmacy-dispense → administer** cycle (no time).
- So the prescribing tool's emergency mode **records administration** (drug, dose, route, time, who gave it, which patient, which resus/encounter) — the prescription IS the administration record.
- **Each administration decrements a notional crash-cart inventory** (or flags "used from cart X").
- **The future pharmacy module does NOT dispense these** — it **tracks the emergency/crash-cart inventory, reconciles what was used against the administration records, and replaces/restocks** what's been consumed (and monitors expiry). Pharmacy's role here is **stewardship + replenishment + audit**, not supply-on-prescription.
- Therefore every emergency administration must be **captured cleanly enough for later reconciliation** (drug + amount + cart + time + patient + giver) — this is the data the pharmacy will reconcile against. Build the administration record now with that in mind; leave the **pharmacy-reconciliation seam** clean.
- **Controlled drugs** (opioids, ketamine, benzodiazepines, etc.) need **extra accountability** (witnessed, logged) even in emergencies — flag these in the catalog so the tool can enforce stricter capture.

## 8. SOURCES (cite; verify EVERY dose at build)

2025 AHA Guidelines for CPR & ECC / ACLS Part 9 (Oct 2025); ERC Guidelines 2025; ILCOR 2025 CoSTR; ANZCOR 11.5 (Medications in Adult Cardiac Arrest); Resuscitation Council UK (ALS + anaphylaxis); GINA 2025/2026; BTS/NICE/SIGN asthma (SIGN 244, 2024); national/BNF formulary for non-arrest doses. **2025 supersedes 2020/2021. Re-verify every dose, concentration, route, and interval at build; CSO sign-off mandatory.**
