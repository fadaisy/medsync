# Clinics and schedule — Step 0 discovery (STOP 0)

Branch `feat/clinics-schedule`, cut from `feat/clinic-floor` 1e8fdb8d (not `main`: the desk shell `DeskShell`, `Ticket`,
`desk_devices`, the user switch and the clinic floor screen feed are only there). Canvas read as data:
claude.ai/artifact/DsGesqF3pfLyE4nkWJj7i4 (Main 1440, Tablet 834, Phone 390; scenarios Getting ready / First run / Offline).

## Q1 Booking engine

| Piece                                                                                                                                                                                      | Where                                                                                                                                             |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| Clinic = `service_lines` (name, dept, unit, place, audience, confidential, capacity_mode, payment_posture, fee, deposit, catalogue_code, active)                                           | `db/schema/service-lines.ts:33`, writes `ha-upsert-service-line`, hub `add_clinics`/`update_clinic`                                               |
| Per-cadre fee                                                                                                                                                                              | `service_line_fees` `service-lines.ts:123`, `ha-set-service-line-fee`                                                                             |
| Session template (weekday 1–7, start, duration, capacity, booked split, interleave, overbooking, valid from/until, every N weeks, nth weekday, runs on holidays, place, **one** clinician) | `db/schema/clinic-sessions.ts:38`, `ha-upsert-session-template`                                                                                   |
| Expansion + skip rule (holidays unless `runs_on_holidays`; closures always)                                                                                                                | `_shared/slots.ts:648 expandSessionTemplate`, `lib/scheduling/materialise-sessions.ts:31`                                                         |
| Instances, booked count, delay, cancel                                                                                                                                                     | `clinic_sessions` `clinic-sessions.ts:109`; `ha-cancel-session`, `ha-set-session-delay`, `reschedule-appointment`, `cancel-appointment`           |
| Holidays                                                                                                                                                                                   | `public_holidays` 0080:252 (verified list, `provisional` = Eid)                                                                                   |
| Closures                                                                                                                                                                                   | `service_closures` 0080:297 (hospital / department / ward / clinic)                                                                               |
| SMS                                                                                                                                                                                        | `lib/notifications/receipt.ts:40 composeReceiptSms`; confidential name = `'Appointment'` in SQL at `app/api/cron/dispatch-reminders/route.ts:167` |
| Availability                                                                                                                                                                               | `availability_blocks` 0028:52 (kinds incl. `leave`; states `active`/`cancelled`)                                                                  |

## Q2 Services Hub — **landed**

`hospital_places` (name, building, floor, room), `public_holidays`, `service_closures`, level presets
(`_shared/services-hub.ts:586`, signed 26 Sep 2026), hub clinic ops, `/hospital-admin/departments/clinics` (timetable, clinic
days, close for dates, print). No block/wing hierarchy, no tier on places.

## Q3 Staff

`staff_affiliations` (cadre, `cadre_grade_id`, role, dept, state) `clinician-profiles.ts:61`; invites `hospital_staff_invitations`.
**No** office, fee band, booking-card consent or photo anywhere. Doctor availability sheet: `app/doctor/schedule` →
`ha-set-clinician-availability` (self-service, no approval).

## Q4 Devices and screens

`desk_devices` (label, `mine_department_ids`) + `desk_pins` (0294). **No** admin op creates devices, **no** pairing, no kind,
no last-seen. `/clinic/screen?clinic=` is a signed-in staff page (0295).

## Q5 Section 5 rows

| Row                                    | State                                                                                                                   |
| -------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| Clinic record                          | partial: short name, colour, rooms, tier, ages, words, referral, fee mode, booking rules, pay, team, paused **missing** |
| Session template                       | partial: kind, slot, visit, hold %, break, several rooms/clinicians **missing**                                         |
| Places                                 | partial: blocks/wings, tier, room → block **missing**                                                                   |
| Fee bands / resolution                 | **missing** (per-cadre fee exists)                                                                                      |
| Clinician display                      | **missing**                                                                                                             |
| Readiness, clash, impact               | **missing** (pure, new)                                                                                                 |
| Draft log, versions, scheduled publish | **missing** (only ward layouts draft/publish, ADR 0193)                                                                 |
| Exceptions                             | closures yes; away = availability leave; extra = one-off template                                                       |
| Holidays                               | list yes; per-hospital decision **missing**                                                                             |
| Leave requests                         | **missing** (no requested state)                                                                                        |
| Devices                                | partial (see Q4)                                                                                                        |
| Templates                              | presets name clinics; days/hours per level **missing** (content)                                                        |

## Q6 Parity crawl

Full crawl (routes, ~150 controls, tables): `docs/clinics-schedule/parity-crawl.md`. Extras proposed at GATE A §E.

## Q7 Baselines / Q8 tooling

| Item                                                   | State                                                                                                  |
| ------------------------------------------------------ | ------------------------------------------------------------------------------------------------------ |
| Playwright                                             | not installed (new dependency → not added); same as reception and clinic floor                         |
| axe                                                    | `axe-core` (tests/a11y)                                                                                |
| PGlite lane                                            | works via `node_modules` → reception-desk worktree → harness `@electric-sql`                           |
| Fake clock                                             | `vi.setSystemTime`                                                                                     |
| Scheduled job runner                                   | Vercel cron routes under `app/api/cron/*`; the new route is **not** added to `vercel.json`             |
| QR                                                     | `qrcode` already a dependency (mfa-setup) → no new dependency                                          |
| Baselines (first-load JS, INP, axe on a signed-in run) | not measurable without a signed-in browser; deferred to the owner's pilot run, like the desk and floor |

## Disagreements (repo wins)

1. Prompt says cut from `main`; cut from `feat/clinic-floor` (reason above).
2. Roles: only `hospital_admin` (primary/backup) exists. No medical superintendent, no records officer. Provisional: admins draft
   and publish; four-eyes = a different admin publishes a fee-band change.
3. A session template has **one** clinician and **one** place; the canvas needs several → arrays added beside them.
4. `desk_devices` cover departments (`mine_department_ids`); the canvas covers clinics → `mine_service_line_ids` added.
5. Holidays: the engine already skips every holiday unless a clinic runs on it. "Not decided" therefore behaves as closed until
   decided; the list says "Not decided", never "Closed".
6. The real receipt SMS names a position for clinic-day bookings (`receipt.ts:46`); the preview shows the real text and the
   queue-honesty question goes to the CSO (not changed here).
7. ADRs 0498–0500 are taken (tether sessions) → this slice uses **0501–0507**. Migration **0296** (checked over 323 refs).
