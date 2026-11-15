# Clinics & schedule — report (STOP 8)

Branch `feat/clinics-schedule` (from `feat/clinic-floor` 1e8fdb8d). Committed, **not pushed, not deployed**. Every
GATE A answer, the copy, fee bands, templates, D-CS-21, ADRs 0501–0507 and the parity map were signed by Fadhul (CSO)
in chat on 15 Nov 2026.

## What was built

- `/hospital-admin/clinics` (`?view=ready|clinics|week|closures|people|devices|history`): one workspace on the desk
  shell, an editor over the engine's own records (ADR 0501). Off unless `CLINICS_SCHEDULE` is set (`1` or hospital
  ids) and, in production, the copy is signed. Off: 404; the old pages are unchanged.
- Drafts → publish (now, 22:00, 06:00), undo with later changes, restore a version (ADR 0502). Publish re-validates on
  the server and writes through `cs_publish` in one transaction. Scheduled publishes run from
  `/api/cron/clinics-schedule-publish` (in `vercel.json`, 22:00 and 06:00 Kampala).
- Fee bands with four-eyes (ADR 0503), clashes block publish with nearest free time (0504), names and photos only with
  written consent (0505), leave requests → availability (0506), device pairing, coverage and lock (0507).
- Fixture: `/styleguide/clinics-schedule?scenario=ready|first|offline&view=…` (`MEDSYNC_FIXTURES=1`), invented names,
  booked counts from seeded bookings.
- Extras from the parity crawl: X1 department-live check, X2 opening hours from the Hub, X3 archive in the editor, X4
  engine settings kept untouched, X5 links out, X6 delay and one-day cancel stay on the desk.

## Checks

| Check                                                           | Result                                                                                     |
| --------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| `tsc --noEmit`                                                  | 0 errors                                                                                   |
| ESLint (new files)                                              | 0 errors, 0 warnings                                                                       |
| Pure tests `tests/clinics-schedule`                             | 26 / 26                                                                                    |
| PGlite `tests/emr-db/clinics-schedule.test.ts` (`EMR_PGLITE=1`) | 7 / 7 (S1, S4, S5, S23)                                                                    |
| Guards (Appendix C)                                             | 0 failures                                                                                 |
| Screens                                                         | `docs/clinics-schedule/screens/` — 7 views × 1440 / 834 / 390 × light / dark, fixture data |

Full `npm run test`: 12,177 passed, 1 failed, 8 files failed — none touch this work, all from the base or this
worktree's set-up: `mfa-below-pages` (0293, base branch); 4 `tests/clerking/*`, `pharmacy/supplies-ui` (server env read
on the client via `lib/lab/criticals`, `lib/pharmacy/audit`); `patient-web/care`, `help` (no `mobile/tsconfig` in this
worktree).

## Section 9 — numbers

| Measure                                                     | Budget           | Result                                                                                                                                                                  |
| ----------------------------------------------------------- | ---------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| First-load JS (gzip)                                        | ≤ 170 KB         | **not measured** (no production build run in this session)                                                                                                              |
| INP, week grid, 40 clinics                                  | ≤ 200 ms         | **not measured**                                                                                                                                                        |
| Clash detection, 40 clinics × 7 days                        | ≤ 20 ms          | **0.26 ms** (54 clinics, 99 sessions, Node)                                                                                                                             |
| Panel and sheet open                                        | ≤ 150 ms         | not measured                                                                                                                                                            |
| CLS                                                         | ≤ 0.05           | not measured                                                                                                                                                            |
| Server action p95 / publish of 50                           | ≤ 300 ms / ≤ 2 s | **not measured** (0296 not applied)                                                                                                                                     |
| axe serious or critical                                     | 0                | 0 from this workspace; dark rows flag only the shared desk Emergency button (`components/reception/desk.module.css`, base branch)                                       |
| Horizontal page scroll at 390                               | 0                | 0                                                                                                                                                                       |
| Guards                                                      | 0                | 0                                                                                                                                                                       |
| Set up a General hospital from the template vs from scratch | ≥ 70 % fewer     | 3 interactions (Start from a template → General hospital → Add) vs ≥ 5 per clinic by hand (≥ 95 for 19 clinics): ~97 % fewer, counted from the UI, not timed with users |
| Move every afternoon session 30 min later                   | —                | 4 (Change many → All → 30 min later → Save). Moves every session on the chosen days; there is no "afternoon only" filter (the canvas has none either)                   |
| Clashes that reached a published version                    | 0                | 0 by construction: publish refuses (client and server, `publishBlockers`)                                                                                               |
| Draft changes visible to patients                           | 0                | 0 by construction: drafts live in `schedule_changes`; patients read only engine tables                                                                                  |
| Stores for clinics or sessions outside the engine           | 0                | 0 (guard test scans 0296's new tables)                                                                                                                                  |
| Names or photos without consent                             | 0                | 0 (`cardIdentity`, DB CHECK `staff_affiliations_card_consent`)                                                                                                          |
| Parity items lost                                           | 0                | 0 lost; 6 legacy service-line fields kept untouched and still edited on the old page until cut-over (`renames.json`)                                                    |
| Strings outside `content/clinics-schedule/`                 | 0                | 0 (guard)                                                                                                                                                               |

## Deviations (for the owner)

- No medical-superintendent or records-officer role exists: every hospital admin publishes; four-eyes = a different
  admin publishes a band change (D-CS-03).
- People are created only by the staff invite (D-CS-09); the grade and name entered in "Add a person" go in the invite
  reason, and the grade is set after they accept.
- Doctors cannot yet send a leave request: the availability sheet has no "Ask for leave" (needs a change to
  `ha-set-clinician-availability`). Leave approval works for requests in state `requested`.
- The canvas's "Every year on this date" toggle is not stored; the "Review within 14 days" fee control is omitted (no
  copy, no column).
- MoMo and SMS on Get ready › Hospital basics show as warnings: their real state is not readable here, so it is not
  faked.
- The patient preview's ticket uses the workspace's own layout, not `Ticket` (its props need a live booking).
- `unitCost` reads `CLINICS_SMS_UNIT_UGX`; unset, the publish dialog says "SMS rate not set" (D-CS-18).
- No nav item yet: adding it would show for every hospital while the flag is off. Add at cut-over.
- Repo harness `scripts/patient-web/harness.mjs` has a race (subscribes to `load` after navigating) that hangs on a
  reload; screenshots were taken with a patched copy outside the repo. Not fixed here.

## Owner steps (not done by Claude)

1. Apply the migration: `cd /Users/airm1/Desktop/medsync/.claude/worktrees/clinics-schedule-940aa4 && npm run db:migrate`
   (0296, GATED).
2. ~~Sign~~ — done in chat, 15 Nov 2026.
3. Pilot: `CLINICS_SCHEDULE=<hospital id>` for 3 days; optionally `CLINICS_SMS_UNIT_UGX`.
4. ~~Cron~~ — in `vercel.json`: 19:00 and 03:00 UTC (22:00 and 06:00 Kampala). Needs `CRON_SECRET` (already set for the other crons) and a deploy.
5. Cut-over: 308s (`/hospital-admin/scheduling` → `?view=week`, `/hospital-admin/departments/clinics` →
   `?view=clinics`), nav item, delete the old pages and the flag.
