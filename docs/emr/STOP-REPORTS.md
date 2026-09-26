# EMR build — STOP reports

Gate record for PROMPT-ENCOUNTER-EMR on `feat/emr-engine`. Owner and CSO sign-off: every GATE A decision was signed as
recommended on 2026-09-26, in session. Harmonisations: `HARMONISATION.md`.

## STOP 0 — Discovery (2026-09-26)

Five read-only agents answered Q1–Q18. The evidence is in `discovery/{data-layer,clinical-objects,safety-seams,access-workspace,design-ui-terms}.md`,
cited file:line.

| Q | Answer (short) |
|---|---|
| Q1 | Drizzle + postgres-js; hand-written SQL in `supabase/migrations`, one tx per file; text + CHECK; GATED header from 0039; next free is **0071** |
| Q2 | No `set_config` anywhere. Clinical reads and writes use the owner-role Drizzle client, which bypasses RLS. Scoping is in TS (`resolveEncounterAccess`); reads are logged to `clinical_phi_access_log` |
| Q3 | Hosted Supabase only (pooler :6543, `prepare:false`). RLS suites skip without env. A dev project for E1 does not exist yet |
| Q4 | The visit is `patient_intakes`, linked three ways (intake.encounter_id, triage.intake_id, appointment_id). Assignment is a *planned encounter* with `triage_record_id` |
| Q5 | `encounters` has type, state (incl. planned) and disposition (0040), but no `last_activity_at`. End visit = Edge `ha-complete-encounter` (no disposition). The clerking page stores only NCD drafts |
| Q6 | `clinical_observations` is mutable; written by the Edge obs function and the resus v1/v2 mirrors; triage never writes it; Drizzle CHECK drifted |
| Q7 | Allergies: `patient_allergies` (no live writer) + resus timeline captures (current episode only). Resus prescribing checks on the client only |
| Q8 | `pending_encounter_handoff` is set and never read; the handover is SBAR (4 fields); the death-certificate intent is a checklist tick; triage recommendations are never stored |
| Q9 | Lab cadres exist (LAB_TECH, LAB_TECHNOLOGIST) with `/lab`. `clerkshipWriteAuthority` covers 5 medical cadres + CO; intern co-sign is soft |
| Q10 | Four divergent access rules; none checks the hospital; break-glass is superadmin-only |
| Q11 | `lib/encryption.ts` encrypt/decrypt (AES-256-GCM) and blindIndex; one key; no separate HMAC key |
| Q12 | Chart homes are `/doctor/patients/[id]` and `/nurse/patients/[id]` (shared `PatientClinicalRecordPanel`) |
| Q13 | Workspace merged. A lane is a LaneId + LANES + FW-2 branch + loader (no registry). Realtime is the 0069 broadcast pattern. The resus queue is typed to resus |
| Q14 | Four file-based reference shapes. The resus `RefEntry` is chosen for the EMR |
| Q15 | Row counts not measured (no DB access); owner action O-4 |
| Q16 | Flags are env vars in `lib/<area>/feature.ts`. Playwright absent; axe-core present; no print CSS |
| Q17 | Tokens: `bg-status-critical-bg/-fg`, `bg-status-caution-bg/-fg`, `<Pill>`, `ClinicalBadge`, `PageHeader`, plum-50/800 for place, Fraunces/Geist, expo-out 100/150/250/400 ms |
| Q18 | Clerking page: 6 client islands, 4,599 lines (ncd-capture 2,110). Autosave only when a section is left. Not measured (no build at P0) |

**R1–R9:** R1 confirmed, and worse (resus allergies are lost even to the next episode). R2 confirmed in practice.
R3 partly refuted (the link exists; acknowledgement is missing). R4 confirmed. R5 confirmed (triage never writes
observations). R6 confirmed in practice (the tables exist; there is no writer). R7 refuted (no Prisma). R8 confirmed
(plaintext `section_data` and drafts). R9 confirmed, and worse (ICD-10 is already committed).

