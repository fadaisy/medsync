# Pharmacy Phase 4: STOP reports

## STOP 0: discovery and baseline (26 Oct 2026)

Branch `feat/pharmacy-network`, cut from `origin/main` at 4d68236f. Phases 1, 2 and 3 are all merged there, so this branch carries them. No product changes. Numbers claimed: migrations 0230–0249 and ADRs 0425–0444 (`docs/NUMBERS.md`). The highest numbers on any branch are migration 0212 and ADR 0423.

### Q1: what earlier phases left (P1 to P13)

| #   | Finding                                                                                                                                                                                                                                                                                                                     | Evidence                                                                                                                           | The prompt said                                                     |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------- |
| P1  | **All three Phase 1 merges are present, including Step 9.** That covers outcomes, hand-over with identity, slips with codes, the patient list, refill dates, `getRefillStatus`, the message renderer and the banned-term scan. **Not a stop.**                                                                              | `docs/pharmacy/phase-1/FINAL-REPORT.md`; `lib/pharmacy/patient-list.ts:353`; `lib/pharmacy/messages.ts:20,200,284`; migration 0134 | as claimed                                                          |
| P2  | `pharmacy_supplies.supplying_hospital_id` is `NOT NULL REFERENCES hospitals(id)`. Nothing ties it to `hospital_id`, and today only the dispensing hospital is written. **The supplying organisation must be a `hospitals` row.**                                                                                            | 0126:70; `lib/pharmacy/supply/handover.ts:643`                                                                                     | "any organisation, no schema change": **only half true**            |
| P3  | A refill date comes from `days_covered` (an integer above 0), or from a structured course (3d, 5d, 7d or 14d) supplied in full. `single`, `until_review` and no course give no date. Nothing is estimated.                                                                                                                  | `messages.ts:74-92`; `patient-list.ts:187,212-221`                                                                                 | as claimed                                                          |
| P4  | `prescriptions.frequency`, `duration` and `quantity` are **free text**. The plan dialog's `course` is an enum, and it is read as structured only when it equals a course code. **There is no structured quantity**, so a repeat's quantity must be its own field.                                                           | `db/schema/prescribing.ts:90-92`; `plan-rx.ts:101`; `formulary-types.ts:62`                                                        | unconfirmed; **now confirmed: free text**                           |
| P5  | The per-line check store is `prescriptions.check_answers` (jsonb `[{code, answer, outcome}]`, ADR 0233). The print renders `PrescriptionLine`, which is where a repeat line would go.                                                                                                                                       | `prescribing.ts:129`; `components/emr/prescribing/views`                                                                           | as claimed                                                          |
| P6  | **The lane registry cannot hold a request.** `LaneId` is a closed union of 10 ids. Rows are `PatientFlowRow` per patient, and `FlowTask` requires an `encounterId`. A renewal request needs a new `FlowInput` source, a new `LaneId` and a branch in `flow.ts`. Phase 1 recorded the same seam.                             | `lib/workspace/lanes.ts:12-22,51`; `lib/workspace/flow.ts:101,255,573-761`                                                         | unread; **now: needs a new source and lane**                        |
| P7  | `/patient/track/medications` exists. It uses `components/ui`, **not Tide**, even though `components/tide/` and the patient-web Tide prompt have merged.                                                                                                                                                                     | `app/patient/track/medications/`                                                                                                   | partly                                                              |
| P8  | **There is no organisation model.** `hospitals` is the tenant, and its `level` check allows only hospital levels and `private`. `user_roles.hospital_id` is NOT NULL for everyone except superadmin. Superadmin approvals are hospital- or user-shaped.                                                                     | `db/schema/hospitals.ts:17,73-74`; `user-roles.ts:34-36`; `sa-pending-approvals.ts:56-57`                                          | unread; **now: a partner needs a new table or a new hospital kind** |
| P9  | Clinical sign-up requires a hospital, a department and a council. Identity is anchored to `council_id` and `registration_number` (unique pair). Approval is by the same hospital's admin. **A user cannot join a non-hospital organisation today.**                                                                         | `app/signup/clinical/actions.ts:29-50`; `clinician-profiles.ts:35-49`; `approve-staff-affiliation/index.ts:93`                     | unread                                                              |
| P10 | **The NCD recall list does not read `getRefillStatus`.** Only a PGlite test calls it.                                                                                                                                                                                                                                       | `tests/emr-db/pharmacy-patient-list.test.ts`                                                                                       | "reads it if on the branch": **not wired**                          |
| P11 | Phase 2 has merged. `pharmacy_locations.kind` allows store, dispensing_point, ward, cart and quarantine. **There is no `prepared` kind**, so a migration must widen the check.                                                                                                                                              | 0180:22-25                                                                                                                         | as expected                                                         |
| P12 | Phase 3 has merged: stewardship, reactions and reconciliation (0210–0212, `lib/pharmacy/clinical/*`). RF-4 can be built.                                                                                                                                                                                                    | migrations 0210–0212                                                                                                               | as claimed                                                          |
| P13 | Phone: `patient_profiles.phone_encrypted` and `phone_hmac`. SMS consent: a `consent_records` row (`sms_communication`) plus the `sms_opt_outs` STOP list. Next of kin: name, relationship (including guardian) and phone. **There is no proxy or nominated collector on the patient.** Collectors exist only per hand-over. | `patient-profiles.ts:36-38,61-63`; `consent-records.ts:44-50`; `pharmacy-dispensing.ts:367-370`                                    | unread                                                              |

