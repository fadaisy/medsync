# Changelog

All notable changes to MedSync are documented here.
Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/); versioning will follow [SemVer](https://semver.org/spec/v2.0.0.html) once we tag.

## [Unreleased]

### Added — Doctor Scheduling Rework (calendar-native + queue rail) — 2026-05-27

Per [`docs/doctor-scheduling-gate-a-proposal.md`](docs/doctor-scheduling-gate-a-proposal.md). Re-expresses the doctor's scheduling life so the calendar (PR #33) is the primary canvas, with stat rail / pending-approvals rail / live queue beside it. **Presentation + orchestration only** — no engine, schema, lifecycle, scope, or audit behaviour changed beyond the single flagged addition (the walk-in producer).

**One new Edge Function** — `ha-record-walkin` (the `record_walkin` audit verb was reserved in migration 0028 but no producer existed). Creates a `queue_entries` row in state `waiting` for a department, computes `sequence_number` per (hospital, department, today), audited with operator-reason ≥ 8 chars. Callable by reception / nurse / clinician / hospital_admin at the hospital.

**Net-new doctor surface at `/doctor/schedule`:**

- **Stat rail** — Total / Confirmed / Pending / Urgent / Completed / Cancelled for the visible range. Real counts; honest zero state.
- **Pending-approvals rail** (manual-confirm doctors only) — inline Accept / Decline with audited reason via existing `ha-confirm-appointment-request` + `ha-decline-appointment-request`.
- **Department queue rail** beside the calendar — today's `queue_entries` (waiting + being_seen) for the doctor's department. Call → start encounter via `ha-start-encounter`. "Record walk-in" sheet calls the new Edge Function. Urgent walk-ins flagged rose.
- **Settings sheet** opened from the calendar top bar — auto-confirm / slot length / buffer / virtual / out-of-hours-override. Reads the **effective settings** (clinician override → dept policy → hard default); inline `(dept default)` hint shows which fields the doctor hasn't overridden. Saves via existing `ha-set-clinician-settings`.
- **"Now seeing" line** in the header — derived from the queue's `being_seen` state.

**Library:** [lib/scheduling/doctor.ts](lib/scheduling/doctor.ts) — stat counts, pending requests, dept queue today, currently-being-seen, effective settings resolver.

**Docs:** [ADR 0029 — origins-on-calendar + dept-policy resolution](docs/adr/0029-doctor-scheduling-rework.md). Notes the cadre call (NOT a gate on availability edits — operational, not clinical-safety; co-sign path additive if a future hospital insists).

**Deferred** (called out in the proposal §7):

- Card-grid + view switcher alternate browse — the calendar is sufficient for the working doctor surface; the card-grid lands as a polish pass.
- Book-on-behalf wizard — wraps `/patient/book` with a patient picker, separate ticket.
- Walk-in patient picker (currently UUID input) — lands with the patient-directory surface.
- HOD department calendar overlay — the HOD surface doesn't exist yet.
- Real monitoring engine + alerts table (the seam is in place).
- Notification dispatcher (SMS / push) — queue stays accurate.

### Added — Scheduling: Reusable Calendar (month/week/day/agenda) — 2026-05-27

Pure-UI presentation primitive per [`docs/scheduling-ui-calendar-addendum.md`](docs/scheduling-ui-calendar-addendum.md) GATE A. New [components/scheduling/calendar/](components/scheduling/calendar/): `MedSyncCalendar` orchestrator + view switcher (month / week / day / agenda); week + day share a time-grid primitive (07:00–20:00, current-time indicator, urgent ring per DESIGN-medsync.md). Availability blocks render as hatched / muted background; appointments stack on top. Click an appointment → opens the existing `AppointmentDetailSheet` (full reuse). Query helper at [lib/scheduling/calendar.ts](lib/scheduling/calendar.ts). Wired at `/doctor/schedule` + demo at `/styleguide` §14. **No engine behaviour changed.**

### Added — Doctor Workspace — 2026-05-27

Per [`docs/doctor-workspace-gate-a-proposal.md`](docs/doctor-workspace-gate-a-proposal.md). Six gates landed on `feat/doctor-workspace`. The defining feature: **cadre tailoring**, grounded in Uganda's UMDPC/AHPC hierarchy — an intern, MO, and consultant genuinely do different work, with different scope and supervision, and the workspace reflects that server-side, not cosmetically.

**Migration 0030** (additive only): four new tables —

- `clinical_supervision` — intern → consultant pairings, time-bounded; primary + backup relationship kinds.
- `clinical_cosign_policies` — per-hospital (optional per-department) policy matrix: which cadre × action requires `allowed` / `cosign_required` / `blocked`. Seeded with the default safety matrix for every active hospital.
- `clinical_cosign_requests` — workflow object for flagged actions; `pending_review` → `approved`/`returned` with a JSONB action payload snapshot.
- `clinical_phi_access_log` — append-only "who viewed which patient" log, distinct from `audit_log` (which is row-mutation). Patient-discoverable via RLS.

Plus widening of `sa_audit_log` actions: `assign_supervision`, `end_supervision`, `cosign_request`, `cosign_approve`, `cosign_return`, `cosign_cancel`, `cosign_expire`, `update_cosign_policy`, `phi_access_break_glass`.

**Cadre-shaped enforcement** (per [ADR 0027](docs/adr/0027-doctor-cadre-capability-mapping.md), clinical-safety artifact):

- Intern / Clinical Officer: routine prescription, high-cost imaging, admit, discharge → `cosign_required`. Controlled substances → `blocked`.
- Medical Officer: routine independent; controlled substances → `cosign_required`.
- Medical Officer Special Grade / Consultant / Senior Consultant: full independent scope.
- Enforced at three layers: **policy table** (hospital-configurable) → **server-side** capability resolver gating every action → **UI** rendering different framing per requirement. Clients cannot bypass.

**Patient access basis** (per [ADR 0028](docs/adr/0028-patient-access-basis.md)): legitimate clinical relationship required for PHI decrypt — `care_team` (stubbed for the future module), `active_encounter`, or `department_recent` (last 30 days). Audited on every read via `clinical_phi_access_log`.

**New `/doctor/*` workspace** — net-new sibling to `/clinician/*`; sign-in routing detects UMDPC doctor cadres on a `staff_affiliations` × `cadres` join and sends them to `/doctor`:

- Shell — sidebar + top bar with persistent **hospital + cadre indicators** (a doctor must never be ambiguous about scope). Sidebar items filter by cadre (Review queue → MO+; Supervisees → Consultant-level).
- **Overview** — cadre-shaped: junior cadres see their named supervisor + pending self-requests; senior cadres see their review-queue count.
- **Patient panel** + **patient summary** — RLS-respecting list (panel = no PHI; summary = audited decrypt). "Above your access" screen when basis fails.
- **Prescribe / order** — the cadre-enforcement proof: routine + controlled prescription forms; cap-resolved on the server; `allowed` records the action, `cosign_required` files a review request, `blocked` shows a respectful refusal.
- **Review queue** (`/doctor/cosign-queue`) — senior cadres only; approve / return-with-feedback with audited transitions.
- **Supervisees** (`/doctor/supervisees`) — consultant-level only; lists juniors paired to them.
- **Schedule** — directional landing → reuses existing `/clinician/{schedule,availability}` surfaces.
- **Alerts** — honest "monitoring connects here" stub against the future engine interface ([lib/doctor/alerts.ts](lib/doctor/alerts.ts)).
- **Care team**, **Encounters**, **Tasks** — placeholder cards on the overview; full surfaces land with the clinical module.

**Server actions** — `proposeClinicalAction` (cap-resolved at request time; routes to execute / queue / block) and `reviewCosignRequestAction` (senior-only; approve / return). Both audited.

**Library:** `lib/doctor/{scope,capabilities,patient-access,cosign,alerts}.ts` — single sources of truth, all `server-only`.

**Out of scope** (deliberate, per the proposal §8):

- SOAP notes / clinical documentation engine, real prescribing form + drug catalog, lab / imaging order forms, monitoring engine, care-team coordination tables + threading, pharmacy queue, break-glass / four-eyes access (enum reserved), HOD / department-leadership surfaces, multi-affiliation workspace switcher.

### Added — Patient Workspace — 2026-05-27

Per [`docs/patient-workspace-gate-a-proposal.md`](docs/patient-workspace-gate-a-proposal.md) (signed off). Seven gates landed on `feat/patient-workspace`. The defining case: the self-registered patient with no hospital connection — the workspace is useful and non-empty in that state, with a clear path to connect.

**Migration 0029** (additive only): three new patient-owned tables —

- `personal_health_logs` (single table; `kind` discriminator covering glucose / BP / weight / SpO₂ / temperature / symptom / note / other; two numeric slots cover BP-style two-number readings without JSONB).
- `self_medications` + `self_medication_takes` (patient-managed med list with `schedule_pattern` and confirmed-taken events; "today's doses" + adherence derived live).

RLS: patient owns SELECT/INSERT/UPDATE/DELETE on own rows; superadmin SELECT for support; no clinician policy (the elevation seam lives in a future `clinical_observations` table when the clinical module ships). Per [ADR 0026](docs/adr/0026-patient-workspace-self-tracking.md).

**Care-relationship intent reuses `patient_profiles.primary_facility_id`.** The hospital directory's "Set as primary" action UPDATEs that column. No new join table; multi-hospital intent is a deliberate future migration.

**Redesigned `/patient/*` shell + home:**

- New tab bar: Home · Track · Visits · More (replaces the prior Home · Book · Visits · More). The unaffiliated patient never lands on a CTA that can't work.
- Home shows: greeting + connection-state banner (inviting "Connect to a hospital" when unaffiliated, primary-name chip when affiliated) · today's tracking glance (latest reading + today's doses, calm empty state when nothing logged) · 4-slot quick action grid · upcoming visits (affiliated only).

**New surfaces:**

- `/patient/track` — self-tracking hub (active medications + recent readings + quick actions).
- `/patient/track/log` — log a reading (kind picker, default-seeded from `patient_profiles.known_conditions`; per-kind value fields; severity for symptoms; optional note + when).
- `/patient/track/medications` — list + add + stop + mark-taken; today's adherence count per med.
- `/patient/hospitals` — MedSync directory (search by name / district / region; `Set as primary` / `Your primary` states; deep-link to `/patient/book`).
- `/patient/menu` — More tab landing (links to hospitals · profile · consent · settings · my care).
- `/patient/profile` — identity locked (read-only); editable contact / language / known conditions / next-of-kin. Encrypted PII round-trips via `lib/encryption`.
- `/patient/care` — "Available once you connect" panel when unaffiliated; framed placeholder for the clinical view when affiliated.
- `/patient/consent`, `/patient/settings` — inviting placeholders; full surfaces ship with the clinical module + notification dispatcher respectively.

**Server actions (no Edge Function — patient owns the data end-to-end):**

