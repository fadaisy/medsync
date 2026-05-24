# ADR 0015 — Four-eyes for catastrophic actions

**Status:** Accepted (superadmin-workspace kickoff §5).
**Date:** 2026-05-24.

## Context

Certain actions in the platform are catastrophic if performed wrongly
and effectively irreversible: deactivating a tenant, demoting another
superadmin, bulk-exporting platform data, editing role→permission
mappings that widen who sees PHI across every hospital at once. A
single-actor path here is the wrong shape — but waiting for a "two
superadmins required" rule until a second superadmin exists means
either (a) the catastrophic action is impossible until then, or (b)
the wiring is added later and the first-time use is the load test.
Neither is acceptable.

## Decision

Build the **four-eyes wiring** now; activate enforcement when the
real-superadmin count reaches two.

The wiring is in `supabase/functions/_shared/four-eyes.ts`:

- `requestFourEyes()` — inserts a row into `sa_pending_approvals`
  with the action + payload + justification + requested_by.
- `countRealSuperadmins()` — counts `user_roles WHERE role =
'superadmin'` _excluding_ leaked RLS-test fixtures
  (`@medsync.local` domain). This is belt-and-suspenders on top of
  migration 0019's fixture cleanup.
- With **one** real superadmin: the row inserts as
  `state = 'auto_satisfied'`. The caller proceeds with the action
  and then calls `markFourEyesExecuted(pendingId)`. The row records
  that four-eyes was _attempted_ and that it auto-satisfied because
  no second superadmin exists yet.
- With **≥ 2** real superadmins: the row inserts as
  `state = 'pending_second_approval'`. The caller stops and returns
  `{ pending_id }` to the UI. A _different_ superadmin must call
  `sa-confirm-action` (deferred; lands when the 2nd superadmin
  arrives). The DB CHECK enforces `approved_by != requested_by` so
  one person can't double-approve even if the application layer is
  bypassed.

Each catastrophic action's Edge Function opts in via
`requestFourEyes` rather than bespoke logic. `sa-create-superadmin`
demonstrates the pattern; tenant deactivate, permission-mapping
edits, bulk export will use the same wrapper when they ship.

## Why this shape

- **Transparent today.** Every catastrophic action's
  `sa_pending_approvals` row carries `state = 'auto_satisfied'` +
  the `real_superadmin_count_at_request` in the audit's `after_data`
  — so an auditor can see exactly when four-eyes started enforcing
  vs. when it was auto-satisfying. The transition is logged.
- **Single rewrite-free flip.** Adding a 2nd superadmin doesn't
  require any code change to activate enforcement. The
  `countRealSuperadmins()` returns 2 and the next request inserts
  in `pending_second_approval`.
- **Same machinery, multiple actions.** A new four-eyes-class action
  is a 5-line addition: define the action in the CHECK enum (already
  done for the planned set), call `requestFourEyes` with the right
  `action` + `targetKind`, branch on `proceed`.

## Alternatives considered

- **"Hard-code four-eyes once we have a 2nd superadmin."** Rejected:
  the first time a catastrophic action runs through the new code path
  is the worst possible load test.
- **"Two-of-N approval (3+ superadmins → 2 needed; 2 superadmins → 1
  needed)."** Considered. Over-engineering for current scale; the
  rule reverts to "1 needed" the moment we drop below 2. Re-visit if
  the operator team grows past 3.

## Consequences

- The kickoff's commitment stands: **a second superadmin must be
  added before real-patient go-live** so the catastrophic actions are
  actually two-eyes-gated when patient data is on the line.
- The People UI surfaces "awaiting second superadmin approval"
  inline on the "Create superadmin" form so the operator sees the
  pending-row state immediately when it's not auto-satisfied. The
  dedicated "/admin/pending-approvals" review screen lands with the
  2nd superadmin (no point shipping a screen that no one can use).
- Bypass paths are explicitly forbidden: each Edge Function is the
  only place its target table can be mutated (RLS UPDATE for
  authenticated is REVOKE'd or absent on each affected column).