### Q2: quantity, duration and the print

See P4 and P5. A repeat needs its own structured fields: count, interval, until, and quantity per supply. The print gets one extra line in `PrescriptionLine`.

### Q3: lanes

See P6. Renewal requests need a new flow source and lane. That is a change to the doctor workspace, recorded for GATE A.

### Q4: organisations

See P8 and P9. The decision for GATE A is between two options:

- **(a)** a `partner_pharmacies` table with its own staff link. This is cleaner, but the supply FK to `hospitals` and the sign-up path both need work.
- **(b)** a new `hospitals.level`, such as `partner_pharmacy`, so supplies, roles and approvals work unchanged. This is smaller, but it blurs what a hospital is.

### Q5: patient record

See P13. A nominated collector would be new. SMS consent already exists.

### Q6: 90-day counts at the test hospital

As in Phases 1 and 3, these counts are **owner inputs**. They are not invented. Run the queries read-only in the Supabase SQL editor, with `:h` set to the test hospital's id, and paste the results back.

```sql
-- (a) supplies by medicine, and how many carry a refill date (days_covered only; courses not counted, so this understates)
SELECT pr.medicine_id, count(*) supplies, count(*) FILTER (WHERE s.days_covered > 0) with_refill
FROM pharmacy_supplies s JOIN pharmacy_products pr ON pr.id = s.product_id
WHERE s.hospital_id = :h AND s.supplied_at >= now() - interval '90 days'
  AND NOT EXISTS (SELECT 1 FROM pharmacy_supply_reversals r WHERE r.supply_id = s.id)
GROUP BY 1 ORDER BY 2 DESC;
-- (b) patients with two or more supplies of the same medicine
SELECT count(*) FROM (SELECT s.patient_user_id, pr.medicine_id FROM pharmacy_supplies s
  JOIN pharmacy_products pr ON pr.id = s.product_id
  WHERE s.hospital_id = :h AND s.supplied_at >= now() - interval '90 days'
  GROUP BY 1, 2 HAVING count(*) >= 2) x;
-- (c) "buy outside" prescriptions, and how many closed as reported by the patient
SELECT count(DISTINCT prescription_id) buy_outside,
  count(DISTINCT prescription_id) FILTER (WHERE EXISTS (SELECT 1 FROM pharmacy_line_events c
    WHERE c.prescription_id = e.prescription_id AND c.kind = 'filled_elsewhere' AND c.reason_code = 'patient')) closed_reported
FROM pharmacy_line_events e
WHERE e.hospital_id = :h AND e.kind = 'buying_outside' AND e.occurred_at >= now() - interval '90 days';
```

### Q7: the 2026 Act

This is **waiting for the owner.** It needs a copy of the National Drug and Health Products Authority Act, 2026, from the lawyer: whether it has commenced (s.1 statutory instrument), and its savings and transitions (ss.119 and 120). Nothing is assumed.

### Q8: tooling

