# PROMPT: Pharmacy Phase 2 — stores, wards and supply (the main store, ward stock, emergency carts, expiry and recall, month end, the order)

> **For Claude Code.** Work at the repo root on a new branch, `feat/pharmacy-stores`, cut from the branch where `feat/pharmacy-dispensing` (pharmacy Phase 1) has merged its first and second merges (Steps 0 to 8). If those have not merged, **STOP at Step 0**. Phase 1's third merge (Step 9: patient list and messages) may be deferred (D-PH1-40); if it is, recall contact in 5.7 is by print and phone only, and is still recorded. This slice extends Phase 1's catalogue, stock ledger, dispensing points, controlled-drug record, downtime module, go-live switch and signed-content sets, and it builds no second version of any of them. First copy this prompt into `docs/pharmacy/phase-2/`.
>
> **Mode: gated.** Eleven steps, numbered 0 to 10, each ending in a **STOP**. They are called steps because "Phase 2" names this slice of the pharmacy roadmap.
> - **Documents** follow Stage 1: draft, critique against the checklist, revise (at most two passes), present, STOP.
> - **Code** follows Stage 2: build, run the real checks, fix, re-run until green, report the numbers, STOP.
> - Self-refinement never replaces a real check.
>
> **Assume nothing in this slice is built.** Section 3 lists what Phase 1 should have left and what earlier reads claimed. Verify every line. Build what Step 0 proves is missing; reuse what it proves exists.
>
> **The CSO is Fadhul.** This slice moves stock between places, counts it, writes it off, traces it to patients in a recall and proposes what to order. Nothing reaches a production hospital without his signature, and that of the named pharmacist reviewer (roadmap D-PH-13) and the pharmacy in charge at the pilot site, on:
> - the permission map, version 3;
> - the stock parameters (Appendix D);
> - the tracer list;
> - every reason list;
> - every string staff or patients read;
> - the hazard log (Section 14, Appendices A to D).
>
> **How it merges.** Three merges on one roadmap phase:
> - Steps 0 to 4: the store.
> - Steps 5 to 7: wards, carts, expiry and recall.
> - Steps 8 to 10: month end, the order, scanning and going live.
>
> Each stock location goes live on its own (Section 5.12). A hospital can run the store and month end without ever turning on ward stock.

---

## 0. What we are building, in one paragraph

After Phase 1 the dispensing window records every supply against a batch, but the hospital's medicines still arrive, wait, move and leave on paper everywhere else. Deliveries are checked against delivery notes by hand. The store keeps stock cards. Wards are topped up on requisition and issue vouchers. Emergency carts are checked against a list on a clipboard. At month end someone tallies stock cards to fill Section 6 of HMIS 105, and every two months someone works out an order on the Bimonthly Report and Order Calculation Form. A recall means searching dispensing logs for a batch number nobody wrote down. **This slice moves that paper into the same ledger the window already writes:**
- the main store receives against a delivery and records each discrepancy;
- stock is issued to dispensing points, wards and carts, and counted where it sits;
- expired and recalled stock goes to quarantine and is written off with its register entry;
- month end reconciles what came in, went out and was counted, and produces the stock status report;
- the order is worked out from recorded consumption by the method the Ministry's manual sets out.

MedSync does not send the order anywhere.

**Done when:**
- the monthly stock status report is produced from the ledger with no paper tally;
- a count at any location reconciles to the ledger with its variance visible and explained or carried;
- a recall of a batch lists every patient who received it at a window, every ward it was issued to, and every shelf that still holds it;
- the order proposal for one cycle at the pilot site is checked against the pharmacy in charge's own paper calculation, and every difference is explained.

---

## 1. Ground truth and reading order

