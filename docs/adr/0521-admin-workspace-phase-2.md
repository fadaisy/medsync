# ADR 0521: One admin workspace, phase 2: every admin page in the desk's own components

**Status:** Accepted, 16 Nov 2026. The owner approved the prototype (canvas "Tether admin, harmonized", versions 10–13) and said "go ahead with the phase 2 build". Choices with a recommended option were taken on the owner's standing ruling "use all your recommendations", including Remind (deferred, below). Wording is a draft.

Builds on [ADR 0520](0520-one-admin-workspace.md) (phase 1: one frame, one menu). Supersedes [ADR 0499](0499-tether-is-this-app-on-its-own-domain.md) for wards and beds and the laboratory and imaging set-up only: the owner decided on 16 Nov that the hospital admin sets them up in full from the admin workspace, on both domains. Pharmacy set-up stays on MedSync.

## Decision

- **Today is the admin's home** (`/hospital-admin/today`): four counts that each open where the work is done (booked today, waiting for a clinician, people to review, unavailable now) and a Do next list (other admins' emergency changes to verify, your own waiting, people to review, urgent and over-2-day requests, the soonest copy of results, unavailable services). A count that could not be read is a dash, never zero. Tiles are neutral: a count is a workflow state. `/hospital-admin` opens Today on both domains (it was Get ready, ADR 0512) and Today is first in the menu, above Clinics & schedule's views.
- **Activity** (`/hospital-admin/activity`) replaces the Audit placeholder: this hospital's audited admin actions from `sa_audit_log` over 90 days, scoped as a department's History tab already is (the hospital is the target, or its id is in the before or after data), read server-side. It reads only an allowlist of admin actions (`lib/hospital-admin/activity.ts`), so no action about a patient is ever shown. `/hospital-admin/audit` forwards there. Schedule drafts and versions stay in Clinics & schedule's History.
- **People** (`/hospital-admin/staff`, "Staff" renamed): To review, Invitations, Directory and Admins as tabs, the person in the desk's side panel, Invite and Revoke as centred dialogs. Every existing action is reused unchanged. The aging chip is words and a neutral tag. Admins is read-only (who holds the role, and the roster designation); `/hospital-admin/admins` forwards there.
- **Wards and beds** (`/hospital-admin/departments/wards`): counts, filters, ward cards with a live plan thumbnail and occupancy written out, a ward panel; the ward builder and live board fill the frame, and the builder's header is a publishing bar (status tag, checks, Discard / Save draft / Publish). The editor, `lib/wards`, the publish path and the `WARD_BUILDER` flag are unchanged.
- **Laboratory and imaging** (`/hospital-admin/lab`): the test menu (sections, search, detail, referrals by lab, hours by section, profiles, imaging) over the existing test-menu store and actions, which already let a hospital admin edit through the hub surface; no permission is widened. `/hospital-admin/departments/diagnostics` forwards there, keeping its tab and test.
- **Hospital profile and Reports** in desk components, with the same actions and the same figures; SMS spend is shown once; the outbreak and location changes are centred dialogs with a reason.
- **Departments and Emergency and support:** see the section below.
- **Menu:** Today; Clinics & schedule's seven views; Hospital (Departments, Wards and beds, Laboratory and imaging, Emergency and support, People, Hospital profile; Intake off the Tether domain only); Follow-up (Requests, Reports, Activity). ⌘K lists the same pages.

### Departments and Emergency and support

- **Departments** (`/hospital-admin/departments`): neutral counts, department cards filtered by All, Live and Not on Tether yet, and a detail panel with Overview (live, start department, head and acting head, place and hours, rename, archive), Booking rules (the old Booking policy, per department, through `ha-update-department-policy`) and Clinics and wards. Unavailable now (the old Availability) and Hours and places are views of the same page; closures link to Clinics & schedule's Closures. `/departments/booking-policy`, `/availability` and `/hours` forward there.
- **Emergency and support** (`/hospital-admin/departments/emergency`): a receiving banner in ink, never red; changes waiting for a second admin with Verify and Reject through the existing hub ops (the proposer never sees Verify, and the Edge Function refuses them anyway); routing rows and support cards with a change dialog that has one control per stored type, checked by the same `checkCapabilityValue` as the Edge Function; "What the public sees" from the public page's own query.
- **Pin the location**: a map dialog (Leaflet over OpenStreetMap, already a dependency) that sets the hospital's one coordinate pair through `ha-set-hospital-emergency-settings`, the path the profile form already used: one admin, audited. Making it a second-admin change, or adding pins for the ambulance drop-off and the gate, needs that Edge Function changed and new columns.

### Deferred

- **Remind** a clinician about a waiting booking request. The phase 1 plan assumed one small Edge Function, but the message pipeline only messages patients: a staff reminder needs a new dispatch kind (a GATED migration to `notification_dispatches_kind_check`), the dispatcher's planning and wording for a staff recipient, and a choice of channel (in-app, push or SMS, which costs). Requests keeps "Open in week plan".
- **Divert ambulances** and **"Confirm it is all still true"**: each needs a record (state or confirmed-at, who, reason) and an op. Receiving hours beyond none, daytime and 24 hours are not stored.
- **Not stored, so not shown:** swapping the primary and backup admin, resending an invitation, copying an earlier invitation link (only its hash is kept); courier collection days for referred tests; imaging room, booked slot, portable and preset hours; a show/hide switch for a single test. Each needs a column or table and a write path.
- **Intake** stays on MedSync's domain until the front desk covers all six arrival types.

## Consequences

- No migration, no RLS or policy change and no new Edge Function in phase 2.
- The old Chroma components for these pages are deleted; their tests point at the new files with the same invariants.
- New wording lives in `content/hospital-admin/{admin-nav,people,wards,lab,profile-reports,departments,emergency}.ts`, draft until the CSO signs.
