# Resus Desk v2 — gate reports

One section per STOP, newest last. Branch `feat/resus-desk-v2` (cut from `feat/booking-app` at `aa1fe46`).
The owner instruction for this build was "go through all gates", so each STOP is recorded here and the
build continues. The CSO sign-off this implies is recorded, decision by decision, in
`docs/resus-v2-gate-a-proposal.md` §12.

---

## STOP 0 — discovery, safety net, baseline (2026-09-23)

### Answers

| #   | Question                                     | Answer                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| --- | -------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Q1  | ORM and migrations                           | Drizzle (`db/schema/*`). SQL in `supabase/migrations/` is applied by `scripts/migrate.ts` (journal table `_medsync_migrations`, keyed by filename, one transaction per file). No Prisma or PGlite. Highest on this branch: `0066`; `0067_intake_route.sql` exists uncommitted on `feat/booking-app`, so v2 takes **`0068`**. The drizzle `check()` lists for `sa_audit_log` and `sa_notifications` have drifted from the SQL: the SQL is authoritative. |
| Q2  | Encounter engine                             | `encounterEngineLive()` = `ENCOUNTER_ENGINE_LIVE === "1"` (off by default; on in `.env.local`). `lib/encounter/handoff.ts` `openEncounterFromTriage(triageRecordId, scope)` creates or links an encounter (idempotent on `triage_record_id`); `lib/encounter/record.ts` `recordClerkshipVersion` writes a note.                                                                                                                                         |
| Q3  | Wards / units                                | `hospital_wards` (name, slug, `bed_count`, state) only. No unit type, no capabilities, no beds table. → v2 adds `hospital_care_units` (E5).                                                                                                                                                                                                                                                                                                             |
| Q4  | Pending-intent seam                          | A type only: `RecommendationSeam = "live" \| "pending_intent"` (`lib/triage/recommend.ts:35`). No table or function. → v2 records the admission request as a `decision` event with `seam: "pending_intent"` and builds no bed management.                                                                                                                                                                                                               |
| Q5  | Scheduled jobs                               | Vercel crons only (4, daily — Hobby plan), each `app/api/cron/<name>/route.ts` behind `CRON_SECRET`. No pg_cron. → the 12 h idle notice is sent by a daily cron **and** lazily when the board is rendered (whichever first); see GATE A §9.                                                                                                                                                                                                             |
| Q6  | Supabase client, realtime                    | supabase-js / realtime-js 2.106.1, `@supabase/ssr` 0.10.3. `lib/supabase/client.ts` is a cookie-session browser client, already used for realtime once (`postgres_changes` on `emergency_pre_arrivals`). No `realtime.messages` policies and no broadcast yet. → Broadcast-from-database on private channels is available (E2).                                                                                                                         |
| Q7  | Service key                                  | `SUPABASE_SERVICE_ROLE_KEY` (legacy `service_role` JWT; not `sb_secret_`). **Flag:** Supabase is replacing `anon`/`service_role` keys with publishable/secret keys by end of 2026.                                                                                                                                                                                                                                                                      |
| Q8  | Design tokens                                | Committed `DESIGN-medsync.md` has **no plum** (ADR 0097 is uncommitted on `feat/booking-app`). Red = `rose-600` fills / `#DC2626` critical; in-progress blue token exists; red-scarcity test `tests/design/red-reserved.test.ts` exists. → E6 keeps the teal current-step ring.                                                                                                                                                                         |
| Q9  | O₂ and GCS                                   | `VitalSnapshot.oxygen` (air/oxygen) exists and is carried from triage, but the **capture form does not offer it**. GCS is a bare total in vitals and components in the D pickers — two unreconciled sources. → v2 adds O₂ device/flow to capture and makes D's components the one GCS, shown in the vitals strip.                                                                                                                                       |
| Q10 | Root cause of P3 / P4                        | `deriveProgress` (`lib/resus/engine.ts`) marks a step assessed on any `assessment`, `vital` or action event for that letter. Vitals are logged under step **C**, so a vitals event makes C "Clear"; an airway findings set with no patency (engine state `null`, panel "Not yet assessed") also reads "Clear". Threat comes only from `payload.danger`, never from vitals. The step engines' own classification is used only to turn a step red.        |
| Q11 | Playwright / axe                             | `axe-core` 4.13 is installed; Playwright is **not** (no new dependency added). Screenshots, counts, axe and latency are driven over raw Chrome DevTools Protocol from a scratch script against a local production build with a synthetic fixture route (excluded from git) and a dead database URL.                                                                                                                                                     |
| Q12 | Value storage                                | All text + CHECK (no Postgres enums): `re_state_check`, `re_trigger_kind_check`, `re_disposition_check` (`theatre, icu, cath_lab, ward, mortuary, transferred, deceased`), `rte_kind_check` (14 kinds), `rte_step_check`, `rra_role_check`. → v2 alters the CHECKs in one migration.                                                                                                                                                                    |
| Q13 | Measure codes with an explicit signed number | A `gcs_le8` (GCS ≤ 8). B `rr_raised` (≥ 25), `rr_very_high` (≥ 30), `rr_low_falling` (≤ 8), `spo2_lt92` (< 92 %), `spo2_lt94` (< 94 % **on air**). C `tachycardia` (> 100), `bradycardia` (< 60), `hypotension` (SBP ≤ 90 or MAP < 65), `shock_index_high` (> 0.9), `shock_index_severe` (≥ 1.0), `narrow_pulse_pressure` (< 25 % of SBP). D `hypoglycaemia` (< 3.0). Everything else (lactate, PaO₂, pH, PEF, oliguria, ketones) stays manual.         |
| Q14 | Rapid-Red "no pulse / arrest"                | Creates an L1 triage record only; the nurse stays on the triage board and must tap **Open resus**. Arrest is never flagged. → S0 wires the no-pulse reason straight into an arrest-mode resus.                                                                                                                                                                                                                                                          |

