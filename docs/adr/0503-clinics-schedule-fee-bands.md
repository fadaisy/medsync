# ADR 0503 — Fee bands and fee resolution

**Status:** Proposed — 15 Nov 2026. GATE A (docs/clinics-schedule/gate-a-proposal.md) provisional, **not signed**. Built on `feat/clinics-schedule`.

## Context

Fees were one number per clinic or per cadre. The canvas prices by the grade of the clinician seen.

## Decision

Per hospital: a band table (nurse or midwife, clinical officer or allied, medical officer, specialist, consultant; general and private). A clinic is free, one fee, or by band with explicit per-clinic overrides. Clinic days with mixed grades show the range; the desk charges the grade seen; doctor's times show the exact fee. A band change must be published by a different admin than its author (four-eyes; no medical superintendent role exists yet). Starting numbers are draft content until signed.

## Consequences

No fee literal in components. service_line_fees (per cadre) stays readable and is listed in the parity map.