- `app/patient/track/actions.ts`: `logReadingAction`, `deleteReadingAction`, `addMedicationAction`, `markMedicationTakenAction`, `setMedicationStateAction`.
- `app/patient/hospitals/actions.ts`: `selectPrimaryHospitalAction`, `clearPrimaryHospitalAction`.
- `app/patient/profile/actions.ts`: `updatePatientProfileAction` (encrypts on the server before write).

**Out of scope (kicked to follow-up tickets):**

- Africa's Talking SMS / push dispatcher (reminder times stored on `self_medications.schedule_times`, not sent).
- Clinician-prescribed monitoring (`clinical_observations` + "elevate self-tracking" flow — clinical module).
- Multi-hospital care intent (single `primary_facility_id` for now).
- Patient-side encounter detail, prescriptions, lab results (clinical module).
- Tele-consult video for `type=virtual` appointments.

### Added — Scheduling, Appointments & Booking — 2026-05-27

Per [`docs/scheduling-gate-a-proposal.md`](docs/scheduling-gate-a-proposal.md) (signed off). Seven gates landed end-to-end on `feat/scheduling` — the connective tissue between patient and care team.

**Migration 0028** (additive only): 7 new tables — `availability_blocks`, `clinician_scheduling_settings`, `department_scheduling_policy`, `appointments`, `encounters`, `queue_entries`, `appointment_reminders` — plus widened `sa_audit_log` CHECKs with 16 new scheduling actions.

**11 new Edge Functions** covering the full appointment state machine (requested → pending_approval → confirmed → arrived → in_progress → completed + side states cancelled / declined / no_show / rescheduled), plus the urgent-from-alert producer interface and the arrival → queue → encounter handoff:

- `pt-request-appointment`, `ha-confirm-appointment-request`, `ha-decline-appointment-request`, `cancel-appointment`, `reschedule-appointment`, `ha-mark-no-show`, `ha-mark-arrived`, `ha-start-encounter`, `ha-set-clinician-availability`, `ha-cancel-clinician-availability`, `ha-set-clinician-settings`, `system-propose-urgent-appointment`

All follow the integration contract: Zod → getCaller → role → scope → audit → mutation → log. Every mutation requires a ≥ 8-char operator reason.

**Two new workspaces:**

- `/clinician/*` — availability editor + schedule view. `lib/clinician/scope.ts` resolves the signed-in clinician's most-recent-active affiliation. Sign-in routing sends `clinician|nurse|pharmacist|lab_tech` roles here.
- `/patient/*` — home + booking wizard + appointments list. `lib/patient/scope.ts` (MFA-optional). Sign-in routing sends the `patient` role here.

**Booking wizard** (`/patient/book`): four steps — Reason → Clinician → Date+Slot → Confirm. Server fetches clinicians + bookable blocks + live appointments for 14 days; client derives slots from the data with per-clinician slot_minutes + buffer_minutes. Virtual toggle appears only when the clinician opts in.

**Responsive primitives** (`components/responsive/`): `ResponsiveSheet`, `BottomActionBar`, `MobileTabBar`, `StepWizardShell`. One codebase, mobile-first, reflow at `md:+`. Per [ADR 0025](docs/adr/0025-responsive-patient-primitives.md).

**Urgent-from-alert seam** (`system-propose-urgent-appointment`): widening fallback (preferred department → any clinician at the hospital), picks the earliest slot across candidates, status lands at `confirmed` (urgent skips manual approval). `triggered_by_alert_id` stored as text — upgrades to FK when monitoring lands. Per [ADR 0024](docs/adr/0024-urgent-appointment-fallback.md).

**Arrival → queue → encounter handoff**: `ha-mark-arrived` flips the appointment to `arrived` and inserts a `queue_entries` row with the next `sequence_number` for (hospital, department, today). Virtual appointments skip the queue entry. `ha-start-encounter` flips to `in_progress` and creates the minimal `encounters` row — scheduling hands off there; the clinical module enriches the encounter later.

**Hospital-admin scheduling**: `SchedulingOverviewCard` self-contained server component drops into the hospital-admin overview. `/hospital-admin/scheduling` page renders the same card + a placeholder for the department-policy editor.

**Superadmin scheduling rollup** at `/admin/scheduling-rollup`: aggregate-only cross-tenant view (confirmed today / pending platform-wide / urgent today / no-shows 7d) + per-hospital table with a stale-pending column (pending ≥ 48h — safety net for "routing broken"). No PHI, no new god-mode path. Sidebar + ⌘K palette entry added.

**Lifecycle pattern documented in [ADR 0023](docs/adr/0023-appointment-lifecycle.md)** — every state transition is a dedicated Edge Function (rejected the single mega-function approach for role-rule + side-effect clarity).

**Tenant-isolation regression** at `tests/scheduling/tenant-isolation.test.ts` — proves patient-A sees only their own appointments, clinician-A sees only theirs, authenticated UPDATE on `appointments` / `availability_blocks` is refused. Skipped behind `MEDSYNC_ALLOW_RLS_DB_WRITES=1`.

**Operator actions required:**

```
npx supabase db push
npx supabase functions deploy pt-request-appointment ha-confirm-appointment-request ha-decline-appointment-request cancel-appointment reschedule-appointment ha-mark-no-show ha-mark-arrived ha-start-encounter ha-set-clinician-availability ha-cancel-clinician-availability ha-set-clinician-settings system-propose-urgent-appointment
```

**Explicit out of scope** (per GATE A proposal): Africa's Talking SMS / push dispatcher (reminders queue but don't send); tele-consult video tooling (`type=virtual` flag only); cross-hospital booking / referrals; care-team-based clinician suggestions; full clinical encounter UI; patient-punitive no-show automation; department policy editor + utilisation analytics.

---

### Added — Hospital-admin Staff Management feature — 2026-05-27

First feature plugged into the hospital-admin shell. Tenant-scoped via the shell's `requireHospitalAdminScope()` accessor; every mutation through an Edge Function that re-pins the scope check + writes `sa_audit_log`.

**New routes / surfaces**

- `/hospital-admin/staff` — three tabs (Pending / Directory / Invitations) driven by `?tab=…`; row deep-link via `?aff=…` so the slide-out panel survives revalidation.
- `/admin/staff-rollup` — superadmin's cross-tenant aggregate view (counts + stale-queue health signal, no individual-row data). Added to the superadmin sidebar + ⌘K palette as a superadminOnly entry.

**Migration 0027**

- `staff_affiliations.review_note text` (nullable) for "request more info" without rejecting. Cleared on the next approve/reject so a stale note doesn't survive the decision.
- Widens `sa_audit_log.action` + `target_kind` CHECK constraints with the new staff-management actions (`request_staff_info`, `suspend/deactivate/reactivate_staff_affiliation`, `reset_staff_mfa`, `assign_staff_role`, `invite_staff`, `revoke_staff_invitation`) and `staff_invitation` target.

**Edge Functions (6 new, 2 extended)**

- `ha-request-staff-info` — writes the review_note, state stays `pending_approval`.
- `ha-set-staff-status` — single function handling the (active|approved) ↔ (suspended | deactivated) transitions plus reactivation. Allowed transitions are explicit; anything else returns 400. Audit action varies by transition.
- `ha-reset-staff-mfa` — unenrols every Supabase MFA factor on the staff user (per-user, not per-affiliation; the reason ceremony surfaces this).
- `ha-assign-staff-role` — re-assigns role + department; validates target department belongs to THIS hospital (cross-tenant defence) and dedupes against the unique `(user, hospital, dept, role)` index.
- `ha-invite-staff` — 1–100 invitees per call (source=individual or bulk). 256-bit token per invite, SHA-256 hashed for storage, plaintext returned ONCE in the response. One audit row per invite.
- `ha-revoke-staff-invitation` — pulls an outstanding invitation; refuses to re-revoke or to revoke an accepted one.
- `approve-staff-affiliation` + `reject-staff-affiliation` — extended to clear `review_note` so the applicant's pending page never shows a stale note after the decision.

**Pending queue (GATE B)**
Evidence-in-panel slide-out with applicant identity, council + registration number, claimed role / department, the licence document (opened via the existing signed-URL flow against the `clinician-licences` bucket), and approve / reject / request-info actions. Aging chip with thresholds matching the rollup's stale-queue signal. "Info requested" pill on rows with an open review note. The applicant's `/onboarding/clinical-pending` page surfaces the note as an amber "we need more info" section.

**Directory (GATE C)**
Dense filterable table over every active/suspended/deactivated affiliation. Filter chips for status + a department select + a search input. Council registration numbers are stored plaintext (operational lookup) but rendered masked-until-expanded; click reveals per row. Per-row slide-out exposes Change role / Reset MFA / Suspend / Deactivate (active rows) or Change role / Reset MFA / Reactivate (suspended) or Reactivate (deactivated). Sensitive actions carry an amber warning banner explaining blast radius.

**Bulk invite (GATE D)**
One-textarea form (one email per line). On submit, the response's plaintext claim URLs render inline with a copy-to-clipboard button — the admin shares them out-of-band (no SMS integration yet; the kickoff's stub-or-build choice landed on build-the-DB-side, defer SMS). Invitations list shows pending / accepted / revoked / expired, sent/expires dates, inline reason-then-confirm Revoke flow.

**Overview snippet**
`StaffOverviewCard` server component: standalone, takes `hospitalId`, fetches 3 counts + renders a 3-stat grid with deep links into the Staff tabs. Already wired into `/hospital-admin` so the placeholder Overview shows real staff numbers immediately; the Overview feature prompt drops it into its KPI grid when it lands.

**Superadmin rollup (GATE E)**
KPI row + per-hospital totals table + stale-queue health-signal banner. Hospitals with `oldest_pending_days >= 14` get an amber row tint + appear in the banner. Zero-staff hospitals are listed too (silence is signal). No new mutation path: the rollup links into the existing `/admin` Approvals queue for action — the superadmin's role-check + audit there already handles the cross-tenant act.

**Tests (GATE F)**

- `tests/hospital-admin/staff-per-affiliation.test.ts` — RLS-layer regression proving (a) an admin-A anon client sees the same-clinician affiliation at A but not at B; (b) update of the B affiliation from A's session is refused; (c) suspending the A affiliation leaves B's state unchanged; (d) `review_note` clears when the affiliation leaves `pending_approval`. Skipped by default behind `MEDSYNC_ALLOW_RLS_DB_WRITES=1` (same opt-in as the rest of the RLS suite).

**ADRs**

- `0021-hospital-admin-staff-action-model.md` — per-affiliation, never per-user; reactivation lands at `approved` not `active`; MFA reset is the lone documented multi-tenant side effect.
- `0022-superadmin-staff-rollup-aggregate-only.md` — aggregate-only, no individual-row data, no new god-mode path; stale threshold = 14 days; rejects an explicit "escalation" flag in favour of the existing cross-tenant queue.

**Operator actions required**

