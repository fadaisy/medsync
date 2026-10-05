# NCDSync build ledger

Prompt: `docs/ncd/PROMPT-NCDSYNC-BUILD-v2.md`. Worktree `~/Desktop/medsync-ncdreg`, branch `feat/ncd-registry` from
`origin/main` 8e45d34 (upstream unset; never pushed). Run mode: **continuous** (owner: "go through all gates").
Checks run with `EMR_PGLITE=1 SKIP_ENV_VALIDATION=1` and **no `.env.local`** in the worktree, so no test reaches a hosted
database; `tsc` needs `NODE_OPTIONS=--max-old-space-size=6144` on this 8 GB machine.

## P0 — Recon and conform · DONE

- Built: `00-RECON.md` (16 points with evidence), `01-DESIGN-NOTES.md` (all 7 boards + `ncd.css` read), `DECISIONS.md`,
  this ledger. Inputs copied: the prompt, the PRD, the demo catalogue.
- Catalogue check (HARD STOP 7): valid JSON, version 1.0.0, 26 persons, 0 without `is_synthetic: true`, 110 visits,
  9 day-0 appointments, 8 overdue.
- Baseline before any change: `tsc` app + functions exit 0; `eslint` 0 errors, 2 warnings (pre-existing); Vitest 326 files
  passed, 21 skipped; 8,298 tests passed, 238 skipped (318 s).
- Deviations: D-02 (npm), D-03 (registry person table), D-04 (`ncd_appointment`). Commit type is `feat(ncd)`/`test(ncd)`
  with the phase in the subject, because commitlint allows no `ncd` type (repo wins over `ncd(P<n>)`).
- Incident: `.env.local` was briefly symlinked into the worktree; the first baseline run was stopped during lint, before
  any test ran, and the link removed. No test touched a hosted database.

## P1 — The standard as versioned data · DONE

- Built: `lib/ncdreg/standard/` — `types.ts`, `code-lists.ts` (29 lists + medicine list + LOINC), `conditions.ts` (2 full,
  8 core modules), `calculations.ts`, `classifications.ts`, `validation.ts`, `indicators.ts` (34 definitions),
  `dictionary.ts`, `document.ts`, `generated-docs.ts`; `scripts/ncdreg-docs.ts` (`npm run ncdreg:docs`).
  Generated: `NCDREG-v0.1-DRAFT.md`, `CONDITION-MODULES.md`. Seeded `SIGNOFF-REGISTER.md` (27 items).
- Checks: `tests/ncdreg/standard.test.ts` (module contract via Zod, every item draft, unverified codes, no HIV/dose field,
  34 indicator codes, both documents regenerate identically twice and match disk), `tests/ncdreg/condition-code-search.test.ts`
  (exists, passes), `tests/ncdreg/calculations.test.ts` (eGFR cross-checks 92/99/32/133 exact, every KDIGO, foot, grade
  boundary, care band, status order): 3 files, 81 tests passed.
- **CHECKPOINT 1** passed (continuous mode: no stop).

## P2 — Engine · DONE

- Built: migration `0093_ncd_registry.sql` (GATED; 26 tables, roles `medsync_ncd_app`/`medsync_ncd_analytics` without
  BYPASSRLS, capability functions, interlock triggers, audit triggers, generated policy + grant blocks via
  `npm run ncdreg:policies`); Drizzle `db/schema/ncd-registry.ts`; `lib/ncdreg/{capabilities,table-access,migration-blocks,
db,context,crypto,identity,search}.ts`; the command path `lib/ncdreg/commands/{schema,shared,handlers,apply}.ts`
  (enrol, registration, visit arrive/nurse/clinician/close/record/lab/invalid, review, event, call, merge, query,
  generic observations and recorded control, arrival and stage, the injectable entry time). ADR 0208 (proposed).
- Checks (PGlite lane, `EMR_PGLITE=1`): `tests/ncdreg-db/migration.test.ts` (applies after all 0000–0090, re-runs to a
  no-op, RLS enabled+forced on every NCD table, facility_id everywhere but the capability map, no BYPASSRLS, generated
  blocks current) 7/7; `tests/emr-db/drizzle-parity.test.ts` 180/180 with the NCD tables; **access probes 1,664/1,664**
  (26 tables × 16 actors × 4 operations, expectations derived from the I1 map); `tests/ncdreg-db/extensibility.test.ts`
  (throwaway core module through registration and a closed visit, engine level) 3/3; calculation tests 81/81 (P1 file).
- The code-search test caught `heart_failure` typed as a literal in the baseline schema (a known-CVD code that shares the
  module code); now derived from the code list.

## P3 — Indicator engine · DONE

