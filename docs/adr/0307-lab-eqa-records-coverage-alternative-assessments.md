# ADR 0307 — External quality assessment: records, coverage and alternative assessments

**Status:** Accepted — 2026-10-13 (owner, also the CSO, on the instruction to pass every gate on the recommendations: [GATE A](../lab/phase-3/gate-a-proposal.md)). Built on `feat/lab-quality-registers` behind its flag; migrations 0112–0118 are GATED and owner-applied. No clinical value is set by this decision.

## Context

EQA rounds were tracked on paper. A test with no scheme needs another check (split samples, inter-lab comparison),
and an unacceptable result must lead to a review of patient results.

## Decision

1. Three tables (`0115_lab_eqa.sql`): `lab_eqa_schemes` (the covered tests are the enrolment), `lab_eqa_rounds`
   (samples, our results, the provider's scores, `scored_on`, the report reference) and `lab_alt_assessments`.
2. **Scores are the provider's** (EA-3): entered once, only after our results and the submitted date, exactly as
   reported (score, kind, value, limit, target, bias if given). MedSync never re-scores.
3. **Who tested** is checked against patient releases for the scheme's tests in the operational window before
   receipt; a tester who does not run patients is warned about, never refused (EA-2).
4. **Unacceptable** opens a nonconformity (not halting) with a look-back of in-house released results of that
   component from the receipt day to the scoring day, hospital-local (EA-4); sorted by the provider's bias only when it
   gives one.
5. **Coverage** (EA-5): each in-house test is covered by a scheme or by an alternative assessment within the lead's
   period; the page shows "{n} of {m} tests have no EQA". With no period set, no alternative assessment covers.
6. HIV panel samples are counted in HMIS 10.3 under EQA by kit, never as patient tests (EA-6).
7. Behind `labEqa` (`LAB_EQA`), `/lab/quality/eqa`.

## Consequences

The provider's report is a reference text (no storage bucket). Scheme names stay as the lab knows them (OA-7).