1. **The repo wins** over this prompt, the roadmap and the canvases. Report every disagreement at STOP 0.
2. **The plan:** the *MedSync Pharmacy Roadmap*, "Phase 2: Stores, wards and supply" (https://claude.ai/artifact/WfJbaaKpAKVdYvu1Tmpxkn). Where this prompt departs from it, Section 5.13 says where and why.
3. **The UI reference.**
   - Interaction patterns come from *Pharmacy Phase 1 · Tide* (https://claude.ai/artifact/BMmzSYKf4CU8dYUUy2RtUY): the shell, the queue table, numbered sections, centred dialogs, blind counts and paper.
   - The Phase 2 screens are previewed as boards **2.1 to 2.6** in *Pharmacy UI Preview · Tide* (https://claude.ai/artifact/72auX94F4FPogmCi32ELDf), a mechanical reskin of the Chroma originals in *Pharmacy UI Preview* (https://claude.ai/artifact/QWr8hAaEyDhmEdiCbYUBTT). These are previews to react to, not specifications; 5.13 lists where this prompt overrules them.
   - Every medicine, quantity, batch, price, supplier and date on any canvas is an example and not a signed value.
4. **Design:**
   - If `feat/tide-everywhere` (`PROMPT-TIDE-WEB-MIGRATION.md`) has merged its Step 2, build every screen with `components/tide/` and the app's Tide tokens.
   - If not, use the design system in force on the branch, laid out after the Phase 1 Tide canvas, and record the gap at STOP 0.
   - `DESIGN-medsync.md` is authoritative either way.
5. **Prompts this builds on** (read the copies under `docs/`):
   - `PROMPT-PHARMACY-PHASE-1.md`, all of it, and above all:
     - the catalogue (6.2, CT-1 to CT-7);
     - the stock ledger (6.3, SL-1 to SL-11);
     - stock at the point (5.8);
     - controlled drugs (5.9, 6.9);
     - downtime (5.12, 6.12);
     - going live (5.13, 6.13);
     - who signs what (D-PH1-36);
     - the permission map (Appendix A);
     - the out-of-scope seams (Section 15).
   - `PROMPT-PHARMACY-PHASE-0.md`: dispensing points as hub units (6.8), the read list, the numbers ledger.
   - `PROMPT-HOSPITAL-SERVICES-HUB.md`: departments, wards and units, heads and in-charges, four-eyes, print CSS only.
   - `PROMPT-RESUS-DESK-V2.md`: `recordEmergencyAdministration`, the cart identifier on `emergency_administrations`, and how the witness is authenticated.
   - The nurse workspace prompt and the code behind `/nurse/mar`: what one charted administration records.
   - `PROMPT-LAB-PHASE-2.md` and later lab prompts, for the lab's stock and lot ledger, if it exists, so the two ledgers share their pattern and never their rows.
6. **Ugandan sources, read on 21 Oct 2026** (Appendix E lists them; re-verify at build time):
   - **The Essential Medicines and Health Supplies Management Manual, 2023:**
     - maximum stock of "four months of stock for most medicines" (§4.1.1.2);
     - "Quantity to order = Maximum stock quantities − Balance on hand" (§4.1.1.3);
     - consumption adjusted for stock-out days (§3.3.1.1);
     - a physical count at each ordering cycle (§4.1.1.2);
     - HMIS 085 (the EMHS order form) and HMIS 084B (the Bimonthly Order and Patient Report, Table 9);
     - Section 6 of HMIS 105 (§26.2);
     - the quarterly tracer-medicine audit (Table 3);
     - the Expired or Spoiled Medicines Register (Table 27);
     - redistribution and borrowing (Chapter 19).

     Chapters 8, 18 and 19 were not readable in full; Step 0 reads them from a copy the pharmacy in charge provides.
   - **The NMS Standard Operating Procedures Manual for Supply Chain Management at Health Facility Level (2019):**
     - the receiving steps;
     - the Discrepancy Report Form (HMIS 087);
     - the Expired/spoilt items register (HMIS 088);
     - the Requisition and Issue Voucher flow with its two signatures;
     - monthly physical counts;
     - maximum four and minimum two months of stock;
     - the stock book's "days out of stock" and adjusted monthly consumption.
   - **NDA, Guidelines for the Recall or Withdrawal of a Medical Product (INS/GDL/037, revision 0, effective 21 Aug 2017, review due 21 Aug 2020):**
     - recall classes A, B and C;
     - recall levels down to "all hospitals, clinics, surgeries and health facilities";
     - a stock reconciliation report within 14 days of termination.

     It assigns duties to importers and local technical representatives, not to facilities, and its review date has passed.
7. **Code:**
   - `app/pharmacy/**`, `lib/pharmacy/**`, every Phase 1 migration and test;
   - `emergency_administrations` and `recordEmergencyAdministration`;
   - the administration record behind `/nurse/mar` and its tables;
   - the hub's ward and unit tables, the four-eyes module, the signed-reference module, the downtime module, the print module;
   - the feature-flag module, `docs/NUMBERS.md`, `db/schema/**`, `tests/**`, `tests/rls/**`.

---

## 2. Laws (non-negotiable)

1. **Engine-first.** Every surface reads or writes an engine with real tables, real RLS and passing tests, built in an earlier step than the surface.
2. **One ledger.** Every quantity of every product at every place is a sum of append-only movements in the Phase 1 ledger, extended. No second stock table, no stock card table, no editable balance. A report is a projection over the ledger and the period closes (MR-4); it is never a stored figure typed by a person.
3. **Nothing moves silently.** Every movement names its kind, its batch, the place it left and the place it reached, the person, the time it happened and the time it was recorded, and the event that caused it. A movement between two places writes both legs in one transaction, or neither.
   - **Phase 1's one-leg paths close as the two-leg ones open.** When `pharmacyStore`, `pharmacyWardStock` or loans are live, Phase 1's Receive stock at a point no longer offers "from Main store", "Borrowed from another facility" or "Returned from a ward". Those arrive only as a confirmed issue (IS-3), a return (IS-5), a loan (IS-7) or a delivery (5.2).
   - When `pharmacyRecall` is on, Phase 1's Adjust refuses negative adjustments for "damaged" and "expired, removed". Those go through quarantine and write-off (5.6). "Lost" stays an adjustment, and month end and the tracer audit report it as a loss, apart from count corrections. Phase 1's adjustment reason pack is re-signed to match.
4. **No conversion, ever.** Quantities are whole issue units of a product (Phase 1 E-PH1-05). The system never converts a charted dose, a prescribed dose or an emergency administration into issue units, never converts between packs, strengths or units, and never infers a quantity used from a dose. **Where a figure would need a conversion, the screen shows a count and the recorded events as context, and a person decides** (5.4, 5.5).
5. **Counts are blind.** A count of any place shows the counter no expected figure before it is saved (Phase 1 D-PH1-24). For a controlled product the count is committed before the figure is shown and is witnessed.
6. **No remembered numbers.** None of these is set in code, seeds or copy:
   - maximum or minimum months;
   - lead time;
   - safety stock;
   - order cycle;
   - ward level;
   - cart list;
   - tracer list;
   - recall class;
   - VEN class;
   - price;
   - cost;
   - any interval, window, share or threshold a rule below uses.

   Each is signed, versioned data (Appendix D), and the sourced national figure is shown beside the field as a reference, never pre-filled. **Phase 1's operational settings are reused, not duplicated:** reorder levels, count freshness and the expiry look-ahead stay the settings the pharmacy in charge sets (D-PH1-23, D-PH1-36). This slice applies them to every location kind and adds no second version of any of them. While a parameter is unsigned, the calculation that needs it does not run, and the screen says which parameter is missing and who sets it.
7. **Informs, never blocks care.** Nothing here prevents a prescriber prescribing, a nurse giving a dose, a resus team using a cart, or the window supplying a patient. Ward stock and cart figures inform the people who keep them. **The only hard stops in this slice are:**
   - no issue, transfer or supply of an expired, quarantined or recalled batch (Phase 1's hand-over and availability checks are extended to blocked batches; downtime back-entry is the one exception, SL-14);
   - no movement to or from a location that is not live, except issues to an issue-only ward (D-PH2-05);
   - no live movement that takes a batch below zero (Phase 1 SL-4);
   - no controlled movement without its witness;
   - no change to a closed period;
   - no write-off without its reason and register entry.
8. **A recall finds people, it does not guess them.** A patient is listed as having received a batch only from a recorded supply of that batch. A patient on a ward that held the batch is listed separately, in words, as *"may have received it"*, and is never merged into the first list.
9. **The paper still applies where the law keeps it.** The statutory controlled-drug books, the signed delivery note and the stamped requisition voucher keep their place. MedSync prints its entries and never says they replace the paper. Controlled drugs keep Phase 1's witnessed path at every location.
10. **MedSync does not order.** It proposes quantities and prints the forms. No link to the NMS portal, JMS or any supplier system, no purchase sent electronically, no payment.
11. **Fail loud.** A requisition not issued, a delivery not finished, a count with an unexplained difference, a period not closed and a recall not completed each stay listed for the person who must act, in words, until they act.
12. **No patient details off the platform.** A recall message never names a medicine, a batch, a condition, a clinic or a prescriber (banned-term scan, Phase 1 Law 12). Reports that leave MedSync carry no patient identifiers, except the recall list, which prints only for pharmacy staff and is logged.
13. **Red is a safety property.** This slice adds no red.
    - Short, out, expired, quarantined, recalled, a difference, overdue and unclosed are amber, each with an icon and a word.
    - "Matches" and "in stock" are neutral; nothing is green.
14. **Behind flags, stack as found.**
    - Six per-hospital flags, off by default: `pharmacyStore`, `pharmacyWardStock`, `pharmacyCarts`, `pharmacyRecall`, `pharmacyMonthEnd`, `pharmacyOrdering`.
    - Each location also goes live on its own (5.12). With all six off, behaviour matches the Phase 1 baseline.
    - TypeScript strict, no `any`, Zod on every action, AAL2, the house action contract.
    - No new dependency without stopping to flag it. Tokens only. Print with CSS only.
    - Node 22 and pnpm. en-GB.
    - A pharmacy technician is never called a pharmacist. The pharmacy regulator is the **Pharmacy Board of Uganda** (never PSU).

---

## 3. What Phase 1 should have left, and what earlier reads claimed (verify every line at Step 0)

| # | Claim | Where | Matters for |
|---|---|---|---|
| P1 | The ledger is append-only by trigger with kinds `received`, `supplied`, `reversed`, `adjusted`, `count_correction`, `transfer_out`, `transfer_in`, plus `counted` events and `batch_corrected` | `lib/pharmacy/stock/**`, Phase 1 SL-1, SL-11 | **Everything** |
| P2 | A batch is product, batch number and expiry **at a point**; the same batch at two points is two balances | Phase 1 SL-3 | Locations |
| P3 | Dispensing points are hub units with `serves`; each goes live on its own with six conditions and a second approver | Phase 0 6.8, Phase 1 5.13 | Locations, go-live |
| P4 | Products carry pack size, issue unit (fixed once moved), optional registration number and optional price; prices are snapshots on supplies | Phase 1 CT-2, CT-4, CT-5 | Receiving, money |
| P5 | Reorder levels exist per medicine and point; stock-out spans are projected from the ledger | Phase 1 D-PH1-23, SL-9 | Orders, reports |
| P6 | National-list fields (level of care; vital, essential or necessary class) attach to medicines as imported, versioned reference data | Phase 1 CT-3 | VEN priority |
| P7 | Transfers and requests between points exist (SL-7) | Phase 1 | Issue |
| P8 | Controlled entries record count before, attestations, witness and how the witness was authenticated | Phase 1 6.9 | Controlled at every location |
| P9 | The downtime module is shared with the lab and supports sheets and back-entry with true times | Phase 1 6.12 | Store downtime |
| P10 | `emergency_administrations` records drug, amount, cart, giver and time; whether "cart" is a stable identifier or free text was not read | resus desk, roadmap | **Carts** |
| P11 | The administration record charts doses per prescription line; whether a charted administration records a quantity in issue units, a product or a batch was not read | `/nurse/mar` | **Ward stock** (Law 4) |
| P12 | The hub holds wards as units; whether a ward has a named nurse in charge was not read | hub | Requisitions |
| P13 | How the pilot site's wards are supplied (ward stock, individual supply, or both) is open | roadmap D-PH-05 | Scope of Step 5 |
| P14 | No cost price is recorded anywhere; Phase 1's price is the price to the patient | Phase 1 CT-5 | Money in reports |

---

## 4. Design direction

**Eight rules**
1. **Every place is a location, and every location is counted the same way.** Store, dispensing point, ward, cart, quarantine: one count screen, one blind rule.
2. **Paper in, paper out, ledger between.** The delivery note, the requisition voucher and the register entry are printed from the record, in the national layouts where they exist.
3. **Only what was counted goes into stock.** A delivery enters stock at the counted quantity; the note's figure stays on the discrepancy report.
4. **A difference is a question for a person.** It is shown with both figures, a reason is asked for, and an unexplained one is carried, never absorbed.
5. **Show the arithmetic.** Every proposed quantity, every "should be" and every month-end figure opens to the movements and the formula behind it, in words.
6. **Close the month, keep the past.** A closed month never changes; what arrives late appears in the next month, labelled.
7. **Recall is a list of people and places.** Patients first, then wards, then shelves, each with what to do next.
8. **Say what the system is not doing.** No order is sent. Ward use is counted, not calculated from doses. No cost is known unless it was recorded at receipt.

**Budgets** (baseline at Step 0 where one exists; met by Step 10)
- Receiving a 20-line delivery, counted, with two discrepancies: **≤ 1 typed field per line** beyond the counted quantity, batch and expiry. With a scanner that reads batch and expiry, **0** for those fields.
- Issuing a 10-line requisition from a dispensing point to a ward: **≤ 12 interactions** where every line is issued in full.
- Month-end reconciliation for one location with 300 products: **p95 < 3 s** to render; the stock status report **< 5 s**.
- Order proposal for 500 products: **< 5 s**.
- Recall trace for one batch: **< 2 s**.
- Movements with only one leg: **0**. Balances that differ from the sum of their ledger: **0**. Issues of an expired, quarantined or recalled batch: **0**. Rows changed in a closed period: **0**.

---

## 5. Interface specification

### 5.1 Navigation, locations and flags
- **Pharmacy navigation after this slice** adds a second group, **Store**, to the Phase 1 rail:
  - Deliveries · Issues and requisitions · Ward stock · Emergency carts · Expiry and recall · Month end · Orders;
  - each registered through the Phase 0 registry and shown only when its flag is on, its page is built and the viewer holds the permission.
- **Locations.** Phase 1's dispensing point becomes one kind of **stock location**. The kinds are:
  - `store`;
  - `dispensing_point` (Phase 1, unchanged);
  - `ward` (a hub ward that keeps ward stock);
  - `cart` (an emergency cart, tied to a ward or unit);
  - `quarantine` (one per hospital, or one per store if the site keeps several).

  Every location is a hub unit or belongs to one. The top bar's acting place (plum) names the location the viewer is working at.
- **Nurses** see only their own ward's Ward stock page and its requisitions, through the ward in-charge assignment (Appendix A).

### 5.2 Deliveries: receive against a delivery note (board 2.1)
- **Start a delivery:**
  - supplier (from the hospital's supplier list: National Medical Stores, Joint Medical Store, other named suppliers);
  - delivery note number;
  - the order it fills, if one is recorded (5.10);
  - arrived at (date and time field);
  - the location receiving it (a store, or a dispensing point that receives directly);
  - who is counting, and the witness the site's procedure requires (the NMS SOP has witnesses present).
- **Lines:** product (picked by name, or scanned, 5.11) · quantity on the note · quantity counted · batch · expiry · unit cost (optional, D-PH2-14) · a result in words:
  - *Matches*;
  - *{n} fewer than the note*;
  - *{n} more than the note*;
  - *{n} short of the order*;
  - *Not on the order*;
  - *Expires in under {look-ahead}*;
  - *Damaged*;
  - *Wrong product*.

  Each result except Matches is amber with an icon.
- **A batch number already at the location with a different expiry** is refused with both shown (Phase 1 SL-3).
- **An expired item on delivery** cannot enter stock; it goes on the discrepancy report.
- **Damaged, wrong-product and rejected quantities** never reach a usable shelf (RG-3).
- **A short-dated item** (inside Phase 1's expiry look-ahead, applied at receipt) enters stock only with a recorded decision: accept · accept and tell the supplier · reject. Each is listed on the report.
- **Discrepancy report:** every line that is not Matches, in the layout of HMIS 087 (columns confirmed by the pharmacy in charge at Step 1), with the deliverer's name, vehicle registration and the signature lines the SOP names. **Print the report.** It is never sent by MedSync.
- **Still owed on the order:** lines short of the order stay open on the order until received or closed with a reason.
- **Buttons:**
  - Save and finish later (the delivery stays listed as *Counting*, with no stock moved);
  - **Add {n} lines to stock**: one transaction writes a `received` movement per batch at the counted quantity, links each to the delivery line, and closes the delivery.
- **Goods received note:** printed from the closed delivery.
- **Controlled products** are received through Phase 1's witnessed path, line by line, and the screen says that the controlled drugs register entry is still made on paper.

### 5.3 Issues and requisitions (board 2.2, issue side)
- **A requisition** is raised by:
  - a ward's nurse in charge, for the ward's stock;
  - a dispensing point's in-charge, from the store;
  - a cart's keeper, through the cart check (5.5).

  It names the requesting location, the issuing location, and lines (product or medicine, quantity asked).
- **The issuing screen:**
  - **Header:** the requisition, who raised it and when, the requesting location's own count (if a ward count was taken, 5.4).
  - **Per line:** what was asked, what the issuing location holds, the batch that expires first, and the quantity to issue (pre-filled with the quantity asked, capped at what is held). A line issued as zero is marked "Not issued" with a reason (the SOP marks unissued items as zero).
  - **Issue:** one transaction writes `issued` at the issuing location and `received_from_issue` at the receiving location per batch.
  - **Print** the Requisition and Issue Voucher in the hospital's layout.
- **Receipt at the other end.** A ward or point confirms receipt: a nurse or pharmacy staff member at that location signs in with their second factor and either confirms or records a difference. Until confirmed, the issue shows *"Issued {time}, not yet confirmed by {location}"*. The stock moved at issue; a difference recorded at receipt writes an adjustment at the receiving location with its reason and is listed for both in-charges.
- **Returns:** a ward or point returns stock to its issuer by the same two-leg movement, with a reason (no longer needed, near expiry, patient discharged, other) and whether it is fit for the shelf. Not fit goes straight to quarantine (5.6).
- **Between facilities** (EMHS Chapter 19, redistribution): **Lend** and **Borrow**:
  - each names the other facility (free text plus an optional facility code), writes a movement to or from an `external` counterparty, and keeps a running loan balance per facility;
  - a loan stays listed until it is returned or closed with a reason;
  - the borrow/lend record prints in the manual's layout once confirmed.

### 5.4 Ward stock (board 2.2, ward side)
Behind `pharmacyWardStock`, for wards switched to ward stock (D-PH2-05).
- **The ward list:** products the ward keeps, each with a **ward level** (signed by the pharmacy in charge with the ward's nurse in charge, operational data, Appendix D). Edited only by those two.
- **The page** (pharmacy and the ward's nurses):

  | Column | What it shows |
  |---|---|
  | Product | |
  | Ward level | The signed level |
  | Last counted on the ward | Figure, when, by whom |
  | Issued since that count | |
  | Returned since that count | |
  | Doses charted since that count | Context: the number of administrations charted on the administration record for this medicine on this ward. **Never subtracted from anything** (Law 4) |
  | Suggested top-up | Ward level minus the last count, shown only when the count is within Phase 1's count freshness setting; otherwise *"Count the ward first"* |
  | Requisition | |

- **Why no "on the ward now" figure.** The administration record charts doses, not issue units. Turning "1 g given" into "1 vial used" is a conversion, which is wrong for split vials, part tablets, wastage and multi-dose bottles. So the ward's holding is known only when it is counted. If Step 0 finds that the administration record stores a quantity in issue units with a product (P11), that figure may be shown as *"Recorded as used: {n}"*, still never subtracted from a count, and only after the CSO signs it (D-PH2-06).
- **Ward count** (by the ward nurse in charge or pharmacy staff): the same blind count as any location (the count screen hides the last count, issues, returns, doses and suggested top-up until the count is committed), per product (batches where the ward keeps them apart, otherwise one figure per product, D-PH2-07). The ward's ledger balance minus the count is its **use since the last count** (WS-3), recorded as `ward_used` (a consumption movement at the ward, counted as consumption of the hospital, 6.5). A figure that would be negative (more counted than could be there) is amber with *"More on the ward than was issued. Check returns and the last count."*
- **Raise a requisition** from the page: the suggested top-ups as lines, editable, then submit to the issuing point.
- **Ward stock and recalls:** issues to a ward carry their batch, so a recall finds the ward (5.7). Where the ward keeps one figure per product, batches at the ward are not distinguished after mixing, and the recall says so.
- **Controlled drugs on the ward** keep their own paper register. MedSync records the issue to the ward with a witness at the issuing end and the nurse's confirmation at the other; it keeps no running ward controlled register in this slice and says so.

### 5.5 Emergency carts (board 2.3)
Behind `pharmacyCarts`.
- **The cart list:** for each cart, the products it holds and the quantity each should hold (signed by the pharmacy in charge and the clinical lead of the unit). A cart is a location tied to the cart identifier `emergency_administrations` uses (P10). If that identifier is free text, Step 0 reports it and Step 1 proposes the mapping; no record is rewritten.
- **A cart check** (pharmacy with the unit's nurse in charge):
  - **Recorded uses since the last check,** as context: each emergency administration recorded against this cart (time, the resus episode reference, the medicine as recorded). **Not subtracted** (Law 4).
  - **Count**, blind, per product and batch, and each batch's expiry. The cart list quantity and the recorded uses are hidden until the count is committed.
  - **Restock:** cart quantity minus counted, from the issuing location's first-expiring unexpired batches, written as an issue with both legs.
  - **Short-dated items** (inside the cart look-ahead) are swapped by default, with the old batch returned to the issuer or quarantined.
  - **A difference** is a question for a person: used and not recorded · broken or discarded · moved to another cart · cannot explain, with a note. Each answer writes the movement EC-3 names, and is sent to the unit's nurse in charge. MedSync never decides which it was.
  - **Seal number** (if the site seals carts): recorded with the check.
  - Confirmed by the nurse in charge signing in with their second factor.
- **Carts overdue for a check** (past the signed check interval) are listed for the pharmacy in charge, amber with an icon.

### 5.6 Expiry, quarantine and write-off (board 2.6, expiry side)
Behind `pharmacyRecall`.
- **Expiring:** every batch at every location within the signed look-ahead, by location, with the first expiry, and a suggested action: issue first · move to where it will be used · return to supplier (if the supplier takes returns) · lend.
- **Expired:** every expired batch still at a location. **Move to quarantine** writes the two-leg movement into the quarantine location. An expired batch cannot be issued, supplied or transferred anywhere except quarantine (Law 7).
- **Quarantine page:** what is held, why (expired · damaged · recalled · rejected at receipt · returned not fit), since when.
- **Write off** (holders of `pharmacy.manage`, witnessed): a reason, and the entry in the **Expired or Spoiled Medicines Register** (EMHS Table 27; HMIS 088 in the NMS SOP), printed in its layout. Write-off writes `written_off` from quarantine.
- **Disposal** is done off-system under the hospital's procedure (board of survey, NDA-supervised destruction or the supplier's reverse logistics). MedSync records the reference and the date as a note on the write-off. It does not record or certify destruction.
- **Damaged** stock found anywhere goes to quarantine the same way, with its reason.

### 5.7 Recall (board 2.6)
Behind `pharmacyRecall`.
- **Start a recall:** batch number and product (or scan), the source of the notice (NDA, supplier, manufacturer, the hospital's own finding), the notice reference and date, the **class as stated in the notice** (A, B, C or "not stated": MedSync never assigns one), the level the notice names, and what the notice says to do (text).
- **What the trace shows:**
  1. **Received:** each receipt of the batch (delivery, supplier, date, quantity).
  2. **Supplied to patients:** every supply of the batch at a window: patient (two identifiers), date, quantity, location, and how they can be reached (app, phone on file, a guardian's phone, no phone on file). Exact.
  3. **Issued to wards and carts:** each issue, date and quantity.
  4. **Patients who may have received it:** inpatients on those wards who had that medicine charted in the RC-3 window, and patients given that medicine from a cart that held the batch (from `emergency_administrations`), each labelled with its source. Listed separately, in words: *"may have received it; the administration record does not name the batch"*. Never merged into list 2.
  5. **Still on shelves:** each location's balance of the batch.
  6. **Lent to other facilities:** each loan of the batch still outstanding, facility and quantity, with what to tell them.
  7. **Accounted for:** the RC-4 formula, every term shown, and any gap as a number to explain.
- **Quarantine everything:** one action moves every balance of the batch, at every location, into quarantine. It is witnessed for a controlled product. The batch has been blocked since the recall started (RC-1); this action moves what is still on shelves.
- **Tell the patients:** the PHI-free template (Appendix B), sent only by a person, only to patients in list 2 (and, if the CSO approves for this recall, list 4) with a number on file. Patients without one stay on the printed list for follow-up. Each send and each follow-up is recorded per patient (told · reached by phone · reached at a visit · could not reach).
- **Tell the wards:** each ward in list 3 gets a notice in its Ward stock page and on the nurse's workspace, naming the product and batch (staff-facing, inside MedSync).
- **Close the recall:** with the returned or destroyed quantity, the outcome per patient, and a **reconciliation print** in the shape the NDA guideline asks of the importer (quantities received, issued, returned, outstanding), for the hospital to give its supplier or the NDA on request. MedSync does not send it.
- **A recall of a product, not a batch** (all batches): the same trace across every batch of the product, grouped by batch.

### 5.8 Month end (board 2.5)
Behind `pharmacyMonthEnd`.
- **Per location and for the hospital,** for one calendar month:

  | Column | What it shows |
  |---|---|
  | Product | |
  | Opening | The closing figure of the last closed month, or the first count if none |
  | Received | |
  | Issued in | |
  | Supplied to patients | |
  | Issued out | |
  | Used on wards and carts | From counts, 5.4 and 5.5 |
  | Returned | |
  | Adjusted | With reasons |
  | Written off | |
  | Should be | |
  | Counted | The month-end count |
  | Difference | |
  | Explained | |

- **The month-end count** is a full blind count of the location (Phase 1 count, all products). Products not counted are listed: *"Not counted this month"*. The month cannot close while any product with a movement in the month is uncounted, unless the in-charge records a reason per product.
- **Differences** need a reason from the signed list, or are left **Unexplained**: carried to the next month's page, never absorbed into the opening figure.
- **Money** (only where a unit cost was recorded at receipt, D-PH2-14): each figure at the batch's recorded cost; products with no cost are counted and listed as *"No cost recorded"*, never estimated. The patient price from Phase 1 is never used as cost.
- **Close the month** (holders of `pharmacy.manage`, second approver through four-eyes): fixes every figure. Afterwards:
  - a movement whose `effective_at` falls in the closed month (a downtime back-entry, a late receipt) is shown in the **next open month** as *"Belongs to {month}, recorded {date}"*, and the closed month's report is unchanged;
  - re-opening a month is not possible (D-PH2-12).
- **Stock status report** (Section 6 of HMIS 105) for the tracer list: each tracer medicine's stock on hand at month end, days out of stock in the month (from the stock-out projection, Phase 1 SL-9, counted in whole days by the rule in 6.5), and any other column the national form asks for, in its column order, confirmed by the pharmacy in charge at Step 1. Until confirmed, the print says *"Columns not yet confirmed against this hospital's HMIS 105 form."* MedSync does not submit to DHIS2.
- **Quarterly tracer-medicine audit** (EMHS Table 3): per tracer medicine for the quarter, received, issued, supplied, adjusted, written off and counted, with differences, as a print for the in-charge.

### 5.9 The order proposal (board 2.4)
Behind `pharmacyOrdering`.
- **Set up once, signed** (Appendix D): the hospital's order cycle in months, its maximum stock in months (the manual's four months shown as reference), its minimum or emergency order point if it keeps one, the supplier per product group, and the budget source if it has one.
- **For one cycle,** per product (or per medicine, D-PH2-10):

  | Column | What it shows |
  |---|---|
  | VEN class | From the national list (P6), or *"Not classed"* |
  | Consumption in the review window | 6.5 |
  | Days out of stock | In the window |
  | Adjusted average monthly consumption | The manual's method, §3.3.1.1, with the arithmetic shown on the row |
  | Stock on hand | Store and dispensing points; wards and carts excluded, D-PH2-09 |
  | Maximum stock | Adjusted average monthly consumption × maximum months |
  | Proposed quantity | Maximum stock minus stock on hand, rounded **up** to whole packs of the chosen product, never negative |
  | Your quantity | Typed by the in-charge; required to save |
  | Reason | Where "your quantity" differs from the proposal |

- **Data warnings on the row,** amber with an icon:
  - not counted in the window;
  - less history than the signed minimum;
  - out of stock for more than the signed out-of-stock share of the window (the adjusted figure rests on few days);
  - a large unexplained month-end difference in the window.
- **When the budget is short** (prices known): the total against the budget, and **Trim in VEN order**: necessary lines first, then essential, vital last. Each cut is listed for the in-charge to confirm one by one; nothing is cut silently, and vital lines are never cut without a typed reason.
- **Outputs:**
  - **Print as HMIS 085** (the EMHS order form) and **as HMIS 084B** (the Bimonthly Order and Patient Report), each in its national column order, confirmed at Step 1;
  - **Copy the quantities** (plain text, product and quantity, for entering in the NMS portal);
  - **Print as a purchase list** for a private or PNFP supplier.
- **Save as an order:** an order record with lines and quantities, which deliveries (5.2) fill and which shows what is still owed. Saving sends nothing.
- **Emergency order:** the same screen for chosen products outside the cycle, labelled as an emergency order on the print.
- **The screen says:** *"MedSync does not send this order. A public hospital enters these quantities in the National Medical Stores portal."*

### 5.10 Orders and what is still owed
- A list of saved orders with supplier, cycle, lines, received so far, still owed, and status (open · part received · received · closed).
- An order line closes when received in full, or when the in-charge closes it with a reason (supplier out of stock · cancelled · substituted · other).

### 5.11 Scanning
- A USB scanner types like a keyboard. Every product, batch or recall field accepts a scan.
- If the scanned text parses as a GS1 element string, the system reads GTIN `(01)`, batch `(10)` and expiry `(17)`, prefills the batch and expiry, and finds the product by its GTIN (an optional field on the product, set by holders of `pharmacy.stock` the first time a GTIN is scanned for it).
- A scan that does not parse is treated as typed text.
- Nothing requires a scan. How many products on the Ugandan market carry a GS1 code was not established; Step 0 counts how many of the pilot site's products scan.

### 5.12 Going live, per location
- A **store**, **ward** or **cart** goes live with its own conditions, on the Phase 1 go-live page, with a second approver:
  - its products set up;
  - an opening count recorded, blind, of every product it holds;
  - its levels or cart list signed, for a ward or cart;
  - its in-charge named;
  - its people briefed;
  - for the store, a downtime drill that includes a delivery and an issue on paper.
- Until a location is live, movements to or from it are refused, and the Phase 1 dispensing points work as before.
- **Month end** goes live per hospital after one full month in which every live location was counted at its start and end.
- **Ordering** goes live after one cycle's proposal was checked against the in-charge's own paper calculation, and every difference was explained in writing (the done-when condition).

### 5.13 Where this prompt departs from the roadmap and the preview boards
- **Ward consumption is counted, not computed from doses.** The roadmap says ward doses "draw on" ward stock, and board 2.2 shows "On the ward now = last top-up less doses charted". That needs a dose-to-unit conversion, which Law 4 forbids. Charted doses are context; counts decide (5.4).
- **Cart reconciliation is counted, not computed from emergency records.** Board 2.3 shows "should be left = list − used". The emergency record holds a dose, not issue units, so recorded uses are context (5.5).
- **The recall keeps two patient lists:** exact and "may have received it". Board 2.6 merges ward patients into one table.
- **The order is per product pack, rounded up, never negative,** and the stock on hand excludes ward and cart stock (D-PH2-09).
- **Money reports use cost recorded at receipt only.** Board 2.5 implies a cost the system does not have.
- **A closed month never re-opens.** Late entries land in the next month, labelled.
- **No figure on any board is a signed value.**

---

## 6. Engines (pure, no I/O unless stated; every rule has an ID and at least one test)

### 6.1 Locations (`lib/pharmacy/locations.ts`)
- **LC-1** A stock location has a kind (`store`, `dispensing_point`, `ward`, `cart`, `quarantine`), a hub unit, a live state, an in-charge and settings. Phase 1's dispensing points become rows of kind `dispensing_point` with no behaviour change; a test replays every Phase 1 scenario against the migrated rows.
- **LC-2** `external` is a counterparty, not a location: a named facility or supplier that stock leaves to or arrives from. It has no balance in this hospital's ledger; loans to and from it are a projection (IS-7).
- **LC-3** Which movements each kind may take (the enumeration test asserts this table; "pair" kinds are SL-12's):

  | Movement | store | dispensing_point | ward (stocked) | ward (issue-only) | cart | quarantine |
  |---|---|---|---|---|---|---|
  | `received` (from a supplier) | yes | yes, if it receives directly | no | no | no | yes, rejected at receipt (RG-3) |
  | `issued` / `received_from_issue` | out and in | out and in | in only | in only | in only | no |
  | `returned_out` / `returned_in` | in | out and in | out | no | out | no |
  | `lent` / `borrowed` / `loan_returned_out` / `loan_returned_in` | yes | yes | no | no | no | no |
  | `supplied`, `reversed` | no | yes | no | no | no | no |
  | `ward_used` | no | no | yes | no | no | no |
  | `cart_used` | no | no | no | no | yes | no |
  | `quarantined_out` / `quarantined_in` | out | out | out | no | out | in |
  | `written_off`, `returned_to_supplier` | no | no | no | no | no | yes |
  | `adjusted`, `counted`, `count_correction` | yes | yes | `adjusted` and `counted` only (WS-3) | no | `adjusted` and `counted` only (EC-3) | `counted`, `count_correction` |
  | `transfer_out` / `transfer_in` (Phase 1) | yes | yes | no | no | no | no |

- **LC-4** An **issue-only ward** (D-PH2-05) receives issues and is never counted; its receipts are consumption (CN-1). It needs no go-live of its own beyond being named.
- **LC-5** Issues between store, dispensing points and quarantine, and Phase 1 transfers, are **internal transfers**: one rule covers both pairs, and neither is consumption. New code writes the issue pair; Phase 1's transfer pair stays valid and is read by the same rule.

### 6.2 The ledger, extended (`lib/pharmacy/stock/**`)
- **SL-12** New movement kinds, all append-only under the same trigger:
  - `issued` and `received_from_issue` (a pair);
  - `returned_out` and `returned_in` (a pair);
  - `lent` and `borrowed` (to or from `external`), and `loan_returned_out` and `loan_returned_in`, each linked to the loan it settles;
  - `ward_used`, `cart_used`;
  - `quarantined_out` and `quarantined_in` (a pair);
  - `written_off`;
  - `returned_to_supplier`.
- **SL-13** Every paired kind writes both legs in one transaction with a shared pair id; a property test finds no pair with one leg.
- **SL-14** A batch blocked by expiry (SL-5), quarantine or an open recall cannot take an out-movement except into quarantine or `returned_to_supplier`. Checked under the batch row lock. Phase 1's hand-over check and availability (AV) treat a blocked batch as unavailable. **Downtime back-entry is the one exception**, as for SL-4: the supply is recorded, flagged for look-back with *"Batch was recalled or quarantined"*, and the patient is added to the open recall's list 2.
- **SL-15** A `ward_used` or `cart_used` movement is written only by a count (WS-3, EC-3), never by any other action. A ward or cart count writes `ward_used` or `cart_used` **instead of** Phase 1's `count_correction`, never both.
- **SL-18** Every movement names its batch (Phase 1 Law 3). Where a ward counts one figure per product (D-PH2-07), the use is **allocated** across the ward's batches first-expiry-first by the signed allocation rule, each allocated movement marked `allocated`, and every recall view of that ward says *"allocated, not counted"*. Controlled products are always counted per batch.
- **SL-16** A movement's `effective_at` may be earlier than `recorded_at` only for downtime back-entry and late-confirmed receipts. A movement whose `effective_at` falls in a closed period is accepted and attributed to the next open period by MR-5; nothing in a closed period's snapshot changes.
- **SL-17** Unit cost (optional) is recorded on the `received` movement of a batch and inherited by every movement of that batch. It is never edited; a mistyped cost is corrected by a `cost_corrected` event naming the old and new value, the actor and a reason, and only while the period of the receipt is open.

### 6.3 Receiving (`lib/pharmacy/receiving.ts`)
- **RG-1** A delivery has states: `counting`, `received`, `abandoned` (with reason). Only `received` moves stock.
- **RG-2** Each line's result is computed from note, counted, order and expiry by a pure function, with the full result set in 5.2. Several results may apply to one line.
- **RG-3** Each line records **counted and accepted** and **counted and rejected**. Accepted enters stock at the receiving location as `received`. Rejected but kept on site enters quarantine directly as `received`, with its reason (damaged, wrong product, expired, rejected short-dated). Rejected and sent back with the deliverer writes no stock and appears only on HMIS 087. A wrong-product line is never received under the product on the note: it is received, if at all, as the product actually delivered. A counted zero writes nothing.
- **RG-4** Expired on arrival: never usable stock; rejected under RG-3 and reported. Short-dated (inside the expiry look-ahead): needs a recorded decision.
- **RG-5** The discrepancy report and the goods received note are projections of the closed delivery.
- **RG-6** A delivery's lines link to order lines when an order is named; RG-6 updates "still owed" by projection, never by editing the order.

### 6.4 Issues, requisitions, returns, loans (`lib/pharmacy/issue.ts`)
- **IS-1** A requisition has states: `raised`, `issued`, `part_issued`, `refused` (with reason), `withdrawn`, `confirmed`, `confirmed_with_difference`.
- **IS-2** Issue writes SL-12 pairs per batch, first expiry first, under locks, never taking a batch below zero.
- **IS-3** Receipt confirmation at the other end is a separate event by a person authenticated at that location. A difference writes an `adjusted` movement at the receiving location with a reason and links both in-charges. For a controlled line it writes a witnessed Phase 1 controlled difference as well, listed for the pharmacy in charge.
- **IS-4** An unconfirmed issue older than the signed confirmation window is listed for both in-charges.
- **IS-5** Returns write SL-12 pairs to the issuer; "not fit" routes to quarantine instead.
- **IS-6** A controlled line is issued only with a witness at the issuing end (Phase 1 CD-2) and confirmed by a nurse or pharmacy staff member with a second factor at the receiving end.
- **IS-7** Loans: `lent` and `borrowed` per external facility; the outstanding balance per facility and product is a projection; a return is `loan_returned_in` or `loan_returned_out`, linked to the loan, and never opens a new loan. Borrowed stock goes through RG-2 to RG-4 (expired refused, batch and expiry conflict refused, short-dated decision) before it enters stock. Controlled products are not lent or borrowed in this slice.

### 6.5 Consumption and stock-out days (`lib/pharmacy/consumption.ts`)
- **CN-1** **Hospital consumption** of a product in a period is the sum of quantities that left pharmacy custody to patients or to use:
  - `supplied` minus `reversed` at dispensing points;
  - plus `ward_used` and `cart_used`;
  - plus `received_from_issue` at an **issue-only ward** (LC-4), as on paper;
  - minus returns from issue-only wards.

  Internal transfers (LC-5), quarantine moves and loans are **not** consumption. Write-offs, losses and count corrections are reported as losses, apart from consumption. D-PH2-08 signs this definition.
- **CN-2** **Location consumption** is the same at one location, for the location's own pages.
- **CN-3** **Days out of stock** for a medicine in a period at hospital level are whole local days on which its **unexpired, unblocked** total across store and dispensing points was zero at the end of the day. This needs a new hospital-level projection over those balances; a test proves it equals Phase 1's SL-9 at a hospital with one point and no store. The day rule (end of day, or any part of the day) is signed (D-PH2-11).
- **CN-4** **Adjusted average monthly consumption** follows EMHS 2023 §3.3.1.1: consumption over the review window ÷ days in stock in the window × the window's days, expressed per month (a month is the review window's days divided by its whole months). If days in stock is zero, there is no figure and the row says so. The engine returns the inputs and each step so the screen can show the arithmetic.
- **CN-5** History shorter than the signed minimum history gives a figure flagged *"Short history"*. Nothing is extrapolated beyond the manual's method.

### 6.6 The order calculation (`lib/pharmacy/order.ts`)
- **OQ-1** Maximum stock = adjusted average monthly consumption × the hospital's signed maximum months (EMHS §4.1.1.2 as reference). There are no product groups in this slice.
- **OQ-2** Proposed quantity = maximum stock − stock on hand (EMHS §4.1.1.3), where stock on hand is the unexpired, unblocked balance across store and dispensing points at the proposal's cut time (D-PH2-09). If negative, zero.
- **OQ-3** Issue units → packs: the proposed quantity in issue units is divided by the chosen product's pack size, which must be stored as a whole number of issue units, and rounded **up** to a whole pack. A product whose pack size is not so stored is not rounded, and its row is flagged. This is the only arithmetic between units in the slice, and it never crosses products, strengths or forms (Law 4 is about doses and units; a pack is a count of the same unit).
- **OQ-4** An emergency order point, if signed, flags products whose months of stock fall below it; nothing is ordered automatically.
- **OQ-5** VEN trimming removes or reduces lines in the order necessary, then essential, then vital, until the budget is met; it returns a list of proposed cuts, each needing confirmation. Vital cuts require a typed reason. Products not classed are treated as the in-charge chooses at signing (D-PH2-13); they are never silently treated as necessary.
- **OQ-6** Every output row carries its inputs, its formula in words and the parameter versions, and these print as an appendix with the order.
- **OQ-7** Property tests:
  - the proposal never exceeds maximum stock plus one pack less one issue unit;
  - is never negative;
  - is unchanged by transfers between pharmacy locations;
  - grows when consumption grows with stock fixed;
  - equals a hand calculation on three fixture products.

### 6.7 Month end (`lib/pharmacy/month-end.ts`)
- **MR-1** `reconcile(location | hospital, month)` returns per product the columns of 5.8 from the ledger. "Should be" = opening + every in − every out, **excluding the movements written by the month-end count itself**; earlier corrections in the month appear under Adjusted with their reasons. Difference = counted − the ledger balance just before the month-end count. A test: a 30-unit shortfall found at month end shows 30 under Difference, not under Adjusted. At hospital level, internal transfers (LC-5) cancel out and are not shown as received.
- **MR-2** Opening is the previous closed month's counted figure (the stock carried is the count, not "should be"); an unexplained difference is carried as a line on the next month, never as a change to opening.
- **MR-3** A month closes only when every product with a movement was counted within the signed month-end count window, or carries a recorded reason; every difference has a reason or is marked unexplained; and a second approver signs.
- **MR-4** Closing writes an immutable snapshot of every figure and every report printed from it.
- **MR-5** A movement recorded after close with `effective_at` in the closed month is attributed to the first open month and labelled with its true month on every report.
- **MR-6** Closed months print from their snapshots. An open month prints live, with *"Month not closed. Figures may change."* on every page. Stock on hand in HMIS 105 Section 6 covers the locations in the signed report-location set (by default D-PH2-09's: store and dispensing points).

### 6.8 Ward stock and carts (`lib/pharmacy/ward-stock.ts`, `lib/pharmacy/carts.ts`)
- **WS-1** Suggested top-up = ward level − last count, only when the last count is within Phase 1's count freshness setting for the ward; otherwise none. It is shown only after a count is committed, never on the count screen.
- **WS-2** "Doses charted since the last count" is a count of charted administrations of that medicine on that ward from the administration record's read, displayed and never used in arithmetic. A test proves no stock figure depends on it.
- **WS-3** Use since the last count = the ward's ledger balance just before the count (the sum of every movement at the ward, receipt differences included) − the counted figure. A positive use writes `ward_used`; a negative one writes no `ward_used` but an `adjusted` movement with the reason the counter chose, and is listed. No `count_correction` is written (SL-15). Property test: after any ward count, the ward's balance equals its count.
- **EC-1** Restock = cart list quantity − counted, never negative, issued first expiry first from the restocking location.
- **EC-2** Recorded uses since the last check are read from `emergency_administrations` for that cart and shown; never used in arithmetic (test).
- **EC-3** A cart check's gap = the cart's ledger balance just before the count − counted. The explanation decides the movement:
  - used, not recorded → `cart_used`;
  - broken or discarded → an `adjusted` loss;
  - moved to another cart → a two-leg issue to the named cart, which is then counted;
  - cannot explain → an `adjusted` loss, flagged for the pharmacy in charge.

  A gap with recorded uses that the person accepts as explaining it is `cart_used`. A negative gap is handled as in WS-3. The check also records the seal number and the confirmer.
- **EC-4** Short-dated items inside the cart look-ahead are swapped by default.

### 6.9 Expiry and recall (`lib/pharmacy/expiry.ts`, `lib/pharmacy/recall.ts`)
- **EX-1** Expiring = unexpired batches with expiry inside the signed look-ahead, per location. Expired as Phase 1 SL-5.
- **EX-2** Write-off is only from quarantine, needs `pharmacy.manage`, a reason, a register entry and a witness; it prints the register entry.
- **RC-1** A recall names a batch (or all batches of a product), its source, notice reference, stated class, level and instructions. It blocks the batch at once (SL-14). A batch is matched on the product and on its current number **and every earlier number** recorded by Phase 1 `batch_corrected` events.
- **RC-2** List 2 (supplied) is every `supplied` movement of the batch net of reversals, with the supply's patient, exactly.
- **RC-3** List 4 (may have received) is computed only from wards that received the batch: inpatients with an administration of the same medicine charted on that ward between the first `received_from_issue` of the batch and the earliest of the batch's ward balance reaching zero by count, its quarantine, or the recall's start. Patients given the medicine from a cart that held the batch, between its first restock into the cart and its removal, are added with the label "from a cart". It never includes a patient already in list 2 for the same batch, and it is labelled on every view and print. For a ward whose use is allocated (SL-18), the window ends only at quarantine or the recall's start.
- **RC-4** Accounted for = external in (`received` + `borrowed` + `loan_returned_in`) − [supplied net of reversals + `ward_used` + `cart_used` + `written_off` + `returned_to_supplier` + `lent` + `loan_returned_out` + net `adjusted` and `count_correction`] − the batch's balance summed over every location, quarantine included. Internal transfers cancel. One formula for 5.7 and the reconciliation print; any non-zero gap is shown as a number.
- **RC-5** Each patient's recall status is an event list (told by message · reached by phone · reached at a visit · could not reach), recorded by a person.
- **RC-6** Closing a recall records returned and destroyed quantities and produces the reconciliation print; an open recall stays listed.

### 6.10 Scanning (`lib/pharmacy/scan.ts`)
- **SC-1** A pure parser for GS1 element strings from a keyboard wedge: AIs `01` (14 digits), `10` (variable, ended by the group separator or end of input), `17` (YYMMDD; day `00` means the end of that month), and `21` ignored. It accepts the group separator as ASCII 29 or as the scanner's configured substitute (Step 0 checks the pilot site's scanner).
- **SC-2** A parse failure returns the raw text. Unit tests cover every AI order, missing separators at the end, `00` days and invalid dates.
- **SC-3** A GTIN maps to at most one active product per hospital.

### 6.11 Readiness (`lib/pharmacy/readiness-stores.ts`)
- **GL2-1** Per location kind, the conditions in 5.12, each with its state and evidence, computed from records. Switching on and off reuse Phase 1's two-person go-live mechanism.

---

## 7. Data changes (only what GATE A approves; additive; numbers from the ledger)

Claim a block in `docs/NUMBERS.md` before writing any migration or ADR: 25 migration numbers and 15 ADR numbers above the highest on `main` and on every open branch. Names are proposals; follow the repo's naming.

**Locations**
- `pharmacy_locations` (hospital, kind, hub unit, live state and times, in-charge, settings), with Phase 1's dispensing points migrated into it and `pharmacy_product_points` generalised to locations.
- `pharmacy_counterparties` (suppliers and external facilities: name, kind, optional code).

**Ledger**
- New movement kinds and a `pair_id` on `pharmacy_stock_movements`; `unit_cost` on `received` movements; `pharmacy_cost_corrections`. Triggers extended; no existing row touched.

**Receiving and orders**
- `pharmacy_deliveries`, `pharmacy_delivery_lines` (note quantity, counted quantity, batch, expiry, cost, results, short-dated decision).
- `pharmacy_orders`, `pharmacy_order_lines` (proposal inputs snapshot, proposed, chosen, reason, cuts).
- `pharmacy_order_parameters` (signed, versioned).

**Issues**
- `pharmacy_requisitions`, `pharmacy_requisition_lines`, `pharmacy_issue_confirmations`.

**Wards and carts**
- `pharmacy_ward_levels` (signed, versioned).
- `pharmacy_cart_lists` (signed, versioned).
- `pharmacy_cart_checks` (seal number, explanations, confirmer).
- The cart identifier mapping, if P10 needs one.

**Expiry, write-off, recall**
- `pharmacy_quarantine_reasons` (on the movement).
- `pharmacy_write_offs` (register entry number, reason, witness, disposal note).
- `pharmacy_recalls`, `pharmacy_recall_patients`, `pharmacy_recall_events`.

**Month end**
- `pharmacy_periods` (location or hospital, month, state, closed by, approver).
- `pharmacy_period_snapshots` (immutable).
- `pharmacy_period_difference_reasons`.

**Products**
- `gtin` (optional, unique per hospital) on `pharmacy_products`.

**Signed sets** (through the signed-reference mechanism, per hospital, versioned, Appendix D):
- the order parameters;
- the tracer list;
- the receiving, cart and expiry look-aheads;
- the month-end count window and the data-warning thresholds;
- the per-product allocation rule;
- the confirmation window;
- every reason list in Appendix D;
- the HMIS column maps;
- the recall patient template.

**No change** to prescriptions, the administration record, `emergency_administrations` or any clinical table. The administration record and the emergency record are **read** through server functions only.

**RLS probes:**

| Actor | Access |
|---|---|
| Pharmacy staff, same hospital, with the permission the action needs | As Section 8 allows |
| Ward nurse in charge (hub assignment) | Their ward's ward stock page, its requisitions, counts and recall notices; raise requisitions and record ward counts; confirm receipt. No other location, no patient list of a recall |
| Any nurse on that ward | Read their ward's stock page and notices; confirm receipt if the site allows (D-PH2-04) |
| Unit nurse in charge (hub assignment) | Their unit's carts: read lists and checks; confirm a check |
| Unit clinical lead | Their carts' lists and checks: read; confirm a check |
| Prescriber | Nothing new |
| Patient | Nothing new; recall messages arrive through the existing channel |
| Hospital admin | Location go-live pages and settings; no movements, no PHI |
| Lab staff, reception, other hospitals, superadmin without break-glass, anonymous | Denied |
| Any client, direct INSERT, UPDATE or DELETE | Denied everywhere |
| Any actor, UPDATE or DELETE on movements, snapshots, recall events, write-offs, confirmations | Denied, including the service-role path |

---

## 8. Server actions

All follow the house contract: Zod with a client key → `getUser()` → AAL2 → permission → hospital and location scope → one transaction → PII-redacted log → audit → typed result `{ id, serverTime }`.

| Action | Permission | Notes |
|---|---|---|
| `startDelivery`, `saveDeliveryLine`, `receiveDelivery`, `abandonDelivery` | `pharmacy.store` | `receiveDelivery` writes all `received` movements in one transaction |
| `printDiscrepancyReport`, `printGrn` | `pharmacy.store` | Logged prints |
| `raiseRequisition` | `pharmacy.store`, or ward in-charge | |
| `issueRequisition`, `refuseRequisitionLine` | `pharmacy.store` or `pharmacy.dispense` at the issuing location | IS-2; IS-6 for controlled |
| `confirmIssueReceipt` | A person at the receiving location, AAL2 | IS-3 |
| `returnStock` | At the returning location | IS-5 |
| `lendStock`, `borrowStock`, `closeLoan` | `pharmacy.manage` | IS-7 |
| `setWardLevels`, `setCartList` | `pharmacy.manage` with the ward or unit lead | Two signatures |
| `recordCount` (any location) | `pharmacy.stock`, or ward in-charge for a ward, or a cart check pair | Blind; WS-3, EC-3 |
| `recordCartCheck` | `pharmacy.stock` + unit nurse in charge confirmation | EC-1 to EC-4 |
| `moveToQuarantine` | `pharmacy.stock` | Witnessed for controlled |
| `writeOff` | `pharmacy.manage`, witnessed | EX-2 |
| `returnToSupplier` | `pharmacy.manage` | |
| `startRecall`, `quarantineRecall`, `recordRecallContact`, `sendRecallMessage`, `closeRecall` | `pharmacy.manage`; contacts by `pharmacy.stock` | RC-1 to RC-6 |
| `closeMonth` | `pharmacy.manage` + second approver | MR-3, MR-4 |
| `recordDifferenceReason` | `pharmacy.stock` | |
| `saveOrderProposal`, `confirmCut`, `saveOrder`, `closeOrderLine` | `pharmacy.manage` | OQ-1 to OQ-6 |
| `setGtin` | `pharmacy.stock` | SC-3 |
| `switchLocationOn`, `switchLocationOff` | Phase 1 go-live mechanism | GL2-1 |

**Further actions** (an action not listed does not exist):

| Action | Permission |
|---|---|
| `createLocation`, `setLocationInCharge`, `setWardSupplyModel` | `pharmacy.manage`, with the hub assignment for wards and carts |
| `saveCounterparty` (suppliers, external facilities) | `pharmacy.manage` |
| `saveSignedPack`, `signPack` (each Appendix D pack) | The signers Appendix D names, each with a fresh second factor |
| `correctCost` | `pharmacy.manage`, while the receipt's period is open (SL-17) |
| `recordShortDatedDecision` | `pharmacy.store` |
| `withdrawRequisition` | Whoever raised it, before issue |
| `recordDisposalReference` | `pharmacy.manage` |
| `postWardRecallNotice` | `pharmacy.manage` (written by `startRecall`; shown to the ward) |
| `recordRecallOutcome` (returned and destroyed quantities) | `pharmacy.manage` |
| `recordPaperOrderComparison` | `pharmacy.manage` (the ordering go-live condition) |
| `printVoucher`, `printRegisterEntry`, `printStockStatus`, `printTracerAudit`, `printOrder` (085, 084B, purchase list), `printRecallList`, `printRecallReconciliation`, `printLoanRecord` | The permission of the record printed; every print logged |

**Controlled products.** Any action above on a controlled product needs its own permission **and** `pharmacy.controlled` **and** a witness (Phase 1 CD-5), whoever holds `pharmacy.store` or `pharmacy.stock`.

**Cells clarified.** `returnStock`: `pharmacy.stock` at a pharmacy location, or the ward or cart in-charge right at a ward or cart. `confirmIssueReceipt`: `pharmacy.stock` at a pharmacy location, or the ward receipt right (Appendix A) at a ward. `recordCount` at a cart and `recordCartCheck`: `pharmacy.stock` plus the unit nurse in charge's confirmation right.

A test enumerates every action and proves none writes to a prescription, the administration record or `emergency_administrations`.

---

## 9. Steps and gates

**Three merges.** Steps 0 to 4 are the first merge (the store). Steps 5 to 7 are the second (wards, carts, expiry and recall). Steps 8 to 10 are the third (month end, ordering, scanning, going live). Between merges the slice runs at the test hospital only.

### Step 0: Discovery and baseline (no product changes)
- **Q1** Has `feat/pharmacy-dispensing` merged its first and second merges? Is its third (Step 9) merged or deferred? Verify P1 to P9. **If the first two are not merged, STOP.**
- **Q2** Read P10: what identifies a cart on `emergency_administrations`, and every distinct value at the test hospital.
- **Q3** Read P11: what one charted administration stores (medicine, product, dose, quantity, unit, batch). Report exactly. This decides D-PH2-06.
- **Q4** Read P12: whether the hub names a ward nurse in charge, and how.
- **Q5** Read EMHS 2023 Chapters 8, 18 and 19, and the national HMIS 085, HMIS 084B, HMIS 087, HMIS 088 and HMIS 105 Section 6 layouts, from copies the pharmacy in charge provides. Report each layout's columns.
- **Q6** The pilot site's practice:
  - how wards are supplied (P13, D-PH-05);
  - which carts exist and how often they are checked;
  - who receives deliveries;
  - the order cycle with its supplier;
  - whether costs appear on its delivery notes;
  - whether it keeps one store or several;
  - which scanner it uses and how many of its products carry a GS1 code.
- **Q7** Whether the lab has its own stock or lot ledger on the branch, and how it differs.
- **Q8** Baselines: a timed paper receipt of one real delivery (with the pharmacy in charge), a ward requisition on paper, a cart check on paper, the last month's stock status report as filed, the last order as calculated on paper.
- **Q9** Check that Playwright, axe, the visual harness, the fake clock and the RLS probe harness work. If not, STOP and flag.

**STOP 0.** Report Q1 to Q9 and the baselines.

### Step 1: GATE A proposal (documents only)
Write `docs/pharmacy/phase-2/gate-a-proposal.md`:
- the location model and the Phase 1 migration (LC-1);
- the movement kinds and the consumption definition (CN-1) with worked examples;
- the order method (6.6) with a worked example from Q8's real order;
- the month-end rules (6.7);
- the recall's two lists (6.9);
- the ward and cart decision from Q3 (D-PH2-06);
- the HMIS column maps from Q5;
- the permission map, version 3 (Appendix A);
- every reason list and parameter (Appendix D) as unsigned packs;
- every string (Appendix B) as `draft`;
- the hazard log (Appendix C);
- annotated wireframes from the preview boards, corrected per 5.13;
- the decision table (Section 14) with a signature block;
- the ADR drafts (Section 16).

**STOP 1.** Nothing proceeds without signatures from Fadhul, the pharmacist reviewer and the pilot site's pharmacy in charge.

### Step 2: Data layer
Migrations from Section 7, the Phase 1 location migration, triggers, RLS and the probe table. Scenarios:
- **S1** Every Phase 1 test passes unchanged after the location migration.
- **S2** Every RLS probe row holds.
- **S3** No UPDATE or DELETE succeeds on any immutable table, including through the service role.

**STOP 2.**

### Step 3: Engines (pure, no UI)
LC, SL-12 to SL-17, RG, IS, CN, OQ, MR, WS, EC, EX, RC, SC, GL2, each with tests. Scenarios:
- **S4** The SL-13 property test finds no movement with only one leg.
- **S5** The OQ-7 properties hold, and the order matches the hand calculation for three products.
- **S6** CN-4 matches the manual's worked method on a fixture with stock-out days.
- **S7** WS-2 and EC-2 prove no stock figure depends on charted doses or emergency records.
- **S8** RC-3 never lists a list-2 patient again, and is empty when no ward received the batch.
- **S9** MR-5 attributes a back-dated movement to the next open month and leaves the snapshot unchanged.
- **S10** SC-1 parses every fixture string.

**STOP 3.**

### Step 4: The store (behind `pharmacyStore`). First merge.
5.2, 5.3 (store and dispensing-point issues, returns, loans) and store counts. Scenarios:
- **S11** A 20-line delivery with two discrepancies enters stock at counted quantities and prints HMIS 087 and the GRN.
- **S12** An expired line on delivery cannot enter stock.
- **S13** A short-dated line needs a decision.
- **S14** An issue from store to point writes both legs; the point confirms; a difference is recorded at the point.
- **S15** A controlled receipt and issue need their witness.
- **S16** A loan to another facility stays listed until returned.
- **S17** The store goes live only with its conditions and a second approver.
- **S17a** With `pharmacyStore` on, Phase 1's Receive stock "from Main store" is refused.
- **S17b** A damaged line at receipt goes to quarantine, never to the shelf.

**STOP 4.** Report scenarios, the timed receipt against the baseline, and screenshots.

### Step 5: Ward stock (behind `pharmacyWardStock`)
5.4, ward requisitions and confirmations. Scenarios:
- **S18** A ward with a stale count shows "Count the ward first" and no top-up.
- **S19** A ward count writes `ward_used` and the hospital's consumption includes it.
- **S20** A ward count higher than possible writes no `ward_used` and is listed.
- **S20a** 10 issued, 8 confirmed (−2 adjusted), next count shows no further use: `ward_used` is 0, not 2.
- **S20b** No balance-derived figure renders on any count screen before the count is committed.
- **S21** A nurse in charge sees only their ward.
- **S22** Doses charted are shown and never subtracted.
- **S23** A controlled issue to a ward needs the witness and the nurse's confirmation.

**STOP 5.**

### Step 6: Emergency carts (behind `pharmacyCarts`)
5.5. Scenarios:
- **S24** A cart restocked to 10 at its last check is counted at 7: `cart_used` of 3 is written from the count. The three uses recorded on the resus desk are shown beside it as context, and no figure is computed from them. Where the person finds the count unexpected, they choose an explanation (EC-2, EC-3).
- **S25** Restock takes first-expiring stock and swaps short-dated items.
- **S26** An overdue cart is listed.
- **S27** The resus desk's actions are untouched (a test enumerates them).

**STOP 6.**

### Step 7: Expiry, quarantine, write-off and recall (behind `pharmacyRecall`). Second merge.
5.6, 5.7. Scenarios:
- **S28** An expired batch cannot be issued or supplied anywhere.
- **S29** Quarantine-all moves every balance of a recalled batch in one action.
- **S30** The recall lists window patients exactly and ward patients separately.
- **S31** The accounted-for check is zero on the fixture.
- **S32** The recall message passes the banned-term scan.
- **S33** A write-off prints its register entry and is witnessed.
- **S33a** With `pharmacyRecall` on, a negative adjustment for "damaged" is refused and routed to quarantine.
- **S33b** A live hand-over of a recalled batch is refused; a downtime back-entry of it is recorded, flagged for look-back and added to the recall's list 2.
- **S33c** A batch recorded under an earlier number (before a `batch_corrected` event) is found by the recall.

**STOP 7.**

### Step 8: Month end (behind `pharmacyMonthEnd`)
5.8, 6.7. Scenarios:
- **S34** A month with an uncounted moved product cannot close without a reason.
- **S35** An unexplained difference carries to the next month.
- **S36** A downtime entry back-dated into a closed month appears in the next month labelled, and the closed report prints identically.
- **S37** HMIS 105 Section 6 prints in the confirmed column order with days out of stock from events.
- **S38** Money figures appear only for batches with a recorded cost.

**STOP 8.** Report a full test month at the test hospital against the hand reconciliation.

### Step 9: The order (behind `pharmacyOrdering`)
5.9, 5.10. Scenarios:
- **S39** The proposal for the fixture cycle equals the hand calculation; each row's arithmetic is shown.
- **S40** VEN trimming proposes cuts in order and cuts nothing without confirmation; a vital cut needs a reason.
- **S41** HMIS 085 and HMIS 084B print in their confirmed layouts.
- **S42** A saved order is filled by a delivery, and "still owed" updates.
- **S43** Nothing is sent anywhere (a network-assertion test).

**STOP 9.** Report the pilot site's real cycle compared with the in-charge's paper calculation, line by line.

### Step 10: Scanning, going live, hardening. Third merge.
5.11, 5.12; then:
- axe on every new route at 1440, 1024 and 390;
- the red and no-green tests;
- the budgets;
- the harness plans;
- the Pharmacy Handbook sections for stores, wards, carts, month end and orders;
- ADRs;
- the final report.

Scenarios:
- **S44** A GS1 scan prefills the product, batch and expiry at receipt.
- **S45** A non-GS1 scan falls back to text.
- **S46** Each location kind goes live only with its conditions.
- **S47** Month end and ordering go live only after their proving month and cycle.

**STOP 10.** Report Section 13 and the Definition of Done.

---

## 10. Accessibility
- WCAG 2.2 AA at 1440, 1280, 1024 and 390. The ward stock page and the cart check work on a 834 px tablet and at 390, with 44 px targets.
- Tables are real tables with headers; a reconciliation row reads as a sentence to a screen reader ("Ceftriaxone injection 1 g: should be 260, counted 230, 30 fewer, not explained").
- Every difference, block and warning carries an icon and words, never colour alone.
- Arithmetic disclosures are buttons that expand in place, announced.

## 11. Budgets
As Section 4, plus:
- Added JS for the Store group under 80 KB gzipped.
- The order proposal and month-end views stream the table and do not block on totals.

## 12. Security, privacy, audit
- Every movement, print, recall contact and period close is audited.
- The recall patient list is pharmacy-only, printed with a log entry, and never exported as a file. No identifiers leave MedSync on any HMIS or order print.
- Nurses and unit leads see only their own ward or cart.
- Reads of the administration record and the emergency record for context go through server functions returning counts and times, never doses or patient names, except for list 4 of a recall, which returns two identifiers per patient to pharmacy staff only and is logged.

## 13. Numbers to report at the final STOP

| Metric | Baseline | Target | Result |
|---|---|---|---|
| Paper tally needed for the monthly stock status report | Step 0 | 0 | |
| Locations live by kind | None | Report | |
| Movements with one leg | None | 0 | |
| Balances differing from their ledger | None | 0 | |
| Issues of expired, quarantined or recalled batches | None | 0 | |
| Rows changed in a closed period | None | 0 | |
| Stock figures computed from doses | None | 0 | |
| Receipt of a 20-line delivery, minutes | Step 0 | Report | |
| Order lines differing from the paper calculation, explained | Step 9 | All explained | |
| Recall trace time | None | < 2 s | |
| Patients in recall list 2 for the fixture batch found by hand and not by MedSync | None | 0 | |
| axe serious or critical | Step 0 | 0 | |
| Red added | None | 0 | |

## 14. GATE A decisions (Fadhul owns; recommendations given)

| # | Decision | Recommendation |
|---|---|---|
| D-PH2-01 | What a location is | One table of kinds: store, dispensing point, ward, cart, quarantine; Phase 1 points migrated into it |
| D-PH2-02 | The permission map, version 3 | Appendix A: a new `pharmacy.store`; ward in-charge rights by hub assignment; no new cadre |
| D-PH2-03 | Store staff who are not pharmacy professionals | No row until the onboarding cadre decision is made (as roadmap D-PH-10 for interns) |
| D-PH2-04 | Who confirms receipt on a ward | The ward's nurse in charge; any nurse on the ward if the site allows |
| D-PH2-05 | Ward supply model (roadmap D-PH-05) | Per ward: **stocked** (counted ward stock), **issue-only** (receives issues that count as use, as on paper), individual supply (Phase 1 setting), or a mix. The pilot site's practice decides; nothing defaults |
| D-PH2-06 | Ward and cart consumption | **Counted, not computed from doses.** Charted doses and emergency records are context only. Revisit only if the administration record stores issue units with a product (Q3) and the CSO signs it |
| D-PH2-07 | Batches on the ward | Per batch where the ward keeps batches apart, and always for controlled products. Otherwise one figure per product, with use allocated first-expiry-first by a signed rule and labelled "allocated, not counted" in every recall view |
| D-PH2-08 | The consumption definition | CN-1 |
| D-PH2-09 | Stock on hand for the order | Store and dispensing points only; ward and cart stock is consumption once used, and is excluded as on hand |
| D-PH2-10 | Order by product or medicine | By medicine, adding only products with the same issue unit ("Different units, not added" otherwise, shown per product); the chosen product's pack for rounding |
| D-PH2-11 | A day out of stock | Zero at the end of the local day, across store and dispensing points |
| D-PH2-12 | Re-opening a closed month | Never. Late entries land in the next month, labelled |
| D-PH2-13 | Products with no VEN class | The in-charge sets their trimming order at signing; never silently "necessary" |
| D-PH2-14 | Cost | Optional unit cost on receipt; money shown only from recorded cost; the patient price never used as cost |
| D-PH2-15 | Tracer list | The current national tracer list for the hospital's level, entered as signed data from the MoH document, with its source. None proposed here |
| D-PH2-16 | Order parameters | Signed per hospital: cycle months, maximum months (the manual's four months as reference), any minimum or emergency order point, review window, minimum history. None pre-filled |
| D-PH2-17 | Recall messages | Sent by a person, to exact-list patients; to "may have received" patients only if the CSO approves for that recall |
| D-PH2-18 | Disposal | Off-system; MedSync records the write-off, the register entry and the disposal reference |
| D-PH2-19 | Controlled drugs outside the dispensary | Witnessed receipt, issue, return and write-off; ward controlled registers stay on paper |
| D-PH2-20 | Scanning | Keyboard-wedge only, GS1 parse optional, nothing requires a scan |
| E-PH2-01 | One ledger | Phase 1's, extended; no stock card table |
| E-PH2-02 | No supplier link | Prints and copyable text only |
| E-PH2-03 | Pairs | Every two-place movement is two legs with one pair id |
| E-PH2-04 | Delivery | Three merges; locations go live one by one |

## 15. Out of scope (leave clean seams)
- **Roadmap Phase 3 and 4:** interactions, discharge reconciliation, stewardship, reaction reports, refills, partner pharmacies, the e-pharmacy.
- **Not here at all:**
  - any link to the NMS portal, JMS, RxSolution, DHIS2 or a supplier;
  - payment, invoices, supplier accounts, budgets beyond one figure per cycle;
  - a running ward controlled-drug register;
  - computing ward or cart use from doses;
  - vaccines and the cold chain (the manual's separate two-month rule);
  - laboratory reagents (the lab's own ledger);
  - non-medicine health supplies, unless the pilot site's catalogue already holds them as products;
  - automatic reordering;
  - destruction certificates;
  - the mobile app.

## 16. ADRs (numbers from the ledger)
- Stock locations of five kinds; Phase 1 points migrated.
- Two-leg movements and the new kinds.
- Receiving at counted quantity; discrepancies reported, never absorbed.
- Ward and cart use from counts; why no dose-to-unit conversion.
- The consumption definition.
- The order method from EMHS 2023; why MedSync does not send it.
- Month close: immutable snapshots, late entries forward.
- Recall: exact and "may have received" lists.
- Expiry, quarantine and write-off; disposal off-system.
- Cost recorded at receipt only.
- GS1 keyboard-wedge parsing.

## 17. Definition of Done
- [ ] The monthly stock status report is produced from closed snapshots with no paper tally, in the confirmed HMIS 105 layout.
- [ ] Counts at every location kind reconcile to the ledger with variance visible; unexplained differences carry forward.
- [ ] A recall lists exact patients, "may have received" patients separately, wards and shelves, and quarantines every balance in one action.
- [ ] The order for one real cycle matches the in-charge's paper calculation, or every difference is explained.
- [ ] No stock figure depends on a dose (test). No movement has one leg (test). No closed period changed (test).
- [ ] Every location kind goes live only with its conditions and a second approver.
- [ ] axe clean; no red added; nothing green.
- [ ] Strings in `content/` as `draft`; no `*_COPY_STATUS` edited.
- [ ] The Pharmacy Handbook, ADRs and final report exist; the diff on `feat/pharmacy-stores` is reviewable merge by merge.

---

## Appendix A: Permission map, version 3 (for signature at GATE A)

Phase 1's map stands, amended as follows. This slice adds a seventh permission, `pharmacy.store`: Phase 1's PA2-1 (grant inside the approval transaction), PA2-7 (revocation of all pharmacy permissions) and R1 are amended to seven names, with a backfill for existing pharmacy staff by cadre. Ward and unit rights are **hub-assignment rights outside the `pharmacy.*` set**, so Phase 1 PA2-5 (nurses hold no pharmacy permission) still holds and is amended only to name these rights.

| Who | store | stock | manage | Ward in-charge rights | Cart confirmation |
|---|---|---|---|---|---|
| Pharmacist | yes | yes | only by hub assignment | no | no |
| Pharmacy technician | yes | yes | only by hub assignment, if the legal answer allows | no | no |
| Head of Pharmacy, store or point in-charge (hub assignment) | by cadre | by cadre | yes, while assigned | no | no |
| Ward nurse in charge (hub assignment) | no | no | no | raise requisitions, record ward counts (a hub right, not `pharmacy.stock`), confirm receipt, see notices | no |
| Nurse on the ward | no | no | no | read; confirm receipt if D-PH2-04 allows | no |
| Unit nurse in charge, unit clinical lead (hub assignment) | no | no | no | no | confirm a check; co-sign the cart list |
| Doctor, clinical officer | no | no | no | no | no |
| Hospital admin | no | no | no | no | no; holds location go-live pages and settings, no PHI |
| Superadmin | no, without break-glass | no | no | no | no |

## Appendix B: Copy to be signed (all `draft`)

| Key | Text |
|---|---|
| Not sent | MedSync does not send this order. A public hospital enters these quantities in the National Medical Stores portal. |
| Count first | Count the ward first. The last count is older than {interval}. |
| Doses context | {n} doses charted on the administration record since the last count. They are not taken from the stock figure. |
| More than issued | More on the ward than was issued. Check returns and the last count. |
| Cart uses context | {n} uses recorded against this cart since the last check. They are not taken from the count. |
| Explain difference | Say what you found. It goes to {unit} nurse in charge. |
| Only counted | Only what was counted goes into stock. Every difference from the delivery note goes on the discrepancy report. |
| Issued unconfirmed | Issued {time}, not yet confirmed by {location}. |
| May have received | May have received it. The administration record does not name the batch. |
| Batches mixed | This ward keeps one figure per product, so batches cannot be told apart after they reach the ward. |
| Recall patient message | {Hospital message name} pharmacy needs to speak to you about a medicine you collected. Please call {pharmacy phone} or come to the pharmacy. |
| Month not closed | Month not closed. Figures may change. |
| Belongs to | Belongs to {month}, recorded {date}. |
| No cost | No cost recorded. |
| Parameter missing | This needs {parameter}, which is not set yet. {Role} sets it. |
| Columns unconfirmed | Columns not yet confirmed against this hospital's {form}. |
| Paper still applies, controlled | The controlled drugs register entry is still made on paper. |

## Appendix C: Hazard log seed (complete at Step 1; close each with a test)

| # | Hazard | Control |
|---|---|---|
| H2-1 | A dose turned into units overstates or understates ward stock | Law 4; WS-2, EC-2 tests |
| H2-2 | A movement with one leg loses or creates stock | SL-13 property test |
| H2-3 | Expired or recalled stock issued to a ward or cart | SL-14 under lock; S28 |
| H2-4 | A recall misses a patient who received the batch | Supplies always carry a batch (Phase 1); RC-2 exact; S30 and the hand-count metric |
| H2-5 | A recall frightens a patient who never received the batch | Two lists; list 4 messaged only with CSO approval |
| H2-6 | A recall message reveals a condition | Banned-term scan; template signed |
| H2-7 | A closed month changed after reporting | MR-4 snapshots; immutability tests |
| H2-8 | Losses hidden by absorbing differences into opening | MR-2 carry forward |
| H2-9 | An order inflated by a long stock-out on few days of data | CN-4 shows inputs; data warnings; in-charge types the final quantity |
| H2-10 | Vital medicines cut to meet a budget | OQ-5 order; confirmation and reason |
| H2-11 | Controlled stock diverted between store and ward | Witness at issue; nurse confirmation; differences listed |
| H2-12 | A cart missing a life-saving item after use | Restock on every check; overdue checks listed; short-dated swapped |
| H2-13 | Receipt of falsified or wrong product enters stock | Count, batch and expiry per line; wrong product and damaged results; quarantine |
| H2-14 | Stock-out days miscounted | CN-3 from events, signed day rule |
| H2-15 | A ward sees another ward's stock | RLS probes |

## Appendix D: Sign-off packs (templates only; propose no values)

| Pack | Signed by (D-PH1-36 roles) | While unsigned |
|---|---|---|
| Order parameters (cycle, maximum and minimum months, review window, minimum history, emergency order point) | Pharmacy in charge + CSO | No proposal is calculated; the screen names what is missing |
| Tracer list | Pharmacy in charge + CSO, from the MoH source | Stock status report and tracer audit do not print |
| Cart look-ahead (Phase 1's expiry look-ahead and count freshness are reused for everything else) | Pharmacy in charge | Carts use the hospital's expiry look-ahead |
| Month-end count window; data-warning thresholds (minimum history, out-of-stock share of the window, large difference); the report-location set | Pharmacy in charge + CSO | Month cannot close; the warnings do not show and the screen says so; the report covers store and dispensing points |
| Ward levels, confirmation window, the per-product allocation rule (SL-18) | Pharmacy in charge + ward nurse in charge | No suggested top-up; counts still accepted; per-product ward counts refused until the rule is signed |
| Cart lists and check interval | Pharmacy in charge + unit clinical lead | The cart cannot go live |
| Reason lists: receiving decisions, refused lines, returns, receipt differences, quarantine, write-off, count differences, month-end differences, order changes, order line closes, cart explanations, recall contact outcomes | Pharmacy in charge + CSO | The action needing the list cannot be completed |
| HMIS column maps (085, 084B, 087, 088, 105 Section 6), voucher and register layouts | Pharmacy in charge | Prints carry "Columns not yet confirmed" |
| Recall patient template | CSO + pharmacist reviewer; two-user approval | No message can be sent; the list prints |
| Day-out-of-stock rule | Pharmacy in charge + CSO | Days out of stock are not reported |

## Appendix E: Sources checked (21 Oct 2026; re-verify at build time)
- Ministry of Health, *Essential Medicines and Health Supplies Management Manual*, 2023 (master copy 31 July 2023), as hosted by Gulu Regional Referral Hospital: §3.3.1.1 (adjusted consumption), §4.1.1.2 (maximum four months for most medicines, two for vaccines; a count at each ordering cycle), §4.1.1.3 (quantity to order), §4.2 (emergency orders), §4.3 and Table 9 (HMIS 084B), HMIS 085, §26.2 (HMIS 105 Section 6), Table 3 (quarterly tracer audit), Table 27 (Expired or Spoiled Medicines Register), Chapters 18 and 19 (titles read; text not read).
- National Medical Stores, *Standard Operating Procedures Manual for Supply Chain Management at Health Facility Level* (2019, hosted December 2025): receiving steps, HMIS 087 discrepancy report, HMIS 088 expired/spoilt items register, the Requisition and Issue Voucher flow, monthly physical counts, minimum two and maximum four months of stock, the stock book.
- National Drug Authority, *Guidelines for the Recall or Withdrawal of a Medical Product*, INS/GDL/037, revision 0, effective 21 Aug 2017, review due 21 Aug 2020: classes A, B and C; levels; reports within 30 days and a reconciliation within 14 days of termination. Whether a newer revision exists was not established.
- Kataza, *Situation analysis of medicines traceability and product recall system in Uganda*, Makerere University dissertation, 2021: compliance with global traceability practice at 48 %; NDA's tracking is not computer-based.
- Not established: the NMS order schedule by facility level; GS1 coverage of products on the Ugandan market; the current national tracer list; who authorises disposal at each facility level.
