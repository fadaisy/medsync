# Pharmacy Phase 2: STOP 0 report and GATE A proposal

Branch `feat/pharmacy-stores` (worktree `~/Desktop/medsync-pharmclose`), cut from `origin/main` 016356c8. That commit has Phase 1 merged (all three merges) and Tide everywhere merged. Written 21 Oct 2026. Numbers claimed: migrations 0180–0204, ADRs 0370–0384.

## STOP 0

### Q1: Phase 1 is merged, all three merges. P1 to P9 checked against the repo

| # | Verdict | What the repo holds |
|---|---|---|
| P1 | True, with differences | `pharmacy_stock_movements` (0124) is append-only (`psm_append_only`).<br>Kinds: `received, supplied, reversed, adjusted, count_correction, transfer_out, transfer_in`.<br>**There is no `counted` or `batch_corrected` movement kind.** Counts live in `pharmacy_counts` and `pharmacy_count_lines`; corrections in `pharmacy_batch_corrections`.<br>**There is no pair id and no cost column.** A transfer pairs through `source_id`. |
| P2 | True | `pharmacy_batches` is unique on (point, product, batch number). Expiry is not in the key. `first_batch_number` and `first_expiry` are kept. |
| P3 | True | `pharmacy_dispensing_points` (0121, go-live columns in 0129). The switch needs two people in `pharmacy_golive` (`pg_second_person`). |
| P4 | True | `pharmacy_products` has `pack_size` **as text**, `issue_unit` (locked once moved), `registration_number` and `price_ugx`. Supplies snapshot the price. `pharmacy_product_points` lists products per point. |
| P5 | True | `pharmacy_reorder_levels` is append-only; `pharmacy_stockouts` is projected by trigger. |
| P6 | Partly | VEN class and level of care sit on `pharmacy_national_list_rows`, reached through `pharmacy_medicine_links`. |
| P7 | True | Transfers (`transferStock`) and `pharmacy_stock_requests`. |
| P8 | Partly | `pharmacy_controlled_entries` has a witness attestation. The count before comes from `pharmacy_count_lines.recorded_balance`. Witness proof: `pharmacy_attestations` (`password+totp`). |
| P9 | True | `downtime_*` (0105) is shared with the lab, with true times on back-entry. |

### Q2 (P10): carts

- `emergency_administrations.cart_id` points to `crash_carts`, but **nothing writes `emergency_administrations`**.
- The resus desk's `recordEmergencyAdministration` writes a `resus_timeline_events` row of kind `drug`, holding the cart as **free text** (`payload.prescribing.cart`, at most 48 characters).
- So the cart uses shown as context are read from those timeline events, matched through a list of names per cart (D-PH2-21). No record is rewritten.

### Q3 (P11): the administration record

`medication_administration_records` holds `drug_name`, a free-text `dose`, `route`, `state`, `administered_at` and the prescription link. **It holds no product, quantity, unit or batch.** This confirms D-PH2-06: ward use is counted. "Recorded as used" is never shown.

### Q4 (P12): ward in-charge

`ward_in_charge_assignments` (0031, with `acting` added in 0080) names it. Department heads are in `department_heads`.

### Q5, Q6, Q8: waiting on the owner and the pilot site

Not available in the repo. Nothing is invented. Until they arrive:
- **The national layouts** (HMIS 085, 084B, 087, 088, 105 Section 6) and **EMHS Chapters 8, 18 and 19:** every print carries *"Columns not yet confirmed against this hospital's {form}."* The column maps are an unsigned pack.
- **The pilot practice** (how wards are supplied, carts, receivers, order cycle, costs on notes, stores, scanner): nothing defaults (D-PH2-05). Each ward's supply model is set per ward.
- **The paper baselines** (a timed receipt, a requisition, a cart check, the last stock status report, the last order): the timed and paper comparisons (STOP 4, 8 and 9 reports) are deferred until supplied.

