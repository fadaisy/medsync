# PROMPT — Clerking desk v2, step 10 Plan: by problem, prescribing, fluids and monitoring charts

**For:** Claude Code, working in `justfadhul/medsync`. Branch off `feat/clerking-exam-v2`; use a new branch named `feat/clerking-plan-v2`.
**Owner and CSO:** Usama Fadhul.
**Design authority:** `prototype/Prototype7.dc.html` in this pack (interactive; open it on the canvas). Prototypes 3 to 6 are its history.
**Companion files in this pack:**
- `drug-catalogue.v0.json` and `drug-catalogue-validate.py` (MS-RX-CAT-001, draft, **no doses**)
- `drug-catalogue-README.md`
- `MONITORING-CHARTS.md` (the chart rules and graph design)
- `prototype/` (the prototype files)

Read `AGENTS.md` first. This Next.js has breaking changes: read the relevant guide in `node_modules/next/dist/docs/` before writing code. `DESIGN-medsync.md` wins every visual disagreement with the prototype. The prototype uses raw hex; the build uses the tokens in `app/globals.css`.

Work in phases. **Every phase ends with STOP:** report what you did, what you found, the commands you ran and their results, then wait. Do not start the next phase until the owner says so. Do not commit to `main`, do not push, and do not run `npm run db:migrate`. Migrations marked GATED are written and reviewed only; the owner applies them.

---

## 0. What we are building, in one paragraph

Step 10 Plan becomes a page that answers four questions in order:
1. **Where, and how closely?** Disposition, observations, senior review.
2. **What happens for each problem?** Tests with a priority, care items, treatment chosen by class, and a plan note, one card per problem carried from 09 Impression.
3. **What is the patient already taking?** Medicine reconciliation.
4. **What must be true before signing?** A computed checklist.

Tests and prescriptions go into one basket, and nothing is sent until the basket is placed. Prescribing opens a landscape dialog with three columns (what / how / check). A dose arrives pre-set only from a signed, verified reference. Otherwise the prescriber types a number and taps everything else. IV fluids and some medicines open monitoring charts (fluid balance, observations and NEWS2, temperature, glucose, MAR). Each chart says what opened it, and each is drawn as a table plus graphs.

## 1. Safety rules that override everything below

1. **Never ship a remembered dose.**
   - A reference dose, regimen or default may appear only from an entry whose `dose.status` is `verified`, with a source URL, a verbatim quote containing the numbers, and the date checked.
   - It must also carry `csoSigned: true` before it shows by default in production.
   - Until then the UI shows "No verified regimen yet".
   - The existing signed emergency formulary (`lib/prescribing/reference/emergency-drug-catalog.ts`) already meets this bar. Its entries may be used as they are.
2. **Decision support, never autonomous.**
   - MedSync never chooses a medicine.
   - The diagnosis → class map is labelled "draft map, not CSO-signed" until it is signed.
   - A check that fires needs the prescriber's answer, which is recorded.
   - An override needs a reason, which is recorded and audited.
3. **The server re-runs every check** on place, whatever the screen showed. This is the existing pattern in `lib/emr/write/prescriptions.ts`: a non-overrideable block still refuses.
4. **Colour never carries state alone.**
   - Amber is for checks and cautions.
   - Red is only for the *Emergency* test priority and the NEWS2 7+ emergency-response band, each with its text label.
   - There are no left-edge accent bars, and headings are weight 500.
5. **Motion:** only the sanctioned curve and durations (150 ms chevrons, for example). No decorative motion. Charts do not animate in.
6. **Blank is not zero:**
   - A chart cell left blank means *not recorded*, never 0.
   - A weight that is not in the vitals means *not recorded*, never assumed.

## 2. Where things are today (verify in Phase 0)

