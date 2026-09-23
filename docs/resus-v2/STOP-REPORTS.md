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
