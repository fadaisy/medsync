# ADR 0043 — Triage page is a three-zone live working surface (no scroll for the core loop)

**Status:** Accepted — 2026-06-01
**Context:** The triage page stacked everything vertically: Patient → Vitals → Red-flags → Assign → (scroll) → Next steps. The suggested next actions were **below the fold**, so the clinician had to scroll away from the vitals to see "what to do" — breaking the assessment loop. Triage is really a tight loop: enter a value → see what it means → see what to do.

## Decision

Reflow the existing surface into **three co-visible zones** (layout + reactivity ONLY — no engine/scoring/recommendation change):

- **Left — patient & context:** entry type, identity, the live acuity chip, the Resus fast-path. The "who + how urgent right now" anchor.
- **Centre — the assessment:** the vital-sign grid with the **red-flag checklist co-visible directly beneath it** (not a separate scroll section), and the Assign-acuity control at the bottom. Where the clinician's hands are.
- **Right — live intelligence:** the score panel (NEWS2 total, shock index, qSOFA, MAP, worse-of lane) **AND the Next Steps**, both updating live. **The key change: Next Steps move from below-the-fold into the right rail, beside the score, visible from load.** The rail scrolls independently so the centre + score stay put.

The core loop — enter vital (centre) → score moves (right) → next steps update (right) — happens within one screen, no page scroll.

## Live flow

The engine already reruns on every keystroke (`useMemo`), so the score, derived metrics, and Next Steps recompute live. This ADR adds the visible affordances:

- A **completeness journey** in the centre: the Vital-signs hint shows which mandatory HR/RR/SpO₂ are still missing ("provisional — need RR, SpO₂"), reading the engine's own `missingRequiredVitals` (no new logic).
- **"Obtain missing vitals" pinned to the top** of Next Steps when incomplete — a presentation-layer sort in the panel, not a recommendation-engine change.
- An **aria-live region** announces the level / colour / disposition as vitals change, so a screen-reader user follows the loop.

## Responsive

- **lg+:** the three zones; right rail (score + Next Steps) sticky + independently scrolling.
- **Below lg:** single column with a **sticky live header** (the acuity chip + mini progress) above the vitals, so the result stays visible; score + Next Steps stack in the centre in loop order. Next Steps is never below the fold.

## Guardrails honoured

Engine, scoring maths, thresholds, population routing, worse-of, the red-flag set, the recommendation mapping, override behaviour, and audit are **all unchanged** — verified: the diff touches only `triage-desk.tsx` + `next-steps.tsx`; all 282 triage tests pass byte-for-byte. The clinical-safety properties (deterministic, transparent, overridable, bias-up) are preserved; the "scores 0 ≠ normal" BP/temp/DBP discipline is untouched.

## Related

- `app/nurse/triage/_components/triage-desk.tsx`, `next-steps.tsx`
- ADR 0040 (the page itself), 0041 (recommendations), 0042 (vitals catalog)
