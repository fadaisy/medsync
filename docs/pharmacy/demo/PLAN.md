# Pharmacy demo: a national referral hospital's pharmacy in one press

Owner request, 26 Oct 2026: demo data for the whole pharmacy workspace, every page, at national referral scale,
inserted by one button. Owner answers (26 Oct):

- **Hospital:** an existing test hospital, marked as a demo hospital (a superadmin's row in `lab_demo_hospitals`,
  reused: a hospital marked as a demo sandbox is one for every workspace). Never a hospital that treats patients.
- **One button inserts everything,** including the packs and clinical content the pages need: demo staff ("Demo chief
  pharmacist", "Demo CSO", …, banned accounts with `.invalid` addresses) sign them through the normal signing rules,
  in a demo hospital only. The owner's 18 Oct lab ruling, extended to the pharmacy.
- **Doses:** real medicine names from the general formulary; every dose, frequency and direction reads `[demo dose]`.
- **Size:** a national referral day: 8 dispensing points, bulk and main stores, ward carts, about 60 patients and 250
  prescription lines over every stage, a month of stock history.

Not done by the demo: legal answers (never faked, ADR 0394 stands; `PHARMACY_DEV_HOSPITALS` gives the demo hospital
map v2), flags (the owner lists the hospital in each pharmacy flag), and no real person's rights change.

## Numbers

Migrations 0250–0254, ADRs 0450–0454 (claimed in docs/NUMBERS.md).

## Shape

- `supabase/migrations/0250_pharmacy_demo.sql`: `pharmacy_demo_loads`, `pharmacy_demo_patients` (FK to
  `lab_demo_hospitals`, so a real hospital can never receive demo rows).
- `lib/pharmacy/demo/`: `index.ts` (orchestrator: state, people, one transaction per section, failures recorded on the
  load and the rest carry on) and one file per section. Setup rows are owner inserts; workflow goes through the real
  stores (`runPharmacyWrite` with a demo actor) so every state is one the app can reach.
- Button: `/hospital-admin/departments/pharmacy/demo`, linked from the pharmacy settings page only in a demo hospital.
- Tests: `tests/emr-db/pharmacy-demo.test.ts` runs the whole load (23 s on PGlite, no section stopping);
  `pharmacy-demo-<section>.test.ts` read each page back through its own loader.

## Sections (status)

| #   | Section                                                                                                           | Pages it fills                                                         | Status                                                                                                   |
| --- | ----------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| 1   | Setup: PHARMACY department, 8 points, wards, clinics, demo staff, patients, encounters, settings                  | all                                                                    | Done (`setup.ts`)                                                                                        |
| 2   | Signed packs and clinical content                                                                                 | queue lanes, stewardship, refills, month-end, content                  | Done, inside each section (`signSet`, `signEntry`)                                                       |
| 3   | Catalogue and stock: products, batches, opening counts, a month of movements, reorder levels, stockouts           | stock, stock detail                                                    | Done (`stock.ts`): 69 products, 304 batches, one stock-out                                               |
| 4   | Dispensing day: prescriptions at every stage, queries, open lines, handovers, supplies, labels, slips, look-backs | queue, prescription, handover, open lines, supplied, log, labels, slip | Done (`dispensing.ts`): 241 lines, 78 hand-overs, 30 queries. Look-back tab empty (needs a legal answer) |
| 5   | Controlled register                                                                                               | controlled, register entry                                             | Done (`controlled.ts`): 95 counts, 10 supplies, one open and one closed difference                       |
| 6   | Downtime: form numbers, a period, a drill, paper prescriptions                                                    | downtime pages                                                         | Done (`controlled.ts`): 30 sheets, 2 periods, a drill                                                    |
| 7   | Emergency doses (resus)                                                                                           | emergency doses                                                        | Done (`controlled.ts`): 7 episodes, 22 drug events                                                       |
| 8   | Stores: locations, counterparties, deliveries, orders, requisitions, issues, loans                                | store places, deliveries, issues, orders                               | Done (`stores.ts`). Order proposal shows zero consumption (no supplies dated last month)                 |
| 9   | Wards and carts: ward levels, cart lists, cart checks                                                             | store wards, carts                                                     | Done (`wards.ts`): 6 wards, 3 carts, 5 checks                                                            |
| 10  | Expiry, write-offs, a recall                                                                                      | store expiry, recalls                                                  | Done (`wards.ts`): a write-off and a recall with its trace                                               |
| 11  | Month-end: a closed period with snapshots                                                                         | store month-end                                                        | Done (`wards.ts`), closed at quarantine only (points have later movements)                               |
| 12  | Clinical: interventions, stewardship, reactions, reconciliation                                                   | clinical pages                                                         | Done (`clinical.ts`); its three reader bugs fixed (HANDOFF.md)                                           |
| 13  | Network: repeats, refills on every tab, renewals, collectors                                                      | refills, doctor renewals, patient medicines                            | Done (`network.ts`): refills on every tab but partner, renewals, the patient's list                      |
| 14  | Go-live record: briefings, drill (no legal answers)                                                               | hospital-admin pharmacy                                                | Done (`network.ts`): legal answers stay missing, so no point reads ready                                 |
