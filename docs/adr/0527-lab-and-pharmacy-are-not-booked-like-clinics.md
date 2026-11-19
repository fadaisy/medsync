# ADR 0527: The laboratory and the pharmacy are not booked like clinics

**Status:** Accepted, 18 Nov 2026, on the owner's word in chat ("okay, build, feel free to add whatever you think
can help") after the discussion of lab and pharmacy bookings. Wording is a draft.

Builds on [ADR 0526](0526-booking-rules-set-once-on-the-clinic.md).

## Context

Departments gave every department the clinic booking rules (days, hours, slot length, confirm straight away,
virtual visits). For the laboratory and the pharmacy those questions mean nothing: a person comes for tests or for
medicines, and what the visit costs is the total of those items, not a department fee.

## Decision

- `bookedAs(department, hasClinics)` (`app/hospital-admin/departments/_lib/model.ts`) decides how a department is
  reached: `clinic` (a clinical department, or any department that really runs a clinic), `tests` (the laboratory),
  `medicines` (the pharmacy) or `none` (the other support and office departments).
- Only `clinic` shows the Booking rules tab. `tests` and `medicines` show "Prices and hours", which says where
  each thing is set and links there. `none` has no such tab.
- A laboratory test's price is the hospital's own, per test, append-only from a date, and never UGX 0 (a price is
  above zero or the test is free), the same law as pharmacy prices (migration 0257). A lab visit costs the total
  of its tests. Migration 0305 (GATED) holds it; `LAB_TEST_PRICES` gates every screen that shows it.
- The patient website shows a person the price of each test they are waiting for and the total, and the price of
  their medicines, always with "you pay at the hospital". Nothing is charged here (ADR 0523 owns real money).

## What is built

- **Departments:** the tab rule above.
- **Laboratory and imaging (admin):** a Price section on each test (price above zero or free, from a day, today or
  later), the price on each row of the test list and "n of m tests have a price". Saved by `saveTestPriceAction`
  (the hospital admin or the laboratory lead, the same check as the test menu), into `lab_test_prices`.
- **Patient website, Lab tests:** "What your tests cost" for the tests the page already lists as not ready: the
  price of each, the total, a line when the clinician ordered it fasting, the laboratory's own stated turnaround,
  and a line when the laboratory has reported the test unavailable. A restricted or sensitive test is never named
  or priced.
- **Patient website, Medicines:** "What your medicines cost" for the medicines the pharmacy's own list already
  shows as given: the units given times the unit price the pharmacy recorded at hand-over (never today's price
  list), and the total. The quantity is used for the sum only and is never shown (S15).
- **Week plan:** each clinic's sessions carry its assigned colour as a tinted fill and a full border (no edge bar);
  the words stay in ink and the clinic is named in the row header.

## Switching it on (owner)

1. Apply migration 0305: `cd <this worktree> && npm run db:migrate`.
2. `LAB_TEST_PRICES=1` (or hospital ids): the admin and the laboratory lead can set prices. Off, the test menu is
   exactly what it was and the table is never read.
3. `PATIENT_PRICES=1` (or hospital ids): patients see costs. In production it stays off until the wording in
   `content/patient-prices.ts` is signed.

## Consequences

- No stored department rule is deleted: a laboratory or pharmacy row in `department_scheduling_policy` stays, it
  is just no longer shown or asked for.
- The PGlite lane (`npm run test:emr-db`: schema parity, RLS probes) was not run for 0305 on the build machine.
- Still open: booking a collection time by test; packages priced as one; a price before the pharmacy hands over
  (the product is only chosen at supply); "ready to collect" for the patient (the pharmacy's patient list and its
  signed wording, plus a new message kind and a GATED migration for SMS); lab and medicine lines on a bill
  (`bill_items.kind` does not allow them); the phone app.
