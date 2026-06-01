# Triage Recommendations — GATE A artifact (finding → recommendation mapping)

**Status:** DRAFT — awaiting Clinical-Safety-Officer (Fadhul) sign-off. **No recommendation-engine code is written until this is signed.**
**Date:** 2026-06-01
**Scope:** Addendum to the triage engine v2 (`prompts/triage-engine-kickoff.md`). Adds a _suggestions_ layer — disposition, immediate measures, monitoring, escalation, pathway flags, onward routing, investigations — derived from the triage finding. **Suggestions, not orders; nothing auto-executes; category-level only (no doses/volumes/agents).**

> This document is the deliverable for **[GATE A] Recommendation mapping sign-off (CLINICAL)**. It is the clinical core: which finding triggers which category-level suggestion, the guideline source, whether a live seam exists, and the storage schema. Per the addendum, build **stops here** until the CSO signs the mapping.

## §0 — Executive summary

This GATE A artifact defines the cross-cutting storage, monitoring defaults, and open decisions for the MedSync triage 'suggested next actions' addendum — for Clinical-Safety-Officer sign-off BEFORE any code. The recommendation layer is suggestions, not orders: every suggestion is category-level (no drug/dose/fluid specifics), cites the guideline + threshold it derives from, biases to over-escalation, and carries its own clinician accept/modify/dismiss decision. If a finding has no traceable guideline basis, no suggestion is written.

STORAGE: one additive table, triage_recommendations, hangs off the existing medico-legal triage_records.id (verified in db/schema/triage.ts), one row per surfaced suggestion. It follows the codebase's established conventions verbatim — text columns gated by IN(...) check constraints, smallint acuity with BETWEEN checks, jsonb trigger snapshots for reproducibility, withTimezone timestamps, actor FKs to authUsers onDelete:'set null', RLS-scoped to clinical staff. Each row records category, machine code, shown text, rationale, a MANDATORY source citation, the firing engine fields, seamType (live vs pending_intent), confidence (high/medium/needs_cso_input), and the decision lifecycle (pending/accepted/modified/dismissed) with a modify-needs-note check mirroring the existing tr_override_reason_required guard. Pending-intent actions are recorded, never dropped. The proposal is additive: no column added to or backfill of triage_records; migration numbering is left to build time (latest on disk is 0037) and is NOT asserted as fact.

MONITORING DEFAULTS: the adult NEWS2 band is the spine (RCP 2017 Chart 4: 12h at 0; 4-6h at 1-4; hourly at a single-3 or 5-6; continuous at >=7), floored tighter — never looser — by the ESI v5 danger-zone rule (ENA 2023: hourly until stabilized), the L1/L2 acuity-tier floor (continuous), and overlay guardrails for sepsis, provisional/incomplete vitals, and worsening trend. All intervals are SUGGESTED timers; nothing auto-schedules. Paediatric (PEWS) and obstetric (MEOWS) intervals are explicitly NOT stated as authoritative — the per-point rubrics are paywalled/not encoded (engine marks both provisional), so those are marked needs-CSO-input and the ~30-min MEOWS figure is cited as a published protocol, not a MedSync instruction.

HONESTY ON SEAMS: only urgent-appointment creation (origin='system_urgent', verified in db/schema/scheduling.ts) and care-team notification (notifyTriageOutcome, ALERT_LEVELS=[1,2], verified in lib/triage/notify.ts) are live — and the notification is a department-wide in-app broadcast whose SMS/push transport is a logged no-op stub, so high-acuity suggestions must still prompt a verbal hand-off. Everything else (named pathways, re-vitals timers, virtual stream, routing to unconfigured departments) is pending-intent. The CSO must decide exact intervals/overridability, whether paeds/obstetric ship at launch and on what footing, the down-disposition gates (where under-triage harm concentrates), the responder-cadre vocabulary, and ratify the category-level over-reach boundaries (ideally backed by a build-time guard rejecting dose/volume tokens) before go-live.

## §1 — Governing rules (from addendum Part 0)

