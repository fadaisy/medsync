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