### Q7: the lab ledger

The lab keeps its own stock in `lab_stock_*` (0112). The pharmacy shares its pattern (append-only, kinds, blind counts) and never its rows.

### Q9: tooling

- There is no Playwright in the repo (D-TW-14). The CDP harness (`~/Desktop/pharm0-harness`) with axe-core is used instead.
- RLS probes run on the PGlite lane (`tests/emr-db`). The fake clock is `now` injected into `withPharmacyWrite`.

### Other findings

- **Signed sets:** `pharmacy_signed_sets` (0122, 0135) needs two signers or exception text, and **no action writes it**. This slice adds `saveSignedPack` and `signPack`, which also closes Phase 1's missing signing page.
- **Second approvals:** the pharmacy has none beyond `pharmacy_attestations`. Month close reuses it: a second person attests with password and second factor, and `approved_by` must differ from `closed_by`, as `pharmacy_golive` does.
- **Design:** Tide is merged, by re-pinning tokens (ADR 0361), and there is no `components/tide/` kit. New screens use the existing components under `TideScope` (`pharmacy` group), laid out after the Phase 1 Tide canvas.
- **Disagreements with the prompt:**
  - SL-12's `counted` and `batch_corrected` stay tables, not movement kinds.
  - `pack_size` is text, so OQ-3 rounds only where it parses as a whole number of issue units; otherwise the row is flagged.

## GATE A

### Location model (LC-1, D-PH2-01)

- **New table `pharmacy_locations`:** id, hospital, kind (`store | dispensing_point | ward | cart | quarantine`), the hub unit it belongs to (a department unit, or a `hospital_wards` row for a ward), `crash_cart_id` for a cart, `ward_supply_model` (`stocked | issue_only`, wards only), live times, in-charge and settings.
- **Phase 1's points are copied in** with the **same id** as their `department_id`. Existing `dispensing_point_id` columns therefore keep working with no row rewritten.
- **New Phase 2 tables** reference `pharmacy_locations(id)`. Phase 1's per-point tables stay valid.
- **The ledger:** `pharmacy_stock_movements` and `pharmacy_batches` gain a nullable `location_id`. It is filled for new rows, and for old rows it equals `dispensing_point_id`, which is read through a view (`pharmacy_movements_v`). No existing row is updated.

### Movement kinds and consumption (SL-12 to SL-18, CN-1, D-PH2-08)

- **New kinds:** `issued` / `received_from_issue`, `returned_out` / `returned_in`, `lent`, `borrowed`, `loan_returned_out`, `loan_returned_in`, `ward_used`, `cart_used`, `quarantined_out` / `quarantined_in`, `written_off`, `returned_to_supplier`.
- **New columns:** `pair_id`, `unit_cost`, `allocated` and `counterparty_id`.
- **Pairs:** a deferred constraint trigger refuses a paired kind without its other leg in the same transaction (SL-13).
- **Worked example.** In March, the store issues 100 to OPD (internal), and OPD supplies 60 to patients. Ward 4 (issue-only) receives 40, and Ward 6 (stocked) receives 50 and later counts 20. 5 are written off.
  - Consumption = 60 (supplied) + 40 (issue-only ward) + 30 (`ward_used` = 50 − 20) = **130**.
  - The 5 written off are reported as losses, apart from consumption.

### The order (6.6)

- **The method:** the adjusted average monthly consumption (AMC) is consumption over the window ÷ days in stock in the window × the days in the window, ÷ the window's months. Maximum = AMC × signed maximum months. Proposed = maximum − stock on hand, rounded up to whole packs, and never negative.
- **Worked example on fixture figures** (not a signed value): 180 used over a 60-day window, with 15 days out.
  - AMC = 180 ÷ 45 × 60 ÷ 2 = 120 a month.
  - With 4 maximum months, the maximum is 480. With 130 on hand, 350 are needed; at a pack of 100, the proposal is **4 packs**.
