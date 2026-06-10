# ADR-0064 — Clerkship remaining history sections (PMH/PSH/Drug/Family/Social/ICE), tap-first

**Status:** Accepted (GATE A signed off 2026-06-10). Built on `feat/clerkship-history-sections`.
**Context:** addendum to ADR-0060 (symptom-capture) / 0062–0063 (ROS). Source: `clerkship-history-sections-catalog.md` (Hutchison Ch 1) — IM-first, Uganda-relevant.

## Decision

The remaining clerkship history sections — **Past Medical, Past Surgical, Drug & Allergies, Family, Social/Personal, ICE** — built as **tap-first** structured capture (curated pick-lists + chips/toggles/number-pickers; free-text is the per-item fallback). A normal full history is captured with **little or no typing**.

1. **Pick-lists = ONE generic governed table** (ratified at GATE A). Migration **0046 (GATED)** `clerkship_picklist` keyed by `list_type` (condition[shared PMH+FH] / operation / allergen / drug / occupation / exposure / immunisation), with RLS + immutable attribution + scope/origin — the symptom_catalog governance shape. Seed: **117 CSO-signed items**.

2. **Structured entries → `section_data`** (`history.pmhItems / pmhScreen / pshItems / medications / allergies / negatives / familyHistory / fhScreen / socialHx / ice`) — versioned/append-only. **No migration** for the entries.

3. **Reuse, don't duplicate (the wiring).** PMH chronic/active conditions → **`problem_list`** (`deriveClinicalObjects`); drugs → **`encounter_medications`**; allergies → **`patient_allergies`** (surfaced at prescribing). The routine drug pick-list is seeded into `clerkship_picklist` (the existing prescribing catalog is emergency/crash-cart-only).

4. **Tap-first derived values + screens.** **Pack-years** auto-calculated (never typed); **CAGE** as a supportive 4-tap score (≥2 = prompt to explore, not a label); **always-screen** toggle sets (PMH §1c, FH §4b) as fast yes/no/unsure.

5. **Explicit recorded negatives** — NKDA / no significant PMH / no previous operations / no regular meds / non-smoker / no alcohol are **recorded** (a `negatives` flag + nil prose), never blank-implied. not-recorded ≠ negative.

6. **Carry-forward.** A returning patient's stored record (active `problem_list` + `patient_allergies` + active `encounter_medications`, via `loadPatientClinicalRecord`) is surfaced as a **confirm/import strip** — review, don't re-enter.

7. **Governed ad-hoc.** "Other (specify)" items are kept **per-encounter, local** in `section_data` (`adHoc`), never mutating the shared list. Propose-to-shared review reuses the existing `catalog_proposals` path (extension tracked as follow-up).

## Defaults ratified at GATE A (CSO)

- One generic `clerkship_picklist` table; structured entries in `section_data`.
- Full IM-first + Uganda-relevant content; sensitive sections framed non-judgmentally.

## Consequences

- One governed catalog + the encounter objects serve the whole history; no parallel stores.
- Sensitive sections (alcohol/drugs/social) are wellbeing-framed; screens are prompts, never conclusions.
- Decision-support, not autonomous — nothing auto-marked; the clinician elicits + decides.
- Migration 0046 is GATED — joins the `db:migrate` queue (CSO applies). The engine/UI ship on deploy; the pick-lists populate once 0046 is migrated.