### Brief vs repo

1. **`feat/booking-app` HEAD did not build.** `app/globals.css` had an unterminated `@utility medsync-forced-dark` (commit `f62769e`). Fixed on this branch (`43a754c`); the owner's working tree already carries the fix.
2. Vitals are logged under step **C** (not stated in the brief) — the P4 root cause.
3. `logResusVitals` mirrors to `clinical_observations` but drops consciousness and O₂, and never sets `encounter_id`.
4. The supplemental-O₂ field exists in the data model but not in the capture form.
5. The drizzle CHECK lists for `sa_audit_log` / `sa_notifications` / `obs_kind_check` lag the SQL.

### RLS

`tests/rls/resus-tables.test.ts` — 37 probes: 4 tables × {same-hospital clinical read, other hospital deny, reception deny, anonymous deny, superadmin read, client INSERT denied, client UPDATE no effect, client DELETE no effect} + patient own/other, recorder own, service-role UPDATE/DELETE blocked by the append-only trigger. **Not executed:** there is no test Supabase project here, `.env.local` points at production, and the harness forbids writes there. The suite skips cleanly; run it with `MEDSYNC_ALLOW_RLS_DB_WRITES=1` against a test project.

### Baseline (v1 desk, fixture patient with SBP 70 / SpO₂ 67 %)

| Metric                                            | A   | B   | C   | D   | E   |
| ------------------------------------------------- | --- | --- | --- | --- | --- |
| Finding chips visible on load                     | 38  | 50  | 58  | 47  | 28  |
| Interactive elements in the findings area on load | 39  | 51  | 59  | 50  | 33  |

- Controls per action row: **5** (Doing / Done / Failed / Defer / N/A).
- axe (desk, light): **54 serious** `color-contrast` nodes; 1 `landmark-one-main`, 31 `region` (moderate).
- Tap-to-visible for **Done**: not measurable offline — v1 renders nothing until the server action returns and the page re-renders (`router.refresh()`), so it equals a full server round trip.
- Screenshots: 4 viewports × light/dark, in the scratch `baseline/` folder. They reproduce P4 (A and C "Clear" beside "Not yet assessed" panels) and the dark-mode contrast failures (teal-filled cells and the "Clear" chips are unreadable).

