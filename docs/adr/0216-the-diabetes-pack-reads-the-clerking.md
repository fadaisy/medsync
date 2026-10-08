# ADR 0216 — The diabetes pack reads the ten-step clerking, behind a flag

**Status:** Built, off — 2026-10-08. Owner-set flag `NCD_DM_DESK` (`1` or a comma list of hospital ids; only where
`CLERKING_V2` is on). Mapping judgement calls await the CSO (`docs/ncd/diabetes/desk/mapping-rulings.md`); clinical
use also needs the four-eyes second reviewer (D-NCD-17). Builds on ADRs 0204–0208; replaces the module button of
PR #201 where the flag is on.

## Context

ADR 0208 put the pack on the NCD clerkship: a separate form the clinician fills in. The owner's intent (2026-10-06)
was different: the pack belongs inside the encounter, so that as one clerks it recognises a person with diabetes and
suggests the diagnosis without a second form. A feature map (2026-10-06) found that the ten-step record already
answers about two thirds of the pack's inputs, including every Uganda 2026 diagnosis criterion, the ketoacidosis,
hyperosmolar and hypoglycaemia interrupts, the foot and the eye; eGFR, potassium, creatinine, lipids and the
pregnancy dates were the gaps.

## Decision (owner, 2026-10-08)

1. **The pack reads the clerking record.** `lib/ncd/pack/from-clerking.ts` turns the desk's examination context
   (history answers, past history with "About the diabetes", medicines, examination, vital signs with glucose and
   HI/LO, result facts) plus the problem list and the visit's diagnoses into the pack's input. Blank is never
   negative; capillary glucose comes only from the vital signs, never from a laboratory fact. The desk now loads
   potassium, creatinine, lipids, urine protein and the pregnancy dates, and computes eGFR from creatinine with
   CKD-EPI 2021 (the registry's function; owner decision).
2. **Its result goes where the clinician already looks** (`lib/ncd/pack/desk.ts`):
   - **Flags:** the one interrupt is an urgent "Diabetes: act now"; same-day items and medicines to review are
     caution flags, a red therapy flag urgent. Decision support only (ADR 0165).
   - **Impression:** one diabetes suggestion, worded by the pack. Type 2 and "type not yet determined" become one
     chip whose first reason is the pack's verdict ("Uganda 2026 criteria met: …", or "Possible diabetes: … a classic
     symptom or a repeat result on another day"); type 1 keeps its own must-not-miss chip with the same first reason.
     A met verdict with no chip adds one. The desk's own rules still find the case.
   - **A Diabetes profile card** beside the note appears by itself once the pack sees diabetes or a reason to suspect
     it: the criteria sets, what the findings support, results to read with care, targets, what is due, and what
     would complete the picture, each linked to the step where it is asked.
   - **Plan:** the due checks and targets, as read-only suggestions; nothing is ordered.
3. **Questions the clerking lacks.** The important ones join the clerking steps as CSO-signed catalogue additions;
   the rest are asked in a short "More diabetes questions" pop-up opened from the profile card. Answers there fill
   only what the record does not answer; the record wins. The full-module button goes where the flag is on.
4. **The browser runs it,** as in ADR 0208: the lean pack is sent with the desk and recomputed with each change.

## Consequences

- Off, nothing changes. On, the NCD module's separate form is only the extra questions.
- The mapping is clinical judgement in places; each call is listed for the CSO and can be changed in one file.
- Desk flags written by the clerking catalogues (for example high ketones) can sit beside the pack's interrupt for
  the same event; they come from different signed rule sets and both are shown.
