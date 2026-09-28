# ADR 0187 — The general formulary MS-RX-CAT-001

**Status:** Proposed — 2026-09-28. The catalogue is draft (v0.1) and carries no dose. Every entry needs the CSO's
sign-off; until then it is decision support for browsing only.

## Context

Outside resus, MedSync has no drug catalogue: the EMR sheet offers the emergency formulary and free text. The Plan
needs a classified, generic-only list so a prescriber goes diagnosis → class → drug with taps. The pack delivers
`drug-catalogue.v0.json` (14 systems, 69 classes, 182 drugs, 100 diagnosis links, 28 allergy groups) and a
validator, with every dose `to-verify`.

## Decision

1. **Data, not code.** The JSON is the source, copied to `data/prescribing/drug-catalogue.v0.json`.
   `scripts/prescribing/gen-formulary.ts` generates `lib/prescribing/reference/general-formulary.ts` (typed `Drug`,
   `DrugClass`, `DrugSystem`, `DiagnosisLink`); a drift test fails when the two differ.
2. **The validator's rules are tests** (`tests/prescribing/general-formulary.test.ts`), including the dose-content
   guard: no dose text in any entry whose dose is not `verified`.
3. **Dose shape.** `dose.status` is `to-verify | verified`, with `csoSigned`. A regimen is
   `{id, label, band (adult | olderAdult | child), doseNum, unit, strength?, route, method?, freq, course?,
perKg? {amount, unit, max?}, sources [{url, quote, checkedAt}]}`, plus per-band text and renal and hepatic notes.
   The pack README's `verified-pending-cso` / `signed` states map to `verified` with `csoSigned` false / true.
4. **Verification order:** Medscape, then the Uganda Clinical Guidelines 2023, then BNF / BNFC. Every value needs a
   URL, a verbatim quote containing the numbers, and the date checked. Where sources disagree both are recorded and
   the Uganda guideline is preferred for local practice. The verifier sets `verified`; only the CSO sets `csoSigned`.
5. **The signed emergency entries are carried unchanged.** `glucose_iv` → `glucose_10`, `glucagon_im` → `glucagon`,
   `crystalloid_bolus` → `sodium_chloride_0_9` and `ringers_lactate`. Their values are copied verbatim from
   `emergency-drug-catalog.ts`; each regimen cites the entry's source by name with `checkedAt 2026-06-03` and no URL,
   because the signed entry records none and none is invented. The glucose entry's "75 mL of 20%" option has no
   catalogue drug and stays a quote. No older-adult regimen exists in those sources, so none is shown.
6. **Brand names are never shown.** Strengths come from the pharmacy system, never from the catalogue.
7. **The diagnosis → class map** is labelled "Draft map, not CSO-signed" wherever it shows.

## Consequences

- At launch only the three emergency entries pre-set a dose; every other drug is typed.
- `abx.cephalosporin.2` is not reached by any diagnosis link; it is still found by search.
- Appendix A (dose verification) runs when Medscape, UCG and BNF are reachable; they were not from the build
  environment.

## Alternatives considered

- **Hand-written TypeScript:** harder to review against the validator and the pack.
- **Store the formulary in the database now:** premature; the list changes weekly while drafted, and the signed
  reference entries already live in code.
