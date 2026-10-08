# ADR 0218 — Vital signs carry a standard classification beside NEWS2; the desk's side panel folds

**Status:** Accepted — 2026-10-08 (owner, also the CSO). Bands signed by the CSO on 2026-10-08
(`data/clerking/vital-classification.v1.json`).

## Context

The clerking desk's left panel scored each vital sign for NEWS2 only. The owner asked for a standard, colour-coded
interpretation of each vital (not NEWS2), with blood pressure switchable between guidelines, while NEWS2 stays as it
is. The owner also asked for a calmer right-hand panel: squarer flag badges with a styled hover card, criteria sets
that show which parts are met, a shorter "Due or to consider" list, and segments that fold. Saved anthropometry
disappeared from view after "Save as a new set".

## Decision

1. **Classification beside NEWS2**, adults only (no label under 18, with age unknown, or for BP in pregnancy):
   blood pressure by ACC/AHA 2017 (default), ESC/ESH 2018, ISH 2020 or Uganda UCG 2023, switchable per browser and
   never written to the record; pulse, respiratory rate, SpO₂ (scale 2 against 88–92%), temperature (38.0 °C is
   Fever, matching the examination's fever line; 37.5–37.9 Raised) and glucose (hypoglycaemia levels, HI/LO). Red
   only for a genuine emergency (hypertensive crisis, SpO₂ below 90, hypothermia, glucose below 3.0 or HI/LO); every
   label is a word. NEWS2 is unchanged.
2. **Body measurements** (weight, height, BMI with its WHO class, waist with its risk) show in the left panel, and
   each anthropometry field shows its last saved value.
3. **Side panel:** flag badges are squarer with a styled hover card (each reason under where it came from); each
   diabetes criteria set opens on hover or tap to show its criteria part by part, judged exactly as the engine
   judges them (`explainCriterion`); "Due or to consider" shows short titles with the full wording one tap away;
   Flags, Diabetes (and its parts) and Note fold (native `<details>`).
