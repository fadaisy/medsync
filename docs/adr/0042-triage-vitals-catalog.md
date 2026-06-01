# ADR 0042 — Triage uses a versioned vitals catalog; paeds + obstetric scoring become real

**Status:** Accepted — CLINICAL-SAFETY artifact (CSO supplied + signed the catalog, 2026-06-01)
**Context:** Since the v2 engine, paediatric (PEWS) and obstetric (MEOWS) patients routed correctly but were marked **provisional / "assess manually"** — the engine had only adult NEWS2 thresholds and would not fabricate the missing rubrics. The CSO then supplied the **Vitals-Interpretation Catalog** (age-banded paediatric norms per Fleming/PALS/APLS, MEOWS obstetric thresholds, cross-vital rules, special-population modifiers). This ADR records building the engine against that catalog so paeds + obstetric scoring become **real**, with every threshold traceable to the catalog — nothing invented.

## Decision

A versioned, data-only reference module + new pure scorers, all folded into the existing worse-of. Design and **every threshold was adversarially verified** to trace to the catalog verbatim, bias up, and not fabricate (`docs/triage-catalog-build-specs.md`).

1. **Versioned reference data** (`lib/triage/reference/`) — the catalog as DATA with provenance (`CATALOG_META`, per-leaf source/version), not logic. `CSO_PAED_BANDS` (newborn→adolescent, Part C verbatim), `PAED_THRESHOLDS`, `OBSTETRIC_REF` (Part D). Thresholds update without code changes.

2. **Paediatric age-banded scorer** (`scoring/paeds-scorer.ts`) — per-vital severity vs the age band → `scoreAcuity`. The **over-flag caveat** is honoured: a lone out-of-band HR/RR is "significant"→L3 (never auto-alarmed; the catalog gives no graded PEWS sub-rubric), a single isolated mild SpO₂→L5, nothing escalates on one mild blip. Absolute red lines: SBP below the age hypotension line→L1; SpO₂<92→L2; infant <3mo + fever→L2. Consciousness is **not** scored here (no paed ACVPU rubric in the catalog — none invented; U→L1 via Step-0).

3. **Obstetric MEOWS scorer** (`scoring/meows.ts`) — Red/Yellow counts → acuity. **Hypertension is the obstetric emergency** (≥140/90 Yellow, ≥160/110 Red→L2); there is deliberately **no low-BP and no standalone-tachycardia trigger** (pregnancy: HR +10–20 normal, BP falls). The new **Modified Shock Index** (HR/MAP > 1.7) catches concealed haemorrhage.

4. **Cross-vital "smart layer"** (`scoring/cross-vital-rules.ts`) — Cushing's reflex (triad→L1 floor), temp+HR sepsis overlay (widens an already-ticked suspicion only), pulse-pressure strings, SpO₂+RR "will fail" raise-only floor. Paediatric bounds use the age band, never adult numbers.

5. **Special-population cautions** (`scoring/special-populations.ts`) — elderly/beta-blocker/athlete/chronic-baseline confounder warnings (Part E). Caution **strings only — they never change acuity** (the catalog frames them as "interpret with context").

## Two safety fixes this surfaced

- **ESI-v5 paeds gate** (under-triage protection): the adult HR>100/RR>20 danger-zone over-flagged a normal infant (HR 130/RR 35) to L2 via the worse-of. Now gated to adults (`adultDangerZone`); SpO₂<92 + the mandatory-vitals floor stay universal.
- **Infant age resolution**: the engine floors age to integer years, so an unknown-month infant arrives as `ageYears=0`. `resolvePaedBand(0)` maps to the **infant** band (hypotension <70), never the wider newborn band (<60) — chosen to avoid under-triage.

## Honest scope

- **Numeric rate-of-change (Part G) is DEFERRED** — the engine receives only `priorLevel`, not timestamped prior vitals, so a real rate signal can't be derived without fabricating one. Direction-of-trend escalation (never auto-improve) is already in place.
- **Peri-arrest (SpO₂+RR falling)** deferred for the same reason.
- **16–17y**: route to adult NEWS2 by the existing `<16` rule; the scorer returns provisional with no numeric score if ever handed one.
- The old `lib/triage/scoring/pews.ts` (flag-only) is superseded by `paeds-scorer.ts` and no longer imported.

## Consequences

**Positive:** paediatric + obstetric patients now get a real, transparent, cited acuity instead of a provisional placeholder; the worse-of is unchanged so all existing safety nets (Step-0, discriminators, ESI incomplete-floor) still apply on top; every number carries provenance and updates as data.
**Negative:** more clinical surface to maintain; paeds/obstetric still carry a `provisional` flag when vitals are missing. The catalog + scorers are clinical-safety artifacts — changes require CSO authorship.

## Related

- `docs/triage-catalog-build-specs.md` (the verified mapping), `lib/triage/reference/`, `lib/triage/scoring/{paeds-scorer,meows,cross-vital-rules,special-populations}.ts`
- ADR 0035–0041 (the triage engine, ESI-v5, rapid mode, recommendations)