| Area | Where |
|---|---|
| Plan step UI | `components/emr/desk/sections.tsx` → `PlanBody` (about line 942), with `desk/model.ts` and `desk/flows.ts` |
| Orders | `components/emr/orders/*`; `lib/emr/actions/orders.ts` (`placeOrders`: `priority: routine | urgent | immediate`, `reasonConditionIds`, `reasonText`); `db/schema/encounter.ts` has the `enc_order_priority_check` constraint |
| EMR prescribing | `components/emr/prescribing/{sheet,model,panel,views,encounter-prescriptions}.tsx`; `lib/emr/write/prescriptions.ts`; `lib/emr/actions/prescriptions.ts`; flag `EMR_PRESCRIBING` in `lib/emr/feature.ts` |
| The engine | `lib/prescribing/engine.ts` (`runSafetyChecks`, `SafetyFlag`), `lib/prescribing/reference/emergency-drug-catalog.ts` (signed, verified-web 3 Jun 2026) |
| Resus prescribing, the pattern to follow | `app/nurse/resus/[episodeId]/_components/prescribe-dialog.tsx`: option chips, a resolved card, **Adjust** with the struck-through default, live flags, override reason, witness for controlled drugs. ADRs 0051, 0052, 0054 |
| Nursing records | `db/schema/nurse-workspace.ts`: `clinical_observations`, `medication_administration_records` (with a `prescription_id` seam) |
| Vitals | ADR 0174 (vital signs as observation sets); the weight lives there |
| Charts UI | `components/emr/chart/*` (no chart library installed) |
| Diagnosis catalogue | MS-EMR-DX-CAT-001 from the Summary and Impression pack, if it has landed; otherwise REF-DX-TERMS |

---

## Phase 0 — Discovery (no product changes)

1. Read every file in §2. Map how Plan items are stored today: the s14 item kinds `order`, `prescription`, `procedure_plan`, `counselling`, `referral`, `follow_up`, `plan_statement`, and how the note composer renders them.
2. Confirm:
   - how `reasonConditionIds` links an order to a problem;
   - how the prescription write path links to a problem, if it does;
   - how co-sign policy is read (`clinical_cosign_policies`);
   - where the weight observation is read (`obs.weight` via the fact snapshot, as `loadPrescribePatient` does).
3. Open the prototype and walk the three Tweaks: start "Prescribing", start "Fluids", and "Show with demo entries". List every screen element and name the existing component it maps to, or say it is new.
4. Run `python3 drug-catalogue-validate.py` from this pack and report the counts.
5. List the GATED migrations you expect to need (Phase 2), with columns. Do not write them yet.

**STOP.** Report: a map of the current Plan; what the prototype adds; which new tables and columns are needed; the risks.

## Phase 1 — Decisions (ADRs only)

Write the new ADRs, numbered after the latest one in `docs/adr/`, and mirror them in `CHANGELOG.md`:

1. **Plan by problem.**
   - The Plan is organised by the problems from 09 Impression.
   - Every order and prescription carries its problem, as `reasonConditionIds` or the prescription's `indication` / `condition_id`.
   - The four-question page order.
2. **Test priority and routine frequency.**
   - Add `emergency` to the priorities: routine | urgent | immediate | emergency.
   - Routine requires a frequency: `once | daily | 12h | 6h`.
   - Record the one-line definitions shown under the control. They are proposed wording, and the lab sets its own times.
3. **Prescribing in the EMR follows the resus dialog.**
   - This supersedes, for signed entries only, the EMR sheet's "nothing proposes a dose".
   - A verified, CSO-signed regimen may pre-set the dose, route, frequency and course.
   - Any change to a pre-set value is shown struck through and recorded as an edit.
   - A medicine without a signed regimen is typed.
4. **General formulary MS-RX-CAT-001.**
   - A classified drug catalogue: systems → classes → generic drugs, with routes, methods and attributes.
   - Dose verification: the source order is Medscape, Uganda Clinical Guidelines 2023, then BNF / BNFC. Each value needs a quote, a URL and a date.
   - CSO sign-off per entry.
   - Brand names are never shown.
