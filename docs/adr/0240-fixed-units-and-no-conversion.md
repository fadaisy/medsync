# ADR 0240 — Fixed units per test component, versioned, and no conversion

**Status:** Accepted — 2026-10-11 (owner, also the CSO; [GATE A](../lab/phase-1/gate-a-proposal.md) D-LAB1-26, D-LAB1-20, E-LAB1-03, E-LAB1-07). Built on `feat/lab-safety-floor` behind `LAB_UNITS_RANGES`; migrations 0102–0106 are GATED and owner-applied. No clinical value is set by this decision.

## Context

Technologists typed or picked a unit for every value (F5). A value in the wrong unit reads as a different number to the
ward. D-CFC-14 lets clinicians record a value in any unit and converts it to a canonical one for decision support.

## Decision

1. `lab_component_measures` (migration 0103): per hospital, test and component, one current version holding the result
   type, the UCUM unit and its display, decimal places, the LOINC code and an entry check. A change is a new version
   (`superseded_by`); a version in use is never edited.
2. With `LAB_UNITS_RANGES` on, the entry screen shows the unit as text, not a picker. The value is stored as entered, in
   that unit. **Nothing is converted.** The canonical column the observation table requires is still derived, for
   decision support only; set-up refuses a unit from which it cannot be derived.
3. Every released value gets a row in `lab_result_snapshots` (value, unit, measure version, range, flags). A later set-up
   edit never changes a released result (Law 8).
4. A comma decimal ("7,2") is read as 7.2; more places than the test allows are refused (UN rules, S21).
5. With the flag off, D-CFC-14 is unchanged.

## Consequences

- No result is released without a catalogue unit; no unit is typed by hand (flag on). F5 is fixed.
- In production the flag refuses to turn on while a test ordered here in the last 90 days lacks a unit (S29).
- The lab lead must set every in-house test up before the flag is useful. Units outside the derivable set wait for a
  decision.
