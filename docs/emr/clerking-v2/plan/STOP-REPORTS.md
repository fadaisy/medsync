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

---

## STOP 2: data, reference and the write path

**GATED migrations written, not applied** (apply in order, before deploying this branch: the Drizzle schema names
the new columns):

| Migration                                  | What                                                                                                                                                                                                                                                           |
| ------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `0087_orders_emergency_frequency`          | priority `emergency`; `encounter_orders.frequency` (`once / daily / 12h / 6h`); a BEFORE INSERT trigger stores a routine order with no frequency as `once`                                                                                                     |
| `0088_prescriptions_plan`                  | 15 prescription columns (method, infusion over, diluent, PRN, regimen, edits, problem, start, kind, fluid purpose, volume, time, giving set, warmed, answered checks) with their checks; reconciliation `held` needs a reason; the MAR's `emr_prescription_id` |
| `0089_fluid_balance_and_monitoring_charts` | `fluid_balance_entries` (append-only; correction and entered in error by a new row) and `monitoring_charts` (one open per kind per visit; never deleted), RLS forced, reader policy, write revokes, audit triggers                                             |

**The formulary.** `data/prescribing/drug-catalogue.v0.json` (byte-identical to the pack) →
`scripts/prescribing/gen-formulary.ts` → `lib/prescribing/reference/general-formulary.ts`. The signed emergency
regimens are laid over four catalogue drugs by `formulary-regimens.ts`, which reads every quote from
`emergency-drug-catalog.ts` at load (glucose 10%: adult 150 mL, child 2 mL/kg; glucagon: adult 1 mg, child 500 µg
or 1 mg by "<8 yr or <25 kg"; sodium chloride 0.9% and Ringer's lactate: adult 250–500 mL, child 10–20 mL/kg).

**The write path.** `lib/emr/write/plan.ts` `placePlan`: orders (with frequency), prescriptions (the checks re-run
from the record: allergy, kidney, weight, child, duplicate, indication, cultures, interactions, stock, co-sign,
controlled; a non-overrideable stop and an unanswered check refuse; the answers encrypted with the reason; edits
recomputed against the regimen with the record's weight), then the charts the rule table opens. Signing a v2 note
where the Plan is on waits for "plan done" (`planSignBlocks`).

**Tests.** `tests/prescribing/general-formulary.test.ts` (the validator and the dose-content guard),
`formulary-regimens.test.ts`, `plan-prescribing.test.ts`, `tests/emr/plan-charts.test.ts`,
`tests/clerking/plan.test.ts`; on the PGlite lane `write-plan.test.ts` and the RLS matrix with the two new tables.
Full suite: 7,758 passed; lane: parity, migrations, RLS matrix and the Plan writes pass.

---

## STOP 3: the Plan page

Built behind `CLERKING_PLAN_V2` (needs `CLERKING_V2`): `components/clerking/plan/` (`plan-step.tsx`,
`problem-card.tsx`, `medicines.tsx`, `parts.tsx`, `model.ts`) over the pure engines in `lib/clerking/plan/`, and the
desk's payload `p.plan` (`lib/emr/read/plan.ts`). With the flag off, step 10 renders the v1 Plan unchanged.

In page order: the header pill ("n to do before signing" / "Ready to mark done" / "Plan done"); disposition (ward
chips from the hospital's ward list, or a field when none is set up), observations against the signed NEWS2 response
(the RCP 2017 line for 5–6, a reason when less often), senior review; one card per problem in Impression order with
tests (4-segment priority, routine frequency, the definition marked proposed wording, Add / In basket / Also for this
/ Link to this, Add all), the must-not-miss box, suggested care (empty: no signed list), treatment by class ("Draft
map, not CSO-signed"), supportive IV fluids, and a plan note; medicines (the allergy line, fact chips, Continue /
Hold / Stop with a reason, new this visit with answered checks and struck-through edits); monitoring charts; talked
through (draft wording) and, on discharge, follow-up; the checklist; the basket with one Place action; the footer
with Mark plan done. The note's Plan block is composed by `composePlanLines`, and signing waits for "plan done" on
screen and on the server.

Screenshots (`screenshots/`, from the fixture `/styleguide/clerking-si/plan`, `MEDSYNC_FIXTURES=1`): P01 1440 light,
P02 medicines and checklist, P03 1440 dark with a placed Emergency blood culture, P04–P05 390 px.

## STOP 4: the prescribing dialog

`components/clerking/plan/prescribe-dialog.tsx`: `EmrDialog` gains an `xl` width (about 1240 × 800); three columns
(what 300 px, how, check 360 px, sticky on wide screens) that stack on a narrow screen. Glucose 10% is a drug when
chosen from the list (the signed hypoglycaemia regimen) and a fluid when chosen from the fluid chips.

- R01/R02: ceftriaxone with a recorded cephalosporin allergy: "Stop and check", the override chips, cultures before
  antibiotics, "Override and add", the disabled reason in words.
- R03/R04: glucose 10% for an older adult: the signed adult regimen ("the source gives no separate older-adult
  dose"), then 200 mL typed: "Dose: ~~150 mL~~ → 200 mL", and the glucose-above-4.0 check.
- R05: Ringer's lactate 1000 mL over 8 h on a 20-drop gravity set: 125 mL/h, 42 drops/min, "arithmetic only".

## STOP 5: fluids and monitoring charts

Built by one agent on its own files, reviewed and integrated here: `lib/emr/charts/{scale,payload,build}.ts`,
`lib/emr/read/monitoring.ts`, the SVG graphs in `components/emr/chart/graphs/`, `MonitoringChartsView`, the nurse's
fluid balance entry (`lib/emr/write/fluid-balance.ts`, append-only, correction and entered in error by a new row) on
`/nurse/patients/[patientId]`, and the fixture `/styleguide/monitoring`. The nurse surface and its actions are
behind `CLERKING_PLAN_V2` too.

Changed on integration: the MAR was read by switching to the owner role inside the reader transaction; 0089 (not
applied) now gives `medication_administration_records` the clinical reader's scoped SELECT, the read is under RLS,
and the MAR joins the RLS matrix's reader-path tables.

Screenshots: C01 fluid balance (gap marker, "Not measured", the 29 mL/h line "to verify", no flag), C02 NEWS2 over
the RCP bands (red only for the 7+ band, with its label; the clerking value an ink dot), C03 temperature, C04
glucose, C05 MAR, C06 dark.

For the CSO (chosen in the build, all visible in code and tests): "core" temperature is rectal, oesophageal or bladder
(the exam catalogue offers rectal only); a value is "at clerking" when it came from triage or before the chart opened;
NEWS2 is drawn only for complete sets; a MAR dose is "Delayed" once its due time passes with nothing recorded (no
grace period), due times start from the first dose, and a next-round prescription has none until one is given;
entered-in-error reasons (wrong patient, recorded twice, wrong kind, other); a 10,000 mL guard on an entry.

---

## STOP 6: tests

| Suite                                                 | Covers                                                                                                                                                |
| ----------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| `tests/prescribing/general-formulary.test.ts`         | the pack's validator rules, the counts, the dose-content guard (and that it catches a planted dose), the generated module's drift                     |
| `tests/prescribing/formulary-regimens.test.ts`        | every signed regimen's numbers appear in its verbatim quote; the glucose 20% option stays a quote; no older-adult row                                 |
| `tests/prescribing/plan-prescribing.test.ts`          | bands; child glucose 2 mL/kg × 20 kg = 40 mL; glucagon "<8 yr or <25 kg"; blank weight, no arithmetic; the checks; override versus check; edits       |
| `tests/clerking/plan.test.ts`                         | observations against CO-NEWS-01..05; routine needs a frequency; the checklist and "plan done"; the server's sign gate; the trust boundary; note lines |
| `tests/emr/plan-charts.test.ts`, `tests/emr/charts/*` | mL/h from minutes and hours, drops/min for 20 and 60, 0.5 × 58 = 29, the chart day, the running balance with blanks, the rule table, scales, builders |
| `tests/clerking/plan-step.test.ts`                    | the page in the four questions' order, a test to the basket, Emergency the one red, one Place, Mark plan done and reopening, the dialog's chips       |
| `tests/emr-db/write-plan.test.ts` (lane)              | placePlan end to end; refusals; the allergy override encrypted; edits; charts once per kind; the database's own rules (0087–0089)                     |
| `tests/emr-db/write-fluid-balance.test.ts` (lane)     | record, not measured, correction, entered in error, append-only, no open chart, read-back under RLS                                                   |
| `tests/emr-db/rls-probes.test.ts` (lane)              | the access matrix with `fluid_balance_entries`, `monitoring_charts` (both paths) and the MAR (reader path)                                            |
| `tests/rls/emr-access.test.ts` (hosted twin, skipped) | the two chart tables are never read or written from a client                                                                                          |

## STOP 7: ship check

| Check                                                | Result                                                                                   |
| ---------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| `npm run typecheck`                                  | clean                                                                                    |
| `npm run lint`                                       | 0 errors (the 2 warnings in `scripts/embed-bench.mjs` predate this work)                 |
| `SKIP_ENV_VALIDATION=1 npx vitest run`               | 7,821 passed, 558 skipped                                                                |
| `EMR_PGLITE=1 npx vitest run tests/emr-db`           | 25 files, 382 passed                                                                     |
| `rm -rf .next && npm run build`                      | compiled                                                                                 |
| `npm run clerking:catalogue-check`, `npm run budget` | ok                                                                                       |
| `npm run format:check`                               | 23 files flagged, all predating this branch (the ones PR #190 adds to `.prettierignore`) |
| `/styleguide`                                        | no token changed                                                                         |

**Keyboard pass of the dialog** (Playwright, `/styleguide/clerking-si/plan`): opened from "Ceftriaxone" with Enter;
with a human pace between Tabs focus never left the dialog over 120 Tabs (the same holds for the existing Details
dialog; pressing Tab faster than one frame outruns the primitive's refocus in both); every chip is reached; all 33
chips carry `aria-pressed` and the segmented controls `aria-checked`; Escape closes and focus returns to
"Ceftriaxone".

**For the owner:** apply 0087 → 0088 → 0089 (GATED; before deploying this branch), then turn on `CLERKING_PLAN_V2`
(per hospital, where `CLERKING_V2` is on) and, for prescribing from the Plan, `EMR_PRESCRIBING`. The CSO signs, or
sends back: ADRs 0184–0190, the priority definitions, the reason-chip wording, the talked-through items, the new
checks (all marked proposed), the diagnosis → class map, the chart rules marked proposed (off), the reference lines
(35 °C, 0.5 mL/kg/h) and the choices listed under STOP 5. Dose verification (Appendix A) waits for access to Medscape,
UCG 2023 and BNF.

---

## After STOP 7: 0087 made safe to apply first (28 Sep 2026)

Asked for the commands to apply the migrations: as written, 0087's trigger refused a routine order with no
frequency, and the code on `main` places routine orders without one, so applying 0087 before this branch is deployed
would have stopped routine test orders wherever `EMR_V1` is on. The trigger now stores such an order as `once` (what
every routine order meant before), ADR 0185 §3 says so, and the lane test checks it. 0088 and 0089 only add columns
with defaults, new tables and a reader policy. All three can be applied while `main` is still deployed; this branch
must not be deployed before them.

**Applied (28 Sep 2026):** the owner applied 0087 → 0088 → 0089 with `npm run db:migrate` from a worktree of this
branch. Next: deploy the branch, then turn on `CLERKING_PLAN_V2` (and `EMR_PRESCRIBING` for prescribing).
