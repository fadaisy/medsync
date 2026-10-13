# Pharmacy Phase 1 — final report

Prompt: [PROMPT-PHARMACY-PHASE-1.md](PROMPT-PHARMACY-PHASE-1.md). Branch `feat/pharmacy-dispensing` (worktree
`~/Desktop/medsync-pharm1`), local, not pushed. Steps 0 to 9 built, 12 Oct 2026. Step-by-step detail:
[STOP-REPORTS.md](STOP-REPORTS.md). User guide: [user-guide.md](user-guide.md). Hazard log: [hazard-log.md](hazard-log.md).

## Where it stands

- **Built:**
  - review lanes and recorded outcomes;
  - queries to the prescriber;
  - the stock ledger;
  - hand-over with two identifiers;
  - controlled drugs with an authenticated witness;
  - downtime back-entry and the dispensing log;
  - going live per point;
  - the prescriber's stock line, the nurse's chip, the patient's list and messages.
- **Switched off:**
  - every Phase 1 surface sits behind one of four per-hospital flags (`PHARMACY_DISPENSING`,
    `PHARMACY_STOCK_ANSWER`, `PHARMACY_PATIENT_LIST`, `PHARMACY_DOWNTIME`);
  - in production all four stay off while the Phase 1 wording is draft;
  - a point dispenses only once it is switched on by two hospital admins with six conditions met.
- **Nothing applied:** migrations 0122–0135 (14) are GATED and not applied. Production behaviour is unchanged.
- **ADRs:** 0260–0279, all written.
- **Checks on the final tree:**
  - `npm run typecheck` (app and Edge): exit 0.
  - ESLint: clean.
  - `vitest run`: 9,542 passed, plus 1 expected fail that is now flipped.
  - PGlite lanes (`tests/emr-db`, `tests/ncdreg-db`): 1,213 passed.
  - `next build`: passes; all 18 pharmacy routes and the 2 going-live pages build.
  - axe: 0 serious or critical findings on 15 routes; one moderate "region" finding on the phone-width queue.

## Section 13 — the numbers

The baseline is the Phase 0 state. "In tests" means proved on the PGlite lane or in unit tests. Production figures
do not exist yet: nothing is applied or live.

