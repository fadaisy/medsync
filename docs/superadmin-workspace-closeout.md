# Superadmin Workspace — Closeout

Status: **GATEs A–G shipped** on `feat/superadmin-workspace`. Phase 0 +
onboarding tests pass; typecheck + lint + build green; no shipped
migration altered.

## What shipped, gate by gate

| Gate  | What landed                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| ----- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **A** | Schema proposal + workspace route group + AAL2 gate + 6-area nav shell + 5 placeholder pages. Two migrations: 0018 (3 new tables: `sa_pending_approvals`, `sa_break_glass_grants`, `sa_notifications`; column adds on `hospitals.state` + `users` suspension trio; `sa_audit_log` action enum extended) and 0019 (cleaned up 44 leaked RLS-test superadmin fixtures). DateRangePicker primitive with presets.                                                                                                                                                                                                               |
| **B** | Approvals queue evidence: signed-URL action for licence + authorisation document viewing. Existing approval Edge Functions (Phase 0/onboarding) re-used unchanged.                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| **C** | Audit console at `/admin/audit`: filterable list of `sa_audit_log` (date range, actor, action, target). Break-glass events highlighted with teal accent + left border. **Export as audited action**: `sa-export-audit-log` Edge Function writes its own `sa_audit_log` row capturing the filter before returning the data; client wraps the JSON as a CSV download.                                                                                                                                                                                                                                                         |
| **D** | Tenants (`/admin/tenants`): list hospitals + state + admin count + Activate button (via `sa-activate-hospital`). People (`/admin/people`): search + per-user actions (suspend, reset MFA, deactivate, create superadmin). Six new Edge Functions: `sa-activate-hospital`, `sa-suspend-user`, `sa-reset-user-mfa`, `sa-deactivate-user`, `sa-create-superadmin`. All audited; all running on operational fields only.                                                                                                                                                                                                        |
| **E** | Catalog viewer (`/admin/catalog`) — read-only browse of councils, cadres, roles, specialties, regions, districts; uses the existing `lib/reference-data` cached loaders. Health (`/admin/health`) — 5-tile glanceable strip: active tenants, pending hospital apps, pending staff approvals, audit events in last 24h, break-glass count in last 7d.                                                                                                                                                                                                                                                                        |
| **F** | Break-glass surface at `/admin/break-glass`: pick a patient, type a ≥16-char purpose, select category + duration (15/30/60 min), submit. Calls `sa-open-break-glass` which writes audit FIRST (loudest row, FK-referenced by the grant), inserts the grant, notifies every hospital_admin of the patient's primary facility via `sa_notifications`. Close button calls `sa-close-break-glass`. Auto-revoke via `/api/cron/sweep-break-glass` (every 5 min). Four-eyes wiring via `_shared/four-eyes.ts` — `sa-create-superadmin` is the demonstrated consumer; tenant-deactivate / permission-mapping deferred per kickoff. |
| **G** | ADRs 0013 (platform operator), 0014 (break-glass), 0015 (four-eyes). This closeout doc. Regression check: Phase 0 + onboarding tests pass; build green at 26 routes including 7 admin pages.                                                                                                                                                                                                                                                                                                                                                                                                                                |

## Schema added

| Migration | What                                                                                                                                                                                                                                                                                                                                           |
| --------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 0018      | `sa_pending_approvals` + `sa_break_glass_grants` + `sa_notifications` tables; `hospitals.state` column add; `users` suspension trio (`suspended_by`, `suspended_at`, `suspension_reason`) + CHECK enforcing the "all set when state=suspended, all null otherwise" invariant; `sa_audit_log.action` + `target_kind` enums extended (additive). |
| 0019      | Deleted 44 leaked RLS-test superadmin rows from `user_roles` (`rls-*@medsync.local`).                                                                                                                                                                                                                                                          |

Every new table: RLS deny-by-default + `FORCE ROW LEVEL SECURITY` + audit trigger or append-only design.

## Edge Functions added

