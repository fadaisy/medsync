# Superadmin Workspace — Schema Proposal (GATE A)

> **Status: PROPOSAL. No migrations written yet.** Per the kickoff's
> integration directive, every new table appears here for review
> first. After sign-off the migrations land additively (new files,
> never editing a shipped migration).
>
> **Constants throughout:** Phase 0 patterns reused verbatim — RLS
> deny-by-default + `FORCE ROW LEVEL SECURITY`, audit trigger
> (`public.audit_log_changes()`) attached to every sensitive table,
> sensitive writes go through Edge Functions (Zod → `getUser()` →
> role check → action → PII-redacted log → audit entry → typed
> response). `sa_audit_log` is **always** written for the actions
> these tables track — these tables are operational state, not the
> audit log itself.
>
> **Open questions at the bottom — answer those + flag any schema
> concerns and I'll start migrations.**

---

## Preconditions verified

| Check                                                                         | Status                                                                                                                                                                                                                                                     |
| ----------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Phase 0 RLS tests (71/71) green                                               | ✅ at last regression                                                                                                                                                                                                                                      |
| Onboarding tables (clinician*profiles, staff_affiliations, hospital*\*) exist | ✅                                                                                                                                                                                                                                                         |
| `sa_audit_log` table + append-only triggers                                   | ✅ migration 0015                                                                                                                                                                                                                                          |
| 4 approval Edge Functions deployed                                            | ✅ approve/reject × staff/hospital                                                                                                                                                                                                                         |
| `assign-role` Edge Function (Phase 0.10)                                      | ✅                                                                                                                                                                                                                                                         |
| Superadmin seeded — Usama Fadhul (`fadhulusama@gmail.com`)                    | ✅ but seeded via manual SQL, not migration                                                                                                                                                                                                                |
| MFA AAL2 gate on `/admin` route group                                         | ✅ via `proxy.ts` (Phase 0); `lib/auth.ts` `getAuthState` already returns AAL + nextAal + mfaRequired                                                                                                                                                      |
| Project date picker primitive (`range` mode)                                  | ⚠️ existing `DatePicker` in `components/forms/date-picker.tsx` is single-date only — range mode is a GATE C dependency (audit-console date filter). Will need a small additive change (a `range` prop) or a new `DateRangePicker` component. Flagging now. |

### Two precondition concerns

1. **Usama's `users.state` is `unverified`.** He hasn't enrolled MFA. The proxy will redirect him to `/onboarding/mfa-setup` on first `/admin` visit — that's correct behaviour, just naming the surprise here so we don't think the workspace is broken when he lands.

2. **45 superadmin rows in `user_roles`; only 1 real.** The other 44 are leaked RLS-test fixtures (`rls-*@medsync.local`). This **breaks the four-eyes wiring** — the rule "auto-satisfy with 1 real superadmin, enforce with ≥2" needs a `COUNT(*)` that excludes fixtures. **Options:**
   - (a) Clean up the fixture rows on prod (the RLS tests should be wrapping in a transaction; the leak is a Phase 0 test-hygiene bug).
   - (b) Add a domain filter to the count: `WHERE email NOT LIKE '%@medsync.local'`.
   - (c) Move fixtures to a separate `auth_test` schema or use a marker column.
   - **Recommendation:** (a) — fix the leak at the source. Fall back to (b) as a runtime safeguard regardless. Flag for confirmation.

---

## Tables added in this proposal

| #   | Table                   | Purpose                                                                                                                                  |
| --- | ----------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | `sa_pending_approvals`  | Four-eyes intent + state machine — catastrophic actions wait here until a 2nd superadmin confirms (or auto-satisfy with one).            |
| 2   | `sa_break_glass_grants` | Time-boxed superadmin grants to view one patient's record for a typed-justified purpose.                                                 |
| 3   | `sa_notifications`      | In-app notifications (currently scoped to "break-glass occurred — notify the affected hospital admin"). Email/SMS deferred to PHI phase. |

**Phase 0 / onboarding tables touched (column adds only):** none. Everything below is new tables.

---

## 1. `sa_pending_approvals`

