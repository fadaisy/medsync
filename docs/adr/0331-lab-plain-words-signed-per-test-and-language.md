# ADR 0331 — Plain words are signed per test and language, linted before they exist

**Status:** Accepted — 17 Oct 2026 (owner, also the CSO, signing Lab Phase 5 [GATE A](../lab/phase-5/gate-a-proposal.md) as recommended). Built on `feat/lab-beyond-lis`; migrations 0154–0157 are GATED and owner-applied.

## Context

Patients need a sentence beside a value, but text that diagnoses, doses or reassures is dangerous, and translations drift.

## Decision

1. `plain_words` is a signed config per component and language: what the test is, a short line, one action line per band (within, higher, lower, no range), an optional harm anchor only with a signed threshold and its source, calculated-value lines, a readability score from a named method, and for any language other than English a translator, an independent back translator and a reviewer (PW-1 to PW-6).
2. The draft is refused while it contains a banned phrase (the signed list) or a dose or treatment instruction (PW-3).
3. Without signed words the patient reads "Ask your doctor what this means."

## Consequences

Lane S27. MedSync writes no patient explanation of its own.
