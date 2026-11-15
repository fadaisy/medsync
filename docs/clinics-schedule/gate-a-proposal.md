# Clinics and schedule — GATE A proposal (STOP 1)

**Status: PROVISIONAL. Nothing here is signed.** The owner asked for all gates in one run; Section 11's recommendations are used
as working answers until Fadhul signs below. Fee bands (D-CS-05), the workload threshold (D-CS-21) and level templates stay
draft content.

## A. Route map

| Route                                                                                   | What                                                                                                                        | Gate                                                                                                                       |
| --------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| `/hospital-admin/clinics?view=ready\|clinics\|week\|closures\|people\|devices\|history` | the workspace (one client shell, seven views)                                                                               | `requireHospitalAdminScope` + `clinicsScheduleLiveFor(hospital)` (flag `CLINICS_SCHEDULE`, off = 404, old pages unchanged) |
| `/styleguide/clinics-schedule?scenario=ready\|first\|offline`                           | fixture harness for screens and review                                                                                      | `MEDSYNC_FIXTURES=1`                                                                                                       |
| `/api/cron/clinics-schedule-publish`                                                    | runs due scheduled publishes (P8)                                                                                           | `CRON_SECRET`; **not** added to `vercel.json` (owner)                                                                      |
| 308s at cut-over (owner, Step 8)                                                        | `/hospital-admin/scheduling` → `/hospital-admin/clinics?view=week`; `/hospital-admin/departments/clinics` → `?view=clinics` | not built until the cut-over                                                                                               |

## B. Components (reuse first)

| Need                                                                                     | Reused                                                                                                                           | New                                                                                                                                      |
| ---------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| Shell, sidebar, rail, drawer, top bar, Emergency, toast with Undo, user dock, keys sheet | `DeskShell` (`components/reception/shell.tsx`), `Icon`, `Chips`, `DeskDialog` (EditorDialog, ADR 0161), `desk.module.css` tokens | `components/clinics-schedule/cs.module.css` (view layout only)                                                                           |
| Ticket in the patient preview                                                            | `Ticket` (`components/landing/tether/ticket.tsx`, real mode)                                                                     | —                                                                                                                                        |
| SMS in the preview                                                                       | `composeReceiptSms` + the cron's confidential rule (`'Appointment'`)                                                             | `smsServiceName()` beside it                                                                                                             |
| QR on the timetable                                                                      | `qrcode` (already a dependency)                                                                                                  | —                                                                                                                                        |
| Copy fill                                                                                | `fill` (`content/lab-workspace-v2.ts`)                                                                                           | —                                                                                                                                        |
| Live data                                                                                | `loadClinics`, `loadPlaces`, `loadStaffPool`, `loadHolidays`, `loadClosures` (`lib/services/data.ts`)                            | `lib/clinics-schedule/load.ts` maps them to one `Snapshot`                                                                               |
| Engine                                                                                   | —                                                                                                                                | `lib/clinics-schedule/model.ts` (pure): drafts, readiness, clashes, nearest free, fees, colour, impact, bulk, templates, people, consent |

## C. Engine gaps (each an extension of an existing record)

Migration **0296_clinics_schedule.sql** (GATED, never applied by Claude):

| Record                                | Added                                                                                                                                                                                                                                    |
| ------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `service_lines` (clinic)              | short_name, colour, room_place_ids[], block_place_id, tier, ages, patient_words (≤140), referral_required, fee_mode, fee_private_ugx, fee_overrides jsonb, booking_rules jsonb, pay_options jsonb, team_user_ids[], paused_at, paused_by |
| `session_templates`                   | kind (day/times), slot_minutes, visit_minutes, walk_in_hold_pct, break_start/end, place_ids[], clinician_user_ids[], places_set                                                                                                          |
| `hospital_places`                     | kind (block/room), parent_id (a room has one block), tier                                                                                                                                                                                |
| `staff_affiliations`                  | fee_band, office_place_id, card_name, card_photo, card_consent_on, card_consent_by (CHECK: shown ⇒ consent)                                                                                                                              |
| `desk_devices`                        | kind, place, mine_service_line_ids[], lock_minutes, last_seen_at, pair_code_hash, pair_code_expires_at, pair_code_used_at                                                                                                                |
| `availability_blocks`                 | state + `requested`, `declined`; cover_user_id, booking_policy, decided_by, decided_at                                                                                                                                                   |
| new `hospital_fee_bands`              | hospital, band, general_ugx, private_ugx, version, proposed_by, approved_by ≠ proposed_by                                                                                                                                                |
| new `hospital_holiday_decisions`      | hospital, holiday_id → `public_holidays`, decision closed/open                                                                                                                                                                           |
| new `schedule_changes`                | the draft log: hospital, summary, edits jsonb (entity, key, before, after), author, status draft/scheduled/published/undone, version_id, job_id                                                                                          |
| new `schedule_versions`               | number, published_by/at, change_ids, texts_sent                                                                                                                                                                                          |
| new `schedule_publish_jobs`           | run_at, author, change_ids, status, failure                                                                                                                                                                                              |
| fn `cs_publish(hospital, change_ids)` | applies every edit in one transaction to the engine tables (allow-listed tables and columns), numbers a version; any failure rolls all back (P4)                                                                                         |

None of the new tables holds a clinic, session, place, holiday, closure or person: the guard (Appendix C) scans for that.

