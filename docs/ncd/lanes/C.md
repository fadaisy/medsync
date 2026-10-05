# Lane C: recall, SMS, reviews due, my patients, data quality

## Built

- `lib/ncdreg/recall/banned.ts`: E4 banned list built from data (E4's words plus blood, cholesterol, HbA1c, diabetic, hypertensive; every medicine label, code and ATC code; every module label, code and `sms_banned_terms`). Matching is at word starts after normalising, so plurals are caught. Placeholders are not scanned.
- `lib/ncdreg/recall/templates.ts`: E5. English is seeded as `draft` from `sms_templates_demo`, and the Luganda slots are created empty as `pending_review`. No translation is written. Flow: save (refuses banned terms) → submit → first approval (`first_approver`) → second approval by a different user (`approved_by`, status `approved`). The code enforces the two approvers and the table CHECK does too. Editing an approved template retires it and opens a new draft version.
- `lib/ncdreg/recall/transport.ts`: the boundary around the repository's `SmsSender`. `sendGuarded` re-reads `is_synthetic` in the sending transaction and refuses a synthetic person under any transport. Every attempt writes `ncd_sms_log` with `to_hmac` (the person's phone blind index) and never the number. The logging mock is the active transport. Africa's Talking is used only when `live_sms_enabled` is true and never under `NODE_ENV=test`.
- `lib/ncdreg/recall/dispatcher.ts`: runs as the `system` principal. Outside the send window (facility time, [start, end)) nothing is decided. Otherwise it re-checks at send time: ending events, merged, removed from recall, appointment still pending, a `before` reminder still in the future, a `missed` reminder with no visit since and only the latest due seq, SMS allowed and not opted out, a valid phone, an approved template, placeholders fillable from settings, and no banned term in the filled text. It cancels or blocks with a reason. A transport failure leaves the reminder pending.
- `app/api/cron/ncd-reminders/route.ts`: uses `CRON_SECRET` bearer auth and iterates `NCD_REGISTRY` facilities (with `"1"`, every facility with an `ncd_facility_settings` row). **Not added to `vercel.json`.** The owner adds a schedule (for example hourly, `0 * * * *`) at go-live.
- `lib/ncdreg/quality.ts`: the G3 query list read, and the G4 sample (seed `"<facility>:<YYYY-MM>"`, SHA-256 rank, max(10, ceil 5%) capped at n; stored idempotently). It also covers field agreement and the agreement rate, plus the A7 merge-request reads and lookup by registry number.
- Routes:
  - `/ncd/recall`: C13/C14/C15 for the current month from `computeReport`, the overdue table with To call / Called / No phone, and an inline "Log a call" panel.
  - `/ncd/recall/templates`: list, edit, submit and approve, gated by capability.
  - `/ncd/reviews`: C3.
  - `/ncd/my?list=…`: F4.
  - `/ncd/quality`: queries, the audit sample, and duplicate review with merge.

## Deviations and choices

- **Died / Moved or transferred** open the shared `EventDialog` first, and the call (`died` / `moved_or_transferred`) is logged in its `onDone`. A death is never a silent one-tap log, and an abandoned dialog logs nothing. Other outcomes take two taps: pick, then confirm (with an optional new date for will_return).
- Real numbers revealed through "Show number" get a `tel:` link. Synthetic numbers show "Demo number, do not call" and have no link.
- The catch-all medicine "Other" (group `other`) is left out of the banned list, because banning the word "other" bans plain English.
- `[HOSPITAL NAME]` and `[CLINIC PHONE]` are filled from `ncd_facility_settings.hospital_display_name` / `clinic_phone`. If one is missing, the reminder is blocked with the reason "Facility setting missing …". The design-notes copy conflict (the SMS names the hospital) stands for CSO review.
- With no approved template, a due reminder is `blocked` ("No approved template") rather than kept pending. A reminder is tied to a date.
- Seeding templates happens when a `code_list_manage` holder opens `/ncd/recall/templates`. `ncd_sms_template` has no unique key, so seeding runs only when the facility has no rows at all.
- The registry lead does not hold `recall_work` (I1 map), so `/ncd/recall` is the registry officer's screen. The lead reaches templates directly.
- The audit fields checked are visit date, blood pressure, weight, glucose, medicines, and next appointment (draft list).

## Tests

- `tests/ncdreg/recall.test.ts` (unit): the E4 banned-term scan of every seeded and demo template, plus the list's contents and E3 quiet-hours window and facility clock.
- `tests/ncdreg-db/recall.test.ts` (PGlite):
  - E5: two different approvers, and the CHECK.
  - E4: save refuses a banned term.
  - E5: only approved templates are sent.
  - E3: outside the window the reminder stays pending.
  - D1: no send after a death, including a reminder still pending.
  - E6: opt-out is honoured at send time.
  - Interlock 3: a synthetic person is blocked under the mock and the "africastalking" transports, with the reason logged.
- `tests/ncdreg-db/quality.test.ts`: G4 sample size and seed reproducibility (pure), the DB draw and redraw, and the agreement rate.
