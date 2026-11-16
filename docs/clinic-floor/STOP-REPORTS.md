# Clinic floor — STOP reports

Owner said "go through all gates" (13 Nov 2026): steps run back to back; each STOP is logged here.

## STOP 0 — discovery

| Item            | Result                                                                                                                        |
| --------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| Files           | `docs/clinic-floor/PROMPT.md`, `step-0-discovery.md`; canvas source `docs/design/canvases/clinic-floor/`                      |
| Base            | `feat/reception-desk` @ 4b44c851, not `main` (main has no shell) — D-CF-19                                                    |
| Engine          | `runTriage` `lib/triage/engine.ts:51`; 5 levels (L5 Blue); NEWS2 + ESI v5, **no TEWS**; per-parameter exposed                 |
| Gaps            | G1 re-check prose only · G2 no plausibility · G3 TEWS · G4 mobility/injury/weight · G5 Step 1 wording · G6 L5                 |
| Migration       | next free `0295` (checked every local + remote ref); ADRs next free `0491`                                                    |
| Baseline checks | typecheck 0 errors; vitest 92 files / 3 tests fail before any change (env `.env.local` absent in worktree, PGlite); list kept |
| Not measured    | screens, axe, INP, first-load JS (need a signed-in browser; no Playwright)                                                    |

## STOP 1 — GATE A

| Item   | Result                                                                              |
| ------ | ----------------------------------------------------------------------------------- |
| Files  | `gate-a-proposal.md` (routes, reuse, gaps, D-CF-01…21, tests, ADR slots, migration) |
| Signed | all as recommended — Fadhul, chat, 13 Nov 2026                                      |
| Copy   | `content/clinic-floor/floor.ts`, `draft` (grows per step)                           |

## STOP 2 — data and engine gaps

| Item                              | Result                                                                                                                                                                                                                 |
| --------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Migration                         | `supabase/migrations/0295_clinic_floor.sql` **GATED** — `clinic_floor_events`, append-only, RLS deny + MFA gate                                                                                                        |
| Schema                            | `db/schema/clinic-floor.ts` (+ index export)                                                                                                                                                                           |
| Engine (projection only, D-CF-20) | `lib/triage/recommend.ts`: `recheck` band on `monitor_interval`, `RECHECK_DUE_MINUTES`                                                                                                                                 |
| Engine action                     | `app/nurse/triage/actions.ts`: returns the band (additive)                                                                                                                                                             |
| Floor                             | `lib/clinic-floor/model.ts` (steps, line order, re-checks, doctor status, screen feed, metrics), `feature.ts`, `app/clinic/actions.ts` (idempotent events, calls blocked unless In room, triage via the engine action) |
| Copy                              | `content/clinic-floor/floor.ts` (`draft`)                                                                                                                                                                              |
| ADRs                              | 0491–0495 + CHANGELOG                                                                                                                                                                                                  |
| S1, S2                            | `tests/emr-db/clinic-floor.test.ts` 4/4 (PGlite; desk 7/7 still green)                                                                                                                                                 |
| S3, S13–S15, S17, CF11            | `tests/clinic-floor/model.test.ts` 10/10                                                                                                                                                                               |
| G1                                | `tests/triage/recheck-band.test.ts` 2/2 (3,000 random inputs, all 5 bands)                                                                                                                                             |
| Checks                            | typecheck 0 · eslint (changed files) 0 · vitest: no new failures (92 base files, env)                                                                                                                                  |
| Open                              | untriaged patients sit with L4 in the line (ADR 0493 reading) — confirm                                                                                                                                                |

## STOP 3 — shell and triage station

| Item   | Result                                                                                                            |
| ------ | ----------------------------------------------------------------------------------------------------------------- |
| UI     | `components/clinic-floor/{floor,shared,triage,fixture,port}.tsx`, `components/reception/shell.tsx` (shared shell) |
| Engine | panel calls `runTriage` / `interpretVitals` / `recommend` only; Send through the engine action                    |
| Tests  | `tests/clinic-floor/triage-parity.test.ts` — T10 200 sets 100 %, each Step 0 sign → L1, comma decimal             |

## STOP 4 — clinic line

| Item  | Result                                                                                                 |
| ----- | ------------------------------------------------------------------------------------------------------ |
| UI    | `line.tsx` — status, call / here / again / didn't come, With you, finish + follow-up Ticket, late, end |
| Rules | calls blocked unless In room (client `canCall` + server)                                               |

## STOP 5 — trends

| Item | Result                                                                                       |
| ---- | -------------------------------------------------------------------------------------------- |
| UI   | `trends.tsx`, `lib/clinic-floor/trends.ts`, bands in `content/clinic-floor/bands.ts` (draft) |
| ADR  | 0496                                                                                         |

## STOP 6 / 7 — floor board and screen

