# ADR-0061 — Doctor-created complaint = attributed, reusable catalog TEMPLATE (structure-only)

**Status:** Accepted (GATE A signed off 2026-06-07). Built on `feat/clerkship-create-complaint`.
**Context:** addendum to ADR-0060 (symptom-capture engine) / ADR-0059 (encounter–clerkship).

## Decision

A clerking doctor can **create a complaint (symptom) not in the catalog** — name + body system + synonyms + a **mapping of EXISTING properties** — and save it as a **reusable catalog template**.

1. **Template = structure only.** A saved complaint stores the symptom DEFINITION + its property MAPPING. It **never** stores the patient-specific values the doctor taps during the clerking — those persist to the encounter (`encounter_symptom_observations` + clerkship `section_data`) exactly as before. This is both a usefulness requirement (a template must be reusable for any patient) and a privacy requirement (no patient data in a shared/personal definition). Enforced at a single pure choke-point, `templateStructure()` (lib/clerkship/complaint-template.ts), which picks only the template fields and discards everything else — unit-tested.

2. **Attribution (immutable).** Each created complaint records `created_by_user_id` + a denormalized `created_by_name` (from `DoctorScope.fullName`) + `created_at`, and displays **"Created by Dr X · date"** wherever it appears. A `BEFORE UPDATE` trigger (`symptom_catalog_lock_attribution`) makes those columns immutable. The proposal/approval trail (`catalog_proposals.reviewer*`) completes the provenance.

3. **Two-tier governance (reuses the engine's model).** A created complaint is **`scope='personal'`** by default — usable by its creator immediately (attributed, audited), visible only to them (RLS: shared rows → all; personal rows → creator + superadmin). A **"propose to shared catalog"** action files a `catalog_proposals` row (kind `symptom`, payload carries the mapping); on CSO/superadmin **approval**, `reviewProposal` **promotes** the row to `scope='shared'` and applies the mapping. The shared catalog is **never directly mutated by a user**.

4. **Reuse-only properties (v1).** Mapping reuses the existing property catalog (with its value-sets). Defining a genuinely new property is deferred to the propose path (keeps value-set integrity under CSO review).

## Defaults ratified at GATE A (CSO, "do whats recommended")

- Default scope: personal-to-creator + propose-to-shared (not silently global).
- Who may create: all clerking doctors + clinical officers (anyone passing `requireDoctorScope`).
- New properties: reuse-only in v1; new ones via propose.
- Approval: CSO / superadmin.

## Schema (migration 0044, GATED)

`symptom_catalog` += `created_by_user_id`, `created_by_name`, `scope` (`shared`|`personal`), `origin` (`seed`|`doctor`|`approved`); scope/origin CHECKs; `(scope, created_by_user_id)` index; attribution-immutability trigger; RLS replaced with scope-aware SELECT. Mapping reuses `symptom_property_map`. Versioned reference data; idempotent.

## Consequences

- Doctors extend the catalog at the point of care without blocking on governance, while the shared catalog stays CSO-curated and accountable.
- Decision-support, not autonomous: the doctor defines the structure; the system stores + reuses it. No auto-generation of complaints/properties.
- `loadSymptomCatalog(viewerUserId)` now returns shared ∪ the viewer's personal templates.
