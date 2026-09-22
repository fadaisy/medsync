# RECON — Symptom Catalog & Emergency Pathway (Phase 0)

Phase 0 deliverable of `docs/prd/PROMPT-SYMPTOM-CATALOG-EMERGENCY.md` for PRD MS-PRD-SYM-001. Read-only survey of
`feat/booking-app` on 2026-09-21, compiled from six reader reports; decisions taken on it are recorded in
[ADR 0098](../adr/0098-symptom-catalog-and-emergency-pathway.md). Paths are repo-relative; `file:line` as found.

## 1. Data layer actually in use

- **Supabase Postgres + Drizzle. No Prisma, no Better Auth.** One `postgres()` client on `DATABASE_URL` (pooler 6543) wrapped
  by `drizzle()` — `db/index.ts:23-55`. That role is the Postgres superuser, so **every Drizzle query in `lib/**`and`app/**` bypasses RLS**; tenant scope is the query's own `WHERE` plus the scope helpers (`lib/reception/queries.ts:754-790`,
  `lib/reception/scope.ts:50-98`). ADR 0004 documents the clients (`docs/adr/0004-env-and-drizzle-setup.md:38-58`).
- Supabase clients: browser `lib/supabase/client.ts:11-13`; server `lib/supabase/server.ts:18-38` (`getUser()` mandated
  `:12-16`); service `lib/supabase/service.ts:16-31` (RLS bypassed); proxy `lib/supabase/proxy.ts:15-51`; Server-Action →
  Edge transport `lib/supabase/edge.ts:22-71` `callEdge`. Phone: `mobile/src/lib/supabase.ts:17-18`, `mobile/src/lib/edge.ts:66-119`;
  phone reads go straight to PostgREST under RLS (`mobile/src/lib/booking.ts:208-220`).
- Edge Function pattern: `supabase/functions/_shared/auth.ts:24-71` (`serviceClient`, `getCaller`, `hasRole`),
  `_shared/hospital-admin-scope.ts:98-116` `authoriseAtHospital`, `_shared/errors.ts:28-67` envelope, `_shared/logger.ts:9-92`
  PII redaction, `supabase/functions/README.md:21-35` "the mandatory pattern". Exemplar `ha-register-intake/index.ts:35-244`
  (Zod → caller → entry-type flags → auth → **audit before mutate** `:173-195` → insert `:197-227`).
- Migrations: hand-written SQL in `supabase/migrations/` (`0000…0065`), applied one transaction per file by `scripts/migrate.ts:39-75`
  (owner action). Idempotent DDL, DROP-then-ADD CHECK re-issue (`0035_intake_declared_status.sql:24-30`,
  `0054_sa_audit_set_emergency_phone.sql:25-28`), `ON CONFLICT DO NOTHING` seeds. 0065 in full: `0065_symptoms_and_custom_blocks.sql:1-74`.
- RLS is written per table in its creating migration (`0032_patient_entry_points.sql:47-52,128-139`; `0002_rls.sql:23,65-72`;
  `0044_doctor_created_complaints.sql:61-68`) and tested two ways: live-DB suites gated by `tests/rls/_helpers.ts:59`
  (`MEDSYNC_ALLOW_RLS_DB_WRITES=1`, skip in CI — `.github/workflows/ci.yml:12-21`) and source-level policy greps
  (`tests/notifications/gate-e-invariants.test.ts:143-175`).
- **Realtime: not used anywhere** (no `channel(`/`supabase_realtime` hits; `drizzle.config.ts:27` excludes the schema). Boards
  poll: `app/reception/_components/auto-refresh.tsx:13-47` (`router.refresh()` every 30 s, paused when hidden), mounted at
  `app/reception/expected/page.tsx:128` and `flow/page.tsx:75`; the Today page has no poll (`app/reception/page.tsx:17`).
- Encryption: Node `lib/encryption.ts:78-164` (AES-256-GCM, `blindIndex`), Deno twin `_shared/encryption.ts:31-116` (key as
  parameter); parity test `tests/encryption/cross-runtime.test.ts`. Four-eyes: `_shared/four-eyes.ts:25-205`, one caller
  `sa-create-superadmin/index.ts`. Audit: `_shared/sa-audit.ts:178-212` throws on failure; `SaAuditAction` `:30-132` is
  narrower than the DB CHECK (`0063_cadre_fees.sql:130-190`) — three places to edit per new action.