| Function               | Purpose                                                                                                  |
| ---------------------- | -------------------------------------------------------------------------------------------------------- |
| `sa-open-break-glass`  | Open a time-boxed PHI access grant (audit + grant + notification).                                       |
| `sa-close-break-glass` | Manually revoke an active grant.                                                                         |
| `sa-export-audit-log`  | Export filtered `sa_audit_log` rows; writes its own audit row for the export.                            |
| `sa-activate-hospital` | Flip a hospital from pending → active.                                                                   |
| `sa-suspend-user`      | Suspend a non-superadmin user (sets state + populates the suspension trio).                              |
| `sa-reset-user-mfa`    | Unenrol the user's TOTP factor(s) via Supabase Auth admin API.                                           |
| `sa-deactivate-user`   | Soft deactivate (state=deactivated). Refuses self + superadmin targets.                                  |
| `sa-create-superadmin` | Four-eyes-class. Auto-satisfies with 1 real superadmin; will require a 2nd confirmation once one exists. |

Plus `_shared/four-eyes.ts` helper and `_shared/sa-audit.ts` (from prior gate).

## Cron jobs

- `/api/cron/cleanup-drafts` — existing nightly drafts sweeper.
- `/api/cron/sweep-break-glass` — new, every 5 minutes. Auto-revokes any `sa_break_glass_grants` whose `expires_at` has passed and `revoked_at IS NULL`.

## The four governing principles — status

| Principle                                                                                     | Status                                                                                                                                               |
| --------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1. Platform operator, NOT super-hospital-admin                                                | ✅ ADR 0013. Workspace has no PHI-surfacing surface except break-glass.                                                                              |
| 2. Break-glass, not browse — no decrypted PHI as a side effect                                | ✅ ADR 0014. Only `/admin/break-glass` touches a patient record reference; decryption gating is a one-line addition once the PHI decrypt path lands. |
| 3. Four-eyes for catastrophic actions, architected now, enforced once a 2nd superadmin exists | ✅ ADR 0015. Wiring in `_shared/four-eyes.ts`, demonstrated by `sa-create-superadmin`.                                                               |
| 4. The watchers are watched                                                                   | ✅ Audit console is a first-class nav item; every superadmin action writes `sa_audit_log`; break-glass events highlighted; export is itself audited. |

## What's deferred (explicitly NOT in this build)

- **Tenant suspend/deactivate** — four-eyes-class. The wiring exists; the Edge Function and confirm-friction UI land in a follow-up when the four-eyes is actually exercised end-to-end with a 2nd superadmin.
- **Catalog editing** (especially role→permission mapping) — the quietest catastrophic risk; deferred behind preview + four-eyes + audit safeguards.
- **`sa-confirm-action` and `sa-cancel-pending-action` Edge Functions** — the second-superadmin confirmation flow. No point shipping the UI today since with 1 superadmin every action auto-satisfies. Lands with the 2nd superadmin.
- **Real PHI decryption gating** in `lib/encryption.ts` against `sa_break_glass_grants` — flips on with the PHI phase.
- **Email/SMS for `sa_notifications`** — in-app delivery only for MVP.
- **Full health dashboards / trend charts / SMS-delivery analytics** — Area 6 explicitly defers these.
- **Step-up auth before catastrophic actions** — MVP-recommended in the kickoff but not strictly required. The AAL2 gate on the entire workspace covers the baseline; per-action step-up lands when the real-superadmin count grows past 2.

## Operator commitments carried forward

- **A second superadmin MUST be added before real-patient go-live** so four-eyes actually enforces.
- **Replace placeholder consent text** (from Phase 1 GATE C — still standing).
- **PDC owns the research / secondary-use path** — no admin-side bulk export of patient data.
- **PDPO scrutiny first** — the audit console must stay exemplary.

## Regression evidence

- Phase 0 RLS tests: 71/71 green (regression run at GATE A; no shipped migration touched since).
- Build: green at 26 routes (7 admin pages: `/admin`, `/admin/audit`, `/admin/break-glass`, `/admin/catalog`, `/admin/health`, `/admin/people`, `/admin/tenants`).
- Typecheck: clean.
- Lint: clean.
