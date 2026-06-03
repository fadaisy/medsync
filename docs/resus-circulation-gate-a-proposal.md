# Resus · CIRCULATION step — GATE A proposal (clinical sign-off)

**Status:** Built A→E on `feat/resus-circulation` under the CSO instruction "go through all gates"; the clinical content is the **CSO-supplied catalog**, web cross-verified, presented here for sign-off.
**Scope:** the **Circulation (C)** step — circulation's **findings → shock-type → triggered-actions → action-states**, built by **reusing the Airway/Breathing engine + visual system** with circulation medicine; drugs route through the **smart prescribing tool**. Record + decision-support + escalation now; full MHP/vasopressor-infusion/central-line/pericardiocentesis/arrhythmia _procedural_ tooling + paediatric/obstetric depth deferred (§C).
**Clinical source:** [`docs/clinical/resus-circulation-clinical-catalog.md`](clinical/resus-circulation-clinical-catalog.md) (committed verbatim).

> **Honesty posture.** The load-bearing anchors + the prescribing-tool dose routing were **web cross-verified on 2026-06-03** (5-agent pass). The clinical reasoning is the CSO's signed catalog; doses are NOT duplicated here — they route through the verified prescribing tool. A few **currency refinements** the verification surfaced are in §A for ratification.

---

## Preface — reuses the Airway/Breathing pattern (no rebuild)

C **reuses** the findings→action→state engine, the action-state lifecycle (`indicated/in_progress/performed/not_indicated/deferred/failed`, `failed`→escalation), the severity colour + action-state tokens + the step bar, and the urgency-ordered display — populated with circulation content. Mirrors `lib/resus/breathing.ts` + `breathing-catalog.ts` as `lib/resus/circulation.ts` + `circulation-catalog.ts`, and `circulation-panel.tsx` mirroring the breathing panel. **No new migration** — findings/actions are step-`C` timeline events.

## A. Clinical model + verification

### A.1 — Two classification axes (the C-specific reasoning)

- **Circulatory state** (severity, worst-finding-wins): `well_perfused → compensated_shock → decompensated_shock → peri_arrest → arrest`. **A normal BP NEVER downgrades** a shock state (the compensated/occult-shock trap; shock index > 0.9).
- **Shock TYPE** (`identifyShockType`, the core reasoning — because the type determines whether fluids help or harm): hypovolaemic-haemorrhagic / non-haemorrhagic · distributive-septic / anaphylactic / neurogenic · cardiogenic · obstructive-tamponade / PE / tension · undifferentiated. Ordered most-time-critical first (anaphylaxis → obstructive → haemorrhagic → cardiogenic → neurogenic → septic → hypovolaemic → undifferentiated).

### A.2 — Findings (catalog §1): circulatory-state + LOOK/FEEL/MEASURE (incl. HR, BP, **MAP, shock index, pulse pressure**, cap refill, peripheral temp, JVP, ECG, **lactate**, urine, **β-hCG**, ultrasound). Context flags: trauma, activeBleeding, **febrileChild (FEAST)**, pregnancyPossible, spinalInjury, allergenTrigger, **headInjury (TBI exception)**, noPulse.

### A.3 — Actions (catalog §2): Tier 1 baseline (IV×2/IO, bloods, monitoring, ECG, catheter, O₂, position, haemorrhage-control) + Tier 2 type-specific + Tier 3 advanced (central/arterial access, pericardiocentesis, thrombolysis, definitive haemorrhage control). **Drug actions route through the prescribing tool** (`c_*` codes in `RECOMMENDATION_DRUG_MAP` → TXA, noradrenaline, crystalloid, adrenaline, atropine, hydrocortisone, vasopressin, dobutamine, sepsis antibiotics, blood/MHP). Doses verified there.

### A.4 — The traps (enforced in `triggeredActions` + the colour/guard):

1. **Normal BP doesn't exclude shock** — compensated findings classify as shock regardless of BP; SI > 0.9 = occult.
2. **Match fluids to TYPE** — `c_crystalloid_bolus` is **NOT surfaced** for cardiogenic / obstructive / haemorrhagic.
3. **Haemorrhagic** → stop bleeding + blood/MHP + TXA + permissive hypotension (SBP 80–90; **TBI exception → MAP ≥ 80**); minimise crystalloid.
4. **FEAST (Uganda-critical)** — `febrileChild` → the crystalloid action carries a **FEAST caution** (no adult 30 mL/kg flooding; blood if severe anaemia).
5. **β-hCG / ectopic** — `pregnancyPossible` + shock surfaces ectopic/obstetric-haemorrhage escalation.
6. **Obstructive** → relieve the obstruction (pericardiocentesis/decompression/thrombolysis); fluids won't fix.

### A.5 — Verification refinements (5-agent web pass, 2026-06-03 — **ratify**)

- **Septic (confirmed-current):** noradrenaline first-line + MAP ≥ 65 are **STRONG** (SSC **2026**, published 2026-03-23 — cite 2026, not 2021). MAP **60–65 nuance = patients ≥ 65y** (not "chronic-HTN"). Peripheral pressors / vasopressin add-on / hydrocortisone / 30 mL/kg are **conditional**. Lactate: don't reflexively bolus to normalise.
- **Haemorrhagic (confirmed-with-nuance):** **ATLS 11th ed (2025)** supersedes 10th (xABCDE — exsanguinating-haemorrhage control before airway). **Whole blood (LTOWB) is now first-line** (NAEMSP 2025) — components ~1:1:1 the alternative. PATCH-Trauma 2023: TXA = mortality/haemostasis benefit (not functional); **< 3 h is a hard boundary**. Lethal diamond includes **hypocalcaemia** — monitor ionised calcium. **TBI exception target = MAP ≥ 80.** (All folded into the action rationales + the catalog/META.)
- **FEAST + shock-type/obstructive/cardiogenic:** confirmed current.
- **Prescribing coverage:** TXA / vasopressor-infusion / crystalloid / adrenaline already present; **added** vasopressin, dobutamine, sepsis-antibiotics, blood-products/MHP (category/record-only) so C's drugs route through the tool.

## B. Schema (no new migration)

Reuse the findings/actions/states timeline model (step `C`); finding-set fields: `state` (circulatory), `present[]`, `context{}`; recorded payload also stores `circulatoryState` + **`shockType`**. Drug administrations record via the prescribing tool (`recordEmergencyAdministration`); action/procedure states via `setCirculationActionState`. Cumulative/fluids/blood recorded on the immutable timeline.

## C. Scope / deferrals

- **Now:** findings + state + shock-type, the type-driven action engine + traps, action-state lifecycle, treat-before-proceeding gate to D, reassess-after-bolus, one-tap escalation + return-to-A/B/C, no-pulse→arrest stub, drugs via the prescribing tool.
- **Deferred (record + escalation only, flagged):** full MHP workflow, vasopressor-infusion titration, central-line/pericardiocentesis/REBOA procedural tooling, detailed arrhythmia algorithms; paediatric (weight-based + FEAST) + obstetric (MSI/concealed) depth.

## D. Build order

GATE A (model + catalog + verification) ✅ · GATE B (findings + state + shock-type, TDD 22) ✅ · GATE C (type-driven action engine + traps + prescribing link, TDD 44) ✅ · GATE D (panel + shock-type indicator + desk wiring) ✅ · GATE E (adversarial review + ADR + CHANGELOG + tests/build green). **Stop for CSO sign-off.**