- Crons: `vercel.json:3-16` → `app/api/cron/{cleanup-drafts,sweep-break-glass,dispatch-reminders}`, daily only (Hobby ceiling
  noted at `dispatch-reminders/route.ts:62-70`). Outbox `notification_dispatches` (`db/schema/notifications.ts:64-135`,
  `_shared/dispatches.ts:37-333`) is patient-shaped: kind CHECK lacks `pre_arrival.*`, drain hydrates only appointments/waitlist
  (`route.ts:376-381`).

## 2. The persistent emergency affordance

- **Phone.** Red Emergency **tab** `mobile/src/app/(app)/(tabs)/_layout.tsx:53-73` (`tone="critical"`, "the one red thing" `:25-26`)
  and the red **disc** `mobile/src/components/patient/emergency-button.tsx:13-23` (`IconButton tone="critical"`, target
  `router.navigate("/(app)/(tabs)/emergency")` — a route, never `tel:`). Disc mounted via `Screen trailing=` on every pushed
  screen: `today.tsx:151,175,251,284`, `book.tsx:58`, `ticket.tsx:113-181`, `household.tsx:106`, `clinic/[id].tsx:239,288`,
  `doctor/[id].tsx:304,355`, `visit/[id].tsx:379,521`, interstitial `booking-interstitial.tsx:54`. **Absent** on `index.tsx`
  (splash), `sign-in.tsx:273` (plain text), `consent.tsx` (amber block only), and the four tab screens (they have the tab).
  Screen chrome slot: `mobile/src/components/ui/screen.tsx:57-58,97-102`.
- **Web.** Amber `EmergencyNotice` `app/patient/_components/emergency-notice.tsx:104-155` (`ring-status-caution-fg/40` `:117`,
  `tel:` only when a digit exists `:110-111,144-150`), mounted **in-flow** once in `app/patient/layout.tsx:108-112` and on the
  public `/emergency` page `app/emergency/page.tsx:17-35`; sign-in shows a text link `app/(auth)/sign-in/form.tsx:50-57`.
  Nothing on landing, get-started, signup, onboarding, or any staff shell. `/emergency` is public only by fall-through
  (`proxy.ts:82-83`), not listed in `PUBLIC_PREFIXES` `:24-39`.
- Number source: `hospitals.emergency_phone` (`db/schema/hospitals.ts:31`, CHECK `:54-57`), the sole writer
  `sa-set-emergency-phone/index.ts:61-148`; web `lib/patient/scope.ts:125-149`; phone `mobile/src/lib/booking.ts:259-279,804-829`.
  Copy ratified by ADR 0084 §3 (`docs/adr/0084-book-or-queue-two-doors-relabelled.md:115-139`), ADR 0085 §5 (`0085…md:86-92`),
  `docs/booking-app-build/REFERENCE-LANGUAGE.md:24-27,75-77`.

## 3. Book-or-queue and the same-day path

- Doors: web `app/patient/_components/doors.tsx:55-85` (mounted `app/patient/page.tsx:126`); phone
  `mobile/src/app/(app)/(tabs)/index.tsx:434-475`. Shortlist above both (`page.tsx:125`, `index.tsx:412-416`).
- Web wizard `app/patient/book/_components/booking-wizard.tsx`: `StepId` `:58`, steps `:256-265`, `resumeStep` `:150-163`,
  `canAdvance` `:274-283`, `submit` `:285-323` → `bookAppointmentAction` (`app/patient/book/actions.ts:32-40` zod). Draft/reasons/
  interstitial in `app/patient/book/_lib/booking.ts:31-86,253-302`. Pending picks `lib/patient/pending-symptoms.ts:14-50`.
- Phone: `mobile/src/app/(app)/doctor/[id].tsx:149-275,398-408,635`, `clinic/[id].tsx:115-210,315-323,396`;
  `mobile/src/lib/booking.ts:977-1119` (`requestAppointment` → `pt-request-appointment`, `declareIntake` → `pt-declare-intake`).