- `npx supabase db push` to apply migration 0027.
- `npx supabase functions deploy ha-request-staff-info ha-set-staff-status ha-reset-staff-mfa ha-assign-staff-role ha-invite-staff ha-revoke-staff-invitation approve-staff-affiliation reject-staff-affiliation` to deploy the new + extended Edge Functions.

**Out of scope (explicitly)**

- SMS delivery for invitations (Africa's Talking integration is its own scope).
- Bulk CSV upload (the textarea handles ≤ 100 emails; CSV is a polish item).
- Workspace switcher for multi-hospital admins (shell ADR 0019 already deferred this; multi-hospital admins still pin to their most-recently-designated primary).

---

### Added — Hospital-admin workspace shell (overlay) — 2026-05-26

Builds the **shell** of the hospital-admin workspace per the hospital-admin shell kickoff. Not the features — those land in their own prompts. What ships here is the frame every feature plugs into: tenant-scope boundary, route guard, navigation, ⌘K palette, and the integration contract.

**New routes** under `/hospital-admin/*`. The seven feature areas (Overview, Staff, Departments, Scheduling, Admins, Audit, Profile) are reserved as routed placeholders that render the empty shell correctly. Sign-in routes `hospital_admin` users here; `/admin/*` is now superadmin-only and bounces hospital admins to `/hospital-admin` if they bookmark it.

**Tenant scope** — single source of truth:

- `lib/hospital-admin/scope.ts` → `requireHospitalAdminScope()` server-side helper. Validates auth + AAL2, resolves the admin's hospital from `user_roles` + `hospital_admin_roster`, refuses non-reachable lifecycle states (suspended / offboarded / agreement_expired). Redirects on no-scope rather than returning null.
- `app/hospital-admin/_components/scope-provider.tsx` → `useHospitalScope()` client hook. Throws when called outside the provider (programmer-error, not runtime).
- `supabase/functions/_shared/hospital-admin-scope.ts` → `requireHospitalAdminScope(callerId, hospitalId)` Edge Function helper. Re-pins the role check and refuses non-reachable hospitals at the wire.

**Shell composition** (reuses superadmin Attio primitives — re-themed via tokens, not forked):

- `app/hospital-admin/_components/hospital-shell.tsx` — 240px sidebar + 52px top bar + main slot, wrapped in `<HospitalScopeProvider>` so client features read scope without re-fetching.
- `HospitalSidebarItem` — same architecture as `AdminSidebarItem` (server passes primitives, client resolves icons + active state). Separate icon set scoped to this workspace's vocabulary.
- `MobileSidebar` — sheet-based hamburger nav for `<lg`. Sheet primitive reused as-is from `components/ui/sheet.tsx`.
- `HospitalCommandPalette` — ⌘K palette, nav-only for now. Hospital identity displayed in the modal footer so the operator can never forget the active tenant. Entry-registration contract for features to extend is documented in `docs/hospital-admin-integration-contract.md`.

**Hospital identity is ever-present** in the top bar — name + facility level + lifecycle state pill (only shown when not `active`). Replaces the superadmin's "Superadmin console · Production" strip with the tenant the admin operates on.

**Feature registration** — `app/hospital-admin/_lib/features.ts` carries the single `FEATURE_AREAS` array. The shell consumes it to build the sidebar, mobile sheet, and palette. Adding a feature is one entry; the shell doesn't change.

**Sidebar pending-staff badge** — `_lib/staff-pending-count.ts` wires the count from `staff_affiliations.state = 'pending_approval'` filtered to THIS hospital. The Staff feature prompt inherits a working badge from day one.

**Empty-state polish** — `PlaceholderSurface` component renders each reserved area as a credible page (eyebrow chip, Fraunces section title, hairline teal accent, "coming next" list) so the shell already feels Attio-grade before a single feature lands.

**Integration contract** documented in `docs/hospital-admin-integration-contract.md`. Covers: tenant scope accessors (server + client + Edge), feature registration, slide-out panel API, the Edge Function action pattern (CORS → method → Zod → caller → role → scope → audit → mutation → log → typed response), and the audit / no-decrypted-PHI rules.

**Hardened sign-in routing** — `app/(auth)/sign-in/actions.ts` now logs `routeReason: superadmin-role` / `hospital-admin-role` / `staff-affiliation-…` / `default-landing` on every successful sign-in. The `/admin` layout refuses hospital admins by bouncing them to `/hospital-admin`, never silently downgrading them.

**Regression guard** — `tests/hospital-admin/tenant-isolation.test.ts` proves the security boundary at the RLS layer: a hospital_admin scoped to A cannot SELECT, UPDATE, or probe any row in B (staff affiliations, hospitals). Skipped by default behind `MEDSYNC_ALLOW_RLS_DB_WRITES=1` — same opt-in pattern as the existing RLS suite.

**ADRs:** [`0019-hospital-admin-workspace-shell.md`](docs/adr/0019-hospital-admin-workspace-shell.md) (why `/hospital-admin` is structurally separate from `/admin`), [`0020-tenant-scope-resolution.md`](docs/adr/0020-tenant-scope-resolution.md) (why scope is helper-derived, not URL-derived).

**Out of scope (each lands in its own prompt):** Overview KPIs, Staff approvals UI, Departments + wards management, Scheduling, Admin succession transfer, Audit views, Profile edit forms, workspace switcher for multi-hospital admins, `/clinical` workspace.

---

### Added — Hospital registration upgrade (gates A–F) — 2026-05-25

Upgrades hospital onboarding from a thin account-creation flow into a full institution-onboarding system, per [`prompts/hospital-registration-upgrade-kickoff.md`](prompts/hospital-registration-upgrade-kickoff.md). Six gates landed end-to-end on `feat/hospital-registration-upgrade`. Closeout inventory: [`docs/hospital-registration-upgrade-closeout.md`](docs/hospital-registration-upgrade-closeout.md).

**Lifecycle state machine extension** — `public.lifecycle_state` enum gains `under_review`, `agreement_signed`, `provisioning`, `offboarded`, `agreement_expired`. The richer hospital path is `pending_approval → under_review → verified → agreement_signed → provisioning → active`; existing user-scoped paths (patient → active, clinician → pending → active) untouched.

**Schema additions (migrations 0020–0025):**

- `hospital_applications`: 25 additive columns covering institution profile (§B), clinical profile (§C–§E5 arrays + CHECKs + capacity bands), verification (§E6: licence + applicant + authority + callback contact), agreement metadata (§E7). Two junction tables for departments + IM sub-specialties.
- `hospital_dpa_versions` — versioned DPA text, SHA-256 anchored, append-only. Seeded with `v0.placeholder` carrying `{{LEGAL REVIEW — PLACEHOLDER}}` body until Ugandan counsel signs off on v1.
- `hospital_agreements` — per-hospital signings. `source` ∈ `applicant_flow | superadmin_offline | grandfathered`. The agreement gate is enforced server-side via EXISTS check, not FK.
- `hospital_wards` — name + bed_count + optional department FK.
- `hospital_admin_roster` — primary + backup designations with full succession trail. Partial UNIQUE ensures exactly one current primary per hospital.
- `hospital_staff_invitations` — single-use token hash; rows never grant access, only pre-fill + track intent.
- Migration 0024 grandfathers pre-existing hospitals into agreement-gate compliance (honest sentinels, no faked human names).

**Edge Functions (new + extended):**

- `approve-hospital-application` (extended) — creates hospital in `provisioning`, writes `hospital_agreements` row from the application's §E7 metadata, inserts applicant into `hospital_admin_roster` as primary. Rollback chain on partial failure.
- `sa-activate-hospital` (extended) — calls `requireCurrentAgreement` (the gate) before any state flip. Refuses 400 if no current agreement.
- `sa-create-hospital` (new) — superadmin-initiated hospital creation. Atomic chain: audit → hospital → agreement (offline) → invitation. Returns plaintext invitation token for the superadmin to share out-of-band.
- `accept-hospital-admin-invitation` (new) — invitee-only. Token + email + AAL2 + verified-TOTP checks. Writes user_roles + roster row + audits as `hospital_admin_claimed`.

**Routes added:**

- `/signup/hospital` rewritten — 7-step MultiStepForm for the expanded application (institution / departments+IM / clinical / operating / verification / agreement / account).
- `/admin/setup` — hospital_admin's 6-step post-approval setup wizard. Refuses superadmin sessions (ADR 0018 Q3). Final step calls `sa-activate-hospital` → fires the gate.
- `/admin/claim-invitation?token=…` — invitee landing for accepting the hospital_admin invitation.
- `/admin/tenants` now hosts a "Create hospital" button → superadmin-initiated create flow (Sheet).

**ADRs:**

- [0016 — Hospital verification model](docs/adr/0016-hospital-verification-model.md) — three concentric trust anchors; callback contact REQUIRED for applicant path.
- [0017 — Hospital agreement gate](docs/adr/0017-hospital-agreement-gate.md) — `hospital_agreements` is the activation gate; server-side EXISTS check; both onboarding paths feed it.
- [0018 — Superadmin-initiated hospital create path](docs/adr/0018-superadmin-hospital-create-path.md) — superadmin creates tenant not admin; wizard rejects superadmin sessions.

**Tests:** +48 (26 lifecycle, 17 RLS on new tables, 5 agreement-gate regression). Total 119/119 passing. Phase 0 + onboarding suites unchanged.

**Deferred (documented in closeout):** saved-drafts autosave/resume on the 7-step form; bulk staff invitation CSV ingest; admin succession transfer Edge Function; hospital_admin self-activation from the wizard; email delivery for invitations (currently the URL is shared out-of-band); agreement renewal flow when the lawyer-approved DPA arrives.

**Operator actions after merge:**

1. `npx supabase db push` — applies migrations 0020–0025.
2. `npx supabase functions deploy approve-hospital-application sa-activate-hospital sa-create-hospital accept-hospital-admin-invitation`.
3. When the counsel-approved DPA text arrives, insert a v1 row in `hospital_dpa_versions` with `legal_review_status='approved'` + `supersedes_id` pointing at the placeholder.

### Removed — Phase 1 onboarding rollback — 2026-05-23

The Phase 1 onboarding pass (gates A–G below) was rolled back to redesign the flow from scratch. All Phase 1 routes (`/get-started`, `/signup/*`, `/admin/*`), the seven shared form primitives, the lib helpers (`patient`, `clinician`, `hospital`, `approvals`, `lifecycle`, `reference-data`, `signup-drafts`), the Phase 1 schemas + migrations (`0006`–`0015`), `lib/auth.ts` extensions, ADR-0013, and `docs/reference-data-sources.md` were deleted. The older Phase 0 `/onboarding/{patient,clinical,hospital}` email-capture forms went with them.

Landing CTAs reverted to honest `mailto:hello@medsync.health` framing ("Email a founder") since no onboarding flow exists. `lib/auth.ts` reverted to its Phase 0 shape. `react-day-picker` removed from `package.json`.

DB rollback: paste [`scripts/rollback-phase-1.sql`](scripts/rollback-phase-1.sql) into Supabase Studio → SQL editor. Drops every table, enum, function, sequence, Storage bucket, and `users.state` column the Phase 1 era created. Idempotent.

### Added — Phase 1 onboarding (gates A–G) — 2026-05-23 [ROLLED BACK]

Opens the front door of MedSync to four audiences. Phase 0 ended with an empty authenticated shell + a public landing page; Phase 1 ships the multi-step signup flows, the approval-gated lifecycle, and the superadmin / hospital_admin review surfaces. Architecture recorded in [`docs/adr/0013-onboarding-architecture.md`](docs/adr/0013-onboarding-architecture.md); reference-data placeholder status in [`docs/reference-data-sources.md`](docs/reference-data-sources.md).

**Routes added (10):**

- `/get-started` — intent selector (3 tiles)
- `/signup/patient` + `/signup/patient/verify` + `/signup/patient/done`
- `/signup/clinical` + `/signup/clinical/verify` + `/signup/clinical/pending`
- `/signup/hospital` + `/signup/hospital/verify` + `/signup/hospital/pending`
- `/admin` (landing) + `/admin/applications` + `/admin/applications/[id]` + `/admin/affiliations` + `/admin/affiliations/[id]`

**Gates:**

- **[GATE A]** Onboarding schema + reference data. Migrations 0008 (lifecycle enum + reference tables + signup_drafts + clinician_profiles + staff_affiliations), 0009 (RLS), 0010 (seed councils / cadres / IM specialties / IM roles / regions). Drizzle schemas under [`db/schema/`](db/schema/) for the new tables; typed loaders in [`lib/reference-data.ts`](lib/reference-data.ts); lifecycle state machine in [`db/schema/lifecycle.ts`](db/schema/lifecycle.ts) + [`lib/lifecycle.ts`](lib/lifecycle.ts) (8 states; `LIFECYCLE_TRANSITIONS` enforces valid forward edges).

- **[GATE B]** Seven shared form primitives — `Combobox`, `CascadingCombobox`, `SegmentedControl`, `RadioCards`, `FileUpload`, `OtpInput`, three-mode `DatePicker` — under [`components/form/`](components/form/), all interactive on `/styleguide §14` with realistic Uganda data. Built on Base UI primitives + react-day-picker v10. Wrapped a Base UI `Popover` in [`components/ui/popover.tsx`](components/ui/popover.tsx) so every floating panel shares one surface style. All seven have arrow-key + Home/End nav, focus rings, hidden-input bridges for FormData submission.

- **[GATE C]** Patient signup end-to-end. Migration 0011 (`patient_sex` + `patient_id_type` enums, `patient_code_seq` + `issue_patient_code()` emitting MS-YYYY-NNNNN, `patient_profiles` table with CHECK enforcing `id_type`↔`id_number` presence, seeded 21 Uganda districts + 5 Kampala divisions) and 0012 (owner-only RLS). [`lib/patient.ts`](lib/patient.ts) does Supabase signUp → email OTP → encrypt NIN + phone via [`lib/encryption.ts`](lib/encryption.ts) → insert profile → lifecycle `unverified → verified → active` → MS-ID issued. Three-step form (About you / ID & location / Account & consent) at [`app/signup/patient/_form.tsx`](app/signup/patient/_form.tsx). PHI lives in a 30-min `httpOnly` + `sameSite=strict` + Secure-in-prod cookie until OTP verifies; password never enters it.

- **[GATE D]** Clinical-staff signup end-to-end. Migration 0013 creates the private `clinician-licences` Storage bucket (5 MB / PDF or JPG or PNG) with RLS that lets the owner read/write under `<user_id>/...`, the superadmin read all, and a hospital_admin read any licence whose owner has an affiliation at their hospital. [`lib/clinician.ts`](lib/clinician.ts) does Supabase signUp → service-role licence upload (the user has no usable session pre-verify) → cookie-stash metadata + path → OTP verify → insert `clinician_profile` + `staff_affiliations` + `user_roles` → lifecycle `unverified → verified → pending_approval`. Three-step form (Account / Professional identity / Affiliation). Postgres pool bumped on `lib/reference-data.ts` / `lib/patient.ts` / `lib/clinician.ts` from `max=1` to `max=3-5` with `idle_timeout: 20` — the single-socket setup serialized the clinical page's 6 parallel ref-data queries and hung dev requests for 60s; with five sockets the page returns in ~2s. Well under Supabase Free's 15-connection cap.

- **[GATE E]** Hospital application end-to-end. Migration 0014 adds the `hospital_ownership` enum, `hospital_applications` table (intentionally separate from `public.hospitals` so the rest of the app's queries stay on approved facilities only), owner-only / superadmin-read RLS, and a private `hospital-authorisations` Storage bucket with the same RLS pattern as `clinician-licences`. [`lib/hospital.ts`](lib/hospital.ts) does Supabase signUp → service-role authorisation-letter upload → OTP verify → insert `hospital_applications` row at state `pending_approval` → lifecycle `unverified → verified → pending_approval`. Three-step form (Hospital / Location & registration / Applicant & account) with level combobox, ownership segmented, district + Kampala-division subcounty cascading, letter-of-authority FileUpload mirrored to a hidden file input for FormData submission. Distinct from the landing's "express interest" capture at `/onboarding/hospital` which just lands an email in `interest_signups`.

- **[GATE F]** Superadmin + hospital*admin review queues. [`/admin`](app/admin/) shell + `requireAdminish` guard + role-aware nav. Approval logic in [`lib/approvals.ts`](lib/approvals.ts): hospital application approval inserts `public.hospitals` → sets `approved_hospital_id` → application `→ approved` → inserts `user_roles` (hospital_admin scoped to the new hospital) → lifts applicant lifecycle `pending_approval → approved → active`. Staff-affiliation approval: `pending_approval → approved → active`, and lifts the user lifecycle if it's still pending. Authorization is enforced in the \_server action* before `lib/approvals.ts` is called — `requireSuperadmin()` / `requireAdminish()` + a hospital-scope re-check on every affiliation mutation, so a forged `affiliation_id` can't bypass the scope filter. Migration 0015 attaches the existing `audit_log_changes()` trigger to `clinician_profiles`, `staff_affiliations`, `patient_profiles`, `hospital_applications`. `lib/auth.ts` extended with `roleRows: { role, hospitalId }[]` on `AuthState` + `requireSuperadmin` / `requireAdminish` / `adminHospitalIds()` helpers.

- **[GATE G]** Closeout. [`docs/reference-data-sources.md`](docs/reference-data-sources.md) records every `ref_*` catalog's source, status, and TODOs (UBOS NPHC 2024 full district + subcounty pull; pharmacy regulator name confirmation; specialty + role expansion beyond IM). [`docs/adr/0013-onboarding-architecture.md`](docs/adr/0013-onboarding-architecture.md) names the lifecycle / PHI-handling / approval / form-primitive decisions and the trade-offs we accepted. CHANGELOG + README + ADR index updated. Mobile-first + a11y verification pass on the new routes.

**Files added (Phase 1, exhaustive):**

- Schemas: `db/schema/lifecycle.ts`, `db/schema/reference-geography.ts`, `db/schema/reference-clinical-catalog.ts`, `db/schema/staff-affiliations.ts`, `db/schema/signup-drafts.ts`, `db/schema/patient-profiles.ts`, `db/schema/hospital-applications.ts`.
- Helpers: `lib/lifecycle.ts`, `lib/reference-data.ts`, `lib/signup-drafts.ts`, `lib/patient.ts`, `lib/clinician.ts`, `lib/hospital.ts`, `lib/approvals.ts`.
- Form primitives: `components/form/{combobox,cascading-combobox,segmented,radio-cards,file-upload,otp-input,date-picker}.tsx`, `components/ui/popover.tsx`, `components/styleguide/form-primitives-demo.tsx`.
- Routes: `app/get-started/page.tsx`, `app/signup/{patient,clinical,hospital}/` (page + form + actions + verify + done/pending), `app/admin/` (layout + landing + applications + affiliations queues and detail pages).
- Migrations: `0008` through `0015`.
- Docs: `docs/adr/0013-onboarding-architecture.md`, `docs/reference-data-sources.md`.

**Auth + lifecycle invariants:**

- `MFA_REQUIRED_ROLES` = clinician, nurse, pharmacist, lab_tech, hospital_admin, superadmin. Patient is opt-in.
- No clinical access before `active`; `pending_approval` accounts can sign in but the proxy routes them to MFA setup → pending screen.
- All sensitive writes go through service-role helpers; the user-context Supabase client is used only for reading-with-RLS.

**PHI posture:**

- NIN + phone encrypted at rest (AES-256-GCM, ADR-0008) in `patient_profiles`. Plaintext phone on `public.users.phone` for operational routing (SMS, support).
- Licence / authorisation documents stored in private Storage buckets keyed by `<user_id>/<timestamp>-<kind>.<ext>`, RLS gated to owner + scoped reviewer + superadmin.
- Logger only sees `user_id` and the issued patient_code; never email, name, phone, NIN, DOB.

**Deferred (out-of-Phase-1 scope):**

- Full UBOS NPHC 2024 district + subcounty seed (placeholder + tracker doc shipped this gate).
- `signup_drafts` server-side draft swap (the table exists; the cookie-to-row migration is Phase 2).
- Signed-URL helper to open the licence / authorisation file directly in the review page (today it shows the bucket path; opening is via Supabase Studio).
- Phone OTP via Africa's Talking (kickoff specifies phone primary; we use email OTP for verification this gate and store the phone for downstream SMS).
- Dashboard widget for pending clinicians / pending hospital admins (today they see status on the `/signup/.../pending` page; no link from `/dashboard`).

### Added — Landing page — Patient-experience addendum (gates PA–PE) — 2026-05-23

Weaves the patient surfaces into the landing page so the closed loop visibly has two ends. The base page (gates A–F below) was told almost entirely from the clinician / hospital side; this addendum threads the patient's view through the hero, the §07 scroll-pin, the data-sources viz, the Uganda-fit tiles, and the final CTA — plus adds one new dedicated patient chapter — without rewriting any existing section.

**Hard constraint enforced (addendum §0):** additive integration only. The diff confines to 10 files (3 new under `components/landing/`, 7 small edits to existing files). Everything outside that set renders byte-identical to before the branch. Three-door equal-weight rule preserved in `OnboardingCtaCluster`.

**Built on feature branch `feat/landing-patient-experience`. Merged to main at GATE PE.**

**Gates:**

- **[GATE PA]** [`_my-health-mock.tsx`](components/landing/_my-health-mock.tsx) — patient-end twin of the §05b `ClinicianHomeMock`. Static composition, server component, no client JS. Renders as a floating-card stack (initial phone-bezel iteration dropped at PB.1 — the bezel competed visually with the clinician dashboard). Component API: `<MyHealthMock fragment="full" | "log-reading" | "today-meds" | "sms-offline" | "report-concern" />`. Fragment variants let later gates embed individual cards inline. Reviewable standalone on `/styleguide` Section 14. Reuses Amina N. continuity: same patient, same Mulago IM-A ward, same Dr. M. Okello, same glucose series, same med list (Metformin, Lisinopril, Glibenclamide held, Insulin Actrapid). Tone (addendum §C) enforced: "5 days on track" (not "% compliant"), "held by your care team" (caution amber, never red failure), "Something feels off?" with "they'll review and reply" (calm channel, not emergency button).

- **[GATE PB]** Hero + §07 dual surfaces:
  - **`_hero-surfaces.tsx`** — wraps the existing `ClinicianHomeMock` and tucks the `MyHealthMock` into the hero section's bottom space, right-aligned at `lg+` and centred at `<lg`, with a small "… and on Amina's app at home" connecting label. `app/page.tsx` swap: `<ClinicianHomeMock />` → `<HeroSurfaces />`. ClinicianHomeMock itself unchanged.
  - **`07-platform-showcase.tsx`** — minimal surgical edit: 1 added import + 1 new internal `DualSurface` component + 2 case statements modified in `SurfaceForScene` (scene 3 Discharge + scene 4 Loop-closes now show the patient phone fragment above the existing clinician card). Scene metadata, IntersectionObserver, sticky pin, mobile fallback, motion-reduce — all unchanged.

- **[PB.1 fix]** Removed phone-bezel framing from `MyHealthMock`. The dark device shell + iOS status bar made the patient surfaces feel grafted on. Stripped to a clean floating-card stack matching the page's Attio rhythm. `_hero-surfaces.tsx` adjusted accordingly (the lg+ absolute scaled overlay was a phone-shape pattern; replaced with right-aligned cards + a small connecting label).

- **[GATE PC]** [`07b-patient-chapter.tsx`](components/landing/07b-patient-chapter.tsx) — new dedicated patient-POV chapter inserted between §07 [01] and §08 mid-band, in the same Attio "numbered chapter" archetype the existing chapters use. Page narrative now reads `platform / clinician loop → patient view → CTA break → team / specialty adaptation`. Four sub-points with alternating text/surface rows for visual rhythm:
  - a) Log in seconds, not in a notebook → `MyHealthLogReadingCard`
  - b) Never lose track of a dose → `TodayMeds` + `AdherenceStrip` + `SmsReminderChip`
  - c) Tell your team without a trip to hospital → `MyHealthReportConcernCard`
  - d) You're never logging into silence → `CareTeamReplyCard` (bespoke — Dr. M. Okello acknowledging the reading, tele-follow-up booked; closes the human-on-other-end reassurance beat)
    Card primitives exposed from `_my-health-mock.tsx` as `MyHealthLogReadingCard`, `MyHealthTodayMedsCard`, etc. for the chapter's surface composition.

