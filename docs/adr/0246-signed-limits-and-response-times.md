# ADR 0246 — Critical limits, reference ranges and response times are signed per-hospital sets, with two signatures

**Status:** Accepted — 2026-10-11 (owner, also the CSO; [GATE A](../lab/phase-1/gate-a-proposal.md) D-LAB1-08, D-LAB1-10, D-LAB1-11, D-LAB1-12). Built on `feat/lab-safety-floor` behind `LAB_CRITICALS` / `LAB_UNITS_RANGES`; migrations 0102–0106 are GATED and owner-applied. No clinical value is set by this decision.

## Context

Law: no clinical number in code, seeds or copy. The numbers belong to the hospital and must be signed by people
accountable for them.

## Decision

1. `critical_limit_versions` + `critical_limits`, `reference_range_versions` + bands, and `critical_response_versions`:
   one versioned set per hospital. Each is a draft until signed by the laboratory lead **and** the CSO, two different
   people (a database CHECK). A signed set is never edited; editing opens a new draft, and the signed set stays in force
   until the draft is signed (S34).
2. The laboratory lead signs in lab set-up with a fresh second factor (the authenticator code again within 10 minutes).
   The CSO countersigns in the super-admin console (`/admin/lab-signoffs`), because no in-app CSO role exists. D-LAB1-12's
   exception (one person holds the superadmin, CSO and owner roles today) is recorded in words when it applies.
3. A limit's unit comes from the catalogue. A limit whose test's unit has since changed never fires, and set-up lists it
   (S32).
4. Fixtures in tests and in the harness are invented values, named as fixtures.

## Consequences

- No unsigned limit or range has fired.
- Until the hospital signs, the screens say what is not signed, and production refuses the flags that depend on it.
