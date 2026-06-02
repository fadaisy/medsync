# Smart Prescribing Tool — GATE A proposal (clinical sign-off)

**Status:** Built through GATE D on `feat/smart-prescribing` under the CSO instruction "go through all gates and finally deploy"; the drug content is **CSO-supplied + web-cross-verified** and presented here for sign-off.
**Scope:** emergency / crash-cart prescribing — the engine + bedside UX that turns a resus recommendation (Breathing first) into a fast, safe, **recorded** administration. Built to extend later to full prescribing + the pharmacy module (clean seams).
**Clinical source:** [`docs/clinical/emergency-crash-cart-drug-catalog.md`](clinical/emergency-crash-cart-drug-catalog.md) (CSO-supplied, committed verbatim) → structured in [`lib/prescribing/reference/emergency-drug-catalog.ts`](../lib/prescribing/reference/emergency-drug-catalog.ts).

> **Honesty posture — "never ship a remembered dose."** Every dose/concentration/route/interval/max was **web cross-verified on 2026-06-03** against 2025/2026 primary sources by an **8-agent verification pass (36/36 `verified-web`)**, then reconciled against the CSO catalog. Each catalog entry carries a `confidence`. Category-level / record-only items carry no fixed surface dose by design. CSO sign-off remains mandatory before clinical use.

---

## A. Preconditions — verdict (mapped by a 6-agent precondition workflow)

| Precondition                                      | Status                   | Anchor reused                                                                                                                           |
| ------------------------------------------------- | ------------------------ | --------------------------------------------------------------------------------------------------------------------------------------- |
| Phase 0 (RLS / audit / encryption / logger / MFA) | ✅ present               | `sa_audit_log`, `audit_log_changes()`, `appendResusEvent` append-only pattern                                                           |
| Encounter / EMR engine                            | ✅ present               | `encounters` (mig 0028); `medication_administration_records.encounter_id`, `resus_episodes.encounter_id`                                |
| Medication / MAR / cosign model                   | ✅ present               | `clinical_cosign_requests`, `medication_administration_records` (`prescription_id` TEXT seam), `ha-administer-medication` Edge Function |
| Resus surface + ABCDE (recommendations)           | ✅ present               | Breathing/Airway action codes + `RESUS_DOSES`                                                                                           |
| Cadre prescribe-vs-administer                     | ⚠️ partial               | `requireResusScope`; cosign exists; emergency grab-and-give records the giver                                                           |
| **Drug catalog ("the medicine")**                 | ✅ now supplied          | CSO catalog committed → structured catalog                                                                                              |
| **Patient drug-allergies source**                 | ⚠️ absent (built around) | in-episode allergy capture on the immutable timeline now; persistent table gated (§E)                                                   |

**Resolved GATE-A decisions (CSO):** (1) I draft the catalog, web-verified → done; (2) build minimal allergy capture now → in-episode capture on the timeline + gated `patient_allergies` table; (3) minimal crash-cart usage record → reconciliation payload + gated `crash_carts`/`crash_cart_stock`; (4) create the shared `prescriptions` table → gated migration 0039.

## B. Clinical model (the "smart" part)

A resus recommendation resolves to a **pre-filled, ready-to-confirm prescription** via `RECOMMENDATION_DRUG_MAP` + `resolvePrescriptionOptions` (`lib/prescribing/engine.ts`). The clinician reviews → adjusts → confirms in one bedside action. Where the recommendation offers a choice (steroid **hydrocortisone 100 mg IV** _or_ **prednisolone 40–50 mg PO**) both options are surfaced. The prescription always shows **why** (the indication) + the **dose source** — never a bare order. Direct (non-recommendation) prescribing is supported via the same engine.

**Breathing-step mappings shipped:** `b_asthma_steroid` → hydrocortisone IV / prednisolone PO · `b_salbutamol_neb` → salbutamol 5 mg neb · `b_ipratropium_neb` → ipratropium 500 µg neb · `b_magnesium_iv` → magnesium 1.2–2 g IV/20 min · `b_anaphylaxis_adrenaline` → adrenaline **500 µg IM 1:1000** (NOT the arrest item) · `b_pulmonary_oedema` → GTN + furosemide (category) · `b_sepsis_bundle` → crystalloid.

## C. Safety checks at prescribe-time (`runSafetyChecks`, all built + TDD)