- **[GATE PD]** Three remaining weaves:
  - **§10a Enrichment** ([`10-enrichment.tsx`](components/landing/10-enrichment.tsx)) — added 6th source row "Patient logs & confirmations · Amina's MedSync app" with `PATIENT` chip tag + teal-300 border highlight. FlowLines SVG paths recomputed from 5 → 6 curves. The record is now visibly "built **with** the patient, not just **about** them."
  - **§12a UgandaCapabilities** ([`12-uganda-capabilities.tsx`](components/landing/12-uganda-capabilities.tsx)) — added optional `patientSurface?: React.ReactNode` to the `Capability` interface. Offline-first tile gets a bespoke `OfflineSavedReadingCard` ("Saved · will sync when you're back online"); SMS · USSD tile gets the existing `MyHealthSmsReminderChip`. Other 3 tiles render identically. New "On Amina's phone" labelled slot above the existing Technical detail strip. The two Uganda-fit claims now ground in concrete patient experience.
  - **§16 FinalCta** ([`16-final-cta.tsx`](components/landing/16-final-cta.tsx)) — new `PatientGlimpse` sibling rendered between the closer line and the door cluster. Mini-card showing a "Fasting glucose 11.6 mmol/L · Logged from home" entry with a "Log this morning's reading" affordance and an arrow-down line: "Sign up below as a patient and this is in your hand ↓". `OnboardingCtaCluster` unchanged — three-door equal-weight rule preserved; visual pull added via the sibling, not asymmetric door styling.