- Booking core: `pt-request-appointment/index.ts:86-217` → `_shared/book.ts` (`priority: "routine"` hard-coded `:362,535`;
  rate limit `:225-235`; the only two `symptoms:` writers `:359,532`).
- Queue: web `app/patient/queue/page.tsx` + `actions.ts:26-63`; phone `today.tsx:123-147`; `pt-declare-intake/index.ts:47-222`
  (`walk_in`, `status:'declared'`, 409 on live intake `:178-193`).
- **Urgent/same-day engine path exists only for the system**: `system-propose-urgent-appointment/index.ts:108-234`
  (service-role or superadmin JWT `:108-130`, `findEarliestSlot` `:307-425` over 7 days, writes `origin:'system_urgent'`,
  `priority:'urgent'`, `reason:'urgent_review'`). **No patient-callable same-day path.** Reusable helpers:
  `_shared/slots.ts` `buildSlots` `:233`, `startOfLocalDay/endOfLocalDay` `:603-609`, `DEFAULT_TIME_ZONE` `:191`.
  CHECKs: `priority IN ('routine','urgent')` (`db/schema/scheduling.ts:324`), `origin='patient' → reason<>'urgent_review'`
  (`:310-313`, NOT VALID in SQL).

## 4. Unified intake and entry-point taxonomy

- Tables `db/schema/patient-intakes.ts`: `entry_types` `:30-49` (flags `is_emergency`, `default_priority_hint`,
  `requires_appointment_link`, `requires_referral`, `allows_unknown_patient`); `patient_intakes` `:54-153` — `entry_type_code` FK
  `:62-64`, `entry_point text` **free text, no CHECK** `:65` (values only a comment, `0032:62-64`), `presenting_complaint text`
  `:100`, `priority_hint` CHECK `('routine','high','urgent')` `:132`, **status CHECK `('declared','arrived','awaiting_triage',
'triaged','completed','cancelled')`** `:133-136`, `priorityHintRank` `:177` (three values, pinned by `tests/triage/priority-rank.test.ts:24`).
- Seeded entry types (11): `0032_patient_entry_points.sql:31-45` — `booked_arrival, walk_in, external_referral_routine,
external_referral_emergency, emergency_self_presentation, self_referral_bypass, internal_transfer, inter_facility_transfer,
program_visit, follow_up, virtual`. Plain INSERT, SELECT-only RLS `:47-52` → **a new row (`self_presentation_prealerted`) is
  a migration**; `ha-register-intake` reads flags dynamically (`:95-101`) and the desk's `GROUPS` auto-place it
  (`components/intake/front-door-form.tsx:97-102`).
- Creating service: `ha-register-intake/index.ts:35-244` (inserts `awaiting_triage` `:217`; sends **no** notification despite the
  desk's "receiving unit alerted" copy `front-door-form.tsx:229`). Check-in: `ha-check-in-patient/index.ts:81-251` (Mode A appointment
  → `arrived` + queue row + `booked_arrival` intake `:144-161`; Mode B `declared → arrived` `:183-223`). Reads:
  `lib/intake/queries.ts:100-178` `fetchHospitalIncomingIntakes` (orderBy guard `tests/triage/presence-order.test.ts:106-116`);
  panel `components/intake/incoming-panel.tsx:24-80` (read-only, off-token acuity colours `:83-89,116`).
- RLS `0032:128-142` SELECT-only for superadmin / hospital_admin / patient / any active affiliation; writes via Edge only. Audit
  actions `register_intake … patient_declare_intake` (`0061:568-570`); new actions need a 0066+ re-issue.

## 5. Triage engine v2 discriminators

