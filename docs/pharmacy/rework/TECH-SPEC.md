# TECH-SPEC: Pharmacy Rework

This spec goes with `PRD.md`. It tells you **how** to build the rework inside the existing MedSync repo.

Facts about the repo come from the 29 Oct review. They may have moved since. **Verify each path with `rg` before you rely on it.** If a name differs, keep what exists and adapt. Never create a second copy of something that already exists.

## 0. Known repo shape (verify)
- **Framework:** Next.js App Router, TypeScript, Tailwind, deployed on Vercel.
- **Database:** Postgres (Supabase), Drizzle-style schema in `db/schema`, numbered SQL migrations. Tests run on PGlite.
- **Pharmacy code:**
  - `app/pharmacy/**`: 47 routes
  - `lib/pharmacy/**`: `stores/`, `access.ts`, `controlled.ts`, `readiness.ts`, `workspace-v2/places.ts`
  - `content/pharmacy*.ts`: signed copy, read through `SignedCopy` / `workspaceLiveFor`
  - `data/pharmacy/*`: permission maps v1–v3, catalogue, national list
- **Ledger:**
  - append-only movements, with a per-batch `FOR UPDATE` lock in migrations `0124` and `0180`
  - the guard trigger is in `0180:301–340`; downtime currently skips it at `0180:313`
- **Controlled-drug entries:** `pharmacy_controlled_entries`, defined in `0127`. `dispensing_point_id` is `NOT NULL`.
- **Witness attestation:** `lib/auth/attest.ts:46` (own password + code). The 30-minute reusable window is in `0127:52–54`.
- **Catalogue:** use `cat_*` from `0251` only. The older `pharmacy_products` / `pharmacy_medicine_links` become read-only views.
- **Places:** `pharmacy_locations` (keep). `pharmacy_dispensing_points` gets folded into it.
- **Design:** Tide. Read `DESIGN-medsync.md`. The shared kit currently lives under `app/lab/_components/v2`; promote it to `components/tide`.
- **Flags:** 21 env flags. Collapse them to 4 tiers: `PHARMACY_CORE`, `PHARMACY_WARDS`, `PHARMACY_EPI`, `PHARMACY_INSIGHTS`.

## 1. Routes (new information architecture; remove the old routes behind redirects)
```
/pharmacy                         -> redirect /pharmacy/today
/pharmacy/today
/pharmacy/dispense?tab=waiting|ready|owed|done&rx=<id>
/pharmacy/patients/inpatients?ward=&pt=&tab=round
/pharmacy/patients/outpatients?tab=
/pharmacy/patients/immunisation?tab=stock|cold|clinic|clients|defaulters&client=
/pharmacy/patients/reminders?tab=today|rules
/pharmacy/stock/medicines?filter=&med=&batch=
/pharmacy/stock/store?tab=receive|issue|count|order|cold&delivery=&ward=&count=&fridge=
/pharmacy/stock/recall/<id>
/pharmacy/controls/cd?tab=register|flags|checks|paper&med=&place=
/pharmacy/controls/handover
/pharmacy/controls/cases?case=
/pharmacy/records?tab=audit|losses|sheets|reports
/pharmacy/records/team
/pharmacy/setup?tab=live|places|medicines|rules|people|sms
```
- **Shell:**
  - one layout with a 6-section rail
  - a sub-tab nav for multi-page sections, driven by one href map. That map is the single source for nav, Find and redirects.
  - **one h1 per page**
  - below 761 px, a bottom pill
- **Redirects:** every old route redirects to its new home via `next.config` `redirects()`. The prototype's `app.js` → `GROUPS` / `DOORS` shows the full structure.

## 2. Data model

Add the tables below. Map each one onto an existing table first if one already fits.

All tables carry: `hospital_id`, `created_at`, `created_by`. Tables that are append-only get a trigger that blocks UPDATE and DELETE on business columns. Status fields are moved forward by transition functions.

### 2.1 Movements (existing ledger; extend it)
**Columns to add:**

| Column | Type |
|---|---|
| `place_id` | NOT NULL on new rows |
| `kind` | enum, see below |
| `witness_attestation_id` | nullable |
| `happened_at` | timestamptz |
| `entered_at` | timestamptz |
| `late` | bool, generated: `entered_at - happened_at > 30 min` |
| `reverses_id` | FK movements |
| `correction_of_id` | FK movements |
| `reason` | text, from a code list |
| `ref_type` | |
| `ref_id` | |
| `patient_id` | nullable |
| `cd_detail` | jsonb: `prescriber_staff_id`, `dose_mg`, `route`, `residue_mg`, `residue_disposed`, `residue_witness_id`, `bed` |
| `cause` | for losses: `expired`, `cold_chain`, `damaged`, `opened_vial`, `unexplained`, `recall` |
| `downtime` | bool |
| `idempotency_key` | unique per hospital |

