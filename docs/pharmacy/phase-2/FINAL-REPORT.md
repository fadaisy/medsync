# Pharmacy Phase 2: final report (stores, wards and supply)

**Branch:** `feat/pharmacy-stores` (worktree `~/Desktop/medsync-pharmclose`), 21 Oct 2026. GATE A was signed by Fadhul (CSO) the same day (`gate-a-proposal.md`).

**Migrations** (GATED, none applied), in this order:
1. `0180_pharmacy_locations_ledger.sql`
2. `0181_pharmacy_stores_records.sql`
3. `0182_pharmacy_store_closures.sql`
4. `0184_pharmacy_order_comparisons.sql`

0183 was released unused.

**ADRs** 0370–0380. **Handbook:** `user-guide.md`.

## STOP reports in brief

| Step | What was built | Proof |
|---|---|---|
| 0 | Discovery. P1–P14 verified (Q1–Q4, Q7, Q9); Q5, Q6 and Q8 are owner inputs, still missing | `gate-a-proposal.md` |
| 1 | GATE A: D-PH2-01 to 24, map v3, all signed | same file, Signatures |
| 2 | Locations, ledger kinds and pairs, the SL-14 guard, every record table, RLS for ward and cart people, map v3 | `tests/emr-db/pharmacy-stores-data.test.ts` (115): S1, S2 every table × every actor, S3 incl. the service role |
| 3 | 13 pure engines (LC, SL, RG, IS, CN, OQ, MR, WS, EC, EX, RC, SC, GL2) | `tests/pharmacy/stores/*` (129): S4–S10 |
| 4 | Deliveries, HMIS 087 and the GRN, issues and requisitions, returns, loans, places and suppliers, store counts, per-place go-live with a second admin, Phase 1 one-leg closure | `pharmacy-stores-store` lane (12), unit (48): S11–S17b, S44, S45 |
| 5–6 | Ward stock (pharmacy and nurse), blind ward counts, ward levels and cart lists signed in the app, cart checks, overdue carts | `pharmacy-stores-wards` lane (13), unit (14): S18–S27 |
| 7–9 | Expiry, quarantine, write-off, recall (two lists), month end with snapshots, orders, Appendix D packs signed in the app | `pharmacy-stores-supply` lane (23), unit (15): S28–S43, S47 |
| 10 | Scanning, go-live per place, axe, guards, handbook, ADRs | below |

**Whole-repo checks:**
- typecheck and lint are clean;
- the unit suite: 11,156 passed;
- the PGlite lanes: 1,740 passed (2 skipped);
- `next build` passes;
- axe over the 10 new routes at 1440 and 390, light and dark (40 jobs): 0 serious or critical.
  - The first run found invalid paragraph nesting, which caused hydration errors: header sublines, and the shared notice body (`CautionNotice`, now a `div`). It also found table scroll areas not reachable by keyboard (now `tabIndex=0`).
  - The harness has no stock data for the new places, so the screens were seen in their empty states only.

## Section 13 numbers

| Metric | Result |
|---|---|
| Paper tally for the monthly stock status report | 0 once the tracer list and HMIS 105 map are signed. Until then the report says what is missing |
| Locations live by kind | None: no migration applied, and no place switched on |
| Movements with one leg | 0 (deferred trigger; S4 property; lane test) |
| Balances differing from their ledger | 0: no balance is stored (Law 2) |
| Issues of expired, quarantined or recalled batches | 0: refused by the database guard (S28, S33b, lane SL-14 tests) |
| Rows changed in a closed period | 0: snapshots append-only; late rows attributed forward (S9, S36) |
| Stock figures computed from doses | 0 (S7, S22, S24 tests) |
| Receipt of a 20-line delivery, minutes | Not measured. Needs the pilot site's paper baseline (Q8) |
| Order lines differing from the paper calculation, explained | Not run. Needs the in-charge's real cycle (Q8, STOP 9) |
| Recall trace time | Not timed on real volume. The trace is one ledger read per batch |
| Recall list 2 patients missed against a hand count | 0 on the fixture (S30) |
| axe serious or critical | **0** on all 40 jobs: 10 routes at 1440 and 390, light and dark, empty-data harness with all six flags on |
| Red added | 0. Nothing green on a workflow state |

