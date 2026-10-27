# PROMPT: Medicines catalogue, scanning, prices and distribution — one shared catalogue above every hospital's stock, and the pharmacy's view of every unit from the store to the last cart

> **For Claude Code.** Work at the repo root on a new branch, `feat/pharmacy-catalogue`. Cut it from the branch that holds pharmacy Phases 0 to 4 and the demo (`feat/pharmacy-demo`), or from `main` if that branch is merged. If `feat/pharmacy-workspace-v2` has landed, cut from that instead: its places (Store, Set-up) are where these screens live.
>
> - First copy into `docs/pharmacy/catalogue/`:
>   - this prompt;
>   - the canvas export `medicines-catalogue-canvas/`, unzipped from `medicines-catalogue-canvas.zip`. It has sixteen boards and the CSS files `ws.css`, `rx.css`, `rx2.css` and `rx3.css`.
> - **This slice adds data and write paths.** It adds:
>   - a MedSync-wide catalogue;
>   - hospital links to it;
>   - barcode links;
>   - prices;
>   - imports;
>   - distribution checks: picking issues by scan, confirming receipt on a phone, comparing ward use with charted doses, cart seal signals, and the hospital stock map and medicine trace.
>
>   **The stock ledger does not change.** It stays append-only, with balances as sums, first expiry first out, blind counts, witnesses, quarantine and month end. The catalogue decides what a product *is*; the ledger still records every unit.
>
> **Mode: gated.** There are thirteen steps, numbered 0 to 12, and each ends in a **STOP**.
> - **Documents** follow Stage 1: draft, critique against the checklist, revise (at most two passes), present, then STOP.
> - **Code** follows Stage 2: build, run the real checks, fix, and re-run until green. Then report the numbers and STOP.
> - Every migration is GATED: written, reviewed and applied by the owner, never by you.
>
> **The CSO is Fadhul.** He signs:
> - the data model and the source licences (Step 1);
> - the catalogue governance: who curates, and the two-person rule;
> - the forms and routes vocabulary;
> - the Uganda abbreviations list;
> - the price-rule defaults;
> - every new string, which goes into `content/` as `draft`. **Never edit a `*_COPY_STATUS` yourself.**

---

## 0. Why, in one paragraph

Today a hospital's first day means typing hundreds of products by hand. A product can exist only for a prescribing-list medicine. Each hospital types its own names, packs and strengths. The registration number is free text. Barcodes are stored per hospital, so every hospital teaches MedSync the same barcode again. Health supplies and local medicines have nowhere to live. Nothing adds up stock value, and prices are a single optional number per product.

**This slice gives MedSync:**

1. **One medicines catalogue, shared by every hospital, in four layers:**
   - **substance**: one preferred name (the WHO INN) and every other name it goes by, such as paracetamol / acetaminophen / APAP and salbutamol / albuterol;
   - **medicine**: substance, strength as printed, dose form and route(s);
   - **brand**: name, manufacturer, country, NDA registration and its state;
   - **pack**: contents, container and barcodes.
2. **Three ways onto a delivery line:**
   - **scan** the pack: a GS1 DataMatrix fills the pack, batch and expiry, and a plain barcode fills the pack;
   - **pick** from the catalogue by any name, brand or NDA number;
   - **type** it, when it is not there. It is received at once as a local product and sent to the catalogue team.
3. **Barcodes learned once.** A new barcode is linked by a person once, works at that hospital at once, and becomes shared after the catalogue team checks it.
4. **Prices.** These are:
   - the unit cost from each delivery (already stored);
   - supplier price lists;
   - a hospital price rule that *proposes* selling prices;
   - prices per payer and per point, from a date, with history;
   - "free", "not set" and zero kept apart;
   - a stock value report;
   - **billable lines** that the future Accounts dashboard and the patient's phone bill will read.
5. **Imports** of a hospital's product list, opening stock and supplier price lists, as reviewed drafts.
6. **Distribution the pharmacy can see.** Stock goes from the store to dispensing points, wards and emergency carts through the existing requisitions and issues. This slice adds:
   - **picking by scan**: each pack scanned as it is picked from the store, which catches a wrong medicine, a wrong strength or a batch that does not expire first, before it leaves;
   - **receipt confirmation on the phone** for the ward or unit nurse in charge;
   - **a ward use check**: use worked out from counts, shown beside the doses nurses charted from ward stock, with unexplained gaps sent for a reason;
   - **cart signals**: a broken seal or a dose recorded on the resus desk from a cart puts that cart on the check list at once;
   - **the hospital stock map**: every place, how its stock is known, its value, what is out, what expires, how fresh its count is, and one next step;
   - **a medicine trace**: one medicine across every place, its batches, cover, orders and every movement.

**Done when:**
- a delivery of 20 lines can be counted with at most 2 typed product identities, measured on the demo;
- every EMHSLU 2023 medicine is in the catalogue and linked;
- the NDA register edition the owner supplies is imported as brands;
- the GTIN registry works across two demo hospitals;
- prices and the stock value report work;
- the billable-lines read model is tested;
- an issue picked by scan refuses a wrong medicine and asks a reason for a later-expiring batch;
- the ward use check and the cart signals work on the demo, and change no balance;
- the stock map's totals equal the ledger's sums, place by place;
- nothing in the ledger's rules has changed (its test suite is untouched and green).

---

## 1. Ground truth and reading order