**Additional safety findings:**
- The resus emergency administration never re-runs the allergy check on the server.
- `recordClerkshipVersion` and lab release are not transactional.
- `ha-start-encounter` can open a second encounter for one visit.
- NCD drafts can be written to completed encounters without an access check.

All are addressed in HARMONISATION §2.

**Baseline deferred:** screenshots and timings of the current clerking page need a build. They are taken once, in the
P5 harness, before the new UI is switched on; with the flag off, the old page is served unchanged.

## STOP 1 — GATE A proposal (2026-09-26)

Pack: `gate-a-proposal.md` (1,783 lines: full 0071 SQL, the one access rule, RLS/grants, backfill, ADR drafts 0130–0139,
permission matrix, 13 wireframes, test plan, decision table + signature), `cfc-v1.1-addendum.md`, and
`data/emr/{note-templates.v1,clinical-fact-concepts.v1.1,diagnosis-terms.v1,test-catalogue.v1}.json`. The 0071 SQL was
dry-run over a PGlite replay of 0000–0070; that run found and fixed 2 bugs (a stray AND; new fact rows leaking into the
3 legacy observation readers, fixed with `state='fact'`).

- **Signature:** every decision was signed as recommended by Fadhul (owner, CSO), 2026-09-26, in session.
- **Terms:** 85 draft diagnosis terms, 13 of them restricted. Every ICD-11 code was checked against the findacode MMS v2026-01
  mirror (verified-mirror, not yet confirmed at icd.who.int), with its unmodified title kept. ICD-10 is null throughout (R9).
- **Test menu:** 35 tests, no reference ranges, no turnaround numbers.

**Decisions taken at this gate (the owner was not available; recorded for confirmation):**
- The operational defaults in §H.2 (autosave debounce 1.5 s, late-entry window 24 h, administrative-closure reasons)
  are hospital settings with defaults → owner confirms (O-9).
- **Allergies cross hospitals [H, safety-positive]:** a clinician with a legitimate basis for the patient at their own
  hospital sees, and the prescribing check uses, that patient's allergies from every hospital, each labelled with where it
  was recorded. Everything else stays hospital-scoped. This keeps today's behaviour (the legacy read had no hospital
  filter) → owner/CSO confirms (O-8).
- **CFC enum extension (addendum):** specimen `sputum`; containers `sodium_citrate`, `blood_culture_bottle`,
  `sterile_container`.
- **Erratum, recorded rather than edited:** in `clinical-fact-concepts.v1.json`, `cond.dka`/`cond.hhs`/`cond.hypoglycaemia_in_dm`
  cite the wrong findacode page. The codes themselves check out.
- **ACVPU `C`** (new confusion) has no AVPU answer, so those readings are quarantined (C11) until a concept is signed.
- **R1–R3 reproductions** are realised as PGlite-lane scenarios A2 (R1), A1/A3 (R3) and A6 (R2). The legacy code has no
  server-side seam a unit test could hold.

## STOP 2 — Data layer (2026-09-26)

**Migrations:** `0071_emr_record_spine.sql` (schema, one access rule, RLS, grants, backfill) and
`0072_emr_reference_seed.sql` (generated by `scripts/emr/gen-seed.ts`). Both are GATED. The PGlite harness replays all
73 (0000–0072).

| Check | Result |
|---|---|
| New tables (Drizzle `db/schema/emr.ts`) | 21, + 5 `_current` views, + evolved: encounters, clinical_observations, encounter_orders, clinical_cosign_requests |
| Insert-only tables refusing UPDATE and DELETE | 13/13 |
| RLS probe matrix | **2,400 probes, 0 mismatches** (26 new objects × 10 actors × 4 ops × 2 paths, + 8 evolved tables × 10 × 4) + the access rule on 156 triples + patient-own CFC read denied |
| Drizzle ↔ database parity | 133 tables compared column by column (types, nullability, CHECK lists); EMR + evolved tables match. Older drift outside the EMR is pinned by name |
| Units (`lib/units`) | 103 tests: 35 known pairs, 25 round trips, 5 signed mismatch rules × both sides, comparators |
| Seeds | 145 v1 + v1.1 concepts, 21 drug-class tags, 29 capabilities, 35 tests, 85 draft terms; regeneration is byte-identical (drift guard) |
| Backfill | 4 `patient_allergies` + 2 resus captures + 1 NKDA copied in the fixture world; re-run adds 0; 100+ legacy tables hash-identical before and after |
| Lane | 204 tests green; without `EMR_PGLITE=1`, all skip in < 1 s |
| App `tsc` | 0 errors |