### Failing tests (by design)

`tests/resus/v2/step-bar-regression.test.ts`: 7 of 8 fail against the v1 derivation (P3 × 5, P4 × 2); the control passes. The 332 existing resus tests pass. The only other red test in the suite, `tests/a11y/static-pages.test.ts`, needs a `next build` first (pre-existing).

---

## STOP 1 — GATE A (2026-09-23)

`docs/resus-v2-gate-a-proposal.md` + the three CSO catalogs (`docs/clinical/resus-{als,post-rosc,closeout}-clinical-catalog.md`).
Every number was re-verified against its primary source the same day by three independent passes:

| Source family                                               | Result                                                                                                                                                                                                                                                                   |
| ----------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| RCUK 2025 ALS / BLS / SC / PRC / Ethics                     | 42 + 32 + 20 items **match**, verbatim-checked (downloaded and text-searched). No mismatch.                                                                                                                                                                              |
| AoMRC 2025 (death confirmation), ICS 2021, NEWS2            | **Match.** AoMRC adds three rules the reference omitted (5 min starts at mechanical asystole; disconnect the ventilator first; tell the family the time may differ) — added as ALS-DTH-02/03/08. ICS BMI > 40 cases added (CO-R15/16). NEWS2 middle band is "5 or more". |
| ERC 2025 Ethics                                             | 20-min criterion **matches** the accepted author version (publisher page blocked).                                                                                                                                                                                       |
| ERC 2025 ALS/BLS/SC, AHA 2025, Utstein 2019/1997, ILCOR LRS | **Blocked** (403 / closed). No AHA number is displayed; Utstein 20-min sustained ROSC shown as signed with a browser re-read before go-live (D25).                                                                                                                       |
| Divergences logged                                          | ANZCOR potassium 5 mmol vs RCUK 20+10 (D23); ANZCOR 1:1,000 IV adrenaline (D22); gluconate substitute not encoded (D17); IM-suppression is a CSO rule (D21).                                                                                                             |

Signed by instruction ("go through all gates") — decisions D1–D25, E1–E7 in GATE A §12, with the open sub-questions answered
conservatively and marked "confirm".

---

## STOP 2 — data layer (2026-09-23)

**Migration** `supabase/migrations/0068_resus_desk_v2.sql` (+ Drizzle `db/schema/resus.ts`): episode phase + close-out columns;
timeline kinds/step/arrest_seq/client_event_id/late_entry; six new tables; activity + PHI-free broadcast triggers; an episode
audit trigger that no longer fires on the activity clock alone; realtime topic authorisation; notification + audit CHECKs;
legacy backfill. **Not applied** — owner action (`npm run db:migrate`). It must be applied **before** the web ships (v1 reads
`select *` from `resus_episodes`).

**Offline verification** — every migration `0000`–`0068` (incl. `0067` from the main tree) replayed into an embedded Postgres
(PGlite, local harness only) over a minimal Supabase bootstrap, then **71 / 71 probes pass**:

| Area                   | Probes                                                                                                                                                  |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Legacy backfill        | arrested episode → `arrest`, seq 1, activity = last event; plain → `survey`, seq 0, activity = started_at; **nothing closed**                           |
| Timeline               | new kinds / step `post` / arrest_seq accepted; bad kind/step/seq rejected; UPDATE & DELETE still blocked; idempotent insert (`ON CONFLICT … WHERE`)     |
| Activity + audit       | insert bumps `last_activity_at` with **no** episode audit row; a phase change **is** audited                                                            |
| Realtime               | broadcast to private `resus:<episode>` with PHI-free payload `{eventId, kind, recordedAt}`; phase change → `resus-board:<hospital>` + `resus:<episode>` |
| CHECKs                 | phase, outcome_code (only when concluded), closure_kind, levels, mismatch, disposition (`hdu`, `labour_ward`, `discharged`), bay energy 1–400 J         |
| Immutability           | arrest records and after-death tasks append-only; debrief editable as draft, immutable once submitted, never deleted                                    |
| RLS (6 new tables)     | same-hospital clinician reads; other hospital, reception cadre, no affiliation read nothing; client INSERT/DELETE denied                                |
| Realtime authorisation | `resus:<id>` and `resus-board:<hospital>`: same-hospital clinician may listen; other hospital, reception and malformed topics may not                   |

