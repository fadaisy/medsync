# ADR-0062 — Review of Systems (ROS) engine: catalog upgrade + three-state sweep

**Status:** Accepted (GATE A signed off 2026-06-07). Built on `feat/clerkship-review-of-systems`.
**Context:** addendum to ADR-0060 (symptom-capture engine) / 0061 (doctor-created complaint) / 0059 (encounter–clerkship). Source: `clerkship-review-of-systems-addendum.md` (functionality + UI guide) + the ROS catalog doc.

## Decision

A system-grouped, **tap-first screening sweep** (Review of Systems) replaces the clerkship's History segment, built as an **upgrade of the existing symptom catalog** (one catalog serves both HPC capture and the ROS — no parallel store).

1. **Three-state model.** Every screening symptom is **not-asked / denies / present**. `not-asked` is the **absence** of an observation — never persisted. Only `present` + `denies` are stored, so **pertinent negatives are captured + queryable**. The UI gives each state a distinct treatment (icon + label + tone, never colour alone).

2. **Catalog upgrade (migration 0045, GATED).** `symptom_catalog` += `ros_screen`, `is_pain` (auto-maps SOCRATES), `must_not_miss`, `uganda_flag`; the body-system vocabulary expands to B1–B12. The shared property library is reused (generic `duration`/`severity` from 0042; pain symptoms auto-map SOCRATES); the per-symptom value-sets follow the 0043 prefix pattern (`ros_<symptom>_<prop>`). `encounter_symptom_observations` += `status` ('present'|'denies'). Seed: 81 ROS screens (16 existing upgraded via `ON CONFLICT`, 65 new), 204 properties, 341 options, 298 maps — from Hutchison Box 1.7; **CSO signs**.

3. **Engine (pure).** `lib/clerkship/ros.ts`: `RosObservation`, `renderRosProse` (per-system: positives reported, negatives as denials — the running documentation), `rosProgress` (systems reviewed + positives), `rosObservationRows` (status rows incl. denies). Stored in the clerkship `section_data` (`history.ros`, versioned/append-only) + fanned to the projection (best-effort, never fails the save).

4. **UI (`ros-review.tsx`).** Collapsible per-system sections; persistent progress bar; per-system roll-up chip; one-tap **"All negative"** (sets unanswered → denies, collapses); `present` → the tap-first property capture (**optional** on a screen); **carried-over** presenting-complaint symptoms shown already-positive (locked, not re-asked); `must_not_miss` = amber **attention** (clinical-red reserved for emergencies, per the design-system safety rule); aria-pressed / keyboard-navigable.

5. **Form.** Tabs: Complaint · **Review of Systems** · **Background** · Examination · Assessment · Plan. The History segment is replaced; PMH / drug history / allergies / social / SOCRATES move to **Background** (ratified at GATE A).

## Defaults ratified at GATE A (CSO)

- Replace History with ROS; move PMH/drugs/allergies/social to a new Background tab.
- Seed the full B1–B12 IM-first catalog.
- Upgrade the existing catalog (not a parallel store).

## Consequences

- One catalog drives HPC capture, doctor-created complaints, and the ROS.
- Pertinent negatives are first-class (queryable), satisfying the "not-asked ≠ denied" requirement.
- Decision-support, not autonomous — nothing is auto-marked; `must_not_miss` flags are prompts, never diagnoses.
- Migration 0045 is GATED — joins 0043/0044 in the `db:migrate` queue (CSO applies).