> **Purpose** — Four-eyes wiring. When a catastrophic action is
> requested (tenant deactivation, superadmin demotion, bulk export,
> permission-mapping edit), the requesting Edge Function inserts a
> row here in `pending_second_approval` state and returns
> `{ pending: true }` to the UI. A _different_ superadmin must confirm
> via a separate Edge Function call. With one real superadmin (after
> fixture cleanup), the system auto-satisfies and executes immediately
> — but the row is still written so the trail shows that four-eyes
> was _attempted_ and that it auto-satisfied because the second
> superadmin didn't yet exist.

| Column                | Type        | Notes                                                                                                                                                          |
| --------------------- | ----------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `id`                  | uuid PK     | `default gen_random_uuid()`                                                                                                                                    |
| `action`              | text CHECK  | One of: `deactivate_tenant`, `suspend_tenant`, `deactivate_superadmin`, `demote_superadmin`, `bulk_export`, `edit_permission_mapping`, `delete_reference_data` |
| `payload`             | jsonb       | Action-specific parameters. Validated by the executing Edge Function at confirm-time.                                                                          |
| `target_kind`         | text CHECK  | `hospital` \| `user` \| `role_permission` \| `reference_data` \| `export`                                                                                      |
| `target_id`           | text        | String-form id of the target row (uuid for most, opaque for bulk-export-style operations).                                                                     |
| `requested_by`        | uuid FK     | `→ auth.users(id) ON DELETE RESTRICT` (we never want a request orphaned). Required, NOT NULL.                                                                  |
| `requested_at`        | timestamptz | `default now()`                                                                                                                                                |
| `justification`       | text        | Required free-text, ≥ 8 chars (CHECK).                                                                                                                         |
| `state`               | text CHECK  | `pending_second_approval` \| `auto_satisfied` \| `executed` \| `cancelled` \| `expired`                                                                        |
| `approved_by`         | uuid FK     | nullable, `→ auth.users(id) ON DELETE SET NULL`. Must be **different** from `requested_by` when set.                                                           |
| `approved_at`         | timestamptz | nullable                                                                                                                                                       |
| `executed_at`         | timestamptz | nullable. Set after the action's Edge Function completes successfully.                                                                                         |
| `execution_error`     | text        | nullable. Captured if the action errored at execute-time despite both approvals.                                                                               |
| `cancelled_by`        | uuid FK     | nullable                                                                                                                                                       |
| `cancelled_at`        | timestamptz | nullable                                                                                                                                                       |
| `cancellation_reason` | text        | nullable                                                                                                                                                       |
| `expires_at`          | timestamptz | `default now() + interval '24 hours'`. Pending intents stale-expire after 24h.                                                                                 |
| `created_at`          | timestamptz | `default now()`                                                                                                                                                |

**Constraints / invariants:**