`lib/triage/discriminators.ts:35-249` (`{code,label,minAcuity,appliesTo,source,lifeThreat}`): life-threat
`airway_compromise, absent_agonal_breathing, cardiac_arrest_no_pulse, unresponsive, active_seizure, exsanguinating_haemorrhage,
spo2_critical_under_90_on_o2, glucose_critical_under_3`; adult `cardiac_chest_pain, focal_neuro_deficit, sepsis_suspicion,
severe_resp_distress, shock_index_high, severe_hypertension, low_diastolic_perfusion, map_below_65`; obstetric
`obstetric_severe_htn, obstetric_heavy_pv_bleeding, obstetric_preeclampsia_triad, reduced_fetal_movements`; paediatric
`paed_grunting_cyanosis_caprefill, paed_non_blanching_rash, paed_infant_fever`; universal `severe_pain`. Lookups
`DISCRIMINATOR_BY_CODE` `:252`. DB seed `0036_triage_engine.sql:53-77` has 21 rows — `severe_hypertension`,
`low_diastolic_perfusion`, `map_below_65` are code-only (drift). Engine `lib/triage/engine.ts:51-326` reads vitals + ticked
codes only; **the intake's complaint text is never read** (`app/nurse/triage/_components/triage-desk.tsx:247-315`).
Alerts `lib/triage/notify.ts:25`. `lib/triage` may not name `symptoms` (`tests/booking/clinical-firewall.test.ts:87-147`).

## 6. Clinical reasoning token catalog

**None exists.** `lib/clerkship` is gone (ADR 0081, `docs/adr/0081-remove-clerkship-v1.md:1-3`); the NCD protocol engine
(ADR 0082) has `Feature.code` snake_case ids (`lib/ncd/catalog/schema.ts:256,317-319`) but no token registry. Nearest
constructs: `symptom_property`/`_option`/`_map` (`db/schema/symptom-catalog.ts:83-138`); `ros_joint_pain_morning_stiffness`
options `none / 30_minutes (<30) / 30_minutes_2 (>30)` (`0045_review_of_systems.sql:180,489-491,868`) and
`disc_joint_pain.brief_stiffness` (`0047_reasoning_discriminators.sql:53`) — orphaned seeds, no reader. **No `stimulant` /
`drug_use` token** anywhere (only the narrative field `drugUse` in `lib/encounter/clerkship.ts:104-105`). `palpitations` exists
as a catalog row (`0043:74,170`). → `reasoningTokenRef` is null throughout (ADR 0098 ruling 4).

## 7. Receptionist workspace

- Guard `lib/reception/scope.ts:31-98`: AAL2 + `cadres.code='RECEPTION'` (seeded `0033_reception_workspace.sql:31-53`,
  `is_clinical=false`); **does not filter `staff_affiliations.state`** (`:75`) — a suspended receptionist still reads.
  No triage/ED cadre exists (`0009_reference_data_seed.sql:143-231`); "who may triage" is a cosign policy (`0036:269-302`).
- Shell `app/reception/_components/reception-shell.tsx:24-150`; nav registry `app/reception/_lib/features.ts:8-63` — closed
  unions `ReceptionFeatureSlug = "" | expected | intake | book | find | flow` (an Incoming board = new slug + icon key + route).
- Today `app/reception/page.tsx:19-108` (own `StatTile` `:113-140`, `IncomingIntakesPanel` `:106-108`, no poll);
  `/expected` `app/reception/expected/page.tsx:49-353` (`xl:grid-cols-[minmax(0,1fr)_21rem]` `:142`, booked table `:225-341`
  `px-4 py-2.5`, queue rail `_components/queue-panel.tsx:29-120`); `/flow` `flow/page.tsx:48-149` (host-zone time `:146-149`);
  `/intake` `intake/page.tsx:16-49` + `actions.ts:23-152`; `/find` `find/page.tsx:46-161`.
- Server-action pattern `app/reception/actions.ts:28-192` (zod → `requireReceptionScope()` → `callEdge` → `revalidatePath`).
- Panel primitives `components/medsync/panel.tsx:12-59`, `stat-card.tsx:18-53`, `patient-identity.tsx:23-30`.
- Audited name reveal `lib/reception/queries.ts:41-158,404-420` (`auditNameReveals`, fail-closed; `#operational_today` basis
  `:91`); enforced by `tests/reception/expected-invariants.test.ts:48-66`. `AutoRefresh` × reveals = one PHI log row per patient
  per 30 s per tab (`expected/page.tsx:126-127`).

## 8. Facility model and hospital setup