| Tool             | State                                                                                                                                                                                                                |
| ---------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Playwright       | **Not installed.** As in Phase 3, use the CDP harness (`scripts/patient-web/harness.mjs`: system Chrome, screenshots, axe).                                                                                          |
| axe              | Installed (`axe-core`)                                                                                                                                                                                               |
| Fake clock       | No shared helper. Vitest's `useFakeTimers` and `setSystemTime` are used in `tests/pharmacy/*`.                                                                                                                       |
| RLS probes       | `tests/rls/` and the PGlite lane (`npm run test:emr-db`)                                                                                                                                                             |
| `tests/pharmacy` | 790 tests pass. 5 files do not load without environment variables (`period`, `review-ui`, `stock-page`, `stores-store/receiving-words`, `stores-supply/supply`). This is the same baseline as before, not a failure. |

Screenshots of the four named screens were **not taken**, to keep this step cheap. They can be taken with the harness on request.

### Disagreements with the prompt (the repo wins)

1. P2: a partner supply needs a `hospitals` row or a new FK.
2. P4: quantity and duration are free text.
3. P6: lanes need a new source.
4. P8 and P9: there is no organisation model.
5. P10: the recall list is not wired to refills.
6. P7: the medications page is not Tide yet.

### Before Step 1 (GATE A) can be signed (from the prompt)

- Interim written answers to legal questions 1 and 2 (Appendix E).
- The record of the 2026 Act's commencement (Appendix F, Q7).
- The name of the person who will verify partner pharmacies.
- Q6 counts (helpful to the CSO, not a blocker).

## STOP 1: GATE A proposal (26 Oct 2026)

Written: `gate-a-proposal.md`, `hazard-log.md` (H4-1 to H4-22) and `adr-drafts.md` (0425–0433). Checked once against Step 1's list. Every item is present, and none proposes a clinical value.

**Waiting:**

- the legal answers to questions 1 and 2;
- the 2026 Act commencement record;
- the partner verifier's name;
- the signatures in the proposal's last table.

D-PH4-29 departs from the prompt's header. It proposes the CSO signing alone, by recorded exception, for Steps 2 to 5 only. That needs the owner's explicit choice.

## STOP 2: data layer, built dark (26 Oct 2026)

Built under D-PH4-29 (CSO alone, Steps 2 to 5). **Nothing is on.** The migrations are written but not applied, and no flag exists yet, so nothing reads the new tables.

**Written:**

- `0230_pharmacy_repeats_refills.sql`: repeat authorisations and their events, repeat instances, collectors, renewal requests, refill requests, the `prepared` location kind, set-aside and release stock movements, and the `routed` and `route_returned` line events.
- `0231_pharmacy_network.sql`: the partner register, licences, pharmacists, verifiers, interests, verifications (second person to confirm), partner staff, agreements (four eyes), routing consent, routings and the partner variant of `pharmacy_supplies` (exactly one supplier, RT-5 exemption).
- ADR 0428 (partners are not hospitals).
- The Drizzle definition of `pharmacy_supplies` follows 0231. The recall trace and the supply reversal skip partner supplies, because those have no hospital batch.
- `tests/emr-db/pharmacy-network-data.test.ts`, 8 tests: RP-2, RI-1, RN-2, PN-4, AG-1, Law 5, Law 7, the S2 RLS probes and S3 immutability.

**Checks:**

| Check                 | Result                                                                                              |
| --------------------- | --------------------------------------------------------------------------------------------------- |
| Typecheck (8 GB heap) | Clean                                                                                               |
| Lint                  | 0 errors (4 old warnings)                                                                           |
| Unit tests            | Only the 21 files that also fail on a clean origin/main                                             |
| PGlite lane           | Identical failures to origin/main (45 files and 2 tests fail on both), plus the 8 new tests passing |
| Drizzle parity        | Only the 2 old problems                                                                             |

**Owner, when the inputs are in (not now):**

```bash
cd ~/Desktop/medsync-network && npm run db:migrate
```

**Deferred:**

- Drizzle tables for the new tables, and the flags `pharmacyRepeats`, `pharmacyRefills`, `pharmacyNetwork`, `pharmacyNetworkMessages` and `networkRegistry`. Both are added at Step 3 with the code that uses them.
- The SA-1 prepared-stock test (needs batch fixtures, Step 5).
- The RT-5 partner-supply insert test (Step 7).

**Number clash:** ADR 0425 has been taken by two other branches (`feat/patient-web-tide`, `fix/arrival-routing-review`). No Phase 4 file uses 0425. The 0425 draft will take the next free number when it is written.

