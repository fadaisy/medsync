# ADR 0051 — Smart prescribing: the emergency drug catalog + safety engine (clinical-safety artifact)

**Status:** Accepted — CLINICAL-SAFETY artifact (CSO-supplied catalog, web cross-verified 2026-06-03; "go through all gates and finally deploy")
**Context:** The smart prescribing tool (emergency/crash-cart scope) turns a resus recommendation into a fast, safe, recorded prescription. Drug doses + concentrations are the highest-risk content in MedSync, so the catalog is reference data (not logic), every value is cited + confidence-tagged, and the engine is pure + decision-support (the clinician confirms; the app never auto-administers).

## Decision

1. **The drug content is versioned, sourced reference data** ([lib/prescribing/reference/emergency-drug-catalog.ts](../../lib/prescribing/reference/emergency-drug-catalog.ts)), encoding the CSO catalog ([docs/clinical/emergency-crash-cart-drug-catalog.md](../clinical/emergency-crash-cart-drug-catalog.md)). Each entry carries name/class/indications, the exact adult `{dose, concentration, route, interval, max}`, a weight-based `paediatric` note, cautions/contraindications/monitoring, a `controlled` flag, `tier` + `abcdeStep`, an optional `lookAlikeGuard`, `source` + `confidence`. **Concentration is first-class** (not just mg) — variants of the same molecule share a `drugKey` so the engine can guard the concentration + track cumulative dose.
2. **"Never ship a remembered dose."** Every value was web cross-verified 2026-06-03 by an 8-agent verification pass (36/36 `verified-web`) against RCUK ALS 2025 / ERC 2025 / AHA 2025 ACLS / RCUK anaphylaxis / GINA 2025 + BTS-SIGN / JBDS / BNF & SmPCs, reconciled against the CSO catalog. Category-level items (GTN, furosemide, vasopressor infusions) carry no fixed surface dose; RSI agents are record-only; flumazenil is `needs-CSO-verification` by design.
3. **The engine is pure + TDD** ([lib/prescribing/engine.ts](../../lib/prescribing/engine.ts), 19 tests): `runSafetyChecks` returns ordered `block|warn|info` flags for the six prescribe-time checks — **allergy** (block on match), **concentration / adrenaline look-alike guard** (1:1000-IM vs 1:10 000-IV, fired for any molecule with >1 concentration variant), **weight/age paediatric routing** (age < 16 → never an adult flat dose; weight required else block), **max/cumulative** (atropine 3 mg summed across the episode), **contraindication** (block on a matching condition, e.g. adenosine + asthma), **controlled** (info → witnessed capture). `resolvePrescriptionOptions` is the **smart link** — a recommendation code → pre-filled option(s), each with its own per-patient flags. `prescriptionRequiresOverride` gates confirm on a recorded override reason.
4. **Decision-support, not autonomous.** The engine surfaces; the clinician confirms. Block flags are overrideable in a time-critical resus, but the override + flags are recorded + audited.

## Consequences

**Positive:** a transparent, cited, testable prescribing brain where dose→concentration→safety is explicit and the dangerous adrenaline concentration swap + paediatric flat-dose leak are guarded by construction; the catalog updates without code changes and carries its citation; the shape extends to the full formulary later. **Negative:** the catalog must be re-verified + CSO-signed at each change (by design); category-level items intentionally show no number; allergy matching is substring-based (cross-reactivity is out of scope — flagged). Changing a dose/mapping is a CSO-authored, traceable change.

## Related

- [lib/prescribing/engine.ts](../../lib/prescribing/engine.ts), [lib/prescribing/reference/emergency-drug-catalog.ts](../../lib/prescribing/reference/emergency-drug-catalog.ts), [tests/prescribing/engine.test.ts](../../tests/prescribing/engine.test.ts)
- ADR 0052 (the accountability/administration model + pharmacy seam); ADRs 0048/0050 (the resus airway/breathing recommendations this resolves)
