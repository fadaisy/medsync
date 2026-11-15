# Clinics and schedule — STOP reports

Run straight through (owner: "go through all gates"); every decision provisional until GATE A is signed.

## STOP 0 — discovery

| Item         | Value                                                                                                                           |
| ------------ | ------------------------------------------------------------------------------------------------------------------------------- |
| Base         | `feat/clinic-floor` 1e8fdb8d, not `main` (desk shell, Ticket, devices, user switch, screen feed live only there)                |
| Files        | `docs/clinics-schedule/{PROMPT,step-0-discovery,parity-crawl}.md`                                                               |
| Hub          | landed (places, holidays, closures, presets, clinic ops)                                                                        |
| Missing      | see step-0 Q5: draft log, versions, scheduled publish, fee bands, clinician display, pairing, leave requests, holiday decisions |
| Next numbers | migration 0296 (323 refs scanned); ADRs 0501–0507 (0498–0500 taken by tether sessions)                                          |
| Tooling      | no Playwright (not added); PGlite lane works; `qrcode` present                                                                  |
| Open         | roles (no MS / records officer); the receipt SMS's "position N" vs CS4                                                          |

## STOP 1 — GATE A proposal

| Item          | Value                                                                                                       |
| ------------- | ----------------------------------------------------------------------------------------------------------- |
| Doc           | `docs/clinics-schedule/gate-a-proposal.md` — route map, reuse, engine gaps, P1–P10, extras X1–X6, test plan |
| Section 11    | working answers = the recommendations; deviations listed in §G. **Unsigned.**                               |
| Draft content | `content/clinics-schedule/{copy,bands,templates,palette}.ts` — all `draft`, statuses never edited           |
| ADRs          | 0501–0507 drafted, unsigned                                                                                 |

## STOP 2 — data and engine gaps

| Item      | Value                                                                                                                                                                                                                                                                         |
| --------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Migration | `0296_clinics_schedule.sql` **GATED, not applied**: columns on 6 engine tables + service_closures; 5 new tables (draft log, versions, jobs, fee bands, holiday decisions); `cs_publish` (allow-listed, one transaction); `desk_pair_issue/claim`; RLS + MFA gate; audit verbs |
| Drizzle   | `db/schema/clinics-schedule.ts` + added columns in 7 schema files                                                                                                                                                                                                             |
| Engine    | `lib/clinics-schedule/model.ts` (pure), `ops.ts` (edits → `cs_publish` ops), `publish.ts`, `load.ts`                                                                                                                                                                          |
| Tests     | PGlite `tests/emr-db/clinics-schedule.test.ts` 7/7 (S1 RLS, S4 atomic, S5 invalid job, S23 pairing); pure S2/S3 in `tests/clinics-schedule/model.test.ts`                                                                                                                     |

## STOP 3 — shell and Get ready

| Item  | Value                                                                                                                                                                                                   |
| ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Built | `workspace.tsx` on `DeskShell`: launch ring, badges, find, publish/schedule pills, user switch (PIN), keys 1–7 / P U ? [ Esc, Emergency; `ready.tsx`: pipeline, Do next, clinic rows, basics, templates |
| Tests | S7 readiness, S8 templates (pure) ✓; S6 Emergency visible in every screenshot                                                                                                                           |
| Extra | X1 "Department live" blocking check                                                                                                                                                                     |

## STOP 4 — clinics, editor, session, preview

| Item      | Value                                                                                                                                                             |
| --------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Built     | `clinics.tsx` (list, editor tabs, colour picker, archive X3), `session.tsx`, `preview.tsx` (card, ticket, real `composeReceiptSms`; confidential → "Appointment") |
| Tests     | S9 colour, S10 clashes + nearest free, S11 fees, S13 consent ✓                                                                                                    |
| Deviation | ticket drawn with the workspace's own classes, not `Ticket` (its props need a live booking)                                                                       |

## STOP 5 — week plan, change many, print

| Item  | Value                                                                                              |
| ----- | -------------------------------------------------------------------------------------------------- |
| Built | `week.tsx`: clash alert (fix each / fix all), grid, bulk dialog, print (A4 sheet, QR via `qrcode`) |
| Tests | S14 pairs ✓, S15 bulk inside hours ✓; S16 print checked by eye only                                |

## STOP 6 — closures, holidays, people, leave

| Item  | Value                                                                                                                                                   |
| ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Built | `closures.tsx` (calendar, coming up, holidays closed/open), `people.tsx` (leave requests, filters, groups, office, band, consent, card preview, invite) |
| Tests | S20 people ✓; S17–S19 ops covered by `ops.ts` tests + PGlite                                                                                            |
| Open  | doctors cannot send a leave request yet: the availability sheet has no "Ask for leave" (needs an Edge Function change)                                  |

## STOP 7 — desks and screens

| Item  | Value                                                                                                                      |
| ----- | -------------------------------------------------------------------------------------------------------------------------- |
| Built | `devices.tsx`: tiles, devices/coverage modes, coverage grid with full cell labels, lock, screen sample, add + pairing code |
| Tests | S22 desk blocks opening (readiness) ✓, S23 pairing (PGlite) ✓; S21 by construction (devices change only through publish)   |

## STOP 8 — publish, history, offline, parity (owner steps not done)

| Item             | Value                                                                                                                                                                                |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Built            | `history.tsx` (drafts + undo, schedule card, versions + restore, publish and schedule dialogs); live page, actions, cron `/api/cron/clinics-schedule-publish` (not in `vercel.json`) |
| Tests            | S24 impact ✓, S25 restore ✓, guards ✓; S26 offline by design (encrypted `cs-drafts` queue), not browser-tested                                                                       |
| Parity           | `tests/parity/clinics-schedule/renames.json` (unsigned)                                                                                                                              |
| Not done (owner) | apply 0296, sign GATE A + copy + bands + templates + D-CS-21, pilot flag 3 days, 308s, delete old pages, cron schedule, nav item                                                     |