- `hospitals` `db/schema/hospitals.ts:8-64`: `name, slug, country, region, district (text, never written), level` CHECK `:46-49`,
  `state`, `emergency_phone` `:31`, quiet hours `:38-41`. **Absent: latitude/longitude, timezone, address, capability, ED
  hours, SMS/ambulance numbers.** Anon-readable (`0002_rls.sql:65-67`). Writers: `sa-set-emergency-phone`, `sa-activate-hospital`.
- Departments `db/schema/hospital-departments.ts:11-31` (no emergency flag); booking policy only in
  `department_scheduling_policy` (`ha-update-department-policy/index.ts:48-60`).
- **No hospital-admin edit path**: `app/hospital-admin/profile/page.tsx:1-16` and `departments/page.tsx:1-16` are
  `PlaceholderSurface`. Superadmin: `app/admin/tenants/actions.ts:63-127`. Application fields with location
  (`db/schema/hospital-applications.ts:71-170`) are not copied onto `hospitals` (`approve-hospital-application/index.ts:217-223`).
  Geography tables have no coordinates (`db/schema/reference-data.ts:57-103`). **Nearest facility cannot be computed from data today.**
- Superadmin PHI rules: ADR 0013 (`docs/adr/0013-superadmin-platform-operator.md:15-40`), ADR 0014 break-glass
  (`0014-break-glass.md:18-50`, decrypt gate not implemented); `patient_intakes` SELECT admits superadmin (`0032:130`).

## 9. Reference-data pattern

`reference_data_versions` provenance log `db/schema/reference-data.ts:33-53` (seeds insert a row first,
`0009_reference_data_seed.sql:39-41`); nine ref tables public-read via loop `0008_reference_data.sql:156-160`; clinical codes
`db/schema/clinical-codes.ts:9-36`; facility levels are a CHECK not a table (`hospitals.ts:46-49`, labels duplicated
`reception-shell.tsx:9-16`). `symptom_catalog` `db/schema/symptom-catalog.ts:35-75` (clinician vocabulary, `scope`/`origin`,
flags `ros_screen,is_pain,must_not_miss,uganda_flag` `:63-70`; seed `0042:189+`, no versions row; RLS `0044:61-68`
authenticated only). Cached loaders `lib/reference-data.ts:60-71` (`unstable_cache`, tag `reference-data`) and
`lib/catalog/symptoms.ts:23-37`. Zero-import shared modules consumed by Next/Deno/Expo: `_shared/symptoms.ts`,
`_shared/dispatches.ts`, `_shared/slots.ts` (phone alias `mobile/tsconfig.json:12-14`) — the home for the content package.

## 10. Design system

- Tokens: `app/globals.css` `@theme` (`:107-141` status/alert/destructive), light `:296-327`, dark `:443-457`; phone
  `mobile/src/theme/tokens.ts:63-72,145-148,215-216,230-293`. Fonts actually shipped: Fraunces + Geist (`app/layout.tsx:18-32`,
  `mobile/src/app/_layout.tsx:32-38`) — `DESIGN-medsync.md:128-132,392-402` is stale (Neue Haas). Motion: expo-out/symmetric,
  100/150/250/400 ms (`DESIGN-medsync.md:289-299`); an unsanctioned `--ease-spring` exists (`globals.css:257`).
- **Red-reserved test** `tests/design/red-reserved.test.ts`: web trees `:51-58`, regex `:94-115` (bans fills, `variant=
"emergency|alert"`, the literal `"critical"`, red/rose hexes), Button variants pinned to `["alert","emergency"]` `:118-131`,
  allowlist `RED_FILL_ALLOWED` `:143-151` (one entry: `queue-panel.tsx`), `text-destructive` must be `role="alert"` `:161-176`;
  mobile `RED_ALLOWED` `:211-225` (5 files, each must exist AND match), every `tone="critical"` needs `label=` `:272-280`,
  `pill.tsx` Tone union pinned `:265-269`. Web red today: `components/ui/button.tsx:32-39`, `clinical-badge.tsx:13-19`.
