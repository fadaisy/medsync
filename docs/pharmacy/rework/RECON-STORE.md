# RECON-STORE: STORE.md §G and §I → this repo (migration 0275, GATED)

Route: `/pharmacy/stock/store?tab=main&section=<key>` (the store page's tabs become Main store · Receive a delivery;
Medicines is its sibling page in the rail). Main store = the hospital's `pharmacy_locations` row of kind `store`.

## Tables (§G)

| Spec                  | Real                                                                                                                                                                                                                                                                            |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `stock_ledger`        | **reuse** `pharmacy_stock_movements` (balance = sum per batch; below-zero guard 0180). **add** `witness_id`                                                                                                                                                                     |
| `batches`             | **reuse** `pharmacy_batches`; bin = latest `pharmacy_batch_shelves` (0272); quarantine = a batch at the `quarantine` location                                                                                                                                                   |
| `requisitions`        | **reuse** `pharmacy_requisitions` + lines (states raised/part_issued/issued/confirmed/confirmed_with_difference); **add** `urgent`, `reason`. Issued/owed per line = the ledger                                                                                                 |
| `dispatches`          | **reuse** `pharmacy_issues` (append-only); **add** `voucher`, `dispatch_kind`, `witness_id`. Lines = its ledger legs. **create** location kind `transit`: store → transit at issue, transit → place on confirm (`pharmacy_issue_confirmations`, **add** `note`). Status derived |
| `place_levels`        | **reuse** `pharmacy_reorder_levels` (0270 `location_id`, `product_id`); use/month derived from the ledger                                                                                                                                                                       |
| `topup_runs` + log    | **create** `pharmacy_topup_runs` (place, `weekdays int[]`, `at time`), `pharmacy_topup_run_log` (run, `on`, issue)                                                                                                                                                              |
| `returns_to_store`    | **create** `pharmacy_store_returns` (proposed → accepted on an RTS pair)                                                                                                                                                                                                        |
| `orders` + lines      | **reuse** `pharmacy_orders`/`_order_lines` (draft → open = sent → closed; part = deliveries); **add** `supplier_id` (0274 `pharmacy_suppliers`), `sent_at/by`; trim = `cut`                                                                                                     |
| `shelves`, counts     | **create** `pharmacy_shelves`, `pharmacy_shelf_counts` (+`_lines`, blind: expected written at save), `pharmacy_stocktakes`; posting = `count_correction` legs                                                                                                                   |
| `quarantine`          | **create** `pharmacy_quarantine_decisions` (destroy needs witness ≠ decider; return = RTN)                                                                                                                                                                                      |
| `losses`              | **create** `pharmacy_store_losses` (ADJ, value, `case_id`)                                                                                                                                                                                                                      |
| `store_room_readings` | **create** `pharmacy_store_room_readings`. Cold room CR-01 = **reuse** `pharmacy_fridges` (store, `sensor_id`) + `pharmacy_fridge_readings`                                                                                                                                     |
| `place_balance_month` | **create** view over the ledger, per place × product × month (quantities); value in `placeBalance`                                                                                                                                                                              |
| `cases`               | **reuse** `pharmacy_cases` via `private.pharmacy_open_case`; **widen** `source_type` + `balance`, `receipt`, `loss`                                                                                                                                                             |
| vouchers              | **create** `pharmacy_voucher_seq` + `private.pharmacy_next_voucher(h, prefix)` (RIV TRF GRN RTS RTN ADJ CNT)                                                                                                                                                                    |
| live                  | broadcast `pharmacy-store:<hospital>` (as ward-beds 0090) on issues, confirmations, requisitions, fridge readings; 30 s poll fallback                                                                                                                                           |

Guards (0275): FEFO + quarantine + witness on `issued` legs from a voucher dispatch; arrival only after its
confirmation; cold-first on `pharmacy_batch_shelves`; count posting only when signed (`sign_over` stored per count);
stock-take close; trim never on V (`cut` on a V line); loss witness/case. Below zero: existing 0180 guard.

## Derivations (§H) → `lib/pharmacy/derive/store/{stock,places,requisitions,orders,expiry,counts,stats}.ts`

Reuse `planIssue` (FEFO engine, `lib/pharmacy/stores/issue.ts`), `fridgeState` (`derive/setup/places.ts`),
`ruleNumbers` (`lib/pharmacy/rules/registry.ts`). Charts geometry: `components/pharmacy/charts/geometry.ts`.

## Actions (§I) → `lib/pharmacy/actions/store/*.ts` + `app/pharmacy/stock/store/store-actions.ts` ("use server")

Pattern `runPharmacyWrite` (as `lib/pharmacy/actions/roster.ts`); idempotent on `clientKey` (= the row id); legs via
`movePair`/`batchAtLocation` (`lib/pharmacy/stores/write.ts`). Witness list: `witnessesOnDuty` (`lib/pharmacy/witness.ts`).
In-charge: `private.pharmacy_is_in_charge`. Place-side confirm: existing `confirmIssue` gains the transit arrival.

## Rules (§K) → new numbers in `content/pharmacy-rules.ts` groups `ord`, `ration`, `places`, `stock`, `inv`, `targets`

## Loader + UI

`lib/pharmacy/store/read.ts` → one `StoreWorld`; `components/pharmacy/store/{shell,send-out,places,bring-in,look-after,dialogs}`;
charts `components/pharmacy/charts/*`. Fixture `/styleguide/pharmacy-store` (404 in prod).

Old code to delete (step 9): `app/pharmacy/stock/store/_components/count-*`, `count-actions.ts`, `cold/` tab, the
store tabs issue/count/order/cold, `app/pharmacy/store/{issues,orders,wards,expiry}` bodies no longer linked.
Tests: no Playwright → Vitest + PGlite (`tests/emr-db/pharmacy-store*.test.ts`) + browser pane at 1440/390.