**Kinds:** `receive`, `issue` (to `transit:<place>`), `confirm` (transit → place), `handover` (to patient), `administer` (ward dose), `vaccinate`, `transfer`, `returned`, `wastage`, `count_adjust`, `quarantine`, `emergency`, `reversal`, `downtime_entry`.

**Guard trigger.** Rewrite the guard in one new migration so that it enforces:
- S2: no negative balance; no expired, recalled or quarantined stock out. `downtime` is allowed but must set a `needs_count` flag on the batch.
- S3: a controlled medicine leaving any non-patient place needs a `witness_attestation_id`. The attestation must:
  - be unused
  - be no more than 10 minutes old
  - belong to a different user, who is on duty (or the configured nurse role when the Rule allows it)
  - be marked used in the same transaction

  The exceptions are `reversal` (witness required anyway) and `downtime_entry` with `paper_witness_name`, which is flagged.
- `reverses_id`: the movement must exactly mirror the original. The original may have only one reversal.

### 2.2 New tables
| Table | Key columns |
|---|---|
| `pharmacy_witness_attestations` | `id`, `actor_id`, `witness_id`, `role`, `place_id`, `how` (phone, paper), `purpose`, `created_at`, `used_at` (single use) |
| `pharmacy_duty_roster` | `staff_id`, `place_id` (or `pharmacy`), `role` (second nurse, nurse in-charge, doctor on duty, technician, pharmacist, in-charge), `shift` (day, night, call), `date_from`, `date_to` |
| `pharmacy_prescribers` | `staff_id`, `dept`, `cd_allowed`, `only_meds[]`. Or reuse the EMR staff table plus a flag |
| `pharmacy_cd_checks` | `id`, `place_id`, `by`, `witness_attestation_id`, `handover_id` (nullable), `status` (ok, open, resolved) + `pharmacy_cd_check_lines`: `med_id`, `expected`, `counted`, `resolution` (jsonb: how, by, at, incident_ref, late_movement_id) |
| `pharmacy_handovers` | `id`, `place_id`, `slot_at` (nullable means mid-shift), `from_staff`, `to_staff`, `accepted_at`, `keys`, `seal_no`, `seal_new`, `fridge_temp`, `notes` + `..._lines` (`med_id`, `expected`, `counted`, `known_diff_case_id`) + `..._items` (`text`, `seen_at`) |
| `pharmacy_handover_misses` | `place_id`, `slot_at`, `why`, `note`, `by` |
| `pharmacy_cases` | `id`, `source_type` (cd_check, handover, count, manual), `source_id`, `med_id`, `place_id`, `qty`, `severity`, `owner_id`, `due_at`, `status`, `findings` (jsonb: cause, actions[], prevent[]), `submitted_by/at`, `signed_off_by/at` + `pharmacy_case_events` (append-only: assigned, step, submitted, sent_back, escalated, signed_off, with a note) |
| `pharmacy_counts` | Existing month-end tables, made resumable: `count_sheets` with `status` (counting, approval, done) and `count_lines` (`batch_id`, `shelf`, `counted_packs`, `counted_units`, `reason`, `note`) |
| `pharmacy_rx_checks` | `rx_id`, `line_no`, `rule`, `severity`, `answer`, `prescriber_staff_id`, `by`, `at` |
| `pharmacy_rx_queries` | `rx_id`, `line_no`, `flag`, `ask`, `status`, `answered_at` |
| `pharmacy_round_picks` | `id`, `ward_id`, `window_h`, `transit_id`, `by` + lines (`patient_id`, `regimen_id`, `med_id`, `qty`) |
| `pharmacy_fridges`, `pharmacy_fridge_readings`, `pharmacy_excursion_acks`, `pharmacy_fridge_contents` | Fridge, its readings, excursion acknowledgements, and what is kept in it |
| `pharmacy_sms_rules`, `pharmacy_sms_messages` | Messages: `rule`, `to`, `phone`, `lang`, `text`, `status`, `provider_id`, `sent_at`. Plus an opt-out list |
| `pharmacy_reports` | `kind`, `period`, `status`, `remarks` (jsonb), `checked_by/at`, `submitted_by/at`, `snapshot` (jsonb) |
| `pharmacy_risk_actions` | `batch_id`, `action`, `by`, `at` |
| `pharmacy_prices` | `med_id`, `ugx_per_unit`, `source`, `valid_from`. VEN class goes on the catalogue item |