- **[GATE PE]** Closeout + regression:
  - Integration scope check: diff confined to 10 files in the named scope. Zero out-of-scope edits.
  - Lint: 0 errors, 0 warnings.
  - Vitest: 71/71 pass (no existing test broke).
  - Build: 18 routes, all green.
  - Motion: every `animate-*` in PE-owned files paired with `motion-reduce:*` guard. Only one new animation across the whole addendum (motion-safe pulse on the "due now" clock icon in `MyHealthMock`).
  - A11y: section components carry `aria-label` / `aria-labelledby`; mock cards use semantic `<ul>` / `<li>` / `<article>`; non-interactive button-shaped elements use `tabIndex={-1}` to stay out of the keyboard order.
  - Tone (§C) verified: "5 days on track" not "% compliant"; "held by your care team" not "missed dose"; "Something feels off?" not "emergency"; "not a faceless AI agent" explicit in sub-point d; "works on basic phones" anchor on the SMS chip; no diagnosis copy in marketing; honest "early access" framing; named clinician (Dr. M. Okello), not anonymous AI.
  - Dev smoke: `/` 200, 615 KB (~+105 KB total from the addendum across all gates). Patient chapter, hero dual surfaces, §07 scenes 4 + 5 dual surfaces, §10a 6th source, §12a grounded tiles, §16 patient glimpse — all rendering. All untouched landing sections still rendering identically.

### Added — Landing page — Attio-archetype rebuild (gates A–F) — 2026-05-22

The public marketing page at `/` was rebuilt as a 17-section Attio.com archetype, executed as 6 gated commits (A scaffold → F closeout). Mirrors Attio's section skeleton, not its look. Spec rules enforced throughout: no fabricated logos, no fabricated testimonials, no fake certifications, no uptime numbers we haven't measured, every product mock marked ILLUSTRATIVE.

**Sections built (17 total, all real, zero stubs in production):**

- §01 [`01-announcement-bar.tsx`](components/landing/01-announcement-bar.tsx) — dismissible top strip; persists via `useSyncExternalStore` against localStorage (same-tab via custom event, cross-tab via native `storage` event).
- §02 [`02-nav.tsx`](components/landing/02-nav.tsx) — sticky-shrink nav driven by a 1px `IntersectionObserver` sentinel (no scroll listener). Hover-revealed mega-menus for Platform + Care doors. Mobile drawer with body-scroll lock.
- §03 [`03-floating-quote.tsx`](components/landing/03-floating-quote.tsx) — Fraunces-italic founders'-voice quote attributed to Usama Fadhul (Founder & Clinical Safety Officer).
- §04 [`04-sub-banner.tsx`](components/landing/04-sub-banner.tsx) — pilot-recruitment pill → `/onboarding/hospital`; live-dot ping is `motion-reduce:hidden`.
- §05a [`05-hero.tsx`](components/landing/05-hero.tsx) — H1 _"A digital hospital that doesn't stop at the gate"_ at `clamp(40px, 7.4vw, 92px)`; soft teal `oklch` radial atmosphere + inline-SVG turbulence grain; staggered `reveal-up` cascade gated on `motion-safe`; three equal audience doors via shared `OnboardingCtaCluster`.
- §05b [`05-clinician-home-mock.tsx`](components/landing/05-clinician-home-mock.tsx) — illustrative ward-overview surface; sample-data continuity: **Amina N. / MS-00184 / Mulago IM-A / Dr. M. Okello**. Inline-SVG glucose trend with 4–10 mmol/L target-band overlay, critical-alert chip, suggested-slot affordance, care-team avatars. Perspective transform with `motion-reduce:transform-none`. **ILLUSTRATIVE** badge required by spec rule #3.
- §06 [`06-trust-strip.tsx`](components/landing/06-trust-strip.tsx) — honest substitute for the logo wall: UMDPC · UNMC · AHPC · PSU chips with "Designed to comply with" framing and explicit "Not endorsements, not partnerships" caveat.
- §07 [`07-platform-showcase.tsx`](components/landing/07-platform-showcase.tsx) — 5-scene scroll-pin (`Admit → Diagnose → Treat → Discharge → Loop closes`); sticky right pane cross-fades between five focused product cards; single `IntersectionObserver` with `rootMargin: -35% 0 -35% 0` so the middle band wins; reduced-motion + `<md` drops the pin and stacks surfaces inline.
- §08 [`08-cta-band.tsx`](components/landing/08-cta-band.tsx) — mid-page dark CTA band on `bg-teal-950` with the same three doors (`tone="dark"`); no free-trial language per spec.
- §09a [`09-adaptive-model.tsx`](components/landing/09-adaptive-model.tsx) — "The closed-loop record"; 4 IM specialty tabs (Diabetology / Cardiology / Nephrology / Pulmonology); each tab swaps 6 clinical object cards (Patient / Vital / Medication / Note / Lab / Appointment) with attributes shifted per specialty (HbA1c · LVEF · eGFR · FEV1). "+N more attributes" affordance mirrors Attio. Signature-attributes strip beneath shows each specialty's diagnostic fingerprint. State-driven swap → instant on reduced-motion.
- §09b [`09-voices.tsx`](components/landing/09-voices.tsx) — three founders'-voice problem cards paired with mini answer surfaces (home-monitoring escalation, 7-day SMS adherence log, shared-record stream). Attribution "MedSync founding team" per spec rule #2 (no fabricated testimonials).
- §10a [`10-enrichment.tsx`](components/landing/10-enrichment.tsx) — 5 care-data source chips with static-SVG curved flow lines (oklch gradient) converging into a destination-card preview. Server component. `motion-safe:fade-in-slow` per path with stagger; reduced-motion gets static lines.
- §10b [`10-patient-card.tsx`](components/landing/10-patient-card.tsx) — **the page's richest single composition** (per spec). Full Amina N. unified record: header + auto-summary synthesis + triple column (Vitals: inline glucose 7d trend + BP 7d bars w/ 140 target line · Active meds: 5 lines with SMS-confirmed adherence bars · Recent labs: 6 results vs. reference ranges) + care-plan timeline (6 milestones, pulsing active dot) + care team / audit trail split. Card chrome + ILLUSTRATIVE badge.
- §11 [`11-ecosystem.tsx`](components/landing/11-ecosystem.tsx) — replaces Attio's "1000+ integrations" logo wall with a name-only grid of real Uganda care infrastructure (HMIS2/DHIS2 · NIRA · NDA · MTN · Airtel · Africa's Talking · Mulago central lab · MBN · Lancet · NMS · JMS · MoMo · Airtel Money · UAP/Jubilee · regional + mission hospitals). Each chip tagged **Integration target** — not active partnerships. Zero logos.
- §12a [`12-uganda-capabilities.tsx`](components/landing/12-uganda-capabilities.tsx) — 5 design-commitment cards (no fake uptime stats): offline-first wards · SMS/USSD reach · low-bandwidth UI · Mobile-Money payments · local data residency. Each card pairs a real-world Uganda constraint with the technical commitment.
- §12b [`12-trust-governance.tsx`](components/landing/12-trust-governance.tsx) — 6 engineering-claim pillars (no fake HIPAA/ISO/SOC2 badges). Each pillar = human claim + actual mechanism (PostgreSQL RLS, SECURITY DEFINER audit triggers, AES-256-GCM PHI encryption, mandatory AAL2 MFA, PII-redacted logging, Uganda DPA region pinning) + **receipts:** line pointing to the file in this repo.
- §13 [`13-founding-story.tsx`](components/landing/13-founding-story.tsx) — typographic narrative; UF monogram tile instead of a stock portrait; 5 paragraphs naming the two gaps MedSync exists to close (the patient walking out, the next clinician walking in).
- §14 [`14-vision.tsx`](components/landing/14-vision.tsx) — three horizons (Now / Soon / Later). The Later card carries a `Research only · subject to ethics + regulatory review` badge so closed-loop insulin dosing & OPD triage research read as research, not roadmap. No invented dates.
- §15 [`15-faq.tsx`](components/landing/15-faq.tsx) — native `<details>/<summary>` accordion (server-rendered, keyboard-accessible, no JS required). 8 honest questions including a direct "**No.** Holding none of those today" for HIPAA/ISO/SOC2 and cost-only first-pilot pricing.
- §16 [`16-final-cta.tsx`](components/landing/16-final-cta.tsx) — closing dark band on `bg-teal-950` (deeper than §08); H2 "The next era of Ugandan care doesn't stop at the gate." + closer "And the patients are waiting."; same three doors `tone="dark"`.
- §17 [`17-footer.tsx`](components/landing/17-footer.tsx) — 4-column nav (Audience doors / Platform / Built for Uganda / Legal & status) + brand block + standards strip (UMDPC/UNMC/AHPC/PSU) + Uganda DPA disclaimer. Legal links flagged "in legal review"; status "coming soon"; no fake social handles.

