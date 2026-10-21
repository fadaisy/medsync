# Pharmacy handbook: stores, wards, carts, month end and orders (Phase 2)

How each role uses the **Store** group in the pharmacy rail. Each page shows only with its flag on, for a person who holds what it needs. Every figure in this guide is a fixture, not a signed value.

## Before anything: places, suppliers and signed packs

- **Places and suppliers** (`/pharmacy/store/places`, Head of Pharmacy):
  - add a store and a quarantine;
  - name each place's in-charge;
  - set each ward's supply model, *stocked* or *issue-only* (nothing defaults);
  - add suppliers (National Medical Stores, Joint Medical Store, others) and other facilities.
- **Signed packs** (`/pharmacy/store/packs`):
  - The hospital's own figures and lists: order parameters, the tracer list, the cart look-ahead, month-end rules, ward rules, reason lists, HMIS column maps, the recall message and the day-out-of-stock rule.
  - Nothing is pre-filled. The national figure is shown beside a field as a reference only.
  - Signing needs two people, each with their password and code, or the exception *"CSO signs alone (ADR 0281)"*.
  - While a pack is unsigned, what needs it does not run, and the screen says which pack is missing.
- **Going live** (Hospital admin → Departments → Pharmacy): each store, ward and cart lists its conditions:
  - products set up, and an opening count of every product;
  - levels or cart list signed;
  - an in-charge named;
  - people briefed;
  - for a store, a downtime drill that included a delivery and an issue on paper.

  A second admin switches it on with their own password and code.

## Deliveries (store staff, `pharmacy.store`)

1. **Start the delivery:** supplier, delivery note number, the order it fills, when it arrived, where it is received, who counts.
2. **Each line:** product (typed or scanned), the note's quantity, what you counted (accepted, or rejected and kept, or rejected and sent back), batch, expiry, and the cost if the note shows one.
3. **The result in words:** *Matches*, *fewer than the note*, *more than the note*, *short of the order*, *not on the order*, *expires soon*, *damaged* or *wrong product*. Only what was counted goes into stock.
4. **A short-dated line** needs your decision: accept, accept and tell the supplier, or reject.
5. **Add the lines to stock.** Then print the discrepancy report and the goods received note. MedSync sends nothing. Controlled drugs are received with a witness, and their register entry is still made on paper.

## Issues and requisitions (`pharmacy.store`, or `pharmacy.dispense` at the issuing point)

- **A requisition** comes from a ward's nurse in charge, a point's in-charge, or a cart check.
- **The issuing screen** proposes the first-expiring batch and pre-fills what was asked, capped at what you hold. A line issued as zero needs a reason.
- **Issue** moves the stock out of your place and into theirs in one step. Print the voucher.
- **The receiving place confirms** with their second factor. A difference is recorded at their end, with a reason, for both in-charges.
- **Returns** go back to the issuer. Stock that is not fit goes to quarantine.
- **Loans:** lend to and borrow from other facilities. A loan stays listed until it is returned or closed with a reason. Controlled drugs are never lent or borrowed.

## Ward stock (nurse in charge, and pharmacy)

- **The page** shows each product's ward level, the last count, issues and returns since it, and the doses charted since it. Doses are context only, never taken from a figure.
- **A suggested top-up** shows only when the last count is recent; otherwise the page says *"Count the ward first"*.
- **Count the ward blind:** nothing expected is shown until your figures are saved. Use since the last count is worked out from your count.
- **A count higher than possible** is listed for you to explain.
- **Raise a requisition** from the suggested top-ups. Confirm what arrives with your second factor.
- **Controlled drugs** on the ward keep their paper register.

## Emergency carts (pharmacy with the unit's nurse in charge)

1. **Recorded uses** since the last check are shown as context, never subtracted.
2. **Count blind**, per product and batch, with expiries.
3. **Restock** from the first-expiring stock. Short-dated items are swapped.
4. **Say what you found for a gap:** used and not recorded, broken or discarded, moved to another cart, or cannot explain.
5. **Record the seal number.** The nurse in charge confirms with their second factor.

Carts past their check interval are listed for the pharmacy in charge.

## Expiry and recall (`pharmacy.manage`; contacts by `pharmacy.stock`)

- **Expiring and expired stock** is listed by place.
  - Move expired stock to quarantine.
  - Write off from quarantine with a witness and a register entry number, and print the register entry.
  - Disposal happens off-system; record only its reference.
- **Start a recall** from the notice: source, reference, the class as stated, level and instructions. The batch is blocked at once. The trace lists:
  - receipts;
  - patients supplied (exact);
  - wards and carts;
  - patients who *may have received it*, kept separate;
  - shelves;
  - loans;
  - the accounted-for sum.
- **Quarantine everything** in one action. Post notices to the wards.
- **Tell patients** with the signed message, which names no medicine. Patients it cannot reach stay on the printed list, and a person records how each was reached.
- **Close the recall** with the quantities returned and destroyed, and print the reconciliation.

## Month end (`pharmacy.stock` counts; `pharmacy.manage` closes)

- **Count every place blind.** Any product with a movement and no count needs a reason.
- **Each difference** gets a reason from the signed list, or is left *Unexplained*, which carries it to next month.
- **Close the month:** a second person confirms with their password and code. A closed month never changes. Late entries appear next month, labelled.
- **Print** the stock status report (HMIS 105 Section 6) for the tracer list, and the quarterly tracer audit.

## Orders (`pharmacy.manage`)

- **Each row shows its arithmetic:**
  - consumption in the window;
  - days out of stock;
  - the adjusted average monthly consumption;
  - stock on hand (store and points only);
  - the maximum;
  - the proposal, rounded up to whole packs.
- **Type your own quantity** for every line; a difference from the proposal needs a reason.
- **If the budget is short,** trimming proposes cuts in VEN order, and you confirm each one. A vital line needs a typed reason.
- **Output:** print HMIS 085, HMIS 084B or a purchase list, or copy the quantities for the NMS portal. *MedSync does not send this order.*
