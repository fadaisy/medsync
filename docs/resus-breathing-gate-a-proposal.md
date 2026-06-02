# Resus · BREATHING step — GATE A proposal (clinical sign-off)

**Status:** ⛔ **DRAFT — awaiting CSO (Fadhul) sign-off. No breathing code is built, and no dose/threshold lands in code, until §A is signed.**
**Branch:** `feat/resus-breathing`
**Scope:** the **Breathing (B)** step of the ABCDE resus surface — breathing's **findings → triggered-actions → action-states**, built by **reusing the Airway pattern + visual system** (engine, action-state lifecycle, severity/state colour, urgency-ordered display) with breathing's clinical content. Record + decision-support + escalation now; full ventilator/NIV/RSI/chest-drain _procedural_ tooling + paediatric/obstetric depth deferred (§C).
**Clinical source:** [`docs/clinical/resus-breathing-clinical-catalog.md`](clinical/resus-breathing-clinical-catalog.md) (CSO catalog, now committed) + the web-verification in §A.6.
**This gate is a clinical sign-off, not just technical.** The finding catalog, action catalog, doses, the pre-arrest traps, and the findings→action mapping are a clinical-safety artifact.

> **Honesty posture — "never ship a remembered dose."** Every dose/threshold in §A.6 was web-verified against a primary/authoritative source on **2026-06-02** and is confidence-tagged. **Result: every load-bearing dose is `verified-web` — zero `needs-CSO-verification` dose items.** The catalog is committed to `docs/clinical/`. A few **citation-hygiene corrections** the verification surfaced are in §D for your ratification.

---

## Preface — reuses the Airway pattern; builds on the resus surface

The resus surface (ADRs 0044–0047) and the **Airway step + its visual rework** (ADRs 0048–0049) are live on `main`. B **reuses all of it, not rebuilt**:

| Reused (Airway)                                                                                                  | Breathing uses it for                                |
| ---------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------- |
| findings→action→state **engine** + pure projections on the immutable timeline                                    | breathing findings/actions/states (no new migration) |
| **action-state lifecycle** `indicated/in_progress/performed/not_indicated/deferred/failed` + `failed`→escalation | unchanged                                            |
| **state colour system** (DESIGN-medsync) + **action-state colour tokens** + the step-bar                         | breathing-state chip + action board, same look       |
| `doses.ts` shape (`tier`/`confidence`) + the cited-constant discipline                                           | the new asthma doses                                 |
| treat-before-proceeding + reassess + arrest seam                                                                 | B gates C; apnoea+no-signs → arrest                  |

The implementation mirrors `lib/resus/airway.ts` + `airway-catalog.ts` as `lib/resus/breathing.ts` + `breathing-catalog.ts` (same `classify` / `triggeredActions` / `buildActions` / `escalationFor` / `proceedGuard` shape), and an `app/.../breathing-panel.tsx` mirroring the airway panel. **No new migration** — breathing findings/actions are timeline events (step `B`).

---

## A. Clinical model — needs your sign-off

### A.1 — Finding catalog (catalog §1)

**Breathing-state** (headline): `adequate` · `distress_compensating` · `failure_decompensating` · `peri_arrest` · `apnoeic`.