- Icons: web lucide-react (`package.json:43`); phone Ionicons (`mobile/package.json:9`, `icon-button.tsx:21`).
- **Bottom sheet, phone: none** — two inline `<Modal presentationStyle="pageSheet">` copies (`symptom-quick-pick.tsx:62-96`,
  `doctor/[id].tsx:505-640`); reanimated 4.5.1 + gesture-handler installed (`mobile/package.json:31-32`). Web:
  `components/ui/sheet.tsx`, `dialog.tsx`, `components/responsive/responsive-sheet.tsx:44-117`, `bottom-action-bar.tsx`,
  `mobile-tab-bar.tsx:20-28,85-171` (closed icon union; hidden while consent-gated `app/patient/layout.tsx:118`).
- Dark mode: web class-based via next-themes (`app/providers.tsx:6-19`, `globals.css:13,266,414`); only a teal-ramp
  `medsync-forced-dark` utility exists (`globals.css:820-845`) — **no forced-light**. Phone `mobile/src/theme/theme.tsx:34-101`:
  `ThemeContext` module-private, `ThemeProvider` takes only `children` — **a subtree cannot force light today**.
- Reduced motion: web wraps keyframes in `prefers-reduced-motion` (`globals.css:677-899`); **phone handles none**.
- Haptics/location: `expo-haptics` and `expo-location` **not installed** (`mobile/package.json`); linking/notifications are.
- **i18n: none** (`lib/channels/strings.ts` `Language = "en"` only).

## 11. Test harnesses

- Vitest 4 (`vitest.config.ts:37-53`: node env, `tests/**/*.test.ts` only — `.tsx` tests do not run, no setupFiles).
- axe on statically pre-rendered public pages only (`tests/a11y/static-pages.test.ts:23-70`, `PAGES` incl. `emergency`);
  jsx-a11y strict on `app/patient/**`, `app/reception/**` (`eslint.config.mjs:33-34`).
- Load-bearing source greps: `tests/booking/clinical-firewall.test.ts` (§ below), `tests/booking/symptoms.test.ts:31-140`,
  `tests/patient/booking-wizard.test.ts:134-206`, `tests/identity/gate-d-surfaces.test.ts:77-100`,
  `tests/booking/gate-h-rulings.test.ts:147-287` (enumerates every `(app)` phone route `:276-281`),
  `tests/scheduling/patient-identity.test.ts:36-107`, `tests/triage/presence-order.test.ts:106-116`.
- Budget `scripts/check-budget.mjs` (`/patient*` only, 370 kB `:25`). CI `.github/workflows/ci.yml:45-112` (web: typecheck,
  lint, format, build, test with RLS suites skipped, budget; mobile: tsc, eslint, prettier).
- **Mobile: no test runner at all** (`mobile/package.json:37-51`). **Absent: Playwright, Lighthouse, fast-check, Jest, RNTL,
  Maestro/Detox** (`package.json:61-87`; only transitive lock references).

## 12. Feature flags

Server env booleans `process.env.X === "1"` in `lib/encounter/feature.ts:13-78` (`ENCOUNTER_ENGINE_LIVE` and dependants),
documented in `.env.example:40-53` (owner-untouchable), not in `lib/env.ts`. No client flag (`lib/env.ts:74-80`) — pass as
props from a Server Component. Phone: none; `mobile/eas.json:8-32` carries only Supabase URL/key per profile, so
`EXPO_PUBLIC_FEATURE_*` per profile is the only per-environment default. → ADR 0098 ruling 12.

## 13. Risks and conflicts with the PRD

What the PRD assumes and the repo lacks: a tiered lay catalog (`symptom_catalog` is flat clinician data); a classifier and
a legal home for it; `hospitals` coordinates/capability/SMS/ambulance fields; an emergency-contacts table (one nullable
`emergency_phone` per hospital); a patient-callable same-day path; pre-alert entity, statuses and Incoming board;
`self_presentation_prealerted`; realtime; a phone sheet primitive; forced-light; `expo-location`/`expo-haptics`; mobile
tests; Playwright/Lighthouse/fast-check; i18n; a hospital-admin profile edit path; a persistent affordance on pre-auth and
staff screens; audit vocabulary for the new events.