- Built: `lib/ncdreg/indicators/{dataset,load,engine,snapshot}.ts` (C01–C16, the generic G01–G06 family for every enabled
  module, H01–H12, monthly snapshots), the seeded generator `lib/ncdreg/fixtures/generator.ts`, ADR 0212.
- Golden dataset: 69 patients and the expected numbers written by a separate agent that never read the engine
  (`tests/ncdreg-db/golden/`), loaded through the commands. **58/58 expectations equal**, every number and the patients
  behind it; sum checks hold; G04.hypertension = C04–C06 and G04.diabetes = C07–C11 exactly.
  One expectation pair (C13/C14) was re-derived by hand when D-22 changed the will-return rule (R10 joins C13); recorded
  in expected.ts with the reason.
- Snapshot immutability: `tests/ncdreg-db/snapshot.test.ts` 3/3 (signing refused before go-live; signed snapshot refuses
  update and delete; recompute returns it unchanged).
- Generator determinism: `tests/ncdreg/generator.test.ts` 3/3.
- Performance: profiled at 1,000 generated patients: ~14 s per 100 patients written (enrol 11→35 ms as the duplicate
  search grows, visit ~20 ms). The earlier 2,000-patient runs never finished: the generator's duplicate-name loop spun
  forever once one sex's name pairs ran out (seed 7, about 1,000 patients); fixed in P11 with a retry cap that leaves
  smaller cohorts unchanged, and a termination test.
- **Performance gate (P11, committed code): 2,054 generated persons, 15,030 commands written (546 s); dataset load
  376 ms, month computation 50 ms, 12-month trend 350 ms — each under 500 ms.** (`tests/ncdreg-db/performance.test.ts`,
  `NCDREG_HEAVY=1`.)

## P4 — Command path, identity, administration, go-live · DONE

- Built: `lib/ncdreg/commands/*` (P2) plus `lib/ncdreg/admin.ts` (I2 definition versions with a different approver, I3
  settings, I4 condition catalogue, roles, §8.3 go-live request and approval), the client outbox
  `lib/ncdreg/offline/{store,outbox}.ts`, ADRs 0209–0211.