- CHECK: `approved_by != requested_by` when both set (four-eyes — one person can't double-approve).
- CHECK: `state = 'auto_satisfied'` IFF `approved_by IS NULL AND executed_at IS NOT NULL` (the system auto-executed with 1 superadmin).
- CHECK: `state = 'executed'` requires `executed_at IS NOT NULL`.
- CHECK: `state = 'cancelled'` requires `cancelled_at IS NOT NULL` AND `cancellation_reason IS NOT NULL`.

**Indexes:** index on `(state, expires_at)` for the pending queue; index on `(requested_by, requested_at DESC)` for "my pending requests"; index on `(target_kind, target_id)` for finding requests against a specific target.

**RLS:**

- `SELECT` superadmin only.
- `INSERT/UPDATE` service-role only (Edge Functions write directly with the four-eyes pattern).

**Audited:** yes — every state change writes to `sa_audit_log` from the executing Edge Function. The table itself also gets the generic `audit_log_changes()` trigger (defence in depth).

---

## 2. `sa_break_glass_grants`

> **Purpose** — Records every time a superadmin opens a time-boxed
> grant to view one patient's record for a typed-justified purpose.
> Per section 4 of the kickoff, the workspace itself never surfaces
> PHI as a side effect; this table is the single legitimate path,
> and every row carries everything an auditor needs.

| Column              | Type        | Notes                                                                                                                                     |
| ------------------- | ----------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| `id`                | uuid PK     | `default gen_random_uuid()`                                                                                                               |
| `actor_id`          | uuid FK     | `→ auth.users(id) ON DELETE RESTRICT`. The superadmin who requested.                                                                      |
| `patient_id`        | uuid FK     | `→ auth.users(id) ON DELETE RESTRICT`. The patient whose record is being accessed.                                                        |
| `purpose`           | text        | Required free-text justification ≥ 16 chars (CHECK). Higher bar than other reasons because this opens PHI.                                |
| `category`          | text CHECK  | `emergency` \| `regulator_request` \| `safety_review` \| `research_per_pdc` \| `other`                                                    |
| `granted_at`        | timestamptz | `default now()`                                                                                                                           |
| `expires_at`        | timestamptz | NOT NULL. Default `now() + interval '15 minutes'` — time-box.                                                                             |
| `revoked_at`        | timestamptz | nullable. Set when actor manually closes the grant.                                                                                       |
| `revoked_by`        | uuid FK     | nullable                                                                                                                                  |
| `revocation_reason` | text        | nullable                                                                                                                                  |
| `hospital_id`       | uuid FK     | nullable, `→ public.hospitals(id) ON DELETE SET NULL`. The patient's primary facility, captured at grant-time for the admin notification. |
| `notified_at`       | timestamptz | nullable. Set when the affected hospital's admin notification row is written.                                                             |
| `sa_audit_log_id`   | bigint FK   | `→ public.sa_audit_log(id) ON DELETE RESTRICT`. The audit row that captured this grant — REQUIRED.                                        |
| `created_at`        | timestamptz | `default now()`                                                                                                                           |

**Constraints:**

- CHECK: `expires_at > granted_at`.
- CHECK: `length(trim(purpose)) >= 16`.
- CHECK: revocation pair (`revoked_at`, `revoked_by`, `revocation_reason`) all null OR all set.

**Indexes:** index on `(expires_at)` for the auto-revoke sweep; index on `(actor_id, granted_at DESC)`; index on `(patient_id)` for "show me all break-glass touches on this patient."

**RLS:**

- `SELECT` superadmin (all) + the patient themselves (own row) + the hospital_admin of the affected hospital. The patient gets to see who opened their record; the hospital_admin gets to see what happened in their tenant.
- `INSERT/UPDATE` service-role only.

**Audited:** yes — every INSERT also creates the loudest `sa_audit_log` row, action `break_glass_open` (will be added to the `sa_audit_log.action` CHECK enum — additive). On expiry/revoke, action `break_glass_close`.

**Active-grant detection** for the Edge Function gating PHI decryption: `SELECT 1 FROM sa_break_glass_grants WHERE actor_id = $1 AND patient_id = $2 AND now() BETWEEN granted_at AND expires_at AND revoked_at IS NULL`. Returns true → decrypt allowed for this one read.

---

## 3. `sa_notifications`

> **Purpose** — In-app notifications. Scope for this MVP: one
> notification kind — "platform-level access occurred on a patient
> at your hospital." Sent to the affected hospital's admin(s)
> immediately after `sa_break_glass_grants` is inserted. The kickoff
> reserves email/SMS for the PHI phase; this MVP delivers in-app
> only so the surface exists and the notification is auditable.
>
> Designed to grow — additional `kind` values land via additive
> migrations as new notification types ship.

| Column              | Type        | Notes                                                                               |
| ------------------- | ----------- | ----------------------------------------------------------------------------------- |
| `id`                | uuid PK     | `default gen_random_uuid()`                                                         |
| `recipient_user_id` | uuid FK     | `→ auth.users(id) ON DELETE CASCADE`                                                |
| `kind`              | text CHECK  | `break_glass_access` (MVP). Future: `admin_action_on_tenant`, `account_security`, … |
| `subject`           | text        | Short one-line header.                                                              |
| `body`              | text        | Longer body. Plain text MVP (rendered as-is).                                       |
| `related_kind`      | text        | nullable. E.g. `break_glass_grant`.                                                 |
| `related_id`        | text        | nullable. UUID-as-text of the related row.                                          |
| `delivered_at`      | timestamptz | `default now()`                                                                     |
| `read_at`           | timestamptz | nullable. Set when recipient reads.                                                 |
| `dismissed_at`      | timestamptz | nullable.                                                                           |

**Indexes:** index on `(recipient_user_id, read_at, delivered_at DESC)` for the unread-first inbox.

**RLS:**

- `SELECT` own (`recipient_user_id = auth.uid()`) + superadmin (oversight).
- `INSERT` service-role only.
- `UPDATE` own — but only `read_at` / `dismissed_at` columns (REVOKE UPDATE on `recipient_user_id`, `kind`, `subject`, `body`, `related_*`).

**Audited:** NO — notifications are operational state, not system-of-record. Auditing every notification read would balloon `audit_log` with no forensic value. The underlying break-glass event is already in `sa_audit_log`.

---

## Edge Functions added (named here; built in their gates)

Each follows the Phase 0 pattern. Idempotency keys on writes where the operation is replayable.

| Function                   | Gate | Purpose                                                                                                                                                                |
| -------------------------- | ---- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `sa-request-action`        | F    | Generic four-eyes entry. Validates the action + payload, inserts `sa_pending_approvals`, auto-satisfies if 1 superadmin, otherwise returns `{ pending_id }`.           |
| `sa-confirm-action`        | F    | Second-superadmin confirmation. Takes `{ pending_id }`, checks the actor is _different_ from `requested_by`, transitions state, dispatches to the per-action executor. |
| `sa-cancel-pending-action` | F    | Requester or another superadmin cancels a still-pending action with a reason.                                                                                          |
| `sa-open-break-glass`      | F    | Opens a time-boxed grant; writes `sa_audit_log` + `sa_break_glass_grants` + `sa_notifications` to the affected hospital_admin(s) in one transaction.                   |
| `sa-close-break-glass`     | F    | Manual revoke. Auto-revoke handled by the cleanup cron once the grant expires.                                                                                         |
| `sa-export-audit-log`      | C    | Audited audit-log export. Exporting is itself an audited action — writes a `sa_audit_log` row with the filter the user applied.                                        |
| `sa-create-hospital-admin` | D    | Wraps Phase 0's `assign-role` with four-eyes-class wrapping. Writes `sa_audit_log` with `action='elevate_admin'`.                                                      |
| `sa-create-superadmin`     | D    | Most powerful action. Four-eyes-class (auto-satisfies with 1 superadmin, but the wiring is in place). Maximum-friction confirmation UX.                                |
| `sa-suspend-user`          | D    | Suspends a user account (sets a `suspended` lifecycle state or flag — see open Q1). Audited.                                                                           |
| `sa-reset-user-mfa`        | D    | Calls Supabase Auth admin API to unenrol the user's TOTP. The user then re-enrols on next login.                                                                       |
| `sa-deactivate-user`       | D    | Soft delete: sets `users.state = 'deactivated'`. Recovery window (re-activate via inverse function within 30 days).                                                    |
| `sa-activate-hospital`     | D    | Activates an approved hospital tenant (sets a `hospitals.state` column — see open Q2).                                                                                 |

---

## Cleanup cron extensions

The existing GATE G `cleanup-drafts` cron pattern gets one new sibling:

- `/api/cron/sweep-break-glass` — auto-revokes any `sa_break_glass_grants` row whose `expires_at` has passed and `revoked_at IS NULL`. Sets `revoked_at = expires_at`, `revoked_by = NULL` (system), `revocation_reason = 'auto-expired'`. Idempotent. Same `CRON_SECRET` bearer check.

---

## Open questions — answer these and I'll start the migrations

### Open Q1 — user suspension representation

Today `users.state` is the lifecycle enum (`unverified | verified | pending_approval | approved | active | rejected | suspended | deactivated`). `suspended` and `deactivated` are already in the enum.

The question: do **superadmin** suspensions need their own
audit-friendly representation distinct from the lifecycle state? Two
options:

| Option                                                                                    | Pros                                                        | Cons                                                                                           |
| ----------------------------------------------------------------------------------------- | ----------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| **(a) Reuse `users.state`** — set to `suspended` or `deactivated`                         | Schema unchanged, lifecycle is already the source of truth. | Loses _who_ suspended whom and _why_ unless we add `suspended_by`/`suspension_reason` columns. |
| **(b) Add `users.suspended_by`, `users.suspended_at`, `users.suspension_reason` columns** | Cheap, additive, the answer is the row itself.              | Three columns to manage; only meaningful when state=suspended.                                 |
| **(c) Dedicated `user_status_events` table**                                              | Full history (re-suspensions over time).                    | Heavier; we're not yet at the scale where event history matters.                               |

**My recommendation: (a) + (b)** — keep `users.state` as the
canonical state machine, add three columns for "who/when/why this
state change happened." Same pattern as `staff_affiliations`'
`approved_by`/`approved_at`. **Confirm or override.**

### Open Q2 — hospital tenant state

`public.hospitals` doesn't have a `state` column today; tenants are
implicitly active. The kickoff Area 2 MVP wants `pending / active /
suspended`. We need to add this — but the `hospitals` table is a
Phase 0 table.

The question: is adding a column to a Phase 0 table allowed under
the additive-only rule?

**My read:** yes — the rule is _don't restructure shipped
migrations_; an additive column add (with a default) is the
standard escape hatch. Same precedent as the onboarding migration
adding `users.state`.

**Proposed migration:**

- `ALTER TABLE public.hospitals ADD COLUMN state public.lifecycle_state NOT NULL DEFAULT 'active';`
- Backfill is trivial (everything stays `active`).

**Confirm or override.**

### Open Q3 — DateRangePicker for the Audit console

The existing `DatePicker` primitive (`components/forms/date-picker.tsx`)
is single-date only. The kickoff Area 5 says "uses the project date
picker, `range` mode." Two paths:

- **(a) Add a `range` prop to the existing DatePicker** — internally renders two native `<input type="date">` controls with a `from`/`to` pair. Smaller scope.
- **(b) Build a dedicated `DateRangePicker` primitive** — more affordances (preset ranges like "last 7 days", visual range highlight).

**Recommendation: (b)** — date ranges in admin/audit contexts benefit
heavily from presets (Today / 7d / 30d / 90d / custom). Cost is
moderate; pays off across the audit console + future analytics
surfaces.

**Confirm or override.**

### Open Q4 — superadmin fixture cleanup

44 leaked superadmin rows from RLS tests are in prod. Options:

- **(a) Write a one-off cleanup migration** that deletes
  `WHERE email LIKE 'rls-%@medsync.local'`. Destructive but
  controlled.
- **(b) Leave them; add a runtime filter** in every "count real
  superadmins" path (`WHERE email NOT LIKE '%@medsync.local'`).
- **(c) Both** — cleanup now AND keep the runtime filter as belt-
  and-suspenders for any future fixture leaks.

**Recommendation: (c)** — fixture leaks should be impossible (the
Phase 0 test setup is the bug), but having the runtime filter is
cheap insurance.

**Confirm or override.**

### Open Q5 — break-glass time-box default

Default proposed: **15 minutes**. Trade-off: shorter = forces
re-justification (good), longer = practical for legitimate review
sessions (PDPO ask, regulator interview).

**Comparable systems:** AWS console role assumption defaults to 1h;
PagerDuty escalation policies often 30m; PCI-DSS guidance suggests
session length matches "minimum needed."

**Recommendation: 15 minutes for MVP**, configurable per-grant up
to 60 minutes (UI offers preset 15/30/60). **Confirm or override.**

---

## What's deferred (explicitly NOT in this proposal)

- Email/SMS notification delivery (in-app only for MVP; PHI phase
  brings real delivery).
- Catalog _editing_ (MVP is read-only; editing requires preview +
  four-eyes + audit safeguards — defer per kickoff Area 4).
- Tenant suspend/deactivate (defer per kickoff Area 2 MVP; the
  schema supports it via Q2, the Edge Function lands when the
  four-eyes wiring is exercised).
- Permission-mapping edits (the quietest catastrophic risk —
  defer per kickoff Area 4).
- Full health dashboards / SMS analytics / trend charts (Area 6
  defer — MVP ships glanceable strip only).
- Decryption gating in `lib/encryption.ts` against
  `sa_break_glass_grants` (MVP scaffolds the grant flow + notification
  - audit; real PHI decryption gating lands with the PHI phase).
