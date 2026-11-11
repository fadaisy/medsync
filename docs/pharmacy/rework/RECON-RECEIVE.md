# RECON-RECEIVE: RECEIVE.md §I and the actions → this repo (migration 0276, GATED)

Route: `/pharmacy/stock/store?tab=receive[&delivery=<id>]` (this repo's Stock page; the spec's `/pharmacy/stock?tab=receive`
is the same tab). Port: `prototype/receive.dc.html`, function for function.

## Tables (§I)

| Spec               | Real                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| ------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `deliveries`       | **reuse** `pharmacy_deliveries` (`location_id` = place, `note_number`, `counted_by` = receiver, `deliverer_name`, `vehicle_registration`); **add** `kind`, `pharmacy_supplier_id`, `from_text`, `from_location_id`, `blind`, `invoice_no`, `invoice_total`, `grn`, `shelved_at`, `second_checker_id`. `supplier_id` (counterparty) becomes optional. `queued` is a state on the device only (IndexedDB): the server never holds it. `claim_id` is derived from the claim's `delivery_id` (unique).         |
| `delivery_lines`   | **reuse** `pharmacy_delivery_lines` (`reject_reason`, `batch_number`, `expiry`, `short_dated_decision`, `registration_*`, `identity_source` = source, `pack_contents` = per pack, `serials`); **add** `counted_packs`, `note_packs`, `cost_per_pack`, `expiry_text`, `temp_c`, `vvm_stage`, `freeze`, `approval_asked_at`, `approved_by`, `approved_at`, `rej_packs`, `rej_fate`, `witness_id`, `owed_frozen`. `accepted_quantity`, `rejected_*`, `unit_cost`, `note_quantity` are written at finish only. |
| `delivery_photos`  | **create** `pharmacy_delivery_photos` (storage path, never base64)                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| `put_away`         | **create** `pharmacy_delivery_put_away` (line, batch, shelf, qty, sent_qty, done_at/by, shelf_row_id). The shelving itself **reuses** `pharmacy_batch_shelves` and its cold-first guard (0275), so the Main store's Put away reads the same record.                                                                                                                                                                                                                                                        |
| `orders`           | **reuse** `pharmacy_orders`, `_order_lines`; **add** `chased_on`, `edited_on`; lines **add** `packs`, `per_pack`, `price_per_pack`, `received_packs`. `sent_on` = `sent_at`; `lead_days` = `pharmacy_suppliers.lead_days`; state sent/part = open + received. Guards widened to allow the edit, never below what arrived.                                                                                                                                                                                  |
| `supplier_claims`  | **create** `pharmacy_supplier_claims`, `pharmacy_claim_lines`; ref from `pharmacy_next_voucher(h,'CLM')`                                                                                                                                                                                                                                                                                                                                                                                                   |
| `recalls`          | **reuse** `pharmacy_recalls` (`batch_number`, `notice_ref`, `level` = why, `source`, open = no close)                                                                                                                                                                                                                                                                                                                                                                                                      |
| `pack_serials`     | **create** `pharmacy_pack_serials`, unique (hospital, gtin, serial); freed on abandon                                                                                                                                                                                                                                                                                                                                                                                                                      |
| `medicines`        | **reuse** `pharmacy_products` (`gtin`, `cold_chain`, `controlled_class`); **add** `vaccine`, `own_code`, `usual_shelf`. `reg_lapsed` = `registrationState` from the catalogue. Unknown GTIN links through `cat_pack_codes` where the catalogue is live, else `pharmacy_products.gtin`.                                                                                                                                                                                                                     |
| `quarantine`       | **reuse** `quarantineFor` + `move` (as STORE)                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| GRN, CLM, own code | **reuse** `pharmacy_next_voucher`; prefixes **add** `CLM`, `OWN`                                                                                                                                                                                                                                                                                                                                                                                                                                           |

DB guards (0276): `pd_note`-style unique per source and reference; `pharmacy_delivery_finish_guard` on state → received
(expired, recall, VVM 3–4, freeze, cold range, short-dated approval by an in-charge, controlled witness ≠ receiver, second
checker ≠ receiver over the limit); order line below received; claim credit needs a note, claims only on supplier deliveries.
Numbers come from `private.pharmacy_rule_n` (signed row, else the registry default passed in).

## Rules (§J) → `content/pharmacy-rules.ts`, new group `recv`, read through `ruleNumbers`

`look` 180 · `price_tol` 5 · `second_check` 2,000,000 · `inv_pct` 1 · `inv_ugx` 1,000 · `target_stock` 120 · `target_shelf` 60 ·
`target_matched` 95 · `temp_low` 2 · `temp_high` 8 · `cold_mins` 30. Lead days: `pharmacy_suppliers.lead_days`.

## Code

Pure (client and server): `lib/pharmacy/gs1.ts`, `barcode.ts`; `lib/pharmacy/derive/receive/*`. Loader:
`lib/pharmacy/receive/read.ts` → one `ReceiveWorld`. Offline: `lib/pharmacy/receive/offline.ts` (IndexedDB).
UI: `components/pharmacy/receive/*`. Copy: `content/pharmacy-receive.ts` (draft).

## Actions → `lib/pharmacy/actions/receive/*`, `app/pharmacy/stock/store/receive-actions.ts`

`startDelivery`, `editDelivery`; `scanPack` (claims the serial); `saveLines` (is `addLines`, `updateLine`, `removeLine`: whole
lines, idempotent on the line id, so a device can replay it); `linkGtin`; `approveShortDated` (+ `askApproval`);
`finishDelivery` (`applyCommit`), `abandonDelivery`; `putAway`, `undoPutAway`, `sendStraight` (**wrap** Main store's);
`assignInHouseCode`; `editOrder`, `markChased`; `sendClaim`, `creditClaim`; `uploadPhoto`; `confirmDispatch` = existing
`confirmIssue` (STORE §C3). Pattern: `act` + `runPharmacyWrite`.

Witness and second check **reuse** `useWitness` + `requireAttestation`: the second person confirms with their password and code.
Offline they cannot, so a queued delivery with a controlled line or over the limit comes back to Counting on reconnect
to be confirmed (default taken, HANDOFF).

Tests: this repo has no Playwright (as RECON-STORE): Vitest + PGlite (`tests/emr-db/pharmacy-receive*.test.ts`), a pure EAN-13
decoder test, `axe-core` in Vitest where it applies, and the browser pane at 1440/390.