- **LOOK:** RR (12–20 normal; ≥25 distress band; ≤8/falling peri-arrest), work of breathing (accessory muscles, recession, tracheal tug, can't-complete-sentences, tripod), chest expansion (symmetry/depth/flail), central cyanosis (late), agitation→drowsiness, chest-wall (open wound, bruising, surgical emphysema, raised JVP), SpO₂ + O₂ delivery.
- **LISTEN:** full sentences · can't-complete-sentences · wheeze · **silent chest** · crackles · reduced/absent unilateral sounds · bronchial breathing · stridor (A) · gurgling (A).
- **FEEL/PERCUSS:** tracheal position (deviated-away = tension, late) · expansion symmetry · **hyper-resonant (air/pneumothorax)** / **stony-dull (fluid/haemothorax)** / dull (consolidation) · surgical emphysema · chest-wall crepitus.
- **MEASURE:** SpO₂ (94–98%; 88–92% hypercapnic; <92% life-threatening band in asthma) · capnography/EtCO₂ · ABG/VBG (PaO₂<8 kPa severe; **rising/normalising PaCO₂ = pre-arrest trap**; pH; lactate) · PEF (33–50% acute severe; **<33% life-threatening**) · POCUS/CXR (never delay decompression for imaging).

### A.2 — Action catalog (catalog §2; tiers)

- **Tier 1:** high-flow O₂ 15 L/min reservoir (target 94–98% / 88–92%) · sit upright · **BVM assisted ventilation** (poor effort/peri-arrest/apnoea) · continuous monitoring.
- **Tier 2 (cause-specific):** **tension pneumothorax → needle/finger decompression then chest drain** (clinical dx; before PPV) · open chest wound → vented seal + drain · massive haemothorax → drain + major-haemorrhage (C) · **acute severe/life-threatening asthma → neb salbutamol + neb ipratropium + steroid ± IV magnesium 💉** · COPD → controlled O₂ + nebs + steroid ± **NIV (BiPAP)** · pulmonary oedema → sit up + O₂ ± GTN/furosemide/CPAP · pneumonia/sepsis → sepsis bundle · PE → support ± thrombolysis (senior) · **anaphylaxis → IM adrenaline FIRST 💉**.
- **Tier 3 (skilled operator):** RSI/intubation + invasive ventilation · NIV (CPAP type-1 / BiPAP type-2) · waveform-capnography confirmation.

💉 = carries a dose (§A.6).

### A.3 — Findings→action mapping incl. clusters + trajectory (catalog §3)

Tension-pneumothorax · massive-haemothorax · acute-severe-asthma · **the peri-arrest/tiring cluster** · pulmonary-oedema · anaphylaxis · pneumonia/sepsis · PE · normal-sats-but-high-RR (compensating-will-fail) · apnoea→arrest. Each surfaces its action set with rationale, urgency-ordered (decompression/adrenaline/ventilation top; `failed`→top; surfacing-not-filtering).

### A.4 — Breathing-state classification (drives prominence + gate to C)

`adequate → distress_compensating → failure_decompensating → peri_arrest → apnoeic`. Worst-finding-wins (an optimistic state never masks a danger finding). `peri_arrest`/silent-chest/tension = critical (red); `apnoeic` + no-signs-of-life → the existing arrest seam (not B).

### A.5 — Action-state vocabulary

**Reused unchanged** from Airway: `indicated / in_progress / performed / not_indicated / deferred / failed`; `failed` drives next-tier escalation.

### A.6 — Dose-currency table (web-verified 2026-06-02; confidence-tagged) ⚠️ clinical-safety core

**FIXED — new cited constants (ship in `doses.ts`):**

| Constant                 | Value                                                                                         | Source                                                                | Confidence       |
| ------------------------ | --------------------------------------------------------------------------------------------- | --------------------------------------------------------------------- | ---------------- |
| `asthma_salbutamol_neb`  | **5 mg** nebulised, O₂-driven; repeat/back-to-back/continuous (5–10 mg/h) in life-threatening | BTS/SIGN 158 (2019) acute pathway + GINA 2025                         | **verified-web** |
| `asthma_ipratropium_neb` | **500 µg (0.5 mg)** nebulised, O₂-driven; acute-severe/life-threatening; 4–6 hrly             | BTS/SIGN 158 (2019); GINA 2025                                        | **verified-web** |
| `asthma_steroid`         | **prednisolone 40–50 mg PO** OR **hydrocortisone 100 mg IV**                                  | BTS/SIGN 158 (2019); GINA 2025                                        | **verified-web** |
| `asthma_magnesium_iv`    | **1.2–2 g IV over 20 min**, single dose (life-threatening/poor response) + senior/ICU         | BTS/SIGN 158 (2019); GINA 2025 (2 g/20 min; neb Mg _not_ recommended) | **verified-web** |

**FIXED — reused (already in `doses.ts`):** `anaphylaxis_adrenaline_im` (500 µg IM, repeat 5 min; **adrenaline FIRST before salbutamol** when anaphylaxis+asthma) · `oxygen_critically_ill` (15 L/min, 94–98% / 88–92%) · sepsis `sepsis_crystalloid` (≥30 mL/kg) + `sepsis_map_target` (MAP ≥65).
**FIXED — new threshold (non-drug):** COPD-NIV trigger **pH < 7.35 AND PaCO₂ > 6.5 kPa** despite optimal therapy (pH < 7.25 = severe band) — BTS/ICS 2016.
**CATEGORY-LEVEL (no fixed surface dose):** PE thrombolysis (senior decision) · pulmonary-oedema GTN (titrated) + furosemide (20–40 mg IV) — NICE CG187 fixes no dose · sepsis antibiotic/vasopressor choice · CPAP/NIV in pulmonary oedema (conditional, see §D).

### A.7 — Pre-arrest traps (must flag LIFE-THREATENING, never reassuring — all verified)

1. **Normalising/rising PaCO₂ in acute asthma** = life-threatening (raised = near-fatal) — a severe asthmatic should be hypocapnic.
2. **Silent chest** = life-threatening (worse than wheeze).
3. **Falling RR / poor effort / exhaustion / drowsiness** in a previously tachypnoeic patient = tiring → peri-arrest.
4. **Normal SpO₂ + high RR/work** = compensating, will fail — don't be reassured by the saturation.
5. **Cyanosis is late.**
   The engine must classify these as **critical (peri-arrest)** and surface them at the top — never downgrade severity because a saturation looks normal or a chest went quiet.

### A.8 — Tension-pneumothorax decompression (decision-support only)

Clinical diagnosis → **decompress immediately, do NOT wait for imaging**; **decompress before PPV/intubation**; needle thoracostomy has a high failure rate (chest-wall thickness) → finger/simple thoracostomy increasingly preferred (in-hospital), chest drain definitive. The app **records** the skilled-operator procedure (side/approach/confirmation/complications) + prompts escalation — it never instructs site/needle-length. (Site/length figures are equipment constants, not drug doses; see §D for the citation reconciliation.)

---

## B. Schema / reuse (for review) — **on the existing timeline, no new migration**

Mirror the airway model: findings = `assessment` events (step `B`) with a structured payload; actions + state changes = `action`/`drug`/`procedure` events; pure projections (`classifyBreathing` / `triggeredActions` / `buildBreathingActions` / `escalationFor` / `breathingProceedGuard`) in `lib/resus/breathing.ts`; content in `lib/resus/reference/breathing-catalog.ts`; UI in `breathing-panel.tsx` reusing the airway/state colour components. **B-specific finding fields** (vs airway): RR, SpO₂, percussion note, tracheal position, breath sounds, capnography/EtCO₂, ABG (PaO₂/PaCO₂/pH/lactate), PEF — all carried in the finding-set payload (no schema/migration change). New asthma doses appended to `doses.ts`. **Sign-off needed:** confirm the reuse + the B-specific fields.

## C. Scope / deferrals (confirm)

- **Now:** record findings + breathing-state, the findings→action engine + clusters + pre-arrest traps, action-state lifecycle, treat-before-proceeding gate to C, reassess prompts, one-tap escalation + return-to-A/B, apnoea→arrest stub.
- **Deferred (record-capable + escalation only, flagged):** full ventilator setup / NIV titration / RSI drug-checklist / chest-drain procedural tooling.
- **Paediatric** (age-banded RR/SpO₂; bronchiolitis/croup; weight-based doses; grunting/head-bobbing/recession red flags) + **obstetric** (physiological breathlessness vs pathology; higher PE risk) — engine routes by age; depth deferred.

## D. Citation / wording corrections the verification surfaced (ratify at sign-off)

1. **Acute-asthma citation:** acute doses come from **BTS/SIGN 158 (2019) acute pathway + GINA 2025**, _not_ NICE NG245 (2024) — NG245 explicitly excludes acute attacks (covers diagnosis/monitoring/chronic). Re-label the catalog's acute-asthma citation accordingly. (No dose change 2019→2025.)
2. **Pulmonary-oedema citation:** should be **NICE CG187 "Acute heart failure" (2014)**, not NG106 (chronic). And **CPAP/NIV is conditional** per CG187 (not routine; consider if severe dyspnoea + acidaemia) — surface as clinician judgement.
3. **Tension-pneumothorax needle length:** the catalog's "≥5 cm / 8 cm" is the **ATLS** figure; the 2025 meta-analysis it's attributed to recommends **7 cm** and side-specific siting — reconcile the number with its citation (or label as ATLS). Not a clinical blocker (the app only records the procedure).
4. **PEF life-threatening = `<33%`** is canonical (keep; a stray "<30%" appears on one NHS-Scotland page — ignore).
5. **BTS oxygen targets:** a new BTS emergency-oxygen target-saturation guideline is due later **2026**; 94–98% / 88–92% remain current — re-verify on publication.
6. **Anaphylaxis source label:** "RCUK (May 2021, current) + ERC 2025" (RCUK standalone not reissued in 2025; dose unchanged).

## E. Open questions for the CSO

1. Confirm the committed catalog matches your authoritative text (encoding normalised; content verbatim).
2. Confirm **reuse** of the airway engine/state/colour/ordering + the **B-specific finding fields** (§B).
3. Confirm the **four new asthma dose constants** (§A.6) ship as cited fixed constants; PE-thrombolysis / pulmonary-oedema GTN+furosemide / CPAP-NIV stay category-level.
4. Ratify the **citation corrections** (§D 1–3 especially).
5. Confirm the **scope split** (§C) — record+decision-support+escalation now; ventilator/NIV/RSI/chest-drain procedural + paeds/obstetric deferred.
6. Confirm the **pre-arrest traps** (§A.7) are encoded as critical/life-threatening, never reassuring.

## F. Unverified flags

- **No dose** is `needs-CSO-verification` — all web-verified.
- **SpO₂ targets** — re-verify when the new BTS guideline publishes (later 2026).
- **Pulmonary-oedema GTN/furosemide numbers** are practitioner-reference ranges (RCEMLearning), **not** guideline-fixed — encode category-level only.
- **Tension-pneumothorax needle site/length** — equipment constant with an ATLS-vs-2025-meta number mismatch (§D.3); reconcile citation; not a clinical blocker (record-only).

## G. Build order after sign-off (each gate stops)

- **GATE B** — breathing finding capture + breathing-state classification (look/listen/feel/percuss/measure; severity colour; timestamped/versioned). **Stop.**
- **GATE C** — findings→action engine + states + urgency ordering (clusters + pre-arrest traps; verified dose constants; reused lifecycle + colour). **Stop.**
- **GATE D** — UX + discipline (breathing-state chip; open-life-threat indicator + gate to C; reassess; escalation + return-to-A/B; apnoea→arrest). **Stop.**
- **GATE E** — closeout (pre-arrest-trap + cluster scenarios pass; doses verified; reuse-consistency with airway; a11y/reduced-motion; tests green; no shipped migration altered; ADR; CHANGELOG). **Stop for sign-off.**

## H. Sources (verified §A.6)

ERC & AHA Guidelines 2025 (ILCOR 2025 CoSTR); Resuscitation Council UK — ABCDE/Breathing + Anaphylaxis (May 2021, current); **BTS/SIGN 158 (2019) acute asthma pathway** + **GINA 2025**; NICE NG245 (2024, chronic only); BTS/ICS 2016 (acute hypercapnic RF / NIV); NICE CG187 (2014, acute heart failure); BTS oxygen 2017 (new targets due 2026); ATLS 10th ed / ETC + World J Emerg Surg 2025 meta-analysis + NAEMSP 2024 (tension pneumothorax); Surviving Sepsis 2021. **2025 supersedes 2020/2021.**

---

**⛔ GATE A stop. Awaiting CSO (Fadhul) sign-off on §A (finding catalog · action catalog · doses · pre-arrest traps · mapping), §B (reuse + B-specific fields), §C (scope), and the §D citation corrections + §E open questions. No breathing code until then.**
