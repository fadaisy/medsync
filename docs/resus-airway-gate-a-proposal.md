# Resus · AIRWAY step — GATE A proposal (clinical sign-off)

**Status:** ⛔ **DRAFT — awaiting CSO (Fadhul) sign-off. No airway code is built, and no dose/threshold lands in code, until §A is signed.**
**Branch:** `feat/resus-airway`
**Scope:** the **Airway (A)** step of the ABCDE resus surface — a **findings → triggered-actions → action-states** engine, built as the **reusable pattern** for B/C/D/E. Record + decision-support + escalation now; full RSI/videolaryngoscopy/eFONA _procedural_ tooling + paediatric airway depth deferred (§C).
**Clinical source:** [`docs/clinical/resus-airway-clinical-catalog.md`](clinical/resus-airway-clinical-catalog.md) (CSO catalog, now committed) + the web-verification in §A.6.
**This gate is a clinical sign-off, not just technical.** The finding catalog, action catalog, doses, and findings→action mappings are a clinical-safety artifact.

> **Honesty posture — "never ship a remembered dose."** Every dose/threshold in §A.6 was checked against a primary/authoritative source via web search on **2026-06-02** and is confidence-tagged. **DAS 2025 was confirmed verbatim from the BJA-published full text** and supersedes DAS 2015. Anything not web-verified is in §F and is **not** proposed as a code constant. The catalog was **not** in the repo before this gate — it's now committed to `docs/clinical/` so the engine traces to a version-controlled source.

---

## Preface — builds on the existing resus surface

The resus surface (Option A) already exists and is live on `main` (ADRs 0044–0047): the **episode** object, the **immutable append-only timeline** (`resus_timeline_events`, hard-locked, corrections via `supersedes_event_id`), **team mobilisation**, **roles**, the **arrest seam**, continuous **monitoring**, and the encounter link. The Airway step is the **first concrete ABCDE step built within it** — it does not re-establish any of that.

It also reuses the established clinical-data shapes: [`lib/resus/reference/doses.ts`](../lib/resus/reference/doses.ts) (`tier: fixed|protocol_surfaced|category`, `confidence: verified-web|reference-doc-only|needs-CSO-verification`) and [`lib/resus/reference/abcde-catalog.ts`](../lib/resus/reference/abcde-catalog.ts) (step catalog; actions reference doses by id; the app never acts). The two fixed airway doses **already exist, web-verified**, in `doses.ts` (`anaphylaxis_adrenaline_im`, `oxygen_critically_ill`).

---

## A. Clinical model — needs your sign-off (the heart of this gate)

### A.1 — Finding catalog (what the clinician records; catalog §1)

**Patency state** (the headline finding, drives everything): `patent_talking` · `patent_at_risk` · `partially_obstructed` · `completely_obstructed` · `apnoeic`.

**LOOK / LISTEN / FEEL** — recordable as present / absent / not-assessed:

- **LOOK:** see-saw/paradoxical movement · accessory muscles/tracheal tug/recession · central cyanosis (late) · foreign body / vomit / blood / secretions · facial/mouth/neck trauma · **burns/soot/singed nasal hair** · swelling (lips/tongue/face = angioedema; neck = haematoma/infection) · GCS ≤8 (can't protect) · drooling / can't swallow / tripod.
- **LISTEN:** normal speech · **hoarse / "hot-potato" muffled voice** · **stridor (inspiratory)** · snoring · gurgling · crowing · silence+effort (complete obstruction) · silence+no-effort (apnoea) · weakening cough.
- **FEEL:** airflow at mouth/nose (present/reduced/absent) · tracheal position · surgical emphysema · chest-movement symmetry.

**Difficulty screen** (anticipate a difficult airway — verified §A.6): **LEMON** (Look, Evaluate 3-3-2, Mallampati 3–4, Obstruction/Obesity, Neck mobility) · **MOANS** (Mask seal, Obese/Obstruction, Aged >55, No teeth, Stiff/Snoring-OSA) · **RODS** (Restricted opening, Obstruction, Distorted anatomy, Stiff lungs ±C-spine) · **physiologically difficult** (hypoxaemia, hypotension, acidosis, haemodynamic compromise) · **history flags** (prior difficult intubation, neck RT/surgery, OSA, known pathology).

**Sign-off needed:** confirm the finding catalog as the recordable set. _(Honesty note carried to the UI: LEMON/MOANS/RODS — especially Mallampati alone — have limited sensitivity; present as anticipation prompts, not pass/fail gates.)_

### A.2 — Action catalog (catalog §2; tiers)

| Tier                                                 | Actions                                                                                                                                                                                                                                                                                                                                       |
| ---------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **1 — Basic**                                        | high-flow O₂ 💉 · head-tilt/chin-lift **or** jaw-thrust (C-spine) · suction · OPA (Guedel) · NPA · recovery position · **choking/FBAO algorithm** (verified §A.6) · remove visible foreign body                                                                                                                                               |
| **2 — Pharmacological / cause-specific**             | **anaphylaxis → IM adrenaline 💉** · inflammatory/infective oedema → steroids ± nebulised adrenaline 💉(cat) · **epiglottitis → do-not-distress + senior anaesthetic/ENT + theatre** · **burns/inhalation → early intubation (closing window)** · laryngospasm → O₂ + jaw-thrust/CPAP ± NMB                                                   |
| **3 — Advanced (skilled operator; DAS 2025 ladder)** | call skilled airway help · **Plan A** tracheal intubation (videolaryngoscopy default, first-pass, **3+1 attempt limit**) · **Plan B** supraglottic airway · **Plan C** facemask ventilation · **Plan D** CICO → eFONA without delay · peroxygenation + haemodynamic optimisation · **confirm with waveform capnography** · C-spine throughout |

💉 = carries a dose (§A.6). 💉(cat) = drug action, **category-level only** (no fixed mg).

### A.3 — Findings → action mapping (deterministic, transparent, combination-aware; catalog §3)

The engine maps findings → indicated actions, showing **why**. Single findings (e.g. gurgling → suction; snoring → manoeuvre) plus the **8 combination clusters**:

| Cluster (combination/trajectory)                       | Triggered response set                                                                                                  |
| ------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------- |
| Silent + paradoxical + no airflow                      | **complete obstruction** → open/suction/adjunct + **call skilled help NOW** + prepare advanced; FB → choking algorithm  |
| Stridor + drooling + muffled voice + tripod            | **supraglottic/epiglottitis** → **do not distress/instrument** + senior anaesthetic + ENT + theatre + O₂ + steroids±neb |
| Facial/neck burns + soot + singed hair + hoarse        | **inhalation injury, closing airway** → **early definitive airway**, escalate now                                       |
| Lip/tongue swelling + urticaria + wheeze + hypotension | **anaphylaxis** → **IM adrenaline first** + O₂ + fluids + prepare advanced + senior/ICU                                 |
| GCS ≤8 + snoring + no gag                              | **can't protect** → jaw-thrust + adjunct + suction + **definitive airway**; recheck glucose (D)                         |
| Expanding neck haematoma + voice change                | **threatened** → senior airway + surgical help; may need wound opening + urgent definitive airway                       |
| Voice→cough→drooling→stridor (over minutes)            | **progressing** → escalate a level; don't wait for desaturation (late sign)                                             |
| Any LEMON/MOANS/RODS positive + need for airway        | **anticipate difficulty** → most-skilled operator + adjuncts + eFONA kit + plan A→D + optimise physiology first         |
| **Apnoea + no pulse / no signs of life**               | **NOT airway alone → cardiac arrest → existing arrest seam** (`detectResusArrest`), not handled here                    |

**Sign-off needed:** confirm the mapping + the 8 clusters as the engine's deterministic rules.

### A.4 — Airway-state classification (drives prominence/urgency)

`secure → threatened → partially_obstructed → completely_obstructed → apnoeic_arrest`. Derived from the finding set; worse states surface their actions prominently and **block "proceed to B"** until addressed (treat-before-proceeding). `apnoeic_arrest` routes to the existing arrest seam.

### A.5 — Action-state vocabulary (kickoff §1c — confirm)

Each action carries one explicit state, every transition timestamped + audited:

| State                    | Meaning                                                                                   |
| ------------------------ | ----------------------------------------------------------------------------------------- |
| `indicated`              | triggered by findings, recommended, not yet acted on                                      |
| `in_progress`            | being performed now                                                                       |
| `performed`              | done (with time + who/role)                                                               |
| `not_indicated`          | not applicable to this patient (engine may auto-mark; clinician can adjust)               |
| `deferred`               | consciously postponed (with reason)                                                       |
| `failed` _(ineffective)_ | performed but didn't resolve → **triggers next-tier escalation** (the DAS A→B→C→D ladder) |

**`failed` is load-bearing:** an ineffective Tier-1/2 action surfaces the next-tier action as `indicated` (e.g. adjunct failed → call skilled help / advanced airway). **Sign-off needed:** confirm this vocabulary.

### A.6 — Dose & guideline currency (web-verified 2026-06-02; confidence-tagged) ⚠️ **clinical-safety core**

**FIXED — ship as cited constants (already in `doses.ts`, reused):**

| Constant                    | Value                                                               | Source                                                   | Confidence                                                                         |
| --------------------------- | ------------------------------------------------------------------- | -------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| `anaphylaxis_adrenaline_im` | **500 µg (0.5 mL 1:1000) IM** anterolateral thigh; **repeat 5 min** | RCUK Anaphylaxis (live) + ERC 2025 Special Circumstances | **verified-web**                                                                   |
| `oxygen_critically_ill`     | **15 L/min** non-rebreathe; target **94–98%** (88–92% type-2 risk)  | BTS 2017                                                 | **verified-web** _(new BTS target-SpO₂ guideline due 2026 — re-verify on release)_ |

**FIXED — non-drug cited rules (decision-support constants, not administered):**

- **DAS "3+1" attempt limit** — max 3 intubation attempts + a 4th by a more experienced operator (DAS 2025, verbatim).
- **Waveform capnography** = the confirmation modality; DAS 2025 requires **>1 variable** (capnography **+** visualising the tube in the trachea) — _do not imply capnography alone suffices_.
- **3-3-2 rule** (3 inter-incisor / 3 mentum–hyoid / 2 hyoid–thyroid finger-breadths) + **Mallampati 3–4** = difficulty threshold (StatPearls).
- **OPA sizing** (incisors → angle of jaw); **choking** = up to 5 back blows then up to 5 abdominal thrusts, alternating, → CPR if unresponsive (**RCUK 2025**; back-blows-**first** is the 2025 change).

**CATEGORY-LEVEL — NO fixed mg (clinician/cause-dependent; verified that no authoritative adult dose exists):**

- **Nebulised adrenaline** for upper-airway oedema/stridor — literature doses conflict; ship as a **new** category entry (e.g. `neb_adrenaline_airway_oedema`), distinct from the existing asthma/COPD `nebulised_bronchodilator`.
- **Corticosteroids** (dexamethasone etc.) for airway oedema — trial/ICU-protocol, timing/cause-dependent; category-level, **kept separate** from the anaphylaxis pathway (where 2025 says routine steroids are _no longer_ recommended).

**DECISION-SUPPORT-ONLY procedural numbers (NEVER app-administered):** cricoid force (10 N→30 N), "full-dose NMBA before eFONA", size-6.0 eFONA tube, scalpel–bougie–tube — escalation context only; the app records the act by a skilled operator, it does **not** surface these as administer-able values.

---

## B. Schema proposal (for review) — **recommended: on the existing timeline, no new migration**

The kickoff asks for "findings, actions, action-states, airway-state, **on the timeline**." The cleanest, most consistent design (and the one I recommend) reuses the existing immutable `resus_timeline_events` + **pure projections** — exactly the established `reconstructTimeline` / `buildResusVitals` / `resolveRoster` pattern. **No new tables, no migration.**

**Event payloads (within `resus_timeline_events`, step `'A'`):**

- **Finding-set** → `kind: 'assessment'`, payload `{ airwayState, look:{…}, listen:{…}, feel:{…}, difficulty:{lemon,moans,rods,physiologic,history}, label }`. Reassessment = a new event (versioned naturally; latest = current).
- **Action + each state change** → `kind ∈ {action, drug, procedure}`, payload `{ actionId, actionCode, tier, state, reason?, role?, doseId?, label }`. Append-only state history per `actionId`.
- **Escalation call** → `kind: 'decision'` (or a targeted `mobiliseResusTeam`), payload `{ actionCode:'call_skilled_airway', label }`.
- **Apnoea + no signs** → the existing `detectResusArrest` arrest seam.

**Pure engine (`lib/resus/airway.ts`, GATE C, TDD):**

- `classifyAirway(findingSet)` → airway-state.
- `triggeredActions(findingSet)` → indicated actions + rationale (single + the 8 clusters).
- `latestAirwayAssessment(events)` / `buildAirwayActions(events)` → current finding-set + folded action list/states.
- `escalationFor(action)` → next-tier action when `failed`.
- `airwayProceedGuard(state)` → blocks/flags advancing to B while an airway threat is open.

This keeps everything append-only/reconstructable, needs no schema change, and **generalizes to B–E** (the reusable engine the kickoff wants — a `Step` shape of finding-catalog + action-catalog + mapping + state-classifier).

**Alternative (also offered):** dedicated `resus_airway_assessments` + `resus_actions` (+ append-only `resus_action_events`) tables, if you want indexed queries/foreign keys over the action list. Adds a migration + mutable state. **Recommendation: the timeline-derived approach** — lower risk, consistent, immutable by construction. **Sign-off needed:** pick the approach.

---

## C. Scope / deferrals (confirm)

- **Now:** record findings + airway-state, the findings→action engine, action-state lifecycle incl. `failed`→escalation, one-tap skilled-help escalation, return-to-airway, treat-before-proceeding gate to B, apnoea→arrest stub.
- **Deferred (record-capable + escalation now, full tooling later — flagged):** full RSI drug-and-checklist tooling, videolaryngoscopy/eFONA _procedural_ guidance, ventilator setup. The step lets a clinician **record** these were done (device/attempts/capnography-confirmation/complications) and **prompts escalation** — but no procedural how-to.
- **Paediatric airway branch** (sizes, weight-based, croup/epiglottitis nuances): engine routes by age (per the vitals catalog); paediatric airway detail deferred. **Sign-off needed:** confirm this scope split.

---

## D. Wording / honesty flags the CSO must resolve before the surface ships

1. **Capnography wording:** use "most reliable / most sensitive & specific to exclude oesophageal intubation," **not** the literal "gold standard"; and do not imply capnography alone confirms placement (DAS 2025 wants ≥2 variables).
2. **NPA + base-of-skull fracture:** state **"caution"** (modern JRCALC position; downgraded from absolute contraindication on the basis of rare case reports), not "contraindicated."
3. **"RV failure":** the catalog §1.5 lists it under physiologically-difficult-airway, but that exact phrase was **not** found in the DAS 2025 text — keep the component generic ("haemodynamic compromise / cardiovascular collapse") unless you cite a page.
4. **MOANS/RODS final "S":** two valid expansions exist (Stiff lungs vs Snoring/OSA; Stiff ±C-spine) — list both or pick the Walls-canonical and footnote.

---

## E. Open questions for the CSO

1. **Catalog reconciliation:** confirm the committed [`docs/clinical/resus-airway-clinical-catalog.md`](clinical/resus-airway-clinical-catalog.md) matches your authoritative text (I normalised the paste's encoding; content unchanged).
2. **Schema:** timeline-derived + pure projections (recommended), or dedicated tables?
3. **Action-state vocabulary** (§A.5) — confirm the 6 states.
4. **The 8 combination clusters** (§A.3) — confirm as the deterministic rules.
5. **Category-level doses** — confirm neb adrenaline + airway-oedema steroids stay category-level (no fixed mg), and the new `neb_adrenaline_airway_oedema` key separate from `nebulised_bronchodilator`.
6. The four **wording flags** in §D.
7. **Scope split** (§C) — record+decision-support+escalation now; RSI/eFONA procedural + paediatric deferred.
8. **Anaphylaxis citation** — cite the live RCUK page / ERC 2025 (not only the 2021 PDF) for 2025 currency.

---

## F. Unverified flags (every value needing CSO verification at build)

1. **Nebulised adrenaline (airway oedema)** adult dose — no authoritative fixed value; category-level only.
2. **Airway-oedema corticosteroid** adult dose — no authoritative fixed value; category-level only.
3. **BTS O₂ targets** — current per BTS 2017, but the full PDF wasn't machine-readable (confirmed via BTS site + summary); **new BTS target-SpO₂ guideline due 2026 — re-verify on release.**
4. **Anaphylaxis 500 µg currency** — current + ERC-2025-confirmed; cite the live page, not only the 2021 PDF.
5. **Capnography phrasing** (§D.1) and **NPA caution** (§D.2) — CSO to finalise.
6. **"RV failure"** attribution (§D.3) — not in DAS 2025 text.
7. **ERC 2025 First Aid + DAS BJA full text** returned paywall/403 on some fetches — load-bearing facts confirmed via the BJA-published PDF (verbatim), RCUK 2025 (fetched directly), and AHA 2025 cross-corroboration; pull the journal texts via institutional access if verbatim wording is wanted on the surface.
8. **Procedural eFONA/RSI numbers** — escalation context only; must not be encoded as administer-able constants.

---

## G. Build order after sign-off (each gate stops)

- **GATE B** — finding capture + airway-state classification (tap-first look/listen/feel + difficulty screen; secure→arrest classification; timestamped to the timeline; reassessment = versioned finding-sets). **Stop.**
- **GATE C** — findings→action engine + action-state lifecycle (deterministic transparent mapping incl. the 8 clusters; `indicated/in_progress/performed/not_indicated/deferred/failed`; `failed`→next-tier escalation; doses as verified constants). **Stop.**
- **GATE D** — UX + discipline + escalation + arrest route (step-wise co-visible findings↔actions; glanceable states; open-airway-threat indicator + treat-before-proceeding gate to B; reassess-after-action prompts; one-tap escalation + return-to-airway; apnoea→arrest stub). **Stop.**
- **GATE E** — closeout + sign-off (decision-support-not-autonomous verified; doses verified; mapping deterministic; the cluster scenarios pass; action-state incl. failed→escalation; record immutable/versioned; treat-before-proceeding + reassess enforced; arrest routed; PHI + audit; responsive/a11y/reduced-motion; existing tests green; no shipped migration altered; ADR; CHANGELOG). **Stop for CSO sign-off.**

---

## H. Sources (cited; verified at build per §A.6)

DAS 2025 — Ahmad I, El-Boghdadly K, Iliff H, et al. Br J Anaesth 136(1):283–307 (2026), doi:10.1016/j.bja.2025.10.006 (Plan A→D, 3+1, first-pass, CICO→eFONA, waveform capnography, physiologically difficult airway); Resuscitation Council UK — ABCDE/Airway + 2025 First Aid/BLS (choking, jaw-thrust priority); ERC & AHA Guidelines 2025; BTS Guideline for Oxygen Use in Adults 2017; RCUK Anaphylaxis guidance + ERC 2025 Special Circumstances; LEMON/MOANS/RODS + 3-3-2 + Mallampati (Walls & Murphy; StatPearls NBK493235/NBK585119). **The 2025 cycle supersedes 2020/2021/2015.**

---

**⛔ GATE A stop. Awaiting CSO (Fadhul) sign-off on §A (finding catalog · action catalog · doses · findings→action mapping · action-state vocabulary), §B (schema choice), §C (scope), and the §D wording flags + §E open questions. No airway code until then.**