**Still blocking switch-on:** the legal answers to questions 1 and 2, the Act commencement record, the verifier's name, and the DPO or legal adviser for partner routing.

## STOP 3: engines, pure (26 Oct 2026)

**Written (no I/O, no UI, no flag):**

| File                          | Rules                                                                   |
| ----------------------------- | ----------------------------------------------------------------------- |
| `lib/prescribing/repeats.ts`  | RP-1 to RP-6                                                            |
| `lib/pharmacy/refills.ts`     | RF-1 to RF-5, and RN-1 to RN-4 (one file, not a separate `renewals.ts`) |
| `lib/pharmacy/prepared.ts`    | SA-1 to SA-6                                                            |
| `lib/network/partners.ts`     | PN-2 to PN-5, Law 13 ordering                                           |
| `lib/network/routing.ts`      | AG-1, RT-1 to RT-7                                                      |
| `lib/network/messages.ts`     | NM-1 to NM-3                                                            |
| `content/pharmacy-network.ts` | Appendix B and 5.10, all `draft`                                        |

Phase 2 amended for 0230's kinds:

- LC-1 `prepared` location;
- LC-3 `prepared` column (set_aside_in, released_out, supplied, quarantined_out), and the point gains set_aside_out and released_in;
- SL-12 pairs;
- month-end columns (internal, like an issue);
- line events `routed` and `route_returned`.

The LC-3 table test and the pairs test now include the new kinds.

**Every pack is unsigned (Appendix D), so each engine takes it as `null` and does the "while unsigned" column:**

- no Repeats step;
- nothing set aside;
- nothing routed;
- no partner in force;
- decline only with a signed list.

No value is proposed. The tests use labelled test values.

**Scenarios, all passing** (`tests/pharmacy/network/engines.test.ts`):

- S4 (300 seeded runs);
- S5 (200 seeded runs);
- S6 (each of 12 conditions alone);
- S7;
- S8;
- S9.

**One addition to RP-6:** `first_supply_open`. A line whose own first supply is still open is not a refill, so it does not become a renewal request.

**Checks:**

- typecheck clean;
- lint clean;
- pharmacy stores and network tests 200/200;
- Drizzle parity: the 2 old problems only.

## STOP 4: repeats and renewals for the prescriber (dark)

Behind `PHARMACY_REPEATS` (per hospital, inside `PHARMACY_WORKSPACE`, off in production while `PHARMACY_NETWORK_COPY` is draft). Nothing applied, no flag on.

**Migration 0232 (GATED, unapplied):** adds the five Phase 4 pack kinds to `pharmacy_signed_sets` (repeat_rules, refill_timing, hold_rules, renewal_decline_reasons, routing_rules). Drizzle for the ten 0230 tables in `db/schema/pharmacy-network.ts`; parity shows only the 2 old problems.

| Where                                      | What                                                                                                                           |
| ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------ |
| `lib/pharmacy/network-packs.ts`            | one Zod schema per pack kind; `networkPack()` returns null while unsigned                                                      |
| `lib/emr/write/repeats.ts`                 | `authoriseRepeats` (inside `placePlan`), `stopRepeats`, `answerRenewal`, `renewFrom`, terms for the card and the print         |
| `lib/emr/actions/repeats.ts`               | the two server actions (stop, answer)                                                                                          |
| `components/clerking/plan/repeats.tsx`     | the Repeats step (four typed fields, day/month/year boxes) and the line's tag with Stop repeats                                |
| print page `_components/repeats-print.tsx` | the s.37(5) line under each line with live repeats, with the council number                                                    |
| `app/doctor/renewals/`                     | the renewal list; Renew opens the prescribing dialog on the source visit; Book a visit; Decline only with a signed reason list |
| workspace                                  | a "Renewal requests" lane (key `r`), shown only with the flag on and to a prescribing cadre                                    |

**While unsigned:** no Repeats step is shown and a line sent with repeats is refused whole; Decline is absent.

**Kept as it was:** D-PH1-49. The printed page's own text is unchanged; the guard strips the repeats line the way it strips the print hook.

**Scenarios, all passing** (`tests/emr-db/pharmacy-repeats.test.ts`, PGlite, run with `SKIP_ENV_VALIDATION=1` in a worktree without `.env.local`):