**Immunisation.** If the EMR already has an immunisation register, reuse it and add only:
- vaccine stock movements (`vaccinate`)
- the open-vial state, `pharmacy_epi_open_vials`

**Outpatient refills.** Reuse the refill tables (`0230–0232`) if they have been applied. Otherwise add `pharmacy_op_regimens` and `pharmacy_op_supplies`, including the pill count brought back.

## 3. Derivations: pure functions in `lib/pharmacy/derive/*.ts`
Port these **logic-for-logic** from the prototype. They take plain data and return plain data, so they can be unit-tested without a database.

| Function | Prototype source |
|---|---|
| `todayItems(role, data)` and role order tables | `today.js` |
| `rxChecks(rx, clinicalContext)`, `rxChecksOpen` | `checks.js` (rules table in signed Rules) |
| `wardSuggestions`, `roundLines(ward, hours)` | `today.js`, `rounds.js` |
| `journey(regimen)`: picked, received, given, returned, left | `inpatients.js` |
| `opRefill`, `opCourse` | `outpatients.js` |
| `epiPlan`, `epiStatus`, `epiDefaulters`, `vaxStock` | `epi.js` |
| `orderLines(cycle, buffer)`, `fitToBudget` | `store.js` › Order |
| `excursions(fridge, days)`, `coldStatus`, monthly-chart grid | `cold.js` |
| `cdRegisters`, `cdFlags`, `lastCheck`, `checkDue`, CD dose maths (`CDU`), `CD_GAP` | `cd.js` |
| `hoFlags`, `hoItems`, `nextFor`, `slotsBetween`, people-on-duty | `handover.js` |
| `caseList`, `caseFlags`, severity and deadline | `cases.js` |
| `audit()` timeline, `losses(from, to)`, `atRisk()` | `audit.js` |
| `smsQueue()`, report issue checks | `productivity.js` |

Keep the prototype's constants, such as the minimum CD gaps, vial rules and SLA hours, in signed Rules, not in code.

## 4. Server actions (`lib/pharmacy/actions/*.ts`)
Each action follows the same pattern:
1. check permission in TypeScript **and** rely on the SQL guard
2. open one transaction
3. take `FOR UPDATE` on the affected batches
4. take the idempotency key from the client, persisted per form instance
5. write an audit event if the action is not a movement

Return `{ ok, id }` or a typed error that the UI maps to signed copy.

