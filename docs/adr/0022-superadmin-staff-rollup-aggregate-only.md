# ADR 0022 — Superadmin staff rollup is aggregate-only

**Status:** Accepted (2026-05-27)
**Context:** Hospital-admin Staff Management feature kickoff §4. Follows ADRs 0019–0021.

## Problem

The superadmin needs to oversee staff state across the platform — backlog depth, which hospitals are sitting on stale queues, total cadre footprint. The natural shape is a cross-tenant dashboard. The risk is that the dashboard becomes a back-door into individual-tenant data the superadmin shouldn't see in passing (council numbers, names, specifics of a specific clinician's affiliation).

A second risk: building a _new_ god-mode path that lets the superadmin act on staff cross-tenant outside the existing audited flows.

## Decision

The superadmin staff rollup (`/admin/staff-rollup`) ships as **aggregate-only, read-only**:

- One KPI row (Active / Pending / Suspended / Hospitals with stale queue) and one per-hospital totals table (hospital, level, active count, pending count, suspended count, oldest-pending-days).
- Zero individual-row data. No staff names. No council numbers. No PHI.
- Zero new mutation paths. Every action on a specific affiliation continues to flow through the existing `approve-staff-affiliation` / `reject-staff-affiliation` / `ha-set-staff-status` / etc Edge Functions — all of which already write `sa_audit_log` rows when the caller is a superadmin (the role check at the top of each function doesn't change behaviour based on which role is invoking; the audit captures both).

## Why no separate "escalation" field

The kickoff considered an `escalated_to_superadmin` flag the hospital admin could set on an affiliation. Investigated and rejected:

- The existing superadmin Approvals queue at `/admin` already surfaces **every** tenant's pending staff_affiliations (the layout has a service-client fetch with no hospital filter). A hospital admin who can't resolve a queue item can ping the superadmin, who can act from the existing queue — no schema change needed.
- An explicit "escalate" flag would invite use as a routing primitive (admin clicks Escalate, item moves to superadmin's pile, admin's pile empties). That's confusing: items continue to exist in the hospital's queue regardless of whether the superadmin has seen them.
- If "escalation" becomes a real product concept later (e.g. with SLAs and notifications), the right shape is a small `staff_affiliation_escalations` table with reason, escalator, escalated_at — not a boolean. We defer that.

## Stale-queue health signal

Configurable constant `STALE_DAYS_THRESHOLD = 14` matches the per-tenant pending queue's aging chip thresholds:

- under 3 days → neutral
- 3–6 days → "pending" tone
- 7–13 days → caution (amber)
- ≥ 14 days → critical (red, fires the stale-queue signal)

The same numbers across both surfaces means the hospital admin and the superadmin see the same colour for the same row. Discovered drift was a clear cue we got the numbers wrong.

The threshold is a product judgment — Caroline / Usama can tune it without code change beyond editing the constant. Whatever it ends up at, the rollup's amber-row tint and the per-tenant aging pill should stay in lockstep.

## Per-hospital row sort

Stale + non-zero pending first, then by pending depth, then alphabetic. The intent: the superadmin scans top-down and the rows that need the most attention sit at the top.

## What this is NOT

- Not a place to take action. The page links into `/admin` (existing queue) for the act-on-a-row path.
- Not a per-tenant analytics tool. Per-tenant operational analytics live inside `/hospital-admin` for that tenant's admin.
- Not a search surface. Find-by-name lives in the existing `/admin` People + ⌘K palette.

## Consequences

- The superadmin can spot a hospital with a stale queue in one glance. They can drill into Approvals and triage from there with full audit trail.
- The boundary "superadmin sees aggregates, hospital admin sees rows" stays clean. Any future feature that wants to expose individual-tenant data on a superadmin surface needs an explicit ADR.
- A hospital admin gaining superadmin in the future doesn't need a separate "I can see across tenants now" toggle — they already have the existing Approvals queue.