| Item | Result                                                                                         |
| ---- | ---------------------------------------------------------------------------------------------- |
| UI   | `board.tsx` (flow, matrix, list, Needs a hand), `/clinic/screen` (codes + rooms, 10 s refresh) |
| S3   | screen feed keys = `calledAt, code, room`; no name (guard)                                     |
| S26  | 8 h memory run not done (no long browser run)                                                  |

## STOP 8 — offline, parity, harden

| Item     | Result                                                                   |
| -------- | ------------------------------------------------------------------------ |
| Offline  | `lib/clinic-floor/queue.ts`, S27 test (fake-indexeddb); ADR 0497         |
| Live     | `/clinic`, `lib/clinic-floor/load.ts`, `live.tsx`                        |
| Guards   | `tests/clinic-floor/guards.test.ts` — S10, S3, S5, copy, red             |
| Parity   | `tests/parity/clinic-floor/renames.json` — 5 lost, unsigned              |
| Screens  | `docs/clinic-floor/screens/`                                             |
| Not done | pilot, cut-over, delete old pages (owner); axe / budgets (signed-in run) |
| Report   | `docs/clinic-floor/REPORT.md`                                            |

## Follow-up 1: pregnancy and SpO₂ scale 2 as engine inputs (15 Nov 2026)

Branch `feat/clinic-floor-engine-inputs`, cut from `main`. Engine inputs only. No rule, threshold or score was added.

| Item   | Result                                                                                                                                                                                                                                                     |
| ------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Ruling | Owner (CSO) ruled in the main chat on 15 Nov: go on change 1. For sex F or unknown the pregnancy answer starts at "Not known", so the engine raises confirm-pregnancy. For a male patient the question is hidden and the answer is pinned to not pregnant. |
| Input  | `draftInput` sends `pregnancy` and `spo2Scale2Enabled` from the panel. Reproductive age now comes from the signed REF-PREG-AGE (`inPregnancyAgeRange`), replacing the inline 12/50.                                                                        |
| UI     | Step 2 has a Pregnancy chip row (not shown for men) and an "SpO₂ scale 2" toggle, off by default. A re-check carries the last answer forward.                                                                                                              |
| Copy   | `FLOOR.panel.pregnancy`, `pregnancyOpts`, `scale2`, `scale2Title`. All are **draft**; the status is unchanged.                                                                                                                                             |
| T10    | 200 seeded sets now also randomise pregnancy and scale 2. Level, reasoning and NEWS2 all match a direct engine call. Added tests: men are pinned; both inputs reach the engine.                                                                            |
| Gap    | `triage_records` has no column for pregnancy or scale 2, so the live loader rebuilds past inputs as unknown/off. A live re-check therefore starts at "Not known".                                                                                          |
| Next   | Change 2: age and sex on the live loader. Held for a go.                                                                                                                                                                                                   |

## Follow-up 2: age and sex on the live loader (15 Nov 2026)

| Item        | Result                                                                                                                                                                                                                                                    |
| ----------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Rulings     | Owner (CSO) ruled in the main chat on 15 Nov. (a) Go on change 2. (b) No migration to store pregnancy or scale 2: a live re-check starts at "Not known" / off. (c) The draft strings stay unsigned for now.                                               |
| Loader      | `lib/clinic-floor/load.ts` joins `patient_profiles`. Age comes from `computeAgeYears(date_of_birth)`, as in the nurse worklist. Sex maps female → F, male → M, and anything else → unknown. The engine input rebuilt from a stored record uses these too. |
| One builder | `engineContext()` and `floorSex()` live in `lib/clinic-floor/model.ts`. Both the panel (`draftInput`) and the loader use them, so their contexts cannot drift. No rule changed.                                                                           |
| Effect      | Live triage now sends `age_years` and the reproductive-age flag. For men, the pregnancy question is hidden.                                                                                                                                               |
| Tests       | Clinic-floor 23/23, including new `floorSex` and `engineContext` cases. T10 parity is unchanged and green.                                                                                                                                                |
| Next        | Change 3: past readings for Trends. Held for a go.                                                                                                                                                                                                        |

## Follow-up 3: past readings for Trends (16 Nov 2026)