## Decisions made while building (for the CSO to see)

1. **EC-3 over LC-3:** a cart issues out only to another cart ("moved to another cart"). Otherwise LC-3 holds.
2. **Recall messages:** when a message cannot go, nothing is recorded for the patient. They stay on the printed list until a person records how they were reached (RC-5). "Could not reach" is never inferred.
3. **"No emergency order point"** is a box the signer ticks. An empty field never means it (Law 6).
4. **A store's opening count** writes `adjusted` movements before go-live. This is the same set-up exception Phase 1 points have. **To confirm.**
5. **Count freshness for wards** is the strictest point's setting until a per-ward value is signed (marked `ponytail:`).
6. **Signed packs** are visible only with a Phase 2 flag on, so with all six off the rail is Phase 1's exactly (Law 14).
7. **Permission map v3** adds only `pharmacy.store`, and only where `PHARMACY_STORE` is on. Phase 1's maps are untouched. Two Phase 1 tests were changed for the signed amendment: the SQL mirror test now compares with v3, and PA-1 now expects seven names.

## Not done, or weaker than specified

- **Owner inputs missing (Q5, Q6, Q8):**
  - the national layouts (HMIS 085, 084B, 087, 088, 105 Section 6) and EMHS Chapters 8, 18 and 19;
  - the pilot site's practice;
  - the paper baselines.

  Every print says *"Columns not yet confirmed …"*. The timed receipt, the order comparison and the full test month are therefore not reported.
- **Signers:** no pharmacist reviewer or pilot in-charge exists yet. The CSO signs alone by exception (D-PH2-22), and they co-sign before a real hospital goes live.
- **Reason lists:** some (not-issued, refusals, receipt differences) are free text until the signed `stores_reason_lists` pack is wired into those actions. The "cannot complete while unsigned" rule is not yet enforced there.
- **Controlled stock outside the dispensary:**
  - the witness is recorded on every movement, but no Phase 1 controlled-register row is written at a store (those tables need a point);
  - controlled restock in a cart check, and controlled ward returns, are refused and pointed to Issues.
- **Not built:**
  - IS-4 overdue confirmations (they need the signed confirmation window);
  - `withdrawRequisition`;
  - grouping order lines across products by medicine is done by the caller only.
- **Recall list 4 from carts:** it matches the resus desk's drug id against catalogue ids. Emergency-drug ids may differ.
- **No app channel for recall contact:** Phase 1 never built push. Phone and guardian phone only.
- **Phase 1 pack kinds on the signing page:** only `message_name`, `witness_list` and the coded lists that have a reader. `lane_rule`, `high_risk_list`, `controlled_classes`, `availability_mapping` and the other reader-less lists still need a script.
- **Budgets:** the timing budgets (p95 render, order and recall times) are not measured on real volume.

## For the owner

1. **Apply the migrations** from this worktree:

   ```bash
   cd ~/Desktop/medsync-pharmclose && npm run db:migrate
   ```

   That applies 0180 → 0181 → 0182 → 0184.
2. **Turn on the six flags** per hospital as needed: `PHARMACY_STORE`, `PHARMACY_WARD_STOCK`, `PHARMACY_CARTS`, `PHARMACY_RECALL`, `PHARMACY_MONTH_END` and `PHARMACY_ORDERING`. In production they stay off until the Phase 2 wording (`PHARMACY_STORES_COPY` and the three lane copy files) is signed.
3. **Send me:** the HMIS layouts, the pilot site's answers to Q6, and the paper baselines (Q8).
4. **Sign in the app:** the packs at `/pharmacy/store/packs`, then each place's go-live under Hospital admin.