- Checks: `tests/ncdreg/identity.test.ts` 10/10 (the catalogue's duplicate_check_demo lands in its tiers; fixture pairs);
  `tests/ncdreg-db/enrolment.test.ts` 9/9 (A1 token, A2 server-side, A3, A4, A5, A6, idempotency, A7 merge);
  `tests/ncdreg-db/interlocks.test.ts` 8/8 (real person refused before go-live, DEMO- series, draft module before/after
  go-live, go-live refused with synthetic persons or a draft core module, same-user and non-CSO approval refused,
  I2 four-eyes, role limits); `tests/ncdreg/outbox.test.ts` 8/8 (fake IndexedDB).
- **CHECKPOINT 2** passed (continuous mode).

## P5 — Today's clinic and visit capture · DONE

- Built: `/ncd` Today's clinic, `/ncd/enrol`, `/ncd/patients`, `/ncd/patients/[id]` (record, reviews, events, late lab),
  `/ncd/visit/[id]` and its phone view, shared kit, event dialog, `lib/ncdreg/visit-form.ts`, read models.
- Checks: `tests/ncdreg-db/visit.test.ts` 10/10 (B1, B3, B4, B7, B8 with audit, B9, D1, G2, every hard block, confirm
  never block, C2); `tests/ncdreg/visit-form.test.ts` 32/32 (**speed budget: 9 required inputs** for diabetes +
  hypertension with unchanged medicines; each core registration adds ≤ 2; B9 assembly incl. a throwaway module; B2, B6,
  G1; every confirm range; every consistency query).

## P6 — Recall · DONE (lane C)

- Built: `lib/ncdreg/recall/*` (banned terms from the catalogue, templates with two approvers, the transport boundary,
  the send-time dispatcher), `/ncd/recall`, `/ncd/recall/templates`, cron route. Notes: `docs/ncd/lanes/C.md`.
- Checks: `tests/ncdreg/recall.test.ts` 7/7 (E4 banned-term scan, E3 quiet hours); `tests/ncdreg-db/recall.test.ts` 7/7
  (E5 two approvers, E4 refusal, only approved templates sent, quiet hours, D1 no send after death, E6 opt-out at send
  time, interlock 3 synthetic never dispatched under any transport).

## P7 — Annual review and events · DONE

- C1/C2 forms and calculations, C3 list (`/ncd/reviews`), D2 event form from the record and the patients list, D3 reasons.
- Checks: C2 in `visit.test.ts`; C3 boundary dates in `visit-form.test.ts` (12 months exactly, less a day, 30/31 days).

## P8 — Dashboards, reports, quality, demo data · DONE

- Built (lane B): `/ncd/dashboard` (F1, F3, F6, F7, §11.4 charts), drill-down, `/ncd/report/[month]` (F5). Lane C:
  `/ncd/my`, `/ncd/quality` (G3, G4, A7 UI). Mine: `/ncd/admin`, the demo service `lib/ncdreg/demo/{catalogue,source,
writer,service}.ts`, cron continuation, ADR 0213.
- Checks: `tests/ncdreg/dashboard.test.ts` 13/13 (suppression 1–4 and the synthetic exemption, shared scale, G02 order,
  colour ramp, F7 layout contract on markup — no browser runner, so "four rows visible at 1440×1000" is unverified);
  `tests/ncdreg-db/quality.test.ts` 4/4 (G4 reproducible from its seed); **acceptance walk `tests/ncdreg-db/demo.test.ts`
  13/13** (every expect block, 9 day-0 stages and arrival times, featured trajectory 6 visits, 8 overdue in order with
  last outcomes, duplicate tiers, one dashboard row per enabled condition, same-day duplicate query, interlocks 1, 2, 4, 7,
  idempotent replay, removal without residue keeping a hand-entered synthetic person and the audit log, modules restored);
  `tests/ncdreg/interlocks-static.test.ts` 5/5 (interlock 9 banner; interlock 5 only the snapshot module writes indicator
  values). Interlock 8 in `interlocks.test.ts`; interlock 3 in lane C; interlock 6 in P10.
- Calibration: five tuning rounds on an in-memory mirror (D-26): round 1 30/38, round 2 30/38, round 3 33/38, round 4
  35/38 (kept), round 5 33/38. Known gaps after round 5: C07, H08 dialysis_start, H08 amputation. The database-backed gate
  run (`tests/ncdreg-db/calibration.test.ts`, P11): full clinic through the real path (26 + 1,293 persons), **35/38
  within tolerance**, the same three gaps; table in `DEMO-DATA.md` and `calibration-result.md`.
- **CHECKPOINT 3** passed (continuous mode).

## P9 — Offline · DONE

- Built: `lib/ncdreg/offline/cache.ts`, the outbox provider with sync state and sign-out purge, `public/ncd-sw.js`
  (scope /ncd; static shell and hashed assets only, D-24), `/ncd-offline`, the NCD manifest.
- Checks: outbox, replay, ordering, back-off, permanent refusal notes, encryption at rest, non-extractable key, cache
  replaced whole (removed demo records leave the device), purge only when the outbox is empty: `tests/ncdreg/outbox.test.ts`
  8/8. Conflict rule (same-day duplicate kept and queried): acceptance walk. No browser-level offline test (no runner).

## P10 — Exchange · DONE

- Built: `lib/ncdreg/exchange/{index,legacy}.ts`, `lib/ncdreg/exchange/dhis2-mapping.json` (shipped empty), `/ncd/exchange`
  and its download route.
- Checks: `tests/ncdreg-db/exchange.test.ts` 7/7 (DHIS2 refuses with empty identifiers, runs once mapped; FHIR refuses
  unverified codes, and with the development flag every resource passes the R4 structure schemas; four-eyes release; no
  identifier field or value in the research extract; full export with the dictionary, logged; legacy dry run reports a
  row error and a probable duplicate and refuses to apply, a clean file imports as back-entry; **interlock 6**).
- Generated: `DATA-INVENTORY.md` (28 tables). Written: `HAZARD-LOG.md` (12 hazards), `USER-GUIDE.md`, ADRs 0209–0213.
- **CHECKPOINT 4** passed (continuous mode).

## P11 — Hardening · DONE

- Accessibility pass: the strict jsx-a11y block covers `app/ncd/**` and `app/ncd-offline/**`; every finding fixed.
- Adversarial review by a fresh subagent: 15 findings (among them: an approved go-live request insertable directly; identifiers to
  roles without reveal; self-assignment; unpaged decrypting list; offline discards; demo/merge leaks; …). All fixed with
  regression tests in `tests/ncdreg-review/` (10 attacks + the same-day engine test, all passing). Decisions D-28 to D-35;
  hazards HZ-13 to HZ-15. Commit 65bd499.
- Requirement audit by a second subagent: 48/51 verified, D2, F1, I5 built_unverified (I5 partly built). D2 (reporting
  unit defaults), F1 (dashboard board test) and I5 (empty state with the demo switch on all five list screens) closed;
  further tests for I7 interlock 1, H4 refusal, A2 dismissal logging, E2, F2, F4, G3, I3, continueLoad and the legacy
  import (`tests/ncdreg-db/requirements.test.ts`). Now 51/51 verified, with untested parts listed in the final report.
- Generator hang fixed (see P3); performance gate and calibration gate run green (P3, P8).
- Final re-run from a clean `.next` and the committed tree: see `FINAL-REPORT.md` §3.
