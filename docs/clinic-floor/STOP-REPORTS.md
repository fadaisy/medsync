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