**Patient continuity:** Amina N. (MS-00184) is the single sample-data through-line across §05b → §07 → §09a → §09b → §10a → §10b. Same NIN-masked, same Mulago IM-A ward, same Dr. M. Okello, same glucose 14.2 mmol/L alert.

**Three audience doors** (`/onboarding/{patient,clinical,hospital}`) are the single source of truth in [`_cta-cluster.tsx`](components/landing/_cta-cluster.tsx) — change copy once, every CTA on the page updates. Three layouts (`doors` / `inline` / `pills`) × two tones (`light` / `dark`).

**Audience funnels:** new [`interest_signups`](db/schema/interest-signups.ts) table with RLS (anon `INSERT`, superadmin `SELECT`); shared server action [`app/onboarding/_actions.ts`](app/onboarding/_actions.ts) handles all three forms. Migration [`0007_interest_signups_rls.sql`](supabase/migrations/0007_interest_signups_rls.sql). Routes [`/onboarding/patient`](app/onboarding/patient/page.tsx), [`/onboarding/clinical`](app/onboarding/clinical/page.tsx), [`/onboarding/hospital`](app/onboarding/hospital/page.tsx) are publicly accessible via [`proxy.ts`](proxy.ts).

**Type system — Editorial clinical aesthetic:** Fraunces (serif display, `opsz` axis for the 92px hero H1) + Geist Sans (clinical body) + Geist Mono (tabular labs/vitals/IDs). All three loaded via `next/font/google` with CSS-variable handoff into the Tailwind v4 `@theme`, replacing the dead Neue Haas / Helvetica fallback the design system was pointing at.

**SEO shell:** full [`app/layout.tsx`](app/layout.tsx) Metadata with `openGraph` / `twitter` / canonical / `robots`; `MedicalOrganization` JSON-LD; [`app/sitemap.ts`](app/sitemap.ts) + [`app/robots.ts`](app/robots.ts); [`lib/site-config.ts`](lib/site-config.ts) centralises `SITE_URL` so the custom-domain swap is one-line.

**Closeout (GATE F):**

- Global `:focus-visible` rule in [`globals.css`](app/globals.css) (`:where(a, button, summary, [role="button"], [tabindex])`) → uniform teal keyboard-focus ring on every interactive element.
- Custom [`app/not-found.tsx`](app/not-found.tsx) — same editorial aesthetic, three audience doors so a missed link isn't a dead end. `robots: { index: false }`.
- Reduced-motion audit: every `animate-pulse` / `animate-ping` / `motion-safe:*` verified guarded.
- A11y audit: every section has `aria-label` / `aria-labelledby`; mobile drawer is `role="dialog"` `aria-modal="true"`.

**Build:** 17 routes (added `/_not-found`), 0 lint errors, 0 type errors, **71/71 tests** still passing.

### Added — Phase 0.12 (Vercel deployment) — 2026-05-22