## D. Draft and publish (P1–P10)

- Every edit is a `Change` of row edits with `before` and `after`. The workspace shows `applyChanges(published, drafts)`;
  the engine tables are the published version and the only thing patients, desks, screens and SMS read (CS3, by construction).
- One shared list per hospital (P2). Undo drops a change and everything after it ("Undo, with N after it", P3).
- Publish: server re-validates (clashes, readiness, four-eyes on bands), then `cs_publish` (P4, P10). Booked sessions moved,
  cut or closed go to the engine's own flows after commit (`ha-cancel-session` / reschedule; P6).
- Pause is immediate and audited (P7). Schedule: now, tonight 22:00, tomorrow 06:00, a set time; the cron re-validates (P8).
- Restore: one draft that sets every record back to that version (P9). Versions are never edited.

## E. Extras from the parity crawl (numbered; build where they fit)

| #   | Extra                                                                                                                    | Why                                                          |
| --- | ------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------ |
| X1  | Readiness check "department is live" (blocking)                                                                          | the Hub refuses to set a clinic live in a planned department |
| X2  | Opening hours from the Hub's `opd_hours` bound Change-many and nearest free time                                         | one record for hours, not the canvas's 06:00–20:00           |
| X3  | Archive a clinic from the editor (draft)                                                                                 | the Hub's Clinics tab links here, so archive must be here    |
| X4  | Booked split, interleave, overbooking factor and runs-on-holidays kept untouched by every edit                           | no silent loss of engine settings                            |
| X5  | Links out: Hub places (building, floor, directions), staff approvals/invites, department booking policy, doctor settings | real controls that stay where they are                       |
| X6  | "Running late" and single-day cancel stay on the desk / a one-day closure                                                | already owned by the desk (ADR 0485)                         |

## F. Copy

`content/clinics-schedule/copy.ts` (every string, `CLINICS_SCHEDULE_COPY_STATUS: draft`), `bands.ts` (D-CS-05, draft),
`templates.ts` (D-CS-11 days and hours per level, draft). Holidays come from the Hub's verified table, not content.

## G. Section 11 — working answers (provisional)

| #       | Working answer                                                                    | Deviation                                                                                                 |
| ------- | --------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| D-CS-01 | own nav item "Clinics & schedule"                                                 | —                                                                                                         |
| D-CS-02 | one shared draft, undo cascades                                                   | —                                                                                                         |
| D-CS-03 | hospital admins publish                                                           | no MS / records-officer roles exist; four-eyes = a different admin publishes a band change                |
| D-CS-04 | now / 22:00 / 06:00 / set time                                                    | —                                                                                                         |
| D-CS-05 | bands as recommended, **draft**                                                   | —                                                                                                         |
| D-CS-06 | range on clinic days, exact on doctor's times                                     | —                                                                                                         |
| D-CS-07 | room or person overlap blocks; nearest free time                                  | —                                                                                                         |
| D-CS-08 | never red (345°–15°), ≥3:1 on white                                               | —                                                                                                         |
| D-CS-09 | invite via the staff feature                                                      | pending invitees cannot be put on sessions until accepted (sessions hold user ids)                        |
| D-CS-10 | children desk-only                                                                | —                                                                                                         |
| D-CS-11 | templates per level, **draft**, empty clinics only                                | —                                                                                                         |
| D-CS-12 | Hub list; Not decided until decided                                               | engine treats undecided as closed (repo default)                                                          |
| D-CS-13 | leave → availability exception with cover                                         | requests need the doctor sheet's "Ask for leave" (engine state added; sheet button built behind the flag) |
| D-CS-14 | name/photo off without consent                                                    | —                                                                                                         |
| D-CS-15 | drafts on the device (AES-GCM, the desk's `queue.ts` slot `cs-drafts`), sync once | —                                                                                                         |
| D-CS-16 | 6 chars, single use, 15 min; lock 5/10/15                                         | —                                                                                                         |
| D-CS-17 | versions kept; restore = draft                                                    | —                                                                                                         |
| D-CS-18 | count × configured rate (`CLINICS_SMS_UNIT_UGX`)                                  | no rate set → cost shows "rate not set"                                                                   |
| D-CS-19 | off by default, per clinic                                                        | —                                                                                                         |
| D-CS-20 | office: amber warning                                                             | —                                                                                                         |
| D-CS-21 | threshold **draft** (30 h placeholder in content)                                 | —                                                                                                         |

Signature: **********\_\_********** (Fadhul, CSO) Date: ****\_\_****

## H. Test plan

Pure (`tests/clinics-schedule/*.test.ts`): S3 undo, S7 readiness, S8 template, S9 colour, S10 clashes, S11 fees, S13 consent,
S14 clash pairs, S15 bulk, S20 people, S24 impact, S25 restore, CS3 draft view vs published. PGlite (`tests/emr-db/
clinics-schedule.test.ts`): S1 RLS (cross-tenant, non-admin), S4 atomic publish, S5 invalid scheduled job, S23 pairing
code. Guards: raw colour, fee literals, strings outside content, one record per fact.

## I. ADRs (drafted, unsigned)

0501 workspace as an editor over the engine · 0502 draft, publish, schedule, restore · 0503 fee bands · 0504 clashes block
publish · 0505 clinician identity needs consent · 0506 leave requests → availability · 0507 device pairing, coverage, lock.