**Live-DB suites** (`tests/rls/resus-tables.test.ts`, `tests/rls/resus-v2-tables.test.ts`, 71 cases) skip locally — no test
Supabase project; `.env.local` is production.

**Legacy episodes flagged idle:** cannot be counted offline (production data). After `db:migrate`, every active episode with
`last_activity_at` older than 2 h appears under "Needs closing" — the 112-day episode from the screenshot among them.

**Deviations from the prompt:** no seed rows (no fabricated hospital facts — `scripts/seed-resus-units.ts` loads what the hospital
declares); idle thresholds stay signed constants, not a hospital setting; writes use one Drizzle transaction (event + header +
audit) instead of the REST service client, which cannot span statements.

## STOP 3 — engines (2026-09-24)

All engines are pure (`lib/resus/**`, no I/O) and read numbers only through signed reference entries (Law 3).
`npx vitest run tests/resus`: **65 files, 1,290 tests, 0 failing** (332 v1 tests unchanged).

### Tests per module

| Module                                                                   | Tests |
| ------------------------------------------------------------------------ | ----: |
| v1 (existing, unchanged)                                                 |   332 |
| `als/**`: engine, timing, shocks, drugs, modifiers, causes, ROSC, S1–S5  |   314 |
| `closeout/**`: lifecycle, level of care, handover, idle, post-ROSC rules |   247 |
| `survey/vitals-bands.ts` (SV-VIT, one-measurement pairs)                 |    94 |
| Equivalence suites (SV-EQ-01..13)                                        |    56 |
| `survey/context.ts` (+ context events)                                   |    53 |
| `survey/floor.ts` (+ floor after ROSC)                                   |    36 |
| Payload parity v1 ↔ v2                                                   |    33 |
| `survey/do-now.ts` (+ evidence wording)                                  |    26 |
| `survey/disclosure.ts`                                                   |    22 |
| Law 3 reference reachability                                             |    22 |
| Write rules (`v2-rules.ts`: core + arrest)                               |    29 |
| `reference/presentation.ts`                                              |    11 |
| P3/P4 step-bar regression                                                |     8 |
| Rule-ID coverage                                                         |     7 |

### Rule-ID coverage

`tests/resus/v2/rule-coverage.test.ts` reads every rule ID a signed catalog defines and fails on any ID without a test whose
title starts with it. The allow-list is empty.

| Source                                        | IDs | Uncovered |
| --------------------------------------------- | --: | --------: |
| `resus-als-clinical-catalog.md` (ALS-\*)      | 116 |         0 |
| `resus-post-rosc-clinical-catalog.md` (PR-\*) |  29 |         0 |
| `resus-closeout-clinical-catalog.md` (CO-\*)  |  62 |         0 |
| Survey (SV-CTX/VIT/FLR/DIS/DN/EQ)             |  83 |         0 |
| Lifecycle (LC-\*)                             |  10 |         0 |

### Equivalence (§7.1)