**The clinical firewall (`tests/booking/clinical-firewall.test.ts`) fails a PRD build in five independent ways**: scoring
trees naming `symptoms` `:87-147`; any booking path importing `lib/triage` or a `/scoring` path `:109-158`; the word
`urgent`/`triage`/`score`/`acuity` shown on eight selector surfaces `:239-286`; catalog flag names on booking paths
`:349-365`; any `.sort/.filter/.orderBy/.where(` naming `symptoms|complaint` across nine trees `:386-408`
(duplicated `tests/scheduling/patient-identity.test.ts:92-107`). Its header (`:5-34`) says the regulatory claim rests on it —
it must be rewritten under an ADR, never dodged by renaming. The five head-on conflicts are in the closing section.

Further risks carried forward: audit-first fails closed (500) until the owner applies the CHECK re-issue
(`sa-set-emergency-phone/index.ts:36-40`); Drizzle bypasses RLS so every board query pins `hospital_id`; `parseDraft` `v:2`
asserted null (`booking-wizard.test.ts:202`); duplicate-intake hazard between `pt-declare-intake`'s 409 and any "arrived"
that inserts fresh (`front-door-form.tsx:36-38`); daily cron cadence is useless for a pre-alert SMS; `AutoRefresh` × name
reveals multiplies PHI log rows; `user_roles` Drizzle CHECK lacks `'reception'` (`db/schema/user-roles.ts:25-50` vs `0033:57-68`);
`incoming-panel.tsx` off-token reds; CSO sign-off stacks a third PROVISIONAL claim on ADR 0095/0096; no fabricated numbers
(`sa-set-emergency-phone/index.ts:16-23`).

## Deviations from the build prompt and why

