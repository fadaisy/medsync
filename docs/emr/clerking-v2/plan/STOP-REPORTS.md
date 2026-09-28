# Plan (step 10): stop reports

One section per STOP of `PROMPT-CLERKING-PLAN.md`. Newest last. The owner asked for every gate in one run
("Go through all gates"), stopping only for signatures.

---

## STOP 0: discovery

**Run:** 28 Sep 2026, cloud session, branch `feat/clerking-plan-v2` from `main` at `0da348b`.

**Base branch.** The prompt says to branch off `feat/clerking-exam-v2`. That branch is fully merged into `main`
(PR #183) and lacks the Summary and Impression build (PR #187): the problems from 09 Impression and the diagnosis
catalogue's `tests_to_decide` exist only on `main`. `main` is exam-v2 plus step 09, so the branch starts there.

**Pack received:** `PROMPT-CLERKING-PLAN.md`, `MONITORING-CHARTS.md`, `drug-catalogue.v0.json`,
`drug-catalogue-validate.py`, `drug-catalogue-README.md`, `README.md`, copied byte-identical to
`docs/emr/clerking-v2/plan/`. **Not received:** `prototype/` (Prototype 7, the design authority, and 3 to 6).
Everything is built from the written specification (the prompt, §§0-5, and `MONITORING-CHARTS.md`), as the
Summary and Impression build was when Prototype 2 did not arrive.

**Dose sources:** `reference.medscape.com`, `bnf.nice.org.uk` and `library.health.go.ug` are unreachable from this
environment. Appendix A (dose verification) cannot run, as the pack's README expected.

### The catalogue (step 4)

`python3 drug-catalogue-validate.py drug-catalogue.v0.json ../summary-impression/clerking-diagnosis-catalogue.v1.json`:
**PASS.**

| Item                     | Count                                                                                                                               |
| ------------------------ | ----------------------------------------------------------------------------------------------------------------------------------- |
| Systems / classes        | 14 / 69 (67 leaf, 2 parent)                                                                                                         |
| Drugs                    | 182 (anti-infective 58, cardiovascular 25, fluids 18, endocrine 15, …)                                                              |
| Diagnosis links          | 100 (to classes and supportive items, never to one drug)                                                                            |
| Allergy groups           | 28                                                                                                                                  |
| Flags                    | renal 72, hepatic 78, weight-based in children 129 / adults 42, controlled 8, high-alert 34, narrow therapeutic index 14, reserve 0 |
| Doses                    | 182 / 182 `to-verify`; 0 regimens; dose-text scan clean                                                                             |
| Unreached leaf class     | `abx.cephalosporin.2` (no diagnosis link reaches it)                                                                                |
| On EMHSLU (drafter says) | true 115, false 1, unsure 66                                                                                                        |

The three signed emergency entries map onto catalogue drugs:

| Signed entry (`emergency-drug-catalog.ts`) | Catalogue drug                           | Regimens carried (values unchanged)                                                      |
| ------------------------------------------ | ---------------------------------------- | ---------------------------------------------------------------------------------------- |
| `glucose_iv`                               | `glucose_10`                             | adult "150 mL of 10% IV over 10–15 min"; child "2 mL/kg of 10% glucose per APLS"         |
| `glucagon_im`                              | `glucagon`                               | adult "1 mg IM"; child "<8 yr (or <25 kg) 500 µg IM; ≥8 yr (or ≥25 kg) 1 mg IM per BNFc" |
| `crystalloid_bolus`                        | `sodium_chloride_0_9`, `ringers_lactate` | adult "250–500 mL bolus, reassess"; child "10–20 mL/kg boluses per APLS"                 |

The signed glucose entry's other adult option, "75 mL of 20%", has no catalogue drug (there is no glucose 20% entry);
it is carried as a quote, not a regimen. The signed entries cite their sources by name
("JBDS-IP Hospital Management of Hypoglycaemia in Adults (2023)"), not by URL: the regimens carry that citation,
the verbatim quote and `checkedAt 2026-06-03`, and no invented URL.

### The Plan today (steps 1-2)

- **Step 10 in the v2 desk** renders the v1 section body: `V1_SECTION.plan = "s14"`
  (`components/clerking/model.ts:61-65`) → `SectionBody` → `PlanBody` (`components/emr/desk/sections.tsx:942`).
  It shows the orders island (slot: `EncounterOrders` + `EncounterPrescriptions`,
  `app/doctor/encounters/[encounterId]/_desk/desk-page.tsx:110-120`), triage and resus-handover suggestions, one
  plan statement and a narrative.
- **s14 item kinds** (`data/emr/note-templates.v1.json`): `order`, `prescription`, `procedure_plan`,
  `counselling`, `referral`, `follow_up`, `plan_statement`. The sign rule `req.plan` needs any one of them.
- **Composer:** the Plan block is `sectionText.plan` (`components/clerking/model.ts:139-141`): s14 words plus this
  visit's orders not yet mirrored. `lib/clerking/compose.ts:447` passes it through.
- **Draft storage:** v2 steps keep their drafts at the content's top level (`exam`, `summary`, `impression`),
  validated by `ContentV2Keys` (`lib/clerking/payload.ts`), which strips unknown keys; a `plan` key must be added.
- **Order → problem:** `placeOrders` (`lib/emr/write/orders.ts:226`) takes `reasonConditionIds` (condition
  version ids), refuses a superseded or entered-in-error reason, and restricts the order when a reason is
  restricted. Priorities `routine | urgent | immediate` (`enc_order_priority_check`, `0071:392`,
  `db/schema/encounter.ts:256`). Callers: Impression's **Add to plan** (routine, immediately), the order sheet
  (`_orders/orders-panel.tsx:57`), triage suggestions (`lib/emr/write/intents.ts:125`) and the resus handover
  (`lib/emr/write/handoff.ts:224`).
- **Prescription → problem:** none. `prescriptions` has a free-text `indication` (0039) and no condition id.
- **Prescribing:** `lib/emr/write/prescriptions.ts` accepts only emergency-formulary ids (`getEmergencyDrug`),
  re-runs `checkPrescription` (→ `runSafetyChecks`), refuses a non-overrideable flag, requires a reason when a
  check fires (stored as `confirmed_flags` + `confirm_reason_ciphertext`), and writes a `prescribed_here`
  medication statement in the same transaction. Behind `EMR_PRESCRIBING`.
- **Co-sign:** `clinical_cosign_policies`, `prescription_routine` / `prescription_controlled`, department row
  over hospital row, fail closed (`prescribeRequirement`).
- **Weight:** `loadPrescribePatient` reads the newest `obs.weight` from the fact snapshot; the desk's
  `p.context.vitals` carries it with its time and source (triage or not).
- **Kidney function:** the record has `obs.creatinine` and `obs.urea`, no eGFR concept.
- **Medicine reconciliation:** continued / stopped / changed (`medication_statements.reconciliation`,
  `0071:773`); `medication_status` already allows `on_hold`, reconciliation does not allow "held".
- **NEWS2:** `scoreNews2` (`lib/triage/scoring/news2.ts:29`); the response bands and minimum frequencies are
  signed reference entries `CO-NEWS-01..05` (`lib/resus/reference/levels-of-care.ts:130-149`, RCP 2017 URL,
  signed at GATE A 23 Sep 2026). The observations rule reads those, not remembered numbers.
- **Nursing records:** `clinical_observations` (vitals, CFC) and `medication_administration_records`
  (`prescription_id` is free `text`, no foreign key; states administered / withheld / refused / wasted).
  The nurse's per-patient chart (`/nurse/patients/[patientId]`, `EmrChart` when EMR v1 is on) is where a
  fluid-balance entry surface can live.
- **Charts:** no chart library; `components/emr/sparkline.tsx` and the resus `VitalTrendGraph` are the only SVG
  graphs.

### What the specification adds (step 3, without the prototype)

| Element                                                 | Maps to                                                                  |
| ------------------------------------------------------- | ------------------------------------------------------------------------ |
| Header, status pill, "Step 10 of 10"                    | the desk's step header and `StatusWord` (existing)                       |
| Disposition, observations, senior review                | new (segmented controls as in step 09's `Seg`)                           |
| Problem cards in Impression order                       | new, over the existing Impression board (`lib/clerking/impression`)      |
| Tests with priority (4) and frequency                   | new; priority extends `components/emr/orders/model.ts`                   |
| Must-not-miss box                                       | new, reads the catalogue's `must_not_miss`                               |
| Suggested care                                          | new; **no source content exists** (Q3)                                   |
| Treatment by class, "Supportive: IV fluids"             | new, over MS-RX-CAT-001's diagnosis links                                |
| Medicines: fact chips, admission Continue / Hold / Stop | extends `MedicinesBody` / `confirmCurrentMedicines`                      |
| Talked through, follow-up                               | new (s14 `counselling`, `follow_up`)                                     |
| Before-you-sign checklist, Mark plan done               | new pure engine                                                          |
| Basket bar, one Place action                            | new server action over `placeOrders` + `prescribe`                       |
| Prescribing dialog (what / how / check)                 | new, after the resus dialog's pattern; `EmrDialog` gains a 1240 px width |
| Monitoring charts, graphs                               | new (`components/emr/chart/`, `lib/emr/charts/`)                         |

### GATED migrations expected (step 5; numbered after PR #188's 0086)

1. **0087 orders:** `enc_order_priority_check` + `emergency`; `encounter_orders.frequency`
   (`once | daily | 12h | 6h`); a routine order needs a frequency, enforced on insert (a CHECK would also bind
   later status updates of older routine rows).
2. **0088 prescriptions:** `method`, `infusion_over`, `diluent`, `prn`, `regimen_id`, `edits`, `condition_id`,
   `start`, `kind`, `fluid_purpose`, `volume_ml`, `over_minutes`, `giving_set_drops_per_ml`, `warmed`, and
   `check_answers` (the answered checks). `course` is the existing `duration` (0074) and is not duplicated.
   Also: reconciliation `held` (with a reason, like `stopped`), and a real `prescriptions` link for the MAR as a new
   nullable uuid column (the text `prescription_id` holds free strings that cannot be cast).
3. **0089 fluid balance and chart registry:** `fluid_balance_entries` (append-only, correction by a new entry) and
   `monitoring_charts`, each with the reader policy, write revokes, and audit (and append-only) triggers.

### Risks

- **No prototype:** layout follows the written specification and the design system; the owner judges it on screen.
- **Schema before deploy:** the Drizzle schema names the new columns, so the migrations must be applied before this
  branch is deployed (as with 0076 and 0084).
- **Every surface that places orders** must carry a frequency for routine once 0087 runs.
- **Clinical content not yet signed:** the diagnosis → class map, the drug attributes, the new checks, the chart
  triggers marked proposed, the priority definitions and the reason-chip wording all ship labelled draft or
  proposed.

---

## STOP 1: decisions

The owner's answers (28 Sep 2026): build from the written specification; push `feat/clerking-plan-v2` (no pull
request); suggested care empty until a signed list; proposed chart triggers off until signed; the chart day starts
at midnight until a setting exists; the Plan behind its own flag, `CLERKING_PLAN_V2`.

ADRs written, numbered after PR #188's 0183:

| ADR  | Decision                                                                                                 |
| ---- | -------------------------------------------------------------------------------------------------------- |
| 0184 | Plan by problem: four questions, `content.plan`, one basket, Mark plan done, composer lines, the flag    |
| 0185 | Priority `emergency`; routine needs `once / daily / 12h / 6h`, by insert trigger; callers default `once` |
| 0186 | EMR prescribing follows the resus dialog; storage columns; `held` reconciliation; the MAR foreign key    |
| 0187 | MS-RX-CAT-001 as data with a generator and a drift test; the dose shape; emergency entries unchanged     |
| 0188 | Weight from `obs.weight` with time and source; none, no per-kg arithmetic                                |
| 0189 | Charts opened by the plan; rule table; storage; SVG graph rules                                          |
| 0190 | `PharmacyAvailability`, always `not_linked`                                                              |

One conflict resolved by the design system: the prompt says headings are weight 500; `DESIGN-medsync.md` gives them
600 from the type token, and wins.