- **SV-EQ-01..04:** every legacy context key has one v2 input; every legacy context combination per step is reproduced exactly
  (A 16, B 64, C 256, D 256, E 32, arrest state and D's `abcAbnormal` included); classify / triggered actions / identify give
  identical output for v1-style and v2 contexts.
- **SV-EQ-05..07:** the co-variance list equals GATE A §4; no other input moves more than one step; 512 seeded combinations
  each set exactly the union of their separate effects.
- **SV-EQ-08..10:** worsen-only holds exhaustively (every recorded set × every subset of derived codes × context × arrest) and
  over 600 seeded timelines; the floor calls the engines' own functions.
- **SV-EQ-11..13:** 324 in-band adult vitals derive nothing; vitals alone never produce "Clear"; ages null / 0–15 derive nothing.

### Review

Six review lenses over engines, references, actions and the migration raised 64 findings; two skeptics each confirmed 47, all
fixed with tests (e.g. arrest state now clears on ROSC; MAP / pulse pressure / shock index come from one measurement;
post-ROSC answers are scoped to the latest arrest; the stored phase is derived from the timeline under the row lock; retries
are idempotent for companion rows; bedside times are bounded).

### For the CSO (wording / behaviour chosen during fixes)

1. ALS-DRG-06 / MOD-01 / MOD-10: the anaphylaxis and modifier text now say "≤ 1 µg/kg" with LAST and "adrenaline withheld
   while core < 30 °C" below 30 °C, instead of "1 mg IV".
2. Lidocaine below 30 °C or with LAST shows no dose ("no signed lidocaine rule — senior decision"); a signed row is needed.
3. ALS-RC-09: the low-ETCO₂ PE hint no longer marks Thrombosis "suspected" by itself (the record cannot show adequate
   minute volume and good compressions).
4. NEWS2 for level of care scores the newest resus vital set only and is null when that set is incomplete.
5. SV-CTX-18: a flag recorded on a legacy (v1) assessment is kept even when the context bar later turns it off.
6. Unknown age is treated as adult for targets and arrest protocol (shown as "age not recorded" in the console).
7. Kept for v1 parity, flagged: during an arrest an empty A/B/C assessment classifies from the arrest context; D/E can read
   "Clear" during an arrest.

## STOP 4–7 — UI, hardening scope and final report (2026-09-24)

Condensed into one report at the owner's request (the separate STOP 4–6 write-ups and the remaining Phase 7 suites were
cut for time; what that leaves open is listed under "Deferred").

**Branch** `feat/resus-desk-v2` (from `aa1fe46`), 11 commits, `43a754c`..`e54d570`. `npx vitest run tests/resus`: **76
files, 1,388 tests, 0 failing** (with `tests/design` + `tests/emergency`: 87 files, 1,570). `tsc` (app + functions),
ESLint and Prettier clean; `next build` with `RESUS_DESK_V2=1` exits 0.

### UI review (Phase 4–6)

Browser harness (fixture route, no database): 9 scenarios × 4 widths × light/dark. Five review lenses (sync, clinical
safety, accessibility, design system, spec) raised 81 findings; two skeptics each confirmed 71; seven fixer groups plus a
follow-up pass fixed them together with 35 harness findings. Highlights: refused writes no longer drive mode, clocks or
decision support (amber banner, Retry / Discard); console shortcuts cannot fire from inputs or dialogs; one-tap Undo only for
reversible entries (ROSC, stop, death, arrest declaration need Correct… with a reason); a server-blocked fast-path drug
stays visible as "Not saved — needs the prescribe dialog"; withheld / hypothermia-delayed drugs never fast-path (client and
server); End resus after a stop or death offers only "Died" / "Opened in error"; the post-ROSC bundle collapses by section;
phones show every vital and all five steps without sideways scrolling; dark mode uses the semantic primary tokens.

### Section 14 numbers

