# ADR-0063 — ROS system logic: PC-suppression + focused/complete + coverage honesty

**Status:** Accepted (GATE A signed off 2026-06-10). Built on `feat/ros-system-logic`.
**Context:** addendum to ADR-0062 (Review of Systems engine). Source: `clerkship-ros-system-logic` addendum. **No migration** — coverage state lives in the encounter's `section_data`.

## Decision

Two pieces of clinical logic + a UI pass on the Review of Systems, so the ROS mirrors real clerking without ever clinically hiding a system.

1. **Rule 1 — PC-system suppression.** The presenting complaint's owning **system(s)** are derived from the `system` of **every** HPC/PC symptom (multi-system supported — chest pain + SOB → CVS _and_ Respiratory; **bias to include**). Those systems are **explored in depth in the HPC**, so they are **not re-screened** in the routine ROS — shown with a **"covered in HPC"** chip and **kept openable** (suppress = "not re-asked," never removed). Derivation is deterministic + shown.

2. **Rule 2 — Focused vs Complete.** The clinician chooses the ROS scope: **Complete** (screen all non-suppressed systems — the **default**) or **Focused** (tap which systems to review). PC-suppression applies in both; the clinician can switch focused→complete or open any system at any time.

3. **Coverage honesty.** Per system the record distinguishes **reviewed (findings) / reviewed (all-negative) / HPC-covered / not-reviewed (focused-out)** — and **not-reviewed is never auto-marked negative/normal** (a focused-out or untouched system ≠ "all negative"). The honest summary reads e.g. _"Cardiovascular: see History of Presenting Complaint. Respiratory: denies cough. Not reviewed: GI, neuro (focused assessment)."_

## Defaults ratified at GATE A (CSO)

- Default scope = **Complete** (bias to thoroughness; focus down when wanted).
- The HPC does **not** additionally prompt the PC-system's key screening symptoms in v1 (the HPC captures the PC symptom's own detail; the "covered in HPC" mark suffices).
- Multi-system PC → derive the **full set**, bias to cover.

## Implementation

- **Engine (pure, TDD)** `lib/clerkship/ros.ts`: `RosScope`, `rosCoverage` (the four states), `renderRosSummary` (HPC line + findings + honest not-reviewed).
- **State** `history.rosScope { mode, reviewedSystems }` in `section_data` (versioned/append-only) — **no DB migration**. PC-systems are derived at render time from the HPC symptoms' `system` (no storage).
- **UI** `ros-review.tsx`: scope selector, honest roll-up (reviewed / covered-in-HPC / not-reviewed), per-system covered-in-HPC + focused-out + sweep presentations; PC systems openable; focused-out systems one-tap reviewable.

## Consequences

- The ROS skips re-screening the complaint's system (covered in the HPC) — less redundant work, mirrors real clerking.
- Coverage is truthful: not-reviewed ≠ negative; nothing is auto-marked.
- Guardrails hold — suppressed + focused-out systems stay **visible, openable, switchable**; derivation is deterministic + transparent.
- Decision-support, not autonomous — never concludes a skipped system is normal, never records unentered findings.
