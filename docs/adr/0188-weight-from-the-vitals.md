# ADR 0188 — Weight comes from the vital signs

**Status:** Proposed — 2026-09-28.

## Context

Per-kg arithmetic needs a weight. A remembered or assumed weight is a fabricated value. ADR 0174 stores vital signs
as observation sets; the weight is the fact `obs.weight`, and `loadPrescribePatient` already reads it from the fact
snapshot.

## Decision

1. Weight-based arithmetic uses the latest `obs.weight` from the vitals, and nothing else.
2. Wherever a weight is used or shown it reads with its value, its time and its source ("58 kg · 23:10 · triage").
3. With no weight, per-kg arithmetic is not done. The regimen shows its per-kg rule, the dose stays blank, and the
   weight check says "No weight in the vitals: per-kg dose not worked out". The urine-output reference line is not
   drawn.
4. The server resolves the weight again on place; a per-kg dose placed with no weight, or with a weight older than
   the one the server finds, is refused with the newer value.

## Consequences

- A child with no recorded weight cannot have a per-kg dose pre-set; the prescriber types a dose and the child
  check still applies.

## Alternatives considered

- **Estimate from age** (APLS formula): a derived number shown as fact; not until the CSO signs a rule for it.