1. **The repo wins** over this prompt and the canvas. Report every disagreement at STOP 0.
2. **What is built.** *How stocking works in MedSync Pharmacy* (https://claude.ai/artifact/B9ZDN7HqXDCWK53Y2GxheX) describes:
   - the five layers;
   - the ledger and its 21 movement kinds;
   - first stock in, moves, counts and controlled drugs;
   - reordering, signed packs and flags;
   - the gaps this slice closes: no bulk import, prescribing-list medicines only, no shared product master, free-text registration, no stock value.
3. **The UI reference: the design canvas *Medicines Catalogue and Stocking*.**
   - It lives at https://claude.ai/artifact/KXnaZ8QSJEvLkzNeZVcdob and is exported to `docs/pharmacy/catalogue/medicines-catalogue-canvas/`.
   - It has sixteen boards:
     - 0 Read me;
     - 1 Count a delivery;
     - 2 Pick from the catalogue;
     - 3 A new barcode;
     - 4 Not in the catalogue;
     - 5 A medicine;
     - 6 Products and prices;
     - 7 Import;
     - 8 Catalogue team;
     - 9 The patient's bill (a later slice; draw only the read model now);
     - 10 Every place that holds medicines;
     - 11 Issue a requisition;
     - 12 The ward confirms arrival (phone);
     - 13 A ward's stock;
     - 14 Check and restock an emergency cart;
     - 15 Follow one medicine.
   - The numbers on boards 11 to 15 agree with each other (the 34 vials issued on 11 are the ones confirmed on 12, seen on 13 and traced on 15). Use them as the fixture for Steps 10 and 11.
   - Brands, registration numbers, barcodes, prices and counts on it are examples. Rebuild it as components; do not paste the markup.
4. **Code to read:**
   - `lib/prescribing/reference/general-formulary.ts`;
   - `lib/pharmacy/catalogue.ts` (`sameStrength`, `issueUnitLocked`);
   - `lib/pharmacy/national-list.ts` and `national-catalogue.ts`;
   - `scripts/pharmacy/load-national-list.ts`;
   - `pharmacy_products`, `pharmacy_product_points`, `pharmacy_product_locations`, `pharmacy_batches`, `pharmacy_stock_movements`;
   - `stores/receiving.ts` and `receiving-store.ts`, and the existing GS1 scan parser;
   - `stock/store.ts` (`addProduct`, `receiveStock`);
   - `stores/location-store.ts` (opening count);
   - the price fields on products and unit costs on receipts;
   - `stores/order.ts` (pack rounding);
   - `stores/issue.ts` and `issue-store.ts` (requisitions, planned issue, confirmation);
   - `stores/ward-stock.ts` (counts, suggested top-up) and `stores/carts.ts` (checks, gaps, restock, seal);
   - the medication administration record (where nurses chart doses) and whether a dose records its source: ward stock, patient's own, or supplied by the pharmacy;
   - the resus desk's dose record and how it names a cart;
   - the payment field on the patient band;
   - `lib/pharmacy/write.ts` (`runPharmacyWrite`);
   - `lib/pharmacy/feature.ts`;
   - the permission map;
   - `content/pharmacy*.ts`.
5. **The pharmacy Phase 0 to 4 prompts and ADRs**, for every rule a stock screen keeps.
6. **The sources in Appendix D.** Licences are checked at Step 0, before any data is loaded.

---

## 2. Laws (non-negotiable)

1. **The ledger is untouched.**
   - No change to movement kinds, the movement guard, first expiry first out, counts, witnesses, quarantine, recall, month end or ordering arithmetic.
   - The ledger's existing tests run unchanged and green at every STOP.
2. **The catalogue holds pack facts, never clinical advice.**
   - It holds: names, strength as printed, dose form, route, pack contents, maker, registration, barcode and source.
   - It holds **no doses**, no dose limits, no indications and no interactions. Those stay in the signed clinical packs and dose references.
   - Pharmacokinetic data (half-life and similar) is out of scope. If wanted later, it comes from a signed monograph source, never typed from memory.
3. **Strength is text as printed.**
   - A structured parse (amount, unit, per-amount, per-unit, per ingredient) is stored *beside* it, for search and grouping only.
   - Nothing converts one strength to another; "500 mg" is never "0.5 g". `sameStrength` keeps its rule.
   - A medicine with a different strength is a different medicine.
4. **Packs convert to issue units only by the pack's own whole-number contents.**
   - Receiving 20 packs of "10 × 10 tablets" writes 2,000 tablets. Both figures are shown before saving.
   - If contents are not a whole number of the product's issue unit, the line is counted in issue units directly.
   - The issue unit still locks after the first movement.
5. **MedSync never guesses an identity.**
   - An unknown barcode, an import row or a typed name is matched by a person.
   - MedSync may *propose* candidates (exact code, the same pack on the delivery's order, name similarity) and must say why.
   - It never auto-links on similarity alone.
6. **Local first, shared after review.**
   - A hospital's link or local product works at that hospital immediately.
   - It enters the shared catalogue only after the catalogue team confirms it, with two different people for any change to a medicine's substance, strength, form or route, and nobody confirming their own proposal.
   - Conflicts are surfaced, never silently resolved. A conflict means the same barcode linked to two packs, or the same brand and pack with two registration numbers.
7. **Every catalogue fact has a source**: register edition and row, EMHSLU page, RxNorm release, EDQM retrieval date, pack photo, or hospital proposal. Changes are versioned and append-only, and the history is visible.
8. **Licences are obeyed** (Appendix D):
   - EDQM Standard Terms are used unmodified, with attribution and retrieval date.
   - ATC codes are loaded only if the CSO records the right to use them (D-CAT-06).
   - RxNorm data comes only from the public-domain prescribable subset.
   - The NDA register is used as the owner supplies it, under its stated terms.
9. **Registration is shown, not enforced silently.**
   - A brand's NDA state (registered, lapsed, not found) is visible wherever it is picked.
   - Receiving stock of a product with no registration, or a lapsed one, needs a coded reason and lands on the in-charge's list (D-CAT-08). Nothing blocks a recall or quarantine.
10. **Prices are a hospital's own.**
    - Prices, price rules and supplier price lists are hospital-scoped, under RLS, and never shared across hospitals.
    - The catalogue holds no prices.
11. **Three kinds of nothing in money.**
    - **Free** is a decision, by point or product.
    - **Price not set** is a gap, shown in amber with an icon and a word.
    - **UGX 0** is never stored as a price. A line with no price is never billed as zero.
12. **Prices change only by a person, from a date.**
    - A rule proposes; a person accepts.
    - Price history is append-only.
    - A bill line snapshots the price in force when it was issued.
13. **Payment never holds up care.**
    - No supply to an emergency, a resuscitation, an admitted patient or a downtime entry waits for payment.
    - Whether outpatients pay before collecting is a hospital setting (D-CAT-11), and the window always shows the state in words.
14. **MedSync holds no money.** The billable-lines read model states what is owed. Taking payment (mobile money, accounts desk) is a separate slice with a licensed payment provider, paying into the hospital's own account.
15. **Stack and house rules as found.**
    - `runPharmacyWrite` for every hospital write.
    - The catalogue team's writes go through the same contract, with a `catalogue.curate` permission.
    - RLS on every table.
    - Drizzle and gated migrations.
    - Tokens only, Tide at desk density, and the Pharmacy Workspace v2 row pattern (next step plus one action).
    - en-GB, Ugandan shillings as whole numbers (`UGX 18,000`).
    - The regulator is the National Drug Authority (NDA) for registration. The professional body is the **Pharmacy Board of Uganda** (never PSU).
    - No new dependency without stopping to flag it. Camera scanning may need one (Step 5).
16. **Counts stay the truth on wards and carts.**
    - Charted doses and resus doses are a **check**, never a deduction. They never write a movement.
    - Use is still what a count shows went missing, as built.
    - A gap between counted use and charted use asks the nurse in charge for a coded reason. The wording never accuses; most gaps are doses given and not charted.
    - Controlled drugs keep the register comparison they already have.
17. **Signals add work, never change stock.** A broken seal, a resus dose from a cart, or a gap on a ward puts an item on a list (the cart's check list, the ward's page, Needs you). Nothing a signal does moves a balance.
18. **Picking by scan verifies; first expiry first out still decides.**
    - A scanned pack must be the requisition line's product. A different product, or a different strength, is refused in words.
    - A scanned batch that does not expire first needs the existing coded reason.
    - Where a product has no barcode, the line is ticked by hand and the screen says why.
    - Scanning is required for barcoded packs and optional otherwise (D-CAT-15).
19. **Receipt confirmation is the receiver's own act.** The ward or unit nurse in charge confirms with their own second factor, on the desk or the phone. Nobody confirms for them, and an unconfirmed issue shows on the stock map with its age.

---

## 3. Data model (proposal for Step 1; the repo's conventions win)

### 3.1 The shared catalogue (no `hospital_id`; readable by all staff; written only by `catalogue.curate`)

| Table | Holds |
|---|---|
| `cat_substances` | id, preferred name (INN where one exists), kind (`medicine` \| `health_supply` \| `other`), ATC code (nullable, D-CAT-06), status, version |
| `cat_substance_names` | substance, name, type (`INN` \| `BAN` \| `USAN` \| `JAN` \| `former` \| `local` \| `abbreviation` \| `other_language` \| `common_misspelling`), language, source. There is no limit on how many a substance has |
| `cat_dose_forms`, `cat_routes` | MedSync code, plain en-GB label, EDQM code, status. A short list the CSO signs (D-CAT-04) |
| `cat_medicines` | id, display name, dose form, issue-unit kind (tablet, capsule, mL, vial, ampoule, sachet, tube, bottle, piece…), status, version |
| `cat_medicine_ingredients` | medicine, substance, strength as printed, parsed amount, unit, per-amount, per-unit, basis (for example "as trihydrate") |
| `cat_medicine_routes` | medicine, route (one or more) |
| `cat_medicine_links` | medicine ↔ EMHSLU row; medicine ↔ prescribing-list (formulary) id. Confirmed by the CSO as the national-list links are now |
| `cat_manufacturers` | name, country, other names |
| `cat_products` | a brand (or "unbranded") of a medicine: brand name, manufacturer, NDA registration number, NDA state (`registered` \| `lapsed` \| `not_found` \| `unknown`), valid to, source edition and row |
| `cat_packs` | product, description ("Blister 10 × 10"), contents quantity (whole number of the issue unit, nullable), container, status |
| `cat_pack_codes` | pack, code type (`GTIN` \| `NMS` \| `JMS` \| `supplier` \| `other`), code, scope (`shared` \| a hospital id), state (`local` \| `confirmed` \| `conflict` \| `withdrawn`), who, when, evidence (photo asset, count of hospitals agreeing) |
| `cat_proposals` | kind (new barcode, new product, correction, register change), payload, hospital, proposer, evidence, state, reviewers |
| `cat_changes` | append-only log of every confirmed change, with before, after and source |

### 3.2 Per hospital (with `hospital_id`, under RLS)

| Change | Holds |
|---|---|
| `pharmacy_products` gains `catalogue_pack_id` (nullable), `item_kind` and `local_proposal_id` | A product is either linked to a catalogue pack or **local**. A local product can exist for anything, including health supplies and local medicines (closes the "prescribing-list only" gap, D-CAT-03). Existing rows are unchanged; linking them is Step 6 |
| `pharmacy_payers` | cash, each insurance scheme, staff, and others the hospital adds |
| `pharmacy_point_charge_modes` | per point: `charged` or `free`, from a date |
| `pharmacy_price_rules` | markup multiplier, rounding step, payer adjustments, from a date, set by. It proposes only |
| `pharmacy_product_prices` | product, payer, price per issue unit (integer UGX), or `free` at product level, from a date, set by, source (`rule_accepted` \| `typed` \| `import`). Append-only. The existing single price migrates in as `cash`, with its date |
| `pharmacy_price_lists`, `pharmacy_price_list_lines` | supplier, edition date, the file; per line: raw text, matched pack, pack price, supplier code |
| `pharmacy_import_drafts`, `pharmacy_import_rows` | an uploaded file, its rows, the proposed match, the person's decision, and the commit |
| `pharmacy_issue_picks` | per issue line and batch: what was scanned (or "ticked by hand", with why), the result (`matched` \| `wrong_product` \| `wrong_strength` \| `later_batch_with_reason`), who, when. Append-only; it records verification and never moves stock |
| `pharmacy_seal_events` | per cart: seal applied (number, by, at the check) or reported broken (by whom, from where: unit, resus desk), when. Append-only |
| `pharmacy_use_gap_reasons` | per ward count and product: the gap between counted use and charted use, the coded reason the nurse in charge chose, who, when. Reasons come from a signed list (D-CAT-14) |

### 3.3 Read models (pure, tested)
- **`catalogueSearch(q, { hospital, kind?, form?, route? })`**, which:
  - checks exact codes first: GTIN, NDA number, NMS or JMS code, prescription-style short names;
  - then names (preferred, other names, brands, manufacturers), using trigram and unaccent;
  - groups results as medicines, brands and your products;
  - says why each matched ("Also called acetaminophen").
- **`resolveScan(raw, hospital)`**:
  1. parse GS1 (AIs 01, 17, 10, 21, and 11 if present; FNC1 or GS separators; the AIM `]d2` prefix; GTIN check digit);
  2. return the pack via the hospital's local link, then the shared link, else `unknown`.
  - Expiry `YYMM00` means the last day of that month, matching the existing rule.
  - A non-GS1 code is looked up as a supplier or other code.
- **`proposePrice(product, payer, hospital, on)`**: the rule over the last unit cost, rounded up. It returns the arithmetic shown on screen.
- **`stockValue(hospital, place?, on)`**: the sum over batches of balance × that batch's unit cost. Batches without a cost are counted and named, never valued at zero.
- **`billableLines(prescriptionKey)`**: one row per line the pharmacist has settled for supply. Each row holds product, quantity in issue units, payer, the price in force (a snapshot) or `free` or `price_not_set`, and the line total. It also returns a bill version that changes whenever a line changes.
  - This is the only thing the future Accounts dashboard and the patient's phone bill read.
  - It writes nothing about payment; the existing payment field stays the source of "Paid".
- **`hospitalStockMap(hospital, on)`**: one row per place (stores, points, wards, carts, quarantine), with:
  - how its stock is known: `every movement` (stores, points, quarantine), `counted` (stocked wards), `issue only` (not counted), `checked and sealed` (carts);
  - value at cost, out of stock (vital first), expiring within the hospital's look-ahead, last count or check and whether it is fresh by the existing freshness setting, issues not yet confirmed and their age, broken seals;
  - one next step chosen from a fixed list of `draft` strings by state.
  - Totals equal the ledger's sums place by place; a test asserts it.
- **`medicineTrace(hospital, product | catalogueMedicine, from, to)`**: holdings per place, batches with expiry and state (recalled, quarantined), adjusted monthly use and weeks of cover (from the existing consumption engine), what is on order, and every movement in the period in words, newest first.
- **`wardUseCheck(ward, countId)`**: for each product, counted use between this count and the last (from the existing ward engine) beside the doses charted from ward stock in the same period. A product with no charting source shows "Not charted from ward stock", never 0. Controlled products compare with the register instead.
- **`cartSignals(hospital)`**: carts with a broken seal, resus doses recorded from them since the last check, or a check overdue by the cart's schedule. Resus doses are matched to cart list items by catalogue medicine, which also fixes the cart recall id mismatch noted in the Phase 2 report.
- **`pickCheck(issueLine, scan)`**: verifies a scanned pack against the line's product and the planned batches, returning `matched`, a refusal in words, or "later batch: reason needed".

---

## 4. Interface (canvas boards in brackets)

### 4.1 Count a delivery (1)
- **The scan field** sits at the top of the delivery and is always listening for a keyboard-wedge scanner. Ctrl K opens the catalogue picker.
- **Each line** shows the medicine (generic first), its route chips, then the brand, maker and NDA state, then where each value came from: `scan`, `catalogue`, `last delivery`, `supplier price list` or `typed`.
- **The fields** are pack, GTIN, batch, expiry, on the note and counted, with packs → units and the unit cost shown before saving.
- **Results in words** are the existing ones: matches, fewer or more than the note, expires soon.
- **A scanned GS1 DataMatrix fills the batch and expiry.** A plain EAN-13 or UPC fills the pack, and the batch and expiry are typed from the box.
- **Scanning the same pack again adds to that line's count** (D-CAT-09) and says so ("+1 pack · 21 counted").
- The side panel shows lines counted, how many were typed by hand, the value so far, differences, and **Count the next line**. Nothing moves until the count is finished, as today.
- The same field kit serves **Add a product** at a point, the **store opening count**, **Add a batch found on the shelf** and **cart restock**.

### 4.2 Pick from the catalogue (2)
- A centred dialog, using the house dialog, not a side sheet.
- Search results are grouped: medicines (generic first), brands and your products.
- Each result says why it matched; filter by form and route chips.
- Choosing a medicine shows its other names and its packs. Your own packs come first, then packs with known barcodes, then the rest, then "Unbranded · loose".
- **The pack that came is not here** opens 4.4.

### 4.3 A new barcode (3)
- Shows the parsed code, with the check digit verified, and the batch, expiry and serial.
- **Proposes, without choosing:** the delivery order's uncounted lines, and then search.
- An optional pack photo.
- **Link and fill the line** creates a hospital-scoped link and a proposal.
- A barcode already linked to another pack *at this hospital* cannot be linked again. It opens the conflict instead.

### 4.4 Not in the catalogue (4)
- A numbered form in three parts: what it is (generic name matched to a substance where possible, strength as printed, brand, form chips, route chips); the pack (container, contents, issue unit, barcode); and maker and registration.
- **Receive as a local product** creates the hospital product and a `new product` proposal.
- "No registration number on the pack" is a recorded answer, not a blank (law 9).

### 4.5 A medicine (5) · Set-up › Catalogue
- The page shows:
  - the names (preferred, then others with their type);
  - the class (ATC only under D-CAT-06);
  - a medicines table (strength, form, route, issue unit, national-list level and VEN, brands, packs, held here);
  - brands and packs (maker, NDA state, pack, barcode and how many hospitals confirmed it, your product, your price);
  - what the catalogue holds and does not;
  - the history.
- **Report a mistake** files a correction proposal.

### 4.6 Products and prices (6) · Set-up
- The price rule card, the payers, and each point's charge mode.
- A figures strip: products, no price set (amber), cost went up since the price was set, and stock value at cost.
- **Needs a price**: product, sold per, last cost, price-list price, proposed price per payer, from date, **Accept**, or "more" (type a price, mark free).
- **Review {n} proposals** is the primary action.
- The three kinds of nothing (law 11) and price history.
- Permission: `pharmacy.manage` sets prices and rules; others read.

### 4.7 Import (7)
- **Products**, **opening stock per place** and **supplier price lists**, from CSV or Excel. An Excel parser may need a dependency: flag it.
- Rows are grouped as matched, check and not in the catalogue. Each shows why.
- One decision per row: choose brand, choose pack, choose form, or add as local.
- **Commit {n} matched rows** writes only what a person accepted. Opening stock still needs its blind count before go-live.

### 4.8 Catalogue team (8) · MedSync, not a hospital
- A queue of new barcodes, new products, corrections and register changes, with the next step in words and one action.
- Shows evidence (photo, how many hospitals agree) and conflicts.
- Two people are required where law 6 says so.
- Shows catalogue totals and the team's rules.

### 4.9 The patient's bill (9), a later slice
- Not built here. This slice delivers `billableLines` and its tests.
- The payment slice will build the phone bill (lines, free lines, owed lines, the total, MTN Mobile Money, Airtel Money, or a code for the accounts desk).
- Rules that slice must keep:
  - the bill shows `[strength]` placeholders in patient views;
  - a change by the pharmacist replaces the bill and tells the patient;
  - payment is confirmed by the provider's callback, never by the patient's say-so.

### 4.10 Every place that holds medicines (10) · Store › Every place
- A figures strip: stock value, vital items out (and whether the store holds them), expiring, counts out of date, issues not confirmed, carts needing a check.
- One table grouped as stores, dispensing points, wards, emergency carts and quarantine. Each group says in one line how its stock is known.
- Each row: place, how known, value, out, expiring, last count or check (amber with an icon and words when stale or a seal is broken), **what happens next** in words, and one action (Issue, Request, Open, Check, Write off).
- **Follow one medicine** opens 4.15.

### 4.11 Issue a requisition (11) · Store › Issues
- The requisition's source line: who asked, when, and whether it came from a suggested top-up.
- **The scan field**: "Scan each pack as you pick it", with picked progress.
- Lines: medicine, asked, the place's level, what the place had at its last count, the planned batches (first expiry first, capped at what is held), the quantity to issue, and the pick state (`Scanned`, `Ticked by hand`, or amber with the problem in words).
- A zero line needs its reason, as built. A short line stays owed. A controlled line needs its witness before it is picked.
- The side panel: **Before it leaves** (every unresolved pick problem) and **When you issue** (both sides move together; the receiver confirms). **Issue {n} lines** is the primary action and stays disabled, with its reason, while a pick problem is open.

### 4.12 The ward confirms arrival (12) · phone
- The nurse in charge's phone shows the issue: lines with quantities, batches, what is still owed, and controlled lines marked "count with a witness".
- Two choices: **Everything arrived as listed**, or **Something is different** (line, counted figure, reason).
- **Confirm with my code** uses their own second factor (law 19).
- This is a staff phone surface in the patient app's Tide look, at staff density. If no staff phone surface exists yet, build it as a responsive page at 390 px under the nurse's existing workspace. Do not start Expo work.

### 4.13 A ward's stock (13) · Store › Wards › {ward}
- The ward's kind (stocked or issue-only), the date its levels were signed, and its nurse in charge.
- A figures strip: last count, still below level, value used between the last two counts, lines not explained.
- **Next for this ward**: the top-up proposal (only from a fresh count, as built), with **Send the top-up request** as the primary action and **Count the ward** beside it.
- The table, from `wardUseCheck`: level, counted, used between counts, charted from ward stock in the same days, **Compared** in words ("Matches the charts", "8 more used than charted", amber "7 not on any chart"), and what happened since the count (issued, owed, to request).
- A gap sends one item to the nurse in charge's Needs you with the reason list (law 16).
- An issue-only ward shows its issues and returns only, and says it is not counted.

### 4.14 Check and restock an emergency cart (14) · Store › Carts › {cart}
- A caution note when a signal put the cart here: the seal broken, when and where it was reported, and the resus doses recorded from it.
- The check against the signed cart list: should hold, counted (blind, then MedSync's figure), first expiry (amber when short-dated), the gap in words (explained by resus doses, or with its reason), and restock (first expiry first from the store; short-dated swaps proposed by the signed look-ahead).
- Controlled items restock through Issues with a witness, as built.
- **Restock and seal**: the new seal number, then the unit nurse in charge's confirmation.

### 4.15 Follow one medicine (15) · Store, and from Find
- A figures strip: in the hospital (units and value), used per month, cover in weeks, batches, on order.
- **Where it is now**: one row per place, with a bar for how many, a figure, and a short note (batch, count date, sealed, recalled).
- **Batches** with expiry and state, and "Who received {batch}" opening the recall trace.
- **Every movement** in the period, filterable by arrived, between places, to patients, used on wards and losses, each in words with who.
- Find (Ctrl K) opens this page from a medicine or batch result.

---

## 5. Seeding the catalogue

1. **Forms and routes.** Draft a short plain-English list (about 40 forms and 15 routes) mapped to EDQM codes, retrieved under EDQM's terms. The CSO signs it (D-CAT-04).
2. **Substances and medicines from EMHSLU 2023**, which is already loaded:
   - one medicine per row;
   - substances split for fixed-dose combinations;
   - strength as printed;
   - form and route mapped to the signed list;
   - flagged rows are kept flagged.
   - The CSO confirms the links to prescribing-list medicines in batches ("review the single matches"), as now.
3. **Other names.**
   - Draft from the RxNorm prescribable subset, where an INN and a US name differ.
   - Add a curated list: BAN and former names (adrenaline / epinephrine, frusemide / furosemide, lignocaine / lidocaine and similar), and Ugandan abbreviations in use (PCM, ORS, GV, ACT, ARVs, TEO and similar).
   - Each name is a draft that the CSO signs as a list.
4. **Brands and makers from the NDA register.**
   - The owner supplies the latest edition. The NDA site refused automated fetches during research; editions are dated June 2024 and earlier.
   - Write `scripts/pharmacy/load-nda-register.ts`, which parses the edition and records its date. Expected columns, confirmed at Step 0: registration number, brand, generic name, strength, dose form, pack, manufacturer, country, and local technical representative.
   - Match rows to medicines by generic name, strength and form. Exact matches are proposed in batches; everything else goes to the catalogue team.
   - Each new edition marks brands no longer listed as `lapsed` through proposals, never directly.
5. **Packs and barcodes.**
   - Packs come from register rows where pack size is given, and from hospital receipts.
   - Barcodes come from scans, and from supplier price lists where a column holds them.
   - There is no free global GTIN registry to load. Every scan teaches the network, and that shared map is MedSync's long-term asset.
6. **Health supplies.** EMHSLU's health-supply rows are loaded as substances of kind `health_supply`, so syringes, gloves and test kits can be stocked as products. They can never be prescribed.

---

## 6. Steps and gates

### Step 0: Discovery (no product changes)
- **Q1** The current schema of the five layers, and where GTINs, prices and unit costs live today. List every write path that creates a product or a batch.
- **Q2** The existing GS1 parser: what it handles (separators, AIM prefix, AIs, check digit), and its tests.
- **Q3** EMHSLU rows loaded: count, flagged rows, fixed-dose combinations, health-supply rows. Also how many prescribing-list medicines are linked.
- **Q4** Sources and licences (Appendix D):
  - Obtain or confirm each source and its terms.
  - For the NDA register, ask the owner for the latest edition as a file, and report its columns and row count.
  - For RxNorm, the prescribable subset.
  - For EDQM, access and attribution wording.
  - For ATC, whether MedSync holds a right to use the index.
- **Q5** Scanner hardware at the pilot site (USB keyboard wedge, 2D-capable or not), and whether camera scanning on a phone or tablet is wanted.
- **Q6** How the payment field on the patient band works today, and who sets it.
- **Q7** The demo: products, prices and costs present, and whether a second demo hospital exists for the cross-hospital barcode test.
- **Q8** Baselines: time and keystrokes to count a 20-line delivery and to add 50 products, by hand, on the demo.
- **Q9** Distribution as built:
  - how issues are planned and confirmed today;
  - what the receiver's confirmation needs;
  - how ward counts derive use;
  - how cart checks record gaps and seals;
  - whether a seal number is stored.
  Report Phase 2's not-built items that touch this slice: overdue confirmations (IS-4), withdrawing a requisition, and the cart recall id mismatch.
- **Q10** Charting and resus:
  - Does the medication administration record exist on this branch?
  - Does a charted dose say where the medicine came from (ward stock, patient's own, pharmacy supply)?
  - Does the resus desk record which cart a dose came from, and can it record a broken seal?

  If a source is missing, report it. Do not add one in this slice: the ward use check then shows "Not charted from ward stock" and the cart signal uses the seal report alone.
- **Q11** Staff phone surface: does the nurse in charge have one (web at 390 px, or the app)? Where does receipt confirmation happen today?

**STOP 0.** Report Q1 to Q11.

### Step 1: GATE A proposal (documents only)
Write `docs/pharmacy/catalogue/gate-a-proposal.md` containing:
- the data model (Section 3) adapted to the repo, with the migration plan and RLS;
- the source and licence table, with what will be stored and how it is attributed;
- the governance: who holds `catalogue.curate`, the two-person rule, how conflicts are handled, and how a register edition is applied;
- the forms and routes draft;
- the other-names and abbreviations drafts;
- the scan, pick and type flows on every receiving surface;
- the price model, the billable-lines contract for Accounts, and the payment slice's boundary;
- the import formats;
- the strings (Appendix A);
- the test plan, ADR drafts and the decision table (Section 8), with a signature block.

**STOP 1.** Nothing proceeds without Fadhul's signature.

### Step 2: Catalogue schema and seed from EMHSLU
- Write the migrations for 3.1 (gated).
- Add the forms and routes as signed.
- Write `scripts/pharmacy/seed-catalogue-from-emhslu.ts`: idempotent, recording its source, writing proposals that the CSO confirms in batches.

Scenarios:
- **S1** Every EMHSLU medicine row is a catalogue medicine, or is reported with its reason.
- **S2** A fixed-dose combination has one medicine with two ingredients.
- **S3** Re-running the seed changes nothing.
- **S4** RLS: no hospital can write a catalogue table.

**STOP 2.**

### Step 3: Names and search
- Load the other names as signed.
- Add trigram and unaccent indexes.
- Build `catalogueSearch` and the picker (4.2).

Scenarios:
- **S5** "acetaminophen", "PCM", a brand name, a misspelling within the trigram threshold, an NDA number and a GTIN each find the right medicine, with the reason shown.
- **S6** p95 under 150 ms on the full catalogue, with the index plan reported.
- **S7** A health supply never appears in a prescribing search.

**STOP 3.**

### Step 4: NDA register import
- Write `load-nda-register.ts` and the batch-confirmation surface for exact matches.
- Everything else goes to the catalogue team's queue.

Scenarios:
- **S8** Row counts reconcile: imported, matched, proposed and rejected with a reason add up to the rows in the file.
- **S9** A second edition marks missing brands `lapsed` only through confirmed proposals.
- **S10** A brand shows its NDA state wherever it is picked.

**STOP 4.**

### Step 5: Barcodes
- Extend the GS1 parser.
- Build `cat_pack_codes`, `resolveScan`, the new-barcode dialog (4.3), conflicts, and the catalogue team queue for barcodes (4.8).
- If camera scanning is wanted (Q5), propose the dependency (for example the browser `BarcodeDetector` with a fallback library) and STOP for approval before adding it.

Scenarios:
- **S11** A DataMatrix with and without GS separators parses identically.
- **S12** A wrong check digit is refused, with words.
- **S13** Expiry `YYMM00` is the last day of the month.
- **S14** A link made at hospital A resolves at A at once and at B only after confirmation.
- **S15** The same GTIN linked to two packs raises a conflict at both hospitals and in the queue.
- **S16** Nobody confirms their own proposal.

**STOP 5.**

### Step 6: Hospital products linked to the catalogue; local products
- Add `catalogue_pack_id`, `item_kind` and local products.
- Build the not-in-catalogue form (4.4).
- Build a linking surface for existing products, with batch confirmation of single matches.
- Health supplies become stockable.

Scenarios:
- **S17** An existing product linked to a pack keeps all its batches, movements and issue unit.
- **S18** A local product can be received, counted, issued and written off exactly like a linked one.
- **S19** A health-supply product can be stocked and issued and never prescribed.

**STOP 6.**

### Step 7: Receiving, opening counts and add-product use the catalogue
Wire scan, pick and type into:
- deliveries;
- the store opening count;
- Add a product;
- Add a batch found on the shelf;
- cart restock.

Scenarios:
- **S20** A 20-line demo delivery is counted with at most 2 typed identities; the timing is compared with Q8.
- **S21** Packs → units is shown before saving, and refused for non-whole contents.
- **S22** Rescanning the same pack adds to its line.
- **S23** Receiving a lapsed or unregistered product asks for a reason and lists it for the in-charge.
- **S24** A controlled product still needs its witness, as now.
- **S25** The ledger test suite is unchanged and green.

**STOP 7.**

### Step 8: Prices, stock value and billable lines
- Build the payers, charge modes, price rules, prices, price lists, the prices screen (4.6), `stockValue` and `billableLines`.
- Migrate the existing single price.

Scenarios:
- **S26** A proposed price shows its arithmetic, and nothing changes until it is accepted.
- **S27** The price in force on a date is the latest one from that date.
- **S28** A product with no price at a charged point shows "Price not set" and its bill line is `price_not_set`, never 0.
- **S29** A free point bills its lines as `free`.
- **S30** A bill line keeps its snapshot price after the price changes. A change to the line produces a new bill version.
- **S31** Stock value equals a hand sum on the fixture, and names batches without a cost.
- **S32** No price is readable across hospitals (RLS test).
- **S33** No supply to an emergency, an admitted patient or a downtime entry is blocked by payment state.

**STOP 8.**

### Step 9: Imports
Build the import drafts for products, opening stock and price lists (4.7).

Scenarios:
- **S34** A 600-row product file produces a draft, and nothing is written until commit.
- **S35** A different strength is never proposed as a match.
- **S36** Opening stock imported for a place still requires the blind opening count before go-live.
- **S37** Price-list lines match packs by code first, then by name, with a person deciding.

**STOP 9.**

### Step 10: Distribution checks
Build:
- picking by scan on issues (4.11, `pickCheck`, `pharmacy_issue_picks`);
- receipt confirmation on the phone (4.12);
- the ward use check and its gap reasons (4.13, `wardUseCheck`, `pharmacy_use_gap_reasons`);
- cart signals and seal events (4.14, `cartSignals`, `pharmacy_seal_events`);
- overdue confirmations (IS-4), using the signed ward-rules window. While that window is unsigned, the list says so.

Use the fixture from boards 11 to 15.

Scenarios:
- **S38** Scanning a different product, or the same substance at a different strength, is refused in words. A later batch needs the coded reason, and the issue stays disabled with its reason until resolved.
- **S39** A pack without a barcode can be ticked by hand, and the record says so.
- **S40** The receiver confirms with their own code on a 390 px page; nobody else can confirm for them. A reported difference writes the existing adjusted movement at the receiving place with the reason.
- **S41** Ward use check on the fixture:
  - ceftriaxone 22 used against 22 charted reads "Matches the charts";
  - tramadol 15 against 8 reads "7 not on any chart" and sends one item to the nurse in charge;
  - a product never charted from ward stock reads "Not charted from ward stock".
- **S42** A seal reported broken, or a resus dose recorded from a cart, puts that cart on the check list within one refresh. Resus doses explain the matching gaps in the check.
- **S43** No signal and no charted dose writes a movement. The ledger test suite is unchanged and green.
- **S44** A controlled item keeps its witness on pick, issue, confirmation and cart restock.

**STOP 10.**

### Step 11: Stock map and medicine trace
Build:
- 4.10 with `hospitalStockMap`;
- 4.15 with `medicineTrace`;
- links into the trace from Find, the medicine page (4.5) and each stock row.

Scenarios:
- **S45** Every place's value and holdings equal the ledger's sums; a test walks every place on the demo.
- **S46** Stale counts, broken seals and unconfirmed issues show amber with an icon and words. Their next step matches the fixed list.
- **S47** An issue-only ward shows no balance, and says it is not counted.
- **S48** On the fixture, the trace's holdings by place and by batch both sum to the same total (412 vials).
- **S49** "Who received {batch}" opens the existing recall trace.
- **S50** The stock map loads in under 1.5 s p95 for a hospital of the demo's size.

**STOP 11.**

### Step 12: Harden and pilot
- axe on every new screen.
- The red-reserved and no-green tests.
- Budgets: search p95 under 150 ms; scan to filled line under 300 ms; a 600-row import draft in under 10 s.
- Docs: update *How stocking works*, the pharmacy brief and the handbook.
- ADRs.
- A pilot hospital receives two real deliveries with the scanner it has. Report keystrokes and time against Q8.
- It also issues to one stocked ward and checks one cart for two weeks. Report:
  - pick problems caught;
  - confirmation times;
  - gaps raised on the ward and the reasons chosen.

**STOP 12.** Report the Definition of Done.

---

## 7. Security, privacy, audit
- The catalogue holds no patient data and no prices.
- Pack photos are stored as assets with no patient in view; the upload screen says so.
- Every catalogue change is in `cat_changes`. Every price change, link and import commit is audited with who and when.
- `billableLines` is readable by pharmacy staff and, later, the accounts role and the patient (their own bill only).
- Search terms are not logged.

## 8. GATE A decisions (Fadhul owns; recommendations given)

| # | Decision | Recommendation |
|---|---|---|
| D-CAT-01 | One shared catalogue for all hospitals | Yes: four shared layers, with the hospital's product as the fifth |
| D-CAT-02 | Who curates | A small MedSync catalogue team with `catalogue.curate`. Two people for medicine-level changes; the CSO signs lists (forms, routes, names, abbreviations) |
| D-CAT-03 | Stock beyond the prescribing list | Yes: local products and health supplies can be stocked. Only catalogue medicines linked to the formulary can be prescribed |
| D-CAT-04 | Forms and routes vocabulary | Our own short en-GB list, each mapped to an EDQM code, used under EDQM's terms |
| D-CAT-05 | Preferred name | The WHO INN where one exists; every other name is searchable and shown as "also called" |
| D-CAT-06 | ATC codes | Load only if MedSync obtains the right to use the WHO index; otherwise use the EMHSLU therapeutic class |
| D-CAT-07 | Shared barcodes | Shared after confirmation by the catalogue team; local at once |
| D-CAT-08 | Unregistered or lapsed products | Receivable with a coded reason, listed for the in-charge; never blocks quarantine or recall. Confirm with the legal answers |
| D-CAT-09 | Rescanning a pack | Adds one pack to the open line, and says so |
| D-CAT-10 | Price rule default | None. The hospital sets its own; MedSync ships no markup |
| D-CAT-11 | Pay before collecting (outpatients) | A per-point hospital setting, off by default. Never for emergencies, admitted patients or downtime |
| D-CAT-12 | Phone payment | A separate slice: a licensed payment provider, money to the hospital's account, a provider callback as proof |
| D-CAT-13 | Compare charted doses with counted ward use | Yes. A check only, never a deduction; gaps go to the nurse in charge for a coded reason |
| D-CAT-14 | Ward gap reasons | A signed list: given and not charted, broken or spilt, moved to another ward, returned not recorded, counted wrongly last time, cannot explain, other with text |
| D-CAT-15 | Pick by scan on issues | Required for barcoded packs; ticked by hand, with the reason recorded, where there is no barcode |
| D-CAT-16 | Cart signals from the resus desk | Yes. A broken seal or a resus dose from a cart lists the cart for a check at once; the weekly check stays |
| D-CAT-17 | Receipt confirmation on the phone | Yes, for ward and unit nurses in charge, with their own second factor; desk confirmation stays |

## 9. ADRs (next free numbers)
- The shared medicines catalogue and its layers.
- Strength as printed, with a parse for search only.
- Barcode links: local first, shared after review.
- Local products and health supplies in stock.
- Prices: payers, rules that propose, history, the three kinds of nothing.
- Billable lines as the contract with Accounts.
- Imports as reviewed drafts.
- Picking by scan: verification without moving stock.
- Charted doses as a check on counted ward use.
- Cart seals and resus signals.
- The hospital stock map and the medicine trace.

## 10. Out of scope
- Doses, pharmacokinetics and clinical monographs.
- Taking payment; the phone bill screen; the Accounts dashboard.
- Insurance claims.
- Taxes on medicines (an Accounts decision).
- E-pharmacy.
- Serial-number track and trace, reporting to the NDA. The parser keeps the serial; nothing is reported.
- The mobile (Expo) app. The receipt confirmation is a responsive web page.
- Deducting ward stock from charted doses (D-CAT-13 keeps counts as the truth).
- Automatic reordering or automatic issues. MedSync proposes; people issue.

## 11. Definition of Done
- [ ] Every EMHSLU 2023 medicine is in the catalogue, with forms and routes from the signed list.
- [ ] The NDA edition supplied by the owner is imported, and its counts reconcile.
- [ ] Search finds any name, brand, NDA number or barcode within budget.
- [ ] Scan, pick and type work on deliveries, opening counts, add product, found batches and cart restock.
- [ ] The cross-hospital barcode test passes, conflicts are surfaced, and the two-person rule is enforced.
- [ ] Local products and health supplies are stockable.
- [ ] Prices, rules, history and stock value work. `billableLines` is tested, including free, price not set and snapshot.
- [ ] Imports are drafts until committed.
- [ ] Issues are picked by scan. Receipt is confirmed by the receiver on desk or phone. Overdue confirmations are listed.
- [ ] The ward use check and cart signals work, and write no movement.
- [ ] The stock map and medicine trace equal the ledger's sums.
- [ ] The ledger tests are unchanged and green. axe is clean. Strings are drafts for the CSO. ADRs, docs and the pilot report exist.

---

## Appendix A: new strings (all `draft`)

| Key | Text |
|---|---|
| Scan field | Scan the next pack, or type a name |
| Scan help | A scanner works anywhere on this page. A 2D code fills the batch and expiry too. |
| Plain barcode | Plain barcode: type batch and expiry |
| Source tags | scan · catalogue · last delivery · supplier price list · typed |
| Packs to units | {units} {unit} into stock ({packs} packs × {contents}) |
| Rescan | +1 pack · {n} counted |
| Picker why | Also called {name} |
| Pack missing | The pack that came is not here |
| New barcode title | This barcode is new to MedSync |
| New barcode help | Tell us once which pack it is. Next time anyone at this hospital scans it, the line fills itself. |
| No guessing | MedSync does not guess. The link is used at this hospital straight away. It becomes shared with other hospitals only after the catalogue team checks it against the pack. |
| Not listed title | Type a product that is not in the catalogue |
| Local received | Received now. Sent to the catalogue team to check. |
| No registration | No registration number on the pack |
| Lapsed | Registration lapsed |
| Price not set | Price not set |
| Free | Free |
| Rule proposes | The rule only proposes. A price changes when a person accepts it, from a date, and the old price is kept. |
| Not valued | {n} batches have no recorded cost and are not in this value. |
| Catalogue holds | Facts printed on the pack: names, strength, form, route, pack size, maker, registration, barcode. |
| No doses | Doses and limits come only from the dose references your hospital has signed. |
| Pick scan | Scan each pack as you pick it |
| Pick help | A wrong medicine, a wrong strength, or a batch that does not expire first is caught here, before it leaves the store. |
| Pick wrong product | This is {scanned}. The line asks for {asked}. |
| Pick later batch | {batch} expires {date}; {first} expires first. Swap it, or give a reason. |
| Pick by hand | No barcode on this pack. Ticked by hand. |
| Issue together | Stock leaves the store and arrives at {place} together. |
| Confirm title | Stock has arrived |
| Confirm all | Everything arrived as listed |
| Confirm different | Something is different |
| Confirm button | Confirm with my code |
| Ward compared, match | Matches the charts |
| Ward compared, more | {n} more used than charted |
| Ward compared, gap | {n} not on any chart |
| Ward not charted | Not charted from ward stock |
| Ward gap help | This asks for a reason. It is not an accusation; most are doses given and not charted. |
| Count first | Count the ward first. No top-up is suggested on an old count. |
| Seal broken | Seal {number} was broken at {time}. Check and restock before it is sealed again. |
| Resus doses | The resus desk recorded {n} doses from this cart. |
| Stock map how, every | Every movement recorded |
| Stock map how, counted | Stocked · counted |
| Stock map how, issue-only | Issue-only · not counted |
| Stock map how, cart | Signed list · checked and sealed |
| Trace title | Follow one medicine |

## Appendix B: GS1 elements read from a scan

| AI | Meaning | Length | Use |
|---|---|---|---|
| 01 | GTIN | 14, fixed | Identifies the pack; check digit verified |
| 17 | Expiry date | 6, fixed (YYMMDD; DD 00 means the end of the month) | Fills the expiry |
| 10 | Batch or lot | Up to 20, variable | Fills the batch |
| 21 | Serial number | Up to 20, variable | Kept on the receipt line only |
| 11 | Production date | 6, fixed | Shown if present; not used |

Variable-length elements end at the GS separator (FNC1) or the end of the code. A leading `]d2` (DataMatrix) or `]C1` (GS1-128) symbology identifier is removed. EAN-13 and UPC-A codes are read as GTINs padded to 14 digits.

## Appendix C: example of a medicine as stored

```
substance  Paracetamol (INN) · also: acetaminophen (USAN), APAP (abbreviation), PCM (local abbreviation)
medicine   Paracetamol 500 mg tablet · form: tablet · route: oral · issue unit: tablet
           ingredient: paracetamol, "500 mg" (500 mg per 1 tablet)
           links: EMHSLU 2023 row [n] · prescribing list [id]
product    Demo brand P · Demo Labs (U) Ltd, Uganda · NDA/[reg no.] · registered · source: NDA register [edition], row [n]
pack       Tin of 1,000 · contents 1,000 tablets · GTIN [code] (confirmed, 3 hospitals)
hospital   Test Hospital-1 product → that pack · issue unit tablet · cash UGX [price] from [date]
```

## Appendix D: sources and licences (re-check at Step 0)

| Source | What it gives | Access and terms found on 27 Oct 2026 |
|---|---|---|
| Uganda EMHSLU 2023 | Generic medicines, strengths, forms, level of care, VEN, health supplies | Already loaded in MedSync from the MoH publication |
| NDA National Drug Register of Uganda, Human Medicines | Brands, makers, registration numbers | Published as dated PDF editions on nda.or.ug (June 2024 is the latest found). The site refused automated fetches, so the owner supplies the file. Confirm the columns and terms |
| RxNorm Current Prescribable Content (US NLM) | Other names, brand-to-ingredient links (US market) | Monthly. Provided without licensing restrictions and without a UMLS login |
| EDQM Standard Terms | Codes for dose forms and routes | Reuse requires attribution to the EDQM Standard Terms database, unmodified terms, and the retrieval date |
| WHO ATC/DDD index (WHOCC) | Therapeutic class codes | Free to search online. The full files are ordered through the WHOCC portal by a registered user. User conditions ask that the version be cited. Confirm the right to embed |
| GS1 General Specifications | Barcode element strings | Public standard. No free GTIN-to-product registry exists to load |
| Supplier price lists (NMS, JMS, wholesalers) | Pack prices and codes | Not published openly. NMS ordering is through its CSSP portal. Hospitals upload their own lists |
| National Drug and Health Products Authority Act 2026 | Unique identifiers on drugs for traceability | The format and dates await regulations. The parser keeps serials so this slice does not block it |

Sources:
- [NDA Drug Register](https://www.nda.or.ug/drug-register/) and [National Drug Register of Uganda, Human Medicines, June 2024](https://www.nda.or.ug/wp-content/uploads/2024/06/NATIONAL-DRUG-REGISTER-OF-UGANDA-HUMAN-MEDICINES-JUNE-2024.pdf)
- [RxNorm Current Prescribable Content](https://www.nlm.nih.gov/research/umls/rxnorm/docs/prescribe.html)
- [EDQM-HealthCare Terminology Subsets, terms of reuse](https://evs.nci.nih.gov/ftp1/EDQM-HealthCare/About.html)
- [WHOCC ATC/DDD Index and Guidelines](https://atcddd.fhi.no/atc_ddd_index_and_guidelines) and [WHO ATC user conditions](https://assets.hse.ie/media/documents/WHO_ATC_User_Conditions.pdf)
- [GS1 DataMatrix guideline](https://www.gs1.org/sites/default/files/gs1_datamatrix-final_approved.pdf)
- [NMS resources for health facilities](https://nms.go.ug/resources-guides/)
- [Parliament passes sweeping reforms on medicines](https://fin.parliament.go.ug/news/4323/parliament-passes-sweeping-reforms-medicines)
- [GHSC-PSM GS1 regulation tracker (Rwanda, Nigeria)](https://www.ghsupplychain.org/sites/default/files/2025-01/20250109_GS1%20Regulation%20Tracker.pdf)