- **Suggestions, not orders.** Every row carries an explicit clinician **accept / modify / dismiss** that is recorded; the system never auto-acts.
- **Guideline-derived + transparent.** Every suggestion cites its guideline + threshold; nothing fabricated — if a finding has no traceable basis, **no row is written**.
- **General, not prescriptive.** Category-level only. **No** drug doses, fluid volumes, or definitive-treatment specifics. 38 over-reach risks are flagged per-category below for CSO ratification (recommend a build-time guard rejecting dose/volume tokens).
- **Bias to over-escalation; never under.** Borderline findings err toward more monitoring / earlier review.
- **Honest seams.** Only **urgent-appointment creation** and **care-team notification** are live today (and the notification's SMS/push transport is a logged no-op stub — a department-wide in-app broadcast, _not_ a guaranteed senior page). Everything else is **pending-intent**: recorded, never dropped, executed by the later workflow build.

## §2 — Finding → recommendation mapping (87 rules across 7 categories)

Legend: 🟢 live seam · 🟡 pending-intent · ⚠️ needs-CSO-input (paeds/obstetric rubrics paywalled / cadre vocabulary hospital-specific).

### Disposition / where the patient goes `disposition`

- **Trigger:** result.lifeThreat === true (Step-0 life-threat screen fired: airwayCompromise / absentAgonalBreathing / cardiacArrestNoPulse / unresponsive / activeSeizure / exsanguinatingHaemorrhage). Engine forces level=1, colour='red', disposition='Resus', scoring bypassed; lifeThreatReasons[] populated.
  - **Suggest:** Suggest immediate placement in the RESUS area / resuscitation bay (highest-acuity bed). Highest-priority disposition — no waiting room.
  - **Why:** A positive life-threat screen means immediate life-saving intervention is needed; the patient must be in a fully-equipped resus space with the team already present, not triaged into a queue.
  - **Source:** 5-tier acuity model L1 Resus (ACUITY_TIERS, targetMinutes=0, research doc §1); ESI v5 Level 1 = immediate resuscitation (ENA 2023); SATS Red = seen immediately (EMSSA 2012).
  - **Seam:** 🟢 live · **Confidence:** high

- **Trigger:** result.level === 2 (High-acuity / orange) arrived at via the worse-of: NEWS2 total ≥7 (news2ToAcuity → 2), OR esiV5Acuity===2 from a non-empty dangerVitals[] (adult HR>100 / RR>20 / SpO2<92), OR a fired discriminator with minAcuity===2. disposition='High-acuity'.
  - **Suggest:** Suggest placement in the HIGH-ACUITY / monitored area (majors / resus-adjacent monitored bed) for time-critical review — not the general waiting area.
  - **Why:** Level 2 patients are unstable or potentially unstable and at high risk of deterioration; they need a monitored space and to be seen well inside the 10-minute target, which a waiting-room disposition cannot guarantee.
  - **Source:** 5-tier model L2 (targetMinutes=10, research doc §1); NEWS2 ≥7 = high clinical risk → urgent/emergency response (RCP 2017); ESI v5 Level 2 = high-risk/emergent (ENA 2023); SATS Orange = <10 min (EMSSA 2012).
  - **Seam:** 🟢 live · **Confidence:** high

- **Trigger:** result.dangerVitals[] is non-empty (esiV5Acuity===2, ESI v5 danger-zone reassess-up) AND this is what drove level to 2 (i.e. the aggregate NEWS2/score alone would have read more reassuring).
  - **Suggest:** Suggest the High-acuity / monitored disposition even though the aggregate score looks borderline — place for monitored review rather than the waiting room. Surface the specific danger vital(s) so the receiving area knows why.
  - **Why:** ESI v5 added the reassess-up rule precisely to stop a single deranged vital being under-triaged into a low-acuity area; the placement must reflect the worst signal, not the average.
  - **Source:** ESI v5 danger-zone vitals reassess UP to minimum Level 2 regardless of aggregate (ENA 2023; engine ESI_V5_ADULT_DANGER HR>100/RR>20/SpO2<92, ESI_V5_DANGER_FLOOR_LEVEL=2).
  - **Seam:** 🟢 live · **Confidence:** high

- **Trigger:** result.level === 3 (Standard / yellow): NEWS2 total 5–6 (→ acuity 3), OR news2.hasSingleParameterThree===true with total <5 (single-parameter-3 'red score' → at least Yellow with review), OR a discriminator with minAcuity===3. disposition='Standard'.
  - **Suggest:** Suggest placement in the STANDARD assessment area (a clinical assessment bed/cubicle, prompt clinician review), not fast-track and not a long waiting queue.
  - **Why:** Medium-risk and single-deranged-parameter patients are urgent-but-stable; they need timely clinician assessment within the standard target but do not need a monitored resus bed.
  - **Source:** 5-tier model L3 (targetMinutes=60, research doc §1); NEWS2 5–6 = medium risk → urgent response, single-parameter 3 → review (RCP 2017); SATS Yellow = <60 min (EMSSA 2012).
  - **Seam:** 🟡 pending-intent · **Confidence:** high

- **Trigger:** result.incompleteVitals === true (esiV5: one or more of HR/RR/SpO2 missing for a non-L1/L2 patient → engine floors to L3 and lists missingRequiredVitals[]). result.provisional===true. The disposition shown is 'Standard' but is a floored default, NOT a reassuring assessment.
  - **Suggest:** Do NOT suggest a reassuring low-acuity disposition (fast-track / virtual). Hold at the STANDARD area and prompt to obtain the missing HR/RR/SpO2 before any down-disposition. Surface the 'Assessment incomplete' banner alongside the placement suggestion.
  - **Why:** ESI v5 forbids issuing a reassuring level without the mandatory vitals; routing such a patient to fast-track or virtual would be an unsafe down-triage on incomplete data.
  - **Source:** ESI v5 mandatory vitals — HR+RR+SpO2 required for every non-L1/L2 patient; missing → cannot issue reassuring level, floor to L3 (ENA 2023; engine ESI_V5_REQUIRED_VITALS, ESI_V5_INCOMPLETE_FLOOR_LEVEL=3).
  - **Seam:** 🟡 pending-intent · **Confidence:** high

- **Trigger:** result.level === 4 (Less-urgent / green), disposition='Standard / fast-track', AND result.incompleteVitals===false AND result.provisional===false AND no fired discriminators (firedDiscriminators[] empty).
  - **Suggest:** Suggest a STANDARD / FAST-TRACK disposition (minor / ambulatory clinical stream). Down-routing below standard is permissible here only because vitals are complete and nothing fired.
  - **Why:** Genuinely less-urgent, fully-assessed patients can be safely streamed to fast-track within the 2-hour target, freeing acute capacity — but only when no red-flag or vital gap is present.
  - **Source:** 5-tier model L4 (targetMinutes=120, research doc §1); NEWS2 0–4 = low risk → routine/ward response (RCP 2017); SATS Green = routine (EMSSA 2012).
  - **Seam:** 🟡 pending-intent · **Confidence:** high

- **Trigger:** result.level === 5 (Non-urgent / blue), disposition='Fast-track', AND result.incompleteVitals===false AND result.provisional===false AND firedDiscriminators[] empty AND dangerVitals[] empty.
  - **Suggest:** Suggest a FAST-TRACK or VIRTUAL / primary-care-stream disposition (non-urgent ambulatory). Eligible for the virtual stream only when complete-vitals + no-flags conditions hold.
  - **Why:** Non-urgent presentations with complete vitals and no red flags are appropriate for the lowest-acuity stream, including virtual where the workflow exists; this is the only level where virtual is suggested.
  - **Source:** 5-tier model L5 (targetMinutes=240, research doc §1); NEWS2 0–4 low risk (RCP 2017); SATS Green/routine ≤240 min (EMSSA 2012).
  - **Seam:** 🟡 pending-intent · **Confidence:** high

- **Trigger:** result.trendEscalated === true (input.adjustments.priorLevel more acute than the snapshot level → engine escalates level to the prior). Disposition reflects the escalated (more acute) level.
  - **Suggest:** Suggest the disposition for the ESCALATED (more acute) level, not the snapshot. Place per the higher acuity and flag the worsening trend to the receiving area.
  - **Why:** A worsening longitudinal trajectory is itself a deterioration signal; biasing the placement to the more acute reading avoids under-triage on a single reassuring snapshot.
  - **Source:** Engine Step-5 trend escalation (never auto-improve; research doc §9). Aligned with NEWS2 trend/trajectory monitoring intent (RCP 2017) and ESI v5 undertriage-avoidance emphasis (ENA 2023).
  - **Seam:** 🟡 pending-intent · **Confidence:** high

- **Trigger:** result.ruleset === 'obstetric_meows' (routed because pregnancy='pregnant' or 'postpartum_6wk'). result.provisional===true (no auto MEOWS score) AND/OR an obstetric red-flag discriminator fired (e.g. SBP≥160/DBP≥110, eclampsia, heavy PV bleed, reduced fetal movements) giving a high discriminatorAcuity.
  - **Suggest:** Suggest placement in / direct routing to the OBSTETRIC assessment area (maternity triage / labour ward assessment) rather than the general adult stream, at the acuity the engine assigned. If any obstetric red-flag fired, suggest the high-acuity obstetric disposition.
  - **Why:** Pregnant and recently-postpartum patients have different physiology and a dedicated escalation pathway; a single red MEOWS trigger or red-flag warrants urgent obstetric assessment in the right unit, biased up because the per-parameter MEOWS rubric is not encoded.
  - **Source:** Population routing R3 → obstetric MEOWS (engine routing.ts); MEOWS single-red OR two-yellow → urgent assessment/escalation (RCOG/MBRRACE; UK MEOWS). Per-parameter colour bands vary by trust and are NOT encoded → provisional.
  - **Seam:** 🟡 pending-intent · **Confidence:** ⚠️ needs-CSO-input

- **Trigger:** result.ruleset === 'paediatric_pews' (age <16, routing R3). result.provisional===true (no auto PEWS numeric score) — disposition derives only from Step-0, fired discriminators, derived metrics, else the bias-up provisional Yellow default (level=3 when no signal fired).
  - **Suggest:** Suggest placement in / routing to the PAEDIATRIC assessment area at the engine-assigned acuity, and prompt manual PEWS scoring before any down-disposition. Treat the disposition as provisional pending the manual PEWS chart; do not auto-route a child to fast-track/virtual on the un-scored default.
  - **Why:** No openly-available national PEWS per-point rubric is encoded, so the numeric acuity is not auto-computed; routing to the paediatric area at a biased-up acuity and requiring manual scoring avoids fabricating a reassuring placement.
  - **Source:** Population routing R3 → paediatric PEWS (engine routing.ts, <16); NHS National PEWS v3 (2023) supersedes Brighton but per-point scoring not open; paeds danger-zone numbers in paid ENA handbook → provisional (triage-v2 proposal §1, scope note engine.ts).
  - **Seam:** 🟡 pending-intent · **Confidence:** ⚠️ needs-CSO-input

- **Trigger:** result.level ∈ {1,2} (any high-acuity disposition: Resus or High-acuity), at the point the triage record is saved with a known hospitalId + departmentId.
  - **Suggest:** On a high-acuity disposition, the LIVE care-team notification seam fires automatically (in-app alert to active clinical staff at the receiving department) so the placement is actioned, not just recorded. For these patients an urgent appointment may also be created via the live scheduling seam to secure clinician time.
  - **Why:** A disposition is only safe if the receiving area is actually alerted; MedSync already notifies the receiving team for L1/L2, closing the loop between 'where the patient goes' and 'who is told'.
  - **Source:** MedSync live seams: notifyTriageOutcome fires for ALERT_LEVELS [1,2] (lib/triage/notify.ts); system-propose-urgent-appointment creates origin='system_urgent', priority='urgent' (live scheduling seam). Acuity per RCP 2017 / ESI v5 high-risk definitions.
  - **Seam:** 🟢 live · **Confidence:** high

  **⚠️ Over-reach risks flagged in this category:**
  - NONE of these disposition rules prescribe drugs, doses, or fluids — disposition is purely placement/where-the-patient-goes, so the prescribing-over-reach surface is inherently low. The watch-points are different: (1) The 'Resus' disposition implies a treatment-capable space; the suggestion must stay 'place in resus area', never specify the interventions performed there (those belong to categories 2/7 and to clinician scope). (2) Obstetric and paediatric dispositions are marked needs-CSO-input because the per-parameter MEOWS/PEWS rubrics are NOT encoded in the engine (paywalled / trust-variable) — the engine biases up and routes to the specialty area, but the exact acuity for these populations is provisional and the CSO must confirm the routing thresholds rather than the system asserting a definitive level. (3) The L4 (fast-track) and L5 (virtual/non-urgent) DOWN-dispositions are the only rules that route a patient AWAY from acute care; they are gated on incompleteVitals===false AND provisional===false AND no fired discriminators/dangerVitals to prevent unsafe under-triage — the CSO should confirm these down-routing gates are acceptable, since a down-disposition is where under-triage harm concentrates. (4) Virtual-stream eligibility (L5) assumes a virtual workflow exists; today it is pending-intent, so the suggestion must not imply the patient has actually been routed to a live virtual service.

### Immediate general measures (category-level, no doses) `immediate_measure`

- **Trigger:** Step-0 life-threat: lifeThreatFlags.airwayCompromise === true OR absentAgonalBreathing OR cardiacArrestNoPulse OR unresponsive (TriageResult.lifeThreat === true with the corresponding lifeThreatReasons / fired discriminator codes airway_compromise, absent_agonal_breathing, cardiac_arrest_no_pulse, unresponsive). level === 1 / colour red.
  - **Suggest:** Suggest immediate airway support measures category (open/position airway, suction, adjuncts, prepare for assisted ventilation) and call for resuscitation help. No specific airway device, drug, or RSI agent named.
  - **Why:** A compromised or absent airway is the first reversible killer; airway-first is the universal resuscitation sequence and must precede everything else.
  - **Source:** Research-doc §9 Step 0 (ESI-A / SATS emergency signs) -> Level 1 Red; ESI v5 Decision A 'immediate life-saving intervention' (ENA 2023); ABCDE resuscitation sequence.
  - **Seam:** 🟡 pending-intent · **Confidence:** high

- **Trigger:** Hypoxia, danger-zone: dangerVitals contains 'SpO₂ <92' (ESI_V5_ADULT_DANGER.SPO2_LT = 92) OR news2.parameters SpO₂ band scores +3 (Scale 1 SpO₂ ≤91) OR fired discriminator spo2_critical_under_90_on_o2.
  - **Suggest:** Suggest the supplemental-oxygen / oxygen-titration measure category and patient positioning to optimise breathing (e.g. sit upright if tolerated). Frame as 'titrate oxygen to the patient's target saturation range'; do NOT name flow rate, device, or FiO2.
  - **Why:** SpO2 <92% is a danger-zone vital and a NEWS2 +3 red score; correcting hypoxaemia is a time-critical reversible measure while the cause is worked up.
  - **Source:** ESI v5 danger-zone SpO₂ <92 (ENA 2023); NEWS2 SpO₂ Scale 1 ≤91 = +3 (RCP 2017); BTS emergency oxygen — target 94–98% (or 88–92% if hypercapnic risk). Device/flow choice is BTS clinician scope, not specified here.
  - **Seam:** 🟡 pending-intent · **Confidence:** high

- **Trigger:** Hypoxia in a clinician-enabled Scale-2 patient: context.spo2Scale2Enabled === true / news2.spo2Scale === 'scale2' (confirmed hypercapnic/COPD), with SpO₂ in the +1/+2/+3 Scale-2 bands.
  - **Suggest:** Suggest controlled / target-range oxygen measure category and prompt the clinician that this patient is on the hypercapnic (88–92%) target, flagging over-oxygenation risk. No flow rate or device named.
  - **Why:** In confirmed hypercapnic respiratory failure, uncontrolled high-flow oxygen can precipitate CO2 narcosis; the measure is controlled oxygen toward the 88–92% target, which differs from the default patient.
  - **Source:** NEWS2 SpO₂ Scale 2 / hypercapnic target 88–92 (RCP 2017, research-doc §3); BTS oxygen guideline 88–92% target for hypercapnic-risk patients.
  - **Seam:** 🟡 pending-intent · **Confidence:** high

- **Trigger:** Hypoglycaemia: derived.glucoseFlag === 'hypoglycaemia' (constants GLUCOSE.HYPO_LT, bloodGlucose <3.0 mmol/L) OR fired discriminator glucose_critical_under_3.
  - **Suggest:** Suggest the glucose-correction prompt category, gated on consciousness/swallow safety: if the patient is alert (ACVPU 'A') and can protect the airway, prompt oral glucose correction; if consciousness is impaired (ACVPU not 'A'), suggest NOT giving oral intake (aspiration risk), airway-safe positioning, and escalate for parenteral correction. No glucose grams, dextrose concentration/volume, or glucagon dose stated.
  - **Why:** Hypoglycaemia mimics stroke/altered mentation and is instantly reversible; correcting it is a high-yield immediate measure, but the route must be gated on the ability to swallow to avoid aspiration.
  - **Source:** Research-doc §6/§11: glucose <3.0 mmol/L = immediate intervention; ADA — oral glucose first-line for conscious hypoglycaemia, no oral intake if airway not protected (recovery/lateral position if unconscious).
  - **Seam:** 🟡 pending-intent · **Confidence:** high

- **Trigger:** High-acuity overall: level <= 2 (resus/high-acuity) via any path — news2.total >= 7, esiV5Acuity 2 from a danger vital, a fired L1/L2 discriminator, or shockIndexFlag 'shock'/'occult_shock'.
  - **Suggest:** Suggest the 'establish IV access + send baseline bloods' measure category as a general high-acuity preparedness step. No fluid type, fluid volume, cannula gauge, or specific assay list mandated (specific bloods belong to Investigations §7).
  - **Why:** High-acuity patients predictably need vascular access and baseline bloods; preparing access early avoids delay if deterioration or treatment follows.
  - **Source:** ESI v5 high-acuity resourcing (L1/L2 expect IV/labs, ENA 2023); NEWS2 ≥7 high-risk band -> emergency response (RCP 2017); SSC Hour-1 sequencing favours early access in suspected sepsis.
  - **Seam:** 🟡 pending-intent · **Confidence:** high

- **Trigger:** Occult/overt shock: derived.shockIndexFlag === 'occult_shock' (SI >0.9) or 'shock' (SI >=1.0); and/or derived.pulsePressureFlag === 'narrow' (PP <25% SBP); and/or fired discriminator shock_index_high.
  - **Suggest:** Suggest the early-perfusion-support preparedness category: IV access + bloods, continuous monitoring, and lay the patient flat / consider passive leg raise if not contraindicated. Explicitly NO fluid bolus type or volume — fluid resuscitation specifics are clinician scope / later workflow.
  - **Why:** A rising shock index and narrowing pulse pressure signal compensated shock before BP falls; preparing access and monitoring lets the clinician intervene before decompensation, but the engine must not prescribe the fluid itself.
  - **Source:** Research-doc §6: compensated shock (tachycardia + narrowing pulse pressure + tachypnoea with normal SBP) is pre-terminal; SI >0.9 occult shock (constants SHOCK_INDEX).
  - **Seam:** 🟡 pending-intent · **Confidence:** medium

- **Trigger:** Sepsis physiology present: derived.qsofa.score >= 2 with suspected infection (fired discriminator sepsis_suspicion) OR news2.total >= 5 with infection. (Pathway naming itself belongs to §5; this rule is only the immediate measures.)
  - **Suggest:** Suggest the immediate sepsis-supportive measures category: IV access + bloods including lactate, and oxygen-toward-target if hypoxic. Strictly NO antibiotic agent/dose, NO 30 mL/kg or any fluid volume — those are the Hour-1 bundle treatment and are clinician + later-workflow scope.
  - **Why:** Early access and a lactate are the diagnostic/measure half of sepsis care that triage can safely tee up; the therapeutic half (antibiotics, fluids, vasopressors) is explicitly out of scope to avoid prescribing.
  - **Source:** Sepsis-3/qSOFA >=2 (research-doc §5); SSC Hour-1 bundle — measure lactate, obtain blood cultures before antibiotics (measure components only cited; treatment components deliberately excluded).
  - **Seam:** 🟡 pending-intent · **Confidence:** medium

- **Trigger:** Obstetric hypotensive / unwell: ruleset === 'obstetric_meows' (pregnancy 'pregnant' or 'postpartum_6wk') with hypotension (systolicBp low / NEWS2 or MEOWS BP derangement) or general unwell state.
  - **Suggest:** Suggest the obstetric positioning measure: place in left-lateral position (or manual left uterine displacement if supine care is needed) to relieve aortocaval compression, plus IV access + bloods and oxygen-toward-target. No fluid/drug specifics.
  - **Why:** From ~20 weeks, supine position causes aortocaval compression that can cut cardiac output 30–40%; left-lateral positioning is a zero-cost, high-yield immediate measure for a hypotensive/unwell pregnant patient.
  - **Source:** Research-doc §8 MEOWS (obstetric physiology, compensate-then-crash); aortocaval compression / supine hypotensive syndrome — full left-lateral position or manual left uterine displacement (StatPearls; AHA maternal resuscitation).
  - **Seam:** 🟡 pending-intent · **Confidence:** medium

- **Trigger:** Exsanguinating / heavy haemorrhage: lifeThreatFlags.exsanguinatingHaemorrhage === true (fired discriminator exsanguinating_haemorrhage) OR obstetric discriminator obstetric_heavy_pv_bleeding.
  - **Suggest:** Suggest immediate bleeding-control measure category (direct pressure to a compressible external source; for obstetric heavy PV bleeding, prompt urgent obstetric attendance) plus large-bore IV access + bloods including a group-and-save/crossmatch consideration. No tranexamic-acid dose, no fluid/blood-product volumes — major-haemorrhage protocol activation is §5 pathway + later workflow.
  - **Why:** External haemorrhage is reversible by pressure; the immediate measures are control plus access. Activating the major-haemorrhage protocol and choosing products is clinician/protocol scope, so triage only flags and preps.
  - **Source:** Research-doc §9 Step 0 exsanguinating haemorrhage -> Level 1; §8 obstetric heavy PV bleeding red flag; ATLS/major-haemorrhage principle (direct pressure first, early access). Product/drug specifics deliberately excluded.
  - **Seam:** 🟡 pending-intent · **Confidence:** medium

- **Trigger:** Paediatric ruleset: ruleset === 'paediatric_pews' (any sub-rule that would otherwise generate a positioning/oxygen/access immediate measure for a child), including fired paed discriminators (paed_grunting_cyanosis_caprefill etc.). PEWS per-point rubric is provisional in the engine.
  - **Suggest:** Surface the SAME category-level adult measures (oxygen-toward-target for hypoxia, airway-safe positioning, prepare access) but mark the suggestion provisional and route the weighting decision to a clinician. Do NOT state paediatric weight-based anything; no per-kg volumes/doses.
  - **Why:** The general immediate-measure CATEGORIES (oxygen, positioning, access) are population-agnostic and safe to surface, but paediatric thresholds/weightings in the engine are provisional, so the strength of the prompt needs CSO confirmation rather than fabrication.
  - **Source:** Research-doc §7 paediatric (PEWS + age norms; full Brighton PEWS per-point sub-rubric is a CSO data request, noted in lib/triage/scoring/pews.ts header); engine marks paeds provisional.
  - **Seam:** 🟡 pending-intent · **Confidence:** ⚠️ needs-CSO-input

- **Trigger:** Incomplete vitals high-risk: incompleteVitals === true (missingRequiredVitals non-empty; ESI v5 HR/RR/SpO2 missing), engine floored to L3.
  - **Suggest:** Suggest the 'obtain the missing mandatory vitals now' measure as an immediate action, before any reassuring disposition. This is a measurement step, not a treatment, so it carries no dosing risk.
  - **Why:** ESI v5 forbids issuing a reassuring level without HR/RR/SpO2; completing the vital set is itself the safest immediate measure and may unmask a danger-zone reading.
  - **Source:** ESI v5 mandatory vitals — HR/RR/SpO2 required for any patient not L1/L2, reassuring level may not be issued without them (ENA 2023; constants ESI_V5_REQUIRED_VITALS).
  - **Seam:** 🟡 pending-intent · **Confidence:** high

  **⚠️ Over-reach risks flagged in this category:**
  - Hypoglycaemia rule: must stop at 'prompt oral glucose correction (if alert)' / 'escalate for parenteral correction'. If a builder is tempted to add 15g fast-acting carbohydrate, 100 mL 20% dextrose, or 1 mg glucagon, that crosses into dosing and needs CSO sign-off. The 15g 'rule of 15' is well known and is a tempting over-reach — keep it category-level only.
  - High-acuity / shock 'IV access + bloods' rule: the line between teeing up access and ordering a fluid bolus is thin. Any mention of crystalloid type, 30 mL/kg, 250–500 mL bolus, or warmed fluids is over-reach — the SSC Hour-1 fluid/antibiotic/vasopressor components are deliberately excluded and must stay so.
  - Sepsis immediate-measures rule: surfacing 'lactate + blood cultures + access' is the safe measure half, but it sits adjacent to the antibiotic component of the Hour-1 bundle. Naming any antibiotic, or implying 'give antibiotics within the hour', is prescribing and must route to clinician + later workflow.
  - Oxygen rules: 'titrate to target saturation' is safe; specifying a flow rate (e.g. 15 L/min non-rebreather, 2–6 L nasal cannulae) or FiO2 crosses into a prescribed oxygen order (BTS treats oxygen as a drug). Scale-2/hypercapnic patients add risk in the other direction (over-oxygenation) — the prompt must flag the target, not the device.
  - Obstetric positioning rule: left-lateral position is a non-pharmacological measure and low over-reach risk, but it must not silently extend into fluid resuscitation or tocolytic/antihypertensive suggestions for the severe-HTN obstetric case — those are §5 pathway + clinician scope.
  - Haemorrhage rule: 'direct pressure + large-bore access + group-and-save consideration' is safe; tranexamic acid, blood-product ratios (e.g. 1:1:1), or activating-then-specifying the massive transfusion protocol contents is over-reach and belongs to the §5 major-haemorrhage pathway workflow.
  - Paediatric rule is marked needs-CSO-input precisely because surfacing measures at adult strength for a child could imply thresholds the engine does not validate; the safeguard is to keep it category-level and provisional, never weight/age-dosed.

### Monitoring frequency / re-vitals intervals `monitoring`

- **Trigger:** ruleset === 'adult_news2' AND news2.total >= 7 (NEWS2_RISK.HIGH_MIN), OR news2 high-acuity mapping to level <= 2 from score. Engine fields: result.news2.total, result.scoreAcuity.
  - **Suggest:** Suggest CONTINUOUS monitoring of vital signs (re-vitals/re-triage timer at the most frequent setting). Surface as a suggested re-vitals interval the clinician can accept/modify; bias to continuous.
  - **Why:** NEWS2 >=7 is the emergency response threshold — risk of rapid deterioration is high; intermittent obs are not safe at this level.
  - **Source:** NEWS2 / RCP 2017 Chart 4 'Clinical response to the NEWS trigger thresholds' — aggregate score 7 or more (high risk) -> 'Continuous monitoring of vital signs'.
  - **Seam:** 🟡 pending-intent · **Confidence:** high

- **Trigger:** ruleset === 'adult_news2' AND news2.total in [5,6] (NEWS2_RISK.MEDIUM_MIN..MEDIUM_MAX). Engine field: result.news2.total.
  - **Suggest:** Suggest re-vitals at minimum 1-hourly (set a suggested ~60-min re-vitals/re-triage timer); clinician may shorten for any worsening trend.
  - **Why:** NEWS2 5-6 is the urgent (medium-risk) response threshold; minimum hourly observations are needed to catch deterioration early.
  - **Source:** NEWS2 / RCP 2017 Chart 4 — medium risk (aggregate 5-6, urgent response threshold) -> minimum 1 hourly monitoring.
  - **Seam:** 🟡 pending-intent · **Confidence:** high

- **Trigger:** ruleset === 'adult_news2' AND news2.hasSingleParameterThree === true AND news2.total <= 4 (the single-parameter 'red score' with otherwise low aggregate). Engine fields: result.news2.hasSingleParameterThree, result.news2.total.
  - **Suggest:** Suggest re-vitals at minimum 1-hourly (suggested ~60-min re-vitals/re-triage timer) even though the aggregate is low.
  - **Why:** A single parameter scoring 3 is a low-medium-risk red flag that mandates hourly obs regardless of a reassuring aggregate — protects against under-monitoring the isolated extreme.
  - **Source:** NEWS2 / RCP 2017 Chart 4 — score of 3 in a single parameter (low-medium risk) -> minimum 1 hourly monitoring + urgent review.
  - **Seam:** 🟡 pending-intent · **Confidence:** high

- **Trigger:** ruleset === 'adult_news2' AND news2.total in [1,4] (NEWS2_RISK.LOW range, 1-4) AND NOT hasSingleParameterThree. Engine field: result.news2.total.
  - **Suggest:** Suggest re-vitals at minimum 4-6 hourly (suggested re-vitals/re-triage timer in the 4-6h band); registered nurse to decide whether to increase frequency.
  - **Why:** Low NEWS2 aggregate (1-4) — routine ward cadence with a nurse-led decision on whether monitoring frequency needs to step up.
  - **Source:** NEWS2 / RCP 2017 Chart 4 — low risk (aggregate 1-4) -> minimum 4-6 hourly monitoring.
  - **Seam:** 🟡 pending-intent · **Confidence:** high

- **Trigger:** ruleset === 'adult_news2' AND news2.total === 0 AND NOT hasSingleParameterThree AND NOT provisional. Engine field: result.news2.total, result.provisional.
  - **Suggest:** Suggest re-vitals at minimum 12-hourly (suggested 12h re-vitals/re-triage timer) as the routine baseline cadence.
  - **Why:** NEWS2 0 is the routine-monitoring baseline; longest acceptable interval, still scheduled so the patient is not left unobserved.
  - **Source:** NEWS2 / RCP 2017 Chart 4 — score 0 -> minimum 12 hourly monitoring (routine).
  - **Seam:** 🟡 pending-intent · **Confidence:** high

- **Trigger:** esiV5Acuity present from danger-zone reassess-up: dangerVitals[] non-empty (ESI_V5_ADULT_DANGER: pulse>100, resp>20, SpO2<92) flooring acuity to L2. Engine fields: result.dangerVitals, result.esiV5Acuity, ESI_V5_DANGER_FLOOR_LEVEL.
  - **Suggest:** Suggest HR, RR and BP re-vitals at minimum 1-hourly (or more frequently per nursing judgement) until the danger-zone parameter stabilises; set the suggested timer to <=60 min.
  - **Why:** An ESI v5 danger-zone vital signals occult instability even when the aggregate looks reassuring; hourly obs until stabilised is the ESI v5 floor.
  - **Source:** ESI v5 (ENA 2023) Decision Point D — Level 2/3 patients with any 'danger-zone' vital sign have HR, RR and BP documented 'every 1 hour or more frequently per nursing judgement until stabilized'.
  - **Seam:** 🟡 pending-intent · **Confidence:** high

- **Trigger:** level <= 2 (L1 resus / L2 high-acuity) from ANY pathway — life-threat flag, NEWS2>=7, fired L1/L2 discriminator, or danger-zone reassess-up. Engine fields: result.level, result.lifeThreat.
  - **Suggest:** Suggest continuous monitoring / minimum 1-hourly re-vitals as the default cadence for any L1-L2 outcome; re-triage timer set to the most frequent band. Bias to continuous when in doubt.
  - **Why:** High-acuity placement implies time-critical instability; the disposition itself, not just the numeric score, justifies the tightest monitoring cadence. Bias to over-escalation.
  - **Source:** 5-tier acuity model (research doc §1: L1 immediate, L2 high-risk/time-critical, target 0-10 min) + SATS target times (Red immediate, Orange <10 min) + NEWS2 Chart 4 high-risk continuous monitoring — convergent.
  - **Seam:** 🟡 pending-intent · **Confidence:** high

- **Trigger:** derived.qsofa.score >= 2 (QSOFA.POSITIVE_THRESHOLD) WITH suspected infection, OR NEWS2>=5 with suspected infection (sepsis overlay positive). Engine fields: result.derived.qsofa.score, result.news2.total.
  - **Suggest:** Suggest frequent/continuous re-vitals (at least the matching NEWS2 cadence: hourly for NEWS2>=5, continuous for >=7) with ongoing reassessment of perfusion; set suggested re-vitals timer to <=60 min. Do NOT specify lactate-clearance targets or fluid endpoints here.
  - **Why:** Sepsis/septic shock demands frequent ongoing reassessment to avoid under- or over-resuscitation; monitoring cadence should not be looser than the underlying NEWS2 band.
  - **Source:** Sepsis-3 (qSOFA overlay) + Surviving Sepsis Campaign 2021 — 'perform frequent, ongoing reassessment and closely monitor patients'; cadence floored by NEWS2 Chart 4 band.
  - **Seam:** 🟡 pending-intent · **Confidence:** medium

- **Trigger:** incompleteVitals === true (ESI v5 mandatory vital HR/RR/SpO2 missing) OR news2.provisional === true (any scored vital missing). Engine fields: result.incompleteVitals, result.missingRequiredVitals, result.news2.provisional, result.provisional.
  - **Suggest:** Suggest a SHORT re-vitals interval to complete/repeat the missing observations promptly (suggested timer biased to the next-tighter band; treat as if more acute until vitals complete). Flag that the cadence is provisional.
  - **Why:** A missing required vital means the score is provisional and may understate acuity; bias to a tighter interval so the gap is closed rather than treated as normal. Under-triage kills.
  - **Source:** ESI v5 (ENA 2023) mandatory-vitals rule (HR/RR/SpO2 required; reassuring level may not be issued without them) + research doc §10 provisional-score rule.
  - **Seam:** 🟡 pending-intent · **Confidence:** high

- **Trigger:** trendEscalated === true (priorLevel worse-than-current trend escalated acuity) OR re-triage of an already-triaged patient (worklist priorLevel set). Engine fields: result.trendEscalated, worklist priorLevel.
  - **Suggest:** Suggest tightening the re-vitals interval to the next-more-frequent band versus the band the current score alone would give; keep the patient on a re-triage timer rather than discharging the cadence.
  - **Why:** A worsening trend is itself an escalation trigger; monitoring frequency should rise with trajectory, not just absolute score.
  - **Source:** NEWS2 / RCP 2017 (escalation on trend / clinical concern) + research doc §5 trend-escalation; 5-tier re-triage affordance (worklist).
  - **Seam:** 🟡 pending-intent · **Confidence:** medium

- **Trigger:** ruleset === 'paediatric_pews' AND high PEWS / any out-of-range age-band vital flagged (PAED_AGE_BANDS) — engine flags out-of-range vitals but does NOT compute the full Brighton per-point sub-rubric. Engine fields: result.ruleset, result.flags, result.provisional.
  - **Suggest:** Suggest increasing re-vitals frequency and senior paediatric review for any abnormal/high PEWS; treat the exact interval (e.g. continuous vs hourly) as clinician-set on the age-appropriate PEWS chart. Mark cadence provisional.
  - **Why:** National PEWS escalates by increasing frequency of obs + senior review at higher scores, but MedSync does not hold the validated per-point thresholds, so the precise interval must be confirmed against the chart.
  - **Source:** National PEWS (NHS England, Nov 2023) — high score => increase frequency of vital-signs measurement + escalate to senior staff/ICU; exact per-point rubric not encoded (engine provisional).
  - **Seam:** 🟡 pending-intent · **Confidence:** ⚠️ needs-CSO-input

- **Trigger:** ruleset === 'obstetric_meows' AND >=1 red trigger OR >=2 yellow triggers (MEOWS high-risk) — engine flags obstetric abnormal vitals but does not hold the validated MEOWS per-point chart. Engine fields: result.ruleset, result.flags, result.provisional.
  - **Suggest:** Suggest rescoring/re-vitals at a short interval (literature commonly ~30 min) with urgent obstetric review for any red or multiple-yellow trigger; treat the precise interval as clinician/chart-set. Mark cadence provisional.
  - **Why:** MEOWS escalates monitoring frequency sharply on red/multiple-yellow triggers, but MEOWS lacks a single national standard and MedSync does not encode the validated thresholds — interval must be confirmed.
  - **Source:** MEOWS (modified obstetric early warning) — red or multiple-yellow trigger => high-risk, frequent rescoring (~30 min in published protocols) + urgent obstetric escalation; no single validated national rubric (engine provisional).
  - **Seam:** 🟡 pending-intent · **Confidence:** ⚠️ needs-CSO-input

  **⚠️ Over-reach risks flagged in this category:**
  - Sepsis monitoring rule (qSOFA>=2 / NEWS2>=5 + infection): keep it to 'frequent/continuous reassessment' cadence only. Do NOT let it acquire lactate-clearance targets, fluid-bolus volumes, or vasopressor endpoints — those are dosing/treatment specifics belonging to a later workflow and to clinician scope.
  - ESI v5 danger-zone rule says 'every 1 hour or more frequently per nursing judgement' — surface the interval as a SUGGESTION the clinician confirms, not an enforced/auto-set order, to avoid prescribing a monitoring regimen the engine cannot guarantee is staffable.
  - PEWS/MEOWS exact intervals (continuous vs hourly vs 30-min) are NOT in the engine's encoded thresholds (paeds/obstetric are provisional, per-point rubrics paywalled/uncertain). Stating a specific paediatric/obstetric interval as authoritative would fabricate a threshold — kept at needs-CSO-input; the ~30-min MEOWS figure is cited as 'published protocol', not as a MedSync-issued instruction.
  - All re-vitals timers are SUGGESTIONS only — nothing auto-schedules or auto-reschedules a patient; clinician accepts/modifies/dismisses. An automatic timer that silently re-queues without clinician confirmation would cross from suggestion into directing care.
  - Provisional/incomplete-vitals 'tighten the interval' rule must not be presented as a definitive shorter regimen — it is a prompt to complete missing obs, biased up; over-stating it as a fixed order risks over-reach on staffing/workflow the engine doesn't control.

### Escalation / who to call (cadre-aware) `escalation`

- **Trigger:** result.lifeThreat === true (Step-0 life threat: any lifeThreatReasons / fired minAcuity:1 codes — airway_compromise, absent_agonal_breathing, cardiac_arrest_no_pulse, unresponsive, active_seizure, exsanguinating_haemorrhage; or SpO2<90% on O2; or glucose<3.0) → level === 1, disposition 'Resus'
  - **Suggest:** Suggest IMMEDIATE summons of the resuscitation / arrest team and the most senior clinician available now, including someone with airway-management competence. This is a 'call now, do not wait for a score' escalation. Clinician confirms the call is placed.
  - **Why:** A life-threat finding means the patient may die in minutes without a senior, airway-capable responder at the bedside; bias to over-escalation — the cost of an unnecessary resus call is far lower than a delayed one.
  - **Source:** NEWS2/RCP 2017 (highest band → 'emergency response... critical care skills including airway management') generalised to the engine's Step-0 life-threat bypass; SATS Red = 'seen immediately'; ESI v5 (ENA 2023) Level 1 = requires immediate life-saving intervention / physician at bedside.
  - **Seam:** 🟢 live · **Confidence:** high

- **Trigger:** result.level === 1 (any path: life-threat OR scoreAcuity 1 OR discriminatorAcuity 1 OR esiV5Acuity 1), disposition 'Resus', colour red, targetMinutes 0
  - **Suggest:** Suggest emergency-tier escalation: notify the senior decision-maker / critical-care-capable responder for the department immediately. A care-team RED (Level 1) notification already fires to on-department clinical staff; surface a prompt to confirm a senior/critical-care responder specifically has been called (the live alert is broadcast, not cadre-targeted).
  - **Why:** Level 1 is the most acute tier; RCP's top band explicitly requires a responder with critical-care/airway skills, not just any clinician. The current notification reaches all clinical cadres but does not guarantee the right seniority is summoned — so prompt the clinician to close that gap.
  - **Source:** NEWS2/RCP 2017 high-risk band (aggregate >=7 → emergency response, critical-care competencies); SATS Red 'immediately'; ESI v5 Level 1. Engine field result.level / DISPOSITION[1]='Resus'.
  - **Seam:** 🟢 live · **Confidence:** high

- **Trigger:** news2.total >= 7 (NEWS2 high-risk band; engine maps via news2ToAcuity → typically level 1-2)
  - **Suggest:** Suggest URGENT/EMERGENCY escalation to a senior clinician AND a critical-care-capable team (e.g. ICU outreach / med reg / critical-care). Recommend the responder cadre be senior, not junior. Continuous monitoring concurrently.
  - **Why:** NEWS2 >=7 is the RCP high-risk threshold for serious acute deterioration; the named response is an emergency response by a team including critical-care/airway skills. Calling juniors only would under-escalate.
  - **Source:** NEWS2/RCP 2017: aggregate score >=7 = HIGH risk → 'urgent or emergency response... staff with critical care skills, including airway management.' Engine field news2.total.
  - **Seam:** 🟢 live · **Confidence:** high

- **Trigger:** news2.total in 5-6 (NEWS2 medium-risk band) OR news2.hasSingleParameterThree === true (any single parameter scored +3, even if aggregate <5)
  - **Suggest:** Suggest URGENT escalation to a clinician/team competent in assessing acutely-ill patients (e.g. the responsible doctor / senior nurse / med reg) for prompt bedside review. The single-parameter-3 case warrants the same urgent review even when the total looks reassuring.
  - **Why:** NEWS2 5-6 is the RCP medium-risk 'key threshold' for urgent clinical response; a single +3 parameter independently triggers urgent review regardless of aggregate. Treating a single-3 as low-risk because the total is <5 is a classic under-escalation trap.
  - **Source:** NEWS2/RCP 2017: aggregate 5-6 = MEDIUM risk → urgent review by competent clinician/team; single-parameter score of 3 → urgent response regardless of aggregate. Engine fields news2.total, news2.hasSingleParameterThree.
  - **Seam:** 🟡 pending-intent · **Confidence:** high

- **Trigger:** result.level === 2 (high-acuity from any source: scoreAcuity/discriminatorAcuity/esiV5Acuity 2, e.g. fired cardiac_chest_pain, focal_neuro_deficit, sepsis_suspicion, severe_resp_distress, shock_index_high), disposition 'High-acuity', colour orange, targetMinutes 10
  - **Suggest:** Suggest prompt escalation to the responsible senior clinician for time-critical review within the high-acuity window. A care-team ORANGE (Level 2) notification already fires to on-department clinical staff; surface a prompt to confirm the appropriate senior/decision-maker has acknowledged.
  - **Why:** ESI Level 2 patients are high-risk for decompensation and must be placed and reviewed rapidly; the 10-minute target means escalation cannot wait for routine flow. Bias to ensuring a senior sees them quickly.
  - **Source:** ESI v5 (ENA 2023) Level 2 = high risk, rapid placement/treatment; SATS Orange (very urgent) = seen <10 min. Engine field result.level / DISPOSITION[2]='High-acuity'; ACUITY_TIERS L2 targetMinutes=10.
  - **Seam:** 🟢 live · **Confidence:** high

- **Trigger:** result.derived.qsofa.score >= 2 AND an infection source present (fired sepsis_suspicion discriminator, minAcuity:2) — OR news2.total >= 5 with infection source
  - **Suggest:** Suggest urgent escalation to a senior clinician for sepsis assessment and activation of the sepsis review pathway (pathway flag handled separately). Recommend the responder be senior/decision-making cadre given time-critical antimicrobial windows.
  - **Why:** qSOFA >=2 with infection, or NEWS2 >=5 with infection, identifies probable sepsis where senior review and early treatment decisions reduce mortality. qSOFA is an OVERLAY/prompt (Sepsis-3), NOT a standalone screen — SSC 2021 recommends against qSOFA as the sole screen — so it should escalate, never reassure.
  - **Source:** Sepsis-3 (2016) qSOFA >=2 prompts evaluation for organ dysfunction; Surviving Sepsis Campaign 2021 (use NEWS/MEWS, not qSOFA alone, for screening); NEWS2/RCP 2017 >=5 urgent response. Engine fields derived.qsofa.score, firedDiscriminators[sepsis_suspicion], news2.total.
  - **Seam:** 🟡 pending-intent · **Confidence:** high

- **Trigger:** ruleset === 'obstetric_meows' AND a minAcuity:1 obstetric red-flag fired (obstetric_severe_htn [SBP>=160 or DBP>=110], obstetric_heavy_pv_bleeding, active_seizure[eclampsia]) — i.e. a single MEOWS 'red'
  - **Suggest:** Suggest IMMEDIATE escalation to the obstetric emergency team (senior obstetrician + midwife-in-charge; anaesthetics/critical-care as locally configured). Bypasses routine cadence — treat as an obstetric emergency call.
  - **Why:** A single MEOWS red trigger is highly sensitive for needing emergency obstetric/ICU intervention; severe hypertension and eclampsia are time-critical for the mother. Obstetric deterioration is easily under-called on adult charts, so route to obstetrics specifically.
  - **Source:** MEOWS (single red zone = trigger; >=1 red sensitivity ~0.96 for ICU admission). Engine ruleset='obstetric_meows', firedDiscriminators (obstetric_severe_htn minAcuity:1, obstetric_heavy_pv_bleeding minAcuity:1, active_seizure minAcuity:1). NOTE: MEOWS per-point rubric is provisional in the engine.
  - **Seam:** 🟢 live · **Confidence:** ⚠️ needs-CSO-input

- **Trigger:** ruleset === 'obstetric_meows' AND obstetric_preeclampsia_triad fired (headache+visual+epigastric, minAcuity:2) OR reduced_fetal_movements (minAcuity:2) OR a MEOWS 'two-yellow' equivalent (provisional)
  - **Suggest:** Suggest urgent escalation to the obstetric team / senior midwife for prompt review (pre-eclampsia work-up; fetal assessment). Lower than the emergency-call tier but still obstetric-specialty-routed, not general.
  - **Why:** Two yellow MEOWS triggers or a pre-eclampsia symptom triad mark early maternal deterioration needing obstetric eyes promptly; reduced fetal movements needs fetal assessment. Routing to obstetrics avoids the under-recognition that adult-chart triage causes in pregnancy.
  - **Source:** MEOWS (two yellow zones = trigger requiring urgent assessment + surveillance plan). Engine firedDiscriminators (obstetric_preeclampsia_triad minAcuity:2, reduced_fetal_movements minAcuity:2). MEOWS yellow/red rubric is PROVISIONAL in the engine.
  - **Seam:** 🟡 pending-intent · **Confidence:** ⚠️ needs-CSO-input

- **Trigger:** ruleset === 'paediatric_pews' AND a minAcuity:1 paediatric red-flag fired (paed_non_blanching_rash) OR result.level === 1 in a child
  - **Suggest:** Suggest IMMEDIATE escalation to senior paediatrics (registrar/consultant) and the resuscitation team; a non-blanching rash is a meningococcal-sepsis red flag warranting senior paediatric review now.
  - **Why:** Non-blanching rash signals possible meningococcal disease — minutes matter and senior paediatric/critical-care involvement is essential. Children compensate then crash, so bias hard to over-escalation.
  - **Source:** PEWS / national PEWS escalation principle (high/red triggers → escalate to senior staff + consider ICU). Engine ruleset='paediatric_pews', firedDiscriminators (paed_non_blanching_rash minAcuity:1). PEWS per-point rubric NOT computed in engine (scope note).
  - **Seam:** 🟢 live · **Confidence:** ⚠️ needs-CSO-input

- **Trigger:** ruleset === 'paediatric_pews' AND a minAcuity:2 paediatric flag fired (paed_grunting_cyanosis_caprefill, paed_infant_fever [infant <3 months, fever >=38C]) OR result.level === 2 in a child
  - **Suggest:** Suggest urgent escalation to senior paediatrics for prompt review. The febrile infant <3 months specifically warrants senior paediatric assessment rather than standard-flow management.
  - **Why:** Grunting/cyanosis/prolonged cap-refill are respiratory/circulatory danger signs; a fever in an infant <3 months carries high serious-bacterial-infection risk. Both need senior paediatric eyes early, not routine queueing.
  - **Source:** PEWS escalation principle (high score >=3 → escalate to senior staff, increase monitoring, consider ICU). Engine firedDiscriminators (paed_grunting_cyanosis_caprefill minAcuity:2, paed_infant_fever minAcuity:2). PEWS numeric rubric PROVISIONAL/not auto-computed.
  - **Seam:** 🟡 pending-intent · **Confidence:** ⚠️ needs-CSO-input

- **Trigger:** result.dangerVitals non-empty (ESI v5 danger-zone vital reassessed acuity up, esiV5Acuity raised) even when other paths look reassuring
  - **Suggest:** Suggest escalation consistent with the reassessed-up acuity (do NOT escalate to the pre-reassessment, lower level). Surface the danger-vital to the clinician so the escalation cadre matches the worst signal.
  - **Why:** ESI v5's danger-zone rule exists precisely to catch patients who look stable but are not; honouring the reassess-up prevents under-escalation when an aggregate score masks one alarming vital.
  - **Source:** ESI v5 (ENA 2023) mandatory-vitals + danger-zone reassess-up rule. Engine fields result.dangerVitals, result.esiV5Acuity.
  - **Seam:** 🟡 pending-intent · **Confidence:** medium

- **Trigger:** result.incompleteVitals === true (ESI v5: a required vital HR/RR/SpO2 missing → floored to L3) AND/OR result.provisional === true (news2.provisional, missing inputs)
  - **Suggest:** Suggest the escalation be treated as provisional and NOT downgraded on the strength of an incomplete picture: prompt completion of the missing required vitals and re-run before any de-escalation. Flag to the responsible clinician that the level is a floor, not a ceiling.
  - **Why:** A reassuring level computed on missing vitals can falsely under-escalate; ESI v5 floors to L3 and bans a reassuring level when mandatory vitals are absent. Escalation decisions must wait for, or assume the worse of, the gap.
  - **Source:** ESI v5 (ENA 2023) mandatory-vitals rule (no reassuring level without full vitals; floor to L3 + banner). Engine fields result.incompleteVitals, result.missingRequiredVitals, result.provisional, news2.provisional.
  - **Seam:** 🟡 pending-intent · **Confidence:** high

- **Trigger:** result.trendEscalated === true (adjustments.priorLevel more acute than current snapshot → engine escalated to prior)
  - **Suggest:** Suggest escalation at the worse (prior) acuity and prompt a senior review of the trend, since a worsening trajectory across triages can warrant earlier senior involvement than a single snapshot implies.
  - **Why:** The engine never auto-improves on trend; a deteriorating trajectory is an independent escalation signal. Reviewing the patient against their prior state catches slow decompensation that one set of vitals would miss.
  - **Source:** Engine Step-5 trend rule (worsening prior level escalates; never auto-improve). Aligned with early-warning-score principle that trend/trajectory drives escalation. Engine fields result.trendEscalated, adjustments.priorLevel.
  - **Seam:** 🟡 pending-intent · **Confidence:** medium

- **Trigger:** result.baselineApplied === true (clinician-gated baseline temper raised the level number / made less acute) — escalation-de-escalation guardrail
  - **Suggest:** Suggest that any baseline-tempered (less-acute) result still records the original computed level and the temper reason for audit, and that escalation is NEVER tempered below a fired red-flag or life-threat floor (engine already enforces the floor). Surface the temper to the reviewing clinician.
  - **Why:** Baseline adjustment is the one place a human can reduce acuity; making the original signal and reason visible to the escalation recipient prevents a quietly-downgraded escalation from hiding real risk.
  - **Source:** Engine Step-5 baseline temper (may raise level number but never past a fired red-flag/life-threat floor; must carry a reason). Engine fields result.baselineApplied, adjustments.baselineAdjustment.reason.
  - **Seam:** 🟡 pending-intent · **Confidence:** medium

- **Trigger:** Cadre of the triaging user vs computed level (clinical_cosign_policies / resolveTriageAuthority): a lower-authority cadre triages a high-acuity patient, or a cadre lacks authority to set the assigned level
  - **Suggest:** Suggest routing the case for senior co-sign / senior confirmation where the triaging cadre's authority does not cover the computed acuity. This is the 'cadre-aware' core: who is escalated-to should match both the finding AND the seniority gap of who triaged.
  - **Why:** If a junior cadre triages a Level 1-2 patient, the escalation should also bring in a clinician authorised for that acuity; the cosign policy already encodes cadre authority, so the escalation recommendation should leverage it rather than treat all triagers as equal.
  - **Source:** MedSync clinical_cosign_policies / resolveTriageAuthority (cadreCode-based authority). No external guideline sets cadre names; mapping cadre->responder seniority is hospital-configurable. Engine/lib field lib/triage/authority.ts.
  - **Seam:** 🟡 pending-intent · **Confidence:** ⚠️ needs-CSO-input

  **⚠️ Over-reach risks flagged in this category:**
  - Naming a SPECIFIC responder cadre (e.g. 'call the SpR' / 'page anaesthetics' / 'activate ICU outreach') hard-codes a staffing model MedSync cannot know per hospital. Keep suggestions at the level of 'senior clinician / critical-care-capable responder' and let clinical_cosign_policies + hospital config resolve the actual cadre, or it risks prescribing a workflow that does not exist on the ground. Needs-CSO-input on the cadre vocabulary.
  - The sepsis-escalation rule (qSOFA>=2 + infection / NEWS2>=5 + infection) borders the sepsis PATHWAY (category 5) and on time-critical antimicrobial language. Escalation must stop at 'urgent senior review + activate sepsis pathway review' — it must NOT imply antibiotic timing, fluid volumes, or 'give antibiotics within 1 hour', which is prescribing/treatment and a later workflow build.
  - 'Critical care skills including airway management' (RCP language) could be misread as authorising an intervention (intubation). Keep it as a descriptor of WHO to summon, not WHAT to do — the suggestion is to call that competence, never to perform it.
  - The live care-team notification (notifyTriageOutcome, ALERT_LEVELS = L1/L2) is a department-wide broadcast to all clinical cadres, NOT a cadre-targeted page to a senior/critical-care responder. Describing it as 'the senior has been escalated to' would over-state the seam. Honest framing: the alert is live; cadre-specific targeting and pathway-specific recipients are pending-intent. CSO should confirm we do not imply a guaranteed senior acknowledgement that the system does not enforce.
  - Obstetric and paediatric escalation thresholds (MEOWS red/two-yellow, PEWS high score) rest on rubrics the engine marks PROVISIONAL / not auto-computed (scope note in engine.ts). Firing 'obstetric emergency team' or 'senior paeds' off discriminators is defensible and over-escalates safely, but the exact numeric trigger should not be presented as engine-computed. Marked needs-CSO-input; do NOT fabricate per-point MEOWS/PEWS cut-offs.
  - Trend-escalation and baseline-temper rules touch the boundary between 'suggest escalation' and 'override the clinician'. Must remain suggestions surfaced for confirmation; the engine's floor (never temper below a fired red-flag/life-threat) is the safety backstop and should be stated as already-enforced, not as something the recommendation layer newly imposes.

### Pathway flags (sepsis / DKA / stroke / major-haemorrhage / pre-eclampsia) `pathway_flag`

- **Trigger:** Adult ruleset (routing.ruleset = 'adult_news2'); clinician ticked discriminator code 'sepsis_suspicion' (infection source present) AND the engine's conditional gate is met: derived.qsofa.score >= 2 OR news2.total >= 5. Engine fires this exactly via evaluateDiscriminators evalManual('sepsis_suspicion') (minAcuity 2).
  - **Suggest:** Flag the SEPSIS pathway for clinician activation (pathway itself is a later workflow build — flag only). Surface as a named, dismissable pathway prompt alongside the acuity. Do NOT auto-start any bundle; the clinician activates.
  - **Why:** Infection plus physiological derangement at this level is a time-critical 'must-not-miss' — every hour of delayed recognition raises mortality. Surfacing the pathway flag early shortens time to senior review and source-directed care.
  - **Source:** Sepsis-3 / qSOFA (qSOFA>=2 as severity marker) + Surviving Sepsis Campaign 2021 (NEWS2>=5 as the more sensitive early-sepsis screen; SSC 2021 explicitly recommends NEWS2/MEWS/SIRS OVER qSOFA as a sole screening tool). Research doc §5: 'infection symptoms + (qSOFA>=2 OR NEWS2>=5) -> Red/Orange sepsis pathway'. Engine constants QSOFA.POSITIVE_THRESHOLD=2, NEWS2_RISK.MEDIUM_MIN=5.
  - **Seam:** 🟡 pending-intent · **Confidence:** high

- **Trigger:** derived.qsofa.score >= 2 present in the result BUT clinician has NOT ticked 'sepsis_suspicion' (no infection source declared). qSOFA positivity exists in derived metrics independent of the gated discriminator.
  - **Suggest:** Surface a non-blocking SEPSIS-SCREEN PROMPT: 'qSOFA positive — consider infection source; if infection suspected, sepsis pathway applies.' Prompt the clinician to confirm/exclude an infection source. Do NOT flag a confirmed sepsis pathway without the infection criterion.
  - **Why:** qSOFA>=2 is a marker of poor prognosis but is specific-not-sensitive and is NOT a sepsis diagnosis on its own (Sepsis-3). Prompting for an infection source biases to over-escalation while respecting that qSOFA alone does not equal sepsis.
  - **Source:** Sepsis-3 (Singer 2016) — qSOFA is an overlay/severity prompt, not a screen; SSC 2021 advises against qSOFA as a sole screen. Research doc §5 ('use as a red-flag overlay, not a rule-out'). Engine field derived.qsofa.score.
  - **Seam:** 🟡 pending-intent · **Confidence:** high

- **Trigger:** Adult ruleset; news2.total >= 7 (NEWS2 high-risk band) OR news2.hasSingleParameterThree = true, in a patient where infection is plausible/declared. (NEWS2>=7 maps to scoreAcuity 2 via news2ToAcuity.)
  - **Suggest:** Prompt the clinician to consider the SEPSIS pathway / actively screen for infection as part of the high-NEWS2 response. Pathway flag only; recorded for the future sepsis-workflow build.
  - **Why:** NEWS2 was explicitly designed to catch deteriorating sepsis; a high aggregate score should trigger an active infection screen rather than waiting for qSOFA to turn positive. Bias to over-escalation.
  - **Source:** RCP NEWS2 2017 (>=7 = high clinical risk, urgent/emergency response) + SSC 2021 (NEWS2 as preferred screen). Research doc §3/§5. Engine constants NEWS2_RISK.HIGH_MIN=7; News2Result.hasSingleParameterThree.
  - **Seam:** 🟡 pending-intent · **Confidence:** high

- **Trigger:** derived.glucoseFlag = 'hyperglycaemia_dka_screen' (blood glucose > 15.0 mmol/L per GLUCOSE.HYPER_DKA_SCREEN_GT). NOTE: the engine captures glucose ONLY — it does NOT capture ketones or acid-base status.
  - **Suggest:** Surface a DKA-SCREEN PROMPT (not a confirmed DKA flag): 'Glucose >15 — check ketones (capillary/urine) and acid-base; if ketones/acidosis present, DKA pathway applies.' Prompt the missing diagnostic inputs. Pathway itself is a later workflow.
  - **Why:** Hyperglycaemia alone is not DKA; diagnosis requires ketones AND acidosis, which triage vitals do not include. The honest, safe action is to prompt for the missing criteria, not to assert a DKA pathway the data cannot support.
  - **Source:** JBDS 2023 DKA criteria (glucose >11 mmol/L AND capillary ketones >3 / urine ketones >=++ AND venous pH <7.3 or bicarbonate <15). Research doc §6/§11: '>15 mmol/L + ketones/acidosis -> DKA pathway'. Engine field derived.glucoseFlag; constant GLUCOSE.HYPER_DKA_SCREEN_GT=15.
  - **Seam:** 🟡 pending-intent · **Confidence:** high

- **Trigger:** Clinician ticked discriminator 'focal_neuro_deficit' (label 'Focal neuro deficit / suspected stroke', appliesTo 'all', minAcuity 2) — appears in firedDiscriminators / discriminatorAcuity.
  - **Suggest:** Flag the STROKE pathway for clinician activation and PROMPT to record time of symptom onset / last-known-well (time-critical gate). Suggest urgent neuro-imaging consideration as part of the pathway. Pathway is a later workflow; flag + onset-time prompt only. Also prompt to check glucose (hypoglycaemia is a stroke mimic).
  - **Why:** Suspected stroke is time-critical: thrombolysis is limited to ~4.5h and thrombectomy to a longer perfusion-imaging-selected window, so onset time decides eligibility. Capturing onset at triage and flagging the pathway protects the door-to-needle target. Glucose check guards against a reversible mimic.
  - **Source:** AHA/ASA acute stroke guidelines (IV thrombolysis window <=4.5h; door-to-CT <=25 min, door-to-needle <=60 min; perfusion-imaging thrombectomy up to ~9h). Research doc §6 (hypoglycaemia mimics stroke). Engine discriminator code 'focal_neuro_deficit'.
  - **Seam:** 🟡 pending-intent · **Confidence:** high

- **Trigger:** Step-0 life-threat: lifeThreatFlags.exsanguinatingHaemorrhage = true (discriminator 'exsanguinating_haemorrhage', lifeThreat, minAcuity 1) -> result.lifeThreat = true, level 1, scoring bypassed. lifeThreatReasons contains 'Exsanguinating / uncontrolled haemorrhage'.
  - **Suggest:** Flag the MAJOR-HAEMORRHAGE pathway for immediate clinician activation. Surface alongside the Level 1 / resus disposition. Pathway (massive-transfusion activation) is a later workflow — flag only; do NOT specify transfusion ratios, products, or volumes.
  - **Why:** Exsanguinating haemorrhage is an immediate life threat; under-activation risks preventable exsanguination and each minute of delay to product administration raises mortality. The flag mirrors the Level 1 bypass the engine already issues.
  - **Source:** Major Haemorrhage Protocol / massive transfusion literature (activation criteria; delay-to-product mortality). Research doc §9 Step 0. Engine field lifeThreatFlags.exsanguinatingHaemorrhage; discriminator 'exsanguinating_haemorrhage'.
  - **Seam:** 🟡 pending-intent · **Confidence:** high

- **Trigger:** Obstetric ruleset (routing.ruleset = 'obstetric_meows'); clinician ticked 'obstetric_heavy_pv_bleeding' (label 'Heavy PV bleeding', minAcuity 1) -> appears in firedDiscriminators, discriminatorAcuity = 1.
  - **Suggest:** Flag the OBSTETRIC MAJOR-HAEMORRHAGE pathway (PPH / abruption / praevia) for clinician activation AND trigger obstetric-emergency escalation. Pathway is a later workflow — flag only; no product/volume specifics.
  - **Why:** Heavy PV bleeding in a pregnant/recently-pregnant patient is a must-not-miss obstetric emergency that the engine already floors to minimum acuity 1; surfacing the named pathway aligns the response with that floor.
  - **Source:** MEOWS obstetric red-flags (research doc §8: 'heavy PV bleeding (PPH/abruption/placenta praevia)'). Engine discriminator 'obstetric_heavy_pv_bleeding' (minAcuity 1).
  - **Seam:** 🟡 pending-intent · **Confidence:** high

- **Trigger:** Adult ruleset; derived.shockIndexFlag = 'shock' (Shock Index >= 1.0, SHOCK_INDEX.SHOCK_GTE) firing the derived discriminator 'shock_index_high' (minAcuity 2) WITHOUT an overt-bleeding flag.
  - **Suggest:** Surface an OCCULT-HAEMORRHAGE / SHOCK SCREEN PROMPT: 'Shock Index >=1.0 — consider occult haemorrhage or other shock; reassess for a bleeding source.' Prompt source consideration; do NOT auto-flag the major-haemorrhage pathway (cause unconfirmed).
  - **Why:** SI>=1.0 reveals haemodynamic compromise the raw HR/BP can hide and may be the first sign of occult bleeding; prompting for a source biases to over-escalation while staying honest that the engine cannot confirm aetiology.
  - **Source:** Research doc §6 (Shock Index >0.9 occult shock, >=1.0 strong deterioration flag). Engine field derived.shockIndexFlag; constant SHOCK_INDEX.SHOCK_GTE=1.0; discriminator 'shock_index_high'.
  - **Seam:** 🟡 pending-intent · **Confidence:** medium

- **Trigger:** Obstetric ruleset; derived discriminator 'obstetric_severe_htn' fires — vitals.systolicBp >= 160 OR vitals.diastolicBp >= 110 (evalDerived) -> minAcuity 1, appears in firedDiscriminators.
  - **Suggest:** Flag the SEVERE PRE-ECLAMPSIA pathway and trigger obstetric-emergency escalation. Prompt the clinician to assess for the pre-eclampsia triad and eclampsia risk. Pathway is a later workflow — flag only; do NOT suggest antihypertensive or magnesium-sulfate specifics (drug-level / clinician scope).
  - **Why:** SBP>=160 or DBP>=110 in pregnancy/postpartum defines severe-range hypertension carrying stroke and eclampsia risk and is treated as an obstetric emergency; the engine already floors this to acuity 1, so the named pathway flag matches that floor.
  - **Source:** ACOG / NICE NG133 (severe-range BP >=160/110 = obstetric hypertensive emergency; threshold for eclampsia-prevention consideration). Research doc §8 ('systolic >=160 or diastolic >=110 -> severe pre-eclampsia'). Engine discriminator 'obstetric_severe_htn' (minAcuity 1).
  - **Seam:** 🟡 pending-intent · **Confidence:** high

- **Trigger:** Obstetric ruleset; clinician ticked 'obstetric_preeclampsia_triad' (label 'Pre-eclampsia triad (headache + visual + epigastric)', minAcuity 2) -> appears in firedDiscriminators, discriminatorAcuity = 2.
  - **Suggest:** Flag the PRE-ECLAMPSIA pathway for clinician activation and prompt obstetric review. Prompt a BP recheck and proteinuria/bloods consideration as part of the pathway. Flag only; no drug specifics.
  - **Why:** The symptom triad signals impending eclampsia even before severe-range BP is captured; flagging the pathway and prompting obstetric review biases to over-escalation in a must-not-miss group.
  - **Source:** MEOWS obstetric red-flags (research doc §8: 'severe headache + visual disturbance + epigastric pain (pre-eclampsia triad)'). Engine discriminator 'obstetric_preeclampsia_triad' (minAcuity 2).
  - **Seam:** 🟡 pending-intent · **Confidence:** high

- **Trigger:** Step-0 life-threat: lifeThreatFlags.activeSeizure = true (discriminator 'active_seizure', label 'Active seizure (incl. eclampsia)', lifeThreat, minAcuity 1) in an obstetric-ruleset patient (or pregnancy/postpartum_6wk context) -> result.lifeThreat = true, level 1.
  - **Suggest:** Flag the ECLAMPSIA pathway for immediate clinician activation alongside the Level 1 / resus disposition; trigger obstetric-emergency escalation. Pathway is a later workflow — flag only; no magnesium-sulfate or anticonvulsant dosing.
  - **Why:** An active seizure in a pregnant/recently-pregnant woman is eclampsia until proven otherwise — an immediate life threat the engine already routes to Level 1; surfacing the named pathway directs the resus response.
  - **Source:** MEOWS / obstetric red-flags (research doc §8: 'seizure (eclampsia)'); research doc §9 Step 0. Engine field lifeThreatFlags.activeSeizure; discriminator 'active_seizure'. Context PregnancyStatus = 'pregnant' | 'postpartum_6wk'.
  - **Seam:** 🟡 pending-intent · **Confidence:** high

- **Trigger:** Paediatric ruleset (routing.ruleset = 'paediatric_pews'); any of the paediatric pathway-relevant flags fire — e.g. 'paed_non_blanching_rash' (minAcuity 1, meningococcal), or PEWS-type sepsis concern. result.provisional = true and engine emits the 'score not auto-computed' flag.
  - **Suggest:** Surface a paediatric SEPSIS / SERIOUS-INFECTION SCREEN PROMPT and flag for senior paediatric review, but mark the suggestion as provisional. Do NOT assert a confirmed paediatric sepsis pathway threshold from the engine — defer the per-point trigger to the CSO-supplied PEWS rubric.
  - **Why:** The engine deliberately does not compute a paediatric numeric score (Brighton PEWS per-point sub-rubric is not in the research doc), so any paeds pathway threshold beyond the encoded red-flags would be fabricated. Over-escalate (prompt senior review) but flag uncertainty.
  - **Source:** Brighton/Monaghan PEWS (PEWS>=3 -> escalate) — per-point rubric paywalled/not in research doc (engine pews.ts scope note; research doc §7). Engine: result.provisional, paediatric discriminators ('paed_non_blanching_rash' etc.).
  - **Seam:** 🟡 pending-intent · **Confidence:** ⚠️ needs-CSO-input

  **⚠️ Over-reach risks flagged in this category:**
  - DKA pathway: the engine sees glucose only (derived.glucoseFlag), not ketones or acid-base. Any rule that asserts a CONFIRMED DKA pathway (vs a screen prompt to obtain ketones/pH) would over-reach the data and risk a false diagnostic flag. Keep it a screen-prompt; CSO to confirm wording.
  - Sepsis pathway flag must NOT carry any bundle specifics (no antibiotic choice, no '30 mL/kg crystalloid', no vasopressor/MAP targets). The SSC Hour-1 bundle contents are clinician-scope prescribing; the flag may name the pathway only. Confirm the flag never renders bundle steps.
  - Pre-eclampsia / eclampsia flags must NOT suggest magnesium sulfate, antihypertensive agents (e.g. labetalol/nifedipine), or any dose — these are explicit drug-level decisions. The 160/110 trigger and pathway name are in scope; the treatment is not. CSO sign-off on the boundary wording.
  - Major-haemorrhage flag must NOT specify transfusion ratios, blood products, tranexamic acid, or volumes — massive-transfusion activation content is clinician/protocol scope. Flag + escalation only.
  - Stroke flag: suggesting 'urgent neuro-imaging' and an onset-time prompt is category-level and in scope, but must NOT cross into thrombolysis eligibility determination or agent/dose — that is a clinician decision on the imaging result.
  - Shock-Index occult-haemorrhage prompt (medium confidence): risks over-flagging a non-bleeding cause of high SI (e.g. sepsis, dehydration). Framed as a screen prompt, not a confirmed major-haemorrhage flag, to avoid asserting aetiology the engine cannot confirm — CSO to confirm this stays a prompt.
  - Paediatric sepsis/serious-infection pathway thresholds are NOT encoded (PEWS per-point rubric paywalled). Marked needs-CSO-input; must not fabricate a numeric paeds trigger. Any paeds pathway threshold requires CSO-supplied PEWS data before going live.
  - All pathway flags are pending-intent (no live seam): the named pathways themselves are later workflow builds. Only ESCALATION/ROUTING actions attached to them (urgent appointment, care-team notification) use the existing live seams — the pathway flag must be RECORDED, not silently dropped, even though it does not auto-execute.

### Onward routing (department + urgent appointment / care-team notify) `onward_routing`

- **Trigger:** result.level === 1 (lifeThreat === true, Step-0 bypass, disposition 'Resus', colour red) OR result.level === 2 (disposition 'High-acuity', colour orange). Engine fields: result.level, result.lifeThreat, result.disposition, result.colour.
  - **Suggest:** Route to the resuscitation / high-acuity area of the receiving emergency department and fire a care-team notification to that department's on-shift clinical staff. Do NOT place in a routine queue or book a future appointment.
  - **Why:** Level 1/2 patients are time-critical and must be physically co-located with immediate resuscitation capability and a clinician alerted now — a waiting-room slot or scheduled appointment is unsafe for this acuity.
  - **Source:** 5-tier acuity model (engine ACUITY_TIERS: L1 target 0 min, L2 target 10 min); SATS (EMSSA 2012): Red = seen immediately, Orange < 10 min; ESI v5 (ENA 2023): levels 1-2 = greatest urgency.
  - **Seam:** 🟢 live · **Confidence:** high

- **Trigger:** result.level <= 2 — the exact condition the shipped notify seam fires on (assignedLevel <= 2 in notifyTriageOutcome). Engine field: result.level / assignedLevel.
  - **Suggest:** Trigger the in-app care-team notification to active clinical staff (cadre.isClinical) at the receiving department (the live notifyTriageOutcome path). Surface that out-of-band SMS/push is stubbed, so an in-person/phone hand-off should not be skipped.
  - **Why:** The notification is a courtesy alert, not a guaranteed-delivery channel — SMS/push is a logged no-op today — so for Red/Orange the routing suggestion must explicitly prompt a verbal hand-off as well, never rely on the alert alone.
  - **Source:** MedSync notify implementation (lib/triage/notify.ts: ALERT_LEVELS = [1,2], stubbedNotificationSink); RCP NEWS2 2017 escalation principle that high scores require an actioned response, not just a flag.
  - **Seam:** 🟢 live · **Confidence:** high

- **Trigger:** ruleset 'adult_news2' AND news2.total >= 7 (NEWS2_RISK.HIGH_MIN). Engine fields: result.ruleset, result.news2.total.
  - **Suggest:** Suggest onward routing to a critical-care-capable area and notify the critical-care outreach / senior cadre via the care-team notification seam.
  - **Why:** NEWS2 >= 7 mandates emergency assessment by a team with critical-care competencies and usually transfer to a higher-dependency area — the routing destination must be a setting that can deliver that.
  - **Source:** RCP NEWS2 2017 clinical response table: score >= 7 (High) -> emergency assessment by critical-care team + transfer to higher-dependency care area.
  - **Seam:** 🟢 live · **Confidence:** high

- **Trigger:** ruleset 'adult_news2' AND news2.total in 5-6 (NEWS2_RISK.MEDIUM_MIN..MEDIUM_MAX) OR news2.hasSingleParameterThree === true with no higher acuity. Engine fields: result.news2.total, result.news2.hasSingleParameterThree.
  - **Suggest:** Suggest routing for urgent same-area senior clinician review (no future appointment); record a care-team notification to a ward-based doctor / acute-team nurse.
  - **Why:** A medium NEWS2 (5-6) or a single-parameter-3 red score requires urgent review by a clinician competent in acute illness who decides whether to escalate to critical care — routing should keep the patient in an actively-reviewed space, not a routine slot.
  - **Source:** RCP NEWS2 2017: score 5-6 (Medium) and single red score (3 in one parameter) -> urgent review by clinician with acute-illness competencies.
  - **Seam:** 🟡 pending-intent · **Confidence:** high

- **Trigger:** firedDiscriminators contains 'cardiac_chest_pain' (minAcuity 2). Engine field: result.firedDiscriminators[].code.
  - **Suggest:** Suggest onward routing toward acute cardiac / medical receiving (named specialty is a clinician confirmation), recorded as the routing intent. Pair with the L2 care-team notification.
  - **Why:** Cardiac-sounding chest pain is a time-critical pathway (ACS) where the receiving destination's capability — ECG-ready, cardiology access — materially affects outcome; surfacing the suggested specialty helps the clinician route correctly.
  - **Source:** Engine discriminator 'cardiac_chest_pain' minAcuity 2 (SATS-style red-flag list, research doc §A.2); SATS Orange < 10 min target.
  - **Seam:** 🟡 pending-intent · **Confidence:** medium

- **Trigger:** firedDiscriminators contains 'focal_neuro_deficit' (minAcuity 2, appliesTo all). Engine field: result.firedDiscriminators[].code.
  - **Suggest:** Suggest onward routing toward acute stroke / neurology receiving (clinician-confirmed specialty), flagged as time-critical onward intent, alongside the L2 care-team notification.
  - **Why:** Focal deficit / suspected stroke is time-critical (thrombolysis/thrombectomy windows); the correct onward destination is a stroke-capable pathway, so the routing suggestion should name it for confirmation rather than default to general ED flow.
  - **Source:** Engine discriminator 'focal_neuro_deficit' minAcuity 2 (research doc §A.2); SATS Orange < 10 min; time-critical stroke principle.
  - **Seam:** 🟡 pending-intent · **Confidence:** medium

- **Trigger:** ruleset 'adult_news2' AND ( derived.qsofa.score >= 2 with infection-source discriminator 'sepsis_suspicion' ) OR ( news2.total >= 5 with infection source ) — the sepsis conditional gate. Engine fields: result.derived.qsofa.score, result.firedDiscriminators (sepsis_suspicion), result.news2.total.
  - **Suggest:** Suggest routing to a high-acuity / sepsis-capable receiving area and notify the senior reviewing clinician via the care-team seam. The named sepsis pathway itself is flagged elsewhere (category 5) — here it is the routing destination only.
  - **Why:** Suspected sepsis is a medical emergency requiring immediate senior review and a setting that can deliver bundle care; routing must land the patient where that is possible rather than in a routine queue.
  - **Source:** Surviving Sepsis Campaign 2021: sepsis is a medical emergency, immediate review. NOTE: SSC 2021 recommends AGAINST qSOFA as a SOLE screen — the engine uses qSOFA only as an overlay gated on an infection source, consistent with this.
  - **Seam:** 🟡 pending-intent · **Confidence:** medium

- **Trigger:** ruleset 'obstetric_meows' AND any obstetric red-flag fired: firedDiscriminators contains 'obstetric_severe_htn' (minAcuity 1), 'obstetric_heavy_pv_bleeding' (minAcuity 1), 'obstetric_preeclampsia_triad' (minAcuity 2), 'reduced_fetal_movements' (minAcuity 2), or Step-0 'active_seizure' (eclampsia). Engine fields: result.ruleset, result.firedDiscriminators[].code.
  - **Suggest:** Suggest onward routing to obstetric / maternity emergency receiving (not general ED queue) and fire the care-team notification (live for the L1/L2 ones). Where the obstetric destination is not yet a configured department, record the routing intent.
  - **Why:** Obstetric red-flags need an obstetric team and setting; routing a pregnant/postpartum patient with a red-flag into general adult flow risks dangerous delay to specialty assessment.
  - **Source:** Engine obstetric discriminators (research doc §A.2); MEOWS escalation principle (obstetric red-flag -> obstetric emergency review). MEOWS per-parameter cutoffs are not encoded in the engine (provisional).
  - **Seam:** 🟡 pending-intent · **Confidence:** ⚠️ needs-CSO-input

- **Trigger:** ruleset 'paediatric_pews' AND a paediatric red-flag fired ('paed_non_blanching_rash' minAcuity 1, 'paed_grunting_cyanosis_caprefill' minAcuity 2, 'paed_infant_fever' minAcuity 2) OR result.level <= 2 under paeds. Engine fields: result.ruleset, result.firedDiscriminators[].code, result.level.
  - **Suggest:** Suggest onward routing to paediatric / senior-paeds receiving (not adult flow) and fire the care-team notification for L1/L2. Where a paediatric department is not configured, record the routing intent.
  - **Why:** Children deteriorate fast and need senior paediatric assessment in a paeds-capable setting; routing to the correct specialty area is part of the over-escalation bias for this population.
  - **Source:** Engine paediatric discriminators (research doc §A.2); PEWS escalation principle. NOTE: full Brighton PEWS per-point sub-rubric is paywalled and NOT encoded (engine marks paeds provisional) — score-driven routing thresholds are uncertain.
  - **Seam:** 🟡 pending-intent · **Confidence:** ⚠️ needs-CSO-input

- **Trigger:** result.level in 3 (disposition 'Standard', yellow). Engine fields: result.level, result.disposition.
  - **Suggest:** Suggest routing into the standard urgent queue for the appropriate receiving area; an urgent appointment may be created via the live scheduling seam if the patient is being booked rather than walked through. No care-team notification (below the L<=2 alert threshold).
  - **Why:** Level 3 is urgent-but-stable: it warrants a prompt slot, not a high-acuity alert, and the live appointment-creation seam can carry the urgency without over-alerting clinical staff.
  - **Source:** 5-tier model (engine: L3 target 60 min); SATS Yellow < 60 min; ESI v5 stable lower-acuity placement (decision point C after L1/L2 excluded).
  - **Seam:** 🟢 live · **Confidence:** high

- **Trigger:** result.level in 4 (disposition 'Standard / fast-track', green) or 5 (disposition 'Fast-track', blue). Engine fields: result.level, result.disposition.
  - **Suggest:** Suggest routing to fast-track / a routine or virtual appointment via the live scheduling seam; for L5 a virtual / deferred appointment is appropriate. No care-team notification.
  - **Why:** Less-urgent and non-urgent patients are safely served by a scheduled (including virtual) appointment, freeing high-acuity capacity — and the appointment seam is live so this routing is fully actionable today.
  - **Source:** 5-tier model (engine: L4 target 120 min, L5 target 240 min); SATS Green < 4 h; ESI v5 lower-acuity (levels 4-5).
  - **Seam:** 🟢 live · **Confidence:** high

- **Trigger:** result.incompleteVitals === true (ESI v5 mandatory HR/RR/SpO2 missing; result floored to L3) OR result.provisional === true (paeds/obstetric not auto-scored, or NEWS2 missing inputs). Engine fields: result.incompleteVitals, result.missingRequiredVitals, result.provisional, result.flags.
  - **Suggest:** Suggest holding onward routing at no-less-than the standard (L3) reviewed area and recording the routing decision as provisional, with a prompt to re-route once vitals/score are complete. Do NOT route to a lower-acuity fast-track / virtual slot on incomplete data.
  - **Why:** A reassuring (low-acuity) destination must not be issued without the mandatory vitals or a complete score; provisional results bias the routing up until completed, never down into a deferred slot.
  - **Source:** ESI v5 (ENA 2023): HR/RR/SpO2 mandatory before a reassuring level (engine ESI_V5_INCOMPLETE_FLOOR_LEVEL = 3); engine provisional flag (research doc §10).
  - **Seam:** 🟡 pending-intent · **Confidence:** high

- **Trigger:** result.trendEscalated === true (priorLevel more acute than current snapshot, level escalated) OR result.dangerVitals length > 0 (ESI v5 danger-zone reassess-up to L2). Engine fields: result.trendEscalated, result.dangerVitals, result.esiV5Acuity.
  - **Suggest:** Suggest re-routing the patient up to the destination matching the escalated level (and firing the care-team notification if the escalated level is <= 2), rather than the routing implied by the raw snapshot. Record the re-route as escalation-driven.
  - **Why:** A worsening trend or a danger-zone vital reassess-up means the prior/snapshot routing is now unsafe; onward routing must follow the escalated acuity, consistent with the bias-to-over-escalation rule.
  - **Source:** ESI v5 (ENA 2023) danger-zone reassess-up (HR>100, RR>20, SpO2<92 -> min L2, engine ESI_V5_DANGER_FLOOR_LEVEL = 2); engine trend rule (never auto-improve).
  - **Seam:** 🟢 live · **Confidence:** high

  **⚠️ Over-reach risks flagged in this category:**
  - The 'cardiac_chest_pain' rule names a cardiac/ACS destination and the 'focal_neuro_deficit' rule names a stroke destination. Suggesting a specialty department is in-scope onward routing, but it must NOT silently imply downstream treatment (e.g. thrombolysis, antiplatelets) — keep these as a suggested specialty for clinician confirmation, not a pre-selected treatment pathway. Flagged for CSO to confirm the wording stays at 'suggested receiving specialty'.
  - The sepsis-destination rule (qSOFA>=2 + infection or NEWS2>=5 + infection) routes toward a 'sepsis-capable' area. There is a real over-reach risk if this is read as initiating the sepsis bundle (fluids/antibiotics) — those are category-5 pathway-flag + clinician scope, NOT onward routing. SSC 2021 explicitly warns against qSOFA as a sole screen, so the trigger must stay gated on an infection source and framed as routing only. CSO to confirm the boundary.
  - Obstetric and paediatric onward-routing rules depend on red-flags whose underlying per-parameter MEOWS/PEWS rubrics are paywalled and NOT encoded in the engine (both populations are provisional). Routing-up on the fired discriminators is conservative and safe, but any score-band-driven routing threshold for these populations would be fabricated — marked needs-CSO-input. Do not add numeric paeds/obstetric routing cutoffs without the licensed rubric.
  - The live care-team notification (notifyTriageOutcome) only fires for level <= 2 and its SMS/push transport is a stubbed no-op. There is a safety risk of over-trusting the alert as delivered. Routing suggestions for high acuity must continue to prompt an in-person/verbal hand-off and must not present 'notified' as a guaranteed reach. CSO to confirm the disclosure wording.
  - Auto-creating an urgent appointment for L3-L5 via the live scheduling seam is routing, not prescribing, but the suggestion must remain accept/modify/dismiss and never auto-book without clinician confirmation — otherwise it crosses from suggestion into action. Confirm the seam stays clinician-gated.

### Investigations to consider (category-level) `investigation`

- **Trigger:** firedDiscriminators[] contains code 'cardiac_chest_pain' (clinician-ticked cardiac-sounding chest pain; minAcuity 2). Adult ruleset.
  - **Suggest:** Consider a 12-lead ECG (category: cardiac electrical assessment). Recorded as a consideration for the clinician to action — no auto-order.
  - **Why:** Cardiac-sounding chest pain is the trigger to exclude an acute coronary syndrome; an early ECG is the single time-critical investigation that distinguishes STEMI (needs immediate reperfusion pathway) from the rest.
  - **Source:** NICE CG95 (recent-onset chest pain of suspected cardiac origin) + 2021 AHA/ACC Chest Pain Guideline: resting 12-lead ECG on arrival / within 10 minutes for suspected ACS. Engine discriminator 'cardiac_chest_pain' (research doc §A.2, minAcuity 2).
  - **Seam:** 🟡 pending-intent · **Confidence:** high

- **Trigger:** firedDiscriminators[] contains 'cardiac_chest_pain' (suspected ACS). Adult.
  - **Suggest:** Consider serial cardiac biomarker bloods as part of the chest-pain work-up (category: blood investigations for ACS). Consideration only.
  - **Why:** ACS assessment pairs the ECG with a high-sensitivity troponin sample; flagging it as a consideration keeps the work-up complete without prescribing a specific assay or timing protocol (clinician scope).
  - **Source:** NICE CG95 / 2021 AHA-ACC Chest Pain Guideline: 12-lead ECG + hs-troponin sample on arrival for suspected ACS. Engine 'cardiac_chest_pain'.
  - **Seam:** 🟡 pending-intent · **Confidence:** high

- **Trigger:** firedDiscriminators[] contains 'focal_neuro_deficit' (suspected stroke; minAcuity 2) AND/OR derived.glucoseFlag is null because vitals.bloodGlucose === null (glucose not yet measured).
  - **Suggest:** Consider an immediate bedside capillary blood glucose (category: point-of-care glucose) to exclude hypoglycaemia as a stroke mimic. Consideration only.
  - **Why:** Hypoglycaemia produces focal deficits identical to stroke and is instantly reversible; it must be excluded before a time-critical stroke pathway proceeds, otherwise a treatable mimic is missed and thrombolysis risk is taken needlessly.
  - **Source:** Standard acute-stroke assessment (RCP / AHA-ASA): measure blood glucose in all suspected acute stroke to exclude hypoglycaemic mimic. Engine discriminator 'focal_neuro_deficit'; engine 'glucoseFlag' / vitals.bloodGlucose field (research doc §6, §11).
  - **Seam:** 🟡 pending-intent · **Confidence:** high

- **Trigger:** vitals.consciousness !== 'A' on ACVPU (any of C/V/P/U → altered mentation) AND vitals.bloodGlucose === null (no glucose recorded). Also fires when derived.qsofa.alteredMentationPoint === true with glucose unmeasured.
  - **Suggest:** Consider an immediate bedside capillary blood glucose (category: point-of-care glucose) for any altered mental state. Consideration only.
  - **Why:** Altered mentation has an instantly reversible, easily missed cause in glucose extremes; checking glucose first is the universal 'don't-ever-miss' step in any reduced-consciousness presentation.
  - **Source:** NEWS2/ACVPU (RCP 2017) altered-consciousness; research doc §6 'glucose as a vital' (<3.0 immediate). Engine vitals.consciousness, derived.qsofa.alteredMentationPoint.
  - **Seam:** 🟡 pending-intent · **Confidence:** high

- **Trigger:** derived.glucoseFlag === 'hyperglycaemia_dka_screen' (bloodGlucose > 15.0 mmol/L).
  - **Suggest:** Consider bedside blood/urine ketones and a venous blood gas to screen for diabetic ketoacidosis (category: ketone + acid-base investigations). Consideration only; the DKA pathway itself is a later workflow.
  - **Why:** Glucose >15 alone is not DKA; ketones + acidosis are what confirm it. Suggesting the confirmatory bedside tests lets the clinician rule DKA in or out without the engine asserting a diagnosis or treatment.
  - **Source:** JBDS-IP DKA criteria (glucose >11 mmol/L + capillary ketones >3 / urine ketones ++ + venous pH <7.3 or bicarbonate <15). Engine derived.glucoseFlag threshold GLUCOSE.HYPER_DKA_SCREEN_GT = 15.0 (research doc §6/§11).
  - **Seam:** 🟡 pending-intent · **Confidence:** high

- **Trigger:** sepsis pathway condition: firedDiscriminators[] contains 'sepsis_suspicion' AND (derived.qsofa.score >= 2 OR news2.total >= 5). Adult ruleset.
  - **Suggest:** Consider sepsis-screen bloods including a serum/venous lactate, plus blood cultures before any antimicrobial decision (category: sepsis investigations). Considerations only — no antibiotic, no fluid volume.
  - **Why:** Lactate stratifies sepsis severity / occult hypoperfusion and is the key triage-level investigation; cultures-before-antibiotics preserves diagnostic yield. Flagging them as considerations keeps the Hour-1 work-up visible while leaving ordering and any treatment to the clinician.
  - **Source:** Surviving Sepsis Campaign Hour-1 bundle: measure lactate + obtain blood cultures before antibiotics; Sepsis-3 (lactate >2 mmol/L = septic-shock indicator). Engine gate: 'sepsis_suspicion' conditional on qsofa.score≥2 OR news2.total≥5 (research doc §5).
  - **Seam:** 🟡 pending-intent · **Confidence:** high

- **Trigger:** derived.shockIndexFlag === 'shock' (Shock Index ≥ 1.0) OR derived.shockIndexFlag === 'occult_shock' (>0.9), i.e. discriminator 'shock_index_high' fired. Adult.
  - **Suggest:** Consider point-of-care lactate and bloods to evaluate for occult hypoperfusion/shock (category: shock/perfusion investigations). Consideration only.
  - **Why:** A raised shock index flags haemodynamic compromise before BP frankly drops; a lactate gives objective evidence of tissue hypoperfusion the raw vitals can hide, supporting earlier escalation rather than waiting for hypotension.
  - **Source:** Research doc §6 (Shock Index >0.9 occult shock, ≥1.0 strong deterioration flag); Sepsis-3/SSC lactate as hypoperfusion marker. Engine derived.shockIndex / shockIndexFlag, discriminator 'shock_index_high'.
  - **Seam:** 🟡 pending-intent · **Confidence:** medium

- **Trigger:** news2.total >= 7 (NEWS2 high risk) OR news2.hasSingleParameterThree === true (any single parameter scored 3 / 'red score').
  - **Suggest:** Consider a structured set of baseline investigations appropriate to the deranged physiology (category: high-acuity baseline work-up — e.g. bloods, glucose, and the relevant point-of-care tests). Considerations only; specific panels are clinician scope.
  - **Why:** A NEWS2 ≥7 or single-parameter-3 mandates urgent clinical assessment; surfacing a general baseline-investigation prompt ensures the work-up is not delayed, while deliberately not naming specific panels avoids prescribing.
  - **Source:** NEWS2 / RCP 2017 response thresholds: aggregate ≥7 = high clinical risk → urgent/emergency assessment; single parameter = 3 triggers urgent review. Engine news2.total, news2.hasSingleParameterThree.
  - **Seam:** 🟡 pending-intent · **Confidence:** medium

- **Trigger:** incompleteVitals === true (ESI v5 mandatory vital missing) — missingRequiredVitals[] non-empty (any of respiratory_rate / pulse / spo2 absent).
  - **Suggest:** Consider completing the mandatory vital-sign set (RR, HR, SpO2) before issuing a reassuring level (category: complete baseline observations). This is an observation-completion prompt, not a lab order.
  - **Why:** ESI v5 forbids a reassuring acuity without HR/RR/SpO2; prompting completion of the required observations is the most basic and highest-yield 'investigation' and directly prevents under-triage from a data gap.
  - **Source:** ESI 5th Edition (ENA 2023): HR + RR + SpO2 mandatory for all patients not already L1/L2; missing → cannot issue reassuring level. Engine incompleteVitals, missingRequiredVitals, ESI_V5_REQUIRED_VITALS.
  - **Seam:** 🟡 pending-intent · **Confidence:** high

- **Trigger:** dangerVitals[] non-empty (ESI v5 danger-zone vital: pulse > 100, respiratoryRate > 20, or spo2 < 92) → esiV5Acuity floored to L2.
  - **Suggest:** Consider repeat/continuous measurement of the flagged danger-zone vital and baseline bloods appropriate to the abnormality (category: targeted reassessment + baseline investigations). Considerations only.
  - **Why:** A danger-zone vital reassesses acuity up to L2; confirming it on repeat measurement and obtaining relevant baseline tests supports the upgraded acuity rather than dismissing a single abnormal reading.
  - **Source:** ESI v5 (ENA 2023) danger-zone thresholds: HR>100, RR>20, SpO2<92 → minimum L2 reassess-up. Engine dangerVitals, esiV5Acuity, ESI_V5_ADULT_DANGER.
  - **Seam:** 🟡 pending-intent · **Confidence:** medium

- **Trigger:** obstetric ruleset (ruleset === 'obstetric_meows') AND a fired obstetric discriminator: 'obstetric_severe_htn' (SBP≥160 or DBP≥110), 'obstetric_preeclampsia_triad', or 'obstetric_heavy_pv_bleeding'.
  - **Suggest:** Consider obstetric/pre-eclampsia screening investigations and a maternal blood work-up appropriate to the red flag (category: obstetric-emergency investigations). Considerations only; the pre-eclampsia/haemorrhage pathway is a later workflow.
  - **Why:** Obstetric red flags carry a distinct must-not-miss investigation set (e.g. pre-eclampsia bloods, haemorrhage cross-match work-up); flagging the category ensures the obstetric work-up is initiated when the obstetric emergency team is called.
  - **Source:** MEOWS (obstetric early warning) — provisional in the engine; pre-eclampsia/obstetric-emergency principle. Engine obstetric discriminators (research doc §8, marked provisional).
  - **Seam:** 🟡 pending-intent · **Confidence:** ⚠️ needs-CSO-input

- **Trigger:** paediatric ruleset (ruleset === 'paediatric_pews') AND a fired paediatric red-flag discriminator: 'paed_non_blanching_rash', 'paed_grunting_cyanosis_caprefill', or 'paed_infant_fever' (<3 months, fever ≥38°C).
  - **Suggest:** Consider an urgent paediatric septic/serious-illness investigation set appropriate to the red flag (category: paediatric serious-illness investigations — e.g. bloods, glucose, point-of-care tests). Considerations only; specific panels/septic-screen composition is clinician scope.
  - **Why:** Paediatric red flags (non-blanching rash, infant fever, respiratory distress signs) mandate a serious-bacterial-illness work-up; surfacing the category prevents delay, while the exact panel stays with the paediatric clinician given the engine's provisional paeds rubric.
  - **Source:** PEWS (Brighton) ≥3 escalate + paediatric red-flag list; full per-point PEWS sub-rubric and paediatric investigation panels are paywalled/uncertain in the engine. Engine paediatric discriminators, PAED_AGE_BANDS (research doc §7, marked provisional).
  - **Seam:** 🟡 pending-intent · **Confidence:** ⚠️ needs-CSO-input

- **Trigger:** firedDiscriminators[] contains 'severe_resp_distress' (severe respiratory distress, working hard; minAcuity 2), OR a respiratory danger pattern: normal/borderline spo2 with respiratoryRate scoring NEWS2 +2/+3 (RR ≥21).
  - **Suggest:** Consider respiratory-focused point-of-care tests and bloods appropriate to the presentation (category: respiratory investigations — e.g. blood gas, glucose). Considerations only.
  - **Why:** A patient working hard to maintain saturations is decompensating regardless of the SpO2 reading; objective tests such as a blood gas characterise the failure earlier than the sat alone, which can falsely reassure.
  - **Source:** Research doc §6 (normal SpO2 + high RR = working hard / impending failure); NEWS2 RR bands (RR≥25 = +3). Engine discriminator 'severe_resp_distress', news2 RR parameter.
  - **Seam:** 🟡 pending-intent · **Confidence:** medium

  **⚠️ Over-reach risks flagged in this category:**
  - Sepsis rule: 'blood cultures before antimicrobial decision' references the Hour-1 bundle. It must stay a CATEGORY consideration (obtain cultures/lactate) and must NOT carry the bundle's antibiotic-administration or 30 mL/kg fluid components — those are dosing/treatment and clinician scope. CSO should confirm the wording stops at 'investigations to consider'.
  - DKA rule: suggesting ketones + venous gas is investigation-only and safe, but it sits one step from the DKA treatment pathway (insulin/fluids). Keep this as a screen-confirmation prompt only; the pathway flag and any treatment belong to category 5 / a later workflow, not here.
  - High-acuity baseline work-up (NEWS2≥7 / single-3) and the paediatric/obstetric sets are deliberately vague ('appropriate panels') to avoid naming specific tests the engine cannot justify per-finding. There is a mild over-reach risk if the build later hard-codes a fixed panel — that would assert clinical judgement the guideline does not give per-trigger. CSO to decide whether named panels are in scope.
  - Glucose-check prompts (stroke mimic, altered mentation) are investigation-only here; the actual glucose CORRECTION prompt is a category-2 immediate-measure item. Ensure this category does not drift into suggesting correction/dosing.
  - Paediatric and obstetric investigation sets are marked needs-CSO-input because the engine's PEWS/MEOWS rubrics are provisional/paywalled — the specific investigation panels are NOT guideline-traceable per-point in the shipped engine and must not be fabricated.
  - ECG-for-chest-pain and biomarker bloods: 'within 10 minutes' is a service-standard timing, not a MedSync-enforced order. Surfacing the timing as rationale is fine; the build must not present it as an auto-executed timer/order (no live order-entry seam exists).

## §3 — Proposed storage schema (additive)

```
PROPOSED STORAGE SCHEMA — triage recommendations (Drizzle / drizzle-orm pg-core, additive)

CONVENTIONS FOLLOWED (matched from db/schema/triage.ts + db/schema/scheduling.ts):
- uuid PK defaultRandom; withTimezone timestamps; jsonb for transparent breakdown payloads; smallint for acuity (BETWEEN 1 AND 5 check); text columns gated by `IN (...)` check constraints rather than pg enums (matches every existing table); actor FKs to ./_auth authUsers with onDelete:'set null'; hospital FK onDelete:'cascade'; index by (parentId) and (hospital, time).
- MIGRATION NUMBERING IS NOT ASSERTED AS FACT. Latest on disk is supabase/migrations/0037_triage_notifications.sql; the next sequential file would conventionally be 0038_*, but the exact number/name must be confirmed at build time (drizzle-kit generates into supabase/migrations per drizzle.config.ts). This proposal is ADDITIVE — one new table referencing the existing triage_records.id; it adds NO column to, and requires NO backfill of, triage_records. No statement here should be read as a confirmed migration plan.

NEW TABLE: triage_recommendations  (one row per surfaced suggestion; the triage_record stays the medico-legal spine, recommendations hang off it)

  id                uuid PK defaultRandom()
  triageRecordId    uuid NOT NULL  -> references(() => triageRecords.id, { onDelete: 'cascade' })   // recs die with their record
  hospitalId        uuid NOT NULL  -> references(() => hospitals.id, { onDelete: 'cascade' })       // denormalised for RLS parity with triage_records
  category          text NOT NULL  // check IN ('disposition','immediate_measure','monitoring','escalation','pathway_flag','onward_routing','investigation')  — the addendum's 7 categories
  suggestionCode    text NOT NULL  // stable machine code, e.g. 'disp_resus','measure_oxygen_titrate','monitor_continuous','escalate_senior_critical_care','pathway_sepsis','route_obstetric','invx_ecg_chest_pain'
  suggestionText    text NOT NULL  // the category-level human string actually shown (no doses/volumes — enforced in code, see open question 8)
  rationale         text NOT NULL  // why, surfaced to clinician
  sourceCitation    text NOT NULL  // guideline + threshold, e.g. 'RCP NEWS2 2017 Chart 4 — aggregate >=7'  (HARD RULE: never null; if no traceable basis, no row is written)
  triggerSnapshot   jsonb NOT NULL // the engine fields that fired this rule (e.g. {news2Total:8, dangerVitals:['SpO2 <92'], firedDiscriminators:['cardiac_chest_pain']}) — reproducibility/audit
  minAcuity         smallint       // nullable; check (minAcuity IS NULL OR minAcuity BETWEEN 1 AND 5)
  seamType          text NOT NULL  // check IN ('live','pending_intent')  — honest about whether an action can actually execute today
  confidence        text NOT NULL  // check IN ('high','medium','needs_cso_input')  — carries the engine's provisional/paeds/obstetric uncertainty straight to the record
  provisional       boolean NOT NULL default(false)  // mirrors result.provisional / paeds+obstetric un-scored state for THIS suggestion

  // ── clinician decision (the suggestions-not-orders contract) ──
  decision          text NOT NULL default('pending')  // check IN ('pending','accepted','modified','dismissed')
  decisionNote      text           // check (decision <> 'modified' OR decisionNote IS NOT NULL)  — a modify must say what changed; mirrors tr_override_reason_required
  decisionByUserId  uuid           -> references(() => authUsers.id, { onDelete: 'set null' })  // the actor; nullable until acted on
  decisionAt        timestamp withTimezone

  // ── seam linkage (recorded, never dropped — pending-intent kept) ──
  linkedAppointmentId   uuid       -> references(() => appointments.id, { onDelete: 'set null' })  // set ONLY when the live scheduling seam created one (origin='system_urgent')
  linkedNotificationId  text       // intentionally TEXT, not FK — mirrors scheduling.ts triggered_by_alert_id pattern (sa_notifications row id captured loosely; upgrade to FK later if desired)

  createdByUserId   uuid           -> references(() => authUsers.id, { onDelete: 'set null' })  // who triaged / generated the rec set
  createdAt         timestamp withTimezone NOT NULL defaultNow()
  updatedAt         timestamp withTimezone NOT NULL defaultNow()

  CHECK constraints:
    rec_category_check        category IN ('disposition','immediate_measure','monitoring','escalation','pathway_flag','onward_routing','investigation')
    rec_seam_check            seam_type IN ('live','pending_intent')
    rec_confidence_check      confidence IN ('high','medium','needs_cso_input')
    rec_decision_check        decision IN ('pending','accepted','modified','dismissed')
    rec_min_acuity_check      min_acuity IS NULL OR min_acuity BETWEEN 1 AND 5
    rec_modify_note_required  decision <> 'modified' OR decision_note IS NOT NULL
  INDEXES:
    triage_recommendations_record_idx   on (triageRecordId)
    triage_recommendations_hospital_idx  on (hospitalId, createdAt)
    triage_recommendations_pending_idx   on (decision) where decision = 'pending'   // worklist surfacing of un-actioned recs

RLS: identical posture to triage_records (clinical staff at the hospital + patient-own-via-record + superadmin; reception excluded via is_clinical). Writes service-role/Edge-Function only; the scoring stays the pure deterministic function in lib/triage.

WHY A SIDE TABLE, NOT A JSONB COLUMN ON triage_records: each suggestion needs its OWN accept/modify/dismiss lifecycle, actor, and timestamp, plus its own seam linkage — that is row-shaped, not blob-shaped. A jsonb column could not enforce the modify-needs-note check or index pending decisions. The triage_record remains the immutable clinical snapshot; recommendations are the actionable layer over it. Monitoring INTERVALS are NOT stored here as a new mechanism — the suggested re-vitals interval is surfaced as a monitoring-category recommendation (suggestionText carries the band, triggerSnapshot the NEWS2 band) so it inherits the same accept/modify/dismiss + audit. Any actual timer/scheduler is a separate later workflow (no live seam today).
```

## §4 — Suggested monitoring-interval defaults (cited)

```
SUGGESTED RE-VITALS / RE-TRIAGE INTERVAL DEFAULTS (suggestions only — clinician accepts/modifies/dismisses; nothing auto-schedules). Adult NEWS2 band is the spine; ESI v5, acuity tier, and overlays floor it tighter, never looser. Bias to over-monitoring.

ADULT NEWS2 (RCP 2017, NEWS2 Chart 4 'Clinical response to the NEWS trigger thresholds'):
- NEWS2 total 0 (no single-3, not provisional): minimum 12-hourly. [RCP 2017 Chart 4 — score 0 -> min 12h routine]
- NEWS2 total 1-4 (LOW, no single-3): minimum 4-6 hourly; RN may step up. [RCP 2017 Chart 4 — low risk 1-4 -> min 4-6h]
- Single parameter scores 3 with aggregate <=4 ('red score'): minimum 1-hourly + urgent review, regardless of the reassuring total. [RCP 2017 Chart 4 — score of 3 in one parameter -> min hourly]
- NEWS2 total 5-6 (MEDIUM): minimum 1-hourly; shorten on any worsening trend. [RCP 2017 Chart 4 — medium risk 5-6 -> min hourly]
- NEWS2 total >=7 (HIGH): CONTINUOUS monitoring of vital signs. [RCP 2017 Chart 4 — high risk >=7 -> continuous]

ESI v5 OVERLAY (ENA 2023) — applies on top, flooring tighter:
- Any danger-zone vital present (HR>100 / RR>20 / SpO2<92; engine dangerVitals[] non-empty, esiV5Acuity=2): HR, RR and BP at minimum 1-hourly 'or more frequently per nursing judgement until stabilized'. [ESI v5 Decision Point D, ENA 2023]

ACUITY-TIER FLOOR (research doc §1 / engine ACUITY_TIERS; convergent with SATS EMSSA 2012):
- L1 Resus / L2 High-acuity (any path — life-threat, NEWS2>=7, fired L1/L2 discriminator, danger-zone reassess-up): CONTINUOUS / minimum 1-hourly as the default, set to the most frequent band; bias to continuous when in doubt. [research doc §1 L1 target 0 / L2 target 10; SATS Red immediate, Orange <10; convergent with NEWS2 high-risk continuous]

OVERLAY / GUARDRAIL ADJUSTMENTS (take the tighter of these and the band above):
- Sepsis positive (qSOFA>=2 + infection, OR NEWS2>=5 + infection): frequent/continuous reassessment, floored by the NEWS2 band (hourly for >=5, continuous for >=7). Cadence only — NO lactate-clearance/fluid/vasopressor endpoints. [SSC 2021 'frequent, ongoing reassessment'; floored by RCP 2017 Chart 4] — confidence: medium.
- Provisional / incomplete-vitals (incompleteVitals===true or news2.provisional===true): bias to the next-tighter band and prompt to complete the missing obs; cadence is provisional, not a fixed regimen. [ESI v5 mandatory-vitals, ENA 2023; research doc §10] — confidence: high (that it should tighten); the exact interval is a prompt, not an order.
- Trend escalated (trendEscalated===true) or re-triage: tighten to the next-more-frequent band vs the current score's band; keep on a re-triage timer, never discharge the cadence. [RCP 2017 trend/clinical-concern escalation; research doc §5] — confidence: medium.

PAEDIATRIC (PEWS) and OBSTETRIC (MEOWS) — NOT STATED AS AUTHORITATIVE INTERVALS:
- PEWS: 'increase frequency of vital-signs measurement + escalate to senior paeds' for any high/abnormal score; exact interval (continuous vs hourly) is clinician-set on the age-appropriate chart. The per-point Brighton/National PEWS rubric is paywalled/not encoded (engine provisional). [National PEWS, NHS England Nov 2023] — confidence: needs-CSO-input.
- MEOWS: rescore at a short interval (published protocols commonly ~30 min) with urgent obstetric review for any red or multiple-yellow trigger; the ~30-min figure is cited as a PUBLISHED PROTOCOL, not a MedSync-issued instruction. MEOWS has no single validated national rubric and is not encoded (engine provisional). [UK MEOWS / RCOG-MBRRACE] — confidence: needs-CSO-input.

IMPLEMENTATION NOTE: all of the above are SURFACED as a monitoring-category recommendation row (accept/modify/dismiss). No automatic timer re-queues a patient without clinician confirmation. Per-hospital target-time overrides already exist in triage_config.targetMinutesByLevel; the CSO should decide whether re-vitals intervals are likewise hospital-overridable.
```

## §5 — Open questions the CSO must decide before go-live

1. EXACT MONITORING INTERVALS: confirm the NEWS2-banded re-vitals defaults above (12h / 4-6h / hourly / continuous) and the ESI v5 'hourly until stabilized' danger-zone floor are acceptable as SUGGESTED timers. Decide whether intervals are per-hospital overridable like triage_config.targetMinutesByLevel, or fixed clinical-safety constants.

2. PAEDIATRIC (PEWS) GO-LIVE: the per-point PEWS rubric is paywalled/not encoded (engine provisional). Decide whether paeds recommendations ship at launch at all, and if so confirm they stay category-level + provisional + 'manual PEWS chart required before any down-disposition' — OR supply a licensed PEWS rubric so numeric thresholds become traceable. Do NOT go live asserting paeds acuity as engine-computed.

3. OBSTETRIC (MEOWS) GO-LIVE: MEOWS has no single validated national rubric and is not encoded. Confirm obstetric recommendations route to the obstetric/maternity area at the engine-assigned (biased-up) acuity, stay provisional, and that the ~30-min rescoring figure is presented as a published-protocol reference, not a MedSync order. Confirm the obstetric red-flag -> obstetric-emergency escalation wording.

4. DOWN-DISPOSITION GATES: confirm the L4 (fast-track) and L5 (virtual/non-urgent) down-routing gates — incompleteVitals===false AND provisional===false AND no fired discriminators/dangerVitals — are sufficient to prevent unsafe under-triage. This is where under-triage harm concentrates; sign off the gate explicitly.

5. VIRTUAL STREAM (L5): the virtual workflow does not exist as a live seam today (pending-intent). Confirm L5 suggestions must NOT imply a patient has actually been routed to a live virtual service, only that virtual is the appropriate stream when the workflow lands.

6. LIVE-SEAM HONESTY: only urgent-appointment creation (origin='system_urgent') and care-team notification (notifyTriageOutcome, ALERT_LEVELS=[1,2]) are live; the latter is a DEPARTMENT-WIDE in-app broadcast to all clinical cadres, and its SMS/push transport is a logged no-op stub (stubbedNotificationSink). Confirm disclosure wording: high-acuity recommendations must still prompt an in-person/verbal hand-off and must NOT present 'notified' as guaranteed delivery or as a guaranteed SENIOR acknowledgement. Everything else (sepsis/DKA/stroke/major-haemorrhage/pre-eclampsia pathways, re-vitals timers, onward routing to unconfigured departments) is pending-intent: recorded, not executed.

7. RESPONDER CADRE VOCABULARY: escalation suggestions stay at 'senior clinician / critical-care-capable responder' because MedSync cannot know each hospital's staffing model. Confirm how clinical_cosign_policies / resolveTriageAuthority (lib/triage/authority.ts) maps a finding + the triager's cadre to the actual responder, and whether senior co-sign is required when a lower-authority cadre triages a computed L1/L2. (needs-CSO-input — no external guideline sets cadre names.)

8. OVER-REACH BOUNDARY WORDING (drug/dose/fluid): sign off that every suggestion stays category-level. Specific high-risk lines to ratify the boundary on: hypoglycaemia (stops at 'oral glucose if alert / escalate for parenteral' — NO 15g, NO 20% dextrose volume, NO glucagon dose); sepsis (lactate + cultures + access only — NO antibiotic, NO 30 mL/kg); oxygen ('titrate to target saturation' — NO flow rate/device/FiO2; flag over-oxygenation risk on clinician-enabled Scale 2); major-haemorrhage and pre-eclampsia/eclampsia (flag + escalate only — NO tranexamic acid, NO transfusion ratios, NO magnesium sulfate, NO antihypertensive agent/dose). Recommend a build-time guard/lint that rejects dose/volume tokens in suggestionText.

9. DKA / OCCULT-SHOCK / qSOFA-without-infection are SCREEN PROMPTS, not confirmed pathway flags (engine sees glucose only, not ketones/acid-base; SI cannot confirm aetiology; qSOFA alone != sepsis per SSC 2021). Confirm wording stays 'consider / screen for' rather than asserting a diagnosis.

10. PATHWAY FLAGS ARE FLAG-ONLY: sepsis/DKA/stroke/major-haemorrhage/pre-eclampsia named pathways are later workflow builds with no live seam. Confirm a flagged pathway is RECORDED (triage_recommendations row, seamType='pending_intent') and never silently dropped, and never renders bundle/treatment steps.

11. AUTO-CREATE GATING: confirm the live urgent-appointment seam (L1/L2 secure clinician time; L3-L5 routine/virtual slot) stays accept/modify/dismiss and is NEVER auto-booked without clinician confirmation, so a suggestion never silently becomes an action.

12. SCHEMA SIGN-OFF: approve the additive triage_recommendations table (one row per suggestion with its own accept/modify/dismiss lifecycle, actor, timestamp, seam linkage, mandatory sourceCitation). Confirm migration sequencing at build time (latest on disk is 0037; next file is conventionally 0038 but is NOT asserted here) and that the table is additive with no triage_records column change or backfill.

## §6 — What happens after sign-off (build plan, gated)

On CSO sign-off of this mapping + schema + open-question answers:

- **[GATE B]** Pure, deterministic recommendation engine (finding → suggestions + rationale + source), recompute-on-override, no auto-execution, unit-tested incl. sepsis/DKA/obstetric/paediatric + boundary cases.
- **[GATE C]** Recommendations panel in the triage page's **"Next Steps"** region (already shipped as a placeholder seam), each suggestion with rationale + accept/modify/dismiss; live seams wired (urgent appointment, care-team notify); pending-intents recorded ("workflow to follow"); recompute on override.
- **[GATE D]** Closeout + CSO sign-off: suggestions-never-orders verified, transparency verified, recompute verified, audit verified, no dosing, pending intents preserved, a11y AA, ADR + CHANGELOG.

**The actual order/protocol execution workflows remain a later build.** This layer only suggests and leaves the seam.