**Fixed at this gate:**
- The 0031/0033 policy would have let a patient read their own new (possibly restricted) fact rows through the client
  key. A RESTRICTIVE policy now hides every CFC row from `authenticated`, with a probe to prove it.
- The views REVOKE the default Supabase grants.

**Recorded:**
- The `_current` views return the newest version whatever its status; the loader and chart drop `entered_in_error`
  and `cancelled`.
- Registries (concepts, terms, test menu) are readable by any signed-in user: they are non-PHI config.
- `mg/dL` urea is read as urea nitrogen (the spec's factor), so a urea-mass report needs a separate unit (CSO note).
- Ionising flag on the chest X-ray menu item → CSO confirms.
- Pre-existing Drizzle drift outside the EMR is listed in the parity test and not fixed here.

## STOP 3 — Engines (2026-09-26)

`EMR_PGLITE=1 npx vitest run tests/emr tests/emr-db`: **18 files, 2,384 tests, all green**. App `tsc`: 0 errors.
ESLint clean.

| Module | Tests | PROMPT §6 minimum |
|---|---|---|
| units | 103 | 30 |
| facts (round trip of all 204 concepts, contract, legacy, loader lane) | 821 + 7 | every concept |
| encounter (5 actions × 5 states) | 66 | every transition |
| notes | 313 | 40 |
| carry-forward | 22 | 20 |
| allergy | 230 | 25 |
| orders | 442 | 30 + property |
| results | 76 | 40 |
| hmis | 36 | 20 |
| chart | 39 | 25 |
| fhir (12 resources) | 19 | a round trip per resource |

**Property tests:**
- A signed note's canonical form and HMAC never change (200 seeds).
- Nothing ordered disappears (400 seeds, plus state coverage).
- Never NKDA while an active allergy exists (200).
- No restricted item reaches a patient-facing payload (200).
- Same snapshot, same hash (200).

**Loader:** p95 **91 ms** at 2,000 facts on PGlite (WASM, in-process), against a 60 ms budget set for Postgres; measure
on the dev project (O-1). Payload **1.4 MB** against 1 MB: the v1 fact shape repeats the envelope on every fact.
Both are recorded as open budget items, not hidden.

**CFC errata recorded (ADR 0130):**
- `MedicationFact.status` collides with the envelope's status, so it is renamed `medicationStatus`.
- `ContextFact.setting` is optional.
- `PregnancyFact` has no EDD basis slot.
- `rpt.ecg` `device` clashes with the blood-pressure device enum.

**Carried to P4:**
- Reader-role grants for `patient_profiles` (column-limited), `encounter_medications` and `hospitals`.
- Invariants every write path must keep: each version keeps its concept; sensitivity is set at insert with
  `sensitivityFor`; addenda inherit the parent's restriction.
- The `ENCOUNTER_IDLE_MS` constant moves to `lib/workspace/flow.ts`.
- Legacy `resulted` orders never enter Results to review; only events-lifecycle orders do.

## STOP 4 — Write paths, handoffs, lanes, realtime (2026-09-26)

The first run was cut by the session limit after W3 finished (committed b2fd76e). W1 and W2 resumed from their partial
files, then W4 and W5 ran.

**Scenarios on the PGlite lane (`tests/emr-db/scenarios.test.ts`): 10/10.**

| | Result |
|---|---|
| A1 | ✅ triage prefill (vitals projected), diagnosis, mRDT + fasting glucose (fasting chip enforced), result, acknowledgement, completion `home` (only the unsigned-note warning) |
| A2 | ✅ an OPD-coded amiodarone allergy is refused by the resus re-check; an allergy written through resus AMPLE shows in the safety bar, **named** (fixed at this gate) |
| A3 | ✅ critical with a TEST-signed entry: flag, communication, Critical results lane, acknowledgement clears. Shipped time frame → `timeframe_not_signed`; TEST-signed and elapsed → escalate |
| A4 | ✅ signed note immutable (trigger), addendum threaded, entered in error struck with its reason, the note-born fact leaves the snapshot |
| A5 | ◐ encounter + signed ISBAR note + flag cleared. Outstanding actions are not turned into proposed orders: the resus close-out has no structured action list |
| A6 | ✅ stale encounter → Needs closing, stays open; administrative closure needs a reason |
| A7 | ✅ reception refused (even with forged `isClinical`), other hospital refused; an intern's note awaits co-sign while their orders commit |
| A8 | ✅ 30 s offline with a reply dropped mid-flight: nothing lost, in order, the draft coalesced |
| A9 | ✅ notifiable (TEST-signed IDSR class): confirm payload, pending intent (an encounter event), IPC prompt, never blocks |

**Audit completeness:** 40/40 EMR rows written in the scenarios have audit rows with the acting user, across 12 tables.

**Totals:**
- `EMR_PGLITE=1` over tests/emr, tests/emr-db and tests/workspace: 46 files, **3,084 tests**.
- Pre-existing suites (prescribing, resus, encounter, triage, ncd, lab): 120 files, 2,169 passed, 1 skipped.
- App `tsc`: 0; `typecheck:functions`: 0; ESLint: 0.
- The harness replays **74 migrations** (0073 = realtime + reader grants + allergy source text).

**Built:**
- Write functions and `'use server'` actions for encounters (through the two Edge Functions: start reuses the open
  encounter; complete takes disposition, follow-up and closure), notes (draft, sign with HMAC + note-born facts in one
  tx, co-sign through `clinical_cosign_requests.sign_note`, addendum, entered in error), facts (observations with the
  unit check, allergies, assertions, problems, diagnoses with one primary, medicines, reconciliation, pregnancy,
  procedures, generic entered in error), orders (placed, collected with the fasting chip, received, rejected,
  preliminary/final/amended results, acknowledgement, critical communication) and triage suggestions (accept/dismiss).
- `/lab` actions re-pointed under `EMR_V1`, each in one transaction.
- NCD bridge (`lib/ncd/cfc-map.ts`, 47 rules); drafts now encrypted.
- Resus AMPLE writes through to the allergy record; every prescribe path reads it, with a server-side re-check.
- Workspace: 3 new lanes (critical results, results to review, to co-sign) with the 400-seed property test green;
  one idle constant.
- 0073: PHI-free `chart:<patient>` broadcasts, receive-RLS through `private.may_hear_chart`.
- `lib/emr/sync` write queue and server clock.
- Resus close-out consumes the handoff after its commit.

**Fixed at this gate (both found by the integration agent in Phase 3 code):**
1. The chart styled a critical value as critical only when its context was complete. A critical glucose with an
   unknown fasting state would have lost its alarm. Missing context never hides an alarm now (test added).
2. The loader projected uncoded and backfilled allergies without their text, so the safety bar showed "substance not
   named". One resolver (`resolveAllergyTexts`) now serves the prescribe path and the loader. Under RLS, backfilled
   text comes through `private.allergy_source_text` (0073), which returns only that string and only with a basis
   (test added).

**Open, recorded for the owner:**
- If the record cannot be read at emergency administration, the dose is still recorded and stamped
  `allergyRecord='unavailable'` after the amber warning. CSO to confirm, or require an override reason.
- A close-out with no access basis leaves `pending_encounter_handoff` set; the chart offers to bring the handover in
  (P5).
- Duplicate vitals are flagged, not merged (10-minute window → O-9).
- New lanes use hotkeys 8, 9 and 0 (keys 1–7 unchanged).
- Chart broadcast payload is `{kind, at}` (no id).
- **Deploy order:** 0071–0073 must be applied **before** this branch is deployed. Drizzle's encounter inserts name the
  0071 columns, which is the house rule for gated migrations.