- S10: unsigned refusal; authorised once under the rule version; out-of-range refused;
- S11: the controlled backstop;
- S12: stop, first stop stands, a nurse is refused;
- S13: a cancelled line ends its repeats;
- S14: list, answer once, Decline needs the signed list, Renew links the new prescription.

`tests/pharmacy/network/writers.test.ts` enumerates the writers: only `lib/emr/write/repeats.ts` writes authorisations, their events and renewal answers. No Phase 4 module writes a prescription.

**Known limits:**

- Renew needs the source line's visit to be open; a closed visit shows "Open a visit for this patient to renew".
- The Phase 4 packs are not yet on the Packs signing page (Step 5 adds them).

**Checks:**

- typecheck clean;
- lint clean (0 errors);
- unit suite: every remaining failure is the worktree's missing env (baseline);
- prescriber lane 12/12 and repeats lane 7/7.

## STOP 5: refills at the hospital (dark)

Behind `PHARMACY_REFILLS` (per hospital; needs `PHARMACY_REPEATS` and `pharmacyDispensing`; off in production while `PHARMACY_NETWORK_COPY` is draft). Nothing applied, no flag on. 0231 is still unapplied; its Law 3 pair check now also accepts a supply handed over from the point's prepared place.

| Where                                                                                     | What                                                                                                                |
| ----------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| `lib/pharmacy/refill-store.ts`                                                            | request (app, window, phone), ask the clinic, save a collector, set aside, release, hold longer, hand over          |
| `lib/pharmacy/refill-read.ts`                                                             | the six-tab board and the patient's repeat medicines                                                                |
| `app/pharmacy/refill-actions.ts`, `app/pharmacy/refills/`                                 | the Refills page: tabs with counts, one action per row (Set aside; Hand over, Release, Hold longer; Ask the clinic) |
| `app/patient/track/medications/` (`refill-actions.ts`, `_components/patient-refills.tsx`) | "Repeat medicines": each in one sentence; Ask for my next supply, or Ask my clinic to renew it                      |
| `lib/pharmacy/stores/write.ts`                                                            | movement pairs `set_aside` and `release`                                                                            |
| Packs page                                                                                | the five Phase 4 packs, written as JSON, signed as Phase 2's are                                                    |

**Decisions taken (CSO, D-PH4-29):**

- Hand over writes Phase 1's rows (hand-over, supplies, `supplied` movements) out of the prepared place, and the refill instance's `supplied` event. The Phase 1 line machine is not moved (it would refuse `already_supplied`).
- Phase 3 blocks: a reaction report naming the medicine with no causality yet → `suspected_reaction`; the line's latest AMS answer `change` or `stop` → `stewardship_review`.
- An early ask is listed under "Needs the clinic" with the date it becomes possible; no renewal is made (`prl_route` forbids one). The pharmacist can still Ask the clinic.
- "Late" (the patient may have run out) is the caution StatusWord with its glyph; "Early" and "Held until" are square Tags.
- Hold rules and decline reasons take two signers (or the CSO alone) on the Packs page, where Appendix D names one: stricter, never looser.
- A collector the patient names is saved (the request needs the row); there is no "don't save" choice yet.

**Scenarios, all passing** (`tests/emr-db/pharmacy-refills.test.ts`, 10/10): S15–S24, including the unsigned hold refusal, FEFO set-aside, hand-over by typed check and by another way, release, hold longer to the signed maximum, not collected, early and late labels, RP-6 order ("none left" before "too early"), and the Phase 3 blocks.

**Taps** (first value already chosen): patient ask 2 (open, send); set aside 2 plus the quantity; hand over 2 plus the typed identifier; release 2; hold longer 2 plus the date.

**Known limits:**

- One medicine per patient request from the app (the store takes up to 20; the dialog sends one).
- Withdrawing a request is not built.
- Releasing a held batch that has since been recalled may be refused by the stock guard; the quarantine path (`recallLegs`) is not wired to the prepared place.
- "Record a request" (window or phone): the server action `requestRefillAtWindow` is built and tested (S15); the board has no dialog for it yet (it needs a patient and line picker).
- Partner routing (the Partner tab) waits for Step 6, which needs the DPO or legal adviser.

**Checks:** typecheck clean; lint clean; pharmacy unit tests 886/886; PGlite lanes refills 10/10, repeats 7/7, stores-supply 23/23, network-data 8/8, supply 22/22. The remaining unit failures (patient-web care/help: the mobile tsconfig) are the worktree's baseline.