5. **Weight from the vitals.**
   - Weight-based arithmetic uses the latest `obs.weight` from the vitals. The display always shows the value, its time and its source.
   - With no weight, per-kg arithmetic is not done and the check says so.
6. **Monitoring charts are opened by the plan.** The rule table and graph rules in `MONITORING-CHARTS.md`.
7. **Pharmacy seam.**
   - `PharmacyAvailability` is an interface the dialog reads: `not_linked | in | low | out`, plus the dispensing point.
   - Today it always returns `not_linked`.
   - The prototype's "Connected (demo)" is for design only.

**STOP.** The owner reviews the ADRs.

## Phase 2 — Data and reference (GATED migrations written, not applied)

1. **The formulary module.**
   - Generate `lib/prescribing/reference/general-formulary.ts` from `drug-catalogue.v0.json`, with typed `Drug`, `DrugClass`, `DrugSystem` and `DiagnosisLink`.
   - Keep the JSON as the source, with a small script to regenerate the TS.
   - Port the validator's rules into `tests/prescribing/general-formulary.test.ts`. The dose-content guard is required: no dose string in any entry whose `dose.status !== "verified"`.
2. **Dose verification fields.** Each `dose` has:
   - `status: "to-verify" | "verified"`, `csoSigned: boolean`;
   - `regimens[]`, each with `{ id, label, band: "adult" | "olderAdult" | "child", doseNum, unit, strength?, route, method?, freq, course?, perKg?: { amount, unit, max? }, sources: [{ url, quote, checkedAt }] }`;
   - per-band text, renal and hepatic notes.

   The build ships with the emergency-formulary entries as the only verified ones (glucose IV, glucagon, the crystalloid bolus). Map them into this shape **without changing a single value**. The prototype's `REF` block shows the exact strings.
3. **GATED migrations** (next numbers after the latest in `supabase/migrations/`), each with the GATED header, RLS, and audit triggers mirroring 0039/0074:
   - `enc_order_priority_check` accepts `emergency`; add `frequency text` with a check constraint, required when the priority is routine. Drizzle intent in `db/schema/encounter.ts`.
   - `prescriptions` gains `method text`, `infusion_over text`, `diluent text`, `prn boolean default false`, `course text`, `regimen_id text`, `edits jsonb default '[]'`, `condition_id uuid` (the problem), `start text` (`now | next_round`), `kind text` (`drug | fluid`), and fluid columns `fluid_purpose`, `volume_ml numeric`, `over_minutes integer`, `giving_set_drops_per_ml integer`, `warmed boolean`. Check which of these the 0074 OPD columns already cover and do not duplicate them.
   - `fluid_balance_entries` and `monitoring_charts`, as specified in `MONITORING-CHARTS.md` §5.
4. Update the write path (`lib/emr/write/prescriptions.ts`):
   - accept the new fields;
   - recompute every check on the server;
   - record `edits`, the answered checks and the override reason (encrypted like `confirm_reason_ciphertext`);
   - write the medication statement as today.

**STOP.** Report the migrations (not applied), the generated module and the tests.

## Phase 3 — The Plan page

Build it to match Prototype 7, in this order on the page:

