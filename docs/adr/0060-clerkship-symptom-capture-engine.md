# ADR 0060 — Clerkship symptom-capture engine (tap-first history)

**Status:** Accepted (build) — **CLINICAL-SAFETY artifact; migration 0042 GATED, awaiting CSO sign-off of the catalogs + symptom→property mapping** (2026-06-05). Design in `docs/clerkship-symptom-engine-gate-a-proposal.md`; clinical source `docs/clinical/clerkship-clinical-reference.md` (Hutchison; SOCRATES).

**Context:** The clerkship history was free-text/SOCRATES-typed. The addendum requires **tap-first, minimal-typing** capture for throughput + structured/analysable data, with patient info pulled (not re-typed) and a governed path so a clinician is never trapped by the catalog.

## Decision

1. **Three catalogs + a relevance mapping, as versioned reference data** (migration 0042, GATED): `symptom_catalog`, `symptom_property` (+ `value_type` driving the tap UI), `symptom_property_option` (value-sets), `symptom_property_map` (which properties per symptom; 3 `common` properties auto-apply). The **mapping encodes what to ask** → CSO-signed. IM-first seed (16 symptoms / 20 properties / mappings), sourced from Hutchison + SOCRATES.

2. **Tap-first capture → dual output.** `lib/clerkship/symptom-engine.ts` (pure, tested) turns tapped selections into **(a) readable prose** (`history.hpc`) and **(b) structured data** — `history.hpcItems` in the versioned `section_data` **plus** a queryable projection `encounter_symptom_observations` (fanned out on finalise). No fabrication — only tapped values render. The capture UI (`/doctor/encounters/[id]`) uses chips / 0–10 scale / duration pickers; free text is the last resort.

3. **Patient info pulled, read-only** (GATE B): a patient header (name/age/sex + allergies-first) on the clerking surface; audited PHI read; corrections happen on the patient record.

4. **Two-tier governed edit/create** (GATE D): per-encounter **ad-hoc** symptoms/properties are free + local (in `section_data`, never touching the shared catalog); **propose-to-shared** routes to `catalog_proposals` → **CSO/superadmin review** (`/admin/catalog-proposals`) → approve performs the **only** governed insert into the catalog. **Clerkers propose; CSO/superadmin review.** The shared catalog is never directly mutated by a user.

5. **Decision-support, not autonomous** — it structures/records what the clinician elicits; surfacing relevant properties is structuring, not diagnosis. Reuses the encounter engine's documentation (versioned/append-only/cadre-stamped/encrypted/audited) — no parallel store.

6. **Reusable** — the same symptom+property pattern is built to drive the systematic enquiry (system-grouped) later.

## Consequences

**Positive:** near-zero-typing history capture; structured + analysable data alongside readable prose; the clinician is never trapped (local ad-hoc) yet the shared vocabulary stays curated + governed; the catalogs are one signed, versioned clinical-safety asset; gated behind `ENCOUNTER_ENGINE_LIVE` so it deploys before the migration. **Negative:** the catalogs need CSO sign-off before 0042 is applied (the mapping is clinically loaded); v1 seeds Internal Medicine only; approval auto-applies `symptom` proposals but `property`/`option`/`mapping` approvals are curator-applied (to protect value-set + mapping integrity); the body-site picker is a region select for now (a body-map is later).

## Related

- `docs/clerkship-symptom-engine-gate-a-proposal.md`, `docs/clinical/clerkship-clinical-reference.md`, ADR 0059 (encounter engine — the documentation this writes into).
- `supabase/migrations/0042_symptom_catalog.sql` (GATED), `db/schema/symptom-catalog.ts`, `lib/clerkship/{symptom-engine,catalog,governance}.ts`, the capture UI + `/admin/catalog-proposals`.