| Prompt asks                                  | Done instead                                                                                                                                                                                                                                                                |
| -------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm typecheck` etc.                        | **npm.** The repo has `package-lock.json`, Husky/lint-staged and CI on `npm ci` (`ci.yml:45-112`); no pnpm lockfile. Same scripts (`AGENTS.md` table).                                                                                                                      |
| `packages/clinical-content/symptom-catalog/` | **`supabase/functions/_shared/symptom-catalog/`.** No `packages/` workspace exists; the repo's shared-package location is the zero-import `_shared` modules consumed by Next, Deno and Expo (`_shared/symptoms.ts`, alias `mobile/tsconfig.json:12-14`). ADR 0098 ruling 4. |
| Playwright / Lighthouse / fast-check         | **Not installed** (law 11: flag before adding). Navigation budget, route walk, S1 height budget and red allowlist become source-level Vitest checks; monotonicity runs 10,000 seeded-PRNG cases; no Lighthouse numbers are reported. ADR 0098 ruling 11.                    |
| Screenshot matrices (Phases 3, 4, 6)         | **Not produced** — no browser or device automation within the tooling floor; axe runs on statically rendered public pages as today (`tests/a11y/static-pages.test.ts`).                                                                                                     |
| "nothing else installed"                     | **`expo-location` and `expo-haptics` added** — first-party Expo modules, Expo Go compatible, required by PRD §8.3 (on-device nearest) and Phase 4 (haptic on interrupt). Owner restarts Expo; a plugin entry lands in `app.json`. ADR 0098 ruling 9.                        |
| "Clinical surfaces are permanently light"    | **A forced-light utility is added on both platforms**: web scoped token re-pin alongside `medsync-forced-dark` (`globals.css:820-845` pattern); phone an exported forced-scheme provider around `ThemeContext` (`theme.tsx:34-40`), because neither exists today.           |
| National 112 as fallback                     | **Fallback is the hospital's registered `emergency_phone`.** Appendix B seeds `unverified`; production renders `verified` only, and the only verified number in the system is the superadmin-set hospital line. ADR 0098 ruling 8.                                          |
| Nearest facility from coordinates            | **Nearest without coordinates**: `hospitals.latitude/longitude` are new nullable columns, empty at ship; ordering is own facility → pre-alert-enabled by distance where both sides have coordinates → by name. ADR 0098 ruling 9.                                           |
| STOP after each phase                        | Owner instruction 2026-09-21: run every phase and gate on the builder's recommendations; phase reports go to `docs/recon/`.                                                                                                                                                 |

## Risks carried into the build

The five head-on conflicts between what shipped (ADR 0095/0096) and the PRD, and how ADR 0098 resolves each:

| #   | Conflict                                                                                                                                                                                                                                                                                                                                                        | ADR 0098 resolution                                                                                                                                                                                                                                                                                                                                   |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| C1  | **"Never routed" is the contract.** `SYMPTOMS_NOTE` — "It does not change your place in line or your time." (`_shared/symptoms.ts:53-54`), pinned verbatim by `tests/booking/symptoms.test.ts:37-41` and required rendered on four selectors (`clinical-firewall.test.ts:306-331`). An Urgent tier that changes the offered path makes the sentence false.      | **Ruling 2**: the sentence stays true where it renders — under the descriptive picker, which never routes; the tiered catalog carries its own sentence and renders in production only once a version is `signed` (Gate CS). With none signed, production is exactly today's picker and shortlist.                                                     |
| C2  | **Flat clinician catalogue as the selector.** `lib/catalog/symptoms.ts:23-37` / `mobile/src/lib/booking.ts:209-231` read `symptom_catalog` (clinician displays such as "Dysuria", "Orthopnoea"; flags the firewall bans on booking paths `:349-365`); ADR 0095 ruling 2 limits the read to five columns.                                                        | **Rulings 4–5 and Alternatives**: a separate patient content package (`_shared/symptom-catalog/`, versioned JSON + generated TS) and its own tables (`patient_symptom_catalog_versions/_items`). The two catalogues never share a table; the clinician catalogue stays clerkship reference data.                                                      |
| C3  | **Generic 5-chip duration is required on every element.** `BookingSymptom.duration` required (`_shared/symptoms.ts:42-46`), zod `z.enum(SYMPTOM_DURATION_CODES)` in both functions and both actions, `normaliseSymptoms` **drops** any element without it (`:137`) on every reader; pinned `symptoms.test.ts:31-35,113-126`. The PRD wants per-item qualifiers. | **Ruling 3**: one wire shape, versioned — `{code, label}` with `duration` optional and an optional `qualifiers` list; `normaliseSymptoms` keeps duration-less entries. The tier lives on the submission and the appointment (`symptom_tier`), never on an element, so no staff card can colour the list. Migration 0066 (GATED) carries the columns.  |
| C4  | **`urgent` is a banned word on every selector surface.** `ASSESSMENT` regex (`clinical-firewall.test.ts:239-240`) over `SELECTOR_SURFACES` `:243-253`; `CLINICAL_VOCABULARY` bans `fever/bleeding/vomit/breathless` on reason labels; `booking-wizard.test.ts:142-150` bans symptom words anywhere in four wizard files.                                        | **Ruling 1 + Consequences**: the firewall is rewritten to the amended rule — no diagnosis, no reassurance, no drug/dose/threshold copy, free text inert to every engine, triage reads discriminator refs only, monotonicity, content caps, red allowlist, staff surfaces never sort the descriptive line. Tier words are rendered, never colour-only. |
| C5  | **Nothing branches on the emergency list.** `EMERGENCY_SYMPTOMS` is read-only prose (`emergency-notice.tsx:20-38`); ADR 0084 §3 "does not route, ask, or write" and §4 "no router" draw the MDCG/MHRA line the PRD crosses (classifier → Emergency sheet → pre-alert → status).                                                                                 | **Ruling 1 (owner + CSO)**: symptom input may produce advisory tiering from a signed, deterministic rule set — advice, never a triage record; hospital triage v2 re-assesses every arrival; bias to over-triage; monotonicity tested. ADR 0098 supersedes ADR 0084 §3/§4, 0088, 0095 rulings 1–2, 0096 §2/§3/§5 in part; the rest of each stands.     |

Also carried: red on web is allow-listed nowhere (`red-reserved.test.ts:143-151`) — ruling 7 grows the allowlist by exactly the
PRD's list and moves the in-flow amber block out of the patient layout for a root-layout pill; every new phone route must be
added to `gate-h-rulings.test.ts:276-281` and typed routes regenerated; every new audit action is a three-place edit (TS union,
DB CHECK, direct inserters) or a silent 500; booked arrivals and pre-alerts must never create a second intake (ruling 10,
`_shared/intake.ts` extracted from `ha-register-intake`); the pre-alert SMS outbox rows are queued, never reported sent.