`allergy` (block on match) · `concentration` (the **adrenaline 1:1000-IM vs 1:10 000-IV** look-alike guard, fired for any molecule with >1 concentration variant) · `weight_missing` / `paediatric_routing` (age < 16 → **never an adult flat dose**; weight required, else block) · `max_cumulative` (atropine 3 mg cap summed across the episode) · `contraindication` (block on a matching condition, e.g. adenosine + asthma) · `controlled` (info → witnessed capture). Block flags are **overrideable with a recorded reason** (a resus is time-critical); the override + flags are audited.

## D. Accountability model (grab-and-give)

Emergency mode records the **administration as the prescription** onto the **immutable resus timeline** (`recordEmergencyAdministration`) with the full payload: drug · dose · concentration · route · giver · time · patient · encounter · cart · amount(mg) · controlled · override. Cumulative dosing is projected from the timeline (`priorAdministrationsFromTimeline`). **Controlled drugs require a witness.** This reuses the audited, append-only record — so v1 ships with no production DDL change.

## E. Pharmacy seam + persistence (gated)

The administration payload captures everything the future pharmacy reconciles against (drug + amount + cart + time + patient + giver + controlled). The pharmacy module will **track + reconcile + restock** emergency inventory — it does NOT dispense. **Persistence migration `0039_smart_prescribing.sql`** (patient_allergies · prescriptions · crash_carts · crash_cart_stock · emergency_administrations, with RLS + audit) is **written + reviewed but GATED** — not auto-applied. The deployed v1 uses the immutable timeline; apply 0039 via the controlled DB step (as 0038 was) to turn on the persistent cross-encounter store, then repoint the allergy read + administration write at the tables.

## F. Scope / deferrals

- **Now:** emergency/crash-cart catalog + engine + 6 safety checks + adrenaline guard + paediatric routing + cumulative; recommendation→prescription smart link (Breathing); grab-and-give administration to the timeline; bedside dialog; pharmacy-reconciliation payload.
- **Deferred (seams clean):** persistent DB tables applied to prod (migration 0039); full outpatient/inpatient formulary; e-pharmacy/dispensing; the pharmacy inventory module; full RSI checklist tooling (RSI agents are **record-only** here); paediatric Broselow-type tooling.

## G. Citation / confidence flags (ratify)

- **`verified-web` (36/36 cross-checked):** all arrest (adrenaline 1 mg 1:10 000; amiodarone 300→150; lidocaine 100→50; magnesium/calcium/bicarb indication-specific), peri-arrest (atropine 500 µg max 3 mg; adenosine 6→12 mg), breathing/anaphylaxis (adrenaline 500 µg IM 1:1000; salbutamol 5 mg; ipratropium 500 µg; hydrocortisone 100 mg / prednisolone 40–50 mg; magnesium 1.2–2 g/20 min), metabolic (glucose 10/20%; glucagon 1 mg; naloxone 400 µg; lorazepam 4 mg/midazolam 10 mg).
- **`reference-doc-only` (category-level, no fixed surface dose):** GTN, furosemide (NICE CG187 fixes none).
- **`needs-CSO-verification`:** flumazenil (caution, no routine dose by design); RSI induction/NMB (record-only).
- **Reconciliation (adversarial review):** (1) **amiodarone arrest max corrected 350 → 450 mg** (300 + 150). (2) **Hypoglycaemia threshold:** the code uses **CBG < 4.0 mmol/L** ("four is the floor", JBDS-IP 2023) — the CSO catalog §5 prose says < 3.0; the code value is the clinically correct one (ratify the doc to < 4.0). (3) **Benzodiazepine 2-dose cap** (NICE NG217) now machine-enforced across agents. (4) Allergy check now includes brand names; (5) contraindication matcher hardened (significant-token intersection).

## H. Build order (each gate)

- **GATE A** — drug content + safety model + scope + schema. ✅
- **GATE B** — catalog + engine + 6 safety checks + adrenaline guard (TDD, 19 tests). ✅
- **GATE C** — recommendation→prescription smart link + grab-and-give administration + cumulative (TDD, 25 prescribing tests). ✅
- **GATE D** — bedside UX (PrescribeDialog in the Breathing panel) + pharmacy seam + gated persistence + adversarial review + closeout. ✅

## I. Open questions for the CSO

1. Confirm the structured catalog faithfully encodes your supplied content (doses verbatim; web-cross-verified).
2. Confirm the §B Breathing mappings (esp. anaphylaxis → IM 1:1000, magnesium → asthma item, steroid → both options).
3. Confirm the §C safety checks + the override-with-reason model for time-critical resus.
4. Ratify the §E gated-persistence approach (timeline now; apply 0039 via the controlled DB step).
5. Confirm the §F scope split (RSI record-only; pharmacy NOT built; e-pharmacy/formulary later).
