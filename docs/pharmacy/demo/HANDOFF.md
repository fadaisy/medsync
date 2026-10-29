# Pharmacy demo: handoff

Built 26 Oct 2026 on `feat/pharmacy-demo` (worktree `~/Desktop/medsync-pharmdemo`), not committed. ADR 0450.

## To turn it on (owner)

1. Apply migration 0250 from this worktree:
   ```bash
   cd ~/Desktop/medsync-pharmdemo && npm run db:migrate
   ```
2. The hospital must be marked as a demo hospital (a superadmin's row in `lab_demo_hospitals`; a hospital already
   marked for the lab demo counts).
3. List that hospital's id in the pharmacy flags the test turns on: `PHARMACY_WORKSPACE`, `PHARMACY_DISPENSING`,
   `PHARMACY_STOCK_ANSWER`, `PHARMACY_PATIENT_LIST`, `PHARMACY_DOWNTIME`, `PHARMACY_STORE`, `PHARMACY_WARD_STOCK`,
   `PHARMACY_CARTS`, `PHARMACY_RECALL`, `PHARMACY_MONTH_END`, `PHARMACY_ORDERING`, `PHARMACY_INTERACTIONS`,
   `PHARMACY_INTERVENTION_REVIEW`, `PHARMACY_STEWARDSHIP`, `PHARMACY_REACTIONS`, `PHARMACY_RECONCILIATION`,
   `PHARMACY_REPEATS`, `PHARMACY_REFILLS`. `PHARMACY_DEV_HOSPITALS` must give it permission map v2: in Vercel it is
   already `1` (every hospital), so nothing to add. Phase 3 and 4
   pages also need their own migrations (0212, 0230–0232) applied.
4. Deploy, then as that hospital's admin open Departments › Pharmacy › Units (or Pharmacy settings) › "Load the
   pharmacy demo" and press the button. The link shows before the pharmacy has any units; the address is
   `/hospital-admin/departments/pharmacy/demo`.
5. To walk the pages, your own pharmacist account needs an affiliation in the hospital's PHARMACY department (or a
   point under it). Demo staff can't sign in.

## What a load does

One press writes, through the real stores: 8 points, 31 demo staff, 60 demo patients, 69 products, 241 prescription
lines and 78 hand-overs, 30 queries, the controlled register, downtime forms, 7 resus episodes, three stores with
deliveries, orders and issues, 6 wards and 3 carts, a recall, a closed month at quarantine, 14 clinical content entries,
stewardship, 6 reaction reports, 5 reconciliations, refills on every tab and the going-live records. Every dose reads
`[demo dose]`; legal answers are never filled in. It loads once per hospital (a load that stopped at setup, or one removed, does not count).

The whole load takes 23 s on PGlite. Over the network to Supabase it will be slower; the page allows 300 s. If a load
stops, the Loads list says at which section.

## Removing the demo (migration 0260, 28 Oct 2026)

"Remove the demo data" on the same page opens a centred dialog with counts from a dry run, then calls
`pharmacy_demo_remove` (GATED; apply with `npm run db:migrate` from the branch that holds it). In one transaction, demo
hospitals only: the demo patients and staff (`pharmacy-demo-…@demo.medsync.invalid`), every row naming one of them,
every row hanging off those rows that names nobody else, then the departments, wards and carts the demo made, each kept
when anything real still uses it. A real record pointing at demo data stops it all and nothing is removed. Kept: the
audit log and the demo accounts it names as actors (banned, never sign in), the settings and cosign policy the demo set,
and the loads (marked removed). A real pack the demo retired stays retired. Since 0261 a row naming any real user other than the admin who pressed Load is never demo data, even when the demo touched it (a real content entry the demo replaced stays, withdrawn, with its real signatures). Test:
`tests/emr-db/pharmacy-demo-remove.test.ts`.

## Known gaps

- **A real pharmacy head** stays in place: the demo chief pharmacist takes the acting slot (Test Hospital-1, 27 Oct).

- **Look-back tab** stays empty: it fills only from supply without review, which needs a legal answer.
- **Order proposal** shows zero consumption: no supplies are dated last month.
- **Month end** is closed at quarantine only: the points have movements after the month-end count.

## Clinical page fixes (found by the demo)

Four Clinical pages failed for a pharmacist because they read as the clinical reader, whose rules on the shared
record tables never let pharmacy staff in. Each now reads behind the pharmacy scope on the app connection, as the
review queue does, scoped to the hospital:

- Interventions: ward names read after the reader's transaction (prod crash, ERROR 2066673844).
- Stewardship: showed no courses (`accessible_patient_ids()` gives a pharmacist no ward patient).
- Reaction detail: refused on the profile's name columns.
- Reconciliation list and detail: refused on `admissions` (live once 0212 is applied).

No migration. The same fixes sit on their own on `fix/pharmacy-interventions-read` in `~/Desktop/medsync-network`
(uncommitted) so they can ship before the demo.

## Tests

```bash
cd ~/Desktop/medsync-pharmdemo && SKIP_ENV_VALIDATION=1 EMR_PGLITE=1 npx vitest run --no-file-parallelism tests/emr-db/pharmacy-demo
```