| Metric                                                                               | Target                      | Result                                                                                                                                                                                               |
| ------------------------------------------------------------------------------------ | --------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Lines that left the queue without an outcome event                                   | 0                           | **0 in tests.** The queue is derived from line events (LO-3); LO-9 property tests (3 × 2,000 sequences) find no line without one stage or outcome                                                    |
| Open outcomes closed by anything but a person's or a prescriber's action             | 0                           | **0.** LO-5: a 30-day clock leaves every fixture unchanged; no derivation reads a clock                                                                                                              |
| Line moves outside LO-4's table                                                      | 0                           | **0.** Exhaustive test, 13 statuses × 31 moves                                                                                                                                                       |
| Lines supplied twice, or on a version the prescriber changed                         | 0                           | **0 in tests** (S43, S44, sequential). The two-connection race test is written and **not yet run** (owner, dev database)                                                                             |
| Supplied lines without a product, batch and expiry                                   | 0                           | **0 by construction.** NOT NULL columns; the batch carries its expiry                                                                                                                                |
| Supplies without a movement, or "supplied" movements without a supply                | 0                           | **0 by the database.** Deferred constraint triggers at commit (0126), proven both ways                                                                                                               |
| Projected balances that differ from their ledger                                     | 0                           | **0.** No stored balance; SL-10 property test, 60 seeds × 150 operations                                                                                                                             |
| Batches below zero with no downtime entry behind them                                | 0                           | **0 by the database.** The guard refuses a live movement below zero (0124)                                                                                                                           |
| Live hand-overs with neither two identifiers nor a recorded "identified another way" | 0                           | **0 by the database.** CHECK `ph_identity` (0126); S36                                                                                                                                               |
| Hand-overs recorded as "identified another way"                                      | report                      | No production data. Listed and counted on Supplied today (S36)                                                                                                                                       |
| Pharmacy responses that carry a stored date of birth or phone number                 | 0                           | **0 in tests** (S36 walks every response). The reader role never selects them                                                                                                                        |
| Expired batches supplied live                                                        | 0                           | **0 by the database** (0124 guard; month-only expiry to month end)                                                                                                                                   |
| Prescription rows written by a pharmacy action                                       | 0                           | **0.** Law 2 static scan over `lib/pharmacy`; S34 finds no `prescriptions` audit row from pharmacy actors. The prescriber's own cancel lives in `lib/emr`                                            |
| Directions shown or printed differently from how they are stored                     | 0                           | **0 in tests.** Byte-equality on screen, label and slip with awkward strings                                                                                                                         |
| Live pharmacist-first supplies with neither an acceptance nor a D-PH1-05 reason      | 0                           | **0 in tests** (S13, S54); SU-2 under the line lock                                                                                                                                                  |
| Supplies on the look-back list with no look-back after 7 days                        | report                      | No production data                                                                                                                                                                                   |
| Controlled supplies without a committed count, both attestations and a witness       | 0                           | **0 by the database.** CHECK `pce_supply` and the witness guard (0127); S57                                                                                                                          |
| Screens that say or imply MedSync replaces the statutory paper                       | 0                           | **0.** Law 9 wording scans; the register slip's heading                                                                                                                                              |
| Screens that say or imply the prescriber knows before an answer                      | 0                           | **0.** "Query sent · not answered"; S20                                                                                                                                                              |
| Screens, prints or audit lines that call a technician a pharmacist                   | 0                           | **0.** `tests/pharmacy/ui.test.ts` scans every content file; audit lines carry the cadre's own name                                                                                                  |
| Stock quantities readable on the prescriber's side                                   | 0                           | **0.** AV-6: a type that cannot hold a number and a deep walk; RLS gives prescribers no stock table; a static scan of the prescriber's reads                                                         |
| Clinical numbers, medicine lists or prices in code, seeds or copy                    | 0                           | **0.** Reason lists are drafted for signature and act only outside production; fixtures are invented                                                                                                 |
| Unsigned content that acted                                                          | 0                           | **0 in production by design.** Draft content acts at the test hospital only (the CS-5 production gate)                                                                                               |
| Templates failing the banned-term scan                                               | 0                           | **0** (S93); fixture templates naming a medicine, a clinic or a point fail                                                                                                                           |
| Interactions for a standard three-line hand-over                                     | ≤ 8 (+1 per typed quantity) | **Not measured.** Needs the timed trial with pharmacy staff                                                                                                                                          |
| `recordHandover` p95                                                                 | < 500 ms                    | **PGlite in-process:** 23–72 ms p95 over 22 calls; 39 ms for S35 warm. Production Postgres not measured                                                                                              |
| Query → visible to the prescriber, p95                                               | ≤ 5 s / ≤ 15 s              | **Not measured.** Realtime on `user:<id>` with 15 s polling is built; the timing needs two browsers on a real database                                                                               |
| Back-entry of one sheet row, median                                                  | ≤ 30 s                      | **Not measured.** Needs the timed trial                                                                                                                                                              |
| Rows on the printed dispensing log against supply events                             | equal                       | **Equal** (DL-3, S78)                                                                                                                                                                                |
| Hazards without a control and a test                                                 | 0                           | **3 open** (19 typed quantity, 41 interactions, 49 the doctor's print lists stopped lines); **20 partly closed**; 36 closed by test                                                                  |
| Rule IDs without a test                                                              | 0                           | **0.** 124 of 124 named in a test                                                                                                                                                                    |
| RLS probes passed                                                                    | 100 %                       | **100 %.** Every one of the 42 new tables × every actor (`pharmacy-dispensing-data.test.ts`)                                                                                                         |
| axe serious or critical                                                              | 0                           | **0** on 15 routes (pharmacist and hospital admin); the doctor's and patient's new blocks were not axe-run                                                                                           |
| Red on routes added by this slice                                                    | 0                           | **0.** `tests/design/red-reserved.test.ts` over every new content file and route                                                                                                                     |
| Phase 0 and lab tests changed or failing                                             | none                        | **Failing: none.** Changed, with reasons: Phase 0's nav-registry test (flags off still two items), Law 2 scan (recursive, the law itself), the server-action allow-list. **Lab tests: none changed** |

## What is not done, or is weaker than specified

1. **Timed trials** (hand-over interactions, back-entry, query latency) need pharmacy staff and two browsers on a
   real database.
2. **The two-connection race test** (`tests/rls/pharmacy-races.test.ts`) is written and skips until the owner runs
   it against the dev database.
3. **The witness check** is proven with an injected verifier. A real password and authenticator check against
   Supabase Auth has not been run. The check runs inside the write's transaction, which a slow sign-in would hold
   open (marked `ponytail:`).
4. **Template approval:** pharmacy SMS templates have no approval screen. The NCD screens now show only NCD
   templates. Live SMS therefore cannot send until a page exists, and is off by default anyway.
5. **Signing in the app:** there is no in-app page to sign Phase 1 content sets. The owner or a script signs them,
   with two signers or a written exception.
6. **Strength changes:** none are possible until a strength mapping is signed (W4). S48's pharmacist half
   therefore stays refused.
7. **HZ-48:** individual inpatient supply cannot be switched on until stopping an admission medicine stops its
   prescription. Ward lines can still be reviewed.
8. **The doctor's print** still lists stopped and completed lines (HZ-49, R17). This slice does not change printing.
9. **Smaller items:**
   - Patient search at back-entry is by MedSync number only.
   - Pharmacist's initials on a sheet are not stored.
   - Look-back offers "Looked at" but not "Send a query".
   - The doctor-workspace lane badge is not built.
   - "Find a prescription" searches 30 days.

## For the owner

1. **Apply migrations 0122 → 0135 in order** (`npm run db:migrate`). Nothing reads them while the flags are off.
2. **Legal questions 1–6:** interim written answers. No production point can go live without them; D-PH1-03, 05,
   13, 17, 26 and 28 stay provisional.
3. **Sign the clinical packs and the hazard log as the CSO.** By the owner's decision of 13 Oct 2026 a pharmacist's
   co-signature is not required for now (`PHARMACIST_COSIGN.required` is false); it is to be reimplemented later.
4. **Sign the Phase 1 wording:** 1,134 draft strings in 116 blocks, through the sign-off portal
   (https://claude.ai/artifact/TqufiL5JPsi4ERGhk32yM4). The flags stay off in production until then.
5. **The national medicines list (EMHSLU)** as CSV, for the import dry run.
6. **Owner SQL A–D:** returned on 13 Oct 2026. Production has no prescriptions yet, so the lane counts are deferred
   until it does, and are checked before any point goes live.
7. **Optional:** run the race test against the dev database (`MEDSYNC_ALLOW_RLS_DB_WRITES=1`, a dev `DATABASE_URL`).
8. **Push and merge** when ready. Three merges are planned: Steps 0–6, 7–8, then 9 (ADR 0277). Each leaves
   production unchanged while the flags are off.