- **MedSync is live: https://medsync-bice.vercel.app** (Vercel default URL; custom domain `medsync.health` deferred per session decision).
- New Vercel project `medsync` created and linked under `fadhulusama-gmailcoms-projects`.
- [`scripts/push-env-to-vercel.mjs`](scripts/push-env-to-vercel.mjs) — reads `.env.local` via `@next/env`, pushes each var to Vercel via `vercel env add KEY ENV --value V --force`. Idempotent. Used to push 5 required vars (`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `DATABASE_URL`, `DATABASE_DIRECT_URL`) to Production + Development.
- Preview env vars deferred — Vercel CLI's `--yes` flag is currently ignored for `vercel env add KEY preview --value V`, which prompts for a git branch even with `--yes`. Workaround documented in ADR-0012: set preview vars via dashboard if/when we cut a preview branch.
- Vercel CLI installed as a dev dep (`vercel@54.3.0`) — sandbox blocked the global install.
- Build pipeline auto-detected (Next.js 16, `next build`, output dir default). Build took 53s. Emitted 8 routes (`/`, `/_not-found`, `/sign-up`, `/sign-in`, `/sign-in/mfa`, dynamic `/dashboard`, `/onboarding/mfa-setup`, `/sign-out`, `/api/health`) plus the proxy middleware.
- Smoke verified live: `/` → 200, `/styleguide` → 200, `/api/health` → 404 (correctly env-gated to non-production).
- ADR-0012 documents the deploy decisions, the preview-env CLI bug workaround, the GitHub-remote / CI / custom-domain / separate-prod-Supabase-project follow-ups.

### Added — Phase 0.11 (Phase 0 seed) — 2026-05-22

- [`supabase/migrations/0005_seed_phase_0.sql`](supabase/migrations/0005_seed_phase_0.sql) — idempotent SQL seed:
  - 1 hospital: **Mulago National Referral Hospital** (`mulago-national`, level `national_referral`, Kampala, Central region).
  - 1 top-level department: **Internal Medicine** (`internal-medicine`).
  - 13 IM sub-specialties under it: Cardiology, Nephrology, Endocrinology/Diabetology, Pulmonology, Gastroenterology, Hepatology, Neurology, Infectious Diseases, Oncology, Haematology, Rheumatology, Dermatology, Geriatrics.
- Fixed UUIDs (`00000000-0000-0000-0000-0000000000Nx`) so later phases can rely on them in FKs / fixtures.
- Every INSERT uses `ON CONFLICT DO NOTHING` on its natural key (slug for hospital; `(hospital_id, parent_id, slug)` for departments). The migration journal also gates re-application — belt-and-braces.
- Verified live via SQL: 1 hospital + 14 department rows.

### Added — Phase 0.10 (Edge Functions foundation) — 2026-05-22

- [`supabase/functions/_shared/`](supabase/functions/_shared/) — four helpers that make the mandatory nine-step pattern uniform:
  - `cors.ts` — `preflight()` + `corsHeaders()`; origin allowlist includes `medsync.health`, `localhost:3000`, `*.vercel.app`.
  - `auth.ts` — `getCaller(request)` validates Bearer JWT via `getUser()`; `hasRole(userId, role, hospitalId?)` queries via service-role (bypasses RLS); `serviceClient()` is the one path to service-role mutations from inside Edge Functions.
  - `logger.ts` — Deno-side PII-redacted JSON logger that mirrors `lib/logger.ts`.
  - `errors.ts` — typed `{ ok, error?, data? }` envelope: `ok`/`badRequest`/`unauthorized`/`forbidden`/`conflict`/`methodNotAllowed`/`serverError`. `X-Request-Id` echoed back for triage correlation.
- [`supabase/functions/assign-role/index.ts`](supabase/functions/assign-role/index.ts) — reference function implementing the full nine-step pattern: CORS preflight → POST gate → Zod input → authn → role authz (superadmin OR hospital_admin scoped) → service-role INSERT → log → audit (automatic via 0.6 trigger) → typed response. Duplicate grants return idempotent `{ already_held: true }` rather than 409.
- [`supabase/functions/deno.json`](supabase/functions/deno.json) — Deno strict config, fmt rules.
- [`supabase/functions/README.md`](supabase/functions/README.md) — local serve + deploy commands.
- `tsconfig.json` excludes `supabase/functions/` (Deno typechecks its own).
- ADR-0011 locks in the nine-step pattern, the two-runtime duplication trade-off, and the Supabase-CLI-based deployment path.

### Added — Phase 0.9 (auth + MFA + route protection) — 2026-05-22

- [`supabase/migrations/0004_auth_user_mirror.sql`](supabase/migrations/0004_auth_user_mirror.sql) — `AFTER INSERT ON auth.users` trigger (`SECURITY DEFINER`) auto-mirrors into `public.users` with `id`, `email`, `full_name` from metadata (or email as fallback). Atomic with the auth insert; survives Server Action signups, admin API creates, and test setup.
- [`lib/auth.ts`](lib/auth.ts) — single `getAuthState()` helper returns `{ user, roles, mfaRequired, aal, nextAal }`. `MFA_REQUIRED_ROLES = { clinician, nurse, pharmacist, lab_tech, hospital_admin, superadmin }`. Always uses `getUser()` (validated), never `getSession()`.
- [`lib/supabase/proxy.ts`](lib/supabase/proxy.ts) + [`proxy.ts`](proxy.ts) — Next 16 proxy. Three responsibilities per request: (1) refresh Supabase session cookie via `updateSession()`, (2) gate public vs protected routes, (3) enforce AAL2 for users with MFA enrolled / redirect clinical-role holders to `/onboarding/mfa-setup` if not enrolled. Matcher skips `_next`, `/monitoring`, favicon, image extensions.
- Auth pages (route group `(auth)`):
  - [`/sign-up`](<app/(auth)/sign-up/>) — email / full_name / password; Zod-validated server action; trigger does the public.users mirror.
  - [`/sign-in`](<app/(auth)/sign-in/>) — email / password; honours `?redirect=<path>`.
  - [`/sign-in/mfa`](<app/(auth)/sign-in/mfa/>) — 6-digit TOTP challenge; elevates session to AAL2.
  - [`/onboarding/mfa-setup`](<app/(auth)/onboarding/mfa-setup/>) — TOTP enrolment; QR code rendered server-side via `qrcode` package (secret never leaves the server response); sweeps stale unverified factors on every visit.
- [`/dashboard`](app/dashboard/) — placeholder protected page showing user roles + MFA status.
- [`/sign-out`](app/sign-out/) — POST-only route handler (avoids GET-link CSRF logout).
- [`<AuthCard>`](components/medsync/auth-card.tsx), `<FieldError>`, `<FormError>` — shared auth-form primitives.
- Forms use React 19 `useActionState` + Server Actions; work without JavaScript (progressive enhancement).
- Tests: [`tests/auth/auth-flow.test.ts`](tests/auth/auth-flow.test.ts) — 4 cases (mirror with metadata, mirror without metadata, duplicate-email rejection, fresh user AAL state). `tests/rls/users.test.ts` updated — the trigger now creates public.users rows for us, the test seeds `full_name` via UPDATE only. Total suite **71/71 across 10 files** (~70s).
- Dependency: `qrcode` + `@types/qrcode`.
- ADR-0010 documents the trigger choice, `getAuthState` single-seam pattern, Server Action + `useActionState` over react-hook-form, the proxy logic, and per-request DB-query cost (acceptable for Phase 0; move roles to JWT `app_metadata` in Phase 1 if needed).

### Added — Phase 0.8 (logging + Sentry) — 2026-05-22

- [`lib/logger.ts`](lib/logger.ts) — structured JSON logger with field-name PII redaction. `logger.debug/info/warn/error`; `debug` no-ops in prod. Every context object passes through `redactPII()` before serialization. Redacts the kickoff-mandated set + extensions: `name`, `first_name`, `last_name`, `full_name`, `email`, `phone`, `phone_number`, `nin`, `national_id`, `date_of_birth`, `dob`, `address`, `password`, plus auth tokens / cookies / authorization. Case-insensitive; recurses through nested objects + arrays; handles `Error` (collapses to `{name, message, stack}`); circular references → `"[CIRCULAR]"`.
- `@sentry/nextjs` + `@vercel/analytics` installed.
- [`instrumentation.ts`](instrumentation.ts) (Next.js 16 pattern) — Sentry init for Node + Edge runtimes. `beforeSend` runs `redactPII()` over `extra`/`contexts`/`tags`/breadcrumbs; collapses `event.user` to `{id}`; strips cookies; allowlists request headers. `tracesSampleRate: 0.1` in prod.
- [`instrumentation-client.ts`](instrumentation-client.ts) — browser SDK with minimal `beforeSend` (lib/logger is server-only so can't ride along; patterns kept in sync).
- [`next.config.ts`](next.config.ts) — wraps with `withSentryConfig()` only when `SENTRY_DSN` is set, so contributors without a Sentry account get clean builds. Source-map upload restricted to prod. `tunnelRoute: "/monitoring"` to bypass ad-blockers.
- [`app/layout.tsx`](app/layout.tsx) — `<Analytics />` from `@vercel/analytics/next` (no-ops outside Vercel; pageview-only).
- Tests: [`tests/logger/logger.test.ts`](tests/logger/logger.test.ts) — 9 cases covering every claim in the redaction contract. Total suite **67/67 across 9 files** (~108s).
- ADR-0009 documents the design, the over-eager-by-design field-name approach, Sentry's conditional wiring, and follow-ups.

### Added — Phase 0.7 (PHI encryption) — 2026-05-22

- [`lib/encryption.ts`](lib/encryption.ts) — AES-256-GCM PHI encryption library:
  - `encrypt(plaintext)` returns `iv:authTag:ciphertext` (3 base64 segments). Fresh random 12-byte IV per call.
  - `decrypt(payload)` validates segment count + IV/tag length, then runs `decipher.final()` which throws if GCM's 16-byte auth tag doesn't validate (= any tamper rejected).
  - `generateKey()` mints a 32-byte base64 key.
  - `ciphertextsEqual()` timing-safe byte compare.
  - Imports `"server-only"` so a client component using it fails Next's build.
  - Reads `MEDSYNC_PHI_KEY` env var per call; explicit, helpful errors when missing or wrong-length.
- 0 callers in 0.7 by design — encrypted columns land in Phase 1+ clinical tables. Shipping the lib + tests now forces us to nail the wire format and key handling before there's data to migrate.
- Trade-offs encoded into the API: random IV per call → same plaintext yields different ciphertext → content is NOT queryable/indexable. Operational columns stay plaintext; only highest-sensitivity stored values get encrypted. Documented in ADR-0008 + the lib header.
- Key rotation: documented procedure in ADR-0008 §6 (decrypt-old + re-encrypt-new pass). Not automated in 0.7 — `keyId` wire-format prefix deferred until rotation is actually needed.
- Tests: [`tests/encryption/encryption.test.ts`](tests/encryption/encryption.test.ts) — 16 tests covering round-trip (ASCII / empty / UTF-8), IV uniqueness, tamper detection per segment (IV, auth tag, ciphertext), wrong-key, malformed payloads, missing key, wrong-length key, `generateKey()`. Vitest alias added (`server-only` → no-op stub) so the library imports in test context.
- Total suite: **58/58 across 8 files** (~70s).
- ADR-0008 documents algorithm/format choice, key handling, rotation procedure, the queryability trade-off, and alternatives considered (pgsodium / CBC+HMAC / XChaCha20 / AES-SIV / envelope).

### Added — Phase 0.6 (audit infrastructure) — 2026-05-22

- [`supabase/migrations/0003_audit.sql`](supabase/migrations/0003_audit.sql) — two trigger functions:
  - `public.audit_log_changes()` — `AFTER INSERT/UPDATE/DELETE` on `users`, `hospitals`, `hospital_departments`, `user_roles`, `consent_records`. `SECURITY DEFINER` so it can INSERT regardless of caller role. Captures `auth.uid()` as `actor_id`, full `to_jsonb(OLD/NEW)` as `before_data`/`after_data`, lowercased `TG_OP` as `action`, optional `app.request_id` GUC as `request_id`.
  - `public.audit_log_block_modify()` — `BEFORE UPDATE OR DELETE` on `audit_log`; always raises with SQLSTATE `insufficient_privilege`. Defence in depth via `REVOKE UPDATE, DELETE` on `audit_log` from `anon`/`authenticated`/`PUBLIC`. Service-role is intentionally NOT REVOKEd (it has `bypassrls`) but the trigger still raises for it — service-role is held to the same append-only standard as everyone else.
- `audit_log` is intentionally NOT audited (would recurse).
- Tests: [`tests/audit/audit.test.ts`](tests/audit/audit.test.ts) — 6 tests covering INSERT/UPDATE/DELETE trigger fires, before/after capture, and that UPDATE/DELETE on `audit_log` raises with the expected message. Total suite now 42/42 (~63s).
- Test cleanup paths updated: `audit_log` rows are now intentionally leaked from test suites because the append-only trigger blocks DELETE. Documented inline; manual purge via `TRUNCATE` available to the table owner.
- ADR-0007 documents the trigger design, the two-layer append-only lockdown, the table coverage, and follow-ups (Phase 0.9 request-id GUC, retention policy).

### Added — Phase 0.5 (RLS + tests) — 2026-05-22

- [`supabase/migrations/0002_rls.sql`](supabase/migrations/0002_rls.sql) — RLS policies for all 6 Phase 0 tables. `ENABLE` + `FORCE ROW LEVEL SECURITY` (defence in depth so even the table owner is subject), explicit `GRANT` of table privileges to `anon` / `authenticated`, deny-by-default with permissive policies per `(command, role)` combination.
- `public.user_has_role(role_name [, hospital_id])` — `SECURITY DEFINER STABLE` helper with hardened search_path. Lives in `public.*` (the pooler user lacks `CREATE` on `auth.*`).
- vitest + `@vitest/coverage-v8` installed; configured in [`vitest.config.ts`](vitest.config.ts) with `fileParallelism: false` for Supabase admin rate limits, env injected into workers via `test.env`.
- **`@next/env` + `NODE_ENV=test` workaround**: vitest sets `NODE_ENV=test`, and `@next/env`'s loader deliberately skips `.env.local` in test mode (silently — `loadedEnvFiles: []`). Config now overrides `NODE_ENV='development'` around the `loadEnvConfig()` call, then restores. Documented inline + ADR.
- Test helpers in [`tests/rls/_helpers.ts`](tests/rls/_helpers.ts): `createTestUser`, `serviceSupabase`, `serviceSql`, `grantRole`, `createTestHospital`, `cleanup`. Test-user emails follow `rls-<suite>-<role>-<rand>@medsync.local` for easy manual cleanup if a run crashes.
- RLS test suite: 36 tests across 6 files, one per table — positive + negative cases per `(role × command × scope)`. **All pass against live Supabase**, ~50s runtime (dominated by `auth.admin.createUser` round-trips on free tier).
- npm scripts: `test`, `test:watch`.
- ADR-0006 documents the policy model, helper function, vitest choice, the env-loading workaround, and the per-table coverage map.

### Added — Phase 0.4 (Phase 0 schema) — 2026-05-22

- Schema proposal: [`docs/schema-phase-0.md`](docs/schema-phase-0.md) — six Phase 0 tables with column types, FKs, indexes, RLS intent, what's encrypted, what's audited. Drizzle implementation matches the proposal verbatim.
- Drizzle schema files in [`db/schema/`](db/schema/):
  - [`_auth.ts`](db/schema/_auth.ts) — phantom `auth.users` for FK type-resolution (Supabase manages the real one).
  - [`users.ts`](db/schema/users.ts) — 1:1 with `auth.users` via shared uuid PK; PHI deferred to Phase 1+.
  - [`hospitals.ts`](db/schema/hospitals.ts) — Uganda MoH facility taxonomy via CHECK constraint on `level`.
  - [`hospital-departments.ts`](db/schema/hospital-departments.ts) — self-referential `parent_id` for IM → 13 sub-specialty trees.
  - [`user-roles.ts`](db/schema/user-roles.ts) — m:n with `role` + `hospital_id`; CHECK enforces superadmin-is-global, every other role hospital-scoped.
  - [`consent-records.ts`](db/schema/consent-records.ts) — versioned, immutable consent log with `consent_text_sha256` for non-repudiation.
  - [`audit-log.ts`](db/schema/audit-log.ts) — append-only system log; populated by trigger only (0.6).
- Generated SQL migration: [`supabase/migrations/0000_nosy_thunderbird.sql`](supabase/migrations/0000_nosy_thunderbird.sql). Header documents that the auto-generated `CREATE SCHEMA "auth"` / `CREATE TABLE "auth"."users"` block must be hand-stripped on every regeneration (Drizzle's `schemaFilter` only filters introspection, not generation).
- Hand-written migration: [`supabase/migrations/0001_updated_at_trigger.sql`](supabase/migrations/0001_updated_at_trigger.sql) — shared `public.set_updated_at()` function attached to every mutable table.
- Custom migrator: [`scripts/migrate.ts`](scripts/migrate.ts) — replaces `drizzle-kit migrate` (which needs prepared-statement support → IPv6-only direct hostname on free tier, unreachable from most networks). Runs each `.sql` file via the transaction pooler with `prepare: false`, wraps each in a transaction, tracks applied state in `public._medsync_migrations`. Drizzle's official migrator preserved as `npm run db:migrate:drizzle` for Pro / IPv6 setups.
- Live state verified: all 6 tables present in `public` (plus the `_medsync_migrations` journal).
- ADR-0005 captures the schema decisions, the auth-phantom workaround, and the pooler-migrator trade-off.

### Added — Phase 0.3 (Supabase + Drizzle + clients) — 2026-05-21

- [`lib/env.ts`](lib/env.ts) — `@t3-oss/env-nextjs` + Zod validation, split into `server` (service role key, DB URLs, `MEDSYNC_PHI_KEY`, Sentry, Africa's Talking) and `client` (`NEXT_PUBLIC_*` Supabase + Sentry) schemas. Fail-fast on missing/invalid required vars; `SKIP_ENV_VALIDATION=1` escape hatch for local scaffolding (never set on Vercel).
- Three Supabase clients, one per auth posture:
  - [`lib/supabase/client.ts`](lib/supabase/client.ts) — browser anon (`createBrowserClient`).
  - [`lib/supabase/server.ts`](lib/supabase/server.ts) — SSR with cookie threading via `next/headers` (`await cookies()` for Next 16 async API). Always use `getUser()`, never `getSession()`.
  - [`lib/supabase/service.ts`](lib/supabase/service.ts) — service role; `"server-only"` import guards prevent it from ever reaching the client bundle.
- [`drizzle.config.ts`](drizzle.config.ts) — Drizzle Kit configured against `DATABASE_DIRECT_URL` (port 5432) with `schemaFilter: ["public"]` so Supabase's `auth`/`storage`/`realtime` schemas are off-limits. Migrations land in [`supabase/migrations/`](supabase/migrations/).
- [`db/index.ts`](db/index.ts) — `postgres-js` client + Drizzle instance. Uses pooled `DATABASE_URL` (port 6543) with `prepare: false` (required for Supabase's transaction-mode pooler). Singleton on `globalThis` in dev to survive HMR without leaking connections.
- [`db/schema/index.ts`](db/schema/index.ts) — barrel export, empty for 0.3 (tables land in 0.4).
- npm scripts: `db:generate`, `db:migrate`, `db:push`, `db:studio`, `db:check`.
- [`app/api/health/route.ts`](app/api/health/route.ts) — dev-only smoke endpoint: runs `SELECT now()` via Drizzle, calls `getUser()` via the server client, calls `auth.admin.listUsers` via the service client. Gated to non-production. The Phase 0.3 acceptance check.
- ADR-0004 documents the data-layer choices.

### Added — Phase 0.2-dark (dark mode) — 2026-05-21

- Dark mode shipped (supersedes the "no dark mode" decision recorded in ADR-0002; full rationale in ADR-0003).
- [`next-themes`](https://github.com/pacocoursey/next-themes) wired via [`app/providers.tsx`](app/providers.tsx) with `attribute="class"`, `defaultTheme="system"`, `enableSystem`, `disableTransitionOnChange`, storage key `medsync-theme`.
- [`<html suppressHydrationWarning>`](app/layout.tsx) + `color-scheme` CSS hint for native form controls; `<meta name="theme-color">` per `prefers-color-scheme` for matching mobile browser chrome.
- [`app/globals.css`](app/globals.css) restructured: every semantic token, clinical-status pair, and shadow lives as a plain CSS variable in `:root` (light) and `.dark` (dark) blocks; `@theme inline` references those vars so utilities like `bg-primary`, `text-status-critical-fg`, `shadow-card` resolve to the right colour per theme at runtime. Scale tokens (`gray-*`, `teal-*`) also flip — components that say `bg-gray-50` automatically render the dark spec's `#111111` in dark.
- [`ThemeToggle`](components/theme-toggle.tsx) — Sun/Moon crossfade switch; added to `/` and `/styleguide` headers.
- Primitives refactored to use semantic tokens (`bg-primary`, `text-foreground`, `bg-card`, `border-border`, `text-muted-foreground`) instead of direct gray-N/teal-N references so they flip cleanly. `dark:` variants reserved for the few asymmetric cases (Button `emergency` shifts to a soft-red outline; Button `secondary` upgrades its border in dark).
- `/styleguide` updated: ThemeToggle in header, palette swatches use static inline `style={{backgroundColor: hex}}` so reference display stays accurate in either mode; added separate sections for dark neutral scale + dark teal scale (now 13 sections total).
- DESIGN-medsync.md gained a full "## Dark Mode" section (verbatim from the dark-mode handoff) covering surface mapping, dark neutral/teal/status palettes, dark-specific shadows, button/input/card overrides, and dark anti-patterns.
- ADR-0003 (dark mode adoption); ADR-0002 status updated to "Accepted (no-dark-mode part superseded by ADR-0003)"; ADR README index updated.

### Added — Phase 0.2 (design system) — 2026-05-21

- [`DESIGN-medsync.md`](DESIGN-medsync.md) authored as the authoritative visual contract — monochrome neutral base with teal-600 (`#0D9488`) as clinical accent, six clinical-status pairs, 12-step type scale, restrained shadow/radii scales.
- [`app/globals.css`](app/globals.css) rebuilt as a Tailwind v4 `@theme` block: full neutrals (`gray-50`–`gray-950`), teal scale, clinical status pairs (`bg-status-*-bg`/`text-status-*-fg`), semantic shadcn mappings, type scale utilities (`text-display-xl`…`text-overline`), radii (`xs`–`3xl`), shadows (`xs`,`sm`,`md`,`lg`,`card`,`popover`,`focus`), easing (`ease-expo-out`), durations.
- shadcn primitives added: `card`, `input`, `label`, `badge`, `separator`, `dialog`, `dropdown-menu` (Form deferred to Phase 0.9 sign-up/sign-in flows).
- Button rewritten with MedSync-spec variants: `primary`, `secondary`, `ghost`, `tealSoft`, `emergency`, `alert`, `link` × sizes `sm`/`md`/`lg`/`iconSm`/`icon`/`iconLg`; expo-out 150ms transition; teal focus ring.
- Input rewritten to spec (13px font, `rounded-sm`, teal-tinted focus, alert-bg on `aria-invalid`).
- Card rewritten with three tones: `standard`, `muted`, `tealTinted`; replaced `ring-1` with `border` for consistency with the design language.
- Custom MedSync components:
  - [`ClinicalBadge`](components/medsync/clinical-badge.tsx) — six clinical statuses with strict bg/fg pairings.
  - [`VitalStat`](components/medsync/vital-stat.tsx) — monospace, tabular-nums vital display with normal/critical/success tones.
  - [`SectionNumber`](components/medsync/section-number.tsx) — `[NN]` bracket pattern.
  - [`ClinicalPath`](components/medsync/clinical-path.tsx) — monospace breadcrumb (`/ patient → vitals`).
- [`app/page.tsx`](app/page.tsx) replaced the create-next-app landing with a minimal MedSync splash (wordmark, hero, link to `/styleguide`, founder/CSO attribution).
- [`app/styleguide/page.tsx`](app/styleguide/page.tsx) — 12-section visual contract: neutrals, teal scale, clinical status, typography, buttons (every variant × size), inputs (default/focused/disabled/error), cards (3 tones), vital-stat strip with critical patient example, section numbers, clinical paths, spacing scale, radii reference, shadow reference.
- [`app/layout.tsx`](app/layout.tsx) — MedSync metadata (title template, applicationName, theme color), viewport config, font fallback chain applied at `<body>`.
- ADR-0002 (design system adoption + font-license deferral).

### Changed

- `globals.css` semantic tokens (`--color-primary`, `--color-foreground`, …) now resolve to MedSync palette; all shadcn primitives inherit the theme automatically.
- shadcn `Dialog` close/cancel button references migrated from the removed `outline`/`icon-sm` variants to `secondary`/`iconSm`.

### Notes / deferred

- **Fonts:** Neue Haas Grotesk Display/Text Pro are commercial. The CSS fallback chain (`"Helvetica Neue", Helvetica, Arial, sans-serif`) renders the correct character on macOS/iOS today; `next/font/local` swap-in pending license files.
- **Dark mode:** intentionally not shipped — see ADR-0002.
- **Form primitive:** picked up in Phase 0.9 where sign-up/sign-in flows make it concrete.

### Added — Phase 0.1 (scaffold + tooling) — 2026-05-21

- Next.js 16.2 App Router scaffold (Turbopack, React 19.2, TypeScript strict).
- TypeScript: `strict`, `noUncheckedIndexedAccess`, `noImplicitOverride`, `noFallthroughCasesInSwitch`, `forceConsistentCasingInFileNames`, `useUnknownInCatchVariables`; `target: ES2022`.
- ESLint 9 flat config extending `eslint-config-next` with `@typescript-eslint/no-explicit-any: error`, typed-import enforcement, and unused-var rule.
- Prettier 3 with `@ianvs/prettier-plugin-sort-imports` and `prettier-plugin-tailwindcss`.
- Tailwind CSS v4 via `@tailwindcss/postcss`.
- shadcn/ui initialized (Nova preset, `@base-ui/react` primitives). Theme tokens deferred to Phase 0.2.
- Husky 9 + lint-staged pre-commit (`eslint --fix`, `prettier --write`).
- commitlint with Conventional Commits — types allowed: `feat`, `fix`, `chore`, `docs`, `security`, `style`, `refactor`, `test`, `perf`, `build`, `ci`, `revert`.
- npm scripts: `dev`, `build`, `start`, `lint`, `lint:fix`, `typecheck`, `format`, `format:check`.
- Runtime deps installed (wired but not exercised this sub-phase): `@supabase/ssr`, `@supabase/supabase-js`, `drizzle-orm`, `postgres`, `framer-motion`, `react-hook-form`, `@hookform/resolvers`, `zod 4`.
- Folder structure: `app/`, `components/`, `lib/`, `db/`, `supabase/{migrations,functions/_shared}/`, `docs/adr/`, `prompts/`, `tests/rls/`.
- ADR-0001 (stack choice).