| Item            | Result                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| --------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Ruling          | Owner (CSO), in the main chat on 16 Nov: go on change 3, using readings from every hospital the database already lets this user see. No RLS widening and no hospital bypass. Stop if a policy change would be needed. None was needed.                                                                                                                                                                                                                                                 |
| What RLS allows | `triage_records_select_scoped` (0036, redefined in 0120; 0289 removed superadmin from it) lets a signed-in user see a record when any of these holds: they are the patient; they triaged it; or they hold an `active`/`approved` affiliation at **the record's hospital** in a clinical cadre that is not pharmacy. So another hospital's reading appears only where the nurse or doctor is also affiliated there, or triaged that patient themselves. Nothing else crosses hospitals. |
| How it reads    | `pastReadings()` in `lib/clinic-floor/load.ts` reads through the user's own Supabase client (`createClient`), so RLS decides. The floor's privileged `db` is not used for this. It sends 50 patients per request and takes the newest 1,000 rows each. On an error it logs (no names) and shows no readings.                                                                                                                                                                           |
| Projection      | `triageReadings()` in `lib/clinic-floor/trends.ts` is a projection only. BP is shown only when both numbers are present. Triage sugar is always `sugar_random`, untimed (S21). There is no weight, because the triage snapshot holds none. Each point's source reads today / earlier / another hospital. Draft strings: `FLOOR.trends.source`.                                                                                                                                         |
| Screen          | `/clinic/screen` loads with `{ readings: false }`; it still sends codes and rooms only (S3).                                                                                                                                                                                                                                                                                                                                                                                           |
| Tests           | Clinic-floor tests 25/25, including the new `trends-readings.test.ts`. Typecheck and lint are clean.                                                                                                                                                                                                                                                                                                                                                                                   |
| Open            | Reading other patients' past records here does not write to `clinical_phi_access_log`. The nurse worklist logs PHI access; does the owner want the floor to do the same?                                                                                                                                                                                                                                                                                                               |
| Next            | Change 4: lab "results back". Held for a go.                                                                                                                                                                                                                                                                                                                                                                                                                                           |

## Follow-up 4: lab "results back", and the floor's PHI access log (16 Nov 2026)

| Item         | Result                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Rulings      | Owner (CSO), in the main chat on 16 Nov: (1) the floor logs its patient reads to `clinical_phi_access_log` the same way the nurse worklist does, and I am to stop if that needs a migration (it does not); (2) go on change 4.                                                                                                                                                                                                                                                                                            |
| PHI log      | `lib/clinic-floor/load.ts` writes one row per patient on the floor, with basis `department_recent` and surface `clinic_floor`, under the same try/log pattern as `lib/triage/worklist.ts`. The board view refreshes every 10 s, so each user logs each patient **once a day** on this surface rather than on every load. The waiting-room screen does not log (it shows codes only). No migration: `surface` is free text and the basis is already allowed.                                                               |
| Results back | The loader reads `encounter_results.released_at` where `quality_status = 'released'`, joined to `encounter_orders` on this hospital and today's patients, released today. Encounters carry no intake, so the match is by patient, hospital and day. The existing model (`projectVisit`) counts only a release made after the visit's "sent for tests", and only then moves the patient back to the line with "results ready". Only times are read; no result values. The manual "Results back" button stays fixture-only. |
| Limits       | Legacy orders with no `hospital_id` do not match. The line view seeds its people once and does not refresh (only the board calls `router.refresh`), so on the line view a new release shows after a reload. This is a pre-existing gap for every live change, and I have not patched it here.                                                                                                                                                                                                                             |
| Tests        | Clinic-floor tests 25/25 (the existing `projectVisit` results-back case covers the model). Typecheck and lint are clean. The loader's SQL has no DB test in the cloud: the PGlite lane is only on the Mac.                                                                                                                                                                                                                                                                                                                |
| Next         | Change 5: follow-up booking from Finish visit. Held for a go.                                                                                                                                                                                                                                                                                                                                                                                                                                                             |

## Follow-up 5: follow-up booking from Finish visit (16 Nov 2026)

| Item         | Result                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| ------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Rulings      | Owner (CSO), in the main chat on 16 Nov: (1) go on change 5 through a `/clinic` server action on the close.ts / `ha-book-on-behalf` path, with no Edge Function change and no migration, and a stop if either is needed (neither was); (2) give the line view the board's 10-second refresh, as a separate commit; (3) once-a-day-per-patient PHI logging stands.                                                                                                                   |
| Action       | `bookFloorFollowUpAction` in `app/clinic/actions.ts` checks `requireTriageScope` and that the intake belongs to this hospital. It picks the first **published** session for the chosen clinic on the chosen Kampala day (the chosen doctor's, if one was chosen), then calls `ha-book-on-behalf` with `origin: 'clinician'`, reason `follow_up`, `note` = the reason given, session mode. The idempotency key is `floor-follow-up:{intake}:{session}`. It returns the booking code. |
| Edges        | A visit with no patient account (provisional) leaves the booking to the desk. With no session that day, the nurse is told and can pick another day. A booking error shows its message instead of the old "desk books it" line.                                                                                                                                                                                                                                                      |
| Copy (draft) | `FLOOR_ERRORS.noSession`, `FLOOR_ERRORS.followUpDesk`.                                                                                                                                                                                                                                                                                                                                                                                                                              |
| Not carried  | The finish form's "texts" switch is not sent: `ha-book-on-behalf` has no opt-out, and the patient gets the usual receipt and reminders, as at the EMR close.                                                                                                                                                                                                                                                                                                                        |
| Tests        | Clinic-floor and reception tests 139/139. Typecheck and lint are clean. The action calls the DB and an Edge Function, so it has no cloud test; it needs a signed-in check.                                                                                                                                                                                                                                                                                                          |