| Group | Actions |
|---|---|
| Dispense | `handOver(rx, lines[], identity, counselling, checks[])` · `owe` · `hold` · `answerCheck` · `queryPrescriber` · `markQueryAnswered` · `handOverOwed` |
| Store | `startReceive(deliveryId)` · `saveReceiveLine` · `finishReceive(attestation?)` · `issue(dest, lines[], attestation?)` · `confirmTransit` · `startCount(scope)` · `saveCountLine` · `sendCountForApproval` · `approveCount` (in-charge) · `saveOrderDraft` |
| Cold | `recordReading` · `ackExcursion` · `addToFridge` · `takeOutOfFridge(move\|discard\|unlist)` |
| Wards | `pickForPatient` · `sendRound(ward, lines[])` · `returnUnused` |
| EPI | `vaccinate(client, doses[])` · `openVial` · `discardVial` · `registerClient` |
| CD | `recordDose(med, place, patient, prescriber, dose, route, residueDisposed, attestation)` · `cdBalanceCheck(place, counts[], attestation)` · `addLateWitness` · `recordResidueLate` · `reviewEarlyDose` · `resolveCdCheck(how, …)` |
| Handover | `handOverStation(place, toStaff, counts[], keys, seal, items[], notes)`: needs `place == myStation` unless in-charge · `acceptHandover` · `explainMissed` · `resolveHandoverDiff` |
| Cases | `openManualCase` · `assignCase` · `takeCase` · `addCaseStep` · `submitFindings` · `signOffCase` · `sendBack` · `escalate` |
| Records | `correctMovement(id, reason, qty?, batch?, attestation?)` · `riskAction` · `checkReport` · `submitReport` |
| SMS | `toggleRule` · `editTemplate` (creates a draft) · `sendNow` · `skip` · `markCalled`, plus a cron route `/api/pharmacy/sms/daily` (08:00 Africa/Kampala) behind a provider interface (Africa's Talking first) |
| Witness | `requestAttestation(witnessId, purpose)`: push to the witness's device; they approve with their own sign-in (`lib/auth/attest.ts`) and the attestation id returns to the actor's screen |

## 5. Permissions (one map, gated on recorded legal answers, S13)
| Capability | Pharmacist | Store keeper | In-charge | Ward nurse | EPI |
|---|---|---|---|---|---|
| dispense / hand over | ✓ (if legal Q1 is recorded) | | ✓ | | |
| receive, issue, count | ✓ | ✓ | ✓ | confirm receipt | EPI stock |
| approve count, confirm loss, sign off case, submit report, assign case | | | ✓ | | |
| CD dose on a ward | | | | ✓ | |
| CD witness | ✓ | ✓ | ✓ | ✓ (Rule) | |
| handover | own station | own station | any + oversight | own ward | own clinic |
| correct a movement | own entries | own entries | any | own | own |
| Team table | self | self | all | | |

Delete permission maps v1 and v2 and `to-v2.ts` once v3 is the only map. Remove `PHARMACY_DEV_HOSPITALS` and `DEV_SKIP_MFA` from production paths: the app must refuse to boot in production if either is set (H1).

## 6. UI build notes
- **Port the prototype's components to Tide components.** `kit.js` (Chip, Seg, Stepper, Dialog, Tag, MedTags, MedInfo, BrandPick, PackPick, WitnessDialog) maps to `components/tide/*`. Reuse what already exists.
- **Tables:** dense on desktop, card list below 640 px. Sticky first column on wide tables.
- **Charts:** single-series bars and SVG lines as in the prototype, built with Tide chart tokens. Every chart has a hover tooltip, and no chart uses a dual axis.
- **No left or side accent borders** (the owner's hard rule), and no very dark backgrounds.
- **Dialogs:** centred. On a phone, a full-screen sheet.
- **Empty states:** a real sentence that says what to do next.

## 7. Tests (PGlite; only what protects safety, plus a smoke test per page)
1. Guard: controlled out-movement with no attestation → refused. With a used attestation → refused. Same user as witness → refused. Off-duty witness → refused.
2. Guard: a negative balance, expired, recalled or quarantined batch out → refused. Downtime is allowed and flags the batch for a count.
3. Reversal mirrors the original. A second reversal is refused. The balance after a correction is right.
4. A count posts adjustments only on approval, and approval is in-charge only. A resumed count keeps its lines.
5. A CD check mismatch opens a case. Resolving by late entry creates an `administer` with `happened_at` inside the window. Sign-off requires the number fixed plus findings.
6. Handover: a non-in-charge user cannot hand over another station. A controlled-drug line creates a CD check. A missed slot is flagged after 2 h.
7. Idempotency: replaying `handOver` with the same key writes once.
8. `rxChecksOpen` blocks `handOver` until each flag on a given line is answered.
9. `orderLines` and `fitToBudget` never reduce Vital lines.
10. `losses()` totals equal the sum of the loss movements (plus EPI wastage).
11. Copy lint: no build codes in `content/pharmacy*`. No `border-l-` / `border-left` accent classes in `app/pharmacy` or `components/tide`.
12. Playwright smoke at 1440 px and 390 px for every route: no console errors and no horizontal scroll.

## 8. Data and demo (C3)
- **Demo data:** move demo seeding to a separate Supabase project (`DEMO_DATABASE_URL`). Add `is_demo` to rows already in production, filter it out everywhere, and freeze the demo code. **Never `DISABLE TRIGGER` in production.**
- **Seeds:** for local and dev, port the prototype's sample data from `data.js`, `cd.js` seed, `handover.js` seed, `cases.js` seed, `audit.js` seedLoss and `epi.js` CLIENTS into `scripts/seed-pharmacy-dev.ts`.

## 9. Deletions (after the new pages pass their smoke tests)
- v1 list pages
- Phase 0 and Phase 1 queue bodies
- the second dispensing-points model
- the second signed-content store (merge into one)
- `to-v2.ts`
- the old Clinical cards page
- the 26 imports of `app/lab/_components/v2` (replace them with `components/tide`)
- JSON-edited signed packs: make them read-only, or give them a form

Do **not** delete migrations. Write views for old table names that are still read elsewhere.