| Metric                                                 | Baseline       | Target    | Result                                                                                        |
| ------------------------------------------------------ | -------------- | --------- | --------------------------------------------------------------------------------------------- |
| Finding chips visible on load per step (A/B/C/D/E)     | 38/50/58/47/28 | ≤ 12      | 11 / 9 / 12 / 8 / 11 (survey-assessed, max promotion)                                         |
| Interactive elements in a step's findings area on load | —              | ≤ 22      | max 21                                                                                        |
| Controls per action row                                | 5              | ≤ 3       | 3                                                                                             |
| Taps per arrest event                                  | —              | 1         | 1 (rhythm, shock, drug, airway, access, ETCO₂, ROSC; re-arrest one tap + Undo)                |
| Tap-to-visible p95                                     | —              | < 100 ms  | 13.2 ms (key-sign chip, 20 taps); 13.2 ms (arrest log, 20 taps)                               |
| Timer drift across devices                             | —              | ≤ 1 s     | not measured — needs realtime on a test project (owner check)                                 |
| Tests: existing / new / equivalence                    | 332 / – / –    | all green | 332 unchanged / 1,056 new / 56 equivalence — all green                                        |
| Rule IDs without a test                                | —              | 0         | 0 (300 IDs)                                                                                   |
| RLS probes passed                                      | —              | 100%      | 71 / 71 offline (PGlite replay); live suites skip — no test project                           |
| axe serious/critical                                   | —              | 0         | dark: 0 on every screen; light: only white on `#0D9488` (3.74:1, the design system's primary) |
| Legacy episodes flagged idle / closed administratively | —              | report    | cannot be counted offline (production data); every active episode idle ≥ 2 h shows after 0068 |

The last three non-primary light-mode contrast failures (tone toggle, two small teal links in the console) were fixed after
the final measurement and not re-measured.

### Owner actions before the flag goes on

1. Apply `0067` then `0068_resus_desk_v2.sql` (`npm run db:migrate`) — the web must not ship before 0068.
2. Load the hospital's care units and bay defibrillators: `scripts/seed-resus-units.ts` with a JSON in the format of
   `docs/resus-v2/hospital-resus.example.json` (nothing is seeded; without it the close-out lists no units and the console
   says "highest available setting").
3. Set `RESUS_DESK_V2=1` on a test deployment first; run the live RLS suites against a test Supabase project
   (`MEDSYNC_ALLOW_RLS_DB_WRITES`, never production).
4. Re-read in a browser the sources automation could not (D25: Utstein 20-min sustained ROSC, the new-attempt rule; ERC /
   AHA 2025 primary texts).

### For the CSO (confirm or change)

- **Re-arrest after ROSC is one tap + Undo** (signed ALS-ROSC-07 taken over D20's confirm dialog; the first arrest still
  confirms).
- **Unknown age = adult protocol**, shown as "Age not recorded — adult protocol" (children < 16 get no numbers).
- **Light-mode primary buttons** (white on `#0D9488`, 3.74:1) fail WCAG AA at body size — a design-system decision.
- **Phones:** the vitals strip and step rail wrap instead of scrolling (a deliberate deviation from §5.1 so a critical value
  is never off-screen); on phones the step rail shows the state word, the "from vitals · not assessed" qualifier is in the
  accessible name only.
- GCS verbal "T" is stored as 1 with `intubated` (v1 behaviour: E3 VT M5 = 9).
- Record findings is disabled while nothing changed, so an "unchanged on reassessment" timestamp can no longer be written.
- A death confirmation queued offline records the server's receive time, not the bedside tap.
- Leaving the resus area after CPR stops but before death is confirmed is refused as "transferred out".
- Wording chosen during fixes: ALS-DRG-06 / MOD-01 / MOD-10 ("≤ 1 µg/kg" with LAST, "withheld while core < 30 °C"),
  lidocaine with no signed hypothermia / LAST row, the ALS-RC-09 PE hint no longer pre-marking Thrombosis, the child PE-lysis
  and ALS-MOD-15 ("standard energy") texts, the gestation prompt for postpartum, and the drug-dose display format.
- NEWS2 scores the newest resus vital set only (null when incomplete); SV-CTX-18 keeps v1-recorded flags.

### Deferred (not built or not measured in this build)

- Scenario scripts S0 and S7–S11 (engine-level; the rules under each are unit-tested) and S6 (two devices).
- Phase 7 suites: 60 s network drop mid-arrest, realtime reconnect, mode switch < 150 ms, zero layout shift on clock
  ticks, 500-event recompute < 8 ms at 4× throttle, added JS on the desk route (gzipped).
- A resus red-scarcity source test for the v2 components, and fast-path tests for the look-alike guard and the
  controlled-drug witness rule (the behaviour exists; these would guard regressions).
- The daily idle-sweep cron (`/api/cron/sweep-idle-resus`): the 12 h notice is sent when the board renders.
- "Not available here" bundle answers are recorded but not yet fed into capability data; the board keeps the floating
  Emergency button until it has its own header link.
- Device click-throughs of S0–S11 on phone and tablet need a test database (server actions need a session).
