# Clerkship symptom-capture engine — GATE A proposal (catalogs + mapping + governance)

**Status:** Proposed — **awaiting CSO sign-off of the catalogs + the symptom→property mapping** before migration 0042 is applied. Built A→E on `feat/clerkship-symptom-engine` ("go through all gates"); the migration is **GATED (not applied to prod)** — the catalogs (esp. the relevance mapping) encode _what to ask_, so they are clinical-safety reference data the CSO signs (same posture as 0040/0041).
**Scope:** restructure the clerkship's **history capture** to be **tap-first, minimal-typing** (addendum: _Clerkship — Structured Symptom-Capture Engine_), anchored to `docs/clinical/clerkship-clinical-reference.md` (Hutchison; SOCRATES). Decision-support + structured documentation, **not autonomous** — surfacing a symptom's relevant properties is structuring, not diagnosis.

## The principle: tap, don't type

History is captured almost entirely by **tapping pre-defined options** — symptoms, their properties, and each property's values are selectable, not free-typed. Free text is the **last resort**. This serves throughput, low-typing contexts, and **structured, analysable data**.

## A. Patient info — pulled, not typed (GATE B ✅)

The clerking surface (`/doctor/encounters/[id]`) shows a **read-only patient header** pulled from the record — name, age (from DOB), sex, patient code — plus **allergies surfaced first** (safety). No re-typing; corrections happen on the patient record. The PHI read is audited (`clinical_phi_access_log`).

## B. The three catalogs + the mapping (GATE A — CSO signs)

Versioned reference data (migration 0042), CSO-governed:

1. **`symptom_catalog`** — curated symptoms: `code, display, synonyms[] (lay-term search), system (CV/resp/GI/neuro/general), snomed/icd hints, version, source`.
2. **`symptom_property`** — qualifiers: `code, display, value_type, unit?, common (applies to all), …`. `value_type ∈ single_select | multi_select | scale | duration | boolean | text` — **drives the tap UI**.
3. **`symptom_property_option`** — each select property's **tappable value-set**.
4. **`symptom_property_map`** — **relevance**: which properties per symptom (the 3 `common` properties — onset/duration/progression — auto-apply; symptom-specific ones layer on). _This is the clinically-loaded artifact._

**IM-first seed (the catalogs the CSO reviews):** 16 symptoms (chest pain, breathlessness, cough, palpitations, leg swelling, abdominal pain, headache, fever, weight loss, dizziness, vomiting, diarrhoea, fatigue, syncope, haemoptysis, jaundice) · 20 properties (SOCRATES backbone + general + respiratory/infectious) with their value-sets · per-symptom mappings (e.g. chest pain → site/character/radiation/severity/exacerbating/relieving/associated; cough → productive/sputum colour/haemoptysis/timing; fever → pattern/rigors/travel). Sourced: Hutchison + SOCRATES. **Expandable beyond IM later.**

## C. The tap-first capture engine (GATE C ✅)

Flow: patient header (pulled) → **Add a symptom** (search the catalog, synonyms help, common surfaced first) → its **relevant properties appear** (mapping) → **tap values** (chips / 0–10 scale / duration number+unit / yes-no; free-text per-symptom note as the last resort) → **live prose preview**. The structured selections write **both**:

- **Readable prose** into the documentation (`history.hpc`, generated — e.g. _"Crushing chest pain, sudden onset, for 2 hours, radiating to left arm, severity 8/10, associated with sweating, nausea, worse on exertion."_), and
- **structured data** — `history.hpcItems` in the versioned `section_data`, **plus** a queryable projection (`encounter_symptom_observations`, fanned out on finalise) for analytics/research.

`lib/clerkship/symptom-engine.ts` (pure, tested) does the prose + the projection rows; `lib/clerkship/catalog.ts` is the read side. **Built reusable** — the same symptom+property pattern can drive the systematic enquiry (system-grouped) later.

## D. Governed edit / create (GATE D ✅) — never trapped, never fragmenting

- **Per-encounter (free):** add a symptom not in the catalog (ad-hoc), tap its common properties + a free-text note — instant, local to the encounter (lives in `section_data`), audited. **Never blocked.**
- **Propose-to-shared (governed):** a clinician can **propose** an ad-hoc symptom to the shared catalog → routes to `catalog_proposals` (pending) → **CSO/superadmin review** (`/admin/catalog-proposals`) → approve performs the **governed insert** into the versioned catalog. The shared catalog is **never directly mutated by a user**.
- **Cadre (confirmed):** **clerkers propose** (doctors + clinical officers — `CLERKING_CADRE_CODES`); **CSO/superadmin review** (one national clinical-safety asset, signed centrally).

## E. Clinical-safety + data frame

Decision-support, not autonomous (no auto-diagnosis/inference). Catalogs + mapping are CSO-signed + versioned. Structured selections write into the encounter engine's **versioned/append-only/cadre-stamped/encrypted/audited** documentation. Real data only — never auto-fill a symptom the clinician didn't tap; honest empty states. Reuses the encounter engine objects (no parallel store).

## What the CSO signs at this gate

1. The **symptom catalog** + **property catalog** + **value-sets** (tap-first types).
2. The **symptom→property mapping** (relevance — _what to ask_).
3. The **IM-first seed** content.
4. The **two-tier edit/create** model + cadre (clerkers propose, CSO/SA review).
5. Authorisation to **apply migration 0042** (explicit, named).