- Q8's real order is used at STOP 9 when supplied.

### Month end, recall, wards and carts

- As in the prompt: MR-1 to MR-6 (snapshots in `pharmacy_period_snapshots`, never re-opened), RC-1 to RC-6 (two patient lists), WS-1 to WS-3, and EC-1 to EC-4.
- Ward and cart use come only from counts (D-PH2-06).

### Permission map, version 3 (D-PH2-02)

As Appendix A.
- `pharmacy.store` is added to the access engine and to `private.pharmacy_cadre_permissions`, for the Pharmacist and Pharmacy technician, with a backfill for both cadres.
- Ward rights come from `ward_in_charge_assignments`; cart rights from the unit's `department_heads`.
- In production, map v3 applies only where `PHARMACY_STORE` is on.

### Packs and strings

- Every Appendix D pack is a new `pharmacy_signed_sets` kind, unsigned. It is signed in the app through `signPack`.
- Every Appendix B string goes into `content/pharmacy-stores.ts` with status `draft`.

### Hazard log

Appendix C, H2-1 to H2-15, each closed by its named test. Added:
- **H2-16:** a cart name typed on the resus desk matches no cart, so its uses are not shown. Control: unmatched names are listed for the pharmacy in charge.

### Screens

The previews in boards 2.1 to 2.6 are corrected per 5.13:
- no "on the ward now" figure;
- no "should be left" figure on carts;
- two recall lists, never merged;
- order quantities rounded up to packs, with ward and cart stock excluded from stock on hand;
- money only from recorded cost.

They are laid out after the Phase 1 Tide canvas: rail group **Store**, numbered sections, centred dialogs and blind counts.

## Decisions to sign

- D-PH2-01 to D-PH2-20 and E-PH2-01 to E-PH2-04, as recommended in Section 14 of the prompt.
- **D-PH2-21:** a cart location links to its `crash_carts` row. Resus-desk cart names are matched to a cart through a signed list of names per cart. Unmatched names are listed (H2-16).
- **D-PH2-22:** signers. The CSO signs alone for now (ADR 0281). Packs that name a second signer record the exception *"CSO signs alone (ADR 0281)"*. The pharmacist reviewer and the pilot in-charge co-sign before a real hospital goes live, when they exist.
- **D-PH2-23:** month close and every other "second approver" reuse `pharmacy_attestations` (password and second factor) with approver ≠ actor.
- **D-PH2-24:** flags are `PHARMACY_STORE`, `PHARMACY_WARD_STOCK`, `PHARMACY_CARTS`, `PHARMACY_RECALL`, `PHARMACY_MONTH_END` and `PHARMACY_ORDERING`, as env values like Phase 1's, each ANDed with `PHARMACY_WORKSPACE`.

## ADR drafts (0370–0380)

1. Stock locations of five kinds, with Phase 1 points copied in under the same ids.
2. Two-leg movements, the new kinds and the pair trigger.
3. Receiving at the counted quantity; discrepancies reported, never absorbed.
4. Ward and cart use from counts; why no dose-to-unit conversion.
5. The consumption definition.
6. The order method from EMHS 2023; MedSync does not send it.
7. Month close: immutable snapshots, late entries carried forward.
8. Recall: the exact and "may have received" lists.
9. Expiry, quarantine and write-off; disposal off-system.
10. Cost recorded at receipt only.
11. GS1 keyboard-wedge parsing.

## Signatures

Signed by Fadhul (CSO), 21 Oct 2026, in session:
- D-PH2-01 to D-PH2-20 and E-PH2-01 to E-PH2-04, as recommended;
- D-PH2-21 to D-PH2-24;
- the permission map, version 3;
- the decision to build now, with the missing national layouts and pilot baselines shown as gaps and never invented.

The pharmacist reviewer and the pilot in-charge co-sign before a real hospital goes live (D-PH2-22).