1. **Header:** `[10] Plan`, a status pill ("n to do before signing" / "Ready to mark done" / "Plan done"), and "Step 10 of 10".
2. **Where, and how closely**
   - **Disposition:** Admit (then a ward chip: Medical ward / HDU / ICU from the hospital's ward list), Observe in EU, Refer (then where to), or Discharge. Discharging with NEWS2 ≥ 5 shows an amber caution; for an intern it also says a senior must agree.
   - **Observations:** Continuous / Hourly / 4-hourly / 12-hourly. The RCP 2017 line is shown for NEWS2 5–6. Choosing less often than NEWS2 calls for asks why, and the reason goes into the note.
   - **Senior review:** Now / Within 1 hour / Routine.
3. **By problem:** one collapsible card per problem, in Impression order: leading ★, then the differential numbered, then "also this visit". Each card has:
   - **Tests that would help decide** (from the diagnosis catalogue's `testsToDecide`):
     - Each row has the name and specimen, and **Add** / **In basket** / **Also for this** / **Link to this** when the test is already there for another problem.
     - Priority is a 4-segment control: Routine / Urgent / Immediate / Emergency. Emergency uses the critical token *with* its label.
     - Routine reveals **How often**: Once / Daily / 12-hourly / 6-hourly.
     - The selected priority's definition is shown in one line.
     - Once placed, the row reads "Placed hh:mm · priority · To collect / To do".
     - An "Add all to basket" button when there is more than one test.
   - **Must not miss:** when a must-not-miss problem has no test, no treatment and no reason, an amber box asks for a test or a reason.
   - **Suggested care, not orders:** non-drug care items as tick boxes. Draft content, labelled as such.
   - **Treatment for this problem:**
     - The classes mapped to this diagnosis, each with its generic examples as chips. Clicking one opens the dialog on that class and drug.
     - "Supportive: IV fluids" where mapped, with the hint "opens a fluid balance chart".
     - The prescriptions for this problem with their status, and "Prescribe something else".
   - **Plan note for this problem** (optional).
4. **Medicines**
   - The allergy line: amber when the allergy is not coded or the reaction is unknown.
   - Fact chips: age and band, weight with source and time, kidney function state, allergy.
   - **On admission:** each current medicine gets Continue / Hold / Stop; Hold or Stop needs a reason.
   - **New this visit:** each prescription's line, its answered checks, and its edits from the regimen.
5. **Monitoring charts:** see Phase 5.
6. **Talked through:** tick boxes. Discharge adds follow-up and when-to-come-back advice.
7. **Before you sign:** the computed checklist:
   - disposition (with a ward or destination);
   - observations for NEWS2;
   - senior review;
   - the leading problem has a test, a care item or a treatment;
   - every must-not-miss problem has a test, a treatment or a reason;
   - every admission medicine has a decision;
   - the basket is empty;
   - on discharge, follow-up.
8. **Basket bar:** orders and prescriptions together, with priority tags (Emergency in the critical token), "for {problem}", and a remove button. **Place n orders and m prescriptions** places both in one action, then the server re-checks.
9. **Footer:** "← Impression", the footnote, and **Mark plan done** (enabled only when the checklist is clear). Any later change reopens the plan.
10. **Note pane:** the Plan block is composed by fixed rules:
    - disposition;
    - monitoring, including "fluid balance chart hourly, urine output measured" when a fluid chart is open;
    - one numbered line per problem: its tests (with priority and frequency, ordered or not yet ordered), care items, prescriptions (with "override, allergy record: reason" and "changed from default: dose"), and the metformin decision;
    - talked through;
    - follow-up.

    The Sign button becomes available when the plan is done.

**STOP.** Show screenshots at 1440 and at a narrow width; run typecheck, lint and test.

## Phase 4 — The prescribing dialog (landscape, minimal typing)

A centred modal of about 1240 × 800 on desktop, over a dimmed backdrop. It uses the existing `EmrDialog` primitive if it can take a wide variant; otherwise extend it. On narrow screens the three columns stack in order: what, how, check.

**Header**
- Kicker "Prescribe · for {problem}", the title "{drug} · {class}", the fact chips (age and band, weight with source, kidney function, allergy), and a close button.

**Column 1 — What (300 px)**
- The **For** chips (the problems; changing one re-links the prescription).
- Search across all classes.
- The classes mapped to the problem, each listing its generic drugs with a pharmacy stock tag (`Stock: not linked` today).
- "Supportive: IV fluids".

**Column 2 — How, by taps**
- The drug name, class and forms, with a reference tag: "Signed emergency formulary" / "Verified · awaiting CSO" / "Not verified".
- **Formulary regimens for this patient:**
  - Only verified regimens for the patient's band are shown, resolved with the vitals weight where per kg. The prototype shows "2 mL/kg × 20 kg = 40 mL of 10%" in the child demo.
  - One tap sets dose, strength, route, method, frequency and course.
  - A "Dose by age" toggle shows the Child / Adult / Older adult table with this patient's row highlighted, and the source in monospace.
  - With no verified regimen, a dashed box says so.
- **Dose:** a numeric field (the only typing) plus unit chips: mg, g, µg, mL, units, mmol.
- **Route** chips from the drug's routes.
- **How given** chips for the route:
  - IV: slow IV injection / intermittent infusion / continuous infusion;
  - IM: IM injection;
  - oral: tablet / liquid;
  - SC: SC injection;
  - PR: suppository.

  Intermittent infusion reveals **Over** (15 / 30 / 60 min) and **Diluted in** (Sodium chloride 0.9% / Glucose 5% / Water for injection).
- **How often:** Once (stat) / Once daily / 12-hourly / 8-hourly / 6-hourly / 4-hourly, plus a PRN toggle.
- **Course:** Single dose / 3 / 5 / 7 / 14 days / Until review.
- **Start:** Give now / Next drug round.
- An optional note.
- **Fluids** replace the drug controls:
  - fluid chips (Sodium chloride 0.9%, Ringer's lactate, Glucose 5%, Glucose 10%);
  - purpose (Bolus / Maintenance / Replacement);
  - volume chips (250 / 500 / 1000 mL, or verified per-kg bolus regimens), plus "other mL";
  - over chips (bolus 15 / 30 / 60 min; maintenance 4 / 6 / 8 / 12 / 24 h);
  - how given (Infusion pump / Gravity drip, then the 20- or 60-drop set);
  - Warmed yes / no;
  - the rate shown as mL/h and drops/min. This is arithmetic only.

**Column 3 — Check (360 px)**
- **Will read:** the prescription as it will appear in the note, updated live; a line for each value changed from the regimen, with the old value struck through; and the band and weight line.
- **Pharmacy:** "Pharmacy not linked yet" (a dashed box) from the seam.
- **Flags:** the checks that fire (Stop and check / Check / Note), then "Show n more checks" for those that passed, did not apply or could not run.
- **Reason chips when an answer is needed:**
  - Override: "Previous reaction was not allergic" / "Senior reviewed and agreed" / "No suitable alternative available" / "Other, I will write it".
  - Check: "Aware; will monitor" / "Senior reviewed and agreed" / "Result awaited; will review" / Other.
  - These wordings are drafts for the CSO.
- **Footer:** the reason the button is disabled, in words; Cancel; **Add to basket**, or **Override and add** when a stop fired.

**Checks.** Reuse `runSafetyChecks` and extend it behind flags. Mark each new check "proposed" until the CSO signs it.
- **Allergy:** match on name, class and the catalogue's `allergyGroups`. Cross-reactivity is not checked; say so on clear results for beta-lactams.
- **Dose against reference:** the existing `dose_range` where a mg reference exists; otherwise "not checked" with the reason.
- **Kidney function:** for `flags.renal`, read the latest creatinine or eGFR. If none, say "not resulted" or "no U&E in the plan".
- **Weight:** for weight-based drugs, show the vitals weight and time. Arithmetic runs only with a verified per-kg regimen.
- **Child:** under 16, never the adult dose (the engine's existing rule).
- **Already prescribed:** the same class this visit, or on the admission list.
- **Indication against the latest result:** for example, IV glucose when the last glucose is above 4.0.
- **Cultures before antibiotics:** for `anti` drugs when a sepsis-type problem is linked. Reads the blood culture order state.
- **Interactions:** "not checked" until an interaction reference is signed.
- **Pharmacy stock:** from the seam.
- **Co-sign:** from `clinical_cosign_policies`.
- **Controlled:** a witness is required, as in the resus dialog.

**STOP.** Screenshots of: ceftriaxone with the allergy stop; glucose IV with a regimen then an edited dose; a maintenance fluid with a gravity set. Run the tests.

## Phase 5 — Fluids and monitoring charts

Follow `MONITORING-CHARTS.md` exactly.

1. **Registry.**
   - Placing the plan opens charts through the rule table.
   - Each chart row records `opened_by`: the plan item that opened it.
   - The Plan shows "Monitoring charts", each with its name, what opened it, its frequency or state pill, and an expandable body.
2. **Fluid balance.**
   - The table (IV in per fluid with its plan rate, oral in, urine out or "not measured", other out, running balance).
   - The two graphs: in and out bars with the balance line; urine output per hour against 0.5 mL/kg/h × vitals weight, labelled *to verify*.
   - A "Measure urine output" switch.
   - A nurse entry surface in the nurse workspace for `fluid_balance_entries`, append-only with correction by a new entry.
3. **Observations and NEWS2** from `clinical_observations`, drawn over the RCP bands (the 7+ band uses the critical token with its label). **Temperature**, with core readings marked. **Capillary glucose**, with the 4.0 line. **MAR** from `medication_administration_records`, showing due, given, delayed and omitted-with-reason.
4. **Graph components** in `components/emr/chart/`:
   - SVG, tokens only, `role="img"` with a sentence `aria-label`, no animation;
   - an empty state in words;
   - the first clerking value drawn as an ink dot.

   Keep the maths (running balance, mL/h, drops/min, the threshold from the weight) in pure functions in `lib/emr/charts/` with unit tests.

**STOP.** Screenshots with real entries in a seeded test encounter (never demo data in production), and tests.

## Phase 6 — Tests

Add Vitest suites for at least the following:
- the formulary validator and the dose-content guard;
- regimen resolution by band and weight, including the child glucagon rule "<8 yr or <25 kg" and 2 mL/kg glucose from the vitals weight;
- blank weight means no arithmetic;
- the checks: allergy group match, renal with no creatinine, cultures-before-antibiotics states, the co-sign note, the out-of-stock check;
- the reason requirement, override versus check;
- edits recorded against the regimen;
- the priority and frequency validation, where routine requires a frequency;
- the checklist computation;
- the note composer lines for every Plan element;
- the chart maths: running balance with blanks, mL/h for min and h inputs, drops/min for 20 and 60 sets, and 0.5 mL/kg/h for 58 kg equals 29;
- the chart rule table: which plan items open which chart.

Also extend the RLS tests for the new tables in `tests/rls/`.

**STOP.**

## Phase 7 — Ship check

Run `npm run typecheck && npm run lint && npm run test`, then `rm -rf .next && npm run build`. Check `/styleguide` if tokens changed, and do a keyboard-only pass of the dialog: focus trap, Escape closes, and every chip is reachable and announced as pressed or not.

**STOP.** Report the results. The owner applies the GATED migrations and flips the flags.

---

## Appendix A — Dose verification task (when the network allows)

Before `dose.status` can be `verified` on any MS-RX-CAT-001 entry:

1. Fetch the Medscape drug page, the Uganda Clinical Guidelines 2023 section and the BNF / BNFC page.
2. Record for each band (adult, older adult, child) the regimen for the linked indication, with the URL, the verbatim quote containing the numbers, and `checkedAt`.
3. Where the sources disagree, record both, prefer the Uganda guideline for local practice, and flag the difference for the CSO.
4. Record renal and hepatic adjustments as text with their quote.
5. Never infer a number that is not in a quote.
6. Set `status: "verified"` and leave `csoSigned: false`. Only the CSO sets `csoSigned: true`.

## Appendix B — What the prototype invents (do not ship as fact)

- **The case:** the 58 kg weight and the 23:14 / 23:16 clock times.
- **All "demo" data:** chart entries, pharmacy stock, the "Given 23:20" in the MAR.
- **Drug attributes:** the renal, weight and interaction attributes on drugs, and the diagnosis → class map.
- **Wording:** the priority definitions, the reason-chip wording, and the care-item wording for hypothermia.
- **Reference lines:** 35 °C and 0.5 mL/kg/h, both *to verify*.
